# Pizarra: aplicación web PRV-FCM

Aplicación local (SPA + Node.js) para analizar el rendimiento académico y la
deserción escolar con el modelo PRV-FCM del proyecto y un asistente que usa
`qwen2.5:7b` en Ollama. Todo corre en este equipo.

## Requisitos

- Node.js 22 o superior.
- El entorno Python del proyecto (`../.venv`) con `requirements.txt` instalado
  (incluye `networkx` para el grafo del mapa y `openpyxl`/`xlrd` para Excel).
- Ollama abierto con el modelo: `ollama pull qwen2.5:7b`.

## Uso

```powershell
cd app
npm install
npm run app        # compila la interfaz y abre el servidor en http://localhost:3001
```

Desarrollo con recarga: `npm run dev` y abrir http://localhost:5173.

Variables opcionales: `PORT` (3001), `PYTHON` (ruta del intérprete),
`OLLAMA_URL` (http://127.0.0.1:11434), `OLLAMA_MODEL` (qwen2.5:7b),
`OLLAMA_NUM_CTX` (8192).

## Flujo de cinco pasos

La aplicación sigue el flujo PRV-FCM paso a paso. Una barra de pasos arriba de
cada vista muestra cuáles están hechos; cada paso espera la confirmación del
anterior (guardar la clasificación, entrenar el modelo).

1. **Ingesta y exploración** (Datos). Sube un CSV (coma o punto y coma) o un
   Excel (.xlsx, .xls: se usa la primera hoja con datos). Las columnas
   True/False se tratan como categorías, y una columna que por sí sola
   determina el objetivo (por ejemplo, la nota final si "desertó" es nota < 10)
   se excluye de la sugerencia con un aviso. El reporte inicial
   muestra dimensiones, tipo de cada columna, vacíos, estadísticas descriptivas
   (media, desviación, cuartiles) y categorías. Explica la codificación
   (ordinal o label encoding, media del objetivo, one-hot) y la fuzzificación
   Min-Max a [0, 1], con la tabla de datos ya normalizados.
2. **Clasificación de nodos** (Datos). Cada columna es objetivo C_T, acción o
   concepto prescriptivo C_P, o concepto del sistema C_S (inmutable o mutable).
   El rol se cambia arrastrando la tarjeta de la columna entre los carriles del
   tablero de clasificación (o con las flechas del teclado) o desde la tabla.
   "Sugerir con IA" pide roles y nombres a qwen2.5. Las codificaciones son
   ordinal, número en texto, nominal (media del objetivo), one-hot, numérica y
   fecha (días desde la fecha mínima). "Cómo se llama cada registro" fija el
   sujeto que usan los textos (paciente, cliente; por defecto "registro").
   Un resumen muestra los
   conceptos numerados tal como los verá el mapa. La pestaña "Relaciones entre
   variables" grafica el objetivo, la correlación de cada variable con él, el
   perfil medio de cada nivel, el mapa de calor de correlaciones (Spearman,
   Pearson o parcial) y la dispersión de dos variables coloreada por nivel.
3. **Entrenamiento del FCM** (Modelo). Elige el perfil: **Mejorado** (el de
   trabajo: sesgo, penalización del esfuerzo β = 0,4, tope por ausentismo) o
   **Artículo** (reproduce a Hoyos, Aguilar y Toro, 2023: PSO, SMOTE, 10
   pliegues, sin sesgo ni β; solo para comparar). Cada perfil trae sus valores
   por defecto y se pueden cambiar. Elige cómo se extrae la matriz de pesos
   W: BPTT (gradiente exacto, recomendado), PSO, regresión Ridge o Lasso,
   correlación parcial o matriz de expertos (uno o varios CSV
   `origen,destino,peso`, promediados), la regla de inferencia (Kosko, Kosko
   modificada, reescalada), la activación (sigmoide o tanh), binarizar el
   objetivo y SMOTE. "Equilibrar los niveles del
   objetivo" (activada por defecto si un nivel es menos del 25 % de los
   registros, como en la deserción) hace que cada nivel pese lo mismo. La
   máscara de dirección causal opcional elimina aristas lógicamente
   imposibles. Muestra exactitud (también la equilibrada), matriz de
   confusión, selección de λ, el mapa interactivo y la matriz W.
4. **Motor prescriptivo** (Prescripciones). Métricas antes y después, la
   función de costo del AG, la tabla por estudiante (con simulador y
   prescripción individual) y el **perfil de riesgo**. El simulador mueve las
   acciones y la gráfica "Inferencia paso a paso" traza la activación del
   objetivo en cada iteración de la regla de Kosko, con las acciones actuales y
   las simuladas, y la cuenta de cada iteración (memoria, influencia de las
   acciones y del resto). En el perfil de riesgo se escribe o carga el
   estado de un individuo, se elige la meta (nivel deseado del objetivo) y el
   AG calcula los valores exactos de cada acción.
