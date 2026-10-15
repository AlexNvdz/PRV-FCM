"""Pruebas del perfil "articulo" y de lo que agrega: reglas de la Tabla 2, PSO, expertos, SMOTE,
reconstrucción, aptitudes de los artículos, fechas, objetivo binario y valores deseados."""
import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from prvfcm.api import PrescriptorAG
from prvfcm.configuracion import ESQUEMA_XAPI, ConfigAG, ConfigFCM, binarizar
from prvfcm.esquema import esquema_a_dict, esquema_desde_dict
from prvfcm.evaluacion import comparar_medias, evaluar_reconstruccion, psr_ec19
from prvfcm.fcm import MapaCognitivoDifuso, construir_estructura, entrenar_fcm
from prvfcm.modelo import ModeloPRVFCM, guardar_modelo
from prvfcm.pipeline import OpcionesPipeline, ejecutar, matriz_expertos, opciones_desde_dict, valores_de_perfil
from prvfcm.prescripcion import aptitud_garcia2025, aptitud_tabla4
from prvfcm.preprocesamiento import Preprocesador, cargar_datos, etiquetas_objetivo, smote
from prvfcm.servicio import m_perfiles
from test_motor_app import AG_RAPIDO, dataset_desercion, esquema_desercion

REGLAS = [(i, a) for i in ("kosko", "kosko_modificada", "reescalada") for a in ("sigmoide", "tanh")]


def fcm_aleatorio(inferencia="kosko_modificada", activacion="sigmoide", sesgo=True, semilla=0) -> MapaCognitivoDifuso:
    """C0 y C1 fijos; C2 y C3 dinámicos; C3 objetivo."""
    fijos, dinamicos = np.array([0, 1]), np.array([2, 3])
    estructura = construir_estructura(4, fijos, dinamicos, indice_objetivo=3)
    config = ConfigFCM(inferencia=inferencia, activacion=activacion, sesgo=sesgo, lambda_=1.5, pasos_entrenamiento=10)
    fcm = MapaCognitivoDifuso(estructura, fijos, config)
    rng = np.random.default_rng(semilla)
    fcm.pesos[estructura] = rng.uniform(-1, 1, estructura.sum())
    if sesgo:
        fcm.sesgo[dinamicos] = rng.uniform(-1, 1, 2)
    return fcm


# ---------------------------------------------------------------------------
# Reglas de inferencia (Tabla 2), gradiente y PSO
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("inferencia,activacion", REGLAS)
def test_un_paso_de_cada_regla(inferencia, activacion):
    fcm = fcm_aleatorio(inferencia, activacion)
    A0 = np.array([0.2, 0.9, 0.5, 0.1])
    A1 = fcm.inferir(A0, max_iter=1, hasta_convergencia=False).estados
    u = 2 * A0 - 1 if inferencia == "reescalada" or activacion == "tanh" else A0
    x = (0 if inferencia == "kosko" else 1) * u + u @ fcm.pesos + fcm.sesgo
    esperado = (np.tanh(1.5 * x) + 1) / 2 if activacion == "tanh" else 1 / (1 + np.exp(-1.5 * x))
    np.testing.assert_allclose(A1[2:], esperado[2:])
    np.testing.assert_allclose(A1[:2], A0[:2])


@pytest.mark.parametrize("inferencia,activacion", REGLAS)
def test_gradiente_de_cada_regla_coincide_con_diferencias_finitas(inferencia, activacion):
    fcm = fcm_aleatorio(inferencia, activacion)
    rng = np.random.default_rng(1)
    A0, Y, c = rng.random((20, 4)), rng.random((20, 2)), np.array([0.5, 0.5])
    theta = fcm._empaquetar(fcm.pesos, fcm.sesgo)
    _, gradiente = fcm._perdida_y_gradiente(theta, A0, Y, c)
    eps = 1e-6
    numerico = [
        (fcm._perdida_y_gradiente(theta + eps * e, A0, Y, c)[0] - fcm._perdida_y_gradiente(theta - eps * e, A0, Y, c)[0]) / (2 * eps)
        for e in np.eye(theta.size)
    ]
    np.testing.assert_allclose(gradiente, numerico, rtol=1e-5, atol=1e-8)
    # La pérdida por lotes del PSO es la misma de BPTT.
    v = rng.uniform(0.5, 2, 20)
    assert fcm._perdidas_lote(theta[None], A0, Y, c, v)[0] == pytest.approx(fcm._perdida_y_gradiente(theta, A0, Y, c, v)[0])


