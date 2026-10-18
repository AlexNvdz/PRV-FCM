"""Pruebas del motor genérico que usa la aplicación web: esquema, perfilado, pipeline, modelo y servicio."""
import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from prvfcm.api import PredictorFCM, PrescriptorAG
from prvfcm.configuracion import ESQUEMA_XAPI, ConfigAG, ConfigFCM, ConfigPrescripcion, ConfigSeleccion
from prvfcm.esquema import ESQUEMA_XAPI_DICT, ErrorEsquema, esquema_a_dict, esquema_desde_dict, validar_esquema
from prvfcm.fcm import MapaCognitivoDifuso
from prvfcm.modelo import ModeloPRVFCM, guardar_modelo
from prvfcm.perfilado import correlaciones, dispersion, estadistica_variable, estadisticas, filas, normalizados, perfil_base, perfilar
from prvfcm.pipeline import OpcionesPipeline, Segmento, ejecutar
from prvfcm.preprocesamiento import Preprocesador, cargar_datos, grupos_por_perfil, leer_excel, leer_tabla
from prvfcm.reporte import numero, reporte_individual, resumen_prescripciones
from prvfcm.servicio import m_convertir_excel, m_estructura

RAIZ = Path(__file__).resolve().parents[1]
AG_RAPIDO = ConfigAG(tam_poblacion=20, generaciones=30, paciencia=10)


def dataset_desercion(n: int = 900, semilla: int = 0) -> pd.DataFrame:
    """Dataset sintético: la deserción baja con estudio, asistencia y tutorías."""
    rng = np.random.default_rng(semilla)
    df = pd.DataFrame(
        {
            "estudiante_id": [f"E{i:05d}" for i in range(n)],
            "edad": rng.integers(17, 31, n),
            "genero": rng.choice(["F", "M"], n),
            "beca": rng.choice(["Sí", "No"], n, p=[0.3, 0.7]),
            "horas_estudio": rng.integers(0, 31, n),
            "asistencia": rng.integers(40, 101, n),
            "tutorias": rng.integers(0, 13, n),
            "materias_reprobadas": rng.integers(0, 6, n),
        }
    )
    z = (
        -0.1 * df.horas_estudio - 0.06 * (df.asistencia - 70) - 0.2 * df.tutorias
        + 0.7 * df.materias_reprobadas - 0.6 * (df.beca == "Sí") + 0.5
    )
    df["desercion"] = np.where(rng.random(n) < 1 / (1 + np.exp(-z)), "Sí", "No")
    return df


def esquema_desercion(**extra) -> dict:
    return {
        "nombre": "deserción sintética",
        "objetivo": "desercion",
        "columnas": [
            {"columna": "estudiante_id", "rol": "excluir"},
            {"columna": "edad", "rol": "inmutable", "codificacion": "numerica"},
            {"columna": "genero", "rol": "inmutable", "codificacion": "ordinal", "orden": ["F", "M"]},
            {"columna": "horas_estudio", "rol": "accion", "codificacion": "numerica", "nombre": "Horas de estudio"},
            {"columna": "asistencia", "rol": "accion", "codificacion": "numerica"},
            {"columna": "tutorias", "rol": "accion", "codificacion": "numerica"},
            {"columna": "beca", "rol": "mutable", "codificacion": "ordinal", "orden": ["No", "Sí"]},
            {"columna": "materias_reprobadas", "rol": "mutable", "codificacion": "numerica"},
            {"columna": "desercion", "rol": "objetivo", "codificacion": "ordinal", "orden": ["Sí", "No"]},
        ],
        **extra,
    }


@pytest.fixture(scope="module")
def entrenado(tmp_path_factory):
    """Pipeline genérico sin validación cruzada, guardado y recargado."""
    carpeta = tmp_path_factory.mktemp("modelo")
    ruta = carpeta / "datos.csv"
    dataset_desercion().to_csv(ruta, index=False)
    esquema = esquema_desde_dict(esquema_desercion())
    datos = cargar_datos(ruta, esquema)
    opciones = OpcionesPipeline(
        validacion_cruzada=False, config_ag=AG_RAPIDO, segmento=Segmento("beca", "Sí", "con beca", "sin beca")
    )
    r = ejecutar(datos, esquema, opciones)
    guardar_modelo(r, carpeta / "modelo.json")
    return r, ModeloPRVFCM.cargar(carpeta / "modelo.json"), datos


# ---------------------------------------------------------------------------
# Esquema
# ---------------------------------------------------------------------------
def test_esquema_xapi_ida_y_vuelta():
    e = esquema_desde_dict(ESQUEMA_XAPI_DICT)
    assert e.conceptos == ESQUEMA_XAPI.conceptos
    assert e.codificacion_ordinal == ESQUEMA_XAPI.codificacion_ordinal
    assert e.niveles == ESQUEMA_XAPI.niveles and e.mejor_nivel == "H"
    assert e.columnas_excluidas == ("PlaceofBirth",) and e.tolerancia_exito == pytest.approx(0.25)


