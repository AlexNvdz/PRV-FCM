"""Análisis: ¿por qué el perfil "articulo" sube el colesterol en heart? Imprime todas las cifras."""
import json
import sys
from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ))
from prvfcm.esquema import esquema_desde_dict  # noqa: E402
from prvfcm.pipeline import ejecutar, opciones_desde_dict  # noqa: E402
from prvfcm.prescripcion import PrescriptorPRVFCM  # noqa: E402
from prvfcm.preprocesamiento import cargar_datos  # noqa: E402

base = json.loads((RAIZ / "data/esquemas/heart.json").read_text(encoding="utf-8"))
invertido = json.loads(json.dumps(base))
for c in invertido["columnas"]:
    if c["columna"] == "target":
        c["orden"] = ["1", "0"]
crudo = pd.read_csv(RAIZ / "data/heart.csv")
print("Medias por target:\n", crudo.groupby("target")[["chol", "trestbps", "thalach", "oldpeak", "exang", "ca"]].mean().round(1).to_string())
print("Correlación de Pearson con target:", crudo[["chol", "trestbps"]].corrwith(crudo["target"]).round(3).to_dict())
print("Rango de chol", crudo.chol.min(), crudo.chol.max(), "| trestbps", crudo.trestbps.min(), crudo.trestbps.max())

CASOS = {
    "articulo": (base, {"perfil": "articulo"}),
    "mejorado (solo subir, defecto)": (base, {}),
    "mejorado (permite bajar)": (base, {"permitir_reducciones": True}),
    "articulo, target invertido": (invertido, {"perfil": "articulo"}),
    "mejorado (permite bajar), target invertido": (invertido, {"permitir_reducciones": True}),
}


def recomendadas(r, prescriptor):
    """Acciones recomendadas en unidades originales para los registros de prueba prescritos."""
    resultados = prescriptor.prescribir_lote(r.X_pru[r.seleccion], semilla=42, mostrar_progreso=False)
    pre = r.pre
    salida = {}
    for k, i in enumerate(pre.indices_accion):
        col = pre.columnas[i]
        salida[col] = (pre.desnormalizar(np.array([x.acciones_actuales[k] for x in resultados]), col),
                       pre.desnormalizar(np.array([x.acciones_recomendadas[k] for x in resultados]), col))
    exito = np.mean([abs(x.estado_prescrito[pre.indice_objetivo] - 1) <= r.config_prescripcion.tolerancia_exito for x in resultados])
    return salida, exito


def describir(nombre, salida, exito):
    chol_a, chol_r = salida["chol"]
    bp_a, bp_r = salida["trestbps"]
    n = len(chol_a)
    print(
        f"  {nombre:<44} n {n:>3} | éxito {100 * exito:5.1f} % | chol sube {100 * np.mean(chol_r > chol_a + 0.5):5.1f} %, "
        f"Δ medio {np.mean(chol_r - chol_a):+6.1f}, ≥240 {100 * np.mean(chol_r >= 240):5.1f} % (antes {100 * np.mean(chol_a >= 240):5.1f} %), "
        f"≥300 {100 * np.mean(chol_r >= 300):5.1f} %, máx {chol_r.max():.0f} | presión sube {100 * np.mean(bp_r > bp_a + 0.5):5.1f} %, "
        f"Δ medio {np.mean(bp_r - bp_a):+6.1f}, ≥140 {100 * np.mean(bp_r >= 140):5.1f} % (antes {100 * np.mean(bp_a >= 140):5.1f} %)"
    )