def test_pso_es_reproducible_y_baja_la_perdida():
    real = fcm_aleatorio(sesgo=False)
    A0 = np.random.default_rng(2).random((150, 4))
    A0[:, 2:] = 0.5
    X = real.predecir(A0)
    config = ConfigFCM(metodo_pesos="pso", sesgo=False, pso_iteraciones=60)
    primero, _ = entrenar_fcm(X, np.array([0, 1]), np.array([2, 3]), 3, config, semilla=7)
    segundo, _ = entrenar_fcm(X, np.array([0, 1]), np.array([2, 3]), 3, config, semilla=7)
    np.testing.assert_array_equal(primero.pesos, segundo.pesos)
    h = primero.historial_perdida
    assert h[-1] < h[0] and all(a >= b for a, b in zip(h, h[1:]))  # La mejor pérdida global nunca sube.
    assert np.all(np.abs(primero.pesos) <= 1) and not primero.pesos[~primero.estructura].any()


def test_ridge_invierte_el_punto_fijo_con_tanh_y_reescalada():
    estructura = construir_estructura(4, np.array([0, 1, 2]), np.array([3]), indice_objetivo=3)
    for inferencia, activacion in (("reescalada", "sigmoide"), ("kosko", "tanh")):
        config = ConfigFCM(inferencia=inferencia, activacion=activacion, sesgo=False)
        real = MapaCognitivoDifuso(estructura, np.array([0, 1, 2]), config)
        real.pesos[:3, 3] = [0.5, -0.3, 0.2]
        X = np.random.default_rng(3).random((300, 4))
        X = real.predecir(X)
        fcm, _ = entrenar_fcm(X, np.array([0, 1, 2]), np.array([3]), 3, ConfigFCM(
            metodo_pesos="ridge", alpha_l2=1e-9, inferencia=inferencia, activacion=activacion, sesgo=False))
        np.testing.assert_allclose(np.arctanh(fcm.pesos[:3, 3]), [0.5, -0.3, 0.2], atol=1e-3)


# ---------------------------------------------------------------------------
# Expertos
# ---------------------------------------------------------------------------
def test_consenso_de_expertos_es_la_media_con_ceros_en_las_aristas_omitidas():
    pre = Preprocesador(ESQUEMA_XAPI)
    estructura = construir_estructura(16, pre.indices_fijos, pre.indices_dinamicos, pre.indice_objetivo)
    matrices = (
        {"experto": "A", "aristas": [{"origen": "raisedhands", "destino": "Class", "peso": 0.8},
                                     {"origen": "StudentAbsenceDays", "destino": "Class", "peso": -0.6}]},
        {"experto": "B", "aristas": [{"origen": "raisedhands", "destino": "Class", "peso": 0.4}]},
    )
    W = matriz_expertos(pre, estructura, matrices)
    assert W[pre.indice("raisedhands"), pre.indice("Class")] == pytest.approx(0.6)
    assert W[pre.indice("StudentAbsenceDays"), pre.indice("Class")] == pytest.approx(-0.3)  # B la omite: cuenta 0.
    assert np.count_nonzero(W) == 2
    with pytest.raises(ValueError, match="concepto fijo"):
        matriz_expertos(pre, estructura, ({"experto": "C", "aristas": [{"origen": "Class", "destino": "gender", "peso": 0.1}]},))
    with pytest.raises(ValueError, match="fuera de"):
        matriz_expertos(pre, estructura, ({"experto": "C", "aristas": [{"origen": "gender", "destino": "Class", "peso": 1.5}]},))
    with pytest.raises(ValueError, match="no es un concepto"):
        matriz_expertos(pre, estructura, ({"experto": "C", "aristas": [{"origen": "nada", "destino": "Class", "peso": 0.1}]},))


