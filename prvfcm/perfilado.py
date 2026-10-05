"""
Perfil de datasets nuevos, sugerencia de esquema y consultas para la aplicación web.

* ``perfilar``: reporte inicial (dimensiones, tipos, vacíos y estadísticas
  descriptivas de cada columna) y un esquema sugerido por el nombre y el tipo
  de dato de cada columna. Es una propuesta: el usuario la revisa antes de entrenar.
* ``normalizados``: los datos codificados y llevados a [0, 1] (fuzzificación
  Min-Max), tal como los ve el FCM.
* ``estadisticas``: series para las gráficas descriptivas (distribución del
  objetivo, cada variable por nivel, correlación con el objetivo y perfil
  medio de cada nivel).
* ``correlaciones`` y ``dispersion``: cómo se relacionan las variables entre sí
  y con el objetivo.
* ``filas``: una página de registros con filtros y orden, para las tablas y
  para el asistente.
"""
from __future__ import annotations

import re
import unicodedata

import numpy as np
import pandas as pd

from .configuracion import Esquema
from .esquema import NIVELES_NUMERICOS, categorias_one_hot, codificacion_de, columnas_que_determinan, rol_de
from .evaluacion import discretizar_rendimiento
from .fcm import correlaciones_parciales
from .preprocesamiento import Preprocesador, como_texto, etiquetas_objetivo

# Palabras (sin tildes, en minúsculas) que sugieren el rol de una columna.
PALABRAS_OBJETIVO = (
    "class", "clase", "target", "objetivo", "g3", "nota_final", "final_grade", "calificacion_final",
    "rendimiento", "desercion", "dropout", "dropped", "drop_out", "abandono", "status", "estado_final",
    "resultado", "outcome",
)
# Nombres que, si aparecen, son el objetivo aunque otra columna también coincida (por ejemplo, la nota final).
OBJETIVOS_EXACTOS = ("class", "target", "g3", "objetivo", "desercion", "dropout", "dropped_out", "drop_out", "dropped")
PALABRAS_DESERCION = ("desercion", "dropout", "dropped", "drop_out", "abandono", "deserta", "abandona", "retiro")
PALABRAS_ACCION = (
    "raisedhands", "visited", "resources", "announcement", "discussion", "studytime", "study", "estudio",
    "horas", "hours", "tutor", "asistencia", "attendance", "particip", "activit", "actividad", "tarea",
    "homework", "sesion", "login", "click", "clic", "lectura", "reading", "practica", "ejercicio", "foro",
    "forum", "entrega", "refuerzo", "paid", "schoolsup", "school_support", "extra_curricular",
)
PALABRAS_MUTABLE = (
    "absence", "ausencia", "falta", "failure", "reprob", "satisf", "survey", "encuesta", "support", "apoyo",
    "motiv", "health", "salud", "freetime", "free_time", "goout", "going_out", "internet", "romantic",
    "relationship", "alcohol", "dalc", "walc", "famsup", "beca", "scholarship", "debtor", "deudor", "tuition",
    "matricula_al_dia", "trabaja", "grade_1", "grade_2", "g1", "g2",
)


def es_numerica(serie: pd.Series) -> bool:
    """Numérica de verdad: las booleanas cuentan como numéricas en pandas, pero son categorías."""
    return pd.api.types.is_numeric_dtype(serie) and not pd.api.types.is_bool_dtype(serie)
PALABRAS_IDENTIFICADOR = ("id", "codigo", "code", "documento", "cedula", "nombre", "name", "email", "correo")

