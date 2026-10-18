"""
Etapa 1: Preprocesamiento de datos.

* Carga del CSV o Excel (original, expandido u otro dataset descrito por un
  ``Esquema``); en un CSV el separador se detecta en la cabecera.
* División entrenamiento/prueba estratificada por el nivel del objetivo y
  agrupada por perfil inmutable (C1-C8 en xAPI), para que las variantes de un
  estudiante no queden en ambas particiones.
* Codificación de variables según el esquema:
    - binarias/ordinales (label encoding) con mapas explícitos;
    - números dentro de texto ("G-07" -> 7);
    - nominales (nacionalidad, sección, asignatura) con la media suavizada del
      objetivo por categoría, ajustada solo con datos de entrenamiento, o
      one-hot: un concepto 0/1 por categoría;
    - fechas: días desde la fecha mínima de entrenamiento.
* Los vacíos de las columnas numéricas y de fecha se imputan con la mediana de
  entrenamiento; las filas con vacíos en otras columnas se descartan.
* SMOTE (opcional) para equilibrar los niveles, solo en el entrenamiento.
* Normalización Min-Max al rango [0, 1] (mínimos y máximos de entrenamiento):
  la "fuzzificación" de cada variable, x' = (x - min) / (max - min).
* Segmentación de conceptos en sistema (inmutables y mutables) y acción.
"""
from __future__ import annotations

import io
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold, train_test_split
from sklearn.neighbors import NearestNeighbors

from .configuracion import ACCION, ESQUEMA_XAPI, INMUTABLE, MUTABLE, Esquema
from .evaluacion import discretizar_rendimiento
from .reporte import numero

SEPARADORES = (",", ";", "\t", "|")
EXTENSIONES_EXCEL = (".xlsx", ".xlsm", ".xls")


def booleanas_como_texto(df: pd.DataFrame) -> pd.DataFrame:
    """Columnas True/False como texto "True"/"False": son categorías, no números.

    pandas las lee como booleanas, que cuentan como numéricas pero no admiten
    restas (cuartiles, Min-Max) y se confundirían con 0/1.
    """
    for columna in df.columns:
        if pd.api.types.is_bool_dtype(df[columna]):
            df[columna] = df[columna].map({True: "True", False: "False"})
    return df


def leer_csv(ruta: str | Path) -> pd.DataFrame:
    """Lee un CSV con el separador más frecuente de la cabecera (UTF-8 o, si falla, Latin-1)."""
    for codificacion in ("utf-8-sig", "latin-1"):
        try:
            with open(ruta, encoding=codificacion) as archivo:
                cabecera = archivo.readline()
            df = pd.read_csv(ruta, sep=max(SEPARADORES, key=cabecera.count), encoding=codificacion)
            break
        except UnicodeDecodeError:
            continue
    df.columns = df.columns.astype(str).str.strip()
    return booleanas_como_texto(df)


def leer_excel(ruta: str | Path, extension: str | None = None) -> tuple[pd.DataFrame, str, list[str]]:
    """Primera hoja con datos de un libro de Excel: (tabla, hoja usada, todas las hojas).

    El archivo se lee como bytes para no depender de su nombre: la subida web lo
    guarda sin extensión. Se descartan filas y columnas completamente vacías.
    """
    extension = (extension or Path(ruta).suffix).lower()
    if extension not in EXTENSIONES_EXCEL:
        raise ValueError(f"Extensión de Excel no reconocida: {extension or '(ninguna)'}.")
    motor = "xlrd" if extension == ".xls" else "openpyxl"
    contenido = io.BytesIO(Path(ruta).read_bytes())
    try:
        hojas = pd.read_excel(contenido, sheet_name=None, engine=motor)
    except ImportError as error:
        raise ValueError(f"Para leer {extension} instale el paquete {motor} (pip install {motor}).") from error
    for nombre, df in hojas.items():
        df = df.dropna(how="all").dropna(axis=1, how="all")
        if not df.empty:
            df.columns = df.columns.astype(str).str.strip()
            return booleanas_como_texto(df.reset_index(drop=True)), str(nombre), [str(h) for h in hojas]
    raise ValueError("El libro de Excel no tiene hojas con datos.")


