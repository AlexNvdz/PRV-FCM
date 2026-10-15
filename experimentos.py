"""
Experimentos de ablación: perfil "articulo" (PRV-FCM, 2023) frente a "mejorado", con PSO, BPTT y Ridge.

    python experimentos.py                       # todos los datasets y configuraciones
    python experimentos.py --datasets heart xapi480 --configuraciones articulo/pso mejorado/bptt

Cada ejecución es el pipeline completo (validación cruzada, prescripción, validación
externa y reconstrucción). Guarda en resultados_experimentos/:

* resumen.csv: una fila por dataset y configuración (exactitud, F1, tasa de éxito,
  bosque aleatorio, reconstrucción global y regla elegida).
* acciones.csv: la reconstrucción por acción (Tablas 11 y 12 de PRV-FCM).
* resumen.md: las dos tablas en Markdown.

Los CSV se completan a medida que termina cada ejecución, así que se puede
interrumpir y retomar (las ejecuciones ya guardadas se saltan).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import pandas as pd

from prvfcm.configuracion import ESQUEMA_XAPI
from prvfcm.esquema import esquema_desde_dict, segmento_desde_dict
from prvfcm.pipeline import SEGMENTO_AUSENTISMO, ejecutar, opciones_desde_dict
from prvfcm.preprocesamiento import cargar_datos

RAIZ = Path(__file__).resolve().parent
SALIDA = RAIZ / "resultados_experimentos"

# Dataset -> (CSV, esquema JSON o None para xAPI, opciones comunes a todas las configuraciones).
# Los esquemas de data/esquemas/ se retiraron en octubre de 2026 (siguen en el historial de git):
# un dataset sin su CSV o sin su esquema se omite.
# Todos se binarizan (dos niveles), como en PRV-FCM: así las dos configuraciones resuelven la misma tarea.
DATASETS = {
    "xapi480": (RAIZ / "data" / "xAPI-Edu-Data.csv", None, {"binarizar_objetivo": "M"}),
    "marketing": (RAIZ / "data" / "marketing_campaign.csv", RAIZ / "data" / "esquemas" / "marketing.json", {}),
    # Presión y colesterol deben poder bajar.
    "heart": (RAIZ / "data" / "heart.csv", RAIZ / "data" / "esquemas" / "heart.json", {"permitir_reducciones": True}),
    # Datos del usuario (aplicación). Final_Grade >= 10 es exactamente "no desertó"; Dropped_Out se excluye.
    "desercion": (
        RAIZ / "app" / "almacen" / "datasets" / "ds-muppty1k528c" / "datos.csv",
        RAIZ / "data" / "esquemas" / "desercion.json",
        {"binarizar_objetivo": 10},
    ),
}
CONFIGURACIONES = ["articulo/pso", "articulo/bptt", "articulo/ridge", "mejorado/bptt", "mejorado/ridge", "mejorado/pso"]


def correr(nombre: str, configuracion: str) -> tuple[dict, list[dict]]:
    ruta, ruta_esquema, comunes = DATASETS[nombre]
    perfil, metodo = configuracion.split("/")
    if ruta_esquema is None:
        esquema, segmento = ESQUEMA_XAPI, SEGMENTO_AUSENTISMO
    else:
        esquema_dict = json.loads(ruta_esquema.read_text(encoding="utf-8"))
        esquema, segmento = esquema_desde_dict(esquema_dict), segmento_desde_dict(esquema_dict.get("segmento"))
    opciones = opciones_desde_dict({**comunes, "perfil": perfil, "metodo_pesos": metodo}, segmento)
    inicio = time.time()
    r = ejecutar(cargar_datos(ruta, esquema), esquema, opciones, nombre_datos=ruta.name)
    segundos = time.time() - inicio
    p, m, e, rec = r.prediccion, r.metricas, r.externa, r.reconstruccion or {}
    g = rec.get("global", {})
    fila = {
        "dataset": nombre,
        "perfil": perfil,
        "metodo": metodo,
        "n_entrenamiento": len(r.entrenamiento),
        "n_sinteticos": r.n_sinteticos,
        "n_prueba": len(r.prueba),
        "inferencia": r.config_fcm.inferencia,
        "activacion": r.config_fcm.activacion,
        "lambda": r.config_fcm.lambda_,
        "alpha_l2": r.config_fcm.alpha_l2,
        "exactitud": p["exactitud_rendimiento"],
        "clase_mayoritaria": p["exactitud_clase_mayoritaria"],
        "F1_macro": p["F1_macro"],
        "bosque_exactitud": e["exactitud_prueba"],
        "n_prescritos": m["n_estudiantes"],
        "exito_base": m["PSR_base"],
        "exito": m["PSR"],
        "bosque_H_base": e["PSR_externo_base"],
        "bosque_H": e["PSR_externo"],
        "cambio_medio": m["cambio_medio_por_accion"],
        "rec_n": rec.get("n"),
        "rec_mae": g.get("mae"),
        "rec_mse": g.get("mse"),
        "rec_rmse": g.get("rmse"),
        "rec_r2": g.get("r2"),
        "psr_ec19": g.get("psr_ec19"),
        "ag": f"{r.config_ag.tam_poblacion}/{r.config_ag.generaciones}/{r.config_ag.tasa_cruce:g}/{r.config_ag.tasa_mutacion:g}",
        "pso_iteraciones": len(r.fcm.historial_perdida) - 1 if metodo == "pso" else None,
        "pso_perdida": r.fcm.historial_perdida[-1] if metodo == "pso" else None,
        "segundos": round(segundos, 1),
    }
    acciones = [{"dataset": nombre, "perfil": perfil, "metodo": metodo, **a} for a in rec.get("por_accion", [])]
    return fila, acciones


def anexar(ruta: Path, filas: list[dict]) -> None:
    if not filas:
        return
    tabla = pd.DataFrame(filas)
    tabla.to_csv(ruta, mode="a", header=not ruta.exists(), index=False, float_format="%.6g")


def escribir_resumen() -> None:
    claves = ["dataset", "perfil", "metodo"]

    def ordenar(tabla: pd.DataFrame) -> pd.DataFrame:
        orden = {"dataset": list(DATASETS), "perfil": ["articulo", "mejorado"], "metodo": ["pso", "bptt", "ridge"]}
        return tabla.sort_values(claves, key=lambda s: s.map({v: i for i, v in enumerate(orden[s.name])}), kind="stable")

    resumen = ordenar(pd.read_csv(SALIDA / "resumen.csv"))
    acciones = ordenar(pd.read_csv(SALIDA / "acciones.csv")) if (SALIDA / "acciones.csv").exists() else pd.DataFrame()
    pct = lambda v: f"{100 * v:.1f}"  # noqa: E731
    lineas = [
        "# Ablación: perfil «articulo» frente a «mejorado»",
        "",
        "Semilla 42. Objetivos de dos niveles. «éxito»: tasa de éxito prescriptivo del FCM (% que llega al mejor nivel);",
        "«bosque»: % que un bosque aleatorio independiente clasifica en el mejor nivel; «rec.»: reconstrucción de las acciones",
        "de los registros de prueba que ya están en el mejor nivel (escala [0, 1]; PSR de la ec. 19 = suma prescrita / suma real).",
        "",
        "| Dataset | Perfil | Método | Regla elegida | Exactitud | F1 | Éxito | Bosque | Rec. MAE | Rec. RMSE | R² | PSR ec. 19 | s |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for _, f in resumen.iterrows():
        regla = f"{f['inferencia']}, {f['activacion']}, λ {f['lambda']:g}"
        lineas.append(
            f"| {f['dataset']} | {f['perfil']} | {f['metodo']} | {regla} | {pct(f['exactitud'])} % | {pct(f['F1_macro'])} % | "
            f"{f['exito_base']:.1f} → {f['exito']:.1f} % | {f['bosque_H_base']:.1f} → {f['bosque_H']:.1f} % | "
            f"{f['rec_mae']:.3f} | {f['rec_rmse']:.3f} | {f['rec_r2']:.2f} | {f['psr_ec19']:.2f} | {f['segundos']:.0f} |"
        )
    if not acciones.empty:
        lineas += [
            "",
            "## Reconstrucción por acción (Tablas 11 y 12)",
            "",
            "| Dataset | Perfil | Método | Acción | MAE | MSE | RMSE | Real (media ± DE) | Prescrita (media ± DE) | Prueba | p |",
            "|---|---|---|---|---|---|---|---|---|---|---|",
        ]
        for _, a in acciones.iterrows():
            p = "—" if pd.isna(a["p"]) else f"{a['p']:.3f}"
            lineas.append(
                f"| {a['dataset']} | {a['perfil']} | {a['metodo']} | {a['columna']} | {a['mae']:.4f} | {a['mse']:.4f} | {a['rmse']:.4f} | "
                f"{a['media_real']:.3f} ± {a['de_real']:.3f} | {a['media_prescrita']:.3f} ± {a['de_prescrita']:.3f} | {a['prueba']} | {p} |"
            )
    (SALIDA / "resumen.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Ablación PRV-FCM: perfiles y métodos de W en varios datasets.")
    parser.add_argument("--datasets", nargs="+", choices=tuple(DATASETS), default=list(DATASETS))
    parser.add_argument("--configuraciones", nargs="+", choices=CONFIGURACIONES, default=CONFIGURACIONES)
    args = parser.parse_args()
    SALIDA.mkdir(exist_ok=True)
    hechas = set()
    if (SALIDA / "resumen.csv").exists():
        previas = pd.read_csv(SALIDA / "resumen.csv")
        hechas = set(zip(previas["dataset"], previas["perfil"] + "/" + previas["metodo"]))
    for nombre in args.datasets:
        faltan = [ruta for ruta in DATASETS[nombre][:2] if ruta is not None and not ruta.exists()]
        if faltan:
            print(f"{nombre}: no está {faltan[0]}; se omite.")
            continue
        for configuracion in args.configuraciones:
            if (nombre, configuracion) in hechas:
                continue
            print(f"{nombre} {configuracion} ...", flush=True)
            fila, acciones = correr(nombre, configuracion)
            anexar(SALIDA / "resumen.csv", [fila])
            anexar(SALIDA / "acciones.csv", acciones)
            print(
                f"  exactitud {100 * fila['exactitud']:.1f} % | éxito {fila['exito_base']:.1f} -> {fila['exito']:.1f} % | "
                f"bosque {fila['bosque_H_base']:.1f} -> {fila['bosque_H']:.1f} % | rec. MAE {fila['rec_mae']:.3f} | {fila['segundos']:.0f} s",
                flush=True,
            )
    escribir_resumen()


if __name__ == "__main__":
    main()