def test_esquema_binario_deriva_niveles_y_tolerancia():
    e = esquema_desde_dict(esquema_desercion())
    assert e.niveles == {"Sí": 0.0, "No": 1.0} and e.mejor_nivel == "No"
    assert e.niveles_a_prescribir == ("Sí",) and e.tolerancia_exito == pytest.approx(0.5)
    # Los conceptos se ordenan por rol y se numeran: inmutables, acciones, mutables, objetivo.
    assert [c.id for c in e.conceptos] == [f"C{k}" for k in range(1, 9)]
    assert e.conceptos[-1].columna == "desercion" and e.conceptos[-1].dinamico
    assert e.conceptos[2].nombre == "Horas de estudio"


def test_esquema_mal_formado_explica_cada_error():
    malo = {
        "columnas": [
            {"columna": "a", "rol": "accion", "codificacion": "nominal"},
            {"columna": "b", "rol": "inmutable", "codificacion": "ordinal", "orden": ["x"]},
        ]
    }
    with pytest.raises(ErrorEsquema) as error:
        esquema_desde_dict(malo)
    texto = " ".join(error.value.errores)
    assert "objetivo" in texto and "nominal" in texto and "orden" in texto


def test_validar_esquema_detecta_categorias_fuera_del_orden():
    esquema = esquema_desercion()
    esquema["columnas"][2]["orden"] = ["F"]  # Falta "M" y queda una sola categoría.
    assert not validar_esquema(esquema, dataset_desercion())["ok"]
    esquema["columnas"][2]["orden"] = ["F", "X"]
    resultado = validar_esquema(esquema, dataset_desercion())
    assert not resultado["ok"] and any("M" in e for e in resultado["errores"])


def test_validar_esquema_rechaza_una_columna_sin_valores():
    # Una columna numérica vacía no tiene mediana: el FCM recibiría NaN (y una acción vacía rompía el AG).
    resultado = validar_esquema(esquema_desercion(), dataset_desercion().assign(tutorias=np.nan))
    assert not resultado["ok"] and any("tutorias" in e and "excluir" in e for e in resultado["errores"])


# ---------------------------------------------------------------------------
# Perfilado
# ---------------------------------------------------------------------------
def test_perfilado_sugiere_roles_y_orden_del_objetivo():
    sugerido = {c["columna"]: c for c in perfilar(dataset_desercion())["esquema_sugerido"]["columnas"]}
    assert sugerido["estudiante_id"]["rol"] == "excluir"
    assert sugerido["desercion"]["rol"] == "objetivo" and sugerido["desercion"]["orden"] == ["Sí", "No"]
    assert {c for c, e in sugerido.items() if e["rol"] == "accion"} == {"horas_estudio", "asistencia", "tutorias"}
    assert sugerido["materias_reprobadas"]["rol"] == "mutable"


def test_filas_filtra_ordena_y_rechaza_operadores_desconocidos():
    df = dataset_desercion(200)
    esquema = esquema_desde_dict(esquema_desercion())
    pagina = filas(df, esquema, cantidad=5, orden="asistencia", descendente=True,
                   filtros=[{"columna": "tutorias", "operador": ">=", "valor": 6}], nivel="Sí")
    assert pagina["total"] == int(((df.tutorias >= 6) & (df.desercion == "Sí")).sum())
    asistencias = [f["asistencia"] for f in pagina["filas"]]
    assert asistencias == sorted(asistencias, reverse=True) and all(f["nivel"] == "Sí" for f in pagina["filas"])
    with pytest.raises(ValueError):
        filas(df, esquema, filtros=[{"columna": "edad", "operador": "~", "valor": 3}])


# ---------------------------------------------------------------------------
# Pipeline genérico y modelo persistente
# ---------------------------------------------------------------------------
def test_pipeline_generico_prescribe_solo_a_quienes_desertan(entrenado):
    r, _, _ = entrenado
    assert set(r.recomendaciones["clase_observada"]) == {"Sí"}
    m = r.metricas
    assert m["PSR"] >= m["PSR_base"] and m["MAE"] <= m["MAE_base"]
    assert set(r.exito_por_segmento) == {"con beca", "sin beca"}
    assert r.externa["exactitud_prueba"] > 0.5
    graficas = r.datos_graficas()
    assert len(graficas["antes_despues"]) == len(r.resultados) and graficas["umbral_mejor"] == pytest.approx(0.5)