# ---------------------------------------------------------------------------
# Aptitudes de los artículos y reconstrucción
# ---------------------------------------------------------------------------
def test_aptitud_tabla4_y_garcia2025_siguen_sus_formulas():
    fcm = fcm_aleatorio(sesgo=False)
    acciones = np.array([1])
    deseado = np.array([0.3, 0.7, 0.4, 1.0])
    finales = np.array([[0.3, 0.2, 0.6, 0.5], [0.3, 0.7, 0.4, 1.0]])
    sistema = np.array([0, 2, 3])
    W = fcm.pesos[np.ix_(sistema, sistema)]
    f = lambda v: 1 / (1 + np.exp(-1.5 * (v[sistema] + v[sistema] @ W)))  # noqa: E731 (Kosko modificada, sin acciones)
    esperado = np.abs(f(deseado) - f(finales[0])).sum()
    np.testing.assert_allclose(aptitud_tabla4(fcm, deseado, finales, acciones), [esperado, 0.0], atol=1e-12)
    garcia = aptitud_garcia2025(fcm, deseado, finales, acciones, np.array([3]))
    assert garcia[0] == pytest.approx(abs(f(finales[0])[2] - 1.0))


def test_metricas_de_reconstruccion():
    reales = np.array([[0.2, 0.5], [0.4, 0.5], [0.6, 0.5], [0.8, 0.5]])
    prescritas = reales.copy()
    prescritas[:, 0] += 0.1
    salida = evaluar_reconstruccion(reales, prescritas, ["a", "b"], ["A", "B"], semilla=0)
    assert salida["n"] == 4 and salida["global"]["mae"] == pytest.approx(0.05)
    assert salida["global"]["psr_ec19"] == pytest.approx(psr_ec19(reales, prescritas)) == pytest.approx(4.4 / 4.0)
    assert salida["avisos"]  # El cociente pasa de 1: se avisa, no se recorta.
    assert salida["por_accion"][1]["p"] == 1.0 and salida["por_accion"][1]["mae"] == 0
    assert comparar_medias([1, 2], [1, 2])["p"] is None  # Menos de 3 registros.


# ---------------------------------------------------------------------------
# Datos: SMOTE, fechas, imputación y objetivo binario
# ---------------------------------------------------------------------------
def test_smote_equilibra_con_puntos_entre_vecinos():
    rng = np.random.default_rng(0)
    X = np.vstack([rng.random((40, 3)), 2 + rng.random((10, 3))])
    etiquetas = np.array(["a"] * 40 + ["b"] * 10)
    X2, e2 = smote(X, etiquetas, semilla=1)
    assert (e2 == "a").sum() == (e2 == "b").sum() == 40
    np.testing.assert_array_equal(X2[:50], X)  # Los registros originales no cambian.
    nuevos = X2[50:]
    assert nuevos.min() >= 2 and nuevos.max() <= 3  # Dentro del grupo minoritario.


def test_smote_solo_en_el_entrenamiento(tmp_path):
    ruta = tmp_path / "datos.csv"
    dataset_desercion(600).to_csv(ruta, index=False)
    esquema = esquema_desde_dict(esquema_desercion())
    datos = cargar_datos(ruta, esquema)
    base = OpcionesPipeline(validacion_cruzada=False, config_ag=AG_RAPIDO, reconstruccion=False)
    sin = ejecutar(datos, esquema, base)
    con = ejecutar(datos, esquema, opciones_desde_dict({"smote": True, "validacion_cruzada": False, "ag": {"generaciones": 30}, "reconstruccion": False}))
    assert con.n_sinteticos > 0 and sin.n_sinteticos == 0
    np.testing.assert_array_equal(con.X_pru, sin.X_pru)  # La prueba no recibe sintéticos.
    assert con.reporte()["configuracion"]["n_sinteticos"] == con.n_sinteticos


