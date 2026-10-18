"""
Pipeline PRV-FCM completo, independiente de la interfaz (consola o aplicación web).

    1. Preprocesamiento: división agrupada y estratificada, codificación y Min-Max.
    2. Selección de lambda y alpha_l2 por validación cruzada (opcional) y
       aprendizaje de los pesos del FCM.
    3. Prescripción con el AG para los registros de prueba que no están en el
       mejor nivel del objetivo.
    4. Evaluación: métricas prescriptivas, validación externa y éxito por segmento.

Las opciones se arman desde un diccionario con ``opciones_desde_dict`` (la
aplicación y la línea de comandos), que parte de los valores por defecto y
aplica las opciones explícitas.

``ejecutar`` avisa al terminar cada etapa (``al_terminar_etapa``) y durante las
tareas largas (``al_progresar``): la consola imprime cada sección y la
aplicación web emite eventos de progreso.
"""
from __future__ import annotations

import dataclasses
import json
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from .configuracion import (
    ConfigAG,
    ConfigFCM,
    ConfigPrescripcion,
    ConfigSeleccion,
    Esquema,
    binarizar,
    con_mutables_dinamicos,
)
from .evaluacion import (
    alcanza_meta,
    discretizar_rendimiento,
    evaluar_prediccion,
    evaluar_prescripciones,
    exito_prescriptivo,
    nivel_siguiente,
    validacion_externa,
)
from .fcm import (
    ACTIVACIONES,
    INFERENCIAS,
    METODOS_PESOS,
    MapaCognitivoDifuso,
    con_dinamicos_neutros,
    entrenar_fcm,
    pesos_equilibrados,
)
from .prescripcion import PrescriptorPRVFCM, ResultadoPrescripcion
from .preprocesamiento import Preprocesador, como_texto, dividir_entrenamiento_prueba, grupos_por_perfil, smote
from .seleccion import configuracion_de, validacion_cruzada_fcm


@dataclass(frozen=True)
class Segmento:
    """Separa a los estudiantes prescritos en dos grupos según el valor de una columna."""

    columna: str
    valor: str
    nombre_si: str
    nombre_no: str

    def mascaras(self, estudiantes: pd.DataFrame) -> dict[str, np.ndarray]:
        if self.columna not in estudiantes.columns:
            return {}
        es = como_texto(estudiantes[self.columna]).eq(self.valor).to_numpy()
        return {self.nombre_si: es, self.nombre_no: ~es}


# El ausentismo es el predictor más fuerte de un rendimiento bajo en xAPI y el
# FCM no lo modifica: separar el éxito muestra si una prescripción promete H
# donde los datos casi no lo registran.
SEGMENTO_AUSENTISMO = Segmento("StudentAbsenceDays", "Above-7", "ausencias > 7", "ausencias <= 7")


@dataclass(frozen=True)
class OpcionesPipeline:
    """Opciones de una ejecución completa."""

    proporcion_prueba: float = 0.3
    semilla: int = 42
    division: str = "agrupada"          # "agrupada" por perfil inmutable o "aleatoria".
    validacion_cruzada: bool = True     # False: usa config_fcm tal cual.
    config_fcm: ConfigFCM = ConfigFCM()
    config_seleccion: ConfigSeleccion = ConfigSeleccion()
    config_ag: ConfigAG = ConfigAG()
    # El estado deseado, los niveles a prescribir y la tolerancia se toman del esquema.
    config_prescripcion: ConfigPrescripcion = ConfigPrescripcion()
    segmento: Segmento | None = None
    # Máscara de dirección causal: aristas (columna origen, columna destino) que se eliminan.
    aristas_excluidas: tuple[tuple[str, str], ...] = ()
    mutables_dinamicos: bool = False                 # Todos los mutables se actualizan en la inferencia.
    binarizar_objetivo: str | float | None = None    # Nivel mínimo de éxito (ordinal) o umbral (numérico).
    smote: bool = False                              # SMOTE sobre el entrenamiento (nunca sobre la prueba).


# La división agrupada reparte perfiles inmutables en 20 partes: con menos de 40 perfiles
# (por ejemplo, solo el género como inmutable) no es posible y se divide al azar.
MIN_PERFILES_DIVISION_AGRUPADA = 40


