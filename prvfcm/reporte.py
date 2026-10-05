"""
Reporte prescriptivo en lenguaje natural (paso 5 del flujo PRV-FCM).

Traduce los cambios (deltas) que el AG recomienda en los conceptos de acción
(C_P) a frases legibles, junto con el efecto que el FCM estima sobre el
concepto objetivo (C_T). Son plantillas deterministas: cada cifra sale de la
prescripción. El asistente (qwen2.5) parte de estas frases para redactar
recomendaciones pedagógicas, así no tiene que calcular ni inventar cifras.

El cambio de cada acción se expresa en unidades originales y como porcentaje
de su rango observado, (recomendada - actual) / (máximo - mínimo): es el
cambio en la escala normalizada [0, 1] con la que trabaja el FCM.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

NOTA_CAUSALIDAD = "El FCM resume asociaciones de los datos, no efectos causales comprobados: conviene acompañar el plan con seguimiento."

# Por debajo de esta fracción del rango, una acción se considera sin cambio.
CAMBIO_MINIMO = 0.005


def numero(valor: float, decimales: int = 1) -> str:
    """Número en formato es-CO sin ceros sobrantes: 1.234,5; 40; -0,25."""
    valor = float(valor)
    if round(valor, decimales) == 0:
        valor = 0.0
    texto = f"{valor:,.{decimales}f}".replace(",", " ").replace(".", ",").replace(" ", ".")
    if "," in texto:
        texto = texto.rstrip("0").rstrip(",")
    return texto


def porcentaje(valor: float, decimales: int = 1) -> str:
    return f"{numero(valor, decimales)} %"


def decimales_de(minimo: float, maximo: float) -> int:
    """Decimales para mostrar una variable según su rango (conteos de 0 a 100: ninguno)."""
    rango = abs(maximo - minimo)
    return 0 if rango > 20 else 1 if rango > 2 else 2


def unir(partes: list[str]) -> str:
    """Enumeración en español: "a", "a y b", "a, b y c"."""
    if len(partes) <= 1:
        return "".join(partes)
    return f"{', '.join(partes[:-1])} y {partes[-1]}"


def _valor(accion: dict, clave: str) -> str:
    dato = accion[clave]
    if dato.get("categoria") is not None:
        return f"«{dato['categoria']}»"
    return numero(dato["valor"], decimales_de(accion.get("min", 0.0), accion.get("max", 100.0)))


def frase_accion(accion: dict) -> tuple[str, bool]:
    """Frase de una acción y si cambia. ``accion`` sigue el formato de ``ModeloPRVFCM.prescribir``."""
    rango = (accion.get("max", 1.0) - accion.get("min", 0.0)) or 1.0
    fraccion = accion["cambio"] / rango
    actual, recomendada = _valor(accion, "actual"), _valor(accion, "recomendada")
    categorias = accion["actual"].get("categoria") is not None
    if abs(fraccion) < CAMBIO_MINIMO or (categorias and actual == recomendada):
        return f"mantener {accion['nombre']} en {actual}", False
    if categorias:
        return f"pasar {accion['nombre']} de {actual} a {recomendada}", True
    verbo = "aumentar" if fraccion > 0 else "reducir"
    detalle = f"{'+' if fraccion > 0 else '−'}{numero(abs(accion['cambio']), decimales_de(accion.get('min', 0.0), accion.get('max', 100.0)))}; {porcentaje(100 * abs(fraccion), 0)} de su rango"
    return f"{verbo} {accion['nombre']} de {actual} a {recomendada} ({detalle})", True


def reporte_individual(prescripcion: dict, nombre_objetivo: str, sujeto: str = "este perfil") -> dict:
    """Reporte de una prescripción individual.

    ``prescripcion`` es la salida de ``ModeloPRVFCM.prescribir``: acciones con
    valores actual y recomendado, estados base y prescrito, meta y aportes de
    cada concepto al objetivo. Devuelve el texto completo y sus partes.
    """
    frases = [frase_accion(a) for a in prescripcion["acciones"]]
    cambios = [f for f, cambia in frases if cambia]
    mantener = [f for f, cambia in frases if not cambia]
    base, prescrito, meta = prescripcion["base"], prescripcion["prescrito"], prescripcion["meta"]

    if cambios:
        plan = f"Para {sujeto} se recomienda {unir(cambios)}."
    else:
        plan = f"Para {sujeto} el algoritmo genético no encontró un cambio en las acciones que lo acerque a la meta."
    if mantener and cambios:
        plan += f" Además, {unir(mantener)}: el modelo no espera beneficio de cambiarla{'s' if len(mantener) > 1 else ''}."

    llega = abs(prescrito["activacion"] - meta["valor"]) <= meta["tolerancia"] + 1e-9
    resultado = (
        f"Con este plan, el FCM estima que {nombre_objetivo} pasa de {numero(base['activacion'], 2)} ({base['nivel']}) "
        f"a {numero(prescrito['activacion'], 2)} ({prescrito['nivel']})"
    )
    if llega:
        resultado += f" y alcanza la meta ({meta['nivel']})."
    else:
        resultado += f", sin alcanzar la meta ({meta['nivel']}): es el mayor avance que el modelo encuentra con estas acciones."

    frenos = [
        c for c in prescripcion.get("contribuciones", [])
        if c["rol"] == "mutable" and c["aporte_prescrito"] < -0.05
    ]
    frenos.sort(key=lambda c: c["aporte_prescrito"])
    texto_frenos = ""
    if frenos:
        detalle = unir([f"{c['nombre']} (aporte {numero(c['aporte_prescrito'], 2)})" for c in frenos[:3]])
        texto_frenos = f"Factores del sistema que lo alejan del mejor nivel y que el plan no cambia: {detalle}."

    texto = " ".join(t for t in (plan, resultado, texto_frenos) if t)
    return {
        "texto": texto,
        "plan": plan,
        "acciones": [f[0].upper() + f[1:] + "." for f in cambios],
        "mantener": [f[0].upper() + f[1:] + "." for f in mantener],
        "resultado": resultado,
        "frenos": texto_frenos,
        "alcanza_meta": bool(llega),
        "nota": NOTA_CAUSALIDAD,
    }


def resumen_prescripciones(
    tabla: pd.DataFrame,
    acciones: list[dict],
    nombre_objetivo: str,
    mejor_nivel: str,
    columna_objetivo: str,
    metricas: dict | None = None,
    nivel: str | None = None,
) -> dict:
    """Resumen de las prescripciones del conjunto de prueba (``recomendaciones.csv``).

    ``acciones`` trae columna, nombre, mínimo y máximo de cada acción. Con
    ``nivel`` se resume solo a los registros de ese nivel observado.
    """
    if nivel:
        tabla = tabla[tabla["clase_observada"].astype(str) == str(nivel)]
    n = len(tabla)
    if n == 0:
        return {"n": 0, "texto": "No hay registros prescritos con ese filtro.", "acciones": [], "por_nivel": [], "ejemplos": []}

    exito = tabla["exito"].astype(bool)
    base, prescrito = tabla[f"{columna_objetivo}_fcm_base"], tabla[f"{columna_objetivo}_fcm_prescrito"]
    filas_acciones = []
    for a in acciones:
        cambio = tabla[f"{a['columna']}_cambio"].astype(float)
        rango = (a["max"] - a["min"]) or 1.0
        sube = cambio / rango >= CAMBIO_MINIMO
        baja = cambio / rango <= -CAMBIO_MINIMO
        filas_acciones.append(
            {
                "columna": a["columna"],
                "nombre": a["nombre"],
                "actual_media": float(tabla[f"{a['columna']}_actual"].mean()),
                "recomendada_media": float(tabla[f"{a['columna']}_recomendado"].mean()),
                "cambio_mediano": float(cambio[sube | baja].median()) if (sube | baja).any() else 0.0,
                "pct_aumenta": float(100 * sube.mean()),
                "pct_reduce": float(100 * baja.mean()),
                "pct_igual": float(100 * (~sube & ~baja).mean()),
                "decimales": decimales_de(a["min"], a["max"]),
            }
        )

    por_nivel = []
    for etiqueta, grupo in tabla.groupby(tabla["clase_observada"].astype(str), sort=False):
        por_nivel.append(
            {
                "nivel": etiqueta,
                "n": int(len(grupo)),
                "pct_exito": float(100 * grupo["exito"].astype(bool).mean()),
                "activacion_base": float(grupo[f"{columna_objetivo}_fcm_base"].mean()),
                "activacion_prescrita": float(grupo[f"{columna_objetivo}_fcm_prescrito"].mean()),
            }
        )

    ganancia = (prescrito - base).to_numpy()
    orden = np.argsort(-ganancia, kind="stable")[:5]
    ejemplos = [
        {
            "id_estudiante": int(tabla.iloc[k]["id_estudiante"]),
            "nivel_observado": str(tabla.iloc[k]["clase_observada"]),
            "activacion_base": float(base.iloc[k]),
            "activacion_prescrita": float(prescrito.iloc[k]),
            "nivel_prescrito": str(tabla.iloc[k]["nivel_prescrito"]),
        }
        for k in orden
    ]

    niveles = " o ".join(f"«{nivel}»" for nivel in dict.fromkeys(tabla["clase_observada"].astype(str)))
    partes = [
        f"El algoritmo genético prescribió acciones a {numero(n, 0)} registros de prueba con nivel {niveles}. "
        f"Con las acciones prescritas, el FCM ubica en el mejor nivel («{mejor_nivel}») al {porcentaje(100 * exito.mean())}; "
        f"{nombre_objetivo} pasa en promedio de {numero(base.mean(), 2)} a {numero(prescrito.mean(), 2)}."
    ]
    if metricas and not nivel:
        p, e = metricas.get("prescripcion", {}), metricas.get("validacion_externa", {})
        if "PSR_base" in p and "PSR_externo" in e:
            partes.append(
                f"Con sus acciones actuales lo logra el {porcentaje(p['PSR_base'])}. Un bosque aleatorio independiente "
                f"confirma el mejor nivel para el {porcentaje(e['PSR_externo'])} (antes {porcentaje(e['PSR_externo_base'])}): es la cifra prudente."
            )
    frases = []
    for a in sorted(filas_acciones, key=lambda f: -f["pct_aumenta"]):
        if a["pct_aumenta"] >= 50:
            frases.append(
                f"aumentar {a['nombre']} (al {porcentaje(a['pct_aumenta'], 0)} de los registros; de {numero(a['actual_media'], a['decimales'])} "
                f"a {numero(a['recomendada_media'], a['decimales'])} en promedio)"
            )
    iguales = [a["nombre"] for a in filas_acciones if a["pct_igual"] >= 50]
    if frases:
        partes.append(f"La recomendación más frecuente es {unir(frases)}.")
    if iguales:
        partes.append(f"{unir(iguales)} se mantiene{'n' if len(iguales) > 1 else ''} igual en la mayoría de los casos.")
    if len(por_nivel) > 1:
        partes.append(
            "Por nivel observado: "
            + "; ".join(f"«{g['nivel']}» ({numero(g['n'], 0)} registros) llega a «{mejor_nivel}» el {porcentaje(g['pct_exito'])}" for g in por_nivel)
            + "."
        )
    return {
        "n": int(n),
        "pct_exito": float(100 * exito.mean()),
        "activacion_base_media": float(base.mean()),
        "activacion_prescrita_media": float(prescrito.mean()),
        "acciones": filas_acciones,
        "por_nivel": por_nivel,
        "ejemplos": ejemplos,
        "texto": " ".join(partes),
        "nota": NOTA_CAUSALIDAD,
    }