def test_fecha_e_imputacion_con_la_mediana():
    df = pd.DataFrame(
        {
            "alta": ["04-09-2012", "08-03-2014", "21-08-2013", "01-01-2012"],
            "ingreso": [10.0, np.nan, 30.0, 50.0],
            "accion": [1, 2, 3, 4],
            "y": ["No", "Sí", "Sí", "No"],
        }
    )
    esquema = esquema_desde_dict({
        "objetivo": "y",
        "columnas": [
            {"columna": "alta", "rol": "inmutable", "codificacion": "fecha"},
            {"columna": "ingreso", "rol": "inmutable", "codificacion": "numerica"},
            {"columna": "accion", "rol": "accion", "codificacion": "numerica"},
            {"columna": "y", "rol": "objetivo", "codificacion": "ordinal", "orden": ["No", "Sí"]},
        ],
    })
    pre = Preprocesador(esquema).ajustar(df)
    assert pre.fechas_minimas["alta"].startswith("2012-01-01")
    assert pre.medianas["ingreso"] == 30.0
    X = pre.transformar(df)
    assert X[1, pre.indice("ingreso")] == pytest.approx(0.5)  # 30 con mínimo 10 y máximo 50.
    assert X[3, pre.indice("alta")] == 0 and X[1, pre.indice("alta")] == 1  # La fecha mínima y la máxima.
    copia = Preprocesador.desde_dict(pre.a_dict(), esquema)
    np.testing.assert_allclose(copia.transformar(df), X)


def test_binarizar_xapi_como_el_articulo():
    esquema = binarizar(ESQUEMA_XAPI, "M")
    assert esquema.niveles == {"<M": 0.0, "≥M": 1.0} and esquema.mejor_nivel == "≥M"
    df = pd.DataFrame({"Class": ["L", "M", "H"]})
    assert list(etiquetas_objetivo(df, esquema)) == ["<M", "≥M", "≥M"]
    # El esquema guarda la binarización y la recupera al leerse de nuevo.
    assert esquema_desde_dict(esquema_a_dict(esquema)).niveles == esquema.niveles
    with pytest.raises(ValueError, match="salvo el peor"):
        binarizar(ESQUEMA_XAPI, "L")


def test_objetivo_numerico_binarizado_de_punta_a_punta(tmp_path):
    df = dataset_desercion(600, semilla=2).drop(columns="desercion")
    df["nota"] = (df.horas_estudio * 2 + df.asistencia * 0.5 + np.random.default_rng(0).normal(0, 5, len(df))).round(1)
    ruta = tmp_path / "notas.csv"
    df.to_csv(ruta, index=False)
    datos_esquema = esquema_desercion()
    datos_esquema["columnas"] = [c for c in datos_esquema["columnas"] if c["columna"] != "desercion"]
    datos_esquema["columnas"].append({"columna": "nota", "rol": "objetivo", "codificacion": "numerica"})
    datos_esquema["objetivo"] = "nota"
    esquema = esquema_desde_dict(datos_esquema)
    datos = cargar_datos(ruta, esquema)
    r = ejecutar(datos, esquema, opciones_desde_dict({"binarizar_objetivo": 70, "validacion_cruzada": False, "ag": {"generaciones": 30}}))
    assert r.esquema.niveles == {"<70": 0.0, "≥70": 1.0}
    assert set(r.recomendaciones["clase_observada"]) == {"<70"}
    assert r.reconstruccion is not None and r.reconstruccion["n"] == int((datos.loc[r.prueba.index, "nota"] >= 70).sum())


# ---------------------------------------------------------------------------
# Perfiles y valores deseados
# ---------------------------------------------------------------------------
def test_perfiles_resueltos_y_opciones_explicitas():
    perfiles = m_perfiles()
    claves = {"metodo_pesos", "inferencia", "activacion", "sesgo", "beta", "condicion_delta_max", "permitir_reducciones",
              "mutables_dinamicos", "smote", "binarizar_objetivo", "proporcion_prueba", "pliegues", "busqueda_ag"}
    assert claves <= set(perfiles["mejorado"]) and claves <= set(perfiles["articulo"])
    assert perfiles["mejorado"]["metodo_pesos"] == "bptt" and perfiles["mejorado"]["inferencia"] == "kosko_modificada"
    assert perfiles["articulo"]["inferencia"] is None and perfiles["articulo"]["condicion_delta_max"] is None
    articulo = opciones_desde_dict({"perfil": "articulo", "metodo_pesos": "bptt", "ag": {"generaciones": 10}})
    assert articulo.config_fcm.metodo_pesos == "bptt" and not articulo.config_fcm.sesgo
    assert articulo.config_ag.generaciones == 10 and articulo.config_ag.tam_poblacion == 200
    assert articulo.config_seleccion.pliegues == 10 and len(articulo.config_seleccion.rejilla_inferencia) == 3
    assert articulo.config_prescripcion.condicion_columna is None and articulo.config_prescripcion.aptitud == "tabla4"
    assert opciones_desde_dict({}) == opciones_desde_dict({"perfil": "mejorado"})
    assert valores_de_perfil()["perfil"] == "mejorado"