def test_modelo_guardado_reproduce_el_fcm_del_pipeline(entrenado):
    r, modelo, datos = entrenado
    registro = r.prueba.iloc[[0]]
    np.testing.assert_allclose(modelo.estado(registro), r.X_pru[0])
    esperado = r.fcm.inferir(r.X_pru[0]).estados[r.pre.indice_objetivo]
    assert modelo.describir(modelo.estado(registro))["activacion"] == pytest.approx(esperado)
    assert [i["columna"] for i in modelo.acciones()] == ["horas_estudio", "asistencia", "tutorias"]
    assert modelo.influencias()[0]["peso"] != 0


def test_simular_y_prescribir_un_estudiante(entrenado):
    _, modelo, datos = entrenado
    registro = datos.iloc[[3]]
    simulacion = PredictorFCM(modelo).simular(registro, {"horas_estudio": 30, "asistencia": 100, "tutorias": 12})
    assert simulacion["simulado"]["activacion"] >= simulacion["base"]["activacion"]  # Más acción, menos deserción.
    with pytest.raises(ValueError, match="no es una acción"):
        PredictorFCM(modelo).simular(registro, {"edad": 20})
    prescripcion = PrescriptorAG(modelo).prescribir(registro, beta=0.0, delta_max=0.3)
    for accion in prescripcion["acciones"]:
        assert accion["cambio"] >= -1e-9  # Solo incrementos.
    assert prescripcion["prescrito"]["activacion"] >= prescripcion["base"]["activacion"] - 1e-9


def test_inferencia_paso_a_paso_reproduce_la_regla_de_kosko(entrenado):
    _, modelo, datos = entrenado
    registro = datos.iloc[[3]]
    predictor = PredictorFCM(modelo)
    prediccion = predictor.predecir(registro, {"tutorias": 12})
    inferencia = prediccion["inferencia"]
    objetivo = inferencia["series"][0]
    assert objetivo["columna"] == "desercion" and len(objetivo["valores"]) == inferencia["iteraciones"] + 1
    # t = 0 es el estado inicial (valor observado) y el último punto, la activación final.
    estado = predictor.con_acciones(modelo.estado(registro), {"tutorias": 12})
    assert objetivo["valores"][0] == pytest.approx(estado[modelo.pre.indice_objetivo])
    assert objetivo["valores"][-1] == pytest.approx(prediccion["activacion"])
    p = inferencia["parametros"]
    assert p["sesgo"] == modelo.fcm.sesgo[modelo.pre.indice_objetivo] != 0
    for paso in inferencia["pasos"]:
        assert paso["sesgo"] == pytest.approx(p["k1"] * p["sesgo"])
        assert paso["entrada"] == pytest.approx(paso["memoria"] + paso["influencia"] + paso["sesgo"])
        assert paso["activacion"] == pytest.approx(1 / (1 + np.exp(-p["lambda"] * paso["entrada"])))
        assert paso["memoria"] == pytest.approx(p["k2"] * objetivo["valores"][paso["t"] - 1])
    # Las acciones quedan fijas: su aporte a la entrada del objetivo es el mismo en cada iteración.
    assert len({round(paso["influencia_acciones"], 12) for paso in inferencia["pasos"]}) == 1
    sin_cambio = predictor.predecir(registro)
    tutorias = modelo.pre.indice("tutorias")
    delta = p["k1"] * modelo.fcm.pesos[tutorias, modelo.pre.indice_objetivo] * (estado[tutorias] - modelo.estado(registro)[tutorias])
    assert inferencia["pasos"][0]["influencia_acciones"] - sin_cambio["inferencia"]["pasos"][0]["influencia_acciones"] == pytest.approx(delta)


def test_modelo_sin_sesgo_guardado_antes_carga_con_ceros(entrenado, tmp_path):
    r, modelo, datos = entrenado
    assert modelo.fcm.config.sesgo and modelo.conceptos()[-1]["sesgo"] == modelo.fcm.sesgo[-1] != 0
    assert all(c["sesgo"] == 0 for c in modelo.conceptos()[:-1])  # Solo el objetivo recibe aristas.
    ruta = tmp_path / "modelo.json"
    guardar_modelo(r, ruta)
    viejo = json.loads(ruta.read_text(encoding="utf-8"))
    del viejo["fcm"]["sesgo"], viejo["fcm"]["config"]["sesgo"]
    cargado = ModeloPRVFCM(viejo)
    assert not cargado.fcm.config.sesgo and not cargado.fcm.sesgo.any()
    # Mismos pesos con la regla de antes (b = 0).
    regla_vieja = MapaCognitivoDifuso(r.fcm.estructura, r.fcm.indices_fijos, replace(r.fcm.config, sesgo=False))
    regla_vieja.pesos = r.fcm.pesos
    estado = cargado.estado(datos.iloc[[3]])
    np.testing.assert_allclose(cargado.fcm.inferir(estado).estados, regla_vieja.inferir(estado).estados)
    assert not np.allclose(modelo.fcm.inferir(estado).estados, regla_vieja.inferir(estado).estados)
    prescripcion = PrescriptorAG(cargado).prescribir(datos.iloc[[3]])
    assert prescripcion["aporte_sesgo"] == 0