@dataclass
class ResultadoPipeline:
    """Todo lo que produce una ejecución; se completa etapa por etapa."""

    esquema: Esquema
    opciones: OpcionesPipeline
    nombre_datos: str
    datos: pd.DataFrame
    grupos: pd.Series
    entrenamiento: pd.DataFrame
    prueba: pd.DataFrame
    perfiles_compartidos: int
    pre: Preprocesador
    X_ent: np.ndarray
    X_pru: np.ndarray
    division: str = "agrupada"  # La aplicada: puede ser "aleatoria" aunque se pidiera "agrupada".
    n_sinteticos: int = 0       # Registros que SMOTE agregó al entrenamiento.
    config_ag: ConfigAG | None = None
    seleccion_cv: pd.DataFrame | None = None
    config_fcm: ConfigFCM | None = None
    fcm: MapaCognitivoDifuso | None = None
    medias_dinamicos: np.ndarray | None = None
    prediccion: dict | None = None
    config_prescripcion: ConfigPrescripcion | None = None
    prescriptor: PrescriptorPRVFCM | None = None
    seleccion: np.ndarray | None = None  # Registros de prueba que reciben prescripción.
    metas: np.ndarray | None = None  # Nivel meta de cada uno (el siguiente al suyo o el mejor).
    resultados: list[ResultadoPrescripcion] = field(default_factory=list)
    metricas: dict | None = None
    externa: dict | None = None
    exito: np.ndarray | None = None
    exito_por_segmento: dict = field(default_factory=dict)
    recomendaciones: pd.DataFrame | None = None

    # ------------------------------------------------------------------
    # Salidas
    # ------------------------------------------------------------------
    def reporte(self) -> dict:
        """Configuración y métricas (contenido de ``metricas.json``)."""
        o = self.opciones
        confusion = self.prediccion["matriz_confusion"]
        return {
            "configuracion": {
                "datos": self.nombre_datos,
                "n_registros": len(self.datos),
                "division": self.division,
                "proporcion_prueba": o.proporcion_prueba,
                "n_entrenamiento": len(self.entrenamiento),
                "n_prueba": len(self.prueba),
                "perfiles_compartidos": int(self.perfiles_compartidos),
                "semilla": o.semilla,
                "fcm": dataclasses.asdict(self.config_fcm),
                "seleccion": dataclasses.asdict(o.config_seleccion) if o.validacion_cruzada else None,
                "ag": dataclasses.asdict(self.config_ag),
                "prescripcion": dataclasses.asdict(self.config_prescripcion),
                "mutables_dinamicos": [self.pre.columnas[i] for i in self.pre.indices_dinamicos],
                "aristas_excluidas": [list(a) for a in o.aristas_excluidas],
                "binarizar_objetivo": o.binarizar_objetivo,
                "smote": o.smote,
                "n_sinteticos": self.n_sinteticos,
                "sujeto": {"singular": self.esquema.sujeto.singular, "plural": self.esquema.sujeto.plural,
                           "femenino": self.esquema.sujeto.femenino},
            },
            "seleccion_hiperparametros": None if self.seleccion_cv is None else self.seleccion_cv.to_dict(orient="records"),
            "prediccion_fcm": {
                **{k: v for k, v in self.prediccion.items() if k != "matriz_confusion"},
                "matriz_confusion": {
                    str(real): {str(predicho): int(n) for predicho, n in fila.items()}
                    for real, fila in confusion.iterrows()
                },
            },
            "prescripcion": self.metricas,
            "exito_por_segmento": self.exito_por_segmento,
            "validacion_externa": self.externa,
        }

    def guardar_resultados(self, salida: Path) -> None:
        """Escribe recomendaciones, pesos, selección de hiperparámetros y métricas."""
        salida.mkdir(parents=True, exist_ok=True)
        self.recomendaciones.to_csv(salida / "recomendaciones.csv", index=False)
        self.fcm.matriz_pesos().to_csv(salida / "pesos_fcm.csv", float_format="%.4f")
        if self.seleccion_cv is not None:
            self.seleccion_cv.to_csv(salida / "seleccion_hiperparametros.csv", index=False, float_format="%.6g")
        (salida / "metricas.json").write_text(json.dumps(self.reporte(), indent=2, ensure_ascii=False), encoding="utf-8")

    def datos_graficas(self) -> dict:
        """Series que la aplicación web necesita para sus gráficas."""
        objetivo = self.pre.indice_objetivo
        historiales = [r.historial_costo for r in self.resultados]
        largo = max(len(h) for h in historiales)
        # Las corridas detenidas antes conservan su último valor.
        matriz = np.array([np.pad(h, (0, largo - len(h)), mode="edge") for h in historiales])
        q1, mediana, q3 = np.percentile(matriz, [25, 50, 75], axis=0)
        medios = np.array([np.pad(r.historial_promedio, (0, largo - len(r.historial_promedio)), mode="edge") for r in self.resultados])
        # Aptitud normalizada por registro: 0 = costo medio de su población inicial, 1 = su mejor costo final.
        # Con la mediana del costo crudo la curva se ve plana: cada registro tiene otra escala.
        inicio, final = medios[:, :1], matriz[:, -1:]
        rango = (inicio - final)[:, 0]
        validos = rango > 1e-9
        progreso_mejor = np.median((inicio - matriz)[validos] / rango[validos, None], axis=0) if validos.any() else np.zeros(largo)
        progreso_medio = np.median((inicio - medios)[validos] / rango[validos, None], axis=0) if validos.any() else np.zeros(largo)
        base = np.array([r.estado_base[objetivo] for r in self.resultados])
        prescrito = np.array([r.estado_prescrito[objetivo] for r in self.resultados])
        orden = np.argsort(base, kind="stable")
        ids = self.prueba.index[self.seleccion].to_numpy()
        metas = self.metas if self.metas is not None else np.full(len(base), self.esquema.mejor_nivel)
        tolerancia = self.config_prescripcion.tolerancia_exito
        acciones = []
        for k, i in enumerate(self.pre.indices_accion):
            columna = self.pre.columnas[i]
            actuales = self.pre.desnormalizar(np.array([r.acciones_actuales[k] for r in self.resultados]), columna)
            recomendadas = self.pre.desnormalizar(np.array([r.acciones_recomendadas[k] for r in self.resultados]), columna)
            concepto = self.pre.conceptos[i]
            acciones.append(
                {
                    "id": concepto.id,
                    "columna": columna,
                    "nombre": concepto.nombre,
                    "actual_media": float(actuales.mean()),
                    "recomendada_media": float(recomendadas.mean()),
                    "min": float(self.pre.minimos[columna]),
                    "max": float(self.pre.maximos[columna]),
                }
            )
        return {
            "convergencia": {
                "generacion": list(range(largo)),  # 0 = población inicial.
                "q1": q1.tolist(),
                "mediana": mediana.tolist(),
                "q3": q3.tolist(),
                "medio": np.median(medios, axis=0).tolist(),  # Costo medio de la población (mediana entre registros).
                "progreso": {"mejor": progreso_mejor.tolist(), "medio": progreso_medio.tolist()},
            },
            # meta: nivel al que apunta cada registro; umbral_meta: activación desde la que lo alcanza.
            "antes_despues": [
                {
                    "id": int(ids[j]), "base": float(base[j]), "prescrito": float(prescrito[j]), "meta": str(metas[j]),
                    "umbral_meta": float(self.esquema.niveles[str(metas[j])] - tolerancia),
                }
                for j in orden
            ],
            "acciones": acciones,
            "umbral_mejor": 1.0 - self.config_prescripcion.tolerancia_exito,
        }