def test_valores_deseados_del_usuario(tmp_path):
    ruta = tmp_path / "datos.csv"
    dataset_desercion(600).to_csv(ruta, index=False)
    esquema = esquema_desde_dict(esquema_desercion())
    datos = cargar_datos(ruta, esquema)
    r = ejecutar(datos, esquema, opciones_desde_dict({"validacion_cruzada": False, "ag": {"generaciones": 30}, "reconstruccion": False}))
    guardar_modelo(r, tmp_path / "modelo.json")
    modelo = ModeloPRVFCM.cargar(tmp_path / "modelo.json")
    prescriptor = PrescriptorAG(modelo)
    registro = datos.iloc[[3]]
    salida = prescriptor.prescribir(registro, beta=0.0, deseados={"desercion": "No", "beca": "Sí"})
    deseados = {d["columna"]: d for d in salida["deseados"]}
    assert deseados["desercion"]["normalizado"] == 1.0 and deseados["desercion"]["dinamico"]
    assert deseados["beca"]["normalizado"] == 1.0 and not deseados["beca"]["dinamico"]  # Mutable fijo: escenario.
    sin_beca = prescriptor.prescribir(registro, beta=0.0)
    if registro.iloc[0]["beca"] == "No":
        assert salida["base"]["activacion"] != pytest.approx(sin_beca["base"]["activacion"])
    with pytest.raises(ValueError, match="inmutable"):
        prescriptor.prescribir(registro, deseados={"edad": 20})
    with pytest.raises(ValueError, match="una acción"):
        prescriptor.prescribir(registro, deseados={"tutorias": 5})


def test_expertos_y_correlacion_parcial_guardan_sesgo_falso(tmp_path):
    ruta = tmp_path / "datos.csv"
    dataset_desercion(400).to_csv(ruta, index=False)
    esquema = esquema_desde_dict(esquema_desercion())
    datos = cargar_datos(ruta, esquema)
    expertos = [{"experto": "A", "aristas": [{"origen": "tutorias", "destino": "desercion", "peso": 0.7}]}]
    for metodo in ("expertos", "correlacion_parcial"):
        r = ejecutar(datos, esquema, opciones_desde_dict({
            "metodo_pesos": metodo, "matrices_expertos": expertos, "validacion_cruzada": False, "ag": {"generaciones": 10},
            "reconstruccion": False,
        }))
        assert not r.config_fcm.sesgo and not r.fcm.sesgo.any()
        assert r.reporte()["configuracion"]["fcm"]["sesgo"] is False
        assert r.reporte()["configuracion"]["expertos"] == (["A"] if metodo == "expertos" else [])


# ---------------------------------------------------------------------------
# Sujeto de los textos y números es-CO
# ---------------------------------------------------------------------------
def test_sujeto_por_defecto_xapi_y_esquemas_viejos():
    from prvfcm.esquema import ESQUEMA_XAPI_DICT, ErrorEsquema

    assert esquema_desde_dict(esquema_desercion()).sujeto.plural == "registros"
    assert ESQUEMA_XAPI_DICT["sujeto"] == {"singular": "estudiante", "plural": "estudiantes", "femenino": False}
    viejo = {k: v for k, v in ESQUEMA_XAPI_DICT.items() if k != "sujeto"}  # Modelo guardado antes del campo.
    assert esquema_desde_dict(viejo).sujeto.singular == "estudiante"
    con_sujeto = esquema_desde_dict({**esquema_desercion(), "sujeto": {"singular": "persona", "plural": "personas", "femenino": True}})
    assert con_sujeto.sujeto.este == "esta persona" and con_sujeto.sujeto.con_articulo("7") == "la persona 7"
    assert esquema_desde_dict(esquema_a_dict(con_sujeto)).sujeto == con_sujeto.sujeto
    with pytest.raises(ErrorEsquema, match="sujeto"):
        esquema_desde_dict({**esquema_desercion(), "sujeto": {"singular": "", "plural": "x"}})
    with pytest.raises(ErrorEsquema, match="femenino"):
        esquema_desde_dict({**esquema_desercion(), "sujeto": {"singular": "a", "plural": "b", "femenino": "sí"}})