def test_tope_condicionado_en_la_prescripcion_y_su_reporte(entrenado):
    _, modelo, datos = entrenado
    # El esquema de deserción no tiene StudentAbsenceDays: no hay tope.
    sin_tope = PrescriptorAG(modelo).prescribir(datos.iloc[[3]], beta=0.0)
    assert sin_tope["restriccion"] is None and sin_tope["configuracion"]["condicion_delta_max"] == 0.15
    con_condicion = ModeloPRVFCM.__new__(ModeloPRVFCM)
    con_condicion.__dict__.update(modelo.__dict__)
    con_condicion.config_prescripcion = replace(modelo.config_prescripcion, condicion_columna="beca", condicion_delta_max=0.1)
    becado = datos[datos["beca"] == "Sí"].iloc[[0]]
    prescripcion = PrescriptorAG(con_condicion).prescribir(becado, beta=0.0)
    restriccion = prescripcion["restriccion"]
    assert restriccion["columna"] == "beca" and restriccion["delta_max"] == 0.1
    assert restriccion["texto"] in prescripcion["reporte"]["texto"] and "10 %" in restriccion["texto"]
    for accion in prescripcion["acciones"]:
        assert accion["cambio"] <= 0.1 * (accion["max"] - accion["min"]) + 1e-9
    no_becado = datos[datos["beca"] == "No"].iloc[[0]]
    assert PrescriptorAG(con_condicion).prescribir(no_becado, beta=0.0)["restriccion"] is None
    assert prescripcion["aporte_sesgo"] == pytest.approx(modelo.fcm.config.coef_influencia * modelo.fcm.sesgo[-1])


def test_prescriptor_ag_avisa_cada_generacion_sin_cambiar_el_resultado(entrenado):
    _, modelo, datos = entrenado
    registro = datos.iloc[[3]]
    prescriptor = PrescriptorAG(modelo)
    eventos = []
    con_aviso = prescriptor.prescribir(registro, beta=0.4, semilla=7, al_progresar=eventos.append)
    sin_aviso = prescriptor.prescribir(registro, beta=0.4, semilla=7)
    assert con_aviso["historial"] == sin_aviso["historial"]  # El aviso no consume números aleatorios.
    historial = con_aviso["historial"]
    assert [e["generacion"] for e in eventos] == list(range(con_aviso["generaciones"] + 1))  # 0 = población inicial.
    assert [e["mejor_costo"] for e in eventos] == pytest.approx(historial["mejor"])
    assert all(a >= b - 1e-12 for a, b in zip(historial["mejor"], historial["mejor"][1:]))  # Elitismo: nunca empeora.
    assert len(historial["activacion"]) == len(historial["acciones"]) == con_aviso["generaciones"] + 1
    # La última generación es la prescripción final.
    assert historial["acciones"][-1] == pytest.approx([a["recomendada"]["valor"] for a in con_aviso["acciones"]])
    assert historial["activacion"][-1] == pytest.approx(con_aviso["prescrito"]["activacion"], abs=1e-4)
    assert set(eventos[-1]["acciones"]) == {"horas_estudio", "asistencia", "tutorias"}


def test_objetivo_numerico_se_discretiza_en_tres_niveles(tmp_path):
    df = dataset_desercion(600, semilla=1).drop(columns="desercion")
    df["nota_final"] = (2 + 0.08 * df.horas_estudio + 0.02 * df.asistencia - 0.3 * df.materias_reprobadas).round(1)
    esquema = esquema_desercion()
    esquema["objetivo"] = "nota_final"
    esquema["columnas"][-1] = {"columna": "nota_final", "rol": "objetivo", "codificacion": "numerica"}
    objeto = esquema_desde_dict(esquema)
    assert objeto.niveles == {"Bajo": 0.0, "Medio": 0.5, "Alto": 1.0}
    ruta = tmp_path / "notas.csv"
    df.to_csv(ruta, index=False)
    r = ejecutar(cargar_datos(ruta, objeto), objeto, OpcionesPipeline(validacion_cruzada=False, config_ag=AG_RAPIDO))
    assert set(r.recomendaciones["clase_observada"]) <= {"Bajo", "Medio"}
    assert "nota_final_observado" in r.recomendaciones.columns
    # Meta escalonada: Bajo apunta a Medio y Medio a Alto; el éxito es llegar a la meta o más arriba.
    tabla, rango = r.recomendaciones, {"Bajo": 0, "Medio": 1, "Alto": 2}
    assert (tabla["nivel_meta"] == tabla["clase_observada"].map({"Bajo": "Medio", "Medio": "Alto"})).all()
    assert (tabla["exito"] == (tabla["nivel_prescrito"].map(rango) >= tabla["nivel_meta"].map(rango))).all()
    assert r.metricas["PSR"] == pytest.approx(100 * tabla["exito"].mean())
    descripcion = estadisticas(cargar_datos(ruta, objeto), objeto)
    assert sum(n["n"] for n in descripcion["objetivo"]["niveles"]) == len(df)


