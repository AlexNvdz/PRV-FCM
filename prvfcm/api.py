"""
API de Python del motor PRV-FCM: ``PredictorFCM`` y ``PrescriptorAG``.

Las dos clases envuelven un :class:`~prvfcm.modelo.ModeloPRVFCM` ya entrenado y no
dependen de ninguna interfaz: no imprimen, no conocen Express, React ni el
protocolo del worker. Reciben datos en unidades originales y devuelven
diccionarios listos para JSON (``prvfcm.servicio.limpiar`` solo convierte los NaN).
La aplicación web las usa a través de ``prvfcm.servicio``; un backend como FastAPI
o Flask puede usarlas directamente:

    from prvfcm.api import PredictorFCM, PrescriptorAG

    predictor = PredictorFCM.desde_archivo("modelo.json")
    prescriptor = PrescriptorAG(predictor.modelo)

    @app.post("/predecir")
    def predecir(cuerpo: dict) -> dict:
        return predictor.predecir(cuerpo["perfil"], cuerpo.get("acciones"))

    @app.post("/prescribir")
    def prescribir(cuerpo: dict) -> dict:
        return prescriptor.prescribir(cuerpo["perfil"], nivel_meta=cuerpo.get("meta"))

La entrada de ambas es un registro del dataset (``pd.DataFrame`` de una fila: los
conceptos dinámicos parten de su valor observado) o un perfil (``dict`` columna ->
valor: los dinámicos parten de su media de entrenamiento).

Matemática de la inferencia (regla de Kosko modificada, ver :mod:`prvfcm.fcm`):

    A_i(t+1) = f( k2·A_i(t) + k1·Σ_j w_ji·A_j(t) ),   f(x) = 1 / (1 + e^(−λ·x))

* A_i(t) ∈ [0, 1] es la activación del concepto i en la iteración t.
* w_ji ∈ [−1, 1] es la influencia causal de j sobre i: un peso positivo empuja a i
  hacia 1 cuando j está activo; uno negativo, hacia 0.
* k2·A_i(t) es la memoria (lo que i conserva de su estado anterior) y
  k1·Σ_j w_ji·A_j(t), la influencia de los demás conceptos.
* Solo los conceptos dinámicos (el objetivo y los mutables marcados como
  dinámicos) se actualizan; los inmutables, las acciones y los demás mutables
  quedan fijos en su valor. Cambiar una acción cambia la influencia que recibe el
  objetivo en cada iteración, y la regla se repite hasta un punto fijo, cuando
  max |A(t+1) − A(t)| < tolerancia.
"""
from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd

from .esquema import rol_de
from .fcm import ResultadoInferencia
from .modelo import ModeloPRVFCM
from .prescripcion import PrescriptorPRVFCM
from .reporte import reporte_individual

Entrada = pd.DataFrame | Mapping[str, object]


