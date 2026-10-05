"""
Etapa 2 (selección de modelo): validación cruzada de los hiperparámetros del FCM.

Como en PRV-FCM (Hoyos et al., 2023) y en García et al. (2025), los
hiperparámetros se eligen con validación cruzada de k pliegues sobre el
conjunto de entrenamiento; el conjunto de prueba no interviene. Con la regla de
Kosko modificada y la sigmoide fijas, se evalúan la pendiente ``lambda`` y la
regularización L2 del aprendizaje de pesos.

Los pliegues son estratificados por el nivel del objetivo y agrupados por
perfil inmutable (C1-C8): un perfil nunca está a la vez en entrenamiento y en
validación. En cada pliegue el preprocesador se ajusta de nuevo, porque la
codificación nominal usa el objetivo.

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
from sklearn.metrics import balanced_accuracy_score
from sklearn.model_selection import StratifiedGroupKFold

from .configuracion import ESQUEMA_XAPI, ConfigFCM, ConfigSeleccion, Esquema
from .evaluacion import discretizar_rendimiento, mae
from .fcm import con_dinamicos_neutros, entrenar_fcm, pesos_equilibrados
from .preprocesamiento import Preprocesador, etiquetas_objetivo


def validacion_cruzada_fcm(
    datos: pd.DataFrame,
    grupos: np.ndarray,
    esquema: Esquema = ESQUEMA_XAPI,
    config_fcm: ConfigFCM = ConfigFCM(),
    config: ConfigSeleccion = ConfigSeleccion(),
    semilla: int | None = None,
    al_avanzar: Callable[[int, int], None] | None = None,
    aristas_excluidas: np.ndarray | None = None,
) -> pd.DataFrame:
    """Exactitud y MAE de validación para cada combinación (lambda, alpha_l2).

    Devuelve una fila por combinación, ordenada de mejor a peor: la primera es
    la configuración elegida. ``al_avanzar(hechos, total)`` se llama tras cada
    ajuste (pliegues x combinaciones). El método de pesos es el de
    ``config_fcm`` y ``aristas_excluidas`` la máscara causal (ver ``entrenar_fcm``).
    """
    combinaciones = list(product(config.rejilla_lambda, config.rejilla_alpha))
    total, hechos = config.pliegues * len(combinaciones), 0
    pliegues = StratifiedGroupKFold(n_splits=config.pliegues, shuffle=True, random_state=semilla)
    registros = []
    for i_ent, i_val in pliegues.split(datos, etiquetas_objetivo(datos, esquema), groups=grupos):
        entrenamiento, validacion = datos.iloc[i_ent], datos.iloc[i_val]
        pre = Preprocesador(esquema).ajustar(entrenamiento)
        X_ent, X_val = pre.transformar(entrenamiento), pre.transformar(validacion)
        dinamicos, objetivo = pre.indices_dinamicos, pre.indice_objetivo
        real = X_val[:, objetivo]
        pesos_muestras = pesos_equilibrados(pre.etiquetas(entrenamiento)) if config_fcm.balancear_niveles else None
        for lambda_, alpha in combinaciones:
            cfg = replace(config_fcm, lambda_=lambda_, alpha_l2=alpha)
            fcm, medias = entrenar_fcm(
                X_ent, pre.indices_fijos, dinamicos, objetivo, cfg, aristas_excluidas=aristas_excluidas, pesos_muestras=pesos_muestras
            )
            predicho = fcm.predecir(con_dinamicos_neutros(X_val, dinamicos, medias))[:, objetivo]
            nivel_real = discretizar_rendimiento(real, esquema.niveles)
            nivel_predicho = discretizar_rendimiento(predicho, esquema.niveles)
            registro = {"lambda": lambda_, "alpha_l2": alpha, "exactitud": float(np.mean(nivel_real == nivel_predicho)), "MAE": mae(real, predicho)}
            if config_fcm.balancear_niveles:
                registro["exactitud_equilibrada"] = float(balanced_accuracy_score(nivel_real, nivel_predicho))
            registros.append(registro)
            hechos += 1
            if al_avanzar is not None:
                al_avanzar(hechos, total)
    agregados = {"exactitud": ("exactitud", "mean"), "exactitud_de": ("exactitud", "std"), "MAE": ("MAE", "mean")}
    criterio = "exactitud"
    if config_fcm.balancear_niveles:
        # Con niveles equilibrados se elige por la media del recall de cada nivel: la exactitud
        # simple premiaría predecir siempre el nivel frecuente.
        agregados["exactitud_equilibrada"] = ("exactitud_equilibrada", "mean")
        criterio = "exactitud_equilibrada"
    tabla = pd.DataFrame(registros).groupby(["lambda", "alpha_l2"], as_index=False).agg(**agregados)
    return tabla.sort_values([criterio, "MAE"], ascending=[False, True], ignore_index=True)