def tabla_recomendaciones(
    resultados: list[ResultadoPrescripcion],
    estudiantes: pd.DataFrame,
    pre: Preprocesador,
    exito: np.ndarray,
    etiquetas: np.ndarray,
    metas: np.ndarray | None = None,
) -> pd.DataFrame:
    """Recomendaciones por estudiante en unidades originales del dataset.

    ``id_estudiante`` es la fila del estudiante en el CSV (0 = primera fila de datos).
    """
    esquema = pre.esquema
    objetivo = pre.indice_objetivo
    numerico = esquema.objetivo not in esquema.codificacion_ordinal
    filas = []
    metas = [esquema.mejor_nivel] * len(resultados) if metas is None else metas
    for (id_estudiante, fila), r, ok, etiqueta, meta in zip(estudiantes.iterrows(), resultados, exito, etiquetas, metas):
        registro = {"id_estudiante": id_estudiante, "clase_observada": etiqueta}
        if numerico:
            registro[f"{esquema.objetivo}_observado"] = fila[esquema.objetivo]
        for k, i in enumerate(pre.indices_accion):
            columna = pre.columnas[i]
            actual = float(pre.desnormalizar(r.acciones_actuales[k], columna))
            recomendada = float(pre.desnormalizar(r.acciones_recomendadas[k], columna))
            registro[f"{columna}_actual"] = round(actual, 1)
            registro[f"{columna}_recomendado"] = round(recomendada, 1)
            registro[f"{columna}_cambio"] = round(recomendada - actual, 1)
        for i in pre.indices_dinamicos:
            columna = pre.columnas[i]
            registro[f"{columna}_fcm_base"] = round(float(r.estado_base[i]), 4)
            registro[f"{columna}_fcm_prescrito"] = round(float(r.estado_prescrito[i]), 4)
        registro["nivel_base"] = discretizar_rendimiento(r.estado_base[objetivo], esquema.niveles).item()
        registro["nivel_prescrito"] = discretizar_rendimiento(r.estado_prescrito[objetivo], esquema.niveles).item()
        registro["nivel_meta"] = str(meta)
        registro["exito"] = bool(ok)
        filas.append(registro)
    return pd.DataFrame(filas)