def test_textos_usan_el_sujeto_y_la_coma_decimal(tmp_path):
    from prvfcm.reporte import resumen_prescripciones
    from prvfcm.servicio import _mensaje_etapa, m_modelo_info

    ruta = tmp_path / "datos.csv"
    dataset_desercion(500).to_csv(ruta, index=False)
    datos_esquema = {**esquema_desercion(), "sujeto": {"singular": "persona", "plural": "personas", "femenino": True}}
    esquema = esquema_desde_dict(datos_esquema)
    datos = cargar_datos(ruta, esquema)
    r = ejecutar(datos, esquema, opciones_desde_dict({"validacion_cruzada": False, "ag": {"generaciones": 10}, "reconstruccion": False}))
    assert "personas con el algoritmo" in _mensaje_etapa("prescripcion", r)
    assert re.search(r"\d,\d % de exactitud en prueba", _mensaje_etapa("fcm", r))
    guardar_modelo(r, tmp_path / "modelo.json")
    info = m_modelo_info(str(tmp_path / "modelo.json"))
    assert info["sujeto"] == {"singular": "persona", "plural": "personas", "femenino": True}
    salida = PrescriptorAG(ModeloPRVFCM.cargar(tmp_path / "modelo.json")).prescribir(datos.iloc[[0]], beta=0.0)
    assert salida["reporte"]["texto"].startswith("Para esta persona")
    resumen = resumen_prescripciones(r.recomendaciones, [], "Deserción", "No", "desercion", sujeto=esquema.sujeto)
    assert "personas de prueba" in resumen["texto"]
    # Números para personas con coma decimal; los del JSON siguen siendo números.
    aviso = evaluar_reconstruccion(np.array([[0.2], [0.4], [0.5]]), np.array([[0.3], [0.5], [0.6]]), ["a"], ["A"])["avisos"][0]
    assert "= 1,273 > 1" in aviso
    umbral = binarizar(esquema_desde_dict({**esquema_desercion(), "columnas": [
        *[c for c in esquema_desercion()["columnas"] if c["columna"] != "desercion"],
        {"columna": "desercion", "rol": "objetivo", "codificacion": "numerica"},
    ]}), 9.5)
    assert list(umbral.niveles) == ["<9,5", "≥9,5"]


def test_nivel_inexistente_es_un_error_con_los_niveles_validos(tmp_path):
    from prvfcm.servicio import m_prescribir_perfil, m_resumen_prescripciones

    ruta = tmp_path / "datos.csv"
    dataset_desercion(400).to_csv(ruta, index=False)
    esquema = esquema_desde_dict(esquema_desercion())
    datos = cargar_datos(ruta, esquema)
    r = ejecutar(datos, esquema, opciones_desde_dict({"validacion_cruzada": False, "ag": {"generaciones": 10}, "reconstruccion": False}))
    carpeta = tmp_path / "modelo"
    r.guardar_resultados(carpeta)
    guardar_modelo(r, carpeta / "modelo.json")
    mensaje = 'El nivel "response" no existe; los niveles son: Sí, No.'
    with pytest.raises(ValueError, match=mensaje):
        m_resumen_prescripciones(str(carpeta), "response")
    assert m_resumen_prescripciones(str(carpeta), "Sí")["n"] > 0
    perfil = {c: datos.iloc[0][c] for c in esquema.columnas_origen if c != "desercion"}
    with pytest.raises(ValueError, match=mensaje):
        m_prescribir_perfil(str(carpeta / "modelo.json"), perfil, nivel_meta="response")
