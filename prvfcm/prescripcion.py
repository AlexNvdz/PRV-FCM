"""
Etapa 3: optimización prescriptiva PRV-FCM con algoritmo genético.

Para cada estudiante, el AG busca los valores de los conceptos de acción
(C9-C12) que, tras la inferencia del FCM hasta la convergencia, acercan el
estado final al estado deseado de alto rendimiento académico.

Cromosoma: a = (a_C9, a_C10, a_C11, a_C12), un gen real por concepto de
acción, en escala normalizada [0, 1]. Los demás conceptos no forman parte del
cromosoma: los fijos conservan su valor y los dinámicos los calcula el FCM.

Función de costo (a minimizar):

    costo(a) = sum_i p_i * |A_i*(a) - D_i| / sum_i p_i  +  beta * media_k |a_k - a_k^actual|

* A*(a): estado de convergencia del FCM partiendo del estado actual del
  estudiante con las acciones sustituidas por a.
* D: estado deseado (por defecto rendimiento académico = 1, nivel H).
* p_i: importancia de cada concepto del estado deseado.
* beta: penalización opcional del esfuerzo. Con beta = 0 el costo es solo el
  error absoluto; con beta > 0, entre dos prescripciones con error similar se
  prefiere la que exige menos cambio.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

from .configuracion import ConfigAG, ConfigPrescripcion
from .fcm import MapaCognitivoDifuso
from .genetico import AlgoritmoGenetico


@dataclass
class ResultadoPrescripcion:
    """Prescripción para un estudiante (valores en escala normalizada)."""

    acciones_actuales: np.ndarray
    acciones_recomendadas: np.ndarray
    estado_base: np.ndarray       # Convergencia del FCM con las acciones actuales.
    estado_prescrito: np.ndarray  # Convergencia del FCM con las acciones recomendadas.
    error_base: float             # Error absoluto ponderado respecto al estado deseado.
    error_prescrito: float
    costo: float                  # Error + penalización de esfuerzo.
    historial_costo: np.ndarray   # Mejor costo por generación del AG.
    generaciones: int
    historial_promedio: np.ndarray | None = None  # Costo medio de la población por generación.


class PrescriptorPRVFCM:
    """Genera prescripciones de acciones con un FCM entrenado y un AG.

    Parameters
    ----------
    fcm:
        Mapa cognitivo difuso ya entrenado.
    indices_accion:
        Índices de los conceptos de acción (genes del cromosoma).
    estado_deseado:
        {índice de concepto: valor deseado normalizado}.
    pesos_objetivo:
        {índice de concepto: importancia}. Los conceptos ausentes pesan 1.
    config_ag, config:
        Hiperparámetros del AG y de la prescripción.
    """

    def __init__(
        self,
        fcm: MapaCognitivoDifuso,
        indices_accion: np.ndarray,
        estado_deseado: dict[int, float],
        pesos_objetivo: dict[int, float] | None = None,
        config_ag: ConfigAG = ConfigAG(),
        config: ConfigPrescripcion = ConfigPrescripcion(),
    ):
        self.fcm = fcm
        self.indices_accion = np.asarray(indices_accion, dtype=int)
        self.indices_objetivo = np.array(list(estado_deseado.keys()), dtype=int)
        self.valores_deseados = np.array(list(estado_deseado.values()), dtype=float)
        pesos_objetivo = pesos_objetivo or {}
        pesos = np.array([pesos_objetivo.get(int(i), 1.0) for i in self.indices_objetivo], dtype=float)
        self.pesos_objetivo = pesos / pesos.sum()
        self.config_ag = config_ag
        self.config = config

    def limites(self, acciones_actuales: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Límites de cada gen según las restricciones de la prescripción."""
        inferior = acciones_actuales.copy() if self.config.solo_incrementos else np.zeros_like(acciones_actuales)
        superior = np.ones_like(acciones_actuales)
        if self.config.delta_max is not None:
            inferior = np.maximum(inferior, acciones_actuales - self.config.delta_max)
            superior = np.minimum(superior, acciones_actuales + self.config.delta_max)
        return inferior, superior

    def error_objetivo(self, estados_finales: np.ndarray) -> np.ndarray:
        """Error absoluto ponderado entre estados finales y estado deseado."""
        estados_finales = np.atleast_2d(estados_finales)
        diferencias = np.abs(estados_finales[:, self.indices_objetivo] - self.valores_deseados)
        return diferencias @ self.pesos_objetivo

    def _estados_con_acciones(self, estado_actual: np.ndarray, acciones: np.ndarray) -> np.ndarray:
        """Copia el estado actual una vez por individuo y sustituye las acciones."""
        estados = np.repeat(estado_actual[None, :], len(acciones), axis=0)
        estados[:, self.indices_accion] = acciones
        return estados

    def funcion_costo(self, estado_actual: np.ndarray):
        """Función de costo vectorizada del AG para un estudiante concreto."""
        acciones_actuales = estado_actual[self.indices_accion]

        def costo(poblacion: np.ndarray) -> np.ndarray:
            finales = self.fcm.inferir(self._estados_con_acciones(estado_actual, poblacion)).estados
            esfuerzo = np.mean(np.abs(poblacion - acciones_actuales), axis=1)
            return self.error_objetivo(finales) + self.config.beta_esfuerzo * esfuerzo

        return costo

    def prescribir(self, estado_actual: np.ndarray, rng: np.random.Generator | None = None) -> ResultadoPrescripcion:
        """Ejecuta el AG para un estudiante y devuelve la mejor prescripción."""
        estado_actual = np.asarray(estado_actual, dtype=float)
        acciones_actuales = estado_actual[self.indices_accion]
        inferior, superior = self.limites(acciones_actuales)

        ag = AlgoritmoGenetico(self.funcion_costo(estado_actual), inferior, superior, self.config_ag, rng)
        # Las acciones actuales se siembran en la población inicial: con elitismo,
        # la prescripción nunca es peor que mantener la situación actual.
        resultado = ag.ejecutar(semillas=acciones_actuales)

        recomendadas = resultado.mejor_cromosoma
        estado_nuevo = estado_actual.copy()
        estado_nuevo[self.indices_accion] = recomendadas
        estado_base = self.fcm.inferir(estado_actual).estados
        estado_prescrito = self.fcm.inferir(estado_nuevo).estados
        return ResultadoPrescripcion(
            acciones_actuales=acciones_actuales,
            acciones_recomendadas=recomendadas,
            estado_base=estado_base,
            estado_prescrito=estado_prescrito,
            error_base=float(self.error_objetivo(estado_base)[0]),
            error_prescrito=float(self.error_objetivo(estado_prescrito)[0]),
            costo=resultado.mejor_costo,
            historial_costo=resultado.historial_mejor,
            generaciones=resultado.generaciones,
            historial_promedio=resultado.historial_promedio,
        )

    def prescribir_lote(
        self,
        estados_actuales: np.ndarray,
        semilla: int | None = None,
        mostrar_progreso: bool = True,
        al_avanzar: Callable[[int, int], None] | None = None,
    ) -> list[ResultadoPrescripcion]:
        """Prescribe para varios estudiantes con semillas independientes y reproducibles.

        ``al_avanzar(hechos, total)`` se llama después de cada estudiante.
        """
        semillas = np.random.SeedSequence(semilla).spawn(len(estados_actuales))
        paso = max(10, len(estados_actuales) // 10)  # Unas diez líneas de progreso como máximo.
        resultados = []
        for i, (estado, semilla_i) in enumerate(zip(estados_actuales, semillas), start=1):
            resultados.append(self.prescribir(estado, np.random.default_rng(semilla_i)))
            if mostrar_progreso and (i % paso == 0 or i == len(estados_actuales)):
                print(f"  prescripciones completadas: {i}/{len(estados_actuales)}")
            if al_avanzar is not None:
                al_avanzar(i, len(estados_actuales))
        return resultados
