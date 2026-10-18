# PRV-FCM: prescripción del rendimiento académico

Implementación en Python de **PRV-FCM** (*PRescriptiVe Fuzzy Cognitive Maps* con
algoritmos genéticos; Hoyos, Aguilar y Toro, 2023) sobre el dataset
[Student Academic Performance (xAPI-Edu-Data)](https://www.kaggle.com/datasets/aljarah/xAPI-Edu-Data),
con sus 480 estudiantes originales.

Un Mapa Cognitivo Difuso (FCM) aprende de los datos cómo influyen los conceptos
del estudiante en su rendimiento académico. Después, un algoritmo genético (AG)
busca, para cada estudiante, los niveles de participación (C9-C12) que llevan
la inferencia del FCM al estado deseado de alto rendimiento.

El trabajo sigue cinco pasos, que la aplicación web recorre en orden:
(1) ingesta y exploración, con codificación y fuzzificación Min-Max a [0, 1];
(2) clasificación de los nodos en conceptos objetivo C_T, prescriptivos C_P y
del sistema C_S; (3) entrenamiento del FCM, es decir, extracción de la matriz
de pesos W con una máscara causal opcional; (4) motor prescriptivo con el AG,
también para un perfil de riesgo escrito a mano; y (5) visualización (grafo con
NetworkX, convergencia del AG) y reporte prescriptivo en lenguaje natural.

## Estructura

```
modelo-prescriptivo/
├── main.py                    Pipeline completo (etapas 1-4) y línea de comandos
├── experimentos.py            Ablación de perfiles y métodos de W en varios datasets
├── data/
│   ├── xAPI-Edu-Data.csv      Dataset por defecto (480 registros, 17 columnas)
│   ├── marketing_campaign.csv, heart.csv  Datasets de los experimentos (su esquema se define en la aplicación)
│   └── ObesityDataSet_raw_and_data_sinthetic.csv, winequality-white.csv  Datasets nuevos, sin esquema todavía
├── prvfcm/
│   ├── configuracion.py       Conceptos C1-C16, codificación e hiperparámetros
│   ├── preprocesamiento.py    Etapa 1: carga (CSV o Excel), división agrupada, codificación, Min-Max, segmentación
│   ├── fcm.py                 Etapa 2: reglas de la Tabla 2 (Kosko, Kosko modificada, reescalada; sigmoide o tanh) con sesgo; W por BPTT, Ridge, Lasso, correlación parcial, PSO o expertos
│   ├── seleccion.py           Etapa 2: validación cruzada agrupada (en paralelo) de lambda, alpha_l2, regla y activación
│   ├── genetico.py            Etapa 3: AG (torneo, cruce uniforme/un punto, mutación)
│   ├── prescripcion.py        Etapa 3: cromosoma, aptitudes (error, Tabla 4, García 2025), límites (tope por ausentismo), prescripción
│   ├── evaluacion.py          Etapa 4: MAE, MSE, RMSE, tasa de éxito, validación externa y reconstrucción (Tablas 11-12, ec. 19)
│   ├── reporte.py             Reporte prescriptivo en lenguaje natural
│   ├── visualizacion.py       Gráficas PNG y grafo del mapa con NetworkX
│   ├── pipeline.py            Las cuatro etapas en una función (consola y aplicación)
│   ├── esquema.py             Esquema de otros datasets (roles y codificación de columnas)
│   ├── perfilado.py           Perfil de columnas, sugerencia de esquema y consultas
│   ├── modelo.py              Modelo guardado en JSON (esquema, preprocesador, pesos y configuración)
│   ├── api.py                 PredictorFCM y PrescriptorAG: inferencia paso a paso, simulación y prescripción, sin interfaz
│   └── servicio.py            Motor para la aplicación web (JSON por stdin/stdout)
├── app/                       Aplicación web local (Node.js + React), ver app/README.md
├── tests/                     Pruebas unitarias (pytest)
├── resultados/                Salidas de la última ejecución (dataset por defecto, 480)
├── resultados_experimentos/   Ablación: resumen.csv, acciones.csv y resumen.md
└── resultados_480/            Salidas antiguas con el dataset original (80/20 aleatoria, sin sesgo), como referencia
```

## Aplicación web (Pizarra)

`app/` contiene una aplicación local con interfaz web sobre este mismo motor,
organizada en los cinco pasos: subir datasets de cualquier tema (rendimiento,
deserción, salud, mercadeo; CSV o Excel) y leer su reporte inicial; clasificar cada columna como C_T, C_P o C_S
(arrastrándola en un tablero o desde la tabla) y explorar cómo se relacionan
las variables entre sí y con el objetivo (mapa de calor de correlaciones,
dispersión por nivel, perfil medio de cada nivel); entrenar el PRV-FCM
eligiendo el método de extracción de W y la máscara causal, con la matriz W
como mapa de calor y el grafo dirigido de pesos; simular acciones por
estudiante viendo cada iteración de la inferencia y prescribir con el AG,
cuya evolución se reproduce generación por generación; y leer el informe con
el grafo NetworkX, la convergencia del AG y el reporte en frases. Aparte,
`/consulta` es el modo de usuario final: elige un modelo por tema, ingresa los
datos de un caso y recibe la prescripción, con registro del resultado
observado. Un asistente (`qwen2.5:7b` en Ollama), limitado al tema del dataset
activo, consulta los datos y las prescripciones y redacta recomendaciones.
Instrucciones en
[app/README.md](app/README.md).

```powershell
cd app
npm install
npm run app          # http://localhost:3001
```

## Instalación y uso

```powershell
python -m venv .venv
.venv\Scripts\activate          # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt

python main.py                                        # configuración por defecto (xAPI-Edu-Data, 480)
python main.py --sin-cv --lambda 1 --alpha-l2 0.001   # sin validación cruzada
python main.py --division aleatoria                   # división sin agrupar (sobrestima las métricas)
python main.py --sin-sesgo                            # regla sin sesgo, la del artículo
python main.py --beta 0.05                            # menos penalización del esfuerzo (ver Limitaciones)
python main.py --sin-tope-ausentismo                  # sin el tope de acciones con más de 7 ausencias
python main.py --mutables-dinamicos                   # C13-C15 también evolucionan (ver abajo)
python main.py --metodo-pesos ridge                   # W por regresión Ridge (también lasso, correlacion_parcial)
python main.py --excluir gender Class                 # máscara causal: elimina la arista gender -> Class
python main.py --equilibrar-niveles                   # cada nivel del objetivo pesa lo mismo (objetivos desbalanceados)
python main.py --perfil articulo --datos data/xAPI-Edu-Data.csv --binarizar-objetivo M   # como PRV-FCM (2023)
python main.py --metodo-pesos pso                     # W por enjambre de partículas (también: expertos con --expertos m.json)
python main.py --esquema app/almacen/modelos/<id>/esquema.json --datos data/heart.csv --permitir-reducciones   # otro dataset
python experimentos.py                                # ablación de perfiles y métodos (resultados_experimentos/)
python main.py --help                                 # todas las opciones
python -m pytest                                      # pruebas
```

La ejecución por defecto tarda unos 15 segundos; casi todo es la validación
cruzada, que reparte pliegues y combinaciones entre los núcleos (joblib). Con
`--sin-cv` tarda unos 10 segundos.

Para otro dataset, `--esquema` recibe un esquema JSON con el formato de la
aplicación. Los esquemas de marketing, heart y deserción que había en
`data/esquemas/` se retiraron en octubre de 2026 (siguen en el historial de
git): ahora cada esquema se define en el paso 2 de la aplicación y se guarda
con cada modelo en `app/almacen/modelos/<id>/esquema.json`.

Opciones principales: `--perfil {mejorado,articulo}` (ver Perfiles);
`--metodo-pesos`, `--expertos`, `--inferencia`, `--activacion`, `--excluir`,
`--equilibrar-niveles`, `--sin-sesgo`, `--mutables-dinamicos`, `--lambda`,
`--alpha-l2`, `--tolerancia` (FCM); `--sin-cv`, `--pliegues`,
`--rejilla-lambda`, `--rejilla-alpha` (validación cruzada); `--poblacion`,
`--generaciones`, `--torneo`, `--cruce {uniforme,un_punto}`, `--tasa-cruce`,
`--tasa-mutacion`, `--sigma-mutacion`, `--elitismo`, `--busqueda-ag` (AG);
`--beta`, `--delta-max`, `--permitir-reducciones`, `--tope-ausentismo`,
`--sin-tope-ausentismo`, `--aptitud` (prescripción); `--esquema`,
`--binarizar-objetivo`, `--smote`, `--semilla`, `--prueba`, `--division`
(datos). Las opciones que no se dan las pone el perfil. El resto de
parámetros está en `prvfcm/configuracion.py`.

## API de Python: `PredictorFCM` y `PrescriptorAG`

`prvfcm/api.py` expone el modelo entrenado sin ninguna interfaz: las clases no
imprimen ni conocen la aplicación web, reciben datos en unidades originales y
devuelven diccionarios listos para JSON. La aplicación las usa a través de
`prvfcm/servicio.py`; un backend como FastAPI o Flask puede llamarlas desde
sus rutas. El `modelo.json` lo guarda cada entrenamiento de la aplicación
(`app/almacen/modelos/<id>/modelo.json`) o `servicio entrenar`.

```python
from prvfcm.api import PredictorFCM, PrescriptorAG

predictor = PredictorFCM.desde_archivo("modelo.json")
prescriptor = PrescriptorAG(predictor.modelo)

perfil = {"gender": "M", "StageID": "MiddleSchool", ..., "raisedhands": 10, "VisITedResources": 8}

# Inferencia: nivel final y trayectoria t = 0..T con la cuenta de cada iteración
prediccion = predictor.predecir(perfil)
prediccion["nivel"], prediccion["activacion"]
prediccion["inferencia"]["series"][0]["valores"]   # activación del objetivo en cada iteración
prediccion["inferencia"]["pasos"][0]               # memoria, influencia (de ella, la de las acciones), sesgo, entrada y f(entrada)

# «Qué pasaría si»: el mismo perfil con otras acciones
predictor.simular(perfil, {"raisedhands": 80})     # {"acciones", "base", "simulado"}

# Prescripción con el AG; al_progresar recibe cada generación (para SSE o WebSocket)
resultado = prescriptor.prescribir(perfil, nivel_meta="H", beta=0.4, al_progresar=print)
resultado["acciones"]                              # actual, recomendada y cambio de cada acción
resultado["historial"]                             # mejor costo, costo medio, activación y acciones por generación
resultado["restriccion"]                           # None, o el tope por ausentismo que limitó las acciones

# Valores deseados del sistema v_s(0) (PRV-FCM, sección 4.2): el objetivo y los mutables
prescriptor.prescribir(perfil, deseados={"Class": "H", "StudentAbsenceDays": "Under-7"})
```

La entrada es un perfil (`dict` columna → valor; los conceptos dinámicos parten
de su media de entrenamiento) o un registro del dataset (`DataFrame` de una
fila; parten de su valor observado). Con un solo concepto dinámico y λ·k2 < 4,
como en xAPI, el estado final no depende de ese valor de partida. `al_progresar`
no consume números aleatorios: con la misma semilla, el resultado es idéntico
con aviso o sin él.

## Dataset expandido (retirado)

Hasta octubre de 2026 el dataset por defecto era `xAPI-Edu-Data-expanded-4800.csv`:
los 480 estudiantes originales más 4320 variantes sintéticas (cada clase ×10,
con el mismo perfil categórico y conteos de participación variados). Se retiró
porque esas variantes no son estudiantes nuevos. El dataset por defecto es ahora
el original (`data/xAPI-Edu-Data.csv`).

La división sigue agrupada por perfil inmutable: los 480 estudiantes tienen 277
combinaciones distintas de C1-C8, así que la agrupación todavía evita que un
mismo perfil quede en entrenamiento y en prueba.

Las cifras de Metodología (métodos de W, β, tope por ausentismo, sesgo), de la
decisión sobre C13-C15 y de Limitaciones se obtuvieron con el dataset expandido;
falta repetirlas con el original. Las de «Resultados de referencia» ya son del
original.

## Metodología

### 1. Preprocesamiento

* **División** agrupada por perfil inmutable, 70/30 y estratificada por Class
  (sección anterior). La validación cruzada de la etapa 2 usa la misma agrupación.
* **Codificación.** Binarias y ordinales con mapas explícitos (`gender` F=0/M=1,
  `StageID` lowerlevel < MiddleSchool < HighSchool, `GradeID` G-07 → 7,
  `Class` L=0/M=1/H=2, etc.). Las nominales sin orden (`NationalITy`,
  `SectionID`, `Topic`) se codifican con la media suavizada del rendimiento por
  categoría: `(n_c·media_c + 10·media_global) / (n_c + 10)`.
* **Min-Max a [0, 1]** para todas las variables (la "fuzzificación":
  `x' = (x − mín) / (máx − mín)`). En las columnas numéricas, una cola que pasa
  de 3 rangos intercuartílicos y reúne como mucho el 1 % de los registros se
  recorta a esa cerca (`limites_robustos`): en marketing, un ingreso de 666 666
  dejaba al 98 % de los clientes en el 13 % inferior de la escala, y en vino la
  densidad y el SO2 libre ocupaban el 22-26 %. xAPI no tiene atípicos y no cambia. Mínimos, máximos y medias por categoría se
  ajustan solo con el conjunto de entrenamiento; en prueba los valores se
  recortan a [0, 1].
* **Otros datasets** (aplicación web): CSV o Excel, y además de las
  codificaciones anteriores, **one-hot** para nominales de conceptos del
  sistema: un concepto 0/1 por categoría (`Topic=IT`, `Topic=Math`, ...). Las
  columnas True/False se leen como categorías. La sugerencia de esquema excluye
  las columnas que por sí solas aciertan el nivel del objetivo en el 99 % de
  los registros (por ejemplo, "desertó" definido como nota final < 10) y la
  validación lo advierte si se vuelven a incluir. Con menos de 40 perfiles
  inmutables distintos, la división agrupada no es posible y se divide al azar
  (estratificado), con un aviso.
* **Fechas** (codificación `fecha`, por ejemplo `Dt_Customer`): días desde la
  fecha mínima de entrenamiento; la sugerencia de esquema la propone para
  columnas con forma de fecha. Año primero si empieza por él (2012-09-04), si
  no, día primero (04-09-2012).
* **Vacíos.** Los de columnas numéricas y de fecha (por ejemplo, `Income`) se
  imputan con la mediana de entrenamiento; las filas con vacíos en columnas
  categóricas o en el objetivo se descartan.
* **Objetivo binario** (`--binarizar-objetivo`, opción `binarizar_objetivo`).
  Como en PRV-FCM (nota < 70 frente a ≥ 70), el objetivo pasa a dos niveles:
  desde el nivel dado es éxito (en xAPI, `M`: L frente a M+H, niveles «<M» y
  «≥M»); en un objetivo numérico, desde un umbral.
* **SMOTE** (`--smote`, en el perfil «articulo»): registros sintéticos de los
  niveles minoritarios hasta igualar al mayoritario, cada uno entre un registro
  y uno de sus 5 vecinos del mismo nivel (implementación propia con
  `NearestNeighbors`). Se aplica solo al entrenamiento (y al de cada pliegue):
  el artículo lo aplicó antes de dividir, así que su prueba tenía variantes
  sintéticas de registros de entrenamiento.
* **`PlaceofBirth` se excluye:** coincide con `NationalITy` en el 89 % de los
  registros.

| Conceptos | Columnas | Tipo | En la inferencia |
|---|---|---|---|
| C1-C8 | gender, NationalITy, StageID, GradeID, SectionID, Topic, Semester, Relation | Sistema inmutable | fijos |
| C9-C12 | raisedhands, VisITedResources, AnnouncementsView, Discussion | **Acción (prescriptivos)** | fijos en el valor del cromosoma |
| C13-C15 | ParentAnsweringSurvey, ParentschoolSatisfaction, StudentAbsenceDays | Sistema mutable | fijos en su valor observado |
| C16 | Class (rendimiento académico) | Sistema mutable, concepto de decisión | **se actualiza** |

### 2. Inferencia difusa (FCM)

Regla de Kosko modificada con memoria, sesgo y activación sigmoide:

```
A_i(t+1) = f( k2·A_i(t) + k1·(Σ_{j≠i} w_ji·A_j(t) + b_i) ),   f(x) = 1 / (1 + exp(-λ·x))
```

`k1 = k2 = 1`; λ y la regularización L2 se eligen por validación cruzada. Los
conceptos fijos conservan su valor. Los dinámicos se actualizan hasta que
`max|A(t+1) - A(t)| < 1e-5` (máximo 100 iteraciones). El sesgo `b_i` es la
entrada que recibe un concepto aunque los demás valgan 0; solo existe en los
conceptos que reciben aristas (aquí, C16) y equivale al peso de un concepto
constante igual a 1. `--sin-sesgo` usa la regla del artículo, con `b = 0`.

**Reglas de la Tabla 2 de PRV-FCM** (`--inferencia`, `--activacion`). Todas
tienen la forma `A_i(t+1) = f(m·u_i + k1·(Σ_j w_ji·u_j + b_i))`:

| Regla | m | u | Activación |
|---|---|---|---|
| `kosko` | 0 (sin memoria) | A | sigmoide `1/(1+e^(−λx))` o tanh |
| `kosko_modificada` (defecto) | k2 | A | ídem |
| `reescalada` | k2 | 2A − 1 | ídem |

Con tanh el estado vive en [−1, 1] (v = 2A − 1) y vuelve a [0, 1] para el
resto del pipeline: `A = (tanh(λx) + 1)/2`. Así, con tanh la entrada ya es
2A − 1 y la reescalada coincide con Kosko modificada; la grilla no evalúa ese
par. Es nuestra interpretación de la Tabla 2, que no dice cómo combinar tanh y
reescalada. El gradiente exacto (BPTT) y la inversión del punto fijo de Ridge y
Lasso valen en las seis combinaciones; las pruebas comparan el gradiente con
diferencias finitas en todas.

**Estructura.** Hay aristas desde todos los conceptos fijos hacia los dinámicos, y
entre dinámicos (sin autoconexión, porque la memoria ya está en la regla). C16
no tiene aristas salientes.

**Pesos.** Se aprenden de los datos de entrenamiento con pesos y sesgos en
[-1, 1]. Minimizan el error cuadrático de los conceptos dinámicos en el estado
final más una regularización L2 (que incluye el sesgo). El gradiente es exacto: se retropropaga a través de las
iteraciones de la regla (BPTT) y se optimiza con L-BFGS-B. Las pruebas comparan
el gradiente con diferencias finitas.

**Otros métodos de extracción de W** (`--metodo-pesos`, también en la aplicación):

* **Ridge y Lasso.** Regresión lineal regularizada, una por concepto dinámico
  i, sobre los datos normalizados. El valor observado `y` es un punto fijo de
  la regla si `Σ_j w_ji·x_j + b_i = (logit(y)/λ − k2·y)/k1`; ese es el
  objetivo de la regresión (con `y` recortado a [0.05, 0.95]). Ridge penaliza
  `α·n·‖w‖²` (la misma escala que la L2 de BPTT) y Lasso `α·‖w‖₁`. El sesgo es
  el intercepto, sin penalizar, recortado a [-1, 1]; luego los pesos se
  ajustan con ese sesgo fijo. En xAPI el intercepto es −2.3: con `tanh` del
  intercepto y sin reajustar, la exactitud cae a 52 %. Los coeficientes se
  truncan a (−1, 1) con la tangente hiperbólica. La regresión de `y` sin la
  transformación da 40-44 % de exactitud, por debajo de la clase mayoritaria.
* **Correlación parcial.** `w_ji` es la correlación de C_j y C_i descontando
  a los demás conceptos: `−P_ji/√(P_jj·P_ii)`, con P la inversa de la
  covarianza estimada con contracción de Ledoit-Wolf. Describe asociaciones
  directas, pero no calibra la inferencia. No tiene sesgo (`b = 0`).
* **PSO** (`pso`, ec. 4-5 de PRV-FCM). Cada partícula es una W candidata (y
  b, con sesgo) en [−1, 1], con la misma pérdida que BPTT, evaluada para todo
  el enjambre a la vez. `v ← ω·v + c1·r1·(mejor_i − W) + c2·r2·(mejor − W)`,
  `W ← W + v`, con |v| ≤ Vmax = 2 (el rango de los pesos, como en el PSO
  original de 1995). El perfil «articulo» usa la ec. 4 literal (ω = c1 = c2 = 1);
  el resto, Clerc (ω = 0.7298, c1 = c2 = 1.496). 30 partículas, hasta 200
  iteraciones; para tras 30 sin mejora. Semilla reproducible.
* **Expertos** (`expertos`, García et al., 2025). W es la media aritmética de
  las matrices de varios expertos (`--expertos m.json`: `[{"experto",
  "aristas": [{"origen", "destino", "peso"}]}]`); una arista que un experto no
  da cuenta 0 para él. Cada arista debe estar en la estructura (ninguna entra a
  un concepto fijo) y su peso en [−1, 1]. Sin sesgo.

| Semilla 42, CV completa | BPTT (defecto) | Ridge | Lasso | Correlación parcial |
|---|---|---|---|---|
| λ y α elegidos | 1 y 0.001 | 1 y 0.01 | 1 y 0.01 | 1 y 0.0001 |
| Exactitud del FCM | 78.9 % | 76.6 % | 76.2 % | 48.3 % |
| F1 macro | 79.4 % | 77.0 % | 76.6 % | 37.0 % |
| Tasa de éxito (FCM) | 7.2 % → 46.4 % | 5.3 % → 43.8 % | 5.2 % → 39.5 % | 36.8 % → 36.8 % |
| Clasificados H por el bosque | 8.1 % → 32.5 % | 8.1 % → 36.2 % | 8.1 % → 33.0 % | 8.1 % → 8.1 % |
| Más de 7 ausencias que llegan a H: FCM / bosque | 0.8 % / 1.1 % | 0.8 % / 1.1 % | 0.0 % / 1.1 % | 4.2 % / 1.1 % |

Sin sesgo y con la validación cruzada, la exactitud era 72.1 % (BPTT), 70.9 %
(Ridge), 71.0 % (Lasso) y 48.3 % (correlación parcial). Con sesgo, Ridge y
Lasso quedan a 2-3 puntos de BPTT, que sigue siendo el método por defecto. Con
la correlación parcial, el AG no encuentra cambios que compensen el esfuerzo
(β = 0.4). El tope por ausentismo iguala a los métodos en los estudiantes con
más de 7 ausencias.

**Niveles equilibrados** (`--equilibrar-niveles`, o la casilla del paso 3).
Con un objetivo desbalanceado, el error cuadrático empuja las activaciones
hacia el nivel frecuente y el corte entre niveles deja de separar. Con esta
opción cada registro pesa `n / (k · n_nivel)` al aprender W (BPTT, Ridge y
Lasso) y la validación cruzada elige λ y α por exactitud equilibrada (la media
del recall de cada nivel). En un dataset de deserción con 15 % de desertores
(649 estudiantes, BPTT), la exactitud equilibrada sube de 63 % a 78 % y el
recall de los desertores de 30 % a 67 %. La aplicación la activa por defecto
cuando un nivel es menos del 25 % de los registros. En xAPI, que no está
desbalanceado, no se usa.

**Máscara de dirección causal** (`--excluir ORIGEN DESTINO`, o la tabla del
paso 3 en la aplicación). Elimina aristas que la estructura permite pero se
consideran lógicamente imposibles; su peso queda en 0 y el resto se reajusta.
Sin sesgo, quitar inmutables baja la exactitud, porque sus pesos hacen de
sesgo. Con sesgo ya no la baja (semilla 42, sin validación cruzada): sin las
aristas Género → Class y Nacionalidad → Class, BPTT llega a 80.2 % y Ridge a
79.8 % (66.1 % sin sesgo); sin los ocho inmutables, BPTT queda en 78.8 %
(57.1 % sin sesgo).

**Selección de hiperparámetros.** Como en los artículos, con validación cruzada
sobre el entrenamiento: 5 pliegues agrupados por perfil y estratificados por
Class, con el preprocesador reajustado en cada pliegue. La rejilla combina
λ ∈ {0.5, 1, 2, 3, 5, 10} y α ∈ {0.0001, 0.001, 0.01}. Gana la mayor
exactitud L/M/H y, a igual exactitud, el menor MAE. En el perfil «articulo» la
rejilla incluye además la regla y la activación (Tabla 2): 5 combinaciones × 6
λ, con α = 0.001. Los ajustes (pliegue × combinación) corren en paralelo con
joblib; el resultado no depende del número de procesos.

| λ (α = 0.001) | 0.5 | **1** | 2 | 3 | 5 | 10 |
|---|---|---|---|---|---|---|
| Exactitud de validación | 65.6 % | **78.2 %** | 77.8 % | 76.5 % | 54.5 % | 29.2 % |

Resultado: λ = 1 y α = 0.001 (78.2 % ± 4.7). λ = 10 es el valor que el artículo
reporta para este dataset. Aquí, con los pesos iniciales en cero, la sigmoide
arranca saturada (f(10 · 0.5) ≈ 0.99), el gradiente casi se anula y el FCM
predice H para todos: 29.2 %, la proporción de H. El artículo aprende los pesos
con PSO y clasifica en dos clases. La figura `seleccion_hiperparametros.png`
muestra la rejilla completa.

### 3. Optimización prescriptiva (AG)

* **Cromosoma:** 4 genes reales en [0, 1], uno por acción (C9-C12). Por defecto
  cada gen está acotado a `[valor actual, 1]`: las acciones no bajan.
  `--delta-max` limita el aumento y `--permitir-reducciones` quita el límite inferior.
* **Costo** (a minimizar), con `A*` el estado de convergencia del FCM y `D` el
  estado deseado (`Class = 1`, nivel H):

  ```
  costo(a) = Σ_i p_i·|A*_i(a) - D_i| / Σ_i p_i  +  β · media_k |a_k - a_k,actual|
  ```

  El primer término es el error absoluto ponderado. El segundo penaliza el
  esfuerzo: con β = 0.4 (defecto) cada estudiante recibe un plan propio y el
  tasa de éxito casi no baja (ver Limitaciones); con `--beta 0` queda solo el error
  absoluto.
* **Tope por ausentismo.** Si el estudiante tiene más de 7 ausencias
  (StudentAbsenceDays = Above-7), cada acción sube como máximo 0.15 de su rango
  (`--tope-ausentismo`; `--sin-tope-ausentismo` lo quita). Sin tope, el FCM lleva
  a H a muchos más de esos estudiantes de los que confirma el bosque aleatorio:
  el aprendizaje querría un peso de ausentismo más negativo que la cota −1. El
  valor 0.15 es el que alinea las dos tasas (β = 0.4, 522 estudiantes con más
  de 7 ausencias):

  | Tope | Sin tope | 0.5 | 0.3 | 0.2 | **0.15** | 0.1 | 0 |
  |---|---|---|---|---|---|---|---|
  | Más de 7 ausencias que llegan a H: FCM | 15.3 % | 7.3 % | 3.1 % | 1.9 % | **0.8 %** | 0.0 % | 0.0 % |
  | Ídem según el bosque aleatorio | 6.1 % | 1.9 % | 1.3 % | 1.3 % | **1.1 %** | 1.1 % | 1.1 % |
  | Tasa de éxito (FCM), todos | 54.2 % | 49.9 % | 47.7 % | 47.0 % | **46.4 %** | 46.0 % | 46.0 % |

  El tope está en los límites de cada gen (`prescripcion.py`), no en el AG, que
  es genérico y no conoce conceptos. Si el esquema no tiene la columna
  StudentAbsenceDays (por ejemplo, un dataset de deserción), no se aplica.
* **Operadores:** selección por torneo (k = 3), cruce uniforme o de un punto
  (tasa 0.9), mutación gaussiana por gen (tasa 0.25, σ = 0.15 del rango) y
  elitismo (2 individuos). La población inicial incluye las acciones actuales,
  así que la prescripción nunca es peor que no actuar. El AG se detiene tras 25
  generaciones sin mejora. En 20 estudiantes, el AG obtuvo un costo igual o
  menor que una búsqueda exhaustiva en una rejilla de 21⁴ puntos. Con la
  configuración del artículo (población 200, 50 generaciones, cruce 0.2,
  mutación 0.3), 932 de las 982 prescripciones son iguales y el éxito de cada
  estudiante no cambia.
* **Meta y perfil de riesgo** (aplicación). La meta `D` puede ser cualquier
  nivel del objetivo (por ejemplo M en vez de H): el AG busca entonces el menor
  cambio que lleva al estudiante a ese nivel, sin pasarse. Un perfil de riesgo
  es un estudiante escrito a mano (o cargado y editado): el objetivo parte de su
  media de entrenamiento y el AG calcula el valor exacto de cada acción.
* **Valores deseados** (`deseados`, PRV-FCM sección 4.2: v_s(0)). El usuario da
  valores del objetivo y de los mutables del sistema en unidades originales.
  Cada uno se instancia en el estado inicial; los dinámicos además entran en el
  costo. Un mutable fijo solo plantea un escenario (por ejemplo, ausencias
  Under-7). Los inmutables y las acciones no admiten valor deseado.
* **Aptitud** (`--aptitud`). Por defecto, el error absoluto ponderado al estado
  deseado (arriba). `tabla4` (perfil «articulo») es la de PRV-FCM (Tabla 4, ec.
  12, Algoritmo 1 paso 11): aplica un paso de la regla al vector deseado v^s y
  al estado final v̂ y suma `|f(v_j + Σ_i W_ij v_i) − f(v̂_j + Σ_i W_ij v̂_i)|`
  sobre los conceptos del sistema; las sumas internas excluyen las acciones. En
  la reescalada usa 2v − 1 en los dos lados (la tabla omite el del lado de v̂,
  que tomamos por errata). `garcia2025` es la ec. 1 de García et al. (2025):
  `Σ_j |f(v̂_j + Σ_i W_ij v̂_i) − v_j|`. Cada una está en una función aislada
  (`prescripcion.aptitud_tabla4`, `aptitud_garcia2025`).
* **Siembra.** El perfil «mejorado» siembra las acciones actuales en la
  población inicial; PRV-FCM parte de acciones aleatorias (`sembrar = false`).
* **Búsqueda aleatoria del AG** (`--busqueda-ag`, perfil «articulo»). Como el
  artículo, prueba 8 combinaciones de población (50-200), generaciones
  (20-50), cruce (0.2-0.9) y mutación (0.2-0.5), sin parada temprana, y elige
  la de menor MAE de reconstrucción (abajo) en hasta 30 registros de
  entrenamiento en el mejor nivel.

### 4. Evaluación

Se evalúan los 982 estudiantes de prueba con `Class` L o M. Cada métrica compara
el estado de convergencia con el estado deseado:

* **MAE** = media de `|A*_Class - 1|`, **MSE** = media de `(A*_Class - 1)²`,
  **RMSE** = raíz del MSE.
* **Tasa de éxito prescriptivo** = % de estudiantes con
  `|A*_Class - 1| ≤ 0.25`, es decir, con rendimiento H según el FCM (la
  tolerancia es la mitad del salto desde el nivel anterior; 0.5 con dos
  niveles). En `metricas.json` son las claves `PSR` y `PSR_base`. No es la PSR
  del artículo (ec. 19, abajo).

Todas se reportan también con las acciones actuales (línea base). Hay tres
evaluaciones complementarias:

* **Calidad predictiva del FCM:** exactitud, precisión, recall, F1 y matriz de
  confusión del rendimiento discretizado en L/M/H, en el conjunto de prueba.
* **Validación externa:** un bosque aleatorio entrenado por separado, que no
  participa en la optimización, clasifica a los estudiantes con las acciones
  recomendadas. Evaluar una prescripción solo con el modelo que la generó es
  optimista.
* **Éxito por ausentismo:** las dos tasas anteriores, separadas entre
  estudiantes con más y con menos de 7 ausencias.
* **Reconstrucción** (protocolo de PRV-FCM, Tablas 11 y 12; clave
  `reconstruccion` de `metricas.json`). Para los registros de prueba que ya
  están en el mejor nivel, sus valores del sistema son el estado deseado y el
  AG busca las acciones sin sembrar las reales, con β = 0 y sin límites de
  cambio ni tope. Se comparan las acciones prescritas con las reales (escala
  [0, 1]): MAE, MSE y RMSE (ec. 16-18), R² (García et al., 2025; el global es el
  promedio por acción) y la PSR de la ec. 19, `Σ prescrito / Σ real`, literal
  (el artículo dice que debe ser menor que 1; si pasa de 1, `avisos` lo dice y
  no se recorta). Por acción, media ± DE y comparación de medias: Lilliefors
  (`scipy.stats.goodness_of_fit` con KS) y t de Student pareada si las dos son
  normales, si no, Wilcoxon (p = null con menos de 3 registros).

### 5. Reporte prescriptivo en lenguaje natural

`prvfcm/reporte.py` traduce los cambios (deltas) de las acciones en frases con
cifras del modelo, por ejemplo: «Para el estudiante 14 se recomienda aumentar
Manos levantadas de 5 a 100 (+95; 95 % de su rango) y aumentar Recursos
visitados de 3 a 99 (+96; 97 % de su rango) [...]. Con este plan, el FCM estima
que Rendimiento académico pasa de 0,31 (M) a 0,78 (H) y alcanza la meta (H).»
Si se aplicó el tope por ausentismo, el reporte lo dice: «Como «Ausentismo
(> 7 días)» está activo, cada acción puede subir como máximo un 15 % de su
rango [...]». También resume el conjunto de prueba por nivel. En la aplicación, qwen2.5 parte
de esas frases para redactar recomendaciones pedagógicas; no calcula cifras.

## Resultados de referencia (semilla 42, configuración por defecto)

**Predicción** (156 estudiantes de prueba; λ = 2 y α = 0.0001, exactitud de
validación 76.9 % ± 4.8). Exactitud del FCM: 72.4 % (F1 macro 72.9 %; clase
mayoritaria: 41.7 %; bosque aleatorio: 75.0 %). El FCM confunde L con H una
sola vez. El sesgo de C16 queda en −0.88.

| Nivel | Precisión | Recall | F1 |
|---|---|---|---|
| L | 71.9 % | 87.2 % | 78.8 % |
| M | 70.2 % | 61.5 % | 65.6 % |
| H | 76.2 % | 72.7 % | 74.4 % |

**Prescripción** (112 estudiantes con rendimiento L o M; β = 0.4, tope por
ausentismo de 0.15 y meta escalonada: los 47 en L apuntan a M y los 65 en M a H;
ver la sección siguiente):

| Métrica | Acciones actuales | PRV-FCM |
|---|---|---|
| MAE (respecto a la meta de cada uno) | 0.461 | 0.395 |
| MSE | 0.257 | 0.205 |
| RMSE | 0.506 | 0.453 |
| Tasa de éxito (FCM): llega a su meta | 14.3 % | 21.4 % |
| En su meta según el bosque aleatorio | 11.6 % | 19.6 % |

| Estudiantes que llegan a su meta | n | FCM | Bosque aleatorio |
|---|---|---|---|
| Más de 7 ausencias | 70 | 0.0 % → 0.0 % | 5.7 % → 5.7 % |
| 7 ausencias o menos | 42 | 38.1 % → 57.1 % | 21.4 % → 42.9 % |

Por nivel: de L a M llega el 17.0 % y de M a H el 24.6 %. Con todos apuntando a
H (`--sin-meta-escalonada`, como antes) la tasa de éxito era 8.9 % → 15.2 % y el
bosque 1.8 % → 8.9 %.

**Comparación con el dataset expandido (retirado):**

| | Original (480, defecto) | Expandido (4800, retirado) |
|---|---|---|
| Estudiantes de prueba / con prescripción | 156 / 112 | 1411 / 982 |
| λ y α elegidos | 2 y 0.0001 | 1 y 0.001 |
| Exactitud del FCM | 72.4 % | 78.9 % |
| Exactitud del bosque aleatorio | 75.0 % | 82.9 % |
| Tasa de éxito del FCM (todos a H) | 8.9 % → 15.2 % | 7.2 % → 46.4 % |
| Clasificados H por el bosque aleatorio (todos a H) | 1.8 % → 8.9 % | 8.1 % → 32.5 % |

Con el original, el FCM promete H a 6.3 puntos más de estudiantes de los que
confirma el bosque (14 con el expandido). Ninguno de los 70 estudiantes con más
de 7 ausencias llega a H, ni con el FCM ni con el bosque: en el dataset solo 4
de los 191 con más de 7 ausencias tienen H, y el tope por ausentismo (calibrado
con el expandido) limita cada acción a +0.15. La mejora está en los 42 con 7
ausencias o menos.

## Meta escalonada (perfil «mejorado»)

Pedido del profesor: un estudiante en L primero debe pasar a M, no saltar a H, y
uno en M busca H. Con `meta_escalonada` (por defecto en «mejorado»; «articulo»
la desactiva, y `main.py --sin-meta-escalonada` también) cada registro apunta al
nivel siguiente al observado: el valor deseado del objetivo en el costo del AG
es el de ese nivel, así que pasarse a H no reduce el error de un L. El éxito es
llegar a la meta propia o a un nivel mejor, para el FCM y para el bosque
aleatorio. En una prescripción individual sin meta elegida, la meta es el nivel
siguiente al observado (un perfil hipotético usa el nivel que infiere el FCM).
Con un objetivo de dos niveles no cambia nada. `recomendaciones.csv` lleva la
columna `nivel_meta` y `metricas.json` el conteo `prescripcion.metas`.

En el objetivo, el costo solo cuenta lo que falta para la meta, max(D − A, 0):
pasarse no es un error. Con |A − D|, si el FCM ya ubicaba al registro por encima
de su meta, el AG lo empujaba hacia abajo (en vino, los 6 de calidad 3 recibían
menos alcohol y 94 de 1470 bajaban). Si el FCM ya lo ubica en su meta o más
arriba, el plan no cambia nada y el reporte lo explica: en vino, el FCM ve a los
de calidad 3 en 4-6 (su activación media, 0.41, es la misma que la de los de
calidad 5), así que no puede prescribir «de 3 a 4». Equilibrar niveles no lo
corrige (exactitud 40.7 %).

## Decisión de modelado: C13-C15 observados

Con la regla de Kosko modificada, λ = 1 y pesos en [-1, 1], la inferencia converge
a un **punto fijo que no depende del valor inicial** de los conceptos que se
actualizan. Con un solo concepto dinámico la regla es una contracción, así que
esto está garantizado, con o sin sesgo. Con C13-C16 dinámicos se verificó
empíricamente sin sesgo, con λ = 1 y con λ = 2. Por eso,
el valor observado de un concepto que se actualiza se pierde. Si C13-C15
evolucionan (`--mutables-dinamicos`), el FCM reemplaza el ausentismo real del
estudiante por el que infiere de su participación.

| Variante (semilla 42) | Exactitud FCM | Tasa de éxito (FCM) | Estudiantes con >7 ausencias que llegan a H: FCM / bosque aleatorio |
|---|---|---|---|
| C13-C15 observados (defecto) | 78.9 % | 46.4 % | 0.8 % / 1.1 % |
| C13-C15 dinámicos (λ = 1) | 69.0 % | 54.7 % | 14.8 % / 1.1 % |

En el dataset, solo 35 de los 1882 registros con más de 7 ausencias tienen
rendimiento H (1.9 %). Sin sesgo y sin tope, la variante dinámica prometía H a
todos ellos. Con sesgo y tope, aún los lleva a H en el 14.8 %, y el bosque
aleatorio solo en el 1.1 %. Por eso la opción por defecto conserva
C13-C15 en su valor observado. Siguen siendo conceptos de
sistema mutables (pueden cambiar en la realidad), pero el AG no los controla y
el FCM no los sobrescribe.

## Perfiles «mejorado» y «articulo»

`--perfil` (y la opción `perfil` de la aplicación) elige un conjunto de valores
por defecto; las opciones explícitas mandan sobre el perfil. El worker los
devuelve resueltos con el método `perfiles`.

| Opción | «mejorado» (defecto) | «articulo» (PRV-FCM, 2023) |
|---|---|---|
| Pesos W | BPTT (gradiente exacto) | PSO, ec. 4 literal (ω = c1 = c2 = 1, Vmax = 2) |
| Sesgo b_i | sí | no |
| Regla y activación | Kosko modificada, sigmoide | elegidas por validación cruzada entre las de la Tabla 2 |
| Mutables (C13-C15) | fijos en su valor observado | dinámicos |
| Validación cruzada | 5 pliegues, λ × α | 10 pliegues, regla × activación × λ (α = 0.001) |
| Tolerancia de convergencia | 1e-5 | 1e-4 (la del artículo) |
| SMOTE | no | sí, solo en el entrenamiento |
| Aptitud del AG | error absoluto al estado deseado | Tabla 4 |
| AG | 50 × hasta 100 generaciones, siembra las acciones actuales | 200 × 50 (los valores del artículo para xAPI), sin siembra, búsqueda aleatoria de hiperparámetros |
| Esfuerzo β, solo incrementos, tope por ausentismo | 0.4, sí, 0.15 | 0, no, no |

`main.py` con el perfil «mejorado» da exactamente los resultados anteriores
a los perfiles (`resultados/`). El objetivo binario (`binarizar_objetivo`) no
depende del perfil: el artículo binarizó xAPI en nota < 70 frente a ≥ 70 (L
frente a M+H) y se pide con `--binarizar-objetivo M`.

**Desviaciones respecto al artículo que quedan en el perfil «articulo»:**

* SMOTE solo en el entrenamiento de cada pliegue, no antes de dividir (ver
  Preprocesamiento).
* División agrupada por perfil inmutable (en xAPI, 277 perfiles para 480
  estudiantes); con perfiles únicos (heart, marketing) equivale a una aleatoria.
* Un solo α (0.001) en la rejilla, por tiempo, y λ en {0.5, 1, 2, 3, 5, 10} en
  lugar de valores aleatorios.
* La validación cruzada elige los hiperparámetros con 40 iteraciones de PSO
  (`pso_iteraciones_cv`); el modelo final usa el PSO completo (hasta 200
  iteraciones, para tras 30 sin mejora). Con 10 pliegues × 30 combinaciones,
  el PSO completo tardaba más de 15 minutos en marketing.
* Con tanh, la reescalada coincide con Kosko modificada (interpretación nuestra
  de la Tabla 2) y no se evalúa aparte.
* En la Tabla 4 reescalada, 2v̂ − 1 también en el término W del lado de v̂ (la
  tabla lo omite; parece errata).
* Vmax = 2 en el PSO: el artículo no lo menciona, pero es parte del PSO original
  y evita que las partículas salgan del rango.
* La búsqueda aleatoria del AG se evalúa en registros de entrenamiento (el
  artículo no dice en cuáles) y prueba 8 combinaciones.

## Ablación: «articulo» frente a «mejorado» (`experimentos.py`)

Cinco datasets con objetivos de dos niveles, para que los dos perfiles
resuelvan la misma tarea:

* xAPI binarizado en M (L frente a M+H, como el artículo), con 480 registros
  (las filas xapi4800 son del dataset expandido, ya retirado).
* marketing (`Response`). Estas filas usan el esquema anterior, con los
  contadores de compras como acciones; el actual usa las campañas (ver la
  sección siguiente).
* heart (`target`, con el supuesto 1 = sin enfermedad: ese grupo tiene mayor
  frecuencia cardiaca máxima y menos depresión del ST, angina y vasos
  afectados). Sus acciones (presión y colesterol) pueden bajar.
* deserción (`Final_Grade` ≥ 10, que es exactamente «no desertó»; la columna
  `Dropped_Out` se excluye porque es la definición del objetivo).

Cada perfil se corre con PSO, BPTT y Ridge; en xAPI 4800 (retirado), solo el
perfil «mejorado». Semilla 42; los CSV completos y las Tablas 11 y 12 por acción
están en `resultados_experimentos/`.

| Dataset | Perfil, método | Exactitud (mayoritaria) | Tasa de éxito | Bosque: mejor nivel | Rec. MAE | R² | PSR ec. 19 | Acciones con p > 0,05 |
|---|---|---|---|---|---|---|---|---|
| xapi480 | articulo, pso | 76.0 % (71.9 %) | 14.6 → 9.8 % | 17.1 → 9.8 % | 0.42 | -2.5 | 1.22 | 2 de 4 |
| xapi480 | articulo, bptt | 83.6 % (71.9 %) | 19.5 → 12.2 % | 17.1 → 7.3 % | 0.39 | -2.1 | 1.14 | 2 de 4 |
| xapi480 | articulo, ridge | 81.5 % (71.9 %) | 12.2 → 95.1 % | 17.1 → 65.9 % | 0.38 | -2.0 | 1.22 | 0 de 4 |
| xapi480 | mejorado, pso | 87.7 % (71.9 %) | 14.6 → 29.3 % | 17.1 → 39.0 % | 0.45 | -2.9 | 1.83 | 0 de 4 |
| xapi480 | mejorado, bptt | 87.7 % (71.9 %) | 12.2 → 34.1 % | 17.1 → 48.8 % | 0.45 | -2.9 | 1.83 | 0 de 4 |
| xapi480 | mejorado, ridge | 88.4 % (71.9 %) | 9.8 → 17.1 % | 17.1 → 36.6 % | 0.45 | -2.9 | 1.83 | 0 de 4 |
| xapi4800 | mejorado, pso | 89.7 % (76.0 %) | 22.7 → 39.7 % | 2.1 → 21.2 % | 0.44 | -4.3 | 1.38 | 0 de 4 |
| xapi4800 | mejorado, bptt | 94.2 % (76.0 %) | 3.6 → 6.7 % | 2.1 → 8.5 % | 0.45 | -4.6 | 1.83 | 0 de 4 |
| xapi4800 | mejorado, ridge | 94.5 % (76.0 %) | 1.2 → 8.5 % | 2.1 → 7.6 % | 0.45 | -4.6 | 1.83 | 0 de 4 |
| marketing | articulo, pso | 76.1 % (85.0 %) | 22.2 → 70.0 % | 1.4 → 2.1 % | 0.38 | -16.6 | 2.46 | 1 de 4 |
| marketing | articulo, bptt | 85.0 % (85.0 %) | 0.0 → 0.0 % | 1.4 → 3.3 % | 0.37 | -14.5 | 2.65 | 0 de 4 |
| marketing | articulo, ridge | 88.7 % (85.0 %) | 2.1 → 24.4 % | 1.4 → 2.4 % | 0.38 | -12.8 | 2.59 | 1 de 4 |
| marketing | mejorado, pso | 88.4 % (85.0 %) | 3.7 → 5.6 % | 1.4 → 1.4 % | 0.35 | -18.6 | 1.30 | 0 de 4 |
| marketing | mejorado, bptt | 88.9 % (85.0 %) | 3.5 → 42.9 % | 1.4 → 1.7 % | 0.81 | -49.0 | 5.20 | 0 de 4 |
| marketing | mejorado, ridge | 88.4 % (85.0 %) | 1.9 → 49.6 % | 1.4 → 1.7 % | 0.81 | -49.0 | 5.20 | 0 de 4 |
| heart | articulo, pso | 81.1 % (53.3 %) | 11.9 → 16.7 % | 11.9 → 11.9 % | 0.39 | -13.2 | 1.27 | 1 de 2 |
| heart | articulo, bptt | 86.7 % (53.3 %) | 9.5 → 11.9 % | 11.9 → 9.5 % | 0.38 | -11.7 | 0.85 | 1 de 2 |
| heart | articulo, ridge | 84.4 % (53.3 %) | 16.7 → 33.3 % | 11.9 → 14.3 % | 0.40 | -14.5 | 1.59 | 1 de 2 |
| heart | mejorado, pso | 87.8 % (53.3 %) | 11.9 → 11.9 % | 11.9 → 11.9 % | 0.53 | -24.2 | 1.82 | 0 de 2 |
| heart | mejorado, bptt | 86.7 % (53.3 %) | 14.3 → 14.3 % | 11.9 → 11.9 % | 0.28 | -4.8 | 0.00 | 0 de 2 |
| heart | mejorado, ridge | 85.6 % (53.3 %) | 11.9 → 14.3 % | 11.9 → 11.9 % | 0.28 | -4.8 | 0.00 | 0 de 2 |
| desercion | articulo, pso | 84.7 % (84.7 %) | 100.0 → 100.0 % | 43.3 → 46.7 % | 0.38 | -1.5 | 1.13 | 1 de 1 |
| desercion | articulo, bptt | 89.8 % (84.7 %) | 13.3 → 13.3 % | 43.3 → 46.7 % | 0.43 | -2.3 | 1.47 | 0 de 1 |
| desercion | articulo, ridge | 89.8 % (84.7 %) | 13.3 → 10.0 % | 43.3 → 46.7 % | 0.38 | -1.7 | 1.19 | 1 de 1 |
| desercion | mejorado, pso | 85.2 % (84.7 %) | 73.3 → 73.3 % | 43.3 → 43.3 % | 0.64 | -4.8 | 2.75 | 0 de 1 |
| desercion | mejorado, bptt | 90.3 % (84.7 %) | 13.3 → 13.3 % | 43.3 → 43.3 % | 0.36 | -1.6 | 0.00 | 0 de 1 |
| desercion | mejorado, ridge | 88.3 % (84.7 %) | 66.7 → 66.7 % | 43.3 → 43.3 % | 0.36 | -1.6 | 0.00 | 0 de 1 |

* **Predicción.** El perfil «mejorado» es tan exacto o más en todos los
  datasets. Con el PSO de la ec. 4 literal (ω = c1 = c2 = 1), el enjambre se
  estanca: para tras 42-65 iteraciones sin mejora (163 en heart), mientras que
  Clerc sigue mejorando hasta las 200. En xAPI 4800 (sin sesgo, solo C16
  dinámico), el literal queda en pérdida 0.069 y 66.8 % de exactitud; Clerc,
  en 0.051 y 72.6 %, igual que BPTT (0.051 y 72.1 %). Algunas corridas del
  perfil «articulo» predicen solo la clase mayoritaria (marketing con BPTT,
  deserción con PSO: F1 0.46).
* **Prescripción.** La aptitud de la Tabla 4 pide que el estado final del
  sistema se parezca al deseado (incluidos los mutables dinámicos en su valor
  actual), no que el objetivo suba. Sin la siembra de las acciones actuales,
  la prescripción puede empeorar. En xAPI 480 la tasa de éxito baja de 14.6 %
  a 9.8 % con PSO y de 19.5 % a 12.2 % con BPTT, y el bosque confirma la
  caída (17.1 % → 9.8 % y 7.3 %).
* **Reconstrucción.** El protocolo del artículo no reproduce sus errores:
  * MAE de 0.28 a 0.81 (artículo: 0.007 a 0.036) y R² negativo en las 27
    corridas.
  * PSR de la ec. 19 de 0 a 5.2, mayor que 1 en 22 de 27.
  * Medias sin diferencia (p > 0.05) en 11 de 78 acciones, todas del perfil
    «articulo».

  El problema está subdeterminado: muchas combinaciones de acciones llevan al
  mismo estado, así que la prescripción no tiene por qué parecerse a las
  acciones observadas. Con la aptitud por defecto y β = 0, el AG lleva cada
  acción al extremo que más acerca el objetivo:
  * Todas al máximo en xAPI: PSR = 1 / media real = 1.83.
  * Todas al mínimo en heart y deserción con BPTT y Ridge: PSR = 0. Con PSO
    van al máximo (PSR 1.8 y 2.8), porque sus pesos tienen el signo contrario.

  Las PSR mayores que 1 de marketing (2.5 a 5.2) y heart (1.3 a 1.6) vienen de
  acciones observadas bajas que la prescripción sube. El texto del artículo no
  explica cómo obtuvo errores tan pequeños.

## Marketing: las campañas como acciones

En el esquema de marketing, las acciones eran los contadores de compras
(`NumDealsPurchases`, `NumCatalogPurchases`, `NumWebPurchases`,
`NumWebVisitsMonth`): el AG le pedía al cliente comprar más por catálogo para
que respondiera, algo que la empresa no controla. Ahora:

* **Acciones:** `AcceptedCmp1`-`AcceptedCmp5` («Campaña 1» a «Campaña 5»),
  ordinales 0/1.
* **Mutables dinámicos:** los cuatro contadores. Los gastos (`Mnt*`),
  `Recency` y `NumStorePurchases` siguen como mutables fijos.

**Acciones discretas.** Una acción ordinal solo admite los valores de sus
categorías (`Preprocesador.rejillas_accion`). El AG sigue con genes reales, pero
cada gen se lleva al valor admitido más cercano dentro de sus límites antes de
evaluarlo, así que una campaña se activa o no (nunca 0,37). El reporte lo dice
así: «Para este cliente se recomienda activar Campaña 1 y Campaña 3».

**Qué miden estas acciones.** `AcceptedCmpN` vale 1 si el cliente aceptó la
oferta de la campaña N, no si la empresa se la envió. Usarla como palanca
supone que la empresa decide a quién dirige cada campaña y que dirigirla
equivale a que el cliente la acepte. El peso de una campaña sobre `Response`
mide propensión (quien aceptó antes responde más), no el efecto de enviarla.
Los pesos de las campañas sobre los contadores quedan cerca de 0 (|w| ≤ 0.14):
el efecto va directo a `Response`.

**Penalización del esfuerzo.** Activar una de las 5 campañas cuesta β/5. Con
β = 0.4 (el valor general), el AG activaba 4 o 5 campañas a 221 de 573 clientes.
BPTT, semilla 42, λ = 2 sin validación cruzada, 573 clientes de prueba con
`Response` = 0:

| β | Campañas por cliente | Clientes con 4 o 5 | Tasa de éxito (FCM) | Bosque: `Response` = 1 |
|---|---|---|---|---|
| 0.4 | 3.28 | 221 | 99.8 % | 28.8 % |
| 0.6 | 2.91 | 104 | 99.1 % | 25.0 % |
| 0.8 | 2.45 | 23 | 94.1 % | 19.0 % |
| 1.0 | 1.86 | 0 | 81.8 % | 15.0 % |
| 1.5 | 0.18 | 0 | 17.8 % | 4.9 % |
| 2.0 | 0 | 0 | 1.9 % | 1.4 % |

Para marketing se usa β = 1. El valor depende del método y de λ: con Ridge
(λ = 0.5), β = 1 no activa ninguna campaña y β = 0.6 activa 2.43 por cliente
(éxito 92 %, bosque 22.7 %).

Con β = 1, los clientes que ya están cerca de la meta (`Response` de partida
≥ 0.35, 10 de 573) no reciben ninguna campaña. Se probó medir el error solo
hasta el umbral de éxito (una bisagra: más allá de 0.5 activar campañas no
rinde nada). Así se activan menos campañas (0.89 por cliente con margen 0.5,
1.92 con 0.3), pero el bosque confirma menos respuestas (10.1 % frente a
4.5-6.8 %): no se adoptó. BPTT, λ = 5 sin validación cruzada, semilla 42.

**Regla de inferencia.** Con Kosko modificada y λ = 5, el objetivo es
biestable: su propia activación entra en la sigmoide con pendiente λ/4 > 1.
Las campañas pesan solo 0.06-0.09 sobre `Response`, pero bastan para cruzar
el umbral, y `Response` salta de 0.06 a 0.7 o más en 571 de 573 clientes
(ninguno queda entre 0.3 y 0.7). Con `inferencia: kosko` (sin memoria; la
validación cruzada vuelve a elegir λ = 5, β = 1):

| Regla | Pesos de las campañas | Campañas por cliente (máx.) | Éxito FCM | Bosque |
|---|---|---|---|---|
| Kosko modificada | 0.06-0.09 | 2.33 (4) | 99.7 % | 14.1 % |
| Kosko | 0.08-0.33 | 2.15 (3) | 88.1 % | 21.8 % |

La exactitud no cambia (89.0 % frente a 88.7 %). Para marketing se usa Kosko.

**Referencia** (`python main.py --esquema <esquema de marketing> --datos
data/marketing_campaign.csv --beta 1`; BPTT, la validación cruzada elige
λ = 5). Exactitud del FCM: 89.5 % (clase mayoritaria: 85.0 %; F1 macro 74.1 %).
Tasa de éxito: 1.7 % → 98.6 %; el bosque aleatorio la confirma en 1.4 % → 10.1 %.
2.3 campañas por cliente en promedio (ninguno recibe las 5); las combinaciones
más frecuentes son Campañas 1 y 3 (168 clientes), 1, 3 y 5 (158) y la 1 sola
(69). La Campaña 4 no se prescribe. La distancia entre el FCM y el bosque es
grande: el FCM promete la respuesta a casi todos, el bosque a uno de cada diez.

## Modelos de la aplicación (octubre de 2026)

Un modelo por dataset, entrenado en la aplicación con validación cruzada y meta
escalonada. Los esquemas viven en la app (`app/almacen/modelos/<id>/esquema.json`).
«Trazo» es la correlación de Spearman entre la activación del objetivo antes y
después de prescribir: cerca de 1, la curva prescrita sigue a la actual por
encima, sin saltos de todo o nada.

| Dataset | Esquema y opciones | Exactitud FCM (mayoritaria) | Éxito FCM | Bosque | Trazo |
|---|---|---|---|---|---|
| xAPI (L/M/H) | el de la app, mutables fijos; β = 0.4; tope 0.3 | 73.5 % (40.6 %) | 15.3 → 29.7 % | 10.8 → 27.0 % | 1.00 |
| heart | acciones `trestbps`, `chol` y `thalach` (pueden bajar); mutables dinámicos; Kosko; β = 0.1; tope 0.3 | 88.9 % (53.3 %) | 16.7 → 35.7 % | 11.9 → 16.7 % | 1.00 |
| marketing | campañas; contadores dinámicos; Kosko; β = 1.25; λ ≤ 1.5 | 88.9 % (85.0 %) | 1.9 → 57.6 % | 1.2 → 10.5 % | 0.90 |
| obesidad | hábitos como acciones (orden: subir = hábito sano), `Weight` dinámico, éxito = peso normal o menos; β = 1; λ ≤ 1.5; tope 0.3 | 86.9 % (73.5 %) | 4.5 → 25.7 % | 0.6 → 0.9 % | 0.88 |
| vino blanco | alcohol, azúcar, sulfatos, cítrico y SO2 libre como acciones; densidad, pH y SO2 total dinámicos; calidad 3-9; β = 1; λ ≤ 1.5; tope 0.3 | 52.4 % (44.9 %) | 23.9 → 57.8 % | 18.0 → 38.9 % | 0.87 |

«λ ≤ 1.5» es la rejilla `rejilla_lambda: [0.5, 1, 1.5]` de la validación cruzada
(opción de la API de entrenamiento; la interfaz no la muestra). «Tope 0.3» es el
cambio máximo por acción (`delta_max`, 30 % del rango).

* **Acciones disparadas.** Sin tope, a quien está lejos de su meta el AG le pedía
  casi todo el rango (en xAPI, el estudiante 98, de M a H: raisedhands 10 → 100
  y VisITedResources 3 → 99). Con el tope de 0.3 ninguna acción continua cambia
  más del 30 % de su rango y el trazo sube (xAPI 0.97 → 1.00, vino 0.49 → 0.87),
  a cambio de una tasa de éxito menor (xAPI 40.5 → 29.7 %, bosque 36.9 → 27.0 %):
  quien no llega en un paso queda en camino, como pide la meta escalonada. Una
  acción discreta siempre puede moverse una categoría aunque el tope sea menor
  que su paso (activar una campaña o un hábito es pasar de 0 a 1), así que en
  marketing el tope no cambia nada.

* **80 % de exactitud.** xAPI con tres niveles no llega: el bosque aleatorio
  tampoco (75.5 %). Binarizado (L frente a M o H) pasa del 87 %, pero entonces
  no hay meta escalonada. En vino, con siete niveles, el bosque llega a 57 %;
  binarizado en 7 el FCM da 79.7-80.0 %, apenas sobre la clase mayoritaria
  (78.4 %), y la subida es un salto (trazo 0.2-0.5): se dejó la calidad 3-9.
* **Efecto dominó.** Con mutables dinámicos las acciones influyen sobre ellos y
  ellos sobre el objetivo (en heart, `trestbps` aporta −0.11 por esa vía). En
  xAPI, hacer dinámicos C13-C15 baja la exactitud a 61-67 %, así que siguen fijos.
* **Trazo en marketing.** Con β = 1 la tasa de éxito era 88.1 % y el bosque
  21.8 %, pero el trazo bajaba a 0.58 (saltos de 0.1 a 0.9); con β = 1.5 el
  trazo es 0.95 y el éxito 33.9 %. β = 1.25 queda entre los dos.
* **Heart.** Con solo `trestbps` y `chol` como acciones, el 79 % de los
  pacientes quedaba igual aun con β = 0.1: sus pesos hacia `target` son
  pequeños (−0.22 y −0.08), así que β no era el problema. Con `thalach`
  (frecuencia cardiaca máxima, que sube con el entrenamiento aeróbico) como
  acción, todos reciben un cambio pequeño y el bosque confirma 11.9 → 19.0 %.
* **λ ≤ 1.5.** En marketing sube el trazo (0.84 → 0.91) con el mismo bosque; en
  vino el bosque pasa de 35.1 % a 45.0 %; en obesidad los que no cambian bajan
  del 62 % al 22 % (exactitud 90.4 → 86.9 %, trazo 0.93 → 0.77). En xAPI y
  heart la validación cruzada ya elegía λ ≤ 1.5 o el resultado no cambia.
* **SMOTE no ayuda.** Exactitud: heart 87.8 → 85.6 %, xAPI 73.5 → 71.6 %, vino
  53.2 → 49.8 %. En marketing elige λ = 0.5 y no prescribe nada; en obesidad sube
  la tasa de éxito (84 %) a costa de saltos de 0.62. Sirve para objetivos
  desbalanceados cuando el FCM no detecta la clase minoritaria, no como paso
  obligatorio.
* **Bandas del vino.** Con la meta escalonada, cada vino se detiene en el valor
  de su nivel meta (6 → 0.50, 7 → 0.67, 8 → 0.77): las bandas son las metas, no
  un error.
* **Obesidad.** La clase sale de `Weight` y `Height` (IMC), y el FCM lineal no
  la reproduce con siete niveles (23.5 %); por eso se binarizó. El bosque no
  confirma la mejora porque solo cambia las acciones y no el peso, que es el
  mediador. El 77 % de los registros es sintético (SMOTE, según UCI).

## Comparación con los artículos

| Aspecto | PRV-FCM (Hoyos et al., 2023) | García et al. (2025) | Este proyecto |
|---|---|---|---|
| Construcción del FCM | PSO sobre datos | Expertos | Datos: BPTT (defecto), Ridge, Lasso, correlación parcial o PSO; o matrices de expertos |
| Inferencia | Kosko modificada, sigmoide (λ = 10 en este dataset) | Kosko modificada, sigmoide | Kosko modificada con sesgo, sigmoide; λ = 1 por validación cruzada (o las reglas de la Tabla 2) |
| Datos y división | 70/30; validación cruzada de 10 pliegues | 70/30; validación cruzada de 5 pliegues | 70/30 agrupada; validación cruzada agrupada de 5 pliegues (10 en el perfil «articulo») |
| Rendimiento | 2 clases (nota < 70 o ≥ 70), balanceadas con SMOTE | Diagnóstico binario | 3 niveles (L/M/H), o 2 con `--binarizar-objetivo`; SMOTE opcional, solo en el entrenamiento |
| AG | Población 200, 50 generaciones, cruce 0.2, mutación 0.3 | Población 80-120, cruce 0.3-0.5, mutación 0.2-0.3; para si F mejora ≤ 0.001 | Población 50, hasta 100 generaciones, cruce 0.9, mutación 0.25; para tras 25 generaciones sin mejora |
| Aptitud | Diferencia entre el estado deseado y el inferido | Σ_j \|f(v̂_j + Σ_i W_ij·v̂_i) − v_j\| | Error absoluto ponderado respecto al estado deseado + β·esfuerzo; tope por ausentismo |
| Métricas | Exactitud; MAE, MSE, RMSE y PSR entre acciones reales y prescritas | Exactitud, precisión, recall, F1; R², MSE, RMSE | Exactitud, precisión, recall, F1; MAE, MSE, RMSE y tasa de éxito respecto al estado deseado; validación externa; reconstrucción como el artículo (MAE, MSE, RMSE, R², PSR ec. 19, t o Wilcoxon) |

Los artículos validan comparando las acciones prescritas con las observadas
del mismo registro (Tablas 11 y 12 de PRV-FCM). Aquí el objetivo es cambiar las
acciones de los estudiantes L y M, así que la prescripción se compara con el
estado deseado y se contrasta con un modelo independiente.

## Salidas (`resultados/`)

* `recomendaciones.csv`: por estudiante (`id_estudiante` = fila del CSV, 0 = primera
  fila de datos), acciones actuales, recomendadas y cambio en unidades originales,
  activación de C16 antes y después, nivel L/M/H y éxito.
* `metricas.json`: configuración (perfil, método de pesos, regla, sesgo,
  equilibrio de niveles, aristas excluidas, tope por ausentismo, SMOTE,
  binarización), tabla de validación cruzada, búsqueda del AG, métricas de
  predicción (por nivel y matriz de confusión), de prescripción, por
  ausentismo, de la validación externa y de la reconstrucción.
* `seleccion_hiperparametros.csv` / `seleccion_hiperparametros.png`: exactitud de
  validación de cada combinación de λ y α.
* `pesos_fcm.csv` / `pesos_fcm.png`: matriz de pesos aprendida; en el CSV, la
  última fila es el sesgo.
* `red_fcm.png`: el mapa como grafo dirigido (NetworkX y matplotlib), con el
  grosor de cada arista proporcional a |w|.
* `convergencia_ag.png`, `rendimiento_antes_despues.png`, `acciones_recomendadas.png`.

## Limitaciones

* **Muestra pequeña.** 480 estudiantes y 156 de prueba: la exactitud varía
  ± 4.8 puntos entre pliegues. Las cifras de esta sección son del dataset
  expandido (retirado) y falta repetirlas con el original.
* **Esfuerzo y personalización.** El FCM es monótono en las cuatro acciones y
  `Class = 1` es inalcanzable (la activación prescrita máxima es 0.89). Con un
  β pequeño, el AG sube las acciones casi al máximo y la prescripción se parece
  para todos; por eso el valor por defecto es β = 0.4 (con tope por ausentismo):

  | β | Tasa de éxito (FCM) | Clasificados H por el bosque | Cambio medio por acción | Combinaciones de acciones distintas |
  |---|---|---|---|---|
  | 0.05 | 47.4 % | 39.4 % | 0.35 | 534 |
  | 0.4 (defecto) | 46.4 % | 32.5 % | 0.17 | 959 |
  | 0.6 | 41.5 % | 29.4 % | 0.12 | 980 |
  | 1.0 | 7.2 % | 11.9 % | 0.04 | 982 |

  Con β = 0.4, el AG sube Manos levantadas al 91 % de los estudiantes, Recursos
  visitados al 94 % y Anuncios al 35 %, y no cambia Discusión: su peso (+0.15)
  no compensa el esfuerzo. Sin sesgo ni tope, con β = 0.05, el AG llevaba C9-C11
  al máximo en los 982 estudiantes (95 combinaciones distintas).
* **Ausentismo y sesgo en la cota.** El peso de C15 (ausentismo) y el sesgo de
  C16 quedan en la cota −1. Con el sesgo libre, el aprendizaje lo lleva a −1.27,
  ningún peso toca la cota y la exactitud sube 0.9 puntos en prueba y 0.5 en
  validación cruzada (78.7 % ± 3.9), dentro de la variación entre pliegues. Se
  mantiene el rango [−1, 1] del artículo para pesos y sesgos. Sin el tope, el
  FCM llevaría a H al 15.3 % de los estudiantes con más de 7 ausencias, y el
  bosque aleatorio solo al 6.1 % (ver el tope en la etapa 3).
* **Sesgo.** La regla del artículo no tiene sesgo, y sin él el aprendizaje usa
  conceptos casi siempre activos como sustituto: C2 (Nacionalidad), C4 (Grado),
  C5 (Sección) y C12 (Discusión) tenían pesos −0.79, −0.45, −0.42 y −0.09, con
  signo contrario a su correlación con Class (+0.29, +0.07, +0.02 y +0.37). Con
  sesgo pasan a −0.26, −0.22, −0.13 y +0.15: C12 recupera el signo y los demás
  se reducen, aunque siguen con signo contrario. No son efectos causales. La
  exactitud sube de 72.1 % a 78.9 % en prueba y de 73.8 % a 78.2 % en
  validación cruzada, como lo anticipaba un concepto constante (de 73.4 % a
  78.4 % en 5 pliegues × 2 semillas).
* **Asociación, no causalidad.** Los pesos resumen asociaciones del dataset, no
  el efecto de intervenir en una acción.