# ---------------------------------------------------------------------------
# Servicio (protocolo del worker)
# ---------------------------------------------------------------------------
def test_worker_responde_una_linea_json_por_peticion(tmp_path):
    ruta = tmp_path / "datos.csv"
    dataset_desercion(120).to_csv(ruta, index=False)
    peticiones = [
        {"id": 1, "metodo": "ping"},
        {"id": 2, "metodo": "validar_esquema", "params": {"ruta": str(ruta), "esquema": esquema_desercion()}},
        {"id": 3, "metodo": "no_existe"},
    ]
    proceso = subprocess.run(
        [sys.executable, "-m", "prvfcm.servicio", "worker"],
        input="\n".join(json.dumps(p) for p in peticiones) + "\n",
        capture_output=True, text=True, encoding="utf-8", cwd=RAIZ, timeout=120,
    )
    respuestas = [json.loads(linea) for linea in proceso.stdout.splitlines()]
    assert [r["id"] for r in respuestas] == [1, 2, 3]
    assert respuestas[0]["ok"] and respuestas[1]["ok"] and respuestas[1]["resultado"]["ok"]
    assert not respuestas[2]["ok"] and "Método desconocido" in respuestas[2]["error"]


# ---------------------------------------------------------------------------
# Flujo de cinco pasos: Excel, one-hot, máscara causal, perfil de riesgo y reportes
# ---------------------------------------------------------------------------
def test_excel_se_lee_y_se_convierte_a_csv(tmp_path):
    df = dataset_desercion(80)
    origen = tmp_path / "libro.xlsx"
    with pd.ExcelWriter(origen) as libro:
        pd.DataFrame().to_excel(libro, sheet_name="Portada", index=False)  # Hoja vacía: se salta.
        df.to_excel(libro, sheet_name="Datos", index=False)
    leido, hoja, hojas = leer_excel(origen)
    assert hoja == "Datos" and hojas == ["Portada", "Datos"] and leido.shape == df.shape
    sin_extension = tmp_path / "subida"  # La subida web guarda el archivo sin extensión.
    sin_extension.write_bytes(origen.read_bytes())
    resumen = m_convertir_excel(str(sin_extension), str(tmp_path / "datos.csv"), ".xlsx")
    assert resumen["filas"] == 80 and resumen["hoja"] == "Datos"
    pd.testing.assert_frame_equal(leer_tabla(tmp_path / "datos.csv"), leer_tabla(origen), check_dtype=False)


def esquema_one_hot() -> dict:
    esquema = esquema_desercion()
    esquema["columnas"][2] = {"columna": "genero", "rol": "inmutable", "codificacion": "one_hot", "categorias": ["F", "M"],
                              "nombre": "Género"}
    return esquema


def test_one_hot_crea_un_concepto_indicador_por_categoria():
    df = dataset_desercion(300)
    objeto = esquema_desde_dict(esquema_one_hot())
    assert [c.columna for c in objeto.conceptos[:3]] == ["edad", "genero=F", "genero=M"]
    assert objeto.conceptos[1].nombre == "Género: F" and objeto.columnas_origen[:2] == ["edad", "genero"]
    X = Preprocesador(objeto).ajustar_transformar(df)
    np.testing.assert_allclose(X[:, 1] + X[:, 2], 1.0)  # Exactamente un indicador activo por registro.
    np.testing.assert_allclose(X[:, 1], (df["genero"] == "F").astype(float))
    # Ida y vuelta: una sola columna one-hot con sus categorías y el mismo esquema.
    assert esquema_desde_dict(esquema_a_dict(objeto)) == objeto
    assert validar_esquema(esquema_one_hot(), df)["ok"]
    # Los grupos por perfil usan la columna de origen.
    np.testing.assert_array_equal(grupos_por_perfil(df, objeto), grupos_por_perfil(df, esquema_desde_dict(esquema_desercion())))
    variable = estadistica_variable(df, objeto, "genero")
    assert [c["categoria"] for c in variable["categorias"]] == ["F", "M"] and variable["nombre"] == "Género"


def test_one_hot_no_se_permite_en_acciones_ni_con_una_categoria():
    malo = esquema_desercion()
    malo["columnas"][3] = {"columna": "horas_estudio", "rol": "accion", "codificacion": "one_hot", "categorias": ["1", "2"]}
    malo["columnas"][2] = {"columna": "genero", "rol": "inmutable", "codificacion": "one_hot", "categorias": ["F"]}
    with pytest.raises(ErrorEsquema) as error:
        esquema_desde_dict(malo)
    texto = " ".join(error.value.errores)
    assert "acción" in texto and "categorías" in texto