def indice_condicion(pre: Preprocesador, config: ConfigPrescripcion) -> int | None:
    """Índice del concepto del tope condicionado; None si no hay columna o el esquema no la tiene."""
    columna = config.condicion_columna
    return pre.indice(columna) if columna in pre.columnas else None


def matriz_excluidas(pre: Preprocesador, aristas: tuple[tuple[str, str], ...]) -> np.ndarray | None:
    """Máscara booleana (n, n) con True en cada arista excluida; None si no se excluye ninguna."""
    if not aristas:
        return None
    excluidas = np.zeros((len(pre.columnas), len(pre.columnas)), dtype=bool)
    for origen, destino in aristas:
        desconocidas = [c for c in (origen, destino) if c not in pre.columnas]
        if desconocidas:
            raise ValueError(f"La máscara causal usa columnas que no son conceptos: {', '.join(desconocidas)}.")
        excluidas[pre.indice(origen), pre.indice(destino)] = True
    return excluidas


def ejecutar(
    datos: pd.DataFrame,
    esquema: Esquema,
    opciones: OpcionesPipeline = OpcionesPipeline(),
    al_terminar_etapa: Callable[[str, ResultadoPipeline], None] | None = None,
    al_progresar: Callable[[str, int, int], None] | None = None,
    nombre_datos: str = "",
) -> ResultadoPipeline:
    """Ejecuta las cuatro etapas y devuelve todos los resultados.

    Etapas avisadas: "preprocesamiento", "seleccion" (solo con validación
    cruzada), "fcm", "prescripcion" (antes de prescribir) y "evaluacion".
    Tareas con progreso: "validacion_cruzada" y "prescripcion".
    """

    def avisar(etapa: str, resultado: ResultadoPipeline) -> None:
        if al_terminar_etapa is not None:
            al_terminar_etapa(etapa, resultado)

    def progreso(tarea: str) -> Callable[[int, int], None] | None:
        if al_progresar is None:
            return None
        return lambda hechos, total: al_progresar(tarea, hechos, total)

    # 0. Esquema según las opciones ---------------------------------------
    if opciones.binarizar_objetivo is not None:
        esquema = binarizar(esquema, opciones.binarizar_objetivo)
    if opciones.mutables_dinamicos:
        esquema = con_mutables_dinamicos(esquema)

    # 1. Preprocesamiento --------------------------------------------------
    grupos = pd.Series(grupos_por_perfil(datos, esquema), index=datos.index)
    agrupada = opciones.division == "agrupada" and grupos.nunique() >= MIN_PERFILES_DIVISION_AGRUPADA
    entrenamiento, prueba = dividir_entrenamiento_prueba(
        datos, opciones.proporcion_prueba, opciones.semilla, grupos.to_numpy() if agrupada else None, esquema
    )
    compartidos = np.intersect1d(grupos.loc[entrenamiento.index].to_numpy(), grupos.loc[prueba.index].to_numpy()).size
    pre = Preprocesador(esquema).ajustar(entrenamiento)
    r = ResultadoPipeline(
        esquema=esquema,
        opciones=opciones,
        nombre_datos=nombre_datos,
        datos=datos,
        grupos=grupos,
        entrenamiento=entrenamiento,
        prueba=prueba,
        perfiles_compartidos=int(compartidos),
        pre=pre,
        X_ent=pre.transformar(entrenamiento),
        X_pru=pre.transformar(prueba),
        division="agrupada" if agrupada else "aleatoria",
    )
    X_fcm, etiquetas_fcm = r.X_ent, pre.etiquetas(entrenamiento)
    if opciones.smote:
        X_fcm, etiquetas_fcm = smote(r.X_ent, etiquetas_fcm, semilla=opciones.semilla)
        r.n_sinteticos = len(X_fcm) - len(r.X_ent)
    avisar("preprocesamiento", r)

    # 2. Selección de hiperparámetros y aprendizaje del FCM -----------------
    config_fcm = opciones.config_fcm
    excluidas = matriz_excluidas(pre, opciones.aristas_excluidas)
    dinamicos, objetivo = pre.indices_dinamicos, pre.indice_objetivo
    if opciones.validacion_cruzada:
        # Con la división aleatoria cada registro es su propio grupo: pliegues estratificados sin agrupar.
        grupos_cv = grupos.loc[entrenamiento.index].to_numpy() if agrupada else np.arange(len(entrenamiento))
        r.seleccion_cv = validacion_cruzada_fcm(
            entrenamiento, grupos_cv, esquema, config_fcm, opciones.config_seleccion, opciones.semilla,
            progreso("validacion_cruzada"), excluidas, opciones.smote,
        )
        config_fcm = configuracion_de(config_fcm, r.seleccion_cv.iloc[0].to_dict())
        r.config_fcm = config_fcm
        avisar("seleccion", r)
    r.config_fcm = config_fcm

    nombres = [c.id for c in esquema.conceptos]
    pesos_muestras = pesos_equilibrados(etiquetas_fcm) if config_fcm.balancear_niveles else None
    r.fcm, r.medias_dinamicos = entrenar_fcm(
        X_fcm, pre.indices_fijos, dinamicos, objetivo, config_fcm, nombres, excluidas, pesos_muestras, opciones.semilla,
    )
    r.prediccion = evaluar_prediccion(
        r.fcm, con_dinamicos_neutros(r.X_pru, dinamicos, r.medias_dinamicos), r.X_pru, dinamicos, objetivo, nombres,
        esquema.niveles,
    )
    avisar("fcm", r)

    # 3. Prescripción -------------------------------------------------------
    config_presc = replace(
        opciones.config_prescripcion,
        estado_deseado={esquema.objetivo: 1.0},
        clases_a_prescribir=esquema.niveles_a_prescribir,
        tolerancia_exito=esquema.tolerancia_exito,
    )
    r.config_prescripcion = config_presc
    etiquetas_prueba = pre.etiquetas(prueba)
    r.seleccion = np.isin(etiquetas_prueba, config_presc.clases_a_prescribir)
    if not r.seleccion.any():
        raise ValueError("Ningún registro de prueba está por debajo del mejor nivel: no hay a quién prescribir.")
    estado_deseado = {pre.indice(c): v for c, v in config_presc.estado_deseado.items()}
    pesos_objetivo = {pre.indice(c): v for c, v in config_presc.pesos_objetivo.items()}
    r.config_ag = opciones.config_ag
    r.prescriptor = PrescriptorPRVFCM(
        r.fcm, pre.indices_accion, estado_deseado, pesos_objetivo, r.config_ag, config_presc,
        indice_condicion(pre, config_presc), pre.rejillas_accion(), pre.indice_objetivo,
    )
    # Meta escalonada: cada registro apunta al nivel siguiente al observado (L -> M, M -> H).
    escalonada = config_presc.meta_escalonada and len(esquema.niveles) > 2
    r.metas = np.array(
        [nivel_siguiente(e, esquema.niveles) if escalonada else esquema.mejor_nivel for e in etiquetas_prueba[r.seleccion]]
    )
    deseados = np.array([[esquema.niveles[m]] for m in r.metas]) if escalonada else None
    avisar("prescripcion", r)
    r.resultados = r.prescriptor.prescribir_lote(
        r.X_pru[r.seleccion], semilla=opciones.semilla, mostrar_progreso=False, al_avanzar=progreso("prescripcion"),
        deseados=deseados,
    )

    # 4. Evaluación ---------------------------------------------------------
    r.metricas = evaluar_prescripciones(
        r.resultados, r.prescriptor.indices_objetivo,
        r.prescriptor.valores_deseados if deseados is None else deseados, config_presc.tolerancia_exito,
    )
    estudiantes = prueba[r.seleccion]
    segmentos = opciones.segmento.mascaras(estudiantes) if opciones.segmento else {}
    columnas_x = [i for i in range(len(esquema.conceptos)) if i != objetivo]
    X_base = r.X_pru[r.seleccion]
    X_prescrito = X_base.copy()
    X_prescrito[:, pre.indices_accion] = np.array([res.acciones_recomendadas for res in r.resultados])
    r.externa = validacion_externa(
        r.X_ent[:, columnas_x],
        pre.etiquetas(entrenamiento),
        r.X_pru[:, columnas_x],
        etiquetas_prueba,
        X_base[:, columnas_x],
        X_prescrito[:, columnas_x],
        semilla=opciones.semilla,
        segmentos=segmentos,
        etiqueta_mejor=esquema.mejor_nivel,
        metas=r.metas if escalonada else None,
        niveles=esquema.niveles,
    )
    valores_deseados = r.prescriptor.valores_deseados
    indices_objetivo = r.prescriptor.indices_objetivo
    if escalonada:
        # Llegar a la meta propia o a un nivel mejor: con |A - D| un L que llega a H contaría como fracaso.
        r.exito = alcanza_meta([res.estado_prescrito[objetivo] for res in r.resultados], r.metas, esquema.niveles)
        exito_base = alcanza_meta([res.estado_base[objetivo] for res in r.resultados], r.metas, esquema.niveles)
        r.metricas["PSR"], r.metricas["PSR_base"] = float(100.0 * r.exito.mean()), float(100.0 * exito_base.mean())
    else:
        r.exito = exito_prescriptivo(
            np.array([res.estado_prescrito[indices_objetivo] for res in r.resultados]), valores_deseados,
            config_presc.tolerancia_exito,
        )
        exito_base = exito_prescriptivo(
            np.array([res.estado_base[indices_objetivo] for res in r.resultados]), valores_deseados,
            config_presc.tolerancia_exito,
        )
    r.metricas["metas"] = {str(m): int(n) for m, n in zip(*np.unique(r.metas, return_counts=True))}
    r.exito_por_segmento = {
        nombre: {
            "n": int(mascara.sum()),
            "PSR_base": float(100.0 * exito_base[mascara].mean()),
            "PSR": float(100.0 * r.exito[mascara].mean()),
        }
        for nombre, mascara in segmentos.items()
        if mascara.any()
    }
    r.recomendaciones = tabla_recomendaciones(r.resultados, estudiantes, pre, r.exito, etiquetas_prueba[r.seleccion], r.metas)
    avisar("evaluacion", r)
    return r


