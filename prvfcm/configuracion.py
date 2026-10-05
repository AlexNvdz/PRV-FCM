"""
Configuración central del modelo PRV-FCM.

Aquí se definen:

* Los conceptos del Mapa Cognitivo Difuso (FCM) construidos a partir de las
  columnas del dataset xAPI-Edu-Data y su segmentación en conceptos de sistema
  (inmutables y mutables) y conceptos de acción (prescriptivos).
* Las reglas de codificación de las variables categóricas.
* Los hiperparámetros de cada etapa: FCM (y su rejilla de validación cruzada),
  algoritmo genético y prescripción.

Modificar este archivo es la forma recomendada de experimentar con otra
estructura de conceptos o con otros hiperparámetros.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace

# ---------------------------------------------------------------------------
# Tipos de concepto
# ---------------------------------------------------------------------------
INMUTABLE = "inmutable"  # Concepto de sistema que no cambia: rasgo del estudiante o del curso.
ACCION = "accion"        # Concepto prescriptivo: variable de decisión del AG.
MUTABLE = "mutable"      # Concepto de sistema de desempeño escolar que puede cambiar.


@dataclass(frozen=True)
class Concepto:
    """Descripción de un concepto del FCM.

    ``dinamico`` indica si el concepto se actualiza durante la inferencia. Solo
    aplica a los mutables: inmutables y acciones siempre quedan fijos (clamped).
    Un mutable no dinámico conserva su valor observado. Con la regla de Kosko
    modificada y lambda = 1, la inferencia converge a un punto fijo que no
    depende del valor inicial, así que un concepto que se actualiza pierde su
    valor observado (ver README).
    """

    id: str                 # Identificador (C1, C2, ...).
    columna: str            # Columna del CSV de origen.
    nombre: str             # Nombre descriptivo.
    tipo: str               # INMUTABLE, ACCION o MUTABLE.
    dinamico: bool = False  # True: se actualiza con la regla de inferencia.


# PlaceofBirth se excluye porque es casi redundante con NationalITy (ver
# COLUMNAS_EXCLUIDAS). Con ello los conceptos de acción quedan como C9-C12.
CONCEPTOS: tuple[Concepto, ...] = (
    # Conceptos de sistema inmutables (se mantienen fijos en la inferencia).
    Concepto("C1", "gender", "Género", INMUTABLE),
    Concepto("C2", "NationalITy", "Nacionalidad", INMUTABLE),
    Concepto("C3", "StageID", "Nivel educativo", INMUTABLE),
    Concepto("C4", "GradeID", "Grado", INMUTABLE),
    Concepto("C5", "SectionID", "Sección", INMUTABLE),
    Concepto("C6", "Topic", "Asignatura", INMUTABLE),
    Concepto("C7", "Semester", "Semestre", INMUTABLE),
    Concepto("C8", "Relation", "Responsable del estudiante", INMUTABLE),
    # Conceptos de acción / prescriptivos (genes del cromosoma).
    Concepto("C9", "raisedhands", "Manos levantadas", ACCION),
    Concepto("C10", "VisITedResources", "Recursos visitados", ACCION),
    Concepto("C11", "AnnouncementsView", "Anuncios consultados", ACCION),
    Concepto("C12", "Discussion", "Grupos de discusión", ACCION),
    # Conceptos de sistema mutables de desempeño escolar. C13-C15 conservan su
    # valor observado durante la inferencia; C16 evoluciona hasta la convergencia.
    Concepto("C13", "ParentAnsweringSurvey", "Padres responden encuesta", MUTABLE),
    Concepto("C14", "ParentschoolSatisfaction", "Satisfacción de los padres", MUTABLE),
    Concepto("C15", "StudentAbsenceDays", "Ausentismo (> 7 días)", MUTABLE),
    Concepto("C16", "Class", "Rendimiento académico", MUTABLE, dinamico=True),
)

# Concepto de decisión: rendimiento académico. No tiene aristas salientes.
CONCEPTO_OBJETIVO = "Class"

# Columnas del CSV que no se usan como conceptos.
COLUMNAS_EXCLUIDAS: tuple[str, ...] = ("PlaceofBirth",)

# ---------------------------------------------------------------------------
# Codificación de variables categóricas
# ---------------------------------------------------------------------------
# Variables binarias u ordinales: mapa explícito categoría -> entero. El orden
# de los enteros define el sentido del concepto (1 = presencia / nivel alto).
CODIFICACION_ORDINAL: dict[str, dict[str, int]] = {
    "gender": {"F": 0, "M": 1},
    "StageID": {"lowerlevel": 0, "MiddleSchool": 1, "HighSchool": 2},
    "Semester": {"F": 0, "S": 1},
    "Relation": {"Father": 0, "Mum": 1},
    "ParentAnsweringSurvey": {"No": 0, "Yes": 1},
    "ParentschoolSatisfaction": {"Bad": 0, "Good": 1},
    "StudentAbsenceDays": {"Under-7": 0, "Above-7": 1},
    "Class": {"L": 0, "M": 1, "H": 2},
}

# GradeID ("G-07") se convierte al número de grado (7).
COLUMNAS_GRADO: tuple[str, ...] = ("GradeID",)

# Variables nominales con más de dos categorías sin orden natural. Se codifican
# con la media suavizada del rendimiento por categoría (target encoding),
# ajustada solo con los datos de entrenamiento para evitar fuga de información.
COLUMNAS_NOMINALES: tuple[str, ...] = ("NationalITy", "SectionID", "Topic")

# Niveles del rendimiento académico tras normalizar Class (L=0, M=0.5, H=1).
NIVELES_RENDIMIENTO: dict[str, float] = {"L": 0.0, "M": 0.5, "H": 1.0}

# Pendiente de la sigmoide que PRV-FCM reporta para este dataset (Hoyos et al., 2023, Tabla 10).
LAMBDA_ARTICULO = 10.0


# ---------------------------------------------------------------------------
# Esquema de un dataset
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Esquema:
    """Cómo leer un dataset: conceptos del FCM, codificación de columnas y niveles del objetivo.

    ``niveles`` asigna a cada etiqueta del objetivo su valor normalizado. El
    valor 1 es el mejor nivel: el estado deseado de la prescripción. Si el
    objetivo es ordinal, sus etiquetas son las categorías; si es numérico, cada
    valor normalizado se asigna al nivel más cercano.

    ``one_hot`` describe los conceptos indicadores: una columna nominal con
    codificación one-hot se convierte en un concepto 0/1 por categoría, cuya
    ``columna`` es "origen=categoría" y no existe en el CSV.
    """

    conceptos: tuple[Concepto, ...]
    objetivo: str
    codificacion_ordinal: dict[str, dict[str, int]] = field(default_factory=dict)
    columnas_numero_en_texto: tuple[str, ...] = ()   # "G-07" -> 7.
    columnas_nominales: tuple[str, ...] = ()         # Media suavizada del objetivo por categoría.
    columnas_excluidas: tuple[str, ...] = ()
    niveles: dict[str, float] = field(default_factory=lambda: dict(NIVELES_RENDIMIENTO))
    invertir_objetivo: bool = False                  # Objetivo numérico en el que menos es mejor.
    nombre: str = ""
    one_hot: dict[str, tuple[str, str]] = field(default_factory=dict)  # Concepto -> (columna origen, categoría).

    @property
    def columnas(self) -> list[str]:
        """Columna de cada concepto, en el orden de los conceptos (incluye los indicadores one-hot)."""
        return [c.columna for c in self.conceptos]

    def origen(self, columna: str) -> str:
        """Columna del CSV de la que sale un concepto (la misma, salvo en los indicadores one-hot)."""
        return self.one_hot[columna][0] if columna in self.one_hot else columna

    @property
    def columnas_origen(self) -> list[str]:
        """Columnas del CSV que usan los conceptos, sin repetir y en orden de aparición."""
        return list(dict.fromkeys(self.origen(c) for c in self.columnas))

    @property
    def mejor_nivel(self) -> str:
        return max(self.niveles, key=self.niveles.get)

    @property
    def niveles_a_prescribir(self) -> tuple[str, ...]:
        """Niveles que reciben prescripción: todos menos el mejor."""
        return tuple(n for n in self.niveles if n != self.mejor_nivel)

    @property
    def tolerancia_exito(self) -> float:
        """Distancia al valor 1 que aún cuenta como mejor nivel: la mitad del salto desde el nivel anterior."""
        valores = sorted(set(self.niveles.values()))
        return (valores[-1] - valores[-2]) / 2 if len(valores) > 1 else 0.5


ESQUEMA_XAPI = Esquema(
    conceptos=CONCEPTOS,
    objetivo=CONCEPTO_OBJETIVO,
    codificacion_ordinal=CODIFICACION_ORDINAL,
    columnas_numero_en_texto=COLUMNAS_GRADO,
    columnas_nominales=COLUMNAS_NOMINALES,
    columnas_excluidas=COLUMNAS_EXCLUIDAS,
    niveles=NIVELES_RENDIMIENTO,
    nombre="xAPI-Edu-Data",
)


def con_mutables_dinamicos(esquema: Esquema = ESQUEMA_XAPI) -> Esquema:
    """Variante en la que todos los conceptos mutables se actualizan en la inferencia.

    El FCM estima entonces C13-C15 a partir de los conceptos fijos y descarta sus
    valores observados. Por ejemplo, un estudiante con más de 7 ausencias pasa a
    tener el ausentismo que el modelo infiere de su participación.
    """
    conceptos = tuple(replace(c, dinamico=True) if c.tipo == MUTABLE else c for c in esquema.conceptos)
    return replace(esquema, conceptos=conceptos)


# ---------------------------------------------------------------------------
# Hiperparámetros
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ConfigFCM:
    """Parámetros de la inferencia y del aprendizaje del FCM."""

    lambda_: float = 1.0           # Pendiente de la sigmoide f(x) = 1/(1+exp(-lambda*x)).
    coef_memoria: float = 1.0      # k2: peso del estado previo del propio concepto.
    coef_influencia: float = 1.0   # k1: peso de la influencia de los demás conceptos.
    tolerancia: float = 1e-5       # Convergencia: max |A(t+1) - A(t)| < tolerancia.
    max_iter: int = 100            # Iteraciones máximas de inferencia.
    peso_min: float = -1.0         # Rango permitido de los pesos causales.
    peso_max: float = 1.0
    alpha_l2: float = 1e-3         # Regularización del aprendizaje de pesos (L2; L1 con "lasso").
    pasos_entrenamiento: int = 30  # Iteraciones desplegadas al aprender los pesos.
    max_iter_optimizador: int = 500
    metodo_pesos: str = "bptt"     # "bptt", "ridge", "lasso" o "correlacion_parcial" (ver fcm.METODOS_PESOS).
    # Pondera cada registro por la inversa de la frecuencia de su nivel del objetivo al aprender W
    # (BPTT, Ridge y Lasso). Útil con objetivos desbalanceados, como la deserción.
    balancear_niveles: bool = False


@dataclass(frozen=True)
class ConfigSeleccion:
    """Validación cruzada agrupada para elegir los hiperparámetros del FCM.

    Como en PRV-FCM, la pendiente de la sigmoide se elige con validación cruzada
    sobre el conjunto de entrenamiento. La rejilla incluye ``LAMBDA_ARTICULO``.
    """

    pliegues: int = 5
    rejilla_lambda: tuple[float, ...] = (0.5, 1.0, 2.0, 3.0, 5.0, 10.0)
    rejilla_alpha: tuple[float, ...] = (1e-4, 1e-3, 1e-2)


@dataclass(frozen=True)
class ConfigAG:
    """Parámetros del algoritmo genético de codificación real."""

    tam_poblacion: int = 50
    generaciones: int = 100
    tam_torneo: int = 3
    tasa_cruce: float = 0.9
    tipo_cruce: str = "uniforme"   # "uniforme" o "un_punto".
    tasa_mutacion: float = 0.25    # Probabilidad de mutar cada gen.
    sigma_mutacion: float = 0.15   # Desviación de la mutación gaussiana (fracción del rango del gen).
    elitismo: int = 2              # Individuos que pasan intactos a la siguiente generación.
    paciencia: int = 25            # Generaciones sin mejora antes de detenerse.


@dataclass(frozen=True)
class ConfigPrescripcion:
    """Estado deseado, restricciones de las acciones y criterio de éxito."""

    # Estado deseado de alto rendimiento: columna -> valor normalizado deseado.
    estado_deseado: dict[str, float] = field(default_factory=lambda: {"Class": 1.0})
    # Importancia relativa de cada concepto del estado deseado (por defecto 1).
    pesos_objetivo: dict[str, float] = field(default_factory=dict)
    # Penalización del esfuerzo: beta * media |a - a_actual|. 0 = solo error absoluto.
    beta_esfuerzo: float = 0.05
    # Si es True, las acciones solo pueden mantenerse o aumentar.
    solo_incrementos: bool = True
    # Cambio máximo permitido por acción (en escala normalizada). None = sin límite.
    delta_max: float | None = None
    # Éxito prescriptivo: |A_i* - D_i| <= tolerancia para todos los conceptos objetivo.
    # Con 0.25 y Class deseada = 1 equivale a alcanzar el nivel H.
    tolerancia_exito: float = 0.25
    # Clases observadas de los estudiantes que reciben prescripción.
    clases_a_prescribir: tuple[str, ...] = ("L", "M")