def test_pipeline_con_one_hot_y_mascara(tmp_path):
    ruta = tmp_path / "datos.csv"
    dataset_desercion(700).to_csv(ruta, index=False)
    objeto = esquema_desde_dict(esquema_one_hot())
    opciones = OpcionesPipeline(
        validacion_cruzada=False, config_ag=AG_RAPIDO,
        aristas_excluidas=(("genero=F", "desercion"), ("genero=M", "desercion")),
    )
    r = ejecutar(cargar_datos(ruta, objeto), objeto, opciones)
    objetivo = r.pre.indice_objetivo
    assert r.fcm.pesos[r.pre.indice("genero=F"), objetivo] == 0 and not r.fcm.estructura[r.pre.indice("genero=M"), objetivo]
    assert r.fcm.pesos[r.pre.indice("tutorias"), objetivo] > 0  # Más tutorías, menos deserción.
    assert r.reporte()["configuracion"]["aristas_excluidas"] == [["genero=F", "desercion"], ["genero=M", "desercion"]]
    assert r.reporte()["configuracion"]["fcm"]["metodo_pesos"] == "bptt"
    with pytest.raises(ValueError, match="no son conceptos"):
        ejecutar(cargar_datos(ruta, objeto), objeto, OpcionesPipeline(validacion_cruzada=False, aristas_excluidas=(("nada", "desercion"),)))


def test_estructura_lista_las_aristas_que_la_mascara_puede_quitar():
    estructura = m_estructura(esquema_desercion())
    destinos = {a["destino"] for a in estructura["aristas"]}
    assert destinos == {"desercion"} and len(estructura["aristas"]) == 7  # Siete fuentes fijas hacia el objetivo.
    assert estructura["conceptos"][-1]["rol"] == "objetivo"


def test_perfil_de_riesgo_coincide_con_el_registro_y_genera_reporte(entrenado):
    _, modelo, datos = entrenado
    registro = datos.iloc[[5]]
    perfil = {c: registro.iloc[0][c] for c in modelo.esquema.columnas_origen if c != "desercion"}
    prescriptor = PrescriptorAG(modelo)
    del perfil["edad"]
    with pytest.raises(ValueError, match="Faltan valores del perfil: edad"):
        prescriptor.prescribir(perfil)
    perfil["edad"] = "veinte"
    with pytest.raises(ValueError, match="no es un número"):
        prescriptor.prescribir(perfil)
    perfil["edad"] = str(registro.iloc[0]["edad"])
    desde_perfil = prescriptor.prescribir(perfil, beta=0.4)
    desde_registro = prescriptor.prescribir(registro, beta=0.4)
    # El objetivo es dinámico y su punto fijo no depende del valor inicial: misma predicción de partida.
    assert desde_perfil["base"]["activacion"] == pytest.approx(desde_registro["base"]["activacion"], abs=1e-4)
    assert desde_perfil["reporte"]["texto"].startswith("Para este perfil")
    # El historial empieza en la población inicial (generación 0).
    assert len(desde_perfil["historial"]["mejor"]) == desde_perfil["generaciones"] + 1 == len(desde_perfil["historial"]["promedio"])
    assert {c["rol"] for c in desde_perfil["contribuciones"]} <= {"inmutable", "accion", "mutable"}
    assert desde_perfil["meta"]["nivel"] == "No"
    assert desde_perfil["perfil"]["edad"] == perfil["edad"] and "perfil" not in desde_registro
    with pytest.raises(ValueError, match="no existe"):
        prescriptor.prescribir(perfil, nivel_meta="Quizás")


def test_reporte_individual_traduce_los_deltas_a_frases():
    prescripcion = {
        "acciones": [
            {"nombre": "Recursos visitados", "min": 0, "max": 100, "actual": {"valor": 20.0}, "recomendada": {"valor": 60.0}, "cambio": 40.0},
            {"nombre": "Grupos de discusión", "min": 0, "max": 100, "actual": {"valor": 30.0}, "recomendada": {"valor": 30.0}, "cambio": 0.0},
        ],
        "base": {"activacion": 0.31, "nivel": "L"},
        "prescrito": {"activacion": 0.8, "nivel": "H"},
        "meta": {"valor": 1.0, "nivel": "H", "tolerancia": 0.25},
        "contribuciones": [{"nombre": "Ausentismo", "rol": "mutable", "aporte_prescrito": -0.62},
                           {"nombre": "Nacionalidad", "rol": "inmutable", "aporte_prescrito": -0.7}],
    }
    reporte = reporte_individual(prescripcion, "Rendimiento académico", "el estudiante 7")
    assert reporte["acciones"] == ["Aumentar Recursos visitados de 20 a 60 (+40; 40 % de su rango)."]
    assert "mantener Grupos de discusión en 30" in reporte["texto"]
    assert "pasa de 0,31 (L) a 0,8 (H) y alcanza la meta (H)" in reporte["texto"]
    assert "Ausentismo (aporte -0,62)" in reporte["frenos"] and "Nacionalidad" not in reporte["frenos"]
    assert numero(1234.5) == "1.234,5" and numero(-0.0001, 2) == "0" and numero(40.0) == "40"


