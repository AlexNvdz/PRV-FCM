"""
Etapa 2: Inferencia difusa con Mapas Cognitivos Difusos (FCM).

Regla de Kosko modificada, con memoria (Stylios y Groumpos, 2004):

    A_i(t+1) = f( k2 * A_i(t) + k1 * (sum_{j != i} w_ji * A_j(t) + b_i) )

con activación sigmoide f(x) = 1 / (1 + exp(-lambda * x)). El término
``k2 * A_i(t)`` es la memoria: cada concepto conserva parte de su estado previo.
b_i es el sesgo (``ConfigFCM.sesgo``): solo existe en los conceptos que reciben
aristas, va en [peso_min, peso_max] y equivale al peso de un concepto constante
igual a 1. Sin sesgo, b = 0.

Convención de pesos: ``pesos[j, i] = w_ji`` es la influencia causal del concepto
j sobre el concepto i. Con los estados como filas, la regla queda:

    A(t+1) = f( k2 * A(t) + k1 * (A(t) @ W + b) )

Variantes de la Tabla 2 de PRV-FCM (``ConfigFCM.inferencia`` y ``activacion``),
todas con la forma A_i(t+1) = f(m * u_i + k1 * (u @ W[:, i] + b_i)):

* ``kosko``: sin memoria (m = 0), u = A.
* ``kosko_modificada`` (por defecto): m = k2, u = A.
* ``reescalada``: m = k2, u = 2A - 1 (Papageorgiou, 2011).
* Activación ``sigmoide``: f(x) = 1 / (1 + exp(-lambda * x)), estado en [0, 1].
  ``tanh``: el estado vive en [-1, 1] (v = 2A - 1), v(t+1) = tanh(lambda * x) y
  vuelve a [0, 1] para el resto del pipeline: A = (v + 1) / 2 = sigmoide(2 lambda x).
  Con tanh la entrada ya es 2A - 1, así que la reescalada coincide con Kosko
  modificada (interpretación nuestra de la Tabla 2; ver README).

Los conceptos fijos (inmutables, acciones y mutables no dinámicos) conservan su
valor durante la inferencia (clamped); solo los conceptos dinámicos se
actualizan, hasta que max |A(t+1) - A(t)| < tolerancia o se alcanza el máximo
de iteraciones.

Extracción de la matriz de pesos W (n x n) con los datos normalizados; solo se
estiman las aristas que permite la estructura (y la máscara causal opcional):

* ``bptt`` (por defecto): minimiza el error cuadrático del estado final de la
  inferencia más una penalización L2, con gradiente exacto (BPTT) y L-BFGS-B
  con los pesos y los sesgos acotados a [-1, 1].
* ``ridge`` y ``lasso``: regresión lineal regularizada, una por concepto
  dinámico. Su valor observado y es un punto fijo de la regla si
  sum_j w_ji A_j + b_i = (logit(y) / lambda - k2 * y) / k1; ese es el objetivo
  de la regresión, y el sesgo es su intercepto recortado a [-1, 1]. Los
  coeficientes se truncan a (-1, 1) con la tangente hiperbólica.
* ``correlacion_parcial``: w_ji es la correlación parcial entre C_j y C_i
  dados los demás conceptos (ya está en [-1, 1]); b = 0. Describe asociaciones
  directas, pero no calibra la inferencia.
* ``pso``: optimización por enjambre de partículas (ec. 4-5 de PRV-FCM) con la
  misma pérdida que BPTT; cada partícula es una W candidata (y b, con sesgo).
* ``expertos``: W dada por expertos (media aritmética de sus matrices, García
  et al., 2025); b = 0.

La inversión del punto fijo de Ridge y Lasso vale en todas las variantes: la
entrada es afín en A y la activación es invertible.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.linalg import block_diag
from scipy.optimize import minimize
from scipy.special import expit, logit
from sklearn.covariance import LedoitWolf
from sklearn.linear_model import Lasso, Ridge

from .configuracion import ConfigFCM

METODOS_PESOS = ("bptt", "ridge", "lasso", "correlacion_parcial", "pso", "expertos")
INFERENCIAS = ("kosko", "kosko_modificada", "reescalada")
ACTIVACIONES = ("sigmoide", "tanh")

# La regresión lleva el valor observado a [margen, 1 - margen] antes del logit,
# que es infinito en 0 y en 1. Con 0.05 la exactitud en xAPI es la más alta.
MARGEN_REGRESION = 0.05


def sigmoide(x: np.ndarray, lambda_: float = 1.0) -> np.ndarray:
    """f(x) = 1 / (1 + exp(-lambda * x)), evaluada de forma numéricamente estable."""
    return expit(lambda_ * np.asarray(x, dtype=float))


def parametros_regla(config: ConfigFCM) -> tuple[float, float, float, float]:
    """(m, a, c, lambda efectiva) de la regla A_i(t+1) = sigmoide(lambda_e * (m * u_i + k1 * (u @ W + b))), u = a*A + c."""
    if config.inferencia not in INFERENCIAS:
        raise ValueError(f"inferencia debe ser una de {INFERENCIAS}, no '{config.inferencia}'.")
    if config.activacion not in ACTIVACIONES:
        raise ValueError(f"activacion debe ser una de {ACTIVACIONES}, no '{config.activacion}'.")
    memoria = 0.0 if config.inferencia == "kosko" else config.coef_memoria
    a, c = (2.0, -1.0) if config.inferencia == "reescalada" or config.activacion == "tanh" else (1.0, 0.0)
    # tanh(z) en [-1, 1] llevado a [0, 1]: (tanh(z) + 1) / 2 = sigmoide(2 z).
    return memoria, a, c, (2.0 if config.activacion == "tanh" else 1.0) * config.lambda_


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
    """FCM con la regla de ``config.inferencia`` (por defecto, Kosko modificada) y activación ``config.activacion``.

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
        self.sesgo = np.zeros(self.n_conceptos)  # b_i; cero en los conceptos sin aristas entrantes.
        self.receptores = np.flatnonzero(self.estructura.any(axis=0))
        self.historial_perdida: list[float] = []
        self.resultado_optimizacion = None
        self.regla = parametros_regla(config)

    def entrada(self, A: np.ndarray) -> np.ndarray:
        """u = a*A + c: el estado como lo ve la regla (A, o 2A - 1 en la reescalada y con tanh)."""
        _, a, c, _ = self.regla
        return A if a == 1.0 and c == 0.0 else a * A + c

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
        b_libres = self.sesgo[libres]
        memoria, _, _, lambda_ = self.regla
        max_iter = cfg.max_iter if max_iter is None else max_iter

        trayectoria = [A.copy()] if guardar_trayectoria else None
        cambio, iteraciones = np.inf, 0
        for iteraciones in range(1, max_iter + 1):
            U = self.entrada(A)
            x = memoria * U[:, libres] + cfg.coef_influencia * (U @ W_libres + b_libres)
            nuevos = sigmoide(x, lambda_)
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

    def terminos(
        self, estado: np.ndarray, fuentes: np.ndarray | None = None
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Los tres sumandos de la regla para un estado A(t), por concepto de destino i.

            memoria_i    = m * u_i(t)               (Kosko modificada: k2 * A_i(t))
            influencia_i = k1 * sum_j w_ji * u_j(t)
            sesgo_i      = k1 * b_i   (no depende del estado)

        con u = A, o u = 2A - 1 en la reescalada y con tanh (ver ``parametros_regla``).
        Para un concepto dinámico, A_i(t+1) = f(memoria_i + influencia_i + sesgo_i);
        para uno fijo los términos existen pero no se usan. ``fuentes`` limita la suma
        a esos conceptos de origen j (por ejemplo, solo las acciones) para ver
        cuánto aporta cada grupo a la entrada. Sirve para explicar la inferencia:
        :meth:`inferir` hace la misma cuenta, restringida a los conceptos dinámicos.
        """
        cfg = self.config
        A = np.asarray(estado, dtype=float)
        U = self.entrada(A)
        origen = U
        if fuentes is not None:
            origen = np.zeros_like(U)
            origen[..., fuentes] = U[..., fuentes]
        sesgo = np.broadcast_to(cfg.coef_influencia * self.sesgo, A.shape)
        return self.regla[0] * U, cfg.coef_influencia * (origen @ self.pesos), sesgo

    def activar(self, entrada: np.ndarray) -> np.ndarray:
        """f(entrada) en [0, 1]: sigmoide(lambda x), o (tanh(lambda x) + 1) / 2 con tanh."""
        return sigmoide(entrada, self.regla[3])

    # ------------------------------------------------------------------
    # Aprendizaje de los pesos a partir de datos
    # ------------------------------------------------------------------
    def _empaquetar(self, W: np.ndarray, b: np.ndarray) -> np.ndarray:
        """Parámetros del optimizador: pesos de las aristas permitidas y, con sesgo, b de los receptores."""
        if not self.config.sesgo:
            return W[self.estructura]
        return np.concatenate([W[self.estructura], b[self.receptores]])

    def _desempaquetar(self, theta: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Inversa de :meth:`_empaquetar`: matriz W (n, n) y vector b (n,)."""
        n_aristas = int(self.estructura.sum())
        W = np.zeros_like(self.pesos)
        W[self.estructura] = theta[:n_aristas]
        b = np.zeros(self.n_conceptos)
        if self.config.sesgo:
            b[self.receptores] = theta[n_aristas:]
        return W, b

    def _perdida_y_gradiente(
        self, theta: np.ndarray, A0: np.ndarray, Y: np.ndarray, c: np.ndarray, v: np.ndarray | None = None
    ) -> tuple[float, np.ndarray]:
        """Pérdida (MSE ponderado + L2) y su gradiente exacto por BPTT.

        Se despliegan ``config.pasos_entrenamiento`` iteraciones de la regla y se
        retropropaga el error a través de ellas:

            u_t = a * A_t + c
            x_t = m * u_t[:, M] + k1 * (u_t @ W[:, M] + b[M])
            A_{t+1}[:, M] = sigmoide(lambda_e * x_t)
            dL/dx_t = dL/dA_{t+1}[:, M] * lambda_e * A_{t+1} * (1 - A_{t+1})
            dL/dW[:, M] += k1 * u_t^T @ dL/dx_t
            dL/db[M] += k1 * suma por registros de dL/dx_t
            dL/dA_t[:, M] = a * dL/dx_t @ (m * I + k1 * W[M, M]^T)

        con (m, a, c, lambda_e) de ``parametros_regla`` (Kosko modificada con
        sigmoide: m = k2, a = 1, c = 0, lambda_e = lambda).

        donde M son los conceptos dinámicos (los fijos no dependen de W). ``v``
        pondera cada registro (media 1); sin ``v`` todos pesan lo mismo. La
        penalización L2 incluye el sesgo, como el peso de un concepto constante.
        """
        cfg = self.config
        libres = self.indices_libres
        W, b = self._desempaquetar(theta)
        W_libres = W[:, libres]
        W_mm = W[np.ix_(libres, libres)]
        b_libres = b[libres]
        memoria, a, _, lambda_ = self.regla

        estados = [A0]
        A = A0
        for _ in range(cfg.pasos_entrenamiento):
            U = self.entrada(A)
            x = memoria * U[:, libres] + cfg.coef_influencia * (U @ W_libres + b_libres)
            A = A.copy()
            A[:, libres] = sigmoide(x, lambda_)
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
        grad_b_libres = np.zeros_like(b_libres)
        for t in range(cfg.pasos_entrenamiento - 1, -1, -1):
            S = estados[t + 1][:, libres]
            D = G * lambda_ * S * (1.0 - S)
            grad_libres += cfg.coef_influencia * (self.entrada(estados[t]).T @ D)
            grad_b_libres += cfg.coef_influencia * D.sum(axis=0)
            G = memoria * D + cfg.coef_influencia * (D @ W_mm.T)
            if a != 1.0:
                G = a * G

        grad_W = np.zeros_like(W)
        grad_W[:, libres] = grad_libres
        grad_b = np.zeros(self.n_conceptos)
        grad_b[libres] = grad_b_libres
        grad = self._empaquetar(grad_W, grad_b) + 2.0 * cfg.alpha_l2 * theta
        return perdida, grad

    def _perdidas_lote(
        self, thetas: np.ndarray, A0: np.ndarray, Y: np.ndarray, c: np.ndarray, v: np.ndarray | None = None
    ) -> np.ndarray:
        """La pérdida de :meth:`_perdida_y_gradiente` para muchas partículas a la vez (sin gradiente).

        La influencia de los conceptos fijos no cambia entre iteraciones: se
        calcula una vez por partícula y solo se itera la parte dinámica. Las
        partículas van lado a lado en columnas (registros, partículas x
        dinámicos) y su parte dinámica es una matriz diagonal por bloques: una
        sola multiplicación por iteración. Si todas las partículas ya están en
        su punto fijo (cambio < 1e-12), las iteraciones restantes se omiten.
        """
        cfg = self.config
        libres, fijos = self.indices_libres, self.indices_fijos
        memoria, a, _, lambda_ = self.regla
        n_aristas = int(self.estructura.sum())
        W = np.zeros((len(thetas), self.n_conceptos, self.n_conceptos))
        W[:, self.estructura] = thetas[:, :n_aristas]
        b = np.zeros((len(thetas), self.n_conceptos))
        if cfg.sesgo:
            b[:, self.receptores] = thetas[:, n_aristas:]
        n_registros, n_libres = A0.shape[0], len(libres)
        U0 = self.entrada(A0)
        fija = np.matmul(U0[:, fijos], W[:, fijos][:, :, libres]) + b[:, None, libres]   # (P, R, M)
        fija = fija.transpose(1, 0, 2).reshape(n_registros, -1)                          # (R, P*M)
        bloques = block_diag(*W[:, libres][:, :, libres])                                # (P*M, P*M)
        A = np.tile(A0[:, libres], (1, len(thetas)))
        for _ in range(cfg.pasos_entrenamiento):
            U = self.entrada(A)
            nuevo = sigmoide(memoria * U + cfg.coef_influencia * (fija + U @ bloques), lambda_)
            quieto = np.max(np.abs(nuevo - A)) < 1e-12
            A = nuevo
            if quieto:
                break
        error2 = ((A - np.tile(Y, (1, len(thetas)))) ** 2).reshape(n_registros, len(thetas), n_libres)
        if v is not None:
            error2 = v[:, None, None] * error2
        return np.sum(c * error2.mean(axis=0), axis=1) + cfg.alpha_l2 * np.sum(thetas**2, axis=1)

    def _pso(self, A0: np.ndarray, Y: np.ndarray, c: np.ndarray, v: np.ndarray | None, rng: np.random.Generator) -> np.ndarray:
        """Enjambre de partículas (ec. 4-5 de PRV-FCM) dentro de [peso_min, peso_max]; devuelve la mejor posición.

            v_i <- w * v_i + c1 * r1 * (mejor_i - W_i) + c2 * r2 * (mejor_global - W_i),  |v_i| <= vmax
            W_i <- W_i + v_i

        r1 y r2 son uniformes en [0, 1] por coordenada. ``historial_perdida``
        guarda la mejor pérdida global de cada iteración. Se detiene antes si la
        mejor pérdida no baja más de 1e-7 en ``pso_paciencia`` iteraciones.
        """
        cfg = self.config
        bajo, alto = cfg.peso_min, cfg.peso_max
        dimension = self._empaquetar(self.pesos, self.sesgo).size
        posicion = rng.uniform(bajo, alto, (cfg.pso_particulas, dimension))
        velocidad = np.clip(rng.uniform(-1.0, 1.0, posicion.shape) * (alto - bajo) / 2, -cfg.pso_vmax, cfg.pso_vmax)
        mejor = posicion.copy()
        mejor_perdida = self._perdidas_lote(posicion, A0, Y, c, v)
        self.historial_perdida = [float(mejor_perdida.min())]
        for _ in range(cfg.pso_iteraciones):
            lider = mejor[np.argmin(mejor_perdida)]
            r1, r2 = rng.random(posicion.shape), rng.random(posicion.shape)
            velocidad = cfg.pso_inercia * velocidad + cfg.pso_c1 * r1 * (mejor - posicion) + cfg.pso_c2 * r2 * (lider - posicion)
            velocidad = np.clip(velocidad, -cfg.pso_vmax, cfg.pso_vmax)
            posicion = np.clip(posicion + velocidad, bajo, alto)
            perdida = self._perdidas_lote(posicion, A0, Y, c, v)
            mejora = perdida < mejor_perdida
            mejor[mejora], mejor_perdida[mejora] = posicion[mejora], perdida[mejora]
            self.historial_perdida.append(float(mejor_perdida.min()))
            h = self.historial_perdida
            if len(h) > cfg.pso_paciencia and h[-cfg.pso_paciencia - 1] - h[-1] < 1e-7:
                break
        return mejor[np.argmin(mejor_perdida)]

    def ajustar(
        self,
        estados_iniciales: np.ndarray,
        estados_objetivo: np.ndarray,
        pesos_conceptos: dict[int, float] | None = None,
        pesos_muestras: np.ndarray | None = None,
        pso: bool = False,
        rng: np.random.Generator | None = None,
    ) -> "MapaCognitivoDifuso":
        """Aprende los pesos causales con datos de entrenamiento.

        Minimiza el error cuadrático medio entre el estado final de la
        inferencia y los valores observados de los conceptos dinámicos, con
        regularización L2, usando L-BFGS-B (o PSO, con ``pso=True`` y el
        generador ``rng``) con los pesos (y los sesgos, si ``config.sesgo``)
        acotados a [peso_min, peso_max].

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
        if pso:
            self.pesos, self.sesgo = self._desempaquetar(self._pso(A0, Y, c, v, rng or np.random.default_rng()))
            return self

        def registrar(intermediate_result):
            self.historial_perdida.append(float(intermediate_result.fun))

        theta0 = self._empaquetar(self.pesos, self.sesgo)
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
        self.pesos, self.sesgo = self._desempaquetar(resultado.x)
        self.resultado_optimizacion = resultado
        return self

    def matriz_pesos(self) -> pd.DataFrame:
        """Pesos como DataFrame (filas: origen, columnas: destino); con sesgo, b va en la última fila."""
        tabla = pd.DataFrame(self.pesos, index=self.nombres, columns=self.nombres)
        if self.config.sesgo:
            tabla.loc["sesgo"] = self.sesgo
        return tabla


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


def pesos_por_regresion(
    X: np.ndarray, estructura: np.ndarray, config: ConfigFCM, pesos_muestras: np.ndarray | None = None
) -> tuple[np.ndarray, np.ndarray]:
    """Pesos y sesgos por regresión Ridge o Lasso, una por concepto que recibe aristas.

    Para cada concepto dinámico i con fuentes S (aristas permitidas C_j -> C_i):

        z_i = (logit(y_i) / lambda - k2 * y_i) / k1,   y_i recortado a [margen, 1 - margen]
        Ridge:  min_w ||z_i - b_i - X_S w||^2 + alpha * n * ||w||^2   (MSE + alpha ||w||^2, la escala de BPTT)
        Lasso:  min_w ||z_i - b_i - X_S w||^2 / (2n) + alpha * ||w||_1
        w_ji = tanh(coeficiente_j)

    Con esos pesos, el valor observado de C_i es (por mínimos cuadrados) un
    punto fijo de la regla. En general (``parametros_regla``), la entrada de la
    regresión es u = a*X + c y z_i = (logit(y_i) / lambda_e - m * (a*y_i + c)) / k1.
    Con sesgo, b_i es el
    intercepto c de la misma regresión (sin penalizar) recortado a
    [peso_min, peso_max], y los pesos se ajustan con b_i fijo: si c cabe en el
    rango es el ajuste con intercepto; si no (en xAPI, c = -2.3), los pesos
    compensan la parte recortada. Con b_i = tanh(c) sin reajustar, la
    exactitud en xAPI cae de 77 % a 52 %. Sin sesgo, b = 0.
    """
    if config.metodo_pesos not in ("ridge", "lasso"):
        raise ValueError(f"pesos_por_regresion usa ridge o lasso, no {config.metodo_pesos}.")
    X = np.asarray(X, dtype=float)
    n = X.shape[0]

    def regresion(intercepto: bool) -> Ridge | Lasso:
        if config.metodo_pesos == "ridge":
            return Ridge(alpha=config.alpha_l2 * n, fit_intercept=intercepto)
        return Lasso(alpha=config.alpha_l2, fit_intercept=intercepto, max_iter=20_000)

    memoria, a, c, lambda_ = parametros_regla(config)
    U = X if a == 1.0 and c == 0.0 else a * X + c
    pesos = np.zeros((X.shape[1], X.shape[1]))
    sesgo = np.zeros(X.shape[1])
    for i in np.flatnonzero(estructura.any(axis=0)):
        fuentes = np.flatnonzero(estructura[:, i])
        y = np.clip(X[:, i], MARGEN_REGRESION, 1.0 - MARGEN_REGRESION)
        z = (logit(y) / lambda_ - memoria * (y if a == 1.0 and c == 0.0 else a * y + c)) / config.coef_influencia
        if config.sesgo:
            intercepto = regresion(True).fit(U[:, fuentes], z, sample_weight=pesos_muestras).intercept_
            sesgo[i] = np.clip(intercepto, config.peso_min, config.peso_max)
        modelo = regresion(False).fit(U[:, fuentes], z - sesgo[i], sample_weight=pesos_muestras)
        pesos[fuentes, i] = np.tanh(modelo.coef_)
    return pesos, sesgo


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
    semilla: int | None = None,
    pesos_expertos: np.ndarray | None = None,
) -> tuple[MapaCognitivoDifuso, np.ndarray]:
    """Construye el FCM y aprende sus pesos con una matriz de entrenamiento.

    ``aristas_excluidas`` es la máscara de dirección causal opcional: una matriz
    booleana (n, n) en la que ``True`` en [j, i] elimina la arista C_j -> C_i
    aunque la estructura la permita. El método de extracción de pesos es
    ``config.metodo_pesos``; con ``config.sesgo`` también se aprende b. ``pesos_muestras`` pondera cada registro en BPTT,
    Ridge y Lasso (ver ``pesos_equilibrados``); la correlación parcial no los usa.
    ``semilla`` hace reproducible el PSO. Con ``metodo_pesos = "expertos"``,
    ``pesos_expertos`` es la matriz (n, n) de consenso (ver
    ``pipeline.matriz_expertos``), recortada a la estructura; b = 0.

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
    if config.metodo_pesos in ("bptt", "pso"):
        fcm.ajustar(
            con_dinamicos_neutros(X, indices_dinamicos, medias), X, pesos_muestras=pesos_muestras,
            pso=config.metodo_pesos == "pso", rng=np.random.default_rng(semilla),
        )
    elif config.metodo_pesos == "expertos":
        if pesos_expertos is None:
            raise ValueError("El método de expertos necesita al menos una matriz de expertos.")
        fcm.pesos = np.where(estructura, pesos_expertos, 0.0)
    elif config.metodo_pesos == "correlacion_parcial":
        fcm.pesos = pesos_por_correlacion_parcial(X, estructura)
    else:
        fcm.pesos, fcm.sesgo = pesos_por_regresion(X, estructura, config, pesos_muestras)
    return fcm, medias
