"""Pruebas de PRV-FCM. Ejecutar desde la raíz del proyecto con: python -m pytest"""
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from prvfcm.configuracion import ConfigAG, ConfigFCM, ConfigPrescripcion, ConfigSeleccion
from prvfcm.evaluacion import discretizar_rendimiento, mae, mse, rmse, tasa_exito_prescriptivo
from prvfcm.fcm import (
    MapaCognitivoDifuso,
    construir_estructura,
    correlaciones_parciales,
    entrenar_fcm,
    pesos_equilibrados,
    pesos_por_regresion,
    sigmoide,
)
from prvfcm.genetico import AlgoritmoGenetico
from prvfcm.prescripcion import PrescriptorPRVFCM
from prvfcm.preprocesamiento import Preprocesador, cargar_datos, dividir_entrenamiento_prueba, grupos_por_perfil
from prvfcm.seleccion import validacion_cruzada_fcm

RUTA_DATOS = Path(__file__).resolve().parents[1] / "data" / "xAPI-Edu-Data-expanded-4800.csv"
sin_datos = pytest.mark.skipif(not RUTA_DATOS.exists(), reason="dataset no disponible")


def fcm_pequeno(semilla: int = 0) -> MapaCognitivoDifuso:
    """FCM de 4 conceptos: C0 y C1 fijos; C2 y C3 dinámicos; C3 es el objetivo."""
    fijos, dinamicos = np.array([0, 1]), np.array([2, 3])
    estructura = construir_estructura(4, fijos, dinamicos, indice_objetivo=3)
    fcm = MapaCognitivoDifuso(estructura, fijos, ConfigFCM(pasos_entrenamiento=30))
    fcm.pesos[estructura] = np.random.default_rng(semilla).uniform(-1, 1, estructura.sum())
    return fcm


# ---------------------------------------------------------------------------
# FCM
# ---------------------------------------------------------------------------
def test_sigmoide():
    assert sigmoide(0.0) == pytest.approx(0.5)
    assert sigmoide(1.0, lambda_=5.0) == pytest.approx(1 / (1 + np.exp(-5.0)))
    y = sigmoide(np.linspace(-50, 50, 101))
    assert np.all((y >= 0) & (y <= 1)) and np.all(np.diff(y) >= 0)


def test_estructura():
    estructura = construir_estructura(4, np.array([0, 1]), np.array([2, 3]), indice_objetivo=3)
    assert not estructura[:, :2].any()  # Nada influye sobre los conceptos fijos.
    assert not estructura[3].any()  # El objetivo no tiene aristas salientes.
    assert not np.diag(estructura).any()  # Sin autoconexiones.
    assert estructura[0, 2] and estructura[1, 3] and estructura[2, 3]


def test_un_paso_de_kosko_modificada():
    fcm = fcm_pequeno()
    A0 = np.array([0.2, 0.9, 0.5, 0.1])
    A1 = fcm.inferir(A0, max_iter=1, hasta_convergencia=False).estados
    esperado = sigmoide(A0 + A0 @ fcm.pesos)  # A(t+1) = f(A(t) + A(t) W)
    np.testing.assert_allclose(A1[2:], esperado[2:])
    np.testing.assert_allclose(A1[:2], A0[:2])  # Los fijos no cambian.


def test_inferencia_converge_a_un_punto_fijo():
    fcm = fcm_pequeno()
    resultado = fcm.inferir(np.array([0.2, 0.9, 0.5, 0.1]))
    assert resultado.convergio
    siguiente = fcm.inferir(resultado.estados, max_iter=1, hasta_convergencia=False).estados
    np.testing.assert_allclose(siguiente, resultado.estados, atol=1e-4)


def test_gradiente_bptt_coincide_con_diferencias_finitas():
    fcm = fcm_pequeno()
    rng = np.random.default_rng(1)
    A0, Y, c = rng.random((20, 4)), rng.random((20, 2)), np.array([0.5, 0.5])
    theta = fcm.pesos[fcm.estructura]
    _, gradiente = fcm._perdida_y_gradiente(theta, A0, Y, c)
    eps = 1e-6
    numerico = [
        (fcm._perdida_y_gradiente(theta + eps * e, A0, Y, c)[0] - fcm._perdida_y_gradiente(theta - eps * e, A0, Y, c)[0])
        / (2 * eps)
        for e in np.eye(theta.size)
    ]
    np.testing.assert_allclose(gradiente, numerico, rtol=1e-5, atol=1e-8)


