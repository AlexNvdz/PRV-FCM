# PRV-FCM: prescripción del rendimiento académico

Implementación en Python de **PRV-FCM** (*PRescriptiVe Fuzzy Cognitive Maps* con
algoritmos genéticos; Hoyos, Aguilar y Toro, 2023) sobre el dataset
[Student Academic Performance (xAPI-Edu-Data)](https://www.kaggle.com/datasets/aljarah/xAPI-Edu-Data),
en su versión expandida a 4800 registros.

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
├── data/
│   └── xAPI-Edu-Data-expanded-4800.csv   Dataset expandido (4800 registros, 17 columnas)
├── prvfcm/
│   ├── configuracion.py       Conceptos C1-C16, codificación e hiperparámetros
│   ├── preprocesamiento.py    Etapa 1: carga (CSV o Excel), división agrupada, codificación, Min-Max, segmentación
│   ├── fcm.py                 Etapa 2: sigmoide, Kosko modificada con sesgo, extracción de W (BPTT, Ridge, Lasso, correlación parcial)
│   ├── seleccion.py           Etapa 2: validación cruzada agrupada de lambda y alpha_l2
│   ├── genetico.py            Etapa 3: AG (torneo, cruce uniforme/un punto, mutación)
│   ├── prescripcion.py        Etapa 3: cromosoma, función de costo, límites (tope por ausentismo), prescripción
│   ├── evaluacion.py          Etapa 4: MAE, MSE, RMSE, PSR y validación externa
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
├── resultados/                Salidas de la última ejecución (dataset expandido)
└── resultados_480/            Salidas anteriores con el dataset original (480), como referencia
```

## Aplicación web (Pizarra)

`app/` contiene una aplicación local con interfaz web sobre este mismo motor,
organizada en los cinco pasos: subir datasets de rendimiento o deserción (CSV o
Excel) y leer su reporte inicial; clasificar cada columna como C_T, C_P o C_S
(arrastrándola en un tablero o desde la tabla) y explorar cómo se relacionan
las variables entre sí y con el objetivo (mapa de calor de correlaciones,
dispersión por nivel, perfil medio de cada nivel); entrenar el PRV-FCM
eligiendo el método de extracción de W y la máscara causal, con la matriz W
como mapa de calor y el grafo dirigido de pesos; simular acciones por
estudiante viendo cada iteración de la inferencia y prescribir con el AG,
cuya evolución se reproduce generación por generación; y leer el informe con
el grafo NetworkX, la convergencia del AG y el reporte en frases. Un asistente
(`qwen2.5:7b` en Ollama), limitado al tema del proyecto, consulta los datos y
las prescripciones y redacta recomendaciones. Instrucciones en
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

python main.py                                        # configuración por defecto (dataset expandido)
python main.py --datos data/xAPI-Edu-Data.csv         # dataset original (480), si se copia a data/
python main.py --sin-cv --lambda 1 --alpha-l2 0.001   # sin validación cruzada
python main.py --division aleatoria                   # división sin agrupar (sobrestima las métricas)
python main.py --sin-sesgo                            # regla sin sesgo, la del artículo
python main.py --beta 0.05                            # menos penalización del esfuerzo (ver Limitaciones)
python main.py --sin-tope-ausentismo                  # sin el tope de acciones con más de 7 ausencias
python main.py --mutables-dinamicos                   # C13-C15 también evolucionan (ver abajo)
python main.py --metodo-pesos ridge                   # W por regresión Ridge (también lasso, correlacion_parcial)
python main.py --excluir gender Class                 # máscara causal: elimina la arista gender -> Class
python main.py --equilibrar-niveles                   # cada nivel del objetivo pesa lo mismo (objetivos desbalanceados)
python main.py --help                                 # todas las opciones
python -m pytest                                      # pruebas
```

La ejecución por defecto tarda cerca de un minuto y medio; casi todo es la
validación cruzada. Con `--sin-cv` tarda unos 10 segundos.

Opciones principales: `--metodo-pesos`, `--excluir`, `--equilibrar-niveles`, `--sin-sesgo`, `--lambda`, `--alpha-l2`, `--tolerancia` (FCM);
`--sin-cv`, `--pliegues`, `--rejilla-lambda`, `--rejilla-alpha` (validación
cruzada); `--poblacion`, `--generaciones`, `--torneo`,
`--cruce {uniforme,un_punto}`, `--tasa-cruce`, `--tasa-mutacion`,
`--sigma-mutacion`, `--elitismo` (AG); `--beta`, `--delta-max`,
`--permitir-reducciones`, `--tope-ausentismo`, `--sin-tope-ausentismo`
(prescripción); `--semilla`, `--prueba`, `--division`.
El resto de parámetros está en `prvfcm/configuracion.py`.

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
```

La entrada es un perfil (`dict` columna → valor; los conceptos dinámicos parten
de su media de entrenamiento) o un registro del dataset (`DataFrame` de una
fila; parten de su valor observado). Con un solo concepto dinámico y λ·k2 < 4,
como en xAPI, el estado final no depende de ese valor de partida. `al_progresar`
no consume números aleatorios: con la misma semilla, el resultado es idéntico
con aviso o sin él.

## Dataset expandido

`data/xAPI-Edu-Data-expanded-4800.csv` tiene las mismas 17 columnas que el
original y exactamente 10 veces sus registros por clase:

| Class | Original | Expandido |
|---|---|---|
| L | 127 | 1270 |
| M | 211 | 2110 |
| H | 142 | 1420 |

No es una muestra nueva de estudiantes:

* Las filas del original aparecen tal cual (comprobado con las cinco primeras).
* Los registros nuevos repiten el perfil categórico de un estudiante real y
  varían sus conteos de participación. Dentro de un mismo perfil, la desviación
  estándar de las acciones es de 12 a 14; en todo el dataset, de 22 a 30.

Por eso una división aleatoria pone variantes del mismo estudiante en
entrenamiento y en prueba, y las métricas de prueba miden en parte memoria, no
generalización.

**División agrupada.** Cada registro pertenece a un perfil inmutable: su
combinación de C1-C8 (277 perfiles). Cada perfil queda completo en
entrenamiento o en prueba. La división es 70/30, como en los dos artículos, y
estratificada por Class.

| Semilla 42 | División aleatoria | División agrupada (defecto) |
|---|---|---|
| Perfiles en entrenamiento y en prueba | 271 de 277 | 0 |
| Exactitud del bosque aleatorio | 94.2 % | 82.9 % |
| Exactitud del FCM | 80.1 % | 78.9 % |

Con la división agrupada, el bosque aleatorio queda cerca de la exactitud que
tenía con el dataset original (81.2 %). Agrupar con claves más gruesas (por ejemplo,
sin la nacionalidad) no la baja más: con C1-C8 ya no se detecta fuga. El FCM,
con solo 15 pesos y un sesgo, gana menos con la fuga: 1.2 puntos, frente a 11.3 del bosque.

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
  `x' = (x − mín) / (máx − mín)`). Mínimos, máximos y medias por categoría se
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

| Semilla 42, CV completa | BPTT (defecto) | Ridge | Lasso | Correlación parcial |
|---|---|---|---|---|
| λ y α elegidos | 1 y 0.001 | 1 y 0.01 | 1 y 0.01 | 1 y 0.0001 |
| Exactitud del FCM | 78.9 % | 76.6 % | 76.2 % | 48.3 % |
| F1 macro | 79.4 % | 77.0 % | 76.6 % | 37.0 % |
| PSR (FCM) | 7.2 % → 46.4 % | 5.3 % → 43.8 % | 5.2 % → 39.5 % | 36.8 % → 36.8 % |
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
exactitud L/M/H y, a igual exactitud, el menor MAE.

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
  PSR casi no baja (ver Limitaciones); con `--beta 0` queda solo el error
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
  | PSR (FCM), todos | 54.2 % | 49.9 % | 47.7 % | 47.0 % | **46.4 %** | 46.0 % | 46.0 % |

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

### 4. Evaluación

Se evalúan los 982 estudiantes de prueba con `Class` L o M. Cada métrica compara
el estado de convergencia con el estado deseado:

* **MAE** = media de `|A*_Class - 1|`, **MSE** = media de `(A*_Class - 1)²`,
  **RMSE** = raíz del MSE.
* **PSR** (*Prescriptive Success Rate*) = % de estudiantes con
  `|A*_Class - 1| ≤ 0.25`, es decir, con rendimiento H según el FCM.

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

**Predicción** (1411 estudiantes de prueba). Exactitud del FCM: 78.9 % (F1 macro
79.4 %; clase mayoritaria: 44.2 %; bosque aleatorio: 82.9 %). El FCM nunca
confunde L con H. El sesgo de C16 queda en −1.

| Nivel | Precisión | Recall | F1 |
|---|---|---|---|
| L | 79.2 % | 81.8 % | 80.5 % |
| M | 76.0 % | 76.3 % | 76.2 % |
| H | 82.9 % | 80.2 % | 81.5 % |

**Prescripción** (982 estudiantes con rendimiento L o M; β = 0.4 y tope por
ausentismo de 0.15):

| Métrica | Acciones actuales | PRV-FCM |
|---|---|---|
| MAE | 0.598 | 0.463 |
| MSE | 0.410 | 0.298 |
| RMSE | 0.641 | 0.546 |
| PSR (FCM) | 7.2 % | 46.4 % |
| Clasificados H por el bosque aleatorio | 8.1 % | 32.5 % |

| Estudiantes que llegan a H | n | FCM | Bosque aleatorio |
|---|---|---|---|
| Más de 7 ausencias | 522 | 0.0 % → 0.8 % | 1.1 % → 1.1 % |
| 7 ausencias o menos | 460 | 15.4 % → 98.3 % | 16.1 % → 68.0 % |

**Comparación con el dataset original:**

| | Original (480; 80/20 aleatoria) | Expandido (4800; 70/30 agrupada) |
|---|---|---|
| Estudiantes de prueba / con prescripción | 96 / 67 | 1411 / 982 |
| λ y α elegidos | 2 y 0.0001 | 1 y 0.001 |
| Exactitud del FCM | 70.8 % | 78.9 % |
| Exactitud del bosque aleatorio | 81.2 % | 82.9 % |
| PSR del FCM | 16.4 % → 35.8 % | 7.2 % → 46.4 % |
| Clasificados H por el bosque aleatorio | 7.5 % → 22.4 % | 8.1 % → 32.5 % |

Las conclusiones se mantienen: con los dos datasets el FCM promete H a unos 14
puntos más de estudiantes de los que confirma el bosque. Con el tope por
ausentismo, esa distancia ya no está en los estudiantes con más de 7 ausencias
sino en los que tienen 7 o menos: el FCM lleva a H al 98.3 % y el bosque al
68.0 %. La exactitud del FCM es 8.1 puntos mayor con el dataset expandido
(variación entre pliegues: ± 4.7).

## Decisión de modelado: C13-C15 observados

Con la regla de Kosko modificada, λ = 1 y pesos en [-1, 1], la inferencia converge
a un **punto fijo que no depende del valor inicial** de los conceptos que se
actualizan. Con un solo concepto dinámico la regla es una contracción, así que
esto está garantizado, con o sin sesgo. Con C13-C16 dinámicos se verificó
empíricamente sin sesgo, con λ = 1 y con λ = 2. Por eso,
el valor observado de un concepto que se actualiza se pierde. Si C13-C15
evolucionan (`--mutables-dinamicos`), el FCM reemplaza el ausentismo real del
estudiante por el que infiere de su participación.

| Variante (semilla 42) | Exactitud FCM | PSR (FCM) | Estudiantes con >7 ausencias que llegan a H: FCM / bosque aleatorio |
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

## Comparación con los artículos

| Aspecto | PRV-FCM (Hoyos et al., 2023) | García et al. (2025) | Este proyecto |
|---|---|---|---|
| Construcción del FCM | PSO sobre datos | Expertos | Datos: L-BFGS-B con gradiente exacto (BPTT) |
| Inferencia | Kosko modificada, sigmoide (λ = 10 en este dataset) | Kosko modificada, sigmoide | Kosko modificada con sesgo, sigmoide; λ = 1 por validación cruzada |
| Datos y división | 70/30; validación cruzada de 10 pliegues | 70/30; validación cruzada de 5 pliegues | 70/30 agrupada; validación cruzada agrupada de 5 pliegues |
| Rendimiento | 2 clases (nota < 70 o ≥ 70), balanceadas con SMOTE | Diagnóstico binario | 3 niveles (L/M/H), sin sobremuestreo |
| AG | Población 200, 50 generaciones, cruce 0.2, mutación 0.3 | Población 80-120, cruce 0.3-0.5, mutación 0.2-0.3; para si F mejora ≤ 0.001 | Población 50, hasta 100 generaciones, cruce 0.9, mutación 0.25; para tras 25 generaciones sin mejora |
| Aptitud | Diferencia entre el estado deseado y el inferido | Σ_j \|f(v̂_j + Σ_i W_ij·v̂_i) − v_j\| | Error absoluto ponderado respecto al estado deseado + β·esfuerzo; tope por ausentismo |
| Métricas | Exactitud; MAE, MSE, RMSE y PSR entre acciones reales y prescritas | Exactitud, precisión, recall, F1; R², MSE, RMSE | Exactitud, precisión, recall, F1; MAE, MSE, RMSE y PSR respecto al estado deseado; validación externa |

Los artículos validan comparando las acciones prescritas con las observadas
del mismo registro (Tablas 11 y 12 de PRV-FCM). Aquí el objetivo es cambiar las
acciones de los estudiantes L y M, así que la prescripción se compara con el
estado deseado y se contrasta con un modelo independiente.

## Salidas (`resultados/`)

* `recomendaciones.csv`: por estudiante (`id_estudiante` = fila del CSV, 0 = primera
  fila de datos), acciones actuales, recomendadas y cambio en unidades originales,
  activación de C16 antes y después, nivel L/M/H y éxito.
* `metricas.json`: configuración (con el método de pesos, el sesgo, el
  equilibrio de niveles, las aristas excluidas y el tope por ausentismo), tabla de validación cruzada, métricas de
  predicción (por nivel y matriz de confusión), de prescripción, por ausentismo
  y de la validación externa.
* `seleccion_hiperparametros.csv` / `seleccion_hiperparametros.png`: exactitud de
  validación de cada combinación de λ y α.
* `pesos_fcm.csv` / `pesos_fcm.png`: matriz de pesos aprendida; en el CSV, la
  última fila es el sesgo.
* `red_fcm.png`: el mapa como grafo dirigido (NetworkX y matplotlib), con el
  grosor de cada arista proporcional a |w|.
* `convergencia_ag.png`, `rendimiento_antes_despues.png`, `acciones_recomendadas.png`.

## Limitaciones

* **Datos sintéticos.** 4320 de los 4800 registros son variantes de los 480
  estudiantes reales. Dan estimaciones más estables, no información
  independiente: las métricas de prueba se calculan con perfiles no vistos, pero
  las conclusiones siguen apoyadas en 480 estudiantes.
* **Esfuerzo y personalización.** El FCM es monótono en las cuatro acciones y
  `Class = 1` es inalcanzable (la activación prescrita máxima es 0.89). Con un
  β pequeño, el AG sube las acciones casi al máximo y la prescripción se parece
  para todos; por eso el valor por defecto es β = 0.4 (con tope por ausentismo):

  | β | PSR (FCM) | Clasificados H por el bosque | Cambio medio por acción | Combinaciones de acciones distintas |
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
