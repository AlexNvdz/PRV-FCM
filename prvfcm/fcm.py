"""
Etapa 2: Inferencia difusa con Mapas Cognitivos Difusos (FCM).

Regla de Kosko modificada, con memoria (Stylios y Groumpos, 2004):

    A_i(t+1) = f( k2 * A_i(t) + k1 * sum_{j != i} w_ji * A_j(t) )

con activación sigmoide f(x) = 1 / (1 + exp(-lambda * x)). El término
``k2 * A_i(t)`` es la memoria: cada concepto conserva parte de su estado previo.

Convención de pesos: ``pesos[j, i] = w_ji`` es la influencia causal del concepto
j sobre el concepto i. Con los estados como filas, la regla queda:

    A(t+1) = f( k2 * A(t) + k1 * A(t) @ W )

Los conceptos fijos (inmutables, acciones y mutables no dinámicos) conservan su
valor durante la inferencia (clamped); solo los conceptos dinámicos se
actualizan, hasta que max |A(t+1) - A(t)| < tolerancia o se alcanza el máximo
de iteraciones.

Extracción de la matriz de pesos W (n x n) con los datos normalizados; solo se
estiman las aristas que permite la estructura (y la máscara causal opcional):

* ``bptt`` (por defecto): minimiza el error cuadrático del estado final de la
  inferencia más una penalización L2, con gradiente exacto (BPTT) y L-BFGS-B
  con los pesos acotados a [-1, 1].
* ``ridge`` y ``lasso``: regresión lineal regularizada, una por concepto
  dinámico. Su valor observado y es un punto fijo de la regla si
  sum_j w_ji A_j = (logit(y) / lambda - k2 * y) / k1; ese es el objetivo de la
  regresión. Los coeficientes se truncan a (-1, 1) con la tangente hiperbólica.
* ``correlacion_parcial``: w_ji es la correlación parcial entre C_j y C_i
  dados los demás conceptos (ya está en [-1, 1]). Describe asociaciones
  directas, pero no calibra la inferencia.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scipy.special import expit, logit
from sklearn.covariance import LedoitWolf
from sklearn.linear_model import Lasso, Ridge

from .configuracion import ConfigFCM

METODOS_PESOS = ("bptt", "ridge", "lasso", "correlacion_parcial")

# La regresión lleva el valor observado a [margen, 1 - margen] antes del logit,
# que es infinito en 0 y en 1. Con 0.05 la exactitud en xAPI es la más alta.
MARGEN_REGRESION = 0.05


def sigmoide(x: np.ndarray, lambda_: float = 1.0) -> np.ndarray:
    """f(x) = 1 / (1 + exp(-lambda * x)), evaluada de forma numéricamente estable."""
    return expit(lambda_ * np.asarray(x, dtype=float))


def construir_estructura(
    n_conceptos: int,
    indices_fijos: np.ndarray,
    indices_dinamicos: np.ndarray,
    indice_objetivo: int,
) -> np.ndarray:
    """Máscara de aristas permitidas: ``estructura[j, i]`` es True si existe C_j -> C_i.

    * Los conceptos fijos influyen sobre todos los conceptos dinámicos.
    * Los dinámicos se influyen entre sí, sin autoconexión: la memoria ya está
      incluida en la regla de Kosko modificada.
    * El concepto objetivo (rendimiento académico) es un concepto de decisión:
      recibe influencias pero no tiene aristas salientes.
    * Ningún concepto influye sobre los fijos: su valor es exógeno.
    """
    fuentes = np.concatenate(
        [np.asarray(indices_fijos), [d for d in indices_dinamicos if d != indice_objetivo]]
    ).astype(int)
    estructura = np.zeros((n_conceptos, n_conceptos), dtype=bool)
    estructura[np.ix_(fuentes, np.asarray(indices_dinamicos, dtype=int))] = True
    np.fill_diagonal(estructura, False)
    return estructura


@dataclass
class ResultadoInferencia:
    """Salida de una inferencia del FCM."""

    estados: np.ndarray                            # Estado final: (n_conceptos,) o (n, n_conceptos).
    iteraciones: int                               # Iteraciones realizadas.
    convergio: bool                                # True si max |A(t+1) - A(t)| < tolerancia.
    trayectoria: list[np.ndarray] | None = None    # A(0), A(1), ..., A(T) si se solicitó.


class MapaCognitivoDifuso:
    """FCM con regla de Kosko modificada y activación sigmoide.

    Parameters
    ----------
    estructura:
        Máscara booleana (n, n) de aristas causales permitidas (ver
        :func:`construir_estructura`). Solo esos pesos se aprenden.
    indices_fijos:
        Conceptos que no se actualizan durante la inferencia.
    config:
        Hiperparámetros de inferencia y aprendizaje.
    nombres:
        Nombres de los conceptos (para reportes).
    """

    def __init__(
        self,
        estructura: np.ndarray,
        indices_fijos: np.ndarray,
        config: ConfigFCM = ConfigFCM(),
        nombres: list[str] | None = None,
    ):
        self.estructura = np.asarray(estructura, dtype=bool)
        self.n_conceptos = self.estructura.shape[0]
        self.indices_fijos = np.asarray(indices_fijos, dtype=int)
        es_libre = np.ones(self.n_conceptos, dtype=bool)
        es_libre[self.indices_fijos] = False
        self.indices_libres = np.flatnonzero(es_libre)
        self.config = config
        self.nombres = nombres or [f"C{i + 1}" for i in range(self.n_conceptos)]
        self.pesos = np.zeros((self.n_conceptos, self.n_conceptos))
        self.historial_perdida: list[float] = []
        self.resultado_optimizacion = None

    # ------------------------------------------------------------------
    # Inferencia
    # ------------------------------------------------------------------
    def inferir(
        self,
        estado_inicial: np.ndarray,
        max_iter: int | None = None,
        hasta_convergencia: bool = True,
        guardar_trayectoria: bool = False,
        pesos: np.ndarray | None = None,
    ) -> ResultadoInferencia:
        """Ejecuta la regla de Kosko modificada sobre uno o varios estados iniciales.

        Parameters
        ----------
        estado_inicial:
            Vector (n_conceptos,) o matriz (n, n_conceptos) con activaciones en [0, 1].
            Los conceptos fijos conservan su valor inicial durante toda la inferencia.
        max_iter:
            Iteraciones máximas (por defecto ``config.max_iter``).
        hasta_convergencia:
            Si es True, se detiene cuando max |A(t+1) - A(t)| < ``config.tolerancia``.
            Si es False, realiza exactamente ``max_iter`` iteraciones.
        guardar_trayectoria:
            Si es True, devuelve todos los estados intermedios.
        pesos:
            Matriz de pesos alternativa (por defecto ``self.pesos``).
        """
        cfg = self.config
        es_vector = np.ndim(estado_inicial) == 1
        A = np.atleast_2d(np.asarray(estado_inicial, dtype=float)).copy()
        W = self.pesos if pesos is None else pesos
        libres = self.indices_libres
        W_libres = W[:, libres]
        max_iter = cfg.max_iter if max_iter is None else max_iter

        trayectoria = [A.copy()] if guardar_trayectoria else None
        cambio, iteraciones = np.inf, 0
        for iteraciones in range(1, max_iter + 1):
            x = cfg.coef_memoria * A[:, libres] + cfg.coef_influencia * (A @ W_libres)
            nuevos = sigmoide(x, cfg.lambda_)
            cambio = float(np.max(np.abs(nuevos - A[:, libres]))) if libres.size else 0.0
            A[:, libres] = nuevos
            if guardar_trayectoria:
                trayectoria.append(A.copy())
            if hasta_convergencia and cambio < cfg.tolerancia:
                break

        estados = A[0] if es_vector else A
        return ResultadoInferencia(estados, iteraciones, cambio < cfg.tolerancia, trayectoria)

    def predecir(self, estados_iniciales: np.ndarray) -> np.ndarray:
        """Estado de convergencia para cada estado inicial."""
        return self.inferir(estados_iniciales).estados

    # ------------------------------------------------------------------
    # Aprendizaje de los pesos a partir de datos
    # ------------------------------------------------------------------
    def _perdida_y_gradiente(
        self, theta: np.ndarray, A0: np.ndarray, Y: np.ndarray, c: np.ndarray, v: np.ndarray | None = None
    ) -> tuple[float, np.ndarray]:
        """Pérdida (MSE ponderado + L2) y su gradiente exacto por BPTT.

        Se despliegan ``config.pasos_entrenamiento`` iteraciones de la regla y se
        retropropaga el error a través de ellas:

            x_t = k2 * A_t[:, M] + k1 * A_t @ W[:, M]
            A_{t+1}[:, M] = f(x_t)
            dL/dx_t = dL/dA_{t+1}[:, M] * lambda * A_{t+1} * (1 - A_{t+1})
            dL/dW[:, M] += k1 * A_t^T @ dL/dx_t
            dL/dA_t[:, M] = dL/dx_t @ (k2 * I + k1 * W[M, M]^T)

        donde M son los conceptos dinámicos (los fijos no dependen de W). ``v``
        pondera cada registro (media 1); sin ``v`` todos pesan lo mismo.
        """
        cfg = self.config
        libres = self.indices_libres
        W = np.zeros_like(self.pesos)
        W[self.estructura] = theta
        W_libres = W[:, libres]
        W_mm = W[np.ix_(libres, libres)]

        estados = [A0]
        A = A0
        for _ in range(cfg.pasos_entrenamiento):
            x = cfg.coef_memoria * A[:, libres] + cfg.coef_influencia * (A @ W_libres)
            A = A.copy()
            A[:, libres] = sigmoide(x, cfg.lambda_)
            estados.append(A)

        n = A0.shape[0]
        error = estados[-1][:, libres] - Y
        if v is not None:
            error_ponderado = v[:, None] * error
            perdida = float(np.sum(c * np.mean(error_ponderado * error, axis=0)) + cfg.alpha_l2 * np.sum(theta**2))
            G = 2.0 * c * error_ponderado / n
        else:
            perdida = float(np.sum(c * np.mean(error**2, axis=0)) + cfg.alpha_l2 * np.sum(theta**2))
            G = 2.0 * c * error / n
        grad_libres = np.zeros_like(W_libres)
        for t in range(cfg.pasos_entrenamiento - 1, -1, -1):
            S = estados[t + 1][:, libres]
            D = G * cfg.lambda_ * S * (1.0 - S)
            grad_libres += cfg.coef_influencia * (estados[t].T @ D)
            G = cfg.coef_memoria * D + cfg.coef_influencia * (D @ W_mm.T)

        grad_W = np.zeros_like(W)
        grad_W[:, libres] = grad_libres
        grad = grad_W[self.estructura] + 2.0 * cfg.alpha_l2 * theta
        return perdida, grad

    def ajustar(
        self,
        estados_iniciales: np.ndarray,
        estados_objetivo: np.ndarray,
        pesos_conceptos: dict[int, float] | None = None,
        pesos_muestras: np.ndarray | None = None,
    ) -> "MapaCognitivoDifuso":
        """Aprende los pesos causales con datos de entrenamiento.

        Minimiza el error cuadrático medio entre el estado final de la
        inferencia y los valores observados de los conceptos dinámicos, con
        regularización L2, usando L-BFGS-B con los pesos acotados a
        [peso_min, peso_max].

        Parameters
        ----------
        estados_iniciales:
            Matriz (n, n_conceptos): conceptos fijos con sus valores observados y
            conceptos dinámicos con un valor neutro (p. ej. la media).
        estados_objetivo:
            Matriz (n, n_conceptos) con los valores observados.
        pesos_conceptos:
            Importancia de cada concepto dinámico en la pérdida {índice: peso}.
            Por defecto todos pesan 1.
        pesos_muestras:
            Importancia de cada registro (por ejemplo, ``pesos_equilibrados``).
            Por defecto todos pesan 1.
        """
        cfg = self.config
        A0 = np.asarray(estados_iniciales, dtype=float)
        Y = np.asarray(estados_objetivo, dtype=float)[:, self.indices_libres]
        pesos_conceptos = pesos_conceptos or {}
        c = np.array([pesos_conceptos.get(int(i), 1.0) for i in self.indices_libres], dtype=float)
        c = c / c.sum()
        v = None
        if pesos_muestras is not None:
            v = np.asarray(pesos_muestras, dtype=float)
            v = v / v.mean()

        self.historial_perdida = []

        def registrar(intermediate_result):
            self.historial_perdida.append(float(intermediate_result.fun))

        theta0 = self.pesos[self.estructura]
        resultado = minimize(
            self._perdida_y_gradiente,
            theta0,
            args=(A0, Y, c, v),
            jac=True,
            method="L-BFGS-B",
            bounds=[(cfg.peso_min, cfg.peso_max)] * theta0.size,
            options={"maxiter": cfg.max_iter_optimizador},
            callback=registrar,
        )
        self.pesos = np.zeros_like(self.pesos)
        self.pesos[self.estructura] = resultado.x
        self.resultado_optimizacion = resultado
        return self

    def matriz_pesos(self) -> pd.DataFrame:
        """Pesos como DataFrame (filas: origen, columnas: destino)."""
        return pd.DataFrame(self.pesos, index=self.nombres, columns=self.nombres)


def con_dinamicos_neutros(X: np.ndarray, indices_dinamicos: np.ndarray, valores: np.ndarray) -> np.ndarray:
    """Estado inicial para predecir: conceptos dinámicos en un valor neutro (media de entrenamiento)."""
    X0 = X.copy()
    X0[:, indices_dinamicos] = valores
    return X0


def pesos_equilibrados(etiquetas: np.ndarray) -> np.ndarray:
    """Peso de cada registro inverso a la frecuencia de su nivel: n / (k * n_nivel), con media 1.

    Con un objetivo desbalanceado (85 % "no deserta"), el error cuadrático
    empuja las activaciones hacia el nivel frecuente y el corte entre niveles
    deja de separar; así cada nivel pesa lo mismo en el aprendizaje de W.
    """
    etiquetas = np.asarray(etiquetas)
    _, inversa, conteos = np.unique(etiquetas, return_inverse=True, return_counts=True)
    pesos = len(etiquetas) / (len(conteos) * conteos[inversa])
    return pesos / pesos.mean()


def pesos_por_regresion(X: np.ndarray, estructura: np.ndarray, config: ConfigFCM, pesos_muestras: np.ndarray | None = None) -> np.ndarray:
    """Pesos por regresión Ridge o Lasso sin intercepto, una por concepto que recibe aristas.

    Para cada concepto dinámico i con fuentes S (aristas permitidas C_j -> C_i):

        z_i = (logit(y_i) / lambda - k2 * y_i) / k1,   y_i recortado a [margen, 1 - margen]
        Ridge:  min_w ||z_i - X_S w||^2 + alpha * n * ||w||^2   (MSE + alpha ||w||^2, la escala de BPTT)
        Lasso:  min_w ||z_i - X_S w||^2 / (2n) + alpha * ||w||_1
        w_ji = tanh(coeficiente_j)

    Con esos pesos, el valor observado de C_i es (por mínimos cuadrados) un
    punto fijo de la regla de Kosko modificada. La regla no tiene sesgo, por
    eso la regresión no lleva intercepto.
    """
    if config.metodo_pesos not in ("ridge", "lasso"):
        raise ValueError(f"pesos_por_regresion usa ridge o lasso, no {config.metodo_pesos}.")
    X = np.asarray(X, dtype=float)
    n = X.shape[0]
    pesos = np.zeros((X.shape[1], X.shape[1]))
    for i in np.flatnonzero(estructura.any(axis=0)):
        fuentes = np.flatnonzero(estructura[:, i])
        y = np.clip(X[:, i], MARGEN_REGRESION, 1.0 - MARGEN_REGRESION)
        z = (logit(y) / config.lambda_ - config.coef_memoria * y) / config.coef_influencia
        if config.metodo_pesos == "ridge":
            modelo = Ridge(alpha=config.alpha_l2 * n, fit_intercept=False)
        else:
            modelo = Lasso(alpha=config.alpha_l2, fit_intercept=False, max_iter=20_000)
        modelo.fit(X[:, fuentes], z, sample_weight=pesos_muestras)
        pesos[fuentes, i] = np.tanh(modelo.coef_)
    return pesos


def correlaciones_parciales(X: np.ndarray) -> np.ndarray:
    """Correlación parcial de cada par de columnas dadas las demás.

    rho_ji = -P_ji / sqrt(P_jj * P_ii), con P la inversa de la covarianza. La
    covarianza se estima con contracción de Ledoit-Wolf: sigue siendo invertible
    aunque haya columnas constantes o colineales (por ejemplo, indicadores one-hot).
    """
    precision = LedoitWolf().fit(np.asarray(X, dtype=float)).precision_
    escala = np.sqrt(np.diag(precision))
    parcial = -precision / np.outer(escala, escala)
    np.fill_diagonal(parcial, 1.0)
    return np.clip(parcial, -1.0, 1.0)


def pesos_por_correlacion_parcial(X: np.ndarray, estructura: np.ndarray) -> np.ndarray:
    """w_ji = correlación parcial entre C_j y C_i en las aristas permitidas; cero en el resto."""
    return np.where(estructura, correlaciones_parciales(X), 0.0)


def entrenar_fcm(
    X: np.ndarray,
    indices_fijos: np.ndarray,
    indices_dinamicos: np.ndarray,
    indice_objetivo: int,
    config: ConfigFCM = ConfigFCM(),
    nombres: list[str] | None = None,
    aristas_excluidas: np.ndarray | None = None,
    pesos_muestras: np.ndarray | None = None,
) -> tuple[MapaCognitivoDifuso, np.ndarray]:
    """Construye el FCM y aprende sus pesos con una matriz de entrenamiento.

    ``aristas_excluidas`` es la máscara de dirección causal opcional: una matriz
    booleana (n, n) en la que ``True`` en [j, i] elimina la arista C_j -> C_i
    aunque la estructura la permita. El método de extracción de pesos es
    ``config.metodo_pesos``. ``pesos_muestras`` pondera cada registro en BPTT,
    Ridge y Lasso (ver ``pesos_equilibrados``); la correlación parcial no los usa.

    Los conceptos dinámicos parten de su media en ``X``. Devuelve el FCM y esas
    medias, que son el estado inicial neutro para predecir con datos nuevos.
    """
    if config.metodo_pesos not in METODOS_PESOS:
        raise ValueError(f"metodo_pesos debe ser uno de {METODOS_PESOS}, no '{config.metodo_pesos}'.")
    estructura = construir_estructura(X.shape[1], indices_fijos, indices_dinamicos, indice_objetivo)
    if aristas_excluidas is not None:
        estructura &= ~np.asarray(aristas_excluidas, dtype=bool)
    fcm = MapaCognitivoDifuso(estructura, indices_fijos, config, nombres)
    medias = X[:, indices_dinamicos].mean(axis=0)
    if config.metodo_pesos == "bptt":
        fcm.ajustar(con_dinamicos_neutros(X, indices_dinamicos, medias), X, pesos_muestras=pesos_muestras)
    elif config.metodo_pesos == "correlacion_parcial":
        fcm.pesos = pesos_por_correlacion_parcial(X, estructura)
    else:
        fcm.pesos = pesos_por_regresion(X, estructura, config, pesos_muestras)
    return fcm, medias
