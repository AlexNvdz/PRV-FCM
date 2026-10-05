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
    python main.py --help
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

from prvfcm.configuracion import (
    ESQUEMA_XAPI,
    LAMBDA_ARTICULO,
    ConfigAG,
    ConfigFCM,
    ConfigPrescripcion,
    ConfigSeleccion,
    con_mutables_dinamicos,
)
from prvfcm.fcm import METODOS_PESOS
from prvfcm.genetico import TIPOS_CRUCE
from prvfcm.pipeline import SEGMENTO_AUSENTISMO, OpcionesPipeline, ResultadoPipeline, ejecutar
from prvfcm.preprocesamiento import cargar_datos, etiquetas_objetivo
from prvfcm import visualizacion

RAIZ = Path(__file__).resolve().parent


def parsear_argumentos() -> argparse.Namespace:
    fcm, ag, presc, sel = ConfigFCM(), ConfigAG(), ConfigPrescripcion(), ConfigSeleccion()
    parser = argparse.ArgumentParser(description="PRV-FCM: prescripción de acciones para el rendimiento académico.")
    parser.add_argument(
        "--datos", type=Path, default=RAIZ / "data" / "xAPI-Edu-Data-expanded-4800.csv", help="ruta del CSV"
    )
    parser.add_argument("--salida", type=Path, default=RAIZ / "resultados", help="carpeta de resultados")
    parser.add_argument("--semilla", type=int, default=42, help="semilla aleatoria")
    parser.add_argument("--prueba", type=float, default=0.3, help="proporción del conjunto de prueba")
    parser.add_argument(
        "--division",
        choices=("agrupada", "aleatoria"),
        default="agrupada",
        help="agrupada: cada perfil inmutable (C1-C8) queda completo en entrenamiento o en prueba",
    )
    grupo = parser.add_argument_group("FCM")
    grupo.add_argument(
        "--metodo-pesos", choices=METODOS_PESOS, default=fcm.metodo_pesos,
        help="extracción de la matriz de pesos: bptt (gradiente exacto), ridge, lasso o correlacion_parcial",
    )
    grupo.add_argument(
        "--excluir", nargs=2, action="append", default=[], metavar=("ORIGEN", "DESTINO"),
        help="máscara de dirección causal: elimina la arista ORIGEN -> DESTINO (columnas del CSV); se puede repetir",
    )
    grupo.add_argument(
        "--equilibrar-niveles", action="store_true",
        help="pondera cada registro por la inversa de la frecuencia de su nivel al aprender W (objetivos desbalanceados)",
    )
    grupo.add_argument("--lambda", dest="lambda_", type=float, default=fcm.lambda_, help="pendiente de la sigmoide (con --sin-cv)")
    grupo.add_argument("--alpha-l2", type=float, default=fcm.alpha_l2, help="regularización L2 de los pesos (con --sin-cv)")
    grupo.add_argument("--tolerancia", type=float, default=fcm.tolerancia, help="criterio de convergencia")
    grupo.add_argument(
        "--mutables-dinamicos",
        action="store_true",
        help="actualiza C13-C15 en la inferencia en lugar de conservar sus valores observados",
    )
    grupo = parser.add_argument_group("Validación cruzada (selección de lambda y alpha_l2)")
    grupo.add_argument("--sin-cv", action="store_true", help="omite la validación cruzada y usa --lambda y --alpha-l2")
    grupo.add_argument("--pliegues", type=int, default=sel.pliegues, help="número de pliegues")
    grupo.add_argument("--rejilla-lambda", type=float, nargs="+", default=list(sel.rejilla_lambda), help="valores de lambda")
    grupo.add_argument("--rejilla-alpha", type=float, nargs="+", default=list(sel.rejilla_alpha), help="valores de alpha_l2")
    grupo = parser.add_argument_group("Algoritmo genético")
    grupo.add_argument("--poblacion", type=int, default=ag.tam_poblacion)
    grupo.add_argument("--generaciones", type=int, default=ag.generaciones)
    grupo.add_argument("--torneo", type=int, default=ag.tam_torneo, help="tamaño del torneo")
    grupo.add_argument("--cruce", choices=TIPOS_CRUCE, default=ag.tipo_cruce)
    grupo.add_argument("--tasa-cruce", type=float, default=ag.tasa_cruce)
    grupo.add_argument("--tasa-mutacion", type=float, default=ag.tasa_mutacion, help="probabilidad por gen")
    grupo.add_argument("--sigma-mutacion", type=float, default=ag.sigma_mutacion, help="fracción del rango del gen")
    grupo.add_argument("--elitismo", type=int, default=ag.elitismo)
    grupo = parser.add_argument_group("Prescripción")
    grupo.add_argument("--beta", type=float, default=presc.beta_esfuerzo, help="penalización del esfuerzo")
    grupo.add_argument("--delta-max", type=float, default=presc.delta_max, help="cambio máximo por acción (0-1)")
    grupo.add_argument("--permitir-reducciones", action="store_true", help="permite recomendar valores menores a los actuales")
    parser.add_argument("--sin-graficas", action="store_true", help="no genera las figuras PNG")
    return parser.parse_args()


def titulo(texto: str) -> None:
    print(f"\n{'=' * 72}\n{texto}\n{'=' * 72}")


