"""
Etapa 2 (selección de modelo): validación cruzada de los hiperparámetros del FCM.

Como en PRV-FCM (Hoyos et al., 2023) y en García et al. (2025), los
hiperparámetros se eligen con validación cruzada de k pliegues sobre el
conjunto de entrenamiento; el conjunto de prueba no interviene. Se evalúan la
pendiente ``lambda``, la regularización L2 del aprendizaje de pesos y, si sus
rejillas tienen más de un valor, la regla de inferencia y la activación (Tabla
2 de PRV-FCM). Con tanh, la reescalada coincide con Kosko modificada: ese par
no se evalúa.

Los pliegues son estratificados por el nivel del objetivo y agrupados por
perfil inmutable (C1-C8): un perfil nunca está a la vez en entrenamiento y en
validación. En cada pliegue el preprocesador se ajusta de nuevo, porque la
codificación nominal usa el objetivo, y SMOTE (si se pide) se aplica solo a su
entrenamiento. Los ajustes (pliegue x combinación) corren en paralelo.

Criterio: mayor exactitud media del rendimiento discretizado (L/M/H); a igual
exactitud, menor MAE. Si el FCM equilibra los niveles (``balancear_niveles``),
el criterio es la exactitud equilibrada: la media del recall de cada nivel.
"""
from __future__ import annotations

from dataclasses import replace
from itertools import product
from typing import Callable

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.metrics import balanced_accuracy_score
from sklearn.model_selection import StratifiedGroupKFold

from .configuracion import ESQUEMA_XAPI, ConfigFCM, ConfigSeleccion, Esquema
from .evaluacion import discretizar_rendimiento, mae
from .fcm import con_dinamicos_neutros, entrenar_fcm, pesos_equilibrados
from .preprocesamiento import Preprocesador, etiquetas_objetivo, smote


def combinaciones(config: ConfigSeleccion) -> list[dict]:
    """Combinaciones de la rejilla; activación e inferencia solo aparecen si alguna de sus rejillas tiene varios valores."""
    con_regla = len(config.rejilla_activacion) > 1 or len(config.rejilla_inferencia) > 1
    salida = []
    for activacion, inferencia in product(config.rejilla_activacion, config.rejilla_inferencia):
        # Con tanh la entrada ya es 2A - 1: la reescalada repetiría Kosko modificada.
        if activacion == "tanh" and inferencia == "reescalada" and "kosko_modificada" in config.rejilla_inferencia:
            continue
        for lambda_, alpha in product(config.rejilla_lambda, config.rejilla_alpha):
            regla = {"activacion": activacion, "inferencia": inferencia} if con_regla else {}
            salida.append({**regla, "lambda": lambda_, "alpha_l2": alpha})
    return salida


def configuracion_de(config_fcm: ConfigFCM, combinacion: dict) -> ConfigFCM:
    """``config_fcm`` con los valores de una combinación de la rejilla."""
    cambios = {"lambda_": float(combinacion["lambda"]), "alpha_l2": float(combinacion["alpha_l2"])}
    for clave in ("activacion", "inferencia"):
        if clave in combinacion:
            cambios[clave] = str(combinacion[clave])
    return replace(config_fcm, **cambios)


def _ajustar_y_validar(pliegue: dict, config_fcm: ConfigFCM, combinacion: dict, niveles: dict, balancear: bool,
                       aristas_excluidas, semilla, pesos_expertos) -> dict:
    """Un ajuste de la validación cruzada: entrena con el pliegue y mide en su validación."""
    dinamicos, objetivo = pliegue["dinamicos"], pliegue["objetivo"]
    fcm, medias = entrenar_fcm(
        pliegue["X_ent"], pliegue["fijos"], dinamicos, objetivo, configuracion_de(config_fcm, combinacion),
        aristas_excluidas=aristas_excluidas, pesos_muestras=pliegue["pesos_muestras"], semilla=semilla,
        pesos_expertos=pesos_expertos,
    )
    X_val = pliegue["X_val"]
    real = X_val[:, objetivo]
    predicho = fcm.predecir(con_dinamicos_neutros(X_val, dinamicos, medias))[:, objetivo]
    nivel_real = discretizar_rendimiento(real, niveles)
    nivel_predicho = discretizar_rendimiento(predicho, niveles)
    registro = {**combinacion, "exactitud": float(np.mean(nivel_real == nivel_predicho)), "MAE": mae(real, predicho)}
    if balancear:
        registro["exactitud_equilibrada"] = float(balanced_accuracy_score(nivel_real, nivel_predicho))
    return registro