def leer_tabla(ruta: str | Path) -> pd.DataFrame:
    """CSV o Excel según la extensión del archivo."""
    if Path(ruta).suffix.lower() in EXTENSIONES_EXCEL:
        return leer_excel(ruta)[0]
    return leer_csv(ruta)


def fechas(serie: pd.Series) -> pd.Series:
    """Fechas de una columna: año primero si empieza por él (2012-09-04), si no, día primero ("04-09-2012" = 4 de septiembre).

    Las ilegibles quedan vacías. (pandas con ``dayfirst=True`` invierte día y mes también en las ISO.)
    """
    texto = serie.astype(str).str.strip()
    iso = texto.str.match(r"\d{4}[-/.]")
    return pd.concat(
        [pd.to_datetime(texto[iso], errors="coerce"), pd.to_datetime(texto[~iso], dayfirst=True, errors="coerce")]
    ).reindex(serie.index)


def como_texto(serie: pd.Series) -> pd.Series:
    """Valores como texto sin espacios; los números enteros sin decimales (1.0 -> "1").

    Las codificaciones ordinal y nominal comparan categorías como texto, así el
    esquema (JSON) y los datos coinciden aunque la columna sea numérica. Las
    booleanas pasan a "True"/"False", igual que al leer el archivo.
    """
    if pd.api.types.is_bool_dtype(serie):
        return serie.map({True: "True", False: "False"})
    if pd.api.types.is_numeric_dtype(serie):
        return serie.map(lambda v: str(int(v)) if float(v).is_integer() else str(v))
    return serie.astype(str).str.strip()


def limites_robustos(valores: pd.Series, cola_max: float = 0.01) -> tuple[float, float]:
    """Mínimo y máximo para el Min-Max sin estirarlo por atípicos.

    Una cola que queda más allá de 3 rangos intercuartílicos y reúne como mucho el 1 %
    de los registros se recorta a esa cerca (en marketing, un ingreso de 666 666
    dejaba al 98 % de los clientes en el 13 % inferior de la escala). Una cola más
    poblada es una parte real de los datos y se conserva.
    """
    minimo, maximo = float(valores.min()), float(valores.max())
    q1, q3 = valores.quantile([0.25, 0.75])
    rango = q3 - q1
    if rango <= 0:
        return minimo, maximo
    bajo, alto = q1 - 3 * rango, q3 + 3 * rango
    if minimo < bajo and (valores < bajo).mean() <= cola_max:
        minimo = float(bajo)
    if maximo > alto and (valores > alto).mean() <= cola_max:
        maximo = float(alto)
    return minimo, maximo


def columnas_imputables(esquema: Esquema) -> list[str]:
    """Columnas numéricas y de fecha, salvo el objetivo: sus vacíos se imputan con la mediana de entrenamiento."""
    otras = (
        set(esquema.codificacion_ordinal) | set(esquema.columnas_nominales)
        | set(esquema.columnas_numero_en_texto) | set(esquema.one_hot) | {esquema.objetivo}
    )
    return [c for c in esquema.columnas if c not in otras]


def cargar_datos(ruta: str | Path, esquema: Esquema = ESQUEMA_XAPI) -> pd.DataFrame:
    """Carga el CSV (o Excel), limpia espacios y valida que existan las columnas del esquema.

    Descarta las filas con vacíos en columnas categóricas o en el objetivo; los
    vacíos numéricos y de fecha los imputa el ``Preprocesador``.
    """
    df = leer_tabla(ruta)
    faltantes = set(esquema.columnas_origen) - set(df.columns)
    if faltantes:
        raise ValueError(f"Faltan columnas en el dataset: {sorted(faltantes)}")

    n_original = len(df)
    df = df.drop(columns=[c for c in esquema.columnas_excluidas if c in df.columns])
    imputables = set(columnas_imputables(esquema))
    # Se conserva el índice: identifica la fila original del CSV.
    df = df.dropna(subset=[c for c in esquema.columnas_origen if c not in imputables])
    if len(df) < n_original:
        print(f"Aviso: se descartaron {n_original - len(df)} filas con valores faltantes.")

    for columna in df.columns:
        if not pd.api.types.is_numeric_dtype(df[columna]):
            df[columna] = df[columna].astype(str).str.strip()
    return df


