"""
Esquema de un dataset en JSON: el formato que usa la aplicación web.

    {
      "nombre": "xAPI-Edu-Data",
      "objetivo": "Class",
      "invertir_objetivo": false,              # objetivo numérico en el que menos es mejor
      "niveles": {"Bajo": 0, "Medio": 0.5, "Alto": 1},   # solo objetivo numérico
      "columnas": [
        {"columna": "gender", "rol": "inmutable", "codificacion": "ordinal", "orden": ["F", "M"],
         "id": "C1", "nombre": "Género"},
        {"columna": "raisedhands", "rol": "accion", "codificacion": "numerica"},
        {"columna": "StudentAbsenceDays", "rol": "mutable", "dinamico": false,
         "codificacion": "ordinal", "orden": ["Under-7", "Above-7"]},
        {"columna": "Class", "rol": "objetivo", "codificacion": "ordinal", "orden": ["L", "M", "H"]},
        {"columna": "PlaceofBirth", "rol": "excluir"}
      ],
      "segmento": {"columna": "StudentAbsenceDays", "valor": "Above-7",
                   "nombre_si": "ausencias > 7", "nombre_no": "ausencias <= 7"}
    }

Roles (notación PRV-FCM): ``objetivo`` (C_T, concepto objetivo), ``accion``
(C_P, concepto prescriptivo), ``inmutable`` y ``mutable`` (C_S, conceptos del
sistema) y ``excluir``.
Codificaciones: ``numerica``; ``ordinal`` (label encoding) con ``orden`` de
menor a mayor (en el objetivo, del peor al mejor nivel); ``nominal`` (media
suavizada del objetivo por categoría); ``one_hot`` con ``categorias`` (un
concepto 0/1 por categoría, solo en conceptos del sistema) y
``numero_en_texto`` ("G-07" -> 7). Si el objetivo es ordinal, sus niveles se
reparten en [0, 1] según ese orden.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier

from .configuracion import ACCION, ESQUEMA_XAPI, INMUTABLE, MUTABLE, Concepto, Esquema
from .pipeline import SEGMENTO_AUSENTISMO, Segmento
from .preprocesamiento import como_texto, etiquetas_objetivo

ROLES = ("inmutable", "accion", "mutable", "objetivo", "excluir")
CODIFICACIONES = ("numerica", "ordinal", "nominal", "one_hot", "numero_en_texto")
NIVELES_NUMERICOS = {"Bajo": 0.0, "Medio": 0.5, "Alto": 1.0}
TIPO_DE_ROL = {"inmutable": INMUTABLE, "accion": ACCION, "mutable": MUTABLE, "objetivo": MUTABLE}
MIN_FILAS = 30
MAX_CATEGORIAS_ONE_HOT = 30
# Una columna que sola acierta el nivel del objetivo en el 99 % de los registros suele ser su
# definición o un dato posterior (por ejemplo, "desertó" = nota final < 10): filtra el objetivo.
UMBRAL_FUGA = 0.99


def acierto_con_una_columna(serie: pd.Series, etiquetas: np.ndarray) -> float | None:
    """Exactitud máxima al predecir el nivel del objetivo solo con esta columna.

    Con pocos valores distintos (al menos 5 registros por valor) predice la moda
    del objetivo en cada valor; si es numérica con más valores, un árbol de
    decisión de pocas hojas busca los mejores umbrales. None si no aplica.
    """
    valida = serie.notna().to_numpy()
    x, y = serie[valida], np.asarray(etiquetas, dtype=object)[valida]
    n = len(x)
    if n == 0:
        return None
    unicos = x.nunique()
    if unicos <= 30 and n >= 5 * unicos:
        tabla = pd.crosstab(como_texto(x).to_numpy(), y)
        return float(tabla.max(axis=1).sum() / n)
    if pd.api.types.is_numeric_dtype(x) and not pd.api.types.is_bool_dtype(x):
        datos = x.to_numpy(dtype=float).reshape(-1, 1)
        arbol = DecisionTreeClassifier(max_leaf_nodes=2 * max(len(set(y)), 2), random_state=0)
        return float(arbol.fit(datos, y.astype(str)).score(datos, y.astype(str)))
    return None


def columnas_que_determinan(df: pd.DataFrame, columnas: list[str], etiquetas: np.ndarray) -> list[tuple[str, float, float]]:
    """Columnas que por sí solas aciertan el nivel del objetivo en al menos el 99 % de los registros.

    Devuelve (columna, acierto, acierto de la clase mayoritaria). Si el objetivo
    está casi siempre en un mismo nivel, no se señala nada: cualquier columna acertaría.
    """
    base = float(pd.Series(etiquetas).value_counts(normalize=True).max())
    if base >= 0.97:
        return []
    salida = []
    for columna in columnas:
        acierto = acierto_con_una_columna(df[columna], etiquetas)
        if acierto is not None and acierto >= UMBRAL_FUGA:
            salida.append((columna, acierto, base))
    return salida


def columna_one_hot(columna: str, categoria: str) -> str:
    """Nombre del concepto indicador de una categoría: "Topic=IT"."""
    return f"{columna}={categoria}"


class ErrorEsquema(ValueError):
    """Esquema mal formado; ``errores`` lista cada problema en lenguaje del usuario."""

    def __init__(self, errores: list[str]):
        super().__init__("; ".join(errores))
        self.errores = errores


def codificacion_de(esquema: Esquema, columna: str) -> str:
    """Codificación de un concepto; también acepta la columna de origen de un one-hot."""
    if columna in esquema.one_hot or any(origen == columna for origen, _ in esquema.one_hot.values()):
        return "one_hot"
    if columna in esquema.codificacion_ordinal:
        return "ordinal"
    if columna in esquema.columnas_numero_en_texto:
        return "numero_en_texto"
    if columna in esquema.columnas_nominales:
        return "nominal"
    return "numerica"


def categorias_one_hot(esquema: Esquema, origen: str) -> list[str]:
    """Categorías de una columna one-hot, en el orden de sus conceptos."""
    return [categoria for o, categoria in esquema.one_hot.values() if o == origen]


def rol_de(esquema: Esquema, concepto: Concepto) -> str:
    if concepto.columna == esquema.objetivo:
        return "objetivo"
    return {INMUTABLE: "inmutable", ACCION: "accion", MUTABLE: "mutable"}[concepto.tipo]


def esquema_a_dict(esquema: Esquema, segmento: Segmento | None = None) -> dict:
    """Convierte un ``Esquema`` al formato JSON de la aplicación.

    Los indicadores one-hot vuelven a ser una sola columna con sus categorías;
    esa entrada no lleva ``id`` porque le corresponden varios conceptos.
    """
    columnas = []
    for c in esquema.conceptos:
        if c.columna in esquema.one_hot:
            origen, categoria = esquema.one_hot[c.columna]
            if any(e["columna"] == origen for e in columnas):
                continue
            sufijo = f": {categoria}"
            columnas.append(
                {
                    "columna": origen,
                    "rol": rol_de(esquema, c),
                    "codificacion": "one_hot",
                    "categorias": categorias_one_hot(esquema, origen),
                    "nombre": c.nombre[: -len(sufijo)] if c.nombre.endswith(sufijo) else origen,
                }
            )
            continue
        entrada = {
            "columna": c.columna,
            "rol": rol_de(esquema, c),
            "codificacion": codificacion_de(esquema, c.columna),
            "id": c.id,
            "nombre": c.nombre,
        }
        if c.columna in esquema.codificacion_ordinal:
            mapa = esquema.codificacion_ordinal[c.columna]
            entrada["orden"] = sorted(mapa, key=mapa.get)
        if c.tipo == MUTABLE and c.columna != esquema.objetivo:
            entrada["dinamico"] = c.dinamico
        columnas.append(entrada)
    columnas += [{"columna": c, "rol": "excluir"} for c in esquema.columnas_excluidas]
    resultado = {
        "nombre": esquema.nombre,
        "objetivo": esquema.objetivo,
        "invertir_objetivo": esquema.invertir_objetivo,
        "niveles": dict(esquema.niveles),
        "columnas": columnas,
    }
    if segmento is not None:
        resultado["segmento"] = segmento_a_dict(segmento)
    return resultado


def segmento_a_dict(segmento: Segmento) -> dict:
    return {"columna": segmento.columna, "valor": segmento.valor, "nombre_si": segmento.nombre_si, "nombre_no": segmento.nombre_no}


def segmento_desde_dict(datos: dict | None) -> Segmento | None:
    if not datos or not datos.get("columna"):
        return None
    columna, valor = str(datos["columna"]), str(datos.get("valor", ""))
    return Segmento(
        columna,
        valor,
        str(datos.get("nombre_si") or f"{columna} = {valor}"),
        str(datos.get("nombre_no") or f"{columna} ≠ {valor}"),
    )


def _errores_de_estructura(datos: dict) -> list[str]:
    errores = []
    columnas = datos.get("columnas")
    if not isinstance(columnas, list) or not columnas:
        return ["El esquema no tiene columnas."]
    vistas = set()
    for entrada in columnas:
        nombre = entrada.get("columna")
        if not isinstance(nombre, str) or not nombre:
            errores.append("Hay una columna sin nombre.")
            continue
        if nombre in vistas:
            errores.append(f"La columna {nombre} aparece dos veces.")
        vistas.add(nombre)
        rol = entrada.get("rol")
        if rol not in ROLES:
            errores.append(f"{nombre}: el rol debe ser uno de {', '.join(ROLES)}.")
            continue
        if rol == "excluir":
            continue
        codificacion = entrada.get("codificacion", "numerica")
        if codificacion not in CODIFICACIONES:
            errores.append(f"{nombre}: la codificación debe ser una de {', '.join(CODIFICACIONES)}.")
        if codificacion == "ordinal":
            orden = entrada.get("orden")
            if not isinstance(orden, list) or len({str(v) for v in orden}) < 2 or len({str(v) for v in orden}) != len(orden):
                errores.append(f"{nombre}: la codificación ordinal necesita un orden con al menos dos categorías distintas.")
        if codificacion == "one_hot":
            categorias = entrada.get("categorias")
            distintas = {str(v) for v in categorias} if isinstance(categorias, list) else set()
            if len(distintas) < 2 or len(distintas) != len(categorias):
                errores.append(f"{nombre}: la codificación one-hot necesita la lista de categorías, al menos dos y distintas.")
            elif len(distintas) > MAX_CATEGORIAS_ONE_HOT:
                errores.append(
                    f"{nombre}: tiene {len(distintas)} categorías y one-hot admite hasta {MAX_CATEGORIAS_ONE_HOT}. "
                    "Use la codificación nominal (media del objetivo)."
                )
        if rol == "accion" and codificacion in ("nominal", "one_hot"):
            errores.append(f"{nombre}: una acción debe ser numérica u ordinal; con codificación {codificacion} no se puede aumentar.")
        if rol == "objetivo" and codificacion not in ("ordinal", "numerica"):
            errores.append(f"{nombre}: el objetivo debe ser ordinal (del peor al mejor nivel) o numérico.")
    objetivos = [e["columna"] for e in columnas if e.get("rol") == "objetivo"]
    if len(objetivos) != 1:
        errores.append("Marque exactamente una columna como objetivo (rendimiento o deserción).")
    if not any(e.get("rol") == "accion" for e in columnas):
        errores.append("Marque al menos una columna como acción: la variable que el AG puede cambiar.")
    if objetivos and datos.get("objetivo") not in (None, "", objetivos[0]):
        errores.append(f"El objetivo declarado ({datos['objetivo']}) no coincide con la columna marcada ({objetivos[0]}).")
    return errores


def esquema_desde_dict(datos: dict) -> Esquema:
    """Construye un ``Esquema`` desde el JSON de la aplicación; lanza ``ErrorEsquema`` si está mal formado.

    Los conceptos se ordenan por rol (inmutables, acciones, mutables, objetivo)
    y se numeran C1, C2, ... salvo que todos traigan un identificador propio.
    Una columna one-hot se expande en un concepto indicador por categoría, que
    nunca es dinámico.
    """
    errores = _errores_de_estructura(datos)
    if errores:
        raise ErrorEsquema(errores)
    usadas = [e for e in datos["columnas"] if e["rol"] != "excluir"]
    usadas.sort(key=lambda e: ("inmutable", "accion", "mutable", "objetivo").index(e["rol"]))
    ids = [e.get("id") for e in usadas]
    conservar_ids = (
        all(isinstance(i, str) and i for i in ids)
        and len(set(ids)) == len(ids)
        and not any(e.get("codificacion") == "one_hot" for e in usadas)
    )

    conceptos, ordinal, en_texto, nominales, one_hot = [], {}, [], [], {}
    objetivo = next(e["columna"] for e in usadas if e["rol"] == "objetivo")
    for e in usadas:
        columna, rol = e["columna"], e["rol"]
        nombre = str(e.get("nombre") or columna)
        codificacion = e.get("codificacion", "numerica")
        if codificacion == "one_hot":
            for categoria in (str(v) for v in e["categorias"]):
                indicador = columna_one_hot(columna, categoria)
                one_hot[indicador] = (columna, categoria)
                conceptos.append(Concepto(f"C{len(conceptos) + 1}", indicador, f"{nombre}: {categoria}", TIPO_DE_ROL[rol]))
            continue
        conceptos.append(
            Concepto(
                id=e["id"] if conservar_ids else f"C{len(conceptos) + 1}",
                columna=columna,
                nombre=nombre,
                tipo=TIPO_DE_ROL[rol],
                dinamico=True if rol == "objetivo" else bool(e.get("dinamico", False)) and rol == "mutable",
            )
        )
        if codificacion == "ordinal":
            ordinal[columna] = {str(v): i for i, v in enumerate(e["orden"])}
        elif codificacion == "numero_en_texto":
            en_texto.append(columna)
        elif codificacion == "nominal":
            nominales.append(columna)

    repetidas = sorted({c.columna for c in conceptos if [x.columna for x in conceptos].count(c.columna) > 1})
    if repetidas:
        raise ErrorEsquema([f"Dos conceptos quedarían con el mismo nombre: {', '.join(repetidas)}."])
    if objetivo in ordinal:
        orden = sorted(ordinal[objetivo], key=ordinal[objetivo].get)
        niveles = {etiqueta: i / (len(orden) - 1) for i, etiqueta in enumerate(orden)}
    else:
        niveles = {str(k): float(v) for k, v in (datos.get("niveles") or NIVELES_NUMERICOS).items()}
    return Esquema(
        conceptos=tuple(conceptos),
        objetivo=objetivo,
        codificacion_ordinal=ordinal,
        columnas_numero_en_texto=tuple(en_texto),
        columnas_nominales=tuple(nominales),
        columnas_excluidas=tuple(e["columna"] for e in datos["columnas"] if e["rol"] == "excluir"),
        niveles=niveles,
        invertir_objetivo=bool(datos.get("invertir_objetivo", False)) and objetivo not in ordinal,
        nombre=str(datos.get("nombre", "")),
        one_hot=one_hot,
    )


def validar_esquema(datos: dict, df: pd.DataFrame) -> dict:
    """Comprueba el esquema contra los datos: columnas, codificaciones, niveles y segmento.

    ``df`` es el CSV tal como se leyó (``leer_csv``). Devuelve
    ``{"ok", "errores", "avisos", "filas_utiles"}``.
    """
    try:
        esquema = esquema_desde_dict(datos)
    except ErrorEsquema as error:
        return {"ok": False, "errores": error.errores, "avisos": [], "filas_utiles": 0}

    errores, avisos = [], []
    faltantes = [c for c in esquema.columnas_origen + list(esquema.columnas_excluidas) if c not in df.columns]
    if faltantes:
        return {"ok": False, "errores": [f"El archivo no tiene las columnas: {', '.join(faltantes)}."], "avisos": [], "filas_utiles": 0}

    usadas = df[esquema.columnas_origen]
    completas = usadas.dropna()
    if len(completas) < len(df):
        avisos.append(f"Se descartarán {len(df) - len(completas)} filas con valores faltantes en las columnas usadas.")
    if len(completas) < MIN_FILAS:
        errores.append(f"Quedan {len(completas)} filas completas; se necesitan al menos {MIN_FILAS}.")

    for origen in dict.fromkeys(o for o, _ in esquema.one_hot.values()):
        presentes = set(como_texto(completas[origen]).unique())
        listadas = categorias_one_hot(esquema, origen)
        fuera = sorted(presentes - set(listadas))
        if fuera:
            avisos.append(f"{origen}: las categorías {', '.join(fuera[:8])} no tienen indicador one-hot; quedarán en 0 en todos.")
        ausentes = [c for c in listadas if c not in presentes]
        if ausentes:
            avisos.append(f"{origen}: las categorías {', '.join(ausentes[:8])} no aparecen en los datos; sus indicadores serán constantes.")

    for c in esquema.conceptos:
        if c.columna in esquema.one_hot:
            continue
        serie = completas[c.columna]
        codificacion = codificacion_de(esquema, c.columna)
        if codificacion == "numerica":
            convertida = pd.to_numeric(serie, errors="coerce")
            if convertida.isna().any():
                ejemplos = ", ".join(serie[convertida.isna()].astype(str).unique()[:3])
                errores.append(f"{c.columna}: hay valores no numéricos ({ejemplos}). Use codificación ordinal o nominal.")
            elif convertida.nunique() < 2:
                avisos.append(f"{c.columna}: tiene un solo valor; no aportará información.")
        elif codificacion == "ordinal":
            desconocidas = sorted(set(como_texto(serie).unique()) - set(esquema.codificacion_ordinal[c.columna]))
            if desconocidas:
                errores.append(f"{c.columna}: faltan en el orden las categorías {', '.join(desconocidas[:8])}.")
        elif codificacion == "numero_en_texto":
            sin_numero = ~como_texto(serie).str.contains(r"\d", regex=True)
            if sin_numero.any():
                errores.append(f"{c.columna}: hay valores sin número ({', '.join(serie[sin_numero].astype(str).unique()[:3])}).")
        elif codificacion == "nominal" and serie.nunique() > 50:
            avisos.append(f"{c.columna}: tiene {serie.nunique()} categorías; las poco frecuentes se acercarán a la media.")

    if not errores:
        etiquetas = pd.Series(etiquetas_objetivo(completas, esquema))
        entradas = [c for c in esquema.columnas_origen if c != esquema.objetivo]
        for columna, acierto, base in columnas_que_determinan(completas, entradas, etiquetas.to_numpy()):
            avisos.append(
                f"{columna} acierta el nivel de {esquema.objetivo} en el {100 * acierto:.1f} % de los registros por sí sola "
                f"(la clase mayoritaria, {100 * base:.1f} %): si es su definición o un dato posterior, exclúyala para no filtrar el objetivo."
            )
        conteo = etiquetas.value_counts()
        if conteo.get(esquema.mejor_nivel, 0) == 0:
            errores.append(f"Ningún registro está en el mejor nivel ({esquema.mejor_nivel}); revise el orden del objetivo.")
        for nivel in esquema.niveles:
            if 0 < conteo.get(nivel, 0) < 20:
                avisos.append(f"El nivel {nivel} tiene solo {conteo.get(nivel, 0)} registros; sus métricas serán inestables.")
        if len(esquema.niveles_a_prescribir) and not etiquetas.isin(esquema.niveles_a_prescribir).any():
            errores.append("Todos los registros están en el mejor nivel: no hay a quién prescribir.")

    segmento = segmento_desde_dict(datos.get("segmento"))
    if segmento is not None:
        if segmento.columna not in df.columns:
            errores.append(f"El segmento usa la columna {segmento.columna}, que no está en el archivo.")
        elif not como_texto(df[segmento.columna].dropna()).eq(segmento.valor).any():
            avisos.append(f"Ningún registro tiene {segmento.columna} = {segmento.valor}; el segmento quedará vacío.")
    return {"ok": not errores, "errores": errores, "avisos": avisos, "filas_utiles": int(len(completas))}


ESQUEMA_XAPI_DICT = esquema_a_dict(ESQUEMA_XAPI, SEGMENTO_AUSENTISMO)