def test_reporte_explica_cuando_el_fcm_ya_esta_en_la_meta():
    # Vino observado en 3 con meta escalonada 4: el FCM ya lo ve en 4 y no hay nada que cambiar.
    prescripcion = {
        "acciones": [], "base": {"activacion": 0.24, "nivel": "4"}, "prescrito": {"activacion": 0.24, "nivel": "4"},
        "meta": {"valor": 1 / 6, "nivel": "4", "tolerancia": 1 / 12}, "nivel_observado": "3",
    }
    reporte = reporte_individual(prescripcion, "Calidad", "el vino 294")
    assert "ya ubica al vino 294 en 4" in reporte["plan"] and "nivel observado es 3" in reporte["plan"]
    assert reporte["alcanza_meta"]  # Pasarse de la meta también es llegar.


def test_reporte_agrupa_las_acciones_binarias():
    def campana(n, antes, despues):
        return {"columna": f"AcceptedCmp{n}", "nombre": f"Campaña {n}", "min": 0, "max": 1, "categorias": ["0", "1"],
                "actual": {"valor": float(antes), "categoria": str(antes)}, "recomendada": {"valor": float(despues), "categoria": str(despues)},
                "cambio": float(despues - antes)}

    prescripcion = {
        "acciones": [campana(1, 0, 1), campana(2, 0, 0), campana(3, 1, 1), campana(4, 0, 0), campana(5, 0, 1)],
        "base": {"activacion": 0.2, "nivel": "0"},
        "prescrito": {"activacion": 0.7, "nivel": "1"},
        "meta": {"valor": 1.0, "nivel": "1", "tolerancia": 0.5},
    }
    reporte = reporte_individual(prescripcion, "Respuesta", "este cliente")
    assert reporte["plan"].startswith("Para este cliente se recomienda activar Campaña 1 y Campaña 5.")
    assert "no activar Campaña 2 y Campaña 4" in reporte["plan"] and "mantener activa Campaña 3" in reporte["plan"]
    assert "esfuerzo de cambiarlas." in reporte["plan"]
    assert reporte["acciones"] == ["Activar Campaña 1 y Campaña 5."]


def test_resumen_de_prescripciones_del_conjunto_de_prueba(entrenado):
    r, modelo, _ = entrenado
    resumen = resumen_prescripciones(r.recomendaciones, modelo.acciones(), "Deserción", "No", "desercion", r.reporte())
    assert resumen["n"] == len(r.recomendaciones)
    assert resumen["pct_exito"] == pytest.approx(r.metricas["PSR"])
    assert {a["columna"] for a in resumen["acciones"]} == {"horas_estudio", "asistencia", "tutorias"}
    assert "bosque aleatorio" in resumen["texto"] and len(resumen["ejemplos"]) <= 5


def test_relaciones_entre_variables_y_datos_normalizados():
    df = dataset_desercion(400)
    objeto = esquema_desde_dict(esquema_desercion())
    pagina = normalizados(df, objeto, desde=10, cantidad=5)
    assert pagina["total"] == 400 and [f["id"] for f in pagina["filas"]] == list(range(10, 15))
    valores = [v for f in pagina["filas"] for c, v in f.items() if c not in ("id", "nivel")]
    assert min(valores) >= 0 and max(valores) <= 1
    for metodo in ("pearson", "spearman", "parcial"):
        matriz = np.array(correlaciones(df, objeto, metodo)["matriz"], dtype=float)
        np.testing.assert_allclose(np.diag(matriz), 1.0)
        np.testing.assert_allclose(matriz, matriz.T, atol=1e-9)
    puntos = dispersion(df, objeto, "horas_estudio", "beca", max_puntos=100)
    assert len(puntos["puntos"]) == 100 and puntos["y"]["categorias"] == ["No", "Sí"]
    assert {p["nivel"] for p in puntos["puntos"]} <= {"Sí", "No"}
    perfil = estadisticas(df, objeto)["perfil_niveles"]
    horas = next(p for p in perfil if p["columna"] == "horas_estudio")
    assert horas["medias"]["No"] > horas["medias"]["Sí"]  # Quienes no desertan estudian más.
    assert perfil_base(df, objeto)["valores"]["genero"] in ("F", "M")
    assert perfil_base(df, objeto, 3)["valores"]["edad"] == int(df.loc[3, "edad"])