def opciones_desde_argumentos(args: argparse.Namespace) -> OpcionesPipeline:
    return OpcionesPipeline(
        proporcion_prueba=args.prueba,
        semilla=args.semilla,
        division=args.division,
        validacion_cruzada=not args.sin_cv,
        config_fcm=ConfigFCM(
            lambda_=args.lambda_, alpha_l2=args.alpha_l2, tolerancia=args.tolerancia, metodo_pesos=args.metodo_pesos,
            balancear_niveles=args.equilibrar_niveles,
        ),
        config_seleccion=ConfigSeleccion(
            pliegues=args.pliegues,
            rejilla_lambda=tuple(args.rejilla_lambda),
            rejilla_alpha=tuple(args.rejilla_alpha),
        ),
        config_ag=ConfigAG(
            tam_poblacion=args.poblacion,
            generaciones=args.generaciones,
            tam_torneo=args.torneo,
            tasa_cruce=args.tasa_cruce,
            tipo_cruce=args.cruce,
            tasa_mutacion=args.tasa_mutacion,
            sigma_mutacion=args.sigma_mutacion,
            elitismo=args.elitismo,
        ),
        config_prescripcion=ConfigPrescripcion(
            beta_esfuerzo=args.beta,
            solo_incrementos=not args.permitir_reducciones,
            delta_max=args.delta_max,
        ),
        segmento=SEGMENTO_AUSENTISMO,
        aristas_excluidas=tuple((origen, destino) for origen, destino in args.excluir),
    )


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

    titulo("2. INFERENCIA DIFUSA (FCM, Kosko modificada con memoria)")
    if r.opciones.validacion_cruzada:
        sel = r.opciones.config_seleccion
        print(
            f"Validación cruzada {'agrupada' if agrupada else 'estratificada'} de {sel.pliegues} pliegues "
            f"sobre el entrenamiento ({len(sel.rejilla_lambda) * len(sel.rejilla_alpha)} combinaciones de lambda y alpha_l2):"
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
    print(
        f"Elegido: lambda = {r.config_fcm.lambda_:g}, alpha_l2 = {r.config_fcm.alpha_l2:g} "
        f"(exactitud de validación {100 * mejor['exactitud']:.1f}% ± {100 * mejor['exactitud_de']:.1f}{equilibrada})"
    )


def imprimir_fcm(r: ResultadoPipeline) -> None:
    config, fcm, prediccion = r.config_fcm, r.fcm, r.prediccion
    nombres = fcm.nombres
    print(
        f"f(x) = 1/(1+exp(-{config.lambda_:g}*x)) | A(t+1) = f({config.coef_memoria:g}*A(t) + "
        f"{config.coef_influencia:g}*A(t)W)"
    )
    print(f"Conceptos que se actualizan en la inferencia: {[nombres[i] for i in r.pre.indices_dinamicos]}")
    if r.opciones.aristas_excluidas:
        print(f"Máscara causal: aristas excluidas {[f'{o} -> {d}' for o, d in r.opciones.aristas_excluidas]}")
    if fcm.resultado_optimizacion is not None:
        print(
            f"Pesos aprendidos: {int(fcm.estructura.sum())} aristas | L-BFGS-B: {fcm.resultado_optimizacion.nit} iteraciones, "
            f"pérdida final {fcm.resultado_optimizacion.fun:.4f}"
        )
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
    ag, presc = r.opciones.config_ag, r.config_prescripcion
    print(f"Cromosoma: {[r.pre.columnas[i] for i in r.pre.indices_accion]} (genes reales en [0, 1])")
    print(f"Estado deseado: {presc.estado_deseado} | beta (esfuerzo) = {presc.beta_esfuerzo:g}")
    print(
        f"AG: población {ag.tam_poblacion}, generaciones {ag.generaciones}, torneo {ag.tam_torneo}, "
        f"cruce {ag.tipo_cruce} ({ag.tasa_cruce:g}), mutación {ag.tasa_mutacion:g} "
        f"(sigma {ag.sigma_mutacion:g}), elitismo {ag.elitismo}"
    )
    print(f"Estudiantes de prueba con rendimiento {'/'.join(presc.clases_a_prescribir)}: {int(r.seleccion.sum())}")


def imprimir_evaluacion(r: ResultadoPipeline) -> None:
    titulo("4. EVALUACIÓN")
    metricas, externa, presc = r.metricas, r.externa, r.config_prescripcion
    print(f"Estudiantes evaluados: {metricas['n_estudiantes']} | tolerancia de éxito: {presc.tolerancia_exito:g}")
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
    print(f"  Estudiantes clasificados H: {externa['PSR_externo_base']:.1f}% -> {externa['PSR_externo']:.1f}%")
    print(f"  Probabilidad media de H:    {externa['prob_H_base']:.3f} -> {externa['prob_H_prescrita']:.3f}")

    if r.exito_por_segmento:
        print("\nEstudiantes que alcanzan H por segmento (acciones actuales -> prescritas):")
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
            print(f"  Estudiante {fila['id_estudiante']} (Class observada {clase}):")
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
    esquema = con_mutables_dinamicos() if args.mutables_dinamicos else ESQUEMA_XAPI
    salida: Path = args.salida
    salida.mkdir(parents=True, exist_ok=True)

    titulo("1. PREPROCESAMIENTO")
    datos = cargar_datos(args.datos, esquema)
    r = ejecutar(
        datos,
        esquema,
        opciones_desde_argumentos(args),
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