# ---------------------------------------------------------------------------
# Opciones desde un diccionario (aplicación y línea de comandos)
# ---------------------------------------------------------------------------
def valores_por_defecto() -> dict:
    """Las opciones de entrenamiento con los valores por defecto de las dataclasses."""
    fcm, sel, presc, o = ConfigFCM(), ConfigSeleccion(), ConfigPrescripcion(), OpcionesPipeline()
    return {
        "proporcion_prueba": o.proporcion_prueba,
        "semilla": o.semilla,
        "division": o.division,
        "validacion_cruzada": o.validacion_cruzada,
        "metodo_pesos": fcm.metodo_pesos,
        "inferencia": fcm.inferencia,
        "activacion": fcm.activacion,
        "sesgo": fcm.sesgo,
        "balancear_niveles": fcm.balancear_niveles,
        "lambda": fcm.lambda_,
        "alpha_l2": fcm.alpha_l2,
        "tolerancia": fcm.tolerancia,
        "pso": {
            "particulas": fcm.pso_particulas, "iteraciones": fcm.pso_iteraciones, "inercia": fcm.pso_inercia,
            "c1": fcm.pso_c1, "c2": fcm.pso_c2, "vmax": fcm.pso_vmax, "paciencia": fcm.pso_paciencia,
        },
        "pliegues": sel.pliegues,
        "pso_iteraciones_cv": sel.pso_iteraciones,
        "rejilla_lambda": list(sel.rejilla_lambda),
        "rejilla_alpha": list(sel.rejilla_alpha),
        "mutables_dinamicos": o.mutables_dinamicos,
        "smote": o.smote,
        "binarizar_objetivo": o.binarizar_objetivo,
        "beta": presc.beta_esfuerzo,
        "delta_max": presc.delta_max,
        "permitir_reducciones": not presc.solo_incrementos,
        "condicion_delta_max": presc.condicion_delta_max,
        "meta_escalonada": presc.meta_escalonada,
        "ag": dataclasses.asdict(ConfigAG()),
        "aristas_excluidas": [],
    }