def dataset_desercion_por_nota(n: int = 600, semilla: int = 2) -> pd.DataFrame:
    """Deserción desbalanceada (~15 %) definida por la nota final, con True/False como en muchos CSV."""
    rng = np.random.default_rng(semilla)
    df = pd.DataFrame(
        {
            "Gender": rng.choice(["F", "M"], n),
            "Study_Time": rng.integers(1, 5, n),
            "Number_of_Absences": rng.integers(0, 30, n),
            "Number_of_Failures": rng.choice([0, 0, 0, 1, 2], n),
        }
    )
    z = 13 + 0.8 * df.Study_Time - 0.15 * df.Number_of_Absences - 1.8 * df.Number_of_Failures + rng.normal(0, 2, n)
    df["Final_Grade"] = np.clip(np.round(z), 0, 20).astype(int)
    df["Dropped_Out"] = df["Final_Grade"] < 10
    return df


def test_columnas_booleanas_se_leen_como_categorias(tmp_path):
    df = dataset_desercion_por_nota()
    ruta = tmp_path / "desercion.csv"
    df.to_csv(ruta, index=False)
    leido = leer_tabla(ruta)
    assert set(leido["Dropped_Out"]) == {"True", "False"}
    # También desde un DataFrame con booleanas: no hay cuartiles de True/False (antes fallaba con "numpy boolean subtract").
    perfil = {p["columna"]: p for p in perfilar(df)["perfil"]}
    assert perfil["Dropped_Out"]["tipo_dato"] == "categorico" and "q1" not in perfil["Dropped_Out"]
    assert {c["valor"] for c in perfil["Dropped_Out"]["categorias"]} == {"True", "False"}


def test_sugerencia_reconoce_la_desercion_y_excluye_la_columna_que_la_define(tmp_path):
    ruta = tmp_path / "desercion.csv"
    dataset_desercion_por_nota().to_csv(ruta, index=False)
    df = leer_tabla(ruta)
    resultado = perfilar(df)
    sugerido = {c["columna"]: c for c in resultado["esquema_sugerido"]["columnas"]}
    assert resultado["esquema_sugerido"]["objetivo"] == "Dropped_Out"
    assert sugerido["Dropped_Out"]["orden"] == ["True", "False"]  # Desertar es el peor desenlace.
    assert sugerido["Final_Grade"]["rol"] == "excluir"
    assert any("Final_Grade" in a and "definición" in a for a in resultado["avisos"])
    assert sugerido["Study_Time"]["rol"] == "accion"
    # Si el usuario vuelve a incluir la nota final, la validación lo advierte.
    esquema = resultado["esquema_sugerido"]
    esquema["columnas"] = [
        {"columna": "Final_Grade", "rol": "mutable", "codificacion": "numerica"} if c["columna"] == "Final_Grade" else c
        for c in esquema["columnas"]
    ]
    validacion = validar_esquema(esquema, df)
    assert validacion["ok"] and any("Final_Grade" in a and "filtrar" in a for a in validacion["avisos"])


def test_equilibrar_niveles_mejora_la_deteccion_del_nivel_minoritario(tmp_path):
    ruta = tmp_path / "desercion.csv"
    df = dataset_desercion_por_nota(1500)
    df.drop(columns="Final_Grade").to_csv(ruta, index=False)
    esquema = perfilar(leer_tabla(ruta))["esquema_sugerido"]
    objeto = esquema_desde_dict(esquema)
    datos = cargar_datos(ruta, objeto)
    resultados = {}
    for equilibrar in (False, True):
        opciones = OpcionesPipeline(
            validacion_cruzada=equilibrar, config_ag=AG_RAPIDO, config_fcm=ConfigFCM(balancear_niveles=equilibrar),
            config_seleccion=ConfigSeleccion(pliegues=3, rejilla_lambda=(1.0, 2.0), rejilla_alpha=(1e-3,)),
        )
        resultados[equilibrar] = ejecutar(datos, objeto, opciones)
    recall = {k: r.prediccion["por_clase"]["True"]["recall"] for k, r in resultados.items()}
    assert recall[True] > recall[False]
    tabla = resultados[True].seleccion_cv
    assert "exactitud_equilibrada" in tabla and tabla["exactitud_equilibrada"].is_monotonic_decreasing
    assert resultados[True].reporte()["configuracion"]["fcm"]["balancear_niveles"] is True


def test_figuras_del_informe(entrenado, tmp_path):
    from prvfcm.visualizacion import generar_figuras

    r, _, _ = entrenado
    figuras = generar_figuras(r, tmp_path / "figuras")
    assert "red_fcm.png" in figuras and "convergencia_ag.png" in figuras
    assert all((tmp_path / "figuras" / f).stat().st_size > 10_000 for f in figuras)