class PredictorFCM:
    """Inferencia del FCM: estado final, trayectoria iteración por iteración y escenarios «qué pasaría si»."""

    def __init__(self, modelo: ModeloPRVFCM):
        self.modelo = modelo

    @classmethod
    def desde_archivo(cls, ruta: str | Path) -> "PredictorFCM":
        return cls(ModeloPRVFCM.cargar(ruta))

    # ------------------------------------------------------------------
    # Estados iniciales
    # ------------------------------------------------------------------
    def estado_inicial(self, entrada: Entrada) -> np.ndarray:
        """A(0) normalizado de un registro del dataset o de un perfil escrito a mano."""
        if isinstance(entrada, pd.DataFrame):
            return self.modelo.estado(entrada)
        return self.modelo.estado_de_perfil(dict(entrada))

    def con_acciones(self, estado: np.ndarray, acciones: Mapping[str, object] | None) -> np.ndarray:
        """Copia de ``estado`` con algunas acciones cambiadas (unidades originales o categorías)."""
        pre = self.modelo.pre
        nuevo = np.array(estado, dtype=float)
        columnas_accion = {pre.columnas[i] for i in pre.indices_accion}
        for columna, valor in (acciones or {}).items():
            if columna not in columnas_accion:
                raise ValueError(f"{columna} no es una acción del modelo.")
            nuevo[pre.indice(columna)] = self.modelo.valor_normalizado(columna, valor)
        return nuevo

    # ------------------------------------------------------------------
    # Inferencia
    # ------------------------------------------------------------------
    def predecir(self, entrada: Entrada, acciones: Mapping[str, object] | None = None, meta: float = 1.0) -> dict:
        """Nivel que el FCM infiere para la entrada (con ``acciones`` cambiadas, si se dan) y su trayectoria."""
        return self.inferir(self.con_acciones(self.estado_inicial(entrada), acciones), meta)

    def inferir(self, estado: np.ndarray, meta: float = 1.0) -> dict:
        """Estado final de la inferencia desde ``estado`` y cómo se llegó a él (``inferencia``)."""
        resultado = self.modelo.fcm.inferir(estado, guardar_trayectoria=True)
        return {**self.modelo.describir_final(resultado.estados, meta), "inferencia": self.paso_a_paso(resultado)}

    def simular(self, entrada: Entrada, acciones: Mapping[str, object]) -> dict:
        """Escenario «qué pasaría si»: la misma entrada con sus acciones actuales y con ``acciones``."""
        pre = self.modelo.pre
        base = self.estado_inicial(entrada)
        nuevo = self.con_acciones(base, acciones)
        return {
            "acciones": [
                {
                    "columna": pre.columnas[i],
                    "actual": self.modelo.valor_original(pre.columnas[i], base[i]),
                    "simulada": self.modelo.valor_original(pre.columnas[i], nuevo[i]),
                }
                for i in pre.indices_accion
            ],
            "base": self.inferir(base),
            "simulado": self.inferir(nuevo),
        }

    def paso_a_paso(self, resultado: ResultadoInferencia) -> dict:
        """Trayectoria de la inferencia y la cuenta de la regla para el objetivo en cada iteración.

        * ``series``: activación de cada concepto dinámico en t = 0, 1, ..., T
          (el objetivo primero). Los conceptos fijos no se incluyen: su línea
          sería plana.
        * ``pasos``: para t = 1..T, los dos sumandos que recibe el objetivo,
          calculados con el estado anterior A(t−1):
          memoria = k2·A_o(t−1), influencia = k1·Σ_j w_jo·A_j(t−1) (de ella,
          ``influencia_acciones`` es la parte que aportan las acciones),
          entrada = memoria + influencia y activacion = f(entrada) = A_o(t).
        """
        m = self.modelo
        fcm, pre = m.fcm, m.pre
        objetivo = pre.indice_objetivo
        # La trayectoria guarda A(0), A(1), ..., A(T), cada uno como matriz de una fila.
        A = np.array([estado[0] for estado in resultado.trayectoria])
        memoria, influencia = fcm.terminos(A[:-1])
        _, de_acciones = fcm.terminos(A[:-1], pre.indices_accion)
        dinamicos = [objetivo] + [i for i in pre.indices_dinamicos if i != objetivo]
        cfg = fcm.config
        return {
            "iteraciones": resultado.iteraciones,
            "convergio": resultado.convergio,
            "parametros": {"lambda": cfg.lambda_, "k1": cfg.coef_influencia, "k2": cfg.coef_memoria, "tolerancia": cfg.tolerancia},
            "series": [
                {
                    "id": m.esquema.conceptos[i].id,
                    "columna": pre.columnas[i],
                    "nombre": m.esquema.conceptos[i].nombre,
                    "rol": rol_de(m.esquema, m.esquema.conceptos[i]),
                    "valores": A[:, i].tolist(),
                }
                for i in dinamicos
            ],
            "pasos": [
                {
                    "t": t + 1,
                    "memoria": float(memoria[t, objetivo]),
                    "influencia": float(influencia[t, objetivo]),
                    "influencia_acciones": float(de_acciones[t, objetivo]),
                    "entrada": float(memoria[t, objetivo] + influencia[t, objetivo]),
                    "activacion": float(A[t + 1, objetivo]),
                }
                for t in range(len(A) - 1)
            ],
        }