5. **Visualización y recomendaciones** (Informe). Reporte prescriptivo en
   lenguaje natural (por nivel), recomendaciones institucionales redactadas por
   qwen2.5, grafo del mapa generado con NetworkX y matplotlib, convergencia del
   AG y las demás figuras en PNG; descarga de `recomendaciones.csv`. La sección
   "Validación según el artículo" muestra sus Tablas 11 y 12 (MAE, MSE, RMSE y
   R² entre acciones prescritas y reales, pruebas t o Wilcoxon) y la PSR de su
   ecuación 19, un cociente distinto de nuestra tasa de éxito prescriptivo.

## Consulta (usuario final)

`/consulta` está fuera de la barra de pasos y es para quien solo quiere una
recomendación: elige un modelo entrenado por tema (el nombre del dataset; los
del perfil Artículo aparecen aparte como "Solo para experimentos", con un
aviso), llena el formulario que se arma desde el esquema del modelo (datos que
no cambian, estado actual, acciones actuales; un campo vacío toma el valor
típico), fija el nivel deseado y, si quiere, valores deseados de los mutables, y
recibe la prescripción con su reporte, en CSV o para imprimir. "Registrar
resultado" guarda las acciones aplicadas y el resultado observado en
`almacen/modelos/<id>/seguimiento.jsonl` (etapa de seguimiento de García et al.,
2025); la lista se exporta a CSV. Todavía no se usa para reentrenar.

Cada prescripción individual (estudiante o perfil) muestra los niveles antes y
después, las acciones con su cambio y el porcentaje de su rango, el reporte en
frases, la evolución del AG, el aporte de cada concepto al objetivo y un botón
para que qwen2.5 redacte recomendaciones pedagógicas a partir de esas cifras.
El AG de un estudiante tarda unos 20 ms, así que no se transmite en vivo: el
motor devuelve su historial (mejor costo, costo medio, activación del objetivo
y mejores acciones de cada generación) y la interfaz lo reproduce generación
por generación, con la curva del costo y las barras de las acciones actuales
frente a las prescritas.

## Asistente

Chat con qwen2.5 limitado al tema del dataset activo (sus registros, su
objetivo y sus acciones), a PRV-FCM y a la aplicación (filtro de tema previo).
Conoce los niveles del modelo y, si una herramienta responde con error (por
ejemplo, un nivel que no existe), corrige los argumentos y reintenta una vez.
Consulta los datos y el modelo con 11 herramientas: resumen de
datos y del modelo, pesos del mapa, estadísticas de una variable,
correlaciones entre todas las variables, relación entre dos variables,
búsqueda, análisis y simulación de un estudiante, perfil de riesgo y resumen de
las prescripciones generadas. Las herramientas devuelven frases ya redactadas
(`texto`, `reporte`) para que el modelo no tenga que calcular ni confundir
cifras, y muestran gráficas y tarjetas en la conversación.

## Ayuda

La sección «Ayuda» de la barra lateral (`/ayuda`) reúne la guía de uso de cada
vista y cada control (los cinco pasos, el resumen, el asistente y cómo leer
las gráficas), las fórmulas, los problemas frecuentes, buenas prácticas y un
glosario con cada sigla, símbolo y término de la aplicación (BPTT, PSR, λ, C_T,
L-BFGS-B…), con su significado y dónde aparece. Un buscador encuentra términos
y secciones de la guía, y los términos subrayados con puntos enlazan a su
definición (por ejemplo, `/ayuda#g-bptt`).

## Estructura

```
app/
├── server/        API Express (solo 127.0.0.1), puente con Python, agente Ollama
├── web/           SPA React 19 + Vite + Tailwind + Recharts
└── almacen/       datasets y modelos subidos (se crea al iniciar; no versionar)
```

El motor Python se usa con `python -m prvfcm.servicio` (proceso persistente de
consultas y un proceso por entrenamiento). La primera vez se registra el
dataset `data/xAPI-Edu-Data.csv` (480 registros) con su esquema. Cada
entrenamiento guarda sus figuras en `almacen/modelos/<id>/figuras/`.

Además del dataset del proyecto, se probó con
[Predict Students' Dropout and Academic Success](https://archive.ics.uci.edu/dataset/697)
de UCI (4424 estudiantes, separador punto y coma, objetivo Dropout < Enrolled <
Graduate). Allí conviene marcar como acciones, por ejemplo, la beca y la
matrícula al día. También se probó fuera de la educación con
`data/heart.csv` (pacientes) y `data/marketing_campaign.csv` (clientes); sus
esquemas se definen en el paso 2 y cada modelo guarda el suyo en
`almacen/modelos/<id>/esquema.json`.

## Pruebas

```powershell
npm test            # servidor: seguridad, herramientas, agente con Ollama simulado, motor Python
npm run typecheck   # interfaz
cd .. ; .venv\Scripts\python -m pytest   # motor Python
```