def test_gradiente_con_pesos_por_registro_coincide_con_diferencias_finitas():
    fcm = fcm_pequeno()
    rng = np.random.default_rng(4)
    A0, Y, c = rng.random((20, 4)), rng.random((20, 2)), np.array([0.5, 0.5])
    v = rng.uniform(0.2, 3.0, 20)
    v = v / v.mean()
    theta = fcm.pesos[fcm.estructura]
    _, gradiente = fcm._perdida_y_gradiente(theta, A0, Y, c, v)
    eps = 1e-6
    numerico = [
        (fcm._perdida_y_gradiente(theta + eps * e, A0, Y, c, v)[0] - fcm._perdida_y_gradiente(theta - eps * e, A0, Y, c, v)[0])
        / (2 * eps)
        for e in np.eye(theta.size)
    ]
    np.testing.assert_allclose(gradiente, numerico, rtol=1e-5, atol=1e-8)
    # Con pesos iguales a 1 la pérdida es la de siempre.
    np.testing.assert_allclose(fcm._perdida_y_gradiente(theta, A0, Y, c, np.ones(20))[0], fcm._perdida_y_gradiente(theta, A0, Y, c)[0])


def test_pesos_equilibrados_igualan_el_peso_de_cada_nivel():
    etiquetas = np.array(["No"] * 85 + ["Sí"] * 15)
    pesos = pesos_equilibrados(etiquetas)
    assert pesos.mean() == pytest.approx(1.0)
    assert pesos[etiquetas == "No"].sum() == pytest.approx(pesos[etiquetas == "Sí"].sum())


def test_aprendizaje_reproduce_un_fcm_conocido():
    real = fcm_pequeno()
    A0 = np.random.default_rng(2).random((200, 4))
    A0[:, 2:] = 0.5
    Y = real.predecir(A0)
    modelo = MapaCognitivoDifuso(real.estructura, real.indices_fijos, ConfigFCM(alpha_l2=0.0, pasos_entrenamiento=30))
    modelo.ajustar(A0, Y)
    np.testing.assert_allclose(modelo.predecir(A0)[:, 2:], Y[:, 2:], atol=1e-2)


