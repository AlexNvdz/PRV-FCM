"""
Etapa 3 (motor de búsqueda): algoritmo genético de codificación real.

Cada individuo es un vector de genes reales acotados por gen a
[limite_inferior, limite_superior]. Operadores:

* Selección por torneo de tamaño k.
* Cruce uniforme o de un punto, aplicado a cada pareja con probabilidad ``tasa_cruce``.
* Mutación gaussiana por gen con probabilidad ``tasa_mutacion`` y desviación
  ``sigma_mutacion * (limite_superior - limite_inferior)``; el resultado se
  recorta a los límites.
* Elitismo: los mejores individuos pasan intactos a la siguiente generación.
* Parada temprana si el mejor costo no mejora en ``paciencia`` generaciones.

El AG minimiza una función de costo vectorizada: recibe la población completa
(n_individuos, n_genes) y devuelve un costo por individuo. Al terminar cada
generación puede avisar a quien lo ejecuta (``al_generar``), por ejemplo para
mostrar el progreso en vivo desde un servicio web.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

from .configuracion import ConfigAG

TIPOS_CRUCE = ("uniforme", "un_punto")


@dataclass
class ResultadoAG:
    """Salida de una ejecución del algoritmo genético."""

    mejor_cromosoma: np.ndarray
    mejor_costo: float
    historial_mejor: np.ndarray     # Mejor costo al final de cada generación.
    historial_promedio: np.ndarray  # Costo medio de la población en cada generación.
    generaciones: int               # Generaciones ejecutadas (puede ser < máximo).
    historial_cromosoma: np.ndarray | None = None  # Mejor individuo de cada generación (generaciones, n_genes).


class AlgoritmoGenetico:
    """Algoritmo genético generacional con elitismo para minimización.

    Parameters
    ----------
    funcion_costo:
        Función vectorizada ``costos = funcion_costo(poblacion)``.
    limite_inferior, limite_superior:
        Límites de cada gen, vectores de longitud n_genes.
    config:
        Hiperparámetros (tamaño de población, tasas, tipo de cruce, ...).
    rng:
        Generador aleatorio de NumPy (reproducibilidad).
    """

    def __init__(
        self,
        funcion_costo: Callable[[np.ndarray], np.ndarray],
        limite_inferior: np.ndarray,
        limite_superior: np.ndarray,
        config: ConfigAG = ConfigAG(),
        rng: np.random.Generator | None = None,
    ):
        if config.tipo_cruce not in TIPOS_CRUCE:
            raise ValueError(f"tipo_cruce debe ser uno de {TIPOS_CRUCE}, no '{config.tipo_cruce}'.")
        if config.elitismo >= config.tam_poblacion:
            raise ValueError("elitismo debe ser menor que tam_poblacion.")
        if config.generaciones < 1 or config.tam_torneo < 1:
            raise ValueError("generaciones y tam_torneo deben ser >= 1.")
        self.funcion_costo = funcion_costo
        self.limite_inferior = np.asarray(limite_inferior, dtype=float)
        self.limite_superior = np.asarray(limite_superior, dtype=float)
        if np.any(self.limite_inferior > self.limite_superior):
            raise ValueError("Cada límite inferior debe ser <= al límite superior.")
        self.n_genes = self.limite_inferior.size
        self.config = config
        self.rng = rng if rng is not None else np.random.default_rng()

    # ------------------------------------------------------------------
    # Operadores genéticos
    # ------------------------------------------------------------------
    def inicializar_poblacion(self, semillas: np.ndarray | None = None) -> np.ndarray:
        """Población uniforme dentro de los límites; incluye los individuos semilla."""
        poblacion = self.rng.uniform(
            self.limite_inferior, self.limite_superior, size=(self.config.tam_poblacion, self.n_genes)
        )
        if semillas is not None:
            semillas = np.atleast_2d(semillas)[: self.config.tam_poblacion]
            poblacion[: len(semillas)] = np.clip(semillas, self.limite_inferior, self.limite_superior)
        return poblacion

    def seleccion_torneo(self, costos: np.ndarray, n_seleccionados: int) -> np.ndarray:
        """Índices de los ganadores de ``n_seleccionados`` torneos de tamaño k."""
        k = min(self.config.tam_torneo, costos.size)
        candidatos = self.rng.integers(0, costos.size, size=(n_seleccionados, k))
        ganador = np.argmin(costos[candidatos], axis=1)
        return candidatos[np.arange(n_seleccionados), ganador]

    def cruzar(self, padres: np.ndarray) -> np.ndarray:
        """Cruza parejas consecutivas (0-1, 2-3, ...). Devuelve dos hijos por pareja."""
        p1, p2 = padres[0::2], padres[1::2]
        n_parejas = p1.shape[0]
        if self.config.tipo_cruce == "uniforme":
            # Cada gen se intercambia con probabilidad 0.5.
            intercambio = self.rng.random((n_parejas, self.n_genes)) < 0.5
        else:
            # Un punto: se intercambian los genes a partir de un corte aleatorio.
            if self.n_genes < 2:
                intercambio = np.zeros((n_parejas, self.n_genes), dtype=bool)
            else:
                cortes = self.rng.integers(1, self.n_genes, size=n_parejas)
                intercambio = np.arange(self.n_genes)[None, :] >= cortes[:, None]
        # Solo cruzan las parejas seleccionadas con probabilidad tasa_cruce.
        intercambio &= (self.rng.random(n_parejas) < self.config.tasa_cruce)[:, None]
        hijo1 = np.where(intercambio, p2, p1)
        hijo2 = np.where(intercambio, p1, p2)
        return np.concatenate([hijo1, hijo2])

    def mutar(self, individuos: np.ndarray) -> np.ndarray:
        """Mutación gaussiana por gen, recortada a los límites."""
        rango = self.limite_superior - self.limite_inferior
        muta = self.rng.random(individuos.shape) < self.config.tasa_mutacion
        ruido = self.rng.normal(0.0, self.config.sigma_mutacion, individuos.shape) * rango
        return np.clip(individuos + muta * ruido, self.limite_inferior, self.limite_superior)

    # ------------------------------------------------------------------
    # Ciclo evolutivo
    # ------------------------------------------------------------------
    def ejecutar(
        self,
        semillas: np.ndarray | None = None,
        al_generar: Callable[[int, float, float, np.ndarray], None] | None = None,
    ) -> ResultadoAG:
        """Evoluciona la población y devuelve el mejor individuo encontrado.

        ``al_generar(generacion, mejor_costo, costo_medio, mejor_cromosoma)`` se
        llama al final de cada generación. No consume números aleatorios: con o
        sin él, la misma semilla da el mismo resultado.
        """
        cfg = self.config
        poblacion = self.inicializar_poblacion(semillas)
        costos = self.funcion_costo(poblacion)

        historial_mejor, historial_promedio, historial_cromosoma = [], [], []
        mejor_costo, sin_mejora = np.inf, 0
        n_hijos = cfg.tam_poblacion - cfg.elitismo

        for generacion in range(1, cfg.generaciones + 1):
            # Elitismo: los mejores pasan directamente.
            orden = np.argsort(costos)
            elite = poblacion[orden[: cfg.elitismo]]
            costos_elite = costos[orden[: cfg.elitismo]]

            # Selección -> cruce -> mutación.
            n_padres = n_hijos + (n_hijos % 2)
            padres = poblacion[self.seleccion_torneo(costos, n_padres)]
            hijos = self.mutar(self.cruzar(padres))[:n_hijos]

            poblacion = np.concatenate([elite, hijos])
            costos = np.concatenate([costos_elite, self.funcion_costo(hijos)])

            indice_mejor = int(np.argmin(costos))
            mejor_generacion = float(costos[indice_mejor])
            historial_mejor.append(mejor_generacion)
            historial_promedio.append(float(costos.mean()))
            historial_cromosoma.append(poblacion[indice_mejor].copy())
            if al_generar is not None:
                al_generar(generacion, mejor_generacion, historial_promedio[-1], historial_cromosoma[-1])

            if mejor_generacion < mejor_costo - 1e-9:
                mejor_costo, sin_mejora = mejor_generacion, 0
            else:
                sin_mejora += 1
            if sin_mejora >= cfg.paciencia:
                break

        mejor = int(np.argmin(costos))
        return ResultadoAG(
            mejor_cromosoma=poblacion[mejor].copy(),
            mejor_costo=float(costos[mejor]),
            historial_mejor=np.array(historial_mejor),
            historial_promedio=np.array(historial_promedio),
            generaciones=generacion,
            historial_cromosoma=np.array(historial_cromosoma),
        )
