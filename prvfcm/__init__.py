"""PRV-FCM: Mapas Cognitivos Difusos prescriptivos con algoritmos genéticos.

Módulos:

* ``configuracion``    conceptos del FCM e hiperparámetros.
* ``preprocesamiento`` carga (CSV o Excel), división agrupada, codificación, Min-Max y segmentación.
* ``fcm``              inferencia (Kosko modificada con memoria) y extracción de pesos
                       (BPTT, Ridge, Lasso o correlación parcial) con máscara causal opcional.
* ``seleccion``        validación cruzada agrupada de lambda y alpha_l2.
* ``genetico``         algoritmo genético (torneo, cruce uniforme/un punto, mutación).
* ``prescripcion``     función de costo y prescripción por estudiante.
* ``evaluacion``       MAE, RMSE, PSR y validaciones complementarias.
* ``reporte``          reporte prescriptivo en lenguaje natural.
* ``visualizacion``    gráficas de resultados y grafo del mapa con NetworkX.
* ``pipeline``         las cuatro etapas en una función (consola y aplicación).
* ``esquema``, ``perfilado``, ``modelo``, ``servicio``  motor de la aplicación web.
"""