def objetivo_numerico(serie: pd.Series, esquema: Esquema) -> pd.Series:
    """Objetivo numérico codificado: negado si menos es mejor, o 0/1 si se binarizó con un umbral."""
    valores = pd.to_numeric(serie).astype(float)
    if esquema.umbral_objetivo is not None:
        exito = valores <= esquema.umbral_objetivo if esquema.invertir_objetivo else valores >= esquema.umbral_objetivo
        return exito.astype(float)
    return -valores if esquema.invertir_objetivo else valores


def objetivo_normalizado(df: pd.DataFrame, esquema: Esquema) -> pd.Series:
    """Objetivo en [0, 1] (1 = mejor nivel) con el mínimo y el máximo de ``df``."""
    serie = df[esquema.objetivo]
    if esquema.objetivo in esquema.codificacion_ordinal:
        mapa = esquema.codificacion_ordinal[esquema.objetivo]
        return como_texto(serie).map(mapa) / max(mapa.values())
    valores = objetivo_numerico(serie, esquema)
    rango = valores.max() - valores.min()
    return (valores - valores.min()) / (rango if rango > 0 else 1.0)


def etiquetas_objetivo(df: pd.DataFrame, esquema: Esquema = ESQUEMA_XAPI) -> np.ndarray:
    """Nivel del objetivo de cada registro: su categoría o, si es numérico, el nivel más cercano.

    Para un objetivo numérico usa el mínimo y el máximo de ``df``; sirve para
    estratificar. Después de ajustar, use ``Preprocesador.etiquetas``. Si el
    objetivo ordinal se binarizó, cada categoría pasa a su nivel ("<M", "≥M").
    """
    if esquema.objetivo in esquema.codificacion_ordinal:
        return niveles_de_categorias(df[esquema.objetivo], esquema)
    return discretizar_rendimiento(objetivo_normalizado(df, esquema).to_numpy(), esquema.niveles)


def niveles_de_categorias(serie: pd.Series, esquema: Esquema) -> np.ndarray:
    """Nivel de cada categoría de un objetivo ordinal (la categoría misma, salvo si se binarizó)."""
    mapa = esquema.nivel_de_categoria
    return como_texto(serie).map(lambda t: mapa.get(t, t)).to_numpy()


