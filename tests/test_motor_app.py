"""Pruebas del motor genérico que usa la aplicación web: esquema, perfilado, pipeline, modelo y servicio."""
import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from prvfcm.configuracion import ESQUEMA_XAPI, ConfigAG, ConfigFCM, ConfigPrescripcion, ConfigSeleccion
from prvfcm.esquema import ESQUEMA_XAPI_DICT, ErrorEsquema, esquema_a_dict, esquema_desde_dict, validar_esquema
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
    simulacion = modelo.simular(registro, {"horas_estudio": 30, "asistencia": 100, "tutorias": 12})
    assert simulacion["simulado"]["activacion"] >= simulacion["base"]["activacion"]  # Más acción, menos deserción.
    with pytest.raises(ValueError):
        modelo.simular(registro, {"edad": 20})
    prescripcion = modelo.prescribir(registro, beta=0.0, delta_max=0.3)
    for accion in prescripcion["acciones"]:
        assert accion["cambio"] >= -1e-9  # Solo incrementos.
    assert prescripcion["prescrito"]["activacion"] >= prescripcion["base"]["activacion"] - 1e-9


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


def test_pipeline_con_one_hot_metodo_ridge_y_mascara(tmp_path):
    ruta = tmp_path / "datos.csv"
    dataset_desercion(700).to_csv(ruta, index=False)
    objeto = esquema_desde_dict(esquema_one_hot())
    opciones = OpcionesPipeline(
        validacion_cruzada=False, config_ag=AG_RAPIDO, config_fcm=ConfigFCM(metodo_pesos="ridge"),
        aristas_excluidas=(("genero=F", "desercion"), ("genero=M", "desercion")),
    )
    r = ejecutar(cargar_datos(ruta, objeto), objeto, opciones)
    objetivo = r.pre.indice_objetivo
    assert r.fcm.pesos[r.pre.indice("genero=F"), objetivo] == 0 and not r.fcm.estructura[r.pre.indice("genero=M"), objetivo]
    assert r.fcm.pesos[r.pre.indice("tutorias"), objetivo] > 0  # Más tutorías, menos deserción.
    assert r.reporte()["configuracion"]["aristas_excluidas"] == [["genero=F", "desercion"], ["genero=M", "desercion"]]
    assert r.reporte()["configuracion"]["fcm"]["metodo_pesos"] == "ridge"
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
    del perfil["edad"]
    with pytest.raises(ValueError, match="Faltan valores del perfil: edad"):
        modelo.prescribir_perfil(perfil)
    perfil["edad"] = "veinte"
    with pytest.raises(ValueError, match="no es un número"):
        modelo.prescribir_perfil(perfil)
    perfil["edad"] = str(registro.iloc[0]["edad"])
    desde_perfil = modelo.prescribir_perfil(perfil, beta=0.4)
    desde_registro = modelo.prescribir(registro, beta=0.4)
    # El objetivo es dinámico y su punto fijo no depende del valor inicial: misma predicción de partida.
    assert desde_perfil["base"]["activacion"] == pytest.approx(desde_registro["base"]["activacion"], abs=1e-4)
    assert desde_perfil["reporte"]["texto"].startswith("Para este perfil")
    assert len(desde_perfil["historial"]["mejor"]) == desde_perfil["generaciones"] == len(desde_perfil["historial"]["promedio"])
    assert {c["rol"] for c in desde_perfil["contribuciones"]} <= {"inmutable", "accion", "mutable"}
    assert desde_perfil["meta"]["nivel"] == "No"
    with pytest.raises(ValueError, match="no existe"):
        modelo.prescribir_perfil(perfil, nivel_meta="Quizás")


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
