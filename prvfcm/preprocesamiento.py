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
      one-hot: un concepto 0/1 por categoría.
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

from .configuracion import ACCION, ESQUEMA_XAPI, INMUTABLE, MUTABLE, Esquema
from .evaluacion import discretizar_rendimiento

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


def cargar_datos(ruta: str | Path, esquema: Esquema = ESQUEMA_XAPI) -> pd.DataFrame:
    """Carga el CSV (o Excel), limpia espacios y valida que existan las columnas del esquema."""
    df = leer_tabla(ruta)
    faltantes = set(esquema.columnas_origen) - set(df.columns)
    if faltantes:
        raise ValueError(f"Faltan columnas en el dataset: {sorted(faltantes)}")

    n_original = len(df)
    df = df.drop(columns=[c for c in esquema.columnas_excluidas if c in df.columns])
    df = df.dropna(subset=esquema.columnas_origen)  # Se conserva el índice: identifica la fila original del CSV.
    if len(df) < n_original:
        print(f"Aviso: se descartaron {n_original - len(df)} filas con valores faltantes.")

    for columna in df.columns:
        if not pd.api.types.is_numeric_dtype(df[columna]):
            df[columna] = df[columna].astype(str).str.strip()
    return df


def objetivo_normalizado(df: pd.DataFrame, esquema: Esquema) -> pd.Series:
    """Objetivo en [0, 1] (1 = mejor nivel) con el mínimo y el máximo de ``df``."""
    serie = df[esquema.objetivo]
    if esquema.objetivo in esquema.codificacion_ordinal:
        mapa = esquema.codificacion_ordinal[esquema.objetivo]
        return como_texto(serie).map(mapa) / max(mapa.values())
    valores = pd.to_numeric(serie).astype(float)
    if esquema.invertir_objetivo:
        valores = -valores
    rango = valores.max() - valores.min()
    return (valores - valores.min()) / (rango if rango > 0 else 1.0)


def etiquetas_objetivo(df: pd.DataFrame, esquema: Esquema = ESQUEMA_XAPI) -> np.ndarray:
    """Nivel del objetivo de cada registro: su categoría o, si es numérico, el nivel más cercano.

    Para un objetivo numérico usa el mínimo y el máximo de ``df``; sirve para
    estratificar. Después de ajustar, use ``Preprocesador.etiquetas``.
    """
    if esquema.objetivo in esquema.codificacion_ordinal:
        return como_texto(df[esquema.objetivo]).to_numpy()
    return discretizar_rendimiento(objetivo_normalizado(df, esquema).to_numpy(), esquema.niveles)


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
        raise ValueError(f"proporcion_prueba debe estar entre {1 / n_partes:g} y {1 - 1 / n_partes:g}.")
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
            else:
                codificado[columna] = pd.to_numeric(serie).astype(float)
                if columna == esquema.objetivo and esquema.invertir_objetivo:
                    codificado[columna] = -codificado[columna]
        return codificado

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

        codificado = self._codificar(df)
        self.minimos = codificado.min()
        self.maximos = codificado.max()
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

    def etiquetas(self, df: pd.DataFrame) -> np.ndarray:
        """Nivel observado del objetivo con la normalización de entrenamiento."""
        if self.esquema.objetivo in self.esquema.codificacion_ordinal:
            return como_texto(df[self.esquema.objetivo]).to_numpy()
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
            "minimos": {c: float(v) for c, v in self.minimos.items()},
            "maximos": {c: float(v) for c, v in self.maximos.items()},
        }

    @classmethod
    def desde_dict(cls, datos: dict, esquema: Esquema) -> "Preprocesador":
        pre = cls(esquema, datos["suavizado"])
        pre.mapas_nominales = {c: {str(k): float(v) for k, v in m.items()} for c, m in datos["mapas_nominales"].items()}
        pre.media_global = float(datos["media_global"])
        pre.minimos = pd.Series(datos["minimos"], dtype=float)[pre.columnas]
        pre.maximos = pd.Series(datos["maximos"], dtype=float)[pre.columnas]
        return pre
