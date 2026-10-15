"""
PRV-FCM (PRescriptiVe Fuzzy Cognitive Maps con algoritmos genéticos) aplicado
al rendimiento académico con el dataset xAPI-Edu-Data expandido a 4800 registros.

Etapas:
    1. Preprocesamiento: división 70/30 agrupada por perfil inmutable (C1-C8),
       codificación, Min-Max a [0, 1] y segmentación de conceptos.
    2. Inferencia difusa: FCM con regla de Kosko modificada y sigmoide; lambda y
       alpha_l2 elegidos por validación cruzada agrupada; pesos aprendidos con
       los datos de entrenamiento.
    3. Optimización prescriptiva: AG sobre los conceptos de acción C9-C12.
    4. Evaluación: MAE, MSE, RMSE y PSR, más validaciones complementarias.

La lógica de las etapas está en ``prvfcm.pipeline``; este script define la
línea de comandos, imprime cada sección y genera las gráficas PNG.

Uso:
    python main.py
    python main.py --datos data/xAPI-Edu-Data.csv          # dataset original (480 registros)
    python main.py --sin-cv --lambda 1 --alpha-l2 0.001    # sin validación cruzada
    python main.py --division aleatoria                    # división sin agrupar (ver README)
    python main.py --cruce un_punto --tasa-mutacion 0.3 --beta 0.1
    python main.py --metodo-pesos ridge                    # pesos por regresión Ridge (también lasso, correlacion_parcial)
    python main.py --excluir gender Class                  # máscara causal: sin la arista gender -> Class
    python main.py --sin-sesgo                             # regla sin sesgo b_i
    python main.py --sin-tope-ausentismo                   # sin el tope de acciones con más de 7 ausencias
    python main.py --perfil articulo --datos data/xAPI-Edu-Data.csv --binarizar-objetivo M   # como PRV-FCM (2023)
    python main.py --esquema data/esquemas/heart.json --datos data/heart.csv --permitir-reducciones
    python experimentos.py                                 # ablación de perfiles y métodos (resultados_experimentos/)
    python main.py --help
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from prvfcm.configuracion import ESQUEMA_XAPI, LAMBDA_ARTICULO, PERFILES
from prvfcm.esquema import esquema_desde_dict, segmento_desde_dict
from prvfcm.fcm import ACTIVACIONES, INFERENCIAS, METODOS_PESOS
from prvfcm.genetico import TIPOS_CRUCE
from prvfcm.pipeline import SEGMENTO_AUSENTISMO, OpcionesPipeline, ResultadoPipeline, Segmento, ejecutar, opciones_desde_dict
from prvfcm.prescripcion import APTITUDES
from prvfcm.seleccion import combinaciones
from prvfcm.preprocesamiento import cargar_datos, etiquetas_objetivo
from prvfcm import visualizacion

RAIZ = Path(__file__).resolve().parent


def parsear_argumentos() -> argparse.Namespace:
    """Argumentos de la línea de comandos. Las opciones del modelo valen None si no se dan: entonces manda el perfil."""
    parser = argparse.ArgumentParser(description="PRV-FCM: prescripción de acciones para el rendimiento académico.")
    parser.add_argument(
        "--datos", type=Path, default=RAIZ / "data" / "xAPI-Edu-Data-expanded-4800.csv", help="ruta del CSV"
    )
    parser.add_argument(
        "--esquema", type=Path,
        help="esquema JSON de otro dataset (formato de la aplicación, ver data/esquemas/); por defecto, xAPI-Edu-Data",
    )
    parser.add_argument("--salida", type=Path, default=RAIZ / "resultados", help="carpeta de resultados")
    parser.add_argument(
        "--perfil", choices=tuple(PERFILES), default="mejorado",
        help="mejorado (este proyecto) o articulo (PRV-FCM 2023: PSO, sin sesgo, SMOTE, 10 pliegues); las opciones explícitas mandan",
    )
    parser.add_argument("--semilla", type=int, help="semilla aleatoria (42)")
    parser.add_argument("--prueba", type=float, help="proporción del conjunto de prueba (0.3)")
    parser.add_argument(
        "--division", choices=("agrupada", "aleatoria"),
        help="agrupada (defecto): cada perfil inmutable (C1-C8) queda completo en entrenamiento o en prueba",
    )
    parser.add_argument(
        "--binarizar-objetivo", metavar="NIVEL",
        help="objetivo de dos niveles: desde NIVEL es éxito (en xAPI, M: L frente a M+H); un número si el objetivo es numérico",
    )
    parser.add_argument("--smote", action="store_true", default=None, help="equilibra los niveles del entrenamiento con SMOTE")
    grupo = parser.add_argument_group("FCM")
    grupo.add_argument(
        "--metodo-pesos", choices=METODOS_PESOS,
        help="extracción de W: bptt (gradiente exacto), ridge, lasso, correlacion_parcial, pso o expertos (con --expertos)",
    )
    grupo.add_argument("--expertos", type=Path, help="JSON con las matrices de expertos [{experto, aristas: [{origen, destino, peso}]}]")
    grupo.add_argument("--inferencia", choices=INFERENCIAS, help="regla de inferencia (Tabla 2 de PRV-FCM)")
    grupo.add_argument("--activacion", choices=ACTIVACIONES, help="función de activación")
    grupo.add_argument(
        "--excluir", nargs=2, action="append", metavar=("ORIGEN", "DESTINO"),
        help="máscara de dirección causal: elimina la arista ORIGEN -> DESTINO (columnas del CSV); se puede repetir",
    )
    grupo.add_argument("--sin-sesgo", dest="sesgo", action="store_const", const=False, help="regla sin sesgo b_i (la del artículo)")
    grupo.add_argument(
        "--equilibrar-niveles", action="store_true", default=None,
        help="pondera cada registro por la inversa de la frecuencia de su nivel al aprender W (objetivos desbalanceados)",
    )
    grupo.add_argument("--lambda", dest="lambda_", type=float, help="pendiente de la sigmoide (con --sin-cv; 1)")
    grupo.add_argument("--alpha-l2", type=float, help="regularización L2 de los pesos (con --sin-cv; 0.001)")
    grupo.add_argument("--tolerancia", type=float, help="criterio de convergencia (1e-5)")
    grupo.add_argument(
        "--mutables-dinamicos", action="store_true", default=None,
        help="actualiza los mutables (C13-C15) en la inferencia en lugar de conservar sus valores observados",
    )
    grupo = parser.add_argument_group("Validación cruzada")
    grupo.add_argument("--sin-cv", dest="validacion_cruzada", action="store_const", const=False, help="usa --lambda y --alpha-l2")
    grupo.add_argument("--pliegues", type=int, help="número de pliegues (5; 10 en el perfil articulo)")
    grupo.add_argument("--rejilla-lambda", type=float, nargs="+", help="valores de lambda")
    grupo.add_argument("--rejilla-alpha", type=float, nargs="+", help="valores de alpha_l2")
    grupo = parser.add_argument_group("Algoritmo genético")
    grupo.add_argument("--poblacion", type=int)
    grupo.add_argument("--generaciones", type=int)
    grupo.add_argument("--torneo", type=int, help="tamaño del torneo")
    grupo.add_argument("--cruce", choices=TIPOS_CRUCE)
    grupo.add_argument("--tasa-cruce", type=float)
    grupo.add_argument("--tasa-mutacion", type=float, help="probabilidad por gen")
    grupo.add_argument("--sigma-mutacion", type=float, help="fracción del rango del gen")
    grupo.add_argument("--elitismo", type=int)
    grupo.add_argument("--busqueda-ag", action="store_true", default=None, help="búsqueda aleatoria de los hiperparámetros del AG")
    grupo = parser.add_argument_group("Prescripción")
    grupo.add_argument("--beta", type=float, help="penalización del esfuerzo (0.4)")
    grupo.add_argument("--delta-max", type=float, help="cambio máximo por acción (0-1)")
    grupo.add_argument("--permitir-reducciones", action="store_true", default=None, help="permite recomendar valores menores a los actuales")
    grupo.add_argument("--tope-ausentismo", type=float, help="subida máxima por acción (0-1) si StudentAbsenceDays = Above-7 (0.15)")
    grupo.add_argument("--sin-tope-ausentismo", action="store_true", help="no limita las acciones con ausentismo alto")
    grupo.add_argument("--aptitud", choices=APTITUDES, help="error (defecto), tabla4 (PRV-FCM) o garcia2025")
    parser.add_argument("--sin-graficas", action="store_true", help="no genera las figuras PNG")
    return parser.parse_args()


def titulo(texto: str) -> None:
    print(f"\n{'=' * 72}\n{texto}\n{'=' * 72}")


# Argumento de main.py -> clave de pipeline.opciones_desde_dict.
CLAVES = {
    "perfil": "perfil", "semilla": "semilla", "prueba": "proporcion_prueba", "division": "division",
    "binarizar_objetivo": "binarizar_objetivo", "smote": "smote", "metodo_pesos": "metodo_pesos",
    "inferencia": "inferencia", "activacion": "activacion", "sesgo": "sesgo", "equilibrar_niveles": "balancear_niveles",
    "lambda_": "lambda", "alpha_l2": "alpha_l2", "tolerancia": "tolerancia", "mutables_dinamicos": "mutables_dinamicos",
    "validacion_cruzada": "validacion_cruzada", "pliegues": "pliegues", "rejilla_lambda": "rejilla_lambda",
    "rejilla_alpha": "rejilla_alpha", "busqueda_ag": "busqueda_ag", "beta": "beta", "delta_max": "delta_max",
    "permitir_reducciones": "permitir_reducciones", "tope_ausentismo": "condicion_delta_max", "aptitud": "aptitud",
}
CLAVES_AG = {
    "poblacion": "tam_poblacion", "generaciones": "generaciones", "torneo": "tam_torneo", "cruce": "tipo_cruce",
    "tasa_cruce": "tasa_cruce", "tasa_mutacion": "tasa_mutacion", "sigma_mutacion": "sigma_mutacion", "elitismo": "elitismo",
}


def opciones_desde_argumentos(args: argparse.Namespace, segmento: Segmento | None = SEGMENTO_AUSENTISMO) -> OpcionesPipeline:
    """Solo los argumentos dados pasan a ``opciones_desde_dict``: el resto lo pone el perfil."""
    datos = {clave: getattr(args, arg) for arg, clave in CLAVES.items() if getattr(args, arg) is not None}
    ag = {clave: getattr(args, arg) for arg, clave in CLAVES_AG.items() if getattr(args, arg) is not None}
    if ag:
        datos["ag"] = ag
    if args.excluir:
        datos["aristas_excluidas"] = [tuple(a) for a in args.excluir]
    if args.sin_tope_ausentismo:
        datos["condicion_delta_max"] = None
    if args.expertos:
        datos["matrices_expertos"] = json.loads(args.expertos.read_text(encoding="utf-8"))
    return opciones_desde_dict(datos, segmento)


# ---------------------------------------------------------------------------
# Impresión de cada etapa
# ---------------------------------------------------------------------------
def imprimir_preprocesamiento(r: ResultadoPipeline) -> None:
    agrupada = r.division == "agrupada"
    if r.opciones.division == "agrupada" and not agrupada:
        print(f"Aviso: solo hay {r.grupos.nunique()} perfiles inmutables distintos; la división es aleatoria.")
    etiquetas = etiquetas_objetivo(r.datos, r.esquema)
    print(
        f"Registros: {len(r.datos)} ({r.nombre_datos}) | {r.esquema.objetivo}: "
        + ", ".join(f"{nivel} {int(np.sum(etiquetas == nivel))}" for nivel in r.esquema.niveles)
    )
    print(
        f"División {'agrupada por perfil inmutable C1-C8' if agrupada else 'aleatoria'} y estratificada por "
        f"{r.esquema.objetivo}: entrenamiento {len(r.entrenamiento)} | prueba {len(r.prueba)} "
        f"({len(r.prueba) / len(r.datos):.1%})"
    )
    print(f"Perfiles inmutables: {r.grupos.nunique()} | presentes en entrenamiento y en prueba: {r.perfiles_compartidos}")
    print("Conceptos del FCM (Min-Max ajustado con entrenamiento):")
    print(r.pre.resumen_conceptos().to_string(index=False))
    if r.n_sinteticos:
        print(f"SMOTE: {r.n_sinteticos} registros sintéticos en el entrenamiento (la prueba no cambia).")

    titulo(f"2. INFERENCIA DIFUSA (FCM; perfil {r.opciones.perfil})")
    if r.opciones.validacion_cruzada:
        sel = r.opciones.config_seleccion
        print(
            f"Validación cruzada {'agrupada' if agrupada else 'estratificada'} de {sel.pliegues} pliegues "
            f"sobre el entrenamiento ({len(combinaciones(sel))} combinaciones):"
        )


def imprimir_seleccion(r: ResultadoPipeline) -> None:
    tabla = r.seleccion_cv
    vista = tabla.assign(exactitud=100 * tabla["exactitud"], exactitud_de=100 * tabla["exactitud_de"]).rename(
        columns={"exactitud": "exactitud_%", "exactitud_de": "desv_%"}
    )
    if "exactitud_equilibrada" in vista:
        vista = vista.assign(exactitud_equilibrada=100 * vista["exactitud_equilibrada"]).rename(
            columns={"exactitud_equilibrada": "equilibrada_%"}
        )
    print(vista.to_string(index=False, float_format=lambda v: f"{v:.4g}"))
    mejor = tabla.iloc[0]
    equilibrada = f", equilibrada {100 * mejor['exactitud_equilibrada']:.1f}%" if "exactitud_equilibrada" in mejor else ""
    regla = f"{r.config_fcm.inferencia} con {r.config_fcm.activacion}, " if "inferencia" in mejor else ""
    print(
        f"Elegido: {regla}lambda = {r.config_fcm.lambda_:g}, alpha_l2 = {r.config_fcm.alpha_l2:g} "
        f"(exactitud de validación {100 * mejor['exactitud']:.1f}% ± {100 * mejor['exactitud_de']:.1f}{equilibrada})"
    )


def imprimir_fcm(r: ResultadoPipeline) -> None:
    config, fcm, prediccion = r.config_fcm, r.fcm, r.prediccion
    nombres = fcm.nombres
    u = "(2A(t)-1)" if config.inferencia == "reescalada" or config.activacion == "tanh" else "A(t)"
    memoria = "" if config.inferencia == "kosko" else f"{config.coef_memoria:g}*{u} + "
    f = f"(tanh({config.lambda_:g}*x)+1)/2" if config.activacion == "tanh" else f"1/(1+exp(-{config.lambda_:g}*x))"
    print(
        f"Regla {config.inferencia}, activación {config.activacion}: f(x) = {f} | "
        f"A(t+1) = f({memoria}{config.coef_influencia:g}*({u}W{' + b' if config.sesgo else ''}))"
    )
    if config.sesgo:
        print(f"Sesgo del objetivo: b = {fcm.sesgo[r.pre.indice_objetivo]:.4f}")
    print(f"Conceptos que se actualizan en la inferencia: {[nombres[i] for i in r.pre.indices_dinamicos]}")
    if r.opciones.aristas_excluidas:
        print(f"Máscara causal: aristas excluidas {[f'{o} -> {d}' for o, d in r.opciones.aristas_excluidas]}")
    if fcm.resultado_optimizacion is not None:
        print(
            f"Pesos aprendidos: {int(fcm.estructura.sum())} aristas | L-BFGS-B: {fcm.resultado_optimizacion.nit} iteraciones, "
            f"pérdida final {fcm.resultado_optimizacion.fun:.4f}"
        )
    elif config.metodo_pesos == "pso":
        print(
            f"Pesos por PSO: {int(fcm.estructura.sum())} aristas | {len(fcm.historial_perdida) - 1} iteraciones "
            f"(inercia {config.pso_inercia:g}, c1 {config.pso_c1:g}, c2 {config.pso_c2:g}), "
            f"pérdida {fcm.historial_perdida[0]:.4f} -> {fcm.historial_perdida[-1]:.4f}"
        )
    elif config.metodo_pesos == "expertos":
        print(f"Pesos de {len(r.opciones.matrices_expertos)} expertos (media aritmética): {int(fcm.estructura.sum())} aristas posibles")
    else:
        print(f"Pesos por {config.metodo_pesos}: {int(fcm.estructura.sum())} aristas, truncados a [-1, 1]")
    estado = "converge" if prediccion["convergio"] else "NO converge"
    print(f"Inferencia en prueba: {estado} en {prediccion['iteraciones_inferencia']} iteraciones (tolerancia {config.tolerancia:g})")
    print("Calidad predictiva de los conceptos dinámicos (conjunto de prueba):")
    for concepto, valores in prediccion["por_concepto"].items():
        columna = r.pre.columnas[nombres.index(concepto)]
        print(f"  {concepto:<4} {columna:<26} MAE = {valores['MAE']:.3f}   RMSE = {valores['RMSE']:.3f}")
    print(
        f"Exactitud del rendimiento discretizado (L/M/H): {100 * prediccion['exactitud_rendimiento']:.1f}% "
        f"(clase mayoritaria: {100 * prediccion['exactitud_clase_mayoritaria']:.1f}%) | "
        f"F1 macro: {100 * prediccion['F1_macro']:.1f}%"
    )
    for nivel, m in prediccion["por_clase"].items():
        print(
            f"  {nivel}: precisión {100 * m['precision']:5.1f}% | recall {100 * m['recall']:5.1f}% | "
            f"F1 {100 * m['F1']:5.1f}% | n = {m['soporte']}"
        )
    print("Matriz de confusión:")
    print(prediccion["matriz_confusion"].to_string())


def imprimir_inicio_prescripcion(r: ResultadoPipeline) -> None:
    titulo("3. OPTIMIZACIÓN PRESCRIPTIVA (algoritmo genético)")
    ag, presc = r.config_ag, r.config_prescripcion
    print(f"Cromosoma: {[r.pre.columnas[i] for i in r.pre.indices_accion]} (genes reales en [0, 1])")
    print(
        f"Estado deseado: {presc.estado_deseado} | aptitud {presc.aptitud} | beta (esfuerzo) = {presc.beta_esfuerzo:g} | "
        f"{'acciones actuales sembradas' if presc.sembrar else 'sin siembra'}"
    )
    if r.busqueda_ag is not None:
        print("Búsqueda aleatoria del AG (MAE de reconstrucción en entrenamiento):")
        print(r.busqueda_ag.to_string(index=False, float_format=lambda v: f"{v:.4g}"))
    if r.prescriptor.indice_condicion is not None:
        print(f"Tope con {presc.condicion_columna} activo: cada acción sube como máximo {presc.condicion_delta_max:g}")
    print(
        f"AG: población {ag.tam_poblacion}, generaciones {ag.generaciones}, torneo {ag.tam_torneo}, "
        f"cruce {ag.tipo_cruce} ({ag.tasa_cruce:g}), mutación {ag.tasa_mutacion:g} "
        f"(sigma {ag.sigma_mutacion:g}), elitismo {ag.elitismo}"
    )
    print(f"{r.esquema.sujeto.plural.capitalize()} de prueba con nivel {'/'.join(presc.clases_a_prescribir)}: {int(r.seleccion.sum())}")


def imprimir_evaluacion(r: ResultadoPipeline) -> None:
    titulo("4. EVALUACIÓN")
    metricas, externa, presc = r.metricas, r.externa, r.config_prescripcion
    print(f"{r.esquema.sujeto.plural.capitalize()} evaluados: {metricas['n_estudiantes']} | tolerancia de éxito: {presc.tolerancia_exito:g}")
    print(f"{'':<8}{'Acciones actuales':>20}{'PRV-FCM':>12}")
    print(f"{'MAE':<8}{metricas['MAE_base']:>20.4f}{metricas['MAE']:>12.4f}")
    print(f"{'MSE':<8}{metricas['MSE_base']:>20.4f}{metricas['MSE']:>12.4f}")
    print(f"{'RMSE':<8}{metricas['RMSE_base']:>20.4f}{metricas['RMSE']:>12.4f}")
    print(f"{'PSR':<8}{metricas['PSR_base']:>19.1f}%{metricas['PSR']:>11.1f}%")
    print(
        f"Cambio medio por acción: {metricas['cambio_medio_por_accion']:.3f} (escala normalizada) | "
        f"generaciones medias del AG: {metricas['generaciones_medias_ag']:.1f}"
    )

    print(f"\nValidación externa (bosque aleatorio, exactitud en prueba {100 * externa['exactitud_prueba']:.1f}%):")
    print(f"  Clasificados en el mejor nivel: {externa['PSR_externo_base']:.1f}% -> {externa['PSR_externo']:.1f}%")
    print(f"  Probabilidad media de H:    {externa['prob_H_base']:.3f} -> {externa['prob_H_prescrita']:.3f}")

    if r.exito_por_segmento:
        print(f"\n{r.esquema.sujeto.plural.capitalize()} que alcanzan el mejor nivel por segmento (acciones actuales -> prescritas):")
        for nombre, fcm_seg in r.exito_por_segmento.items():
            rf_seg = externa["por_segmento"][nombre]
            print(
                f"  {nombre:<15} n = {fcm_seg['n']:>4} | FCM {fcm_seg['PSR_base']:5.1f}% -> {fcm_seg['PSR']:5.1f}% | "
                f"bosque {rf_seg['PSR_externo_base']:5.1f}% -> {rf_seg['PSR_externo']:5.1f}%"
            )

    recomendaciones, pre, objetivo = r.recomendaciones, r.pre, r.esquema.objetivo
    print("\nEjemplos de prescripción (unidades originales):")
    for clase in presc.clases_a_prescribir:
        ejemplo = recomendaciones[recomendaciones["clase_observada"] == clase].head(1)
        for _, fila in ejemplo.iterrows():
            print(f"  {r.esquema.sujeto.singular.capitalize()} {fila['id_estudiante']} ({objetivo} observado: {clase}):")
            for i in pre.indices_accion:
                columna = pre.columnas[i]
                print(
                    f"    {columna:<18} {fila[f'{columna}_actual']:>6.1f} -> {fila[f'{columna}_recomendado']:>6.1f} "
                    f"({fila[f'{columna}_cambio']:+.1f})"
                )
            print(
                f"    Rendimiento FCM:   {fila[f'{objetivo}_fcm_base']:.3f} ({fila['nivel_base']}) -> "
                f"{fila[f'{objetivo}_fcm_prescrito']:.3f} ({fila['nivel_prescrito']})"
            )
    imprimir_reconstruccion(r)


def imprimir_reconstruccion(r: ResultadoPipeline) -> None:
    """Protocolo de PRV-FCM: acciones prescritas frente a las reales de quienes ya están en el mejor nivel."""
    rec = r.reconstruccion
    if rec is None:
        return
    g = rec["global"]
    print(
        f"\nReconstrucción de acciones ({rec['n']} registros de prueba en {r.esquema.mejor_nivel}; AG sin siembra y "
        f"beta = 0; escala [0, 1]): MAE {g['mae']:.4f} | MSE {g['mse']:.4f} | RMSE {g['rmse']:.4f} | "
        f"R² {g['r2'] if g['r2'] is None else round(g['r2'], 3)} | PSR ec. 19 {g['psr_ec19']:.3f}"
    )
    for a in rec["por_accion"]:
        p = "-" if a["p"] is None else f"{a['p']:.3f} ({a['prueba']})"
        print(
            f"  {a['columna']:<18} MAE {a['mae']:.4f} RMSE {a['rmse']:.4f} | real {a['media_real']:.3f} ± {a['de_real']:.3f} | "
            f"prescrita {a['media_prescrita']:.3f} ± {a['de_prescrita']:.3f} | p = {p}"
        )
    for aviso in rec["avisos"]:
        print(f"  Aviso: {aviso}")


IMPRESORES = {
    "preprocesamiento": imprimir_preprocesamiento,
    "seleccion": imprimir_seleccion,
    "fcm": imprimir_fcm,
    "prescripcion": imprimir_inicio_prescripcion,
    "evaluacion": imprimir_evaluacion,
}


def imprimir_progreso(tarea: str, hechos: int, total: int) -> None:
    """Unas diez líneas de progreso de la prescripción; la validación cruzada no imprime."""
    if tarea == "prescripcion" and (hechos % max(10, total // 10) == 0 or hechos == total):
        print(f"  prescripciones completadas: {hechos}/{total}")


def main() -> None:
    # Salida UTF-8 para que las tildes se vean igual en consola, tuberías y archivos.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parsear_argumentos()
    esquema, segmento = ESQUEMA_XAPI, SEGMENTO_AUSENTISMO
    if args.esquema:
        esquema_dict = json.loads(args.esquema.read_text(encoding="utf-8"))
        esquema, segmento = esquema_desde_dict(esquema_dict), segmento_desde_dict(esquema_dict.get("segmento"))
    salida: Path = args.salida
    salida.mkdir(parents=True, exist_ok=True)

    titulo("1. PREPROCESAMIENTO")
    datos = cargar_datos(args.datos, esquema)
    r = ejecutar(
        datos,
        esquema,
        opciones_desde_argumentos(args, segmento),
        al_terminar_etapa=lambda etapa, resultado: IMPRESORES[etapa](resultado),
        al_progresar=imprimir_progreso,
        nombre_datos=args.datos.name,
    )
    r.guardar_resultados(salida)
    if not args.sin_graficas:
        visualizacion.generar_figuras(r, salida, lambda_articulo=LAMBDA_ARTICULO)
    print(f"\nResultados guardados en: {salida}")


if __name__ == "__main__":
    main()
