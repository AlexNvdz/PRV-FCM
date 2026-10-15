"""Variantes: articulo con BPTT o con PSO de Clerc; mejorado con β pequeño; cuántos pesos del PSO quedan en la cota."""
import json
import sys
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
from prvfcm.esquema import esquema_desde_dict  # noqa: E402
from prvfcm.pipeline import ejecutar, opciones_desde_dict  # noqa: E402
from prvfcm.preprocesamiento import cargar_datos  # noqa: E402

esquema = esquema_desde_dict(json.loads((RAIZ / "data/esquemas/heart.json").read_text(encoding="utf-8")))
datos = cargar_datos(RAIZ / "data/heart.csv", esquema)
CASOS = {
    "articulo con PSO literal (perfil)": {"perfil": "articulo"},
    "articulo con BPTT": {"perfil": "articulo", "metodo_pesos": "bptt"},
    "articulo con PSO de Clerc": {"perfil": "articulo", "pso": {"inercia": 0.7298, "c1": 1.496, "c2": 1.496}},
    "mejorado, β = 0,05, permite bajar": {"beta": 0.05, "permitir_reducciones": True},
    "mejorado, β = 0, permite bajar": {"beta": 0.0, "permitir_reducciones": True},
}
for nombre, opciones in CASOS.items():
    r = ejecutar(datos, esquema, opciones_desde_dict(opciones))
    pre, fcm, o = r.pre, r.fcm, r.pre.indice_objetivo
    ichol, ibp = pre.indice("chol"), pre.indice("trestbps")
    activas = fcm.pesos[fcm.estructura]
    rec = r.recomendaciones
    chol_a, chol_r = rec["chol_actual"], rec["chol_recomendado"]
    bp_a, bp_r = rec["trestbps_actual"], rec["trestbps_recomendado"]
    print(
        f"{nombre:<38} | exactitud {100 * r.prediccion['exactitud_rendimiento']:.1f} % | w chol {fcm.pesos[ichol, o]:+.3f}, w trestbps {fcm.pesos[ibp, o]:+.3f} | "
        f"pesos en la cota {np.mean(np.isclose(np.abs(activas), 1)) * 100:.0f} % | éxito {r.metricas['PSR_base']:.1f} -> {r.metricas['PSR']:.1f} % | "
        f"chol sube {100 * np.mean(chol_r > chol_a + 0.5):.1f} % (≥240 {100 * np.mean(chol_r >= 240):.1f} %), baja {100 * np.mean(chol_r < chol_a - 0.5):.1f} % | "
        f"presión sube {100 * np.mean(bp_r > bp_a + 0.5):.1f} %, baja {100 * np.mean(bp_r < bp_a - 0.5):.1f} %, Δ medio {np.mean(bp_r - bp_a):+.1f}",
        flush=True,
    )
