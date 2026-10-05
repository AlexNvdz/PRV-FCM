"""
Motor PRV-FCM para la aplicación web (Node.js).

    python -m prvfcm.servicio worker
        Proceso persistente. Lee una petición JSON por línea en stdin:
            {"id": 7, "metodo": "simular", "params": {...}}
        y responde una línea JSON en stdout:
            {"id": 7, "ok": true, "resultado": {...}}   o   {"id": 7, "ok": false, "error": "..."}

    python -m prvfcm.servicio entrenar --datos D.csv --esquema E.json [--opciones O.json] --salida DIR
        Ejecuta el pipeline completo y guarda en DIR: metricas.json,
        recomendaciones.csv, pesos_fcm.csv, seleccion_hiperparametros.csv,
        modelo.json, graficas.json y figuras/*.png (grafo NetworkX y
        gráficas matplotlib). Emite un evento JSON por línea:
        {"evento": "etapa" | "progreso" | "fin" | "error", ...}.

    python -m prvfcm.servicio esquema-xapi
        Imprime el esquema del dataset xAPI-Edu-Data.

stdout solo lleva el protocolo: cualquier otra impresión se desvía a stderr.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import traceback
from dataclasses import fields, replace
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from .configuracion import ConfigAG, ConfigFCM, ConfigPrescripcion, ConfigSeleccion
from .esquema import ESQUEMA_XAPI_DICT, ErrorEsquema, esquema_desde_dict, rol_de, segmento_desde_dict, validar_esquema
from .fcm import METODOS_PESOS, construir_estructura
from .modelo import ModeloPRVFCM, guardar_modelo
from .perfilado import (
    correlaciones,
    dispersion,
    estadistica_variable,
    estadisticas,
    filas,
    normalizados,
    perfil_base,
    perfilar,
)
from .pipeline import OpcionesPipeline, ResultadoPipeline, ejecutar
from .preprocesamiento import Preprocesador, cargar_datos, etiquetas_objetivo, leer_csv, leer_excel
from .reporte import resumen_prescripciones

VERSION_MOTOR = "1.1"
NOMBRE_METODO = {"bptt": "BPTT", "ridge": "Ridge", "lasso": "Lasso", "correlacion_parcial": "correlación parcial"}


# ---------------------------------------------------------------------------
# JSON
# ---------------------------------------------------------------------------
def limpiar(objeto):
    """Convierte tipos de NumPy y pandas a JSON; NaN e infinitos pasan a null."""
    if isinstance(objeto, dict):
        return {str(k): limpiar(v) for k, v in objeto.items()}
    if isinstance(objeto, (list, tuple, set)):
        return [limpiar(v) for v in objeto]
    if isinstance(objeto, np.ndarray):
        return limpiar(objeto.tolist())
    if isinstance(objeto, (bool, np.bool_)):
        return bool(objeto)
    if isinstance(objeto, (int, np.integer)):
        return int(objeto)
    if isinstance(objeto, (float, np.floating)):
        valor = float(objeto)
        return valor if math.isfinite(valor) else None
    if objeto is None or objeto is pd.NA or objeto is pd.NaT:
        return None
    if isinstance(objeto, pd.Timestamp):
        return objeto.isoformat()
    return objeto


def a_json(objeto) -> str:
    return json.dumps(limpiar(objeto), ensure_ascii=False, allow_nan=False)


# ---------------------------------------------------------------------------
# Cachés: el worker atiende muchas consultas sobre los mismos archivos
# ---------------------------------------------------------------------------
_CACHE: dict[tuple, object] = {}
MAX_CACHE = 8


def _cacheado(clave: tuple, crear: Callable[[], object]):
    if clave not in _CACHE:
        if len(_CACHE) >= MAX_CACHE:
            _CACHE.pop(next(iter(_CACHE)))
        _CACHE[clave] = crear()
    return _CACHE[clave]


def _marca(ruta: str) -> float:
    return os.path.getmtime(ruta)


def _crudo(ruta: str) -> pd.DataFrame:
    return _cacheado(("crudo", ruta, _marca(ruta)), lambda: leer_csv(ruta))


def _datos(ruta: str, esquema: dict):
    objeto = esquema_desde_dict(esquema)
    clave = ("datos", ruta, _marca(ruta), json.dumps(esquema, sort_keys=True))
    return _cacheado(clave, lambda: cargar_datos(ruta, objeto)), objeto


def _modelo(ruta: str) -> ModeloPRVFCM:
    return _cacheado(("modelo", ruta, _marca(ruta)), lambda: ModeloPRVFCM.cargar(ruta))


def _registro(df: pd.DataFrame, id_estudiante) -> pd.DataFrame:
    try:
        return df.loc[[int(id_estudiante)]]
    except (KeyError, ValueError):
        raise ValueError(f"No existe el estudiante {id_estudiante} (debe ser una fila con datos completos).") from None


# ---------------------------------------------------------------------------
# Métodos del worker
# ---------------------------------------------------------------------------
def m_ping() -> dict:
    return {"version": VERSION_MOTOR, "python": sys.version.split()[0]}


def m_esquema_xapi() -> dict:
    return ESQUEMA_XAPI_DICT


def m_perfilar(ruta: str, nombre: str = "") -> dict:
    return perfilar(_crudo(ruta), nombre)


def m_convertir_excel(origen: str, destino: str, extension: str) -> dict:
    """Guarda como CSV (UTF-8) la primera hoja con datos de un libro de Excel."""
    df, hoja, hojas = leer_excel(origen, extension)
    df.to_csv(destino, index=False, encoding="utf-8")
    return {"filas": int(len(df)), "columnas": int(df.shape[1]), "hoja": hoja, "hojas": hojas}


def m_validar_esquema(ruta: str, esquema: dict) -> dict:
    return validar_esquema(esquema, _crudo(ruta))


def m_estadisticas(ruta: str, esquema: dict) -> dict:
    df, objeto = _datos(ruta, esquema)
    return estadisticas(df, objeto)


def m_estadistica_variable(ruta: str, esquema: dict, columna: str) -> dict:
    df, objeto = _datos(ruta, esquema)
    origen_one_hot = any(o == columna for o, _ in objeto.one_hot.values())
    if (columna not in objeto.columnas and not origen_one_hot) or columna == objeto.objetivo:
        raise ValueError(f"{columna} no es una variable del esquema (el objetivo tampoco cuenta).")
    return estadistica_variable(df, objeto, columna)


def m_normalizados(ruta: str, esquema: dict, desde: int = 0, cantidad: int = 20) -> dict:
    df, objeto = _datos(ruta, esquema)
    return normalizados(df, objeto, int(desde), int(cantidad))


def m_correlaciones(ruta: str, esquema: dict, metodo: str = "spearman") -> dict:
    df, objeto = _datos(ruta, esquema)
    clave = ("correlaciones", ruta, _marca(ruta), json.dumps(esquema, sort_keys=True), metodo)
    return _cacheado(clave, lambda: correlaciones(df, objeto, metodo))


def m_dispersion(ruta: str, esquema: dict, x: str, y: str, max_puntos: int = 1500) -> dict:
    df, objeto = _datos(ruta, esquema)
    return dispersion(df, objeto, x, y, int(max_puntos))


def m_estructura(esquema: dict) -> dict:
    """Conceptos y aristas que permite la estructura del FCM según los roles (base de la máscara causal)."""
    objeto = esquema_desde_dict(esquema)
    pre = Preprocesador(objeto)  # Solo se usan los índices por rol: no hace falta ajustarlo.
    estructura = construir_estructura(len(objeto.conceptos), pre.indices_fijos, pre.indices_dinamicos, pre.indice_objetivo)
    conceptos = [
        {"id": c.id, "columna": c.columna, "nombre": c.nombre, "rol": rol_de(objeto, c), "dinamico": bool(c.dinamico)}
        for c in objeto.conceptos
    ]
    return {
        "conceptos": conceptos,
        "aristas": [{"origen": objeto.conceptos[j].columna, "destino": objeto.conceptos[i].columna} for j, i in zip(*np.nonzero(estructura))],
    }


def m_perfil_base(ruta: str, esquema: dict, id: int | None = None) -> dict:
    df, objeto = _datos(ruta, esquema)
    return perfil_base(df, objeto, None if id is None else int(id))


def m_filas(ruta: str, esquema: dict | None = None, **consulta) -> dict:
    if esquema:
        df, objeto = _datos(ruta, esquema)
        return filas(df, objeto, **consulta)
    return filas(_crudo(ruta), None, **consulta)


def m_estudiante(ruta: str, esquema: dict, id: int, modelo: str | None = None) -> dict:
    df, objeto = _datos(ruta, esquema)
    registro = _registro(df, id)
    salida = {
        "id": int(id),
        "registro": registro.iloc[0].to_dict(),
        "nivel_observado": etiquetas_objetivo(registro, objeto)[0] if objeto.objetivo in objeto.codificacion_ordinal else None,
    }
    if modelo:
        m = _modelo(modelo)
        estado = m.estado(registro)
        salida["nivel_observado"] = m.pre.etiquetas(registro)[0]
        salida["en_prueba"] = int(id) in m.ids_prueba
        salida["prediccion"] = m.describir(estado)
        salida["acciones"] = [
            {**info, "actual": m.valor_original(info["columna"], estado[m.pre.indice(info["columna"])])}
            for info in m.acciones()
        ]
    return salida


def m_simular(modelo: str, ruta: str, esquema: dict, id: int, acciones: dict) -> dict:
    df, _ = _datos(ruta, esquema)
    return _modelo(modelo).simular(_registro(df, id), acciones)


def m_prescribir(modelo: str, ruta: str, esquema: dict, id: int, beta: float | None = None,
                 delta_max: float | None = None, permitir_reducciones: bool | None = None,
                 nivel_meta: str | None = None) -> dict:
    df, _ = _datos(ruta, esquema)
    return _modelo(modelo).prescribir(
        _registro(df, id), beta, delta_max, permitir_reducciones, semilla=int(id), nivel_meta=nivel_meta,
        sujeto=f"el estudiante {int(id)}",
    )


def m_prescribir_perfil(modelo: str, perfil: dict, beta: float | None = None, delta_max: float | None = None,
                        permitir_reducciones: bool | None = None, nivel_meta: str | None = None) -> dict:
    return _modelo(modelo).prescribir_perfil(perfil, beta, delta_max, permitir_reducciones, nivel_meta)


def m_resumen_prescripciones(directorio: str, nivel: str | None = None) -> dict:
    """Resumen en lenguaje natural de las prescripciones del conjunto de prueba."""
    carpeta = Path(directorio)
    ruta = str(carpeta / "recomendaciones.csv")
    tabla = _cacheado(("recomendaciones", ruta, _marca(ruta)), lambda: pd.read_csv(ruta))
    m = _modelo(str(carpeta / "modelo.json"))
    ruta_metricas = carpeta / "metricas.json"
    metricas = json.loads(ruta_metricas.read_text(encoding="utf-8")) if ruta_metricas.exists() else None
    nombre_objetivo = m.esquema.conceptos[m.pre.indice_objetivo].nombre
    return resumen_prescripciones(tabla, m.acciones(), nombre_objetivo, m.esquema.mejor_nivel, m.esquema.objetivo, metricas, nivel)


def m_modelo_info(modelo: str) -> dict:
    m = _modelo(modelo)
    return {
        "objetivo": m.esquema.objetivo,
        "niveles": m.esquema.niveles,
        "mejor_nivel": m.esquema.mejor_nivel,
        "metodo_pesos": m.fcm.config.metodo_pesos,
        "conceptos": m.conceptos(),
        "aristas": m.aristas(),
        "influencias": m.influencias(),
        "acciones": m.acciones(),
        "configuracion_prescripcion": {
            "beta": m.config_prescripcion.beta_esfuerzo,
            "delta_max": m.config_prescripcion.delta_max,
            "solo_incrementos": m.config_prescripcion.solo_incrementos,
        },
    }


def m_recomendaciones(directorio: str, **consulta) -> dict:
    ruta = str(Path(directorio) / "recomendaciones.csv")
    tabla = _cacheado(("recomendaciones", ruta, _marca(ruta)), lambda: pd.read_csv(ruta))
    return filas(tabla, None, con_id=False, **consulta)


METODOS: dict[str, Callable[..., dict]] = {
    "ping": m_ping,
    "esquema_xapi": m_esquema_xapi,
    "perfilar": m_perfilar,
    "convertir_excel": m_convertir_excel,
    "validar_esquema": m_validar_esquema,
    "estadisticas": m_estadisticas,
    "estadistica_variable": m_estadistica_variable,
    "normalizados": m_normalizados,
    "correlaciones": m_correlaciones,
    "dispersion": m_dispersion,
    "estructura": m_estructura,
    "perfil_base": m_perfil_base,
    "filas": m_filas,
    "estudiante": m_estudiante,
    "simular": m_simular,
    "prescribir": m_prescribir,
    "prescribir_perfil": m_prescribir_perfil,
    "modelo_info": m_modelo_info,
    "recomendaciones": m_recomendaciones,
    "resumen_prescripciones": m_resumen_prescripciones,
}


def mensaje_error(error: Exception) -> str:
    if isinstance(error, ErrorEsquema):
        return "Esquema inválido: " + " ".join(error.errores)
    if isinstance(error, (ValueError, KeyError, FileNotFoundError)):
        return str(error).strip("'\"")
    return f"{type(error).__name__}: {error}"


def worker() -> None:
    """Atiende peticiones hasta que stdin se cierre."""
    protocolo = sys.stdout
    sys.stdout = sys.stderr  # Cualquier print del motor va a stderr.
    for linea in iter(sys.stdin.readline, ""):
        if not linea.strip():
            continue
        id_peticion = None
        try:
            peticion = json.loads(linea)
            id_peticion = peticion.get("id")
            metodo = METODOS.get(peticion.get("metodo"))
            if metodo is None:
                raise ValueError(f"Método desconocido: {peticion.get('metodo')}")
            respuesta = {"id": id_peticion, "ok": True, "resultado": metodo(**(peticion.get("params") or {}))}
        except Exception as error:  # noqa: BLE001 (toda falla vuelve al cliente como respuesta)
            traceback.print_exc(file=sys.stderr)
            respuesta = {"id": id_peticion, "ok": False, "error": mensaje_error(error)}
        protocolo.write(a_json(respuesta) + "\n")
        protocolo.flush()


# ---------------------------------------------------------------------------
# Entrenamiento
# ---------------------------------------------------------------------------
def opciones_desde_dict(datos: dict, esquema_dict: dict) -> OpcionesPipeline:
    """Opciones de la aplicación (JSON) -> ``OpcionesPipeline``, con límites razonables."""
    proporcion = float(datos.get("proporcion_prueba", 0.3))
    if not 0.1 <= proporcion <= 0.5:
        raise ValueError("La proporción de prueba debe estar entre 0.1 y 0.5.")
    division = datos.get("division", "agrupada")
    if division not in ("agrupada", "aleatoria"):
        raise ValueError("La división debe ser 'agrupada' o 'aleatoria'.")
    base_sel = ConfigSeleccion()
    seleccion = ConfigSeleccion(
        pliegues=int(datos.get("pliegues", base_sel.pliegues)),
        rejilla_lambda=tuple(float(v) for v in datos.get("rejilla_lambda", base_sel.rejilla_lambda)),
        rejilla_alpha=tuple(float(v) for v in datos.get("rejilla_alpha", base_sel.rejilla_alpha)),
    )
    if not 2 <= seleccion.pliegues <= 10:
        raise ValueError("Los pliegues de la validación cruzada deben estar entre 2 y 10.")
    permitidos = {f.name for f in fields(ConfigAG)}
    ag = replace(ConfigAG(), **{k: v for k, v in (datos.get("ag") or {}).items() if k in permitidos})
    delta_max = datos.get("delta_max")
    metodo = datos.get("metodo_pesos", "bptt")
    if metodo not in METODOS_PESOS:
        raise ValueError(f"El método de pesos debe ser uno de {', '.join(METODOS_PESOS)}.")
    excluidas = datos.get("aristas_excluidas") or []
    if not all(isinstance(a, (list, tuple)) and len(a) == 2 for a in excluidas):
        raise ValueError("La máscara causal debe ser una lista de pares [origen, destino].")
    return OpcionesPipeline(
        proporcion_prueba=proporcion,
        semilla=int(datos.get("semilla", 42)),
        division=division,
        validacion_cruzada=bool(datos.get("validacion_cruzada", True)),
        config_fcm=ConfigFCM(
            lambda_=float(datos.get("lambda", 1.0)),
            alpha_l2=float(datos.get("alpha_l2", 1e-3)),
            metodo_pesos=metodo,
            balancear_niveles=bool(datos.get("balancear_niveles", False)),
        ),
        config_seleccion=seleccion,
        config_ag=ag,
        config_prescripcion=ConfigPrescripcion(
            beta_esfuerzo=float(datos.get("beta", 0.05)),
            solo_incrementos=not bool(datos.get("permitir_reducciones", False)),
            delta_max=float(delta_max) if delta_max else None,
        ),
        segmento=segmento_desde_dict(esquema_dict.get("segmento")),
        aristas_excluidas=tuple((str(o), str(d)) for o, d in excluidas),
    )


def _mensaje_etapa(etapa: str, r: ResultadoPipeline) -> str:
    if etapa == "preprocesamiento":
        mensaje = f"Datos divididos: {len(r.entrenamiento)} registros para entrenar y {len(r.prueba)} para probar."
        if r.opciones.division == "agrupada" and r.division != "agrupada":
            mensaje += f" Solo hay {r.grupos.nunique()} perfiles inmutables distintos: la división es aleatoria, no agrupada."
        return mensaje
    if etapa == "seleccion":
        mejor = r.seleccion_cv.iloc[0]
        if "exactitud_equilibrada" in mejor:
            return (
                f"Validación cruzada: λ = {mejor['lambda']:g}, α = {mejor['alpha_l2']:g} "
                f"({100 * mejor['exactitud_equilibrada']:.1f} % de exactitud equilibrada)."
            )
        return f"Validación cruzada: λ = {mejor['lambda']:g}, α = {mejor['alpha_l2']:g} ({100 * mejor['exactitud']:.1f} % de exactitud)."
    if etapa == "fcm":
        metodo = NOMBRE_METODO.get(r.config_fcm.metodo_pesos, r.config_fcm.metodo_pesos)
        excluidas = len(r.opciones.aristas_excluidas)
        return (
            f"FCM entrenado con {metodo}{f' y {excluidas} aristas excluidas' if excluidas else ''}: "
            f"{100 * r.prediccion['exactitud_rendimiento']:.1f} % de exactitud en prueba."
        )
    if etapa == "prescripcion":
        return f"Buscando acciones para {int(r.seleccion.sum())} estudiantes con el algoritmo genético."
    return f"Éxito prescriptivo: {r.metricas['PSR_base']:.1f} % con las acciones actuales y {r.metricas['PSR']:.1f} % con las prescritas."


def entrenar(datos: Path, esquema: Path, opciones: Path | None, salida: Path) -> int:
    protocolo = sys.stdout
    sys.stdout = sys.stderr

    def emitir(evento: dict) -> None:
        protocolo.write(a_json(evento) + "\n")
        protocolo.flush()

    ultimo: dict[str, int] = {}

    def progreso(tarea: str, hechos: int, total: int) -> None:
        porcentaje = int(100 * hechos / total)
        if ultimo.get(tarea) != porcentaje or hechos == total:
            ultimo[tarea] = porcentaje
            emitir({"evento": "progreso", "tarea": tarea, "hechos": hechos, "total": total})

    try:
        esquema_dict = json.loads(esquema.read_text(encoding="utf-8"))
        opciones_dict = json.loads(opciones.read_text(encoding="utf-8")) if opciones else {}
        objeto = esquema_desde_dict(esquema_dict)
        configuracion = opciones_desde_dict(opciones_dict, esquema_dict)
        emitir({"evento": "etapa", "etapa": "carga", "mensaje": "Leyendo y validando los datos."})
        df = cargar_datos(datos, objeto)
        r = ejecutar(
            df,
            objeto,
            configuracion,
            al_terminar_etapa=lambda etapa, res: emitir({"evento": "etapa", "etapa": etapa, "mensaje": _mensaje_etapa(etapa, res)}),
            al_progresar=progreso,
            nombre_datos=datos.name,
        )
        salida.mkdir(parents=True, exist_ok=True)
        r.guardar_resultados(salida)
        guardar_modelo(r, salida / "modelo.json")
        modelo = ModeloPRVFCM.cargar(salida / "modelo.json")
        figuras: list[str] = []
        try:
            from . import visualizacion  # matplotlib y networkx solo hacen falta aquí.

            figuras = visualizacion.generar_figuras(r, salida / "figuras")
            emitir({"evento": "etapa", "etapa": "figuras", "mensaje": f"{len(figuras)} figuras generadas con NetworkX y matplotlib."})
        except Exception:  # noqa: BLE001 (sin figuras el modelo sigue siendo útil)
            traceback.print_exc(file=sys.stderr)
        graficas = {
            **r.datos_graficas(),
            "objetivo": objeto.objetivo,
            "niveles": objeto.niveles,
            "mejor_nivel": objeto.mejor_nivel,
            "metodo_pesos": r.config_fcm.metodo_pesos,
            "aristas_excluidas": [list(a) for a in r.opciones.aristas_excluidas],
            "conceptos": modelo.conceptos(),
            "aristas": modelo.aristas(),
            "influencias": modelo.influencias(),
            "acciones_info": modelo.acciones(),
            "figuras": figuras,
        }
        (salida / "graficas.json").write_text(a_json(graficas), encoding="utf-8")
        emitir({"evento": "fin", "mensaje": "Modelo entrenado y guardado."})
        return 0
    except Exception as error:  # noqa: BLE001
        traceback.print_exc(file=sys.stderr)
        emitir({"evento": "error", "mensaje": mensaje_error(error)})
        return 1


def principal(argv: list[str] | None = None) -> int:
    for flujo in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m prvfcm.servicio", description="Motor PRV-FCM para la aplicación web.")
    ordenes = parser.add_subparsers(dest="orden", required=True)
    ordenes.add_parser("worker", help="proceso persistente de consultas (JSON por línea)")
    ordenes.add_parser("esquema-xapi", help="imprime el esquema del dataset xAPI-Edu-Data")
    orden_entrenar = ordenes.add_parser("entrenar", help="entrena y guarda un modelo")
    orden_entrenar.add_argument("--datos", type=Path, required=True)
    orden_entrenar.add_argument("--esquema", type=Path, required=True)
    orden_entrenar.add_argument("--opciones", type=Path)
    orden_entrenar.add_argument("--salida", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.orden == "worker":
        worker()
        return 0
    if args.orden == "esquema-xapi":
        print(a_json(ESQUEMA_XAPI_DICT))
        return 0
    return entrenar(args.datos, args.esquema, args.opciones, args.salida)


if __name__ == "__main__":
    sys.exit(principal())