def smote(X: np.ndarray, etiquetas: np.ndarray, k: int = 5, semilla: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """SMOTE (Chawla et al., 2002): registros sintéticos de cada nivel minoritario hasta igualar al mayoritario.

    Cada sintético está en el segmento entre un registro del nivel y uno de sus
    ``k`` vecinos más cercanos del mismo nivel, en la escala normalizada.
    Aplíquelo solo al entrenamiento (de cada pliegue): PRV-FCM lo aplicó antes de
    dividir, así que la prueba tenía variantes de registros de entrenamiento.
    """
    rng = np.random.default_rng(semilla)
    etiquetas = np.asarray(etiquetas)
    niveles, conteos = np.unique(etiquetas, return_counts=True)
    X_nuevos, etiquetas_nuevas = [X], [etiquetas]
    for nivel, n in zip(niveles, conteos):
        faltan = int(conteos.max() - n)
        if faltan == 0:
            continue
        grupo = X[etiquetas == nivel]
        if len(grupo) == 1:
            sinteticos = np.repeat(grupo, faltan, axis=0)
        else:
            k_nivel = min(k, len(grupo) - 1)
            vecinos = NearestNeighbors(n_neighbors=k_nivel + 1).fit(grupo).kneighbors(grupo, return_distance=False)[:, 1:]
            base = rng.integers(0, len(grupo), faltan)
            vecino = vecinos[base, rng.integers(0, k_nivel, faltan)]
            sinteticos = grupo[base] + rng.random((faltan, 1)) * (grupo[vecino] - grupo[base])
        X_nuevos.append(sinteticos)
        etiquetas_nuevas.append(np.full(faltan, nivel, dtype=etiquetas.dtype))
    return np.vstack(X_nuevos), np.concatenate(etiquetas_nuevas)


def grupos_por_perfil(df: pd.DataFrame, esquema: Esquema = ESQUEMA_XAPI) -> np.ndarray:
    """Identificador de grupo por perfil inmutable: misma combinación de C1-C8.

    En el dataset expandido, las variantes sintéticas de un estudiante casi siempre
    conservan su perfil inmutable. Agrupar por perfil las mantiene en la misma partición.
    Sin conceptos inmutables, cada registro es su propio grupo.
    """
    columnas = list(dict.fromkeys(esquema.origen(c.columna) for c in esquema.conceptos if c.tipo == INMUTABLE))
    if not columnas:
        return np.arange(len(df))
    return df.groupby(columnas, sort=False, dropna=False).ngroup().to_numpy()


def dividir_entrenamiento_prueba(
    df: pd.DataFrame,
    proporcion_prueba: float = 0.3,
    semilla: int = 42,
    grupos: np.ndarray | None = None,
    esquema: Esquema = ESQUEMA_XAPI,
    n_partes: int = 20,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """División estratificada por el nivel del objetivo.

    Sin ``grupos``, la división es aleatoria. Con ``grupos``, cada grupo queda
    completo en entrenamiento o en prueba: los datos se reparten en ``n_partes``
    pliegues agrupados y estratificados, y la prueba toma
    ``round(proporcion_prueba * n_partes)`` de ellos.

    Los índices se conservan para identificar a cada estudiante por su fila en el CSV.
    """
    estratos = etiquetas_objetivo(df, esquema)
    if grupos is None:
        entrenamiento, prueba = train_test_split(
            df, test_size=proporcion_prueba, stratify=estratos, random_state=semilla
        )
        return entrenamiento, prueba
    n_prueba = round(proporcion_prueba * n_partes)
    if not 1 <= n_prueba < n_partes:
        raise ValueError(f"proporcion_prueba debe estar entre {numero(1 / n_partes, 6)} y {numero(1 - 1 / n_partes, 6)}.")
    pliegues = StratifiedGroupKFold(n_splits=n_partes, shuffle=True, random_state=semilla)
    partes = [prueba for _, prueba in pliegues.split(df, estratos, groups=grupos)]
    es_prueba = np.zeros(len(df), dtype=bool)
    es_prueba[np.concatenate(partes[:n_prueba])] = True
    return df[~es_prueba], df[es_prueba]


class Preprocesador:
    """Codifica y normaliza el dataset en una matriz de activaciones en [0, 1].

    Sigue la interfaz ajustar/transformar: todos los parámetros (medias por
    categoría, mínimos y máximos) se estiman solo con datos de entrenamiento.

    Parameters
    ----------
    esquema:
        Conceptos del FCM (en el orden de las columnas de la matriz resultante)
        y codificación de cada columna.
    suavizado:
        Peso ``m`` de la media global en la codificación de variables nominales:
        ``(n_c * media_c + m * media_global) / (n_c + m)``. Evita valores
        extremos en categorías con pocos estudiantes.
    """

    def __init__(self, esquema: Esquema = ESQUEMA_XAPI, suavizado: float = 10.0):
        self.esquema = esquema
        self.conceptos = esquema.conceptos
        self.suavizado = suavizado
        self.columnas = [c.columna for c in self.conceptos]
        self.mapas_nominales: dict[str, dict[str, float]] = {}
        self.media_global: float = 0.0
        self.medianas: dict[str, float] = {}
        self.fechas_minimas: dict[str, str] = {}
        self.minimos: pd.Series | None = None
        self.maximos: pd.Series | None = None

    # ------------------------------------------------------------------
    # Segmentación de conceptos
    # ------------------------------------------------------------------
    def _indices_de_tipo(self, tipo: str) -> np.ndarray:
        return np.array([i for i, c in enumerate(self.conceptos) if c.tipo == tipo], dtype=int)

    @property
    def indices_inmutables(self) -> np.ndarray:
        return self._indices_de_tipo(INMUTABLE)

    @property
    def indices_accion(self) -> np.ndarray:
        return self._indices_de_tipo(ACCION)

    @property
    def indices_mutables(self) -> np.ndarray:
        return self._indices_de_tipo(MUTABLE)

    @property
    def indices_dinamicos(self) -> np.ndarray:
        """Conceptos mutables que se actualizan durante la inferencia."""
        return np.array([i for i, c in enumerate(self.conceptos) if c.tipo == MUTABLE and c.dinamico], dtype=int)

    @property
    def indices_fijos(self) -> np.ndarray:
        """Conceptos que no cambian durante la inferencia (todos menos los dinámicos)."""
        return np.setdiff1d(np.arange(len(self.conceptos)), self.indices_dinamicos)

    @property
    def indice_objetivo(self) -> int:
        return self.indice(self.esquema.objetivo)

    def indice(self, columna: str) -> int:
        """Posición del concepto asociado a una columna del CSV."""
        return self.columnas.index(columna)

    # ------------------------------------------------------------------
    # Codificación
    # ------------------------------------------------------------------
    def _codificar(self, df: pd.DataFrame) -> pd.DataFrame:
        """Convierte todas las columnas de conceptos a valores numéricos."""
        esquema = self.esquema
        codificado = pd.DataFrame(index=df.index)
        for columna in self.columnas:
            if columna in esquema.one_hot:
                # Indicador 0/1; una categoría que no está en el esquema deja todos los indicadores en 0.
                origen, categoria = esquema.one_hot[columna]
                codificado[columna] = (como_texto(df[origen]) == categoria).astype(float)
                continue
            serie = df[columna]
            if columna in esquema.codificacion_ordinal:
                mapa = esquema.codificacion_ordinal[columna]
                texto = como_texto(serie)
                desconocidas = set(texto.unique()) - set(mapa)
                if desconocidas:
                    raise ValueError(f"Categorías no reconocidas en {columna}: {sorted(desconocidas)}")
                codificado[columna] = texto.map(mapa).astype(float)
            elif columna in esquema.columnas_numero_en_texto:
                codificado[columna] = como_texto(serie).str.extract(r"(\d+)", expand=False).astype(float)
            elif columna in esquema.columnas_nominales:
                mapa = self.mapas_nominales[columna]
                codificado[columna] = como_texto(serie).map(mapa).fillna(self.media_global).astype(float)
            elif columna in esquema.columnas_fecha:
                dias = fechas(serie) - pd.Timestamp(self.fechas_minimas[columna])
                codificado[columna] = dias.dt.days.astype(float)
            elif columna == esquema.objetivo:
                codificado[columna] = objetivo_numerico(serie, esquema)
            else:
                codificado[columna] = pd.to_numeric(serie).astype(float)
        return codificado.fillna(self.medianas) if self.medianas else codificado

    def ajustar(self, df: pd.DataFrame) -> "Preprocesador":
        """Estima la codificación nominal y los parámetros Min-Max."""
        rendimiento = objetivo_normalizado(df, self.esquema)
        self.media_global = float(rendimiento.mean())
        m = self.suavizado
        for columna in self.esquema.columnas_nominales:
            if columna not in self.columnas:
                continue
            estadisticos = rendimiento.groupby(como_texto(df[columna])).agg(["mean", "count"])
            suavizada = (estadisticos["count"] * estadisticos["mean"] + m * self.media_global) / (
                estadisticos["count"] + m
            )
            self.mapas_nominales[columna] = suavizada.to_dict()
        self.fechas_minimas = {c: fechas(df[c]).min().isoformat() for c in self.esquema.columnas_fecha if c in self.columnas}

        self.medianas = {}
        codificado = self._codificar(df)
        imputables = columnas_imputables(self.esquema)
        self.medianas = {c: float(v) for c, v in codificado[imputables].median().items()}
        codificado = codificado.fillna(self.medianas)
        self.minimos = codificado.min()
        self.maximos = codificado.max()
        for columna in imputables:
            self.minimos[columna], self.maximos[columna] = limites_robustos(codificado[columna])
        return self

    def transformar(self, df: pd.DataFrame) -> np.ndarray:
        """Devuelve la matriz (n_estudiantes, n_conceptos) normalizada a [0, 1]."""
        if self.minimos is None:
            raise RuntimeError("Llame a ajustar() antes de transformar().")
        codificado = self._codificar(df)
        rango = (self.maximos - self.minimos).replace(0.0, 1.0)
        normalizado = (codificado - self.minimos) / rango
        return normalizado.clip(0.0, 1.0).to_numpy(dtype=float)

    def ajustar_transformar(self, df: pd.DataFrame) -> np.ndarray:
        return self.ajustar(df).transformar(df)

    def normalizar(self, valores: np.ndarray, columna: str) -> np.ndarray:
        """Lleva valores de una columna (ya codificados) a [0, 1], recortando fuera del rango."""
        minimo, maximo = self.minimos[columna], self.maximos[columna]
        rango = (maximo - minimo) or 1.0
        return np.clip((np.asarray(valores, dtype=float) - minimo) / rango, 0.0, 1.0)

    def desnormalizar(self, valores: np.ndarray, columna: str) -> np.ndarray:
        """Devuelve valores normalizados de una columna a su escala original."""
        minimo, maximo = self.minimos[columna], self.maximos[columna]
        return np.asarray(valores) * (maximo - minimo) + minimo

    def rejillas_accion(self) -> list[np.ndarray | None]:
        """Valores normalizados que admite cada acción: los de sus categorías si es ordinal (None si es continua)."""
        rejillas = []
        for i in self.indices_accion:
            mapa = self.esquema.codificacion_ordinal.get(self.columnas[i])
            rejillas.append(None if mapa is None else np.unique(self.normalizar(list(mapa.values()), self.columnas[i])))
        return rejillas

    def etiquetas(self, df: pd.DataFrame) -> np.ndarray:
        """Nivel observado del objetivo con la normalización de entrenamiento."""
        if self.esquema.objetivo in self.esquema.codificacion_ordinal:
            return niveles_de_categorias(df[self.esquema.objetivo], self.esquema)
        return discretizar_rendimiento(self.transformar(df)[:, self.indice_objetivo], self.esquema.niveles)

    def resumen_conceptos(self) -> pd.DataFrame:
        """Tabla con la segmentación de conceptos y su rango original."""
        filas = []
        for c in self.conceptos:
            filas.append(
                {
                    "id": c.id,
                    "columna": c.columna,
                    "nombre": c.nombre,
                    "tipo": c.tipo,
                    "en_inferencia": "se actualiza" if c.tipo == MUTABLE and c.dinamico else "fijo",
                    "min": self.minimos[c.columna] if self.minimos is not None else np.nan,
                    "max": self.maximos[c.columna] if self.maximos is not None else np.nan,
                }
            )
        return pd.DataFrame(filas)

    # ------------------------------------------------------------------
    # Persistencia
    # ------------------------------------------------------------------
    def a_dict(self) -> dict:
        """Parámetros ajustados, serializables en JSON."""
        return {
            "suavizado": self.suavizado,
            "mapas_nominales": self.mapas_nominales,
            "media_global": self.media_global,
            "medianas": self.medianas,
            "fechas_minimas": self.fechas_minimas,
            "minimos": {c: float(v) for c, v in self.minimos.items()},
            "maximos": {c: float(v) for c, v in self.maximos.items()},
        }

    @classmethod
    def desde_dict(cls, datos: dict, esquema: Esquema) -> "Preprocesador":
        pre = cls(esquema, datos["suavizado"])
        pre.mapas_nominales = {c: {str(k): float(v) for k, v in m.items()} for c, m in datos["mapas_nominales"].items()}
        pre.media_global = float(datos["media_global"])
        pre.medianas = {c: float(v) for c, v in datos.get("medianas", {}).items()}
        pre.fechas_minimas = dict(datos.get("fechas_minimas", {}))
        pre.minimos = pd.Series(datos["minimos"], dtype=float)[pre.columnas]
        pre.maximos = pd.Series(datos["maximos"], dtype=float)[pre.columnas]
        return pre