# Vocabularios ordenados conocidos (del menor al mayor).
ORDENES_CONOCIDOS = (
    ("no", "yes"), ("no", "si"), ("false", "true"), ("n", "y"), ("n", "s"), ("0", "1"),
    ("bad", "good"), ("mala", "buena"), ("malo", "bueno"),
    ("under_7", "above_7"),
    ("l", "m", "h"), ("low", "medium", "high"), ("bajo", "medio", "alto"), ("baja", "media", "alta"),
    ("lowerlevel", "middleschool", "highschool"),
    ("never", "rarely", "sometimes", "often", "always"),
    ("nunca", "casi_nunca", "a_veces", "casi_siempre", "siempre"),
    ("dropout", "enrolled", "graduate"),
    ("fail", "pass"), ("reprobado", "aprobado"), ("reprueba", "aprueba"),
)
# En el objetivo, valores que indican el peor y el mejor desenlace.
PEORES = ("dropout", "deserta", "desercion", "abandona", "abandono", "fail", "reprob", "low", "bajo", "baja", "l")
MEJORES = ("graduate", "gradua", "continua", "permanece", "pass", "aprob", "high", "alto", "alta", "h")


def normalizar_texto(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", sin_tildes.lower()).strip("_")


def _contiene(nombre: str, palabras: tuple[str, ...]) -> bool:
    return any(p in nombre for p in palabras)


def nombre_legible(columna: str) -> str:
    """Nombre visible por defecto: "Extra_Curricular_Activities" -> "Extra curricular activities".

    Solo cambia nombres con guiones bajos; los demás ("VisITedResources") se dejan igual.
    """
    if "_" not in columna:
        return columna
    texto = re.sub(r"\s+", " ", columna.replace("_", " ")).strip()
    return texto[:1].upper() + texto[1:].lower() if texto else columna


def _es_identificador(nombre: str, serie: pd.Series) -> bool:
    partes = set(nombre.split("_"))
    unicos = serie.nunique(dropna=True) >= 0.95 * max(len(serie.dropna()), 1)
    return unicos and (bool(partes & set(PALABRAS_IDENTIFICADOR)) or not es_numerica(serie))


def _orden_conocido(valores: list[str]) -> list[str] | None:
    """Ordena categorías si coinciden con un vocabulario conocido."""
    normalizados = {normalizar_texto(v): v for v in valores}
    for orden in ORDENES_CONOCIDOS:
        if set(normalizados) == set(orden):
            return [normalizados[v] for v in orden]
    return None


def _orden_objetivo(valores: list[str], desercion: bool) -> tuple[list[str], bool]:
    """Categorías del objetivo del peor al mejor nivel; el booleano indica si el orden es seguro."""
    conocido = _orden_conocido(valores)
    si_no = conocido is not None and {normalizar_texto(v) for v in valores} <= {"no", "si", "yes", "0", "1", "true", "false", "n", "y", "s"}
    if conocido is not None and not (desercion and si_no):
        return conocido, True
    if conocido is not None:
        return conocido[::-1], True  # "¿Desertó? sí" es el peor desenlace.

    def puntaje(v: str) -> int:
        n = normalizar_texto(v)
        return -1 if any(n.startswith(p) or n == p for p in PEORES) else 1 if any(n.startswith(p) or n == p for p in MEJORES) else 0

    ordenados = sorted(valores, key=lambda v: (puntaje(v), normalizar_texto(v)))
    return ordenados, any(puntaje(v) != 0 for v in valores)


def perfil_columna(serie: pd.Series) -> dict:
    """Resumen de una columna para el reporte inicial: tipo, vacíos y estadísticas descriptivas."""
    no_nulos = serie.dropna()
    perfil = {
        "columna": str(serie.name),
        "tipo_dato": "numerico" if es_numerica(serie) else "categorico",
        "dtype": str(serie.dtype),
        "no_nulos": int(len(no_nulos)),
        "unicos": int(no_nulos.nunique()),
        "faltantes": int(serie.isna().sum()),
        "ejemplos": como_texto(no_nulos).drop_duplicates().head(5).tolist(),
    }
    if perfil["tipo_dato"] == "numerico" and len(no_nulos):
        perfil.update(
            min=float(no_nulos.min()),
            max=float(no_nulos.max()),
            media=float(no_nulos.mean()),
            desviacion=float(no_nulos.std()) if len(no_nulos) > 1 else 0.0,
            q1=float(no_nulos.quantile(0.25)),
            mediana=float(no_nulos.median()),
            q3=float(no_nulos.quantile(0.75)),
        )
    if len(no_nulos):
        conteo = como_texto(no_nulos).value_counts()
        perfil.update(moda=str(conteo.index[0]), frecuencia_moda=int(conteo.iloc[0]))
        if perfil["unicos"] <= 30:
            perfil["categorias"] = [{"valor": str(v), "n": int(n)} for v, n in conteo.head(30).items()]
    perfil["sugerencia"] = _sugerir_codificacion(serie)
    return perfil


def _sugerir_codificacion(serie: pd.Series) -> dict:
    no_nulos = serie.dropna()
    valores = como_texto(no_nulos).unique().tolist()
    if es_numerica(serie):
        return {"codificacion": "numerica"}
    orden = _orden_conocido(valores)
    if orden is not None:
        return {"codificacion": "ordinal", "orden": orden}
    if len(valores) == 2:
        return {"codificacion": "ordinal", "orden": sorted(valores)}
    if len(valores) >= 3 and como_texto(no_nulos).str.fullmatch(r"\D*\d+\D*").all():
        return {"codificacion": "numero_en_texto"}
    return {"codificacion": "nominal"}


def _excluir_si_determinan(df: pd.DataFrame, objetivo: dict, columnas: list[dict], avisos: list[str]) -> None:
    """Excluye las columnas que por sí solas determinan el objetivo (su definición o un dato posterior).

    Ejemplo: "desertó" definido como nota final < 10; con la nota final como
    concepto, el mapa acertaría sin aprender nada útil y el AG no podría cambiarla.
    """
    serie = df[objetivo["columna"]]
    validas = serie.notna().to_numpy()
    if objetivo["codificacion"] == "numerica":
        valores = pd.to_numeric(serie[validas], errors="coerce").astype(float)
        rango = (valores.max() - valores.min()) or 1.0
        etiquetas = discretizar_rendimiento(((valores - valores.min()) / rango).to_numpy(), NIVELES_NUMERICOS)
    else:
        etiquetas = como_texto(serie[validas]).to_numpy()
    entradas = [c["columna"] for c in columnas if c["rol"] not in ("objetivo", "excluir")]
    for columna, acierto, base in columnas_que_determinan(df[validas], entradas, etiquetas):
        entrada = next(c for c in columnas if c["columna"] == columna)
        entrada.clear()
        entrada.update({"columna": columna, "rol": "excluir"})
        avisos.append(
            f"{columna} acierta el nivel de {objetivo['columna']} en el {100 * acierto:.1f} % de los registros por sí sola "
            f"(la clase mayoritaria, {100 * base:.1f} %): parece su definición o un dato posterior, así que se excluyó. "
            "Si es una causa legítima, márquela de nuevo en el paso 2."
        )


def sugerir_esquema(df: pd.DataFrame, nombre: str = "") -> tuple[dict, list[str]]:
    """Esquema propuesto y avisos para revisar (el usuario confirma o corrige)."""
    avisos, columnas = [], []
    normalizados = {c: normalizar_texto(c) for c in df.columns}

    candidatos = [c for c in df.columns if _contiene(normalizados[c], PALABRAS_OBJETIVO)]
    exactos = [c for c in candidatos if normalizados[c] in OBJETIVOS_EXACTOS]
    objetivo = (exactos or candidatos or [None])[0]
    if objetivo is None:
        ultima = df.columns[-1]
        if df[ultima].nunique() <= 10 or es_numerica(df[ultima]):
            objetivo = ultima
            avisos.append(f"No se reconoció una columna objetivo; se propone la última ({ultima}).")
        else:
            avisos.append("No se reconoció una columna objetivo: elija la de rendimiento o deserción.")

    for columna in df.columns:
        serie, n = df[columna], normalizados[columna]
        if columna == objetivo:
            desercion = _contiene(n, PALABRAS_DESERCION)
            valores = como_texto(serie.dropna()).unique().tolist()
            nombre_visible = {"nombre": nombre_legible(columna)} if "_" in columna else {}
            if es_numerica(serie) and len(valores) > 10:
                columnas.append({"columna": columna, "rol": "objetivo", "codificacion": "numerica", **nombre_visible})
                if desercion:
                    avisos.append(f"{columna} es numérico y parece medir deserción: se marca 'menos es mejor'.")
            else:
                orden, seguro = _orden_objetivo(valores, desercion)
                columnas.append({"columna": columna, "rol": "objetivo", "codificacion": "ordinal", "orden": orden, **nombre_visible})
                if not seguro:
                    avisos.append(f"Revise el orden de {columna}: del peor al mejor nivel.")
            continue
        if _es_identificador(n, serie) or serie.nunique(dropna=True) <= 1:
            columnas.append({"columna": columna, "rol": "excluir"})
            continue
        codificacion = _sugerir_codificacion(serie)
        if _contiene(n, PALABRAS_ACCION) and codificacion["codificacion"] != "nominal":
            rol = "accion"
        elif _contiene(n, PALABRAS_MUTABLE):
            rol = "mutable"
        else:
            rol = "inmutable"
        columnas.append(
            {
                "columna": columna,
                "rol": rol,
                **codificacion,
                **({"dinamico": False} if rol == "mutable" else {}),
                **({"nombre": nombre_legible(columna)} if "_" in columna else {}),
            }
        )

    entrada_objetivo = next((c for c in columnas if c["rol"] == "objetivo"), None)
    if entrada_objetivo is not None:
        _excluir_si_determinan(df, entrada_objetivo, columnas, avisos)
    if not any(c["rol"] == "accion" for c in columnas):
        avisos.append("No se reconocieron acciones: marque las variables que la institución o el estudiante pueden cambiar.")
    esquema = {
        "nombre": nombre,
        "objetivo": objetivo,
        "invertir_objetivo": bool(
            entrada_objetivo and entrada_objetivo["codificacion"] == "numerica" and _contiene(normalizados[objetivo], PALABRAS_DESERCION)
        ),
        "columnas": columnas,
    }
    if entrada_objetivo and entrada_objetivo["codificacion"] == "numerica":
        esquema["niveles"] = dict(NIVELES_NUMERICOS)
    return esquema, avisos


def perfilar(df: pd.DataFrame, nombre: str = "") -> dict:
    """Reporte inicial de todas las columnas y esquema sugerido."""
    esquema, avisos = sugerir_esquema(df, nombre)
    perfil = [perfil_columna(df[c]) for c in df.columns]
    return {
        "filas": int(len(df)),
        "columnas": int(df.shape[1]),
        "duplicados": int(df.duplicated().sum()),
        "celdas_vacias": int(df.isna().sum().sum()),
        "filas_con_vacios": int(df.isna().any(axis=1).sum()),
        "numericas": sum(p["tipo_dato"] == "numerico" for p in perfil),
        "categoricas": sum(p["tipo_dato"] == "categorico" for p in perfil),
        "perfil": perfil,
        "esquema_sugerido": esquema,
        "avisos": avisos,
    }


# ---------------------------------------------------------------------------
# Estadísticas descriptivas para las gráficas
# ---------------------------------------------------------------------------
def _valores_numericos(serie: pd.Series, codificacion: str) -> pd.Series:
    if codificacion == "numero_en_texto":
        return como_texto(serie).str.extract(r"(\d+)", expand=False).astype(float)
    return pd.to_numeric(serie, errors="coerce").astype(float)


def estadistica_variable(df: pd.DataFrame, esquema: Esquema, columna: str, etiquetas: np.ndarray | None = None,
                         correlacion: float | None = None) -> dict:
    """Distribución de una variable por nivel del objetivo.

    ``columna`` es un concepto o la columna de origen de un one-hot (entonces
    se describe la variable categórica completa).
    """
    origen_one_hot = columna not in esquema.columnas and any(o == columna for o, _ in esquema.one_hot.values())
    concepto = next(
        c for c in esquema.conceptos if c.columna == columna or (origen_one_hot and esquema.origen(c.columna) == columna)
    )
    codificacion = codificacion_de(esquema, columna)
    etiquetas = etiquetas_objetivo(df, esquema) if etiquetas is None else etiquetas
    niveles = list(esquema.niveles)
    salida = {
        "columna": columna,
        "id": concepto.id,
        "nombre": concepto.nombre.rsplit(": ", 1)[0] if origen_one_hot else concepto.nombre,
        "rol": rol_de(esquema, concepto),
        "codificacion": codificacion,
        "correlacion": correlacion,
    }
    if codificacion == "one_hot":
        if origen_one_hot:
            texto, categorias = como_texto(df[columna]), categorias_one_hot(esquema, columna)
        else:
            origen, categoria = esquema.one_hot[columna]
            texto = pd.Series(np.where(como_texto(df[origen]) == categoria, "Sí", "No"), index=df.index)
            categorias = ["Sí", "No"]
        salida["categorias"] = _por_categoria(texto, categorias, etiquetas, niveles)
        return salida
    if codificacion in ("numerica", "numero_en_texto"):
        valores = _valores_numericos(df[columna], codificacion)
        salida["resumen"] = {"media": valores.mean(), "mediana": valores.median(), "min": valores.min(), "max": valores.max()}
        por_nivel = []
        for nivel in niveles:
            v = valores[etiquetas == nivel]
            por_nivel.append(
                {"nivel": nivel, "n": int(v.notna().sum()), "media": v.mean(), "mediana": v.median(),
                 "q1": v.quantile(0.25), "q3": v.quantile(0.75)}
            )
        salida["por_nivel"] = por_nivel
        unicos = np.sort(valores.dropna().unique())
        if len(unicos) <= 12:
            bordes = np.append(unicos - 0.5, unicos[-1] + 0.5) if len(unicos) else np.array([0.0, 1.0])
        else:
            bordes = np.histogram_bin_edges(valores.dropna(), bins=12)
        salida["histograma"] = {
            "bordes": bordes.tolist(),
            "conteos": {nivel: np.histogram(valores[etiquetas == nivel].dropna(), bins=bordes)[0].tolist() for nivel in niveles},
        }
    else:
        texto = como_texto(df[columna])
        if codificacion == "ordinal":
            mapa = esquema.codificacion_ordinal[columna]
            categorias = sorted(mapa, key=mapa.get)
        else:
            categorias = texto.value_counts().head(15).index.tolist()
        salida["categorias"] = _por_categoria(texto, categorias, etiquetas, niveles)
    return salida


def _por_categoria(texto: pd.Series, categorias: list[str], etiquetas: np.ndarray, niveles: list[str]) -> list[dict]:
    return [
        {
            "categoria": categoria,
            "n": int((texto == categoria).sum()),
            "por_nivel": {nivel: int(((texto == categoria) & (etiquetas == nivel)).sum()) for nivel in niveles},
        }
        for categoria in categorias
    ]


def matriz_normalizada(df: pd.DataFrame, esquema: Esquema) -> tuple[pd.DataFrame, Preprocesador]:
    """Datos codificados y en [0, 1], con el preprocesador ajustado a todo el dataset (vista exploratoria).

    El entrenamiento, en cambio, ajusta la codificación y el Min-Max solo con la
    parte de entrenamiento.
    """
    pre = Preprocesador(esquema).ajustar(df)
    return pd.DataFrame(pre.transformar(df), columns=pre.columnas, index=df.index), pre


def _describir_concepto(esquema: Esquema, c) -> dict:
    return {"id": c.id, "columna": c.columna, "nombre": c.nombre, "rol": rol_de(esquema, c),
            "codificacion": codificacion_de(esquema, c.columna), "origen": esquema.origen(c.columna)}


def estadisticas(df: pd.DataFrame, esquema: Esquema) -> dict:
    """Distribución del objetivo y de cada variable por nivel, con su correlación de Spearman.

    ``perfil_niveles`` da la media normalizada de cada concepto en cada nivel
    del objetivo: muestra de un vistazo qué variables separan los niveles.
    """
    etiquetas = etiquetas_objetivo(df, esquema)
    X, _ = matriz_normalizada(df, esquema)
    X = X.reset_index(drop=True)
    objetivo = X[esquema.objetivo]
    variables, perfil_niveles = [], []
    for c in esquema.conceptos:
        if c.columna == esquema.objetivo:
            continue
        correlacion = X[c.columna].corr(objetivo, method="spearman") if X[c.columna].nunique() > 1 else None
        variables.append(estadistica_variable(df, esquema, c.columna, etiquetas, correlacion))
        perfil_niveles.append(
            {
                **_describir_concepto(esquema, c),
                "medias": {n: (float(X.loc[etiquetas == n, c.columna].mean()) if np.any(etiquetas == n) else None) for n in esquema.niveles},
            }
        )
    return {
        "filas": int(len(df)),
        "objetivo": {
            "columna": esquema.objetivo,
            "mejor_nivel": esquema.mejor_nivel,
            "niveles": [{"etiqueta": n, "valor": v, "n": int(np.sum(etiquetas == n))} for n, v in esquema.niveles.items()],
        },
        "variables": variables,
        "perfil_niveles": perfil_niveles,
    }


# ---------------------------------------------------------------------------
# Datos normalizados y relaciones entre variables
# ---------------------------------------------------------------------------
def normalizados(df: pd.DataFrame, esquema: Esquema, desde: int = 0, cantidad: int = 20) -> dict:
    """Página de la matriz de activaciones en [0, 1] y cómo se obtuvo cada concepto."""
    X, pre = matriz_normalizada(df, esquema)
    X = X.round(4)
    conceptos = [
        {
            **_describir_concepto(esquema, c),
            "min": float(pre.minimos[c.columna]),
            "max": float(pre.maximos[c.columna]),
            "media": float(X[c.columna].mean()),
        }
        for c in esquema.conceptos
    ]
    inicio = max(desde, 0)
    pagina = X.iloc[inicio: inicio + max(min(cantidad, 200), 1)]
    etiquetas = etiquetas_objetivo(df, esquema)[inicio: inicio + len(pagina)]  # Niveles con el rango de todo el dataset.
    filas_pagina = [{"id": int(i), "nivel": str(n), **{c: float(v) for c, v in fila.items()}}
                    for (i, fila), n in zip(pagina.iterrows(), etiquetas)]
    return {"total": int(len(X)), "conceptos": conceptos, "filas": filas_pagina}


METODOS_CORRELACION = ("pearson", "spearman", "parcial")


def correlaciones(df: pd.DataFrame, esquema: Esquema, metodo: str = "spearman") -> dict:
    """Matriz de correlación entre todos los conceptos (objetivo incluido) sobre los datos normalizados.

    ``parcial`` es la correlación de cada par dados los demás conceptos, la
    misma que usa el método de pesos ``correlacion_parcial``.
    """
    if metodo not in METODOS_CORRELACION:
        raise ValueError(f"El método de correlación debe ser uno de {', '.join(METODOS_CORRELACION)}.")
    X, _ = matriz_normalizada(df, esquema)
    constantes = X.nunique() <= 1
    if metodo == "parcial":
        matriz = pd.DataFrame(correlaciones_parciales(X.to_numpy()), index=X.columns, columns=X.columns)
    else:
        matriz = X.corr(method=metodo)
    matriz.loc[constantes, :] = np.nan
    matriz.loc[:, constantes] = np.nan
    return {
        "metodo": metodo,
        "n": int(len(X)),
        "conceptos": [_describir_concepto(esquema, c) for c in esquema.conceptos],
        "matriz": matriz.to_numpy().tolist(),
    }


def _eje(df: pd.DataFrame, esquema: Esquema, columna: str, X: pd.DataFrame) -> dict:
    """Valores de un concepto para la dispersión: numéricos o posiciones de categoría con sus etiquetas."""
    codificacion = codificacion_de(esquema, columna)
    concepto = next(c for c in esquema.conceptos if c.columna == columna)
    eje = {"columna": columna, "nombre": concepto.nombre, "id": concepto.id, "codificacion": codificacion}
    if codificacion == "numerica":
        eje.update(tipo="numerico", valores=pd.to_numeric(df[columna]).astype(float))
    elif codificacion == "numero_en_texto":
        eje.update(tipo="numerico", valores=como_texto(df[columna]).str.extract(r"(\d+)", expand=False).astype(float))
    elif codificacion == "one_hot":
        eje.update(tipo="categorico", categorias=["No", "Sí"], valores=X[columna].astype(float))
    else:
        texto = como_texto(df[columna])
        if codificacion == "ordinal":
            mapa = esquema.codificacion_ordinal[columna]
            categorias = sorted(mapa, key=mapa.get)
        else:
            # Nominal: categorías ordenadas por su codificación (media del objetivo), de menor a mayor.
            categorias = X.groupby(texto)[columna].mean().sort_values().index.tolist()
        posicion = {c: i for i, c in enumerate(categorias)}
        eje.update(tipo="categorico", categorias=categorias, valores=texto.map(posicion).astype(float))
    return eje


def dispersion(df: pd.DataFrame, esquema: Esquema, x: str, y: str, max_puntos: int = 1500, semilla: int = 0) -> dict:
    """Puntos (x, y, nivel del objetivo) para comparar dos conceptos, con su correlación de Spearman.

    Con más de ``max_puntos`` registros se toma una muestra aleatoria
    reproducible; la correlación usa todos los registros.
    """
    for columna in (x, y):
        if columna not in esquema.columnas:
            raise ValueError(f"{columna} no es un concepto del esquema.")
    X, _ = matriz_normalizada(df, esquema)
    ejes = [_eje(df, esquema, columna, X) for columna in (x, y)]
    etiquetas = etiquetas_objetivo(df, esquema)
    correlacion = X[x].corr(X[y], method="spearman") if X[x].nunique() > 1 and X[y].nunique() > 1 else None
    indices = np.arange(len(df))
    if len(indices) > max_puntos:
        indices = np.sort(np.random.default_rng(semilla).choice(indices, max_puntos, replace=False))
    vx, vy = ejes[0].pop("valores").to_numpy(), ejes[1].pop("valores").to_numpy()
    puntos = [
        {"id": int(df.index[k]), "x": float(vx[k]), "y": float(vy[k]), "nivel": str(etiquetas[k])}
        for k in indices
        if np.isfinite(vx[k]) and np.isfinite(vy[k])
    ]
    return {"x": ejes[0], "y": ejes[1], "correlacion": correlacion, "n": int(len(df)), "puntos": puntos,
            "niveles": list(esquema.niveles)}


def perfil_base(df: pd.DataFrame, esquema: Esquema, id_registro: int | None = None) -> dict:
    """Valores de partida para un perfil de riesgo: un registro del dataset o el perfil típico.

    El perfil típico usa la mediana de las columnas numéricas y la categoría más
    frecuente de las demás.
    """
    columnas = [c for c in esquema.columnas_origen if c != esquema.objetivo]
    if id_registro is not None:
        if int(id_registro) not in df.index:
            raise ValueError(f"No existe el registro {id_registro} (debe ser una fila con datos completos).")
        fila = df.loc[int(id_registro), columnas]
        return {"origen": f"registro {int(id_registro)}", "valores": {c: _valor_json(fila[c]) for c in columnas}}
    valores = {}
    for c in columnas:
        serie = df[c].dropna()
        if codificacion_de(esquema, c) == "numerica":
            valores[c] = float(serie.median())
        else:
            valores[c] = str(como_texto(serie).value_counts().index[0])
    return {"origen": "perfil típico", "valores": valores}


def _valor_json(valor):
    if isinstance(valor, (np.integer, np.floating)):
        return valor.item()
    return valor


# ---------------------------------------------------------------------------
# Consultas de registros
# ---------------------------------------------------------------------------
OPERADORES = ("=", "!=", "<", "<=", ">", ">=", "contiene")


def _mascara_filtro(df: pd.DataFrame, filtro: dict) -> pd.Series:
    columna, operador, valor = filtro.get("columna"), filtro.get("operador", "="), filtro.get("valor")
    if columna not in df.columns:
        raise ValueError(f"No existe la columna {columna}.")
    if operador not in OPERADORES:
        raise ValueError(f"Operador no permitido: {operador}. Use uno de {', '.join(OPERADORES)}.")
    serie = df[columna]
    if operador == "contiene":
        return como_texto(serie).str.contains(str(valor), case=False, regex=False)
    if pd.api.types.is_numeric_dtype(serie) and _es_numero(valor):
        numero = float(valor)
        return {"=": serie == numero, "!=": serie != numero, "<": serie < numero, "<=": serie <= numero,
                ">": serie > numero, ">=": serie >= numero}[operador]
    if operador in ("=", "!="):
        texto, valor = como_texto(serie), str(valor).strip()
        return (texto == valor) if operador == "=" else (texto != valor)
    raise ValueError(f"{columna}: el operador {operador} necesita una columna numérica y un número.")


def _es_numero(valor) -> bool:
    try:
        float(valor)
        return True
    except (TypeError, ValueError):
        return False


def filas(
    df: pd.DataFrame,
    esquema: Esquema | None = None,
    desde: int = 0,
    cantidad: int = 50,
    orden: str | None = None,
    descendente: bool = False,
    filtros: list[dict] | None = None,
    nivel: str | None = None,
    columnas: list[str] | None = None,
    con_id: bool = True,
) -> dict:
    """Página de registros; ``id`` es la fila del CSV y ``nivel`` el nivel del objetivo."""
    vista = df.copy()
    if con_id:
        vista.insert(0, "id", df.index)
    if esquema is not None:
        vista["nivel"] = etiquetas_objetivo(df, esquema)
    if nivel:
        if "nivel" not in vista.columns:
            raise ValueError("Filtrar por nivel requiere el esquema del dataset.")
        vista = vista[vista["nivel"] == nivel]
    for filtro in filtros or []:
        vista = vista[_mascara_filtro(vista, filtro)]
    if orden:
        if orden not in vista.columns:
            raise ValueError(f"No existe la columna {orden}.")
        vista = vista.sort_values(orden, ascending=not descendente, kind="stable")
    if columnas:
        desconocidas = [c for c in columnas if c not in vista.columns]
        if desconocidas:
            raise ValueError(f"No existen las columnas {', '.join(desconocidas)}.")
        mantener = (["id"] if con_id else []) + [c for c in columnas if c not in ("id", "nivel")]
        vista = vista[mantener + (["nivel"] if "nivel" in vista.columns else [])]
    pagina = vista.iloc[max(desde, 0): max(desde, 0) + max(min(cantidad, 500), 1)]
    return {"total": int(len(vista)), "columnas": list(pagina.columns), "filas": pagina.to_dict(orient="records")}