def fcm_un_dinamico(pesos_reales: np.ndarray, n: int = 400, semilla: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Datos de un FCM con 3 fuentes fijas y un objetivo dinámico: el objetivo es el punto fijo de la regla."""
    estructura = construir_estructura(4, np.array([0, 1, 2]), np.array([3]), indice_objetivo=3)
    real = MapaCognitivoDifuso(estructura, np.array([0, 1, 2]))
    real.pesos[:3, 3] = pesos_reales
    X = np.random.default_rng(semilla).random((n, 4))
    X[:, 3] = 0.5
    return real.predecir(X), estructura


def test_regresion_recupera_los_pesos_de_un_punto_fijo():
    # Sin ruido ni regularización, la regresión sobre (logit(y) - y) recupera los pesos; tanh solo los transforma.
    pesos_reales = np.array([0.6, -0.4, 0.2])
    X, estructura = fcm_un_dinamico(pesos_reales)
    for metodo in ("ridge", "lasso"):
        W = pesos_por_regresion(X, estructura, ConfigFCM(metodo_pesos=metodo, alpha_l2=1e-9))
        np.testing.assert_allclose(np.arctanh(W[:3, 3]), pesos_reales, atol=1e-3)
        assert not W[~estructura].any()  # Solo las aristas permitidas.


def test_metodos_de_pesos_quedan_en_rango_y_respetan_la_mascara():
    # C1 no influye en los datos. Si influyera, al quitarlo los demás pesos lo compensarían: la regla no tiene sesgo.
    X, _ = fcm_un_dinamico(np.array([0.9, 0.0, 0.3]))
    excluir = np.zeros((4, 4), dtype=bool)
    excluir[1, 3] = True  # Máscara causal: sin la arista C1 -> C3.
    for metodo in ("bptt", "ridge", "lasso", "correlacion_parcial"):
        fcm, _ = entrenar_fcm(X, np.array([0, 1, 2]), np.array([3]), 3, ConfigFCM(metodo_pesos=metodo), aristas_excluidas=excluir)
        assert not fcm.estructura[1, 3] and fcm.pesos[1, 3] == 0.0
        assert np.all(np.abs(fcm.pesos) <= 1.0)
        assert fcm.pesos[0, 3] > 0 and fcm.pesos[2, 3] > 0  # El signo de las fuentes permitidas se conserva.
    with pytest.raises(ValueError):
        entrenar_fcm(X, np.array([0, 1, 2]), np.array([3]), 3, ConfigFCM(metodo_pesos="otro"))


def test_correlacion_parcial_coincide_con_la_definicion():
    rng = np.random.default_rng(0)
    z = rng.normal(size=(3000, 1))
    X = np.hstack([z + 0.5 * rng.normal(size=(3000, 1)), z + 0.5 * rng.normal(size=(3000, 1)), z])
    parcial = correlaciones_parciales(X)
    # X0 y X1 solo se relacionan a través de X2: su correlación parcial es casi cero aunque la simple sea alta.
    assert abs(parcial[0, 1]) < 0.06 and np.corrcoef(X[:, 0], X[:, 1])[0, 1] > 0.7
    np.testing.assert_allclose(np.diag(parcial), 1.0)
    np.testing.assert_allclose(parcial, parcial.T, atol=1e-12)


# ---------------------------------------------------------------------------
# Algoritmo genético
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("tipo", ["uniforme", "un_punto"])
def test_cruce_toma_cada_gen_de_un_padre(tipo):
    ag = AlgoritmoGenetico(
        lambda P: P.sum(axis=1), np.zeros(6), np.ones(6), ConfigAG(tipo_cruce=tipo, tasa_cruce=1.0), np.random.default_rng(0)
    )
    hijos = ag.cruzar(np.array([np.zeros(6), np.ones(6)]))
    np.testing.assert_allclose(hijos[0] + hijos[1], 1.0)
    if tipo == "un_punto":
        # Un solo corte: el primer hijo es 0...0 1...1 con ambos tramos presentes.
        assert np.all(np.diff(hijos[0]) >= 0) and hijos[0][0] == 0 and hijos[0][-1] == 1


def test_mutacion_respeta_los_limites():
    inferior, superior = np.array([0.2, 0.0, 0.5]), np.array([0.4, 1.0, 0.5])
    ag = AlgoritmoGenetico(
        lambda P: P.sum(axis=1), inferior, superior, ConfigAG(tasa_mutacion=1.0, sigma_mutacion=5.0), np.random.default_rng(0)
    )
    mutados = ag.mutar(np.tile((inferior + superior) / 2, (500, 1)))
    assert np.all(mutados >= inferior) and np.all(mutados <= superior)


def test_torneo_favorece_a_los_mejores():
    ag = AlgoritmoGenetico(lambda P: P.sum(axis=1), np.zeros(2), np.ones(2), ConfigAG(tam_torneo=3), np.random.default_rng(0))
    costos = np.arange(100, dtype=float)
    ganadores = ag.seleccion_torneo(costos, 4000)
    # Mínimo de 3 extracciones con reemplazo de {0..99}: E = sum_{m=1}^{99} (m/100)^3 = 24.5.
    assert costos[ganadores].mean() == pytest.approx(24.5, abs=1.5)


def test_ag_encuentra_el_minimo_y_nunca_empeora():
    objetivo = np.array([0.3, 0.7, 0.1, 0.9])
    ag = AlgoritmoGenetico(
        lambda P: np.abs(P - objetivo).sum(axis=1),
        np.zeros(4),
        np.ones(4),
        ConfigAG(generaciones=300, paciencia=100),
        np.random.default_rng(0),
    )
    resultado = ag.ejecutar()
    np.testing.assert_allclose(resultado.mejor_cromosoma, objetivo, atol=0.05)
    assert np.all(np.diff(resultado.historial_mejor) <= 1e-12)  # Elitismo.


# ---------------------------------------------------------------------------
# Prescripción y métricas
# ---------------------------------------------------------------------------
def prescriptor_pequeno(**config) -> PrescriptorPRVFCM:
    """C0 inmutable, C1 acción, C2 y C3 dinámicos; C1 favorece al objetivo C3."""
    fcm = fcm_pequeno()
    fcm.pesos[1, 3] = 0.9
    return PrescriptorPRVFCM(
        fcm, np.array([1]), {3: 1.0}, config_ag=ConfigAG(), config=ConfigPrescripcion(**config)
    )


def test_prescripcion_mejora_y_respeta_restricciones():
    prescriptor = prescriptor_pequeno(beta_esfuerzo=0.0, delta_max=0.3)
    estado = np.array([0.4, 0.2, 0.5, 0.3])
    resultado = prescriptor.prescribir(estado, np.random.default_rng(0))
    cambio = resultado.acciones_recomendadas - resultado.acciones_actuales
    assert np.all(cambio >= 0) and np.all(cambio <= 0.3 + 1e-12)  # Solo incrementos, acotados.
    assert resultado.error_prescrito <= resultado.error_base
    assert resultado.acciones_recomendadas[0] == pytest.approx(0.5)  # Más acción, mejor: llega al límite.
    np.testing.assert_allclose(resultado.estado_prescrito[0], estado[0])  # Inmutable intacto.


def test_metricas():
    deseado, obtenido = np.ones(4), np.array([0.9, 0.8, 0.5, 1.0])
    assert mae(deseado, obtenido) == pytest.approx(0.2)
    assert mse(deseado, obtenido) == pytest.approx((0.01 + 0.04 + 0.25) / 4)
    assert rmse(deseado, obtenido) == pytest.approx(np.sqrt((0.01 + 0.04 + 0.25) / 4))
    assert tasa_exito_prescriptivo(obtenido[:, None], [1.0], tolerancia=0.25) == pytest.approx(75.0)
    assert list(discretizar_rendimiento([0.1, 0.3, 0.74, 0.76])) == ["L", "M", "M", "H"]


# ---------------------------------------------------------------------------
# Preprocesamiento y selección con el dataset real
# ---------------------------------------------------------------------------
@sin_datos
def test_division_agrupada_separa_perfiles_y_estratifica():
    datos = cargar_datos(RUTA_DATOS)
    grupos = pd.Series(grupos_por_perfil(datos), index=datos.index)
    entrenamiento, prueba = dividir_entrenamiento_prueba(datos, 0.3, 0, grupos.to_numpy())
    assert len(entrenamiento) + len(prueba) == len(datos)
    assert not set(grupos[entrenamiento.index]) & set(grupos[prueba.index])  # Ningún perfil en ambas.
    assert len(prueba) / len(datos) == pytest.approx(0.3, abs=0.03)
    proporciones = [d["Class"].value_counts(normalize=True) for d in (datos, prueba)]
    assert (proporciones[0] - proporciones[1]).abs().max() < 0.03


@sin_datos
def test_validacion_cruzada_devuelve_una_fila_por_combinacion():
    datos = cargar_datos(RUTA_DATOS).sample(900, random_state=0)
    config = ConfigSeleccion(pliegues=3, rejilla_lambda=(1.0, 10.0), rejilla_alpha=(1e-3,))
    tabla = validacion_cruzada_fcm(datos, grupos_por_perfil(datos), config=config, semilla=0)
    assert len(tabla) == 2 and set(tabla["lambda"]) == {1.0, 10.0}
    assert tabla["exactitud"].between(0, 1).all() and tabla["exactitud"].is_monotonic_decreasing
    assert tabla.loc[0, "lambda"] == 1.0  # Con lambda = 10 la sigmoide satura y el FCM predice una sola clase.


@sin_datos
def test_preprocesamiento_rango_y_segmentacion():
    entrenamiento, prueba = dividir_entrenamiento_prueba(cargar_datos(RUTA_DATOS), 0.2, 0)
    pre = Preprocesador().ajustar(entrenamiento)
    X = pre.transformar(entrenamiento)
    assert X.shape == (len(entrenamiento), 16)
    np.testing.assert_allclose(X.min(axis=0), 0.0)  # Min-Max ajustado con entrenamiento.
    np.testing.assert_allclose(X.max(axis=0), 1.0)
    X_prueba = pre.transformar(prueba)
    assert X_prueba.min() >= 0.0 and X_prueba.max() <= 1.0
    assert [pre.conceptos[i].id for i in pre.indices_accion] == ["C9", "C10", "C11", "C12"]
    assert [pre.columnas[i] for i in pre.indices_dinamicos] == ["Class"]
    i = pre.indice("raisedhands")
    np.testing.assert_allclose(pre.desnormalizar(X[:, i], "raisedhands"), entrenamiento["raisedhands"])