def validacion_cruzada_fcm(
    datos: pd.DataFrame,
    grupos: np.ndarray,
    esquema: Esquema = ESQUEMA_XAPI,
    config_fcm: ConfigFCM = ConfigFCM(),
    config: ConfigSeleccion = ConfigSeleccion(),
    semilla: int | None = None,
    al_avanzar: Callable[[int, int], None] | None = None,
    aristas_excluidas: np.ndarray | None = None,
    usar_smote: bool = False,
    pesos_expertos: np.ndarray | None = None,
) -> pd.DataFrame:
    """Exactitud y MAE de validación para cada combinación de la rejilla.

    Devuelve una fila por combinación, ordenada de mejor a peor: la primera es
    la configuración elegida. ``al_avanzar(hechos, total)`` se llama tras cada
    ajuste (pliegues x combinaciones). El método de pesos es el de
    ``config_fcm``, ``aristas_excluidas`` la máscara causal y ``pesos_expertos``
    la W de expertos (ver ``entrenar_fcm``). Con ``usar_smote`` el
    entrenamiento de cada pliegue se equilibra con SMOTE.
    """
    rejilla = combinaciones(config)
    claves = [c for c in ("activacion", "inferencia") if c in rejilla[0]] + ["lambda", "alpha_l2"]
    pliegues = []
    divisor = StratifiedGroupKFold(n_splits=config.pliegues, shuffle=True, random_state=semilla)
    for i_ent, i_val in divisor.split(datos, etiquetas_objetivo(datos, esquema), groups=grupos):
        entrenamiento, validacion = datos.iloc[i_ent], datos.iloc[i_val]
        pre = Preprocesador(esquema).ajustar(entrenamiento)
        X_ent, etiquetas = pre.transformar(entrenamiento), pre.etiquetas(entrenamiento)
        if usar_smote:
            X_ent, etiquetas = smote(X_ent, etiquetas, semilla=semilla)
        pliegues.append(
            {
                "X_ent": X_ent,
                "X_val": pre.transformar(validacion),
                "fijos": pre.indices_fijos,
                "dinamicos": pre.indices_dinamicos,
                "objetivo": pre.indice_objetivo,
                "pesos_muestras": pesos_equilibrados(etiquetas) if config_fcm.balancear_niveles else None,
            }
        )
    if config_fcm.metodo_pesos == "pso" and config.pso_iteraciones:
        config_fcm = replace(config_fcm, pso_iteraciones=config.pso_iteraciones)
    tareas = [(pliegue, combinacion) for pliegue in pliegues for combinacion in rejilla]
    resultados = Parallel(n_jobs=config.trabajos, return_as="generator")(
        delayed(_ajustar_y_validar)(
            pliegue, config_fcm, combinacion, esquema.niveles, config_fcm.balancear_niveles, aristas_excluidas, semilla,
            pesos_expertos,
        )
        for pliegue, combinacion in tareas
    )
    registros = []
    for hechos, registro in enumerate(resultados, start=1):
        registros.append(registro)
        if al_avanzar is not None:
            al_avanzar(hechos, len(tareas))
    agregados = {"exactitud": ("exactitud", "mean"), "exactitud_de": ("exactitud", "std"), "MAE": ("MAE", "mean")}
    criterio = "exactitud"
    if config_fcm.balancear_niveles:
        # Con niveles equilibrados se elige por la media del recall de cada nivel: la exactitud
        # simple premiaría predecir siempre el nivel frecuente.
        agregados["exactitud_equilibrada"] = ("exactitud_equilibrada", "mean")
        criterio = "exactitud_equilibrada"
    tabla = pd.DataFrame(registros).groupby(claves, as_index=False, sort=True).agg(**agregados)
    return tabla.sort_values([criterio, "MAE"], ascending=[False, True], ignore_index=True)