class PrescriptorAG:
    """Prescripción con el algoritmo genético: qué valores de las acciones acercan el objetivo a la meta.

    El AG minimiza, para una entrada concreta,

        costo(a) = |A*_objetivo(a) − meta| + β · media_k |a_k − a_k^actual|

    donde A*(a) es el estado final del FCM con las acciones sustituidas por el
    cromosoma a (ver :mod:`prvfcm.prescripcion`). Las acciones actuales se
    siembran en la población inicial, así que la prescripción nunca es peor
    que no actuar.
    """

    def __init__(self, modelo: ModeloPRVFCM):
        self.modelo = modelo
        self.predictor = PredictorFCM(modelo)

    @classmethod
    def desde_archivo(cls, ruta: str | Path) -> "PrescriptorAG":
        return cls(ModeloPRVFCM.cargar(ruta))

    def motor(
        self,
        nivel_meta: str | None = None,
        beta: float | None = None,
        delta_max: float | None = None,
        permitir_reducciones: bool | None = None,
    ) -> tuple[PrescriptorPRVFCM, dict]:
        """``PrescriptorPRVFCM`` (escala normalizada) con la configuración del modelo y los cambios pedidos, y la meta."""
        m = self.modelo
        meta = m.meta(nivel_meta)
        cambios = {"estado_deseado": {m.esquema.objetivo: meta["valor"]}}
        if beta is not None:
            cambios["beta_esfuerzo"] = float(beta)
        if delta_max is not None:
            cambios["delta_max"] = float(delta_max) if delta_max > 0 else None
        if permitir_reducciones is not None:
            cambios["solo_incrementos"] = not permitir_reducciones
        config = replace(m.config_prescripcion, **cambios)
        estado_deseado = {m.pre.indice(c): v for c, v in config.estado_deseado.items()}
        pesos = {m.pre.indice(c): v for c, v in config.pesos_objetivo.items()}
        return PrescriptorPRVFCM(m.fcm, m.pre.indices_accion, estado_deseado, pesos, m.config_ag, config), meta

    def prescribir(
        self,
        entrada: Entrada,
        nivel_meta: str | None = None,
        beta: float | None = None,
        delta_max: float | None = None,
        permitir_reducciones: bool | None = None,
        semilla: int = 0,
        sujeto: str | None = None,
        al_progresar: Callable[[dict], None] | None = None,
    ) -> dict:
        """Prescripción individual en unidades originales.

        ``al_progresar(evento)`` recibe al final de cada generación
        ``{"generacion", "generaciones_max", "mejor_costo", "costo_medio", "acciones"}``,
        con las mejores acciones hasta ese momento en unidades originales: basta
        para emitir el progreso en vivo (SSE o WebSocket) desde un backend.
        """
        m = self.modelo
        es_perfil = not isinstance(entrada, pd.DataFrame)
        estado = self.predictor.estado_inicial(entrada)
        prescriptor, meta = self.motor(nivel_meta, beta, delta_max, permitir_reducciones)
        columnas = [m.pre.columnas[i] for i in m.pre.indices_accion]

        def en_unidades(acciones: np.ndarray) -> list[float]:
            return [m.valor_original(c, v)["valor"] for c, v in zip(columnas, acciones)]

        def avisar(generacion: int, mejor: float, medio: float, cromosoma: np.ndarray) -> None:
            al_progresar(
                {
                    "generacion": generacion,
                    "generaciones_max": m.config_ag.generaciones,
                    "mejor_costo": mejor,
                    "costo_medio": medio,
                    "acciones": dict(zip(columnas, en_unidades(cromosoma))),
                }
            )

        rng = np.random.default_rng([m.semilla, semilla])
        resultado = prescriptor.prescribir(estado, rng, avisar if al_progresar is not None else None)

        info = {a["columna"]: a for a in m.acciones()}
        acciones = []
        for k, columna in enumerate(columnas):
            actual = m.valor_original(columna, resultado.acciones_actuales[k])
            recomendada = m.valor_original(columna, resultado.acciones_recomendadas[k])
            acciones.append({**info[columna], "actual": actual, "recomendada": recomendada, "cambio": recomendada["valor"] - actual["valor"]})

        # Activación del objetivo con el mejor individuo de cada generación: una sola
        # inferencia por lotes, para reproducir la evolución en la interfaz.
        mejores = resultado.historial_acciones
        activaciones = m.fcm.inferir(prescriptor.estados_con_acciones(estado, mejores)).estados[:, m.pre.indice_objetivo]
        salida = {
            "acciones": acciones,
            "base": m.describir_final(resultado.estado_base, meta["valor"]),
            "prescrito": m.describir_final(resultado.estado_prescrito, meta["valor"]),
            "meta": meta,
            "costo": resultado.costo,
            "generaciones": resultado.generaciones,
            "historial": {
                "mejor": resultado.historial_costo.tolist(),
                "promedio": [] if resultado.historial_promedio is None else resultado.historial_promedio.tolist(),
                "activacion": activaciones.tolist(),
                # Una fila por generación, en el orden de ``acciones``.
                "acciones": [en_unidades(fila) for fila in mejores],
            },
            "contribuciones": m.contribuciones(resultado.estado_base, resultado.estado_prescrito),
            "configuracion": {
                "beta": prescriptor.config.beta_esfuerzo,
                "delta_max": prescriptor.config.delta_max,
                "solo_incrementos": prescriptor.config.solo_incrementos,
                "poblacion": m.config_ag.tam_poblacion,
                "generaciones_max": m.config_ag.generaciones,
                "paciencia": m.config_ag.paciencia,
            },
        }
        nombre_objetivo = m.esquema.conceptos[m.pre.indice_objetivo].nombre
        salida["reporte"] = reporte_individual(salida, nombre_objetivo, sujeto or ("este perfil" if es_perfil else "este estudiante"))
        if es_perfil:
            salida["perfil"] = {c: entrada.get(c) for c in m.esquema.columnas_origen if c != m.esquema.objetivo}
        return salida
