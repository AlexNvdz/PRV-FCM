"""
Etapa 4: evaluación.

Métricas prescriptivas, calculadas sobre los estudiantes que reciben prescripción
comparando el estado final del FCM (A*) con el estado deseado (D):

* MAE  = media_{s,i} |A_i*(s) - D_i|
* MSE  = media_{s,i} (A_i*(s) - D_i)^2,  RMSE = sqrt(MSE)
* PSR (Prescriptive Success Rate) = % de estudiantes cuya prescripción lleva
  todos los conceptos objetivo a |A_i* - D_i| <= tolerancia. Con Class
  deseada = 1 y tolerancia = 0.25 equivale a que el FCM prediga el nivel H.

Las mismas métricas se calculan para el escenario base (acciones actuales), así
la mejora atribuible a la prescripción queda explícita.

Evaluaciones complementarias:

* Calidad predictiva del FCM en el conjunto de prueba (MAE y RMSE por concepto
  dinámico; exactitud, precisión, recall y F1 del rendimiento discretizado en L/M/H).
* Validación externa: un bosque aleatorio entrenado de forma independiente, que
  no participa en la optimización, estima si los estudiantes alcanzarían el
  nivel H con las acciones recomendadas. Reduce el sesgo de evaluar las
  prescripciones solo con el mismo modelo que las generó.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_recall_fscore_support

from .configuracion import NIVELES_RENDIMIENTO
from .fcm import MapaCognitivoDifuso
from .prescripcion import ResultadoPrescripcion


def mae(real: np.ndarray, estimado: np.ndarray) -> float:
    """Error absoluto medio."""
    return float(np.mean(np.abs(np.asarray(real, dtype=float) - np.asarray(estimado, dtype=float))))


def mse(real: np.ndarray, estimado: np.ndarray) -> float:
    """Error cuadrático medio."""
    return float(np.mean((np.asarray(real, dtype=float) - np.asarray(estimado, dtype=float)) ** 2))


def rmse(real: np.ndarray, estimado: np.ndarray) -> float:
    """Raíz del error cuadrático medio."""
    return float(np.sqrt(mse(real, estimado)))


def discretizar_rendimiento(valores: np.ndarray, niveles: dict[str, float] = NIVELES_RENDIMIENTO) -> np.ndarray:
    """Asigna a cada activación el nivel más cercano (por defecto L = 0, M = 0.5, H = 1)."""
    etiquetas = np.array(list(niveles.keys()))
    centros = np.array(list(niveles.values()))
    distancias = np.abs(np.asarray(valores, dtype=float)[..., None] - centros)
    return etiquetas[np.argmin(distancias, axis=-1)]


def exito_prescriptivo(
    estados_objetivo: np.ndarray, valores_deseados: np.ndarray, tolerancia: float = 0.25
) -> np.ndarray:
    """True para cada estudiante cuyos conceptos objetivo quedan dentro de la tolerancia."""
    diferencias = np.abs(np.atleast_2d(estados_objetivo) - np.asarray(valores_deseados, dtype=float))
    return np.all(diferencias <= tolerancia, axis=1)


def tasa_exito_prescriptivo(
    estados_objetivo: np.ndarray, valores_deseados: np.ndarray, tolerancia: float = 0.25
) -> float:
    """PSR en %: porcentaje de estudiantes con éxito prescriptivo."""
    return float(100.0 * np.mean(exito_prescriptivo(estados_objetivo, valores_deseados, tolerancia)))


def evaluar_prediccion(
    fcm: MapaCognitivoDifuso,
    estados_iniciales: np.ndarray,
    estados_reales: np.ndarray,
    indices_dinamicos: np.ndarray,
    indice_objetivo: int,
    nombres: list[str],
    niveles_objetivo: dict[str, float] = NIVELES_RENDIMIENTO,
) -> dict:
    """Calidad predictiva del FCM: estados iniciales neutros vs valores observados."""
    inferencia = fcm.inferir(estados_iniciales)
    predichos = inferencia.estados
    por_concepto = {
        nombres[i]: {"MAE": mae(estados_reales[:, i], predichos[:, i]), "RMSE": rmse(estados_reales[:, i], predichos[:, i])}
        for i in indices_dinamicos
    }
    clase_real = discretizar_rendimiento(estados_reales[:, indice_objetivo], niveles_objetivo)
    clase_predicha = discretizar_rendimiento(predichos[:, indice_objetivo], niveles_objetivo)
    niveles = list(niveles_objetivo.keys())
    confusion = pd.crosstab(
        pd.Categorical(clase_real, categories=niveles),
        pd.Categorical(clase_predicha, categories=niveles),
        rownames=["real"],
        colnames=["predicho"],
        dropna=False,
    )
    precision, recall, f1, soporte = precision_recall_fscore_support(
        clase_real, clase_predicha, labels=niveles, zero_division=0
    )
    por_clase = {
        nivel: {"precision": float(p), "recall": float(r), "F1": float(f), "soporte": int(s)}
        for nivel, p, r, f, s in zip(niveles, precision, recall, f1, soporte)
    }
    _, conteos = np.unique(clase_real, return_counts=True)
    return {
        "por_concepto": por_concepto,
        "exactitud_rendimiento": float(np.mean(clase_real == clase_predicha)),
        "exactitud_clase_mayoritaria": float(conteos.max() / conteos.sum()),
        "por_clase": por_clase,
        "F1_macro": float(np.mean(f1)),
        "matriz_confusion": confusion,
        "iteraciones_inferencia": inferencia.iteraciones,
        "convergio": inferencia.convergio,
    }


def evaluar_prescripciones(
    resultados: list[ResultadoPrescripcion],
    indices_objetivo: np.ndarray,
    valores_deseados: np.ndarray,
    tolerancia: float = 0.25,
) -> dict:
    """MAE, RMSE y PSR de las prescripciones y del escenario base."""
    base = np.array([r.estado_base[indices_objetivo] for r in resultados])
    prescrito = np.array([r.estado_prescrito[indices_objetivo] for r in resultados])
    deseado = np.broadcast_to(np.asarray(valores_deseados, dtype=float), prescrito.shape)
    cambios = np.array([np.abs(r.acciones_recomendadas - r.acciones_actuales) for r in resultados])
    return {
        "n_estudiantes": len(resultados),
        "MAE": mae(deseado, prescrito),
        "MSE": mse(deseado, prescrito),
        "RMSE": rmse(deseado, prescrito),
        "PSR": tasa_exito_prescriptivo(prescrito, valores_deseados, tolerancia),
        "MAE_base": mae(deseado, base),
        "MSE_base": mse(deseado, base),
        "RMSE_base": rmse(deseado, base),
        "PSR_base": tasa_exito_prescriptivo(base, valores_deseados, tolerancia),
        "cambio_medio_por_accion": float(cambios.mean()),
        "generaciones_medias_ag": float(np.mean([r.generaciones for r in resultados])),
    }


def validacion_externa(
    X_entrenamiento: np.ndarray,
    clases_entrenamiento: np.ndarray,
    X_prueba: np.ndarray,
    clases_prueba: np.ndarray,
    X_base: np.ndarray,
    X_prescrito: np.ndarray,
    semilla: int | None = None,
    segmentos: dict[str, np.ndarray] | None = None,
    etiqueta_mejor: str = "H",
) -> dict:
    """Evalúa las prescripciones con un bosque aleatorio independiente del FCM.

    ``X_base`` y ``X_prescrito`` son los mismos estudiantes con sus acciones
    actuales y con las recomendadas; el resto de variables no cambia.
    ``segmentos`` ({nombre: máscara booleana sobre esos estudiantes}) añade el
    porcentaje clasificado en el mejor nivel dentro de cada segmento. En las
    claves, H designa el mejor nivel (``etiqueta_mejor``).
    """
    modelo = RandomForestClassifier(n_estimators=500, random_state=semilla, n_jobs=-1)
    modelo.fit(X_entrenamiento, clases_entrenamiento)
    if etiqueta_mejor not in modelo.classes_:
        raise ValueError(f"El entrenamiento no tiene registros del mejor nivel ({etiqueta_mejor}).")
    indice_h = list(modelo.classes_).index(etiqueta_mejor)
    es_h_base = modelo.predict(X_base) == etiqueta_mejor
    es_h_prescrito = modelo.predict(X_prescrito) == etiqueta_mejor
    return {
        "exactitud_prueba": float(modelo.score(X_prueba, clases_prueba)),
        "PSR_externo_base": float(100.0 * np.mean(es_h_base)),
        "PSR_externo": float(100.0 * np.mean(es_h_prescrito)),
        "prob_H_base": float(modelo.predict_proba(X_base)[:, indice_h].mean()),
        "prob_H_prescrita": float(modelo.predict_proba(X_prescrito)[:, indice_h].mean()),
        "por_segmento": {
            nombre: {
                "n": int(mascara.sum()),
                "PSR_externo_base": float(100.0 * np.mean(es_h_base[mascara])),
                "PSR_externo": float(100.0 * np.mean(es_h_prescrito[mascara])),
            }
            for nombre, mascara in (segmentos or {}).items()
            if mascara.any()
        },
    }