for nombre, (esquema_dict, opciones) in CASOS.items():
    esquema = esquema_desde_dict(esquema_dict)
    r = ejecutar(cargar_datos(RAIZ / "data/heart.csv", esquema), esquema, opciones_desde_dict(opciones))
    pre, fcm, o = r.pre, r.fcm, r.pre.indice_objetivo
    ichol, ibp = pre.indice("chol"), pre.indice("trestbps")
    X = r.X_ent
    corr = {c: float(np.corrcoef(X[:, pre.indice(c)], X[:, o])[0, 1]) for c in ("chol", "trestbps")}
    # Efecto total: activación final del objetivo al subir la acción 0,1 (escala [0, 1]) en los prescritos.
    estados = r.X_pru[r.seleccion]
    base_final = fcm.predecir(estados)[:, o]
    efecto = {}
    for c, i in (("chol", ichol), ("trestbps", ibp)):
        subido = estados.copy()
        subido[:, i] = np.clip(subido[:, i] + 0.1, 0, 1)
        efecto[c] = float(np.mean(fcm.predecir(subido)[:, o] - base_final))
    print(f"\n=== {nombre}: {r.config_fcm.metodo_pesos}, {r.config_fcm.inferencia}, {r.config_fcm.activacion}, λ {r.config_fcm.lambda_:g}; "
          f"exactitud {100 * r.prediccion['exactitud_rendimiento']:.1f} %; mejor nivel «{esquema.mejor_nivel}»; dinámicos {[pre.columnas[i] for i in pre.indices_dinamicos]}")
    print(f"  peso directo hacia target: chol {fcm.pesos[ichol, o]:+.3f}, trestbps {fcm.pesos[ibp, o]:+.3f} | "
          f"correlación con target (entrenamiento, escala del objetivo): chol {corr['chol']:+.3f}, trestbps {corr['trestbps']:+.3f}")
    print(f"  efecto total de +0,1 en la acción sobre el objetivo: chol {efecto['chol']:+.4f}, trestbps {efecto['trestbps']:+.4f}")
    if pre.indices_dinamicos.size > 1:
        for c, i in (("chol", ichol), ("trestbps", ibp)):
            hacia = {pre.columnas[j]: round(float(fcm.pesos[i, j]), 3) for j in pre.indices_dinamicos if fcm.pesos[i, j]}
            print(f"  pesos de {c} hacia los dinámicos: {hacia}")
    rec = r.recomendaciones
    caso = rec[(rec["chol_actual"] >= 300) & (rec["chol_recomendado"] > 500)]
    if len(caso):
        print("  casos chol > 500:", caso[["id_estudiante", "chol_actual", "chol_recomendado", "trestbps_actual", "trestbps_recomendado"]].head(3).to_dict("records"))
    describir("prescripción del perfil", recomendadas(r, r.prescriptor)[0], np.mean(r.exito))
    if opciones.get("perfil") == "articulo":
        presc = r.config_prescripcion
        deseado = {o: 1.0}
        variantes = {
            "aptitud = error (en vez de Tabla 4)": replace(presc, aptitud="error"),
            "con siembra de las acciones actuales": replace(presc, sembrar=True),
            "β = 0,4": replace(presc, beta_esfuerzo=0.4),
            "siembra + β = 0,4 + aptitud error": replace(presc, sembrar=True, beta_esfuerzo=0.4, aptitud="error"),
        }
        for etiqueta, config in variantes.items():
            p = PrescriptorPRVFCM(fcm, pre.indices_accion, deseado, None, r.config_ag, config, None)
            describir(etiqueta, *recomendadas(r, p))
        # Una acción sin efecto: con β = 0 y sin siembra, su valor recomendado es azar.
        sin_efecto = replace(fcm.config)
        copia = type(fcm)(fcm.estructura, fcm.indices_fijos, sin_efecto, fcm.nombres)
        copia.pesos, copia.sesgo = fcm.pesos.copy(), fcm.sesgo.copy()
        copia.pesos[ichol, :] = 0.0
        p = PrescriptorPRVFCM(copia, pre.indices_accion, deseado, None, r.config_ag, presc, None)
        salida, exito = recomendadas(r, p)
        print(f"  con el peso de chol en 0: chol recomendado media {salida['chol'][1].mean():.0f}, DE {salida['chol'][1].std():.0f}, "
              f"rango {salida['chol'][1].min():.0f}-{salida['chol'][1].max():.0f} (actual media {salida['chol'][0].mean():.0f})")