def opciones_desde_dict(datos: dict, segmento: Segmento | None = None) -> OpcionesPipeline:
    """Opciones (JSON de la aplicación o argumentos de main.py) -> ``OpcionesPipeline``, con límites razonables.

    Parte de ``valores_por_defecto`` y aplica las claves presentes en ``datos``
    (también un None explícito: por ejemplo, ``condicion_delta_max: None`` quita
    el tope). Las claves desconocidas (como el antiguo ``perfil``) se ignoran.
    """
    valores = valores_por_defecto()
    for clave, valor in datos.items():
        if clave in ("ag", "pso") and isinstance(valor, dict):
            valores[clave] = {**valores[clave], **valor}
        elif clave in valores:
            valores[clave] = valor
    v = valores
    proporcion = float(v["proporcion_prueba"])
    if not 0.1 <= proporcion <= 0.5:
        raise ValueError("La proporción de prueba debe estar entre 0.1 y 0.5.")
    if v["division"] not in ("agrupada", "aleatoria"):
        raise ValueError("La división debe ser 'agrupada' o 'aleatoria'.")
    if not 2 <= int(v["pliegues"]) <= 10:
        raise ValueError("Los pliegues de la validación cruzada deben estar entre 2 y 10.")
    if v["metodo_pesos"] not in METODOS_PESOS:
        raise ValueError(f"El método de pesos debe ser uno de {', '.join(METODOS_PESOS)}.")
    for clave, validos in (("inferencia", INFERENCIAS), ("activacion", ACTIVACIONES)):
        if v[clave] not in validos:
            raise ValueError(f"{clave} debe ser una de {', '.join(validos)}.")
    excluidas = v["aristas_excluidas"] or []
    if not all(isinstance(a, (list, tuple)) and len(a) == 2 for a in excluidas):
        raise ValueError("La máscara causal debe ser una lista de pares [origen, destino].")
    pso = v["pso"]
    permitidos = {f.name for f in dataclasses.fields(ConfigAG)}
    delta_max, tope = v["delta_max"], v["condicion_delta_max"]
    return OpcionesPipeline(
        proporcion_prueba=proporcion,
        semilla=int(v["semilla"]),
        division=v["division"],
        validacion_cruzada=bool(v["validacion_cruzada"]),
        config_fcm=ConfigFCM(
            lambda_=float(v["lambda"]),
            alpha_l2=float(v["alpha_l2"]),
            tolerancia=float(v["tolerancia"]),
            metodo_pesos=v["metodo_pesos"],
            balancear_niveles=bool(v["balancear_niveles"]),
            sesgo=bool(v["sesgo"]),
            inferencia=v["inferencia"],
            activacion=v["activacion"],
            pso_particulas=int(pso["particulas"]),
            pso_iteraciones=int(pso["iteraciones"]),
            pso_inercia=float(pso["inercia"]),
            pso_c1=float(pso["c1"]),
            pso_c2=float(pso["c2"]),
            pso_vmax=float(pso["vmax"]),
            pso_paciencia=int(pso["paciencia"]),
        ),
        config_seleccion=ConfigSeleccion(
            pliegues=int(v["pliegues"]),
            rejilla_lambda=tuple(float(x) for x in v["rejilla_lambda"]),
            rejilla_alpha=tuple(float(x) for x in v["rejilla_alpha"]),
            pso_iteraciones=int(v["pso_iteraciones_cv"]) if v["pso_iteraciones_cv"] else None,
        ),
        config_ag=replace(ConfigAG(), **{k: x for k, x in (v["ag"] or {}).items() if k in permitidos}),
        config_prescripcion=ConfigPrescripcion(
            beta_esfuerzo=float(v["beta"]),
            solo_incrementos=not bool(v["permitir_reducciones"]),
            delta_max=float(delta_max) if delta_max else None,
            condicion_columna=None if tope is None else ConfigPrescripcion.condicion_columna,
            condicion_delta_max=ConfigPrescripcion.condicion_delta_max if tope is None else float(tope),
            meta_escalonada=bool(v["meta_escalonada"]),
        ),
        segmento=segmento,
        aristas_excluidas=tuple((str(o), str(d)) for o, d in excluidas),
        mutables_dinamicos=bool(v["mutables_dinamicos"]),
        binarizar_objetivo=v["binarizar_objetivo"],
        smote=bool(v["smote"]),
    )
