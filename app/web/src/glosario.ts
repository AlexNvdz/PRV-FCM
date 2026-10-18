// Glosario de la ayuda: cada sigla, símbolo y término que aparece en la aplicación.
// Los textos admiten dos marcas: `código` entre comillas invertidas y subíndices con
// guion bajo fuera del código (C_T, w_ji, A*_T). Las fórmulas se muestran tal cual.

export interface Entrada {
  termino: string;
  /** Desarrollo de la sigla o nombre completo. */
  expansion?: string;
  definicion: string;
  formula?: string;
  /** Dónde aparece en la aplicación. */
  donde?: string;
  /** Términos relacionados (claves del glosario). */
  ver?: string[];
  /** Palabras que la búsqueda también debe encontrar. */
  claves?: string;
  /** Va en el grupo de símbolos y notación, en el orden en que se escribió. */
  simbolo?: boolean;
}

export const GLOSARIO = {
  // -------------------------------------------------------------------------
  // Símbolos y notación
  // -------------------------------------------------------------------------
  'c-t': {
    termino: 'C_T',
    expansion: 'Concepto objetivo (del inglés target)',
    definicion:
      'Clase del concepto que se quiere mejorar: el rendimiento, la nota final, la permanencia o la deserción. Hay exactamente uno por mapa. Recibe la influencia de los demás conceptos, no influye sobre ninguno y siempre se recalcula durante la inferencia. Su valor 1 es el mejor nivel.',
    donde: 'Paso 2 (rol «Objetivo (C_T)») y fórmulas del paso 4.',
    ver: ['objetivo', 'nivel', 'mejor-nivel'],
    claves: 'ct target',
    simbolo: true,
  },
  'c-p': {
    termino: 'C_P',
    expansion: 'Concepto prescriptivo o acción',
    definicion:
      'Clase de los conceptos que la institución o el estudiante pueden cambiar directamente, como la participación o las horas de estudio. Son los únicos que el algoritmo genético modifica: cada uno es un gen del cromosoma.',
    donde: 'Paso 2 (rol «Acción (C_P)»), tabla de la prescripción y perfil de riesgo.',
    ver: ['accion', 'cromosoma'],
    claves: 'cp prescriptivo acciones',
    simbolo: true,
  },
  'c-s': {
    termino: 'C_S',
    expansion: 'Concepto del sistema',
    definicion:
      'Clase de los conceptos que describen el contexto y no se controlan directamente. Pueden ser inmutables (fijos en el periodo, como la edad) o mutables (cambian, pero no por una decisión directa, como las ausencias). El algoritmo genético no los cambia.',
    donde: 'Paso 2 (roles «Inmutable (C_S)» y «Mutable (C_S)») y perfil de riesgo.',
    ver: ['inmutable', 'mutable'],
    claves: 'cs sistema',
    simbolo: true,
  },
  'c-n': {
    termino: 'C1, C2, …, Cn',
    expansion: 'Identificadores de los conceptos',
    definicion:
      'Número de cada concepto del mapa. Se asignan por rol: primero los inmutables, luego las acciones, los mutables y al final el objetivo. Una columna con codificación one-hot produce un concepto por categoría (por ejemplo «Asignatura: IT»). Si todas las columnas traen un identificador propio y ninguna es one-hot, se conservan esos identificadores.',
    donde: 'Resumen de la clasificación (paso 2), datos normalizados (paso 1), mapas de calor, matriz W y mapa del FCM.',
    ver: ['concepto', 'one-hot'],
    claves: 'c1 c9 c16 identificador numero de concepto',
    simbolo: true,
  },
  lambda: {
    termino: 'λ (lambda)',
    expansion: 'Pendiente de la sigmoide',
    definicion:
      'Controla qué tan abrupta es la sigmoide que convierte la suma de influencias en una activación entre 0 y 1. Con λ grande, la activación salta casi de 0 a 1; con λ pequeña, cambia de forma gradual. Se elige por validación cruzada entre 0,5; 1; 2; 3; 5 y 10. En el dataset del proyecto gana λ = 1; el λ = 10 del artículo original colapsa y predice el mismo nivel para todos.',
    formula: 'f(x) = 1 / (1 + e^(−λx))',
    donde: 'Paso 3 («Selección de λ y α», gráfica de selección y dato «λ y α»), Resumen («Pendiente elegida») e Informe.',
    ver: ['sigmoide', 'validacion-cruzada', 'alfa'],
    claves: 'lambda pendiente',
    simbolo: true,
  },
  alfa: {
    termino: 'α (alfa)',
    expansion: 'Fuerza de la regularización',
    definicion:
      'Penaliza los pesos grandes al aprender W, para que el mapa no se ajuste de más a los datos de entrenamiento. Con BPTT y Ridge la penalización es L2; con Lasso, L1, que puede dejar pesos en 0. La validación cruzada completa prueba 0,0001; 0,001 y 0,01; sin validación se usa 0,001.',
    donde: 'Paso 3 («Selección de λ y α» y dato «λ y α»).',
    ver: ['regularizacion', 'l1-l2', 'validacion-cruzada'],
    claves: 'alpha regularizacion',
    simbolo: true,
  },
  beta: {
    termino: 'β (beta)',
    expansion: 'Penalización del esfuerzo o costo de intervención',
    definicion:
      'Peso que la función de costo del algoritmo genético da al tamaño del cambio en las acciones. Con β pequeño (0,05) el AG busca el máximo efecto y suele llevar las acciones al tope; con β mayor prefiere cambios pequeños aunque el avance sea algo menor. Con 0,4, el valor por defecto, los planes son moderados y distintos para cada estudiante. No se confunde con β_j de la fórmula w_ji = tanh(β_j), que es un coeficiente de la regresión.',
    formula: 'costo(a) = |A*_T(a) − D_T| + β · media_k |a_k − a_k,actual|',
    donde:
      'Paso 3 («Penalización del esfuerzo (β)», de 0 a 5; 0,4 por defecto) y paso 4 («Costo de intervención (β)» o «Penalización del esfuerzo», de 0 a 1, o hasta el β del modelo si es mayor; parten del β con que se entrenó el modelo, 0,4 si no lo guarda).',
    ver: ['funcion-costo', 'plan', 'cambio-maximo'],
    claves: 'beta esfuerzo costo de intervencion penalizacion',
    simbolo: true,
  },
  'k1-k2': {
    termino: 'k1 y k2',
    expansion: 'Coeficientes de influencia y de memoria',
    definicion:
      'En la regla de Kosko modificada, k1 multiplica la suma de influencias de los demás conceptos más el sesgo, y k2 la activación previa del propio concepto (su memoria). En esta aplicación ambos valen 1.',
    formula: 'A_i(t+1) = f( k2·A_i(t) + k1·(Σ_j w_ji·A_j(t) + b_i) )',
    donde: 'Fórmula de la regla de inferencia (paso 3) y aportes «k1·w·A» de una prescripción.',
    ver: ['kosko', 'memoria', 'aporte'],
    claves: 'coeficiente memoria influencia',
    simbolo: true,
  },
  w: {
    termino: 'W y w_ji',
    expansion: 'Matriz de pesos (matriz de adyacencia) y peso de una arista',
    definicion:
      'W es una tabla n × n con un peso para cada par de conceptos. w_ji es la influencia del concepto j (origen, fila) sobre el concepto i (destino, columna), entre −1 y 1: si es positivo, cuando j sube, i tiende a subir; si es negativo, i tiende a bajar; cerca de 0, la influencia es débil. Una celda gris es una arista que la estructura no permite. Hacia el objetivo, un peso positivo empuja al mejor nivel.',
    donde:
      'Paso 3 («Matriz de adyacencia W aprendida», mapa y «Todos los pesos hacia el objetivo») e Informe («Matriz de pesos aprendida»).',
    ver: ['peso', 'arista', 'estructura', 'mapa-calor'],
    claves: 'matriz de pesos adyacencia wji',
    simbolo: true,
  },
  'a-i': {
    termino: 'A_i(t)',
    expansion: 'Activación del concepto i en la iteración t',
    definicion:
      'Valor entre 0 y 1 de un concepto en un paso de la inferencia. La regla de Kosko calcula A_i(t+1) a partir de A_i(t) y de las activaciones de los demás conceptos.',
    ver: ['activacion', 'inferencia', 'iteracion'],
    claves: 'ai',
    simbolo: true,
  },
  'a-t': {
    termino: 'A*_T',
    expansion: 'Activación final del objetivo',
    definicion:
      'Activación del objetivo cuando la inferencia del FCM converge. Es la cifra de los medidores («FCM con las acciones actuales», «FCM con las acciones prescritas») y la que el algoritmo genético compara con la meta D_T.',
    ver: ['convergencia', 'd-t', 'medidor'],
    claves: 'at activacion final',
    simbolo: true,
  },
  'd-t': {
    termino: 'D_T',
    expansion: 'Estado deseado del objetivo (meta)',
    definicion:
      'Valor normalizado al que el algoritmo genético quiere llevar el objetivo: 1 para el mejor nivel, el del nivel siguiente al observado con la meta escalonada, o el valor del nivel elegido como meta (por ejemplo, 0,5 para el nivel del medio cuando hay tres).',
    ver: ['meta', 'tolerancia'],
    claves: 'dt estado deseado',
    simbolo: true,
  },
  intervalos: {
    termino: '[0, 1] y [−1, 1]',
    expansion: 'Intervalos de valores',
    definicion:
      '[0, 1] es la escala de las activaciones y de los valores normalizados: 0 es el mínimo (o la ausencia) y 1 el máximo (o la presencia plena). [−1, 1] es la escala de los pesos y de las correlaciones. El corchete incluye el extremo; el paréntesis, como en (−1, 1), lo excluye.',
    ver: ['normalizado', 'peso', 'correlacion'],
    claves: 'intervalo escala cero uno',
    simbolo: true,
  },

  // -------------------------------------------------------------------------
  // Términos
  // -------------------------------------------------------------------------
  accion: {
    termino: 'Acción',
    expansion: 'Concepto prescriptivo (C_P)',
    definicion:
      'Variable que la institución o el estudiante pueden cambiar directamente: horas de estudio, participación, recursos consultados, tutorías, becas. Es lo único que el algoritmo genético modifica. Debe ser numérica u ordinal, porque el AG necesita poder aumentarla o reducirla; una columna nominal o one-hot no sirve. Se necesita al menos una.',
    donde: 'Paso 2 (rol «Acción (C_P)»), paso 4 (tabla por estudiante, simulador y perfil de riesgo) e Informe.',
    ver: ['c-p', 'cromosoma', 'permitir-reducciones', 'accion-binaria'],
    claves: 'acciones prescriptivo intervencion',
  },
  'accion-binaria': {
    termino: 'Acción binaria',
    definicion:
      'Acción ordinal de dos categorías, por ejemplo cada campaña de marketing (0 = no activada, 1 = activada). El AG solo propone una de sus dos categorías, nunca un valor intermedio: la activa o no. La tabla de acciones muestra el valor actual como «Activa» o «No activa» y el recomendado como «Activar», «No activar», «Mantener activa» o «Desactivar»; en los formularios se elige «Activa» o «No activa».',
    donde: 'Paso 2 (acción ordinal con orden de dos categorías), tabla de acciones de una prescripción, tabla por registro del paso 4, simulador, perfil de riesgo, Consulta (también su seguimiento) y tarjetas del Asistente.',
    ver: ['accion', 'ordinal', 'cromosoma'],
    claves: 'binaria activar desactivar campaña campana marketing dos categorias',
  },
  activacion: {
    termino: 'Activación',
    definicion:
      'Valor entre 0 y 1 de un concepto: su grado de presencia. Los datos se convierten en activaciones con la fuzzificación Min-Max. En el objetivo, 0 es el peor nivel y 1 el mejor; los medidores muestran en qué zona de nivel cae la activación.',
    donde: 'Medidores, columnas «FCM actual» y «FCM prescrito» del paso 4 y tablas del Informe.',
    ver: ['fuzzificacion', 'a-t', 'medidor'],
  },
  ag: {
    termino: 'AG',
    expansion: 'Algoritmo genético',
    definicion:
      'Método de búsqueda inspirado en la evolución. Para cada estudiante crea una población de combinaciones de acciones (incluida la actual), evalúa cada una con el FCM y, generación tras generación, selecciona por torneo, cruza, muta y conserva a las mejores (elitismo). Se detiene al completar las generaciones o tras 25 generaciones sin mejora, y devuelve la combinación de menor costo.',
    donde: 'Paso 3 («Algoritmo genético y semilla»), paso 4 («Cómo decide el algoritmo genético» y convergencia) e Informe.',
    ver: ['funcion-costo', 'cromosoma', 'poblacion', 'generacion', 'torneo', 'cruce', 'mutacion', 'elitismo', 'parada-temprana'],
    claves: 'algoritmo genetico',
  },
  aporte: {
    termino: 'Aporte al objetivo',
    expansion: 'k1 · w · A',
    definicion:
      'Lo que cada concepto suma a la entrada del objetivo: su peso hacia el objetivo por su activación (y por k1, que vale 1). Positivo acerca al mejor nivel; negativo aleja. La gráfica «Qué empuja al objetivo» lo compara con las acciones actuales y con el plan: solo cambian las acciones, el resto de conceptos queda igual. Si el modelo tiene sesgo, la gráfica suma una fila «Sesgo del objetivo (k1·b)»: una constante, igual para todos los estudiantes y con o sin el plan.',
    donde: 'Resultado de una prescripción individual (panel del estudiante y perfil de riesgo).',
    ver: ['peso', 'frenos', 'k1-k2', 'sesgo'],
    claves: 'contribucion que empuja al objetivo',
  },
  arista: {
    termino: 'Arista',
    definicion:
      'Conexión dirigida entre dos conceptos, con un peso. Las aristas van de los conceptos fijos (sistema y acciones) hacia los dinámicos; el objetivo recibe aristas pero no tiene aristas de salida, y ningún concepto influye sobre los fijos. La máscara de dirección causal permite quitar aristas.',
    donde: 'Paso 3 (máscara, matriz W y mapa) e Informe (grafo).',
    ver: ['estructura', 'w', 'mascara'],
    claves: 'conexion enlace flecha',
  },
  asistente: {
    termino: 'Asistente',
    definicion:
      'Chat con el modelo de lenguaje qwen2.5, que corre en su equipo. Responde solo sobre rendimiento académico, deserción, el modelo PRV-FCM y el uso de la aplicación, y consulta los datos y el modelo activos con 11 herramientas antes de responder, así sus cifras salen del modelo.',
    donde: 'Sección «Asistente» de la barra lateral y botón «Preguntar al asistente por este estudiante».',
    ver: ['qwen', 'herramientas', 'guardia', 'plan'],
    claves: 'chat',
  },
  asociacion: {
    termino: 'Asociación y causa',
    definicion:
      'Que dos variables cambien juntas (una correlación o un peso del FCM) no prueba que una cause la otra. El FCM resume asociaciones de los datos: sus prescripciones son hipótesis razonables que conviene acompañar con seguimiento. Por eso cada reporte trae una nota de causalidad.',
    ver: ['correlacion', 'peso', 'reporte-prescriptivo'],
    claves: 'causalidad causa efecto',
  },
  aumenta: {
    termino: 'Aumenta en y sin cambio en',
    definicion:
      'Columnas del Informe: porcentaje de estudiantes prescritos a los que el algoritmo genético les sube una acción (al menos 0,5 % de su rango) y porcentaje a los que se la deja igual.',
    donde: 'Informe, tabla «Qué cambia en cada acción».',
    ver: ['del-rango'],
  },
  binarizacion: {
    termino: 'Binarización del objetivo',
    definicion:
      'Convierte un objetivo de varios niveles en dos: éxito desde el nivel elegido (≥N) y el resto (<N). En un objetivo numérico, éxito es alcanzar un umbral en sus unidades (o no superarlo, si el objetivo está invertido). Reproduce los artículos, que miden éxito o fracaso. No se ofrece el peor nivel: todos serían éxito.',
    donde: 'Paso 3, «Binarizar el objetivo».',
    ver: ['nivel', 'objetivo', 'perfil-entrenamiento'],
    claves: 'binario dos clases umbral exito fracaso',
  },
  bosque: {
    termino: 'Bosque aleatorio',
    expansion: 'Random forest',
    definicion:
      'Modelo de clasificación externo, formado por 500 árboles de decisión, que se entrena aparte con los mismos datos de entrenamiento y no participa en la búsqueda del algoritmo genético. Sirve de referencia: su exactitud muestra cuánto se puede predecir con los datos, y su predicción con las acciones prescritas es la cifra prudente del éxito, porque no la juzga el mismo modelo que generó la prescripción. Suele acertar más que el FCM, pero no es interpretable.',
    donde:
      'Resumen, paso 3 (dato «Bosque aleatorio») y paso 4 (fila «En el mejor nivel según el bosque aleatorio» y probabilidad media del mejor nivel).',
    ver: ['validacion-externa', 'psr', 'prob-mejor'],
    claves: 'random forest arboles',
  },
  bptt: {
    termino: 'BPTT',
    expansion: 'Backpropagation Through Time (retropropagación a través del tiempo)',
    definicion:
      'Método por defecto para aprender la matriz W. Repite 30 iteraciones de la regla del FCM como si fueran capas de una red y calcula de forma exacta cómo cambia el error, entre la activación final del objetivo y su valor observado, al mover cada peso (el gradiente). Con ese gradiente, el optimizador L-BFGS-B ajusta los pesos dentro de [−1, 1], con una penalización L2. En la fórmula, v_r es el peso de cada registro: 1 para todos, salvo si equilibra los niveles. Es el método más preciso (79 % de exactitud en el dataset del proyecto) y el más lento.',
    formula: 'L(W) = media_r [ v_r · (A_T,r − y_r)² ] + α · Σ w²',
    donde: 'Paso 3, «Método de extracción de la matriz de pesos W».',
    ver: ['gradiente', 'lbfgsb', 'l1-l2', 'ridge'],
    claves: 'backpropagation retropropagacion gradiente exacto',
  },
  cambio: {
    termino: 'Cambio',
    definicion:
      'Diferencia entre el valor recomendado y el actual de una acción, en sus unidades originales: con signo + aumenta y con − se reduce; «igual» indica que no cambia.',
    donde: 'Tabla de la prescripción individual (columna «Cambio»), tabla por estudiante del paso 4 y gráficas de mancuernas.',
    ver: ['del-rango', 'unidades-originales'],
  },
  'cambio-maximo': {
    termino: 'Cambio máximo por acción',
    definicion:
      'Límite de cuánto puede moverse cada acción en una prescripción, como fracción de su rango: 0,2 permite moverla como máximo un 20 % de la distancia entre su mínimo y su máximo observados. Vacío o «sin límite»: la acción puede llegar al extremo de su rango. Sirve para pedir planes realistas: sin él, a quien está lejos de su meta el AG le pide casi todo el rango. Una acción discreta (una campaña) siempre puede moverse una categoría aunque el tope sea menor que su paso. Los controles del panel y del perfil de riesgo parten del tope del modelo.',
    donde: 'Paso 3 (campo «Cambio máximo por acción») y paso 4 (controles del panel del estudiante y del perfil de riesgo).',
    ver: ['beta', 'rango', 'del-rango', 'tope-ausentismo'],
    claves: 'delta maximo limite',
  },
  'cambio-medio': {
    termino: 'Cambio medio por acción',
    definicion:
      'Promedio, entre estudiantes y acciones, de cuánto cambia cada acción en la escala [0, 1]; equivale a la fracción del rango (0,2 = 20 % del rango).',
    donde: 'Paso 4, debajo de la tabla de métricas.',
    ver: ['del-rango'],
  },
  categorica: {
    termino: 'Categórica y numérica',
    expansion: 'Tipo de una columna',
    definicion:
      'Una columna numérica tiene números (edad, horas); una categórica tiene etiquetas de texto (género, asignatura). Las columnas True/False se tratan como categóricas. El tipo determina la codificación sugerida.',
    donde: 'Paso 1, tabla «Tipos de datos y valores faltantes» (columna «Clase»).',
    ver: ['codificacion', 'true-false', 'tipo-pandas'],
    claves: 'tipo de dato',
  },
  'celdas-vacias': {
    termino: 'Celdas vacías y filas con vacíos',
    definicion:
      'Celdas sin valor en el archivo y filas que tienen al menos una. Una fila con vacíos en las columnas que usa el esquema se descarta al entrenar; las que quedan son las filas útiles.',
    donde: 'Paso 1, «Dimensiones».',
    ver: ['filas-utiles', 'no-nulos'],
    claves: 'vacios faltantes nulos missing',
  },
  'clase-mayoritaria': {
    termino: 'Clase mayoritaria',
    definicion:
      'Exactitud de un modelo trivial que predice siempre el nivel más frecuente. Es la línea base mínima: un modelo útil debe superarla. Si un nivel domina (por ejemplo, el 85 % no deserta), esa línea base ya es alta y conviene mirar la exactitud equilibrada.',
    donde: 'Paso 3 (dato «Clase mayoritaria» y línea gris de la selección de λ) y Resumen.',
    ver: ['exactitud', 'exactitud-equilibrada'],
    claves: 'linea base',
  },
  clasificacion: {
    termino: 'Clasificación de nodos',
    definicion:
      'Paso 2 del flujo: decidir el rol de cada columna en el mapa (objetivo C_T, acción C_P, sistema C_S inmutable o mutable, o excluida) y cómo se codifica. El modelo exige guardar esta clasificación antes de entrenar.',
    donde: 'Datos, pestaña «2. Clasificación de nodos».',
    ver: ['rol', 'esquema', 'codificacion'],
  },
  codificacion: {
    termino: 'Codificación',
    definicion:
      'Cómo se convierte una columna en números antes de normalizarla: numérica, ordinal (label encoding), nominal con media del objetivo (target encoding), one-hot, número en texto o fecha. La aplicación sugiere una por columna y usted puede cambiarla en el paso 2.',
    donde: 'Paso 2 (columna «Codificación») y paso 1 (tabla de conceptos normalizados).',
    ver: ['numerica', 'ordinal', 'nominal', 'one-hot', 'numero-en-texto', 'fecha'],
    claves: 'encoding',
  },
  concepto: {
    termino: 'Concepto',
    expansion: 'Nodo del mapa',
    definicion:
      'Cada variable del mapa cognitivo: un nodo con una activación entre 0 y 1. Sale de una columna del archivo, o de una categoría si la columna es one-hot.',
    ver: ['c-n', 'c-t', 'c-p', 'c-s', 'activacion'],
    claves: 'nodo variable',
  },
  consenso: {
    termino: 'Matriz de consenso',
    definicion:
      'Media de las matrices de los expertos, arista por arista. Si un experto no dio una arista, cuenta 0 para él. Es la W que usa el método de expertos.',
    formula: 'w_ji = (1/E) · Σ_e w_ji(e)',
    donde: 'Paso 3, método «Matriz de expertos».',
    ver: ['expertos', 'w'],
    claves: 'media expertos',
  },
  consulta: {
    termino: 'Consulta',
    definicion:
      'Vista para el usuario final, fuera de la barra de cinco pasos: elige un modelo listo de cualquier dataset (el nombre del dataset es el tema), describe el caso, fija el estado deseado y recibe la prescripción, que puede descargar en CSV o imprimir. Un dato vacío toma el valor típico del dataset.',
    donde: 'Barra lateral, «Consulta».',
    ver: ['seguimiento', 'perfil-tipico', 'prescripcion'],
    claves: 'usuario final consultar tema formulario imprimir',
  },
  dinamico: {
    termino: 'Concepto dinámico y concepto fijo',
    definicion:
      'Un concepto dinámico se recalcula en cada iteración de la inferencia; uno fijo conserva su valor (en inglés, clamped). El objetivo siempre es dinámico; inmutables y acciones siempre son fijos; un mutable es fijo salvo que marque «Dinámico» en el paso 2. Un mutable dinámico pierde su valor observado: el FCM lo reemplaza por lo que infiere de los demás. En el dataset del proyecto eso llevó a prometer el nivel alto a estudiantes con muchas ausencias; por eso los mutables se dejan fijos.',
    donde: 'Paso 2, columna «Dinámico».',
    ver: ['mutable', 'inferencia', 'convergencia'],
    claves: 'fijo clamped',
  },
  'convergencia-ag': {
    termino: 'Convergencia del AG',
    definicion:
      'Cómo mejora la población generación tras generación, desde la población inicial (generación 0). En el paso 4 y en el Informe se ve por defecto la aptitud normalizada: el mejor individuo (élite, naranja) arranca alto y el promedio de la población (azul) sube hacia él; cuanto más arriba, mejor. El selector «Ver» cambia al costo: la mediana del mejor costo de cada generación entre los estudiantes, con su rango intercuartílico, y la del costo medio de la población; ahí menor es mejor. Los modelos entrenados antes de este cambio solo muestran el mejor costo desde la generación 1. En una prescripción individual se ven el mejor costo y el costo medio («Costo por generación»). Cuando las curvas se aplanan, el AG ya no encuentra mejoras. Si el mejor ya vale 1 en la generación 0, la población inicial contenía la solución (pasa con pocas combinaciones, como cinco campañas binarias) y solo sube el promedio.',
    donde: 'Paso 4, Informe y resultado de una prescripción individual.',
    ver: ['aptitud-normalizada', 'generacion', 'costo-medio', 'cuartiles', 'parada-temprana', 'evolucion-ag'],
  },
  convergencia: {
    termino: 'Convergencia del FCM',
    definicion:
      'La inferencia se detiene cuando ninguna activación cambia más de 0,00001 entre dos iteraciones, o tras 100 iteraciones. El estado alcanzado es un punto fijo: aplicar la regla otra vez ya no lo cambia.',
    ver: ['inferencia', 'punto-fijo', 'iteracion'],
  },
  correlacion: {
    termino: 'Correlación',
    definicion:
      'Número entre −1 y 1 que mide cuánto se mueven juntas dos variables: cerca de 1, suben juntas; cerca de −1, una sube cuando la otra baja; cerca de 0, no hay relación de ese tipo. Se calcula sobre los valores codificados y normalizados e indica asociación, no causa. Las variables nominales con media del objetivo quedan asociadas con él por construcción.',
    donde: 'Datos, pestaña «Relaciones entre variables», y asistente.',
    ver: ['spearman', 'pearson', 'correlacion-parcial', 'asociacion'],
  },
  'correlacion-parcial': {
    termino: 'Correlación parcial',
    definicion:
      'Correlación entre dos variables después de descontar el efecto de todas las demás: mide la relación directa. Se obtiene de la inversa de la matriz de covarianzas (P, la matriz de precisión) estimada con la contracción de Ledoit-Wolf. Como método de W describe bien la estructura, pero no calibra la inferencia: 48 % de exactitud en el dataset del proyecto. No tiene sesgo (b = 0) ni admite equilibrar los niveles.',
    formula: 'w_ji = −P_ji / √(P_jj · P_ii)',
    donde: 'Paso 3 (método de W) y método «Parcial» del mapa de calor de correlaciones.',
    ver: ['correlacion', 'covarianza', 'ledoit-wolf'],
  },
  'aptitud-normalizada': {
    termino: 'Aptitud normalizada',
    definicion:
      'Escala de la convergencia del AG en la que más arriba es mejor. El AG minimiza el costo; para comparar estudiantes con costos de escalas distintas, el costo de cada uno se pasa a una escala propia: 0 es el costo medio de su población inicial y 1, su mejor costo final. Luego se toma la mediana entre estudiantes de dos curvas: el mejor individuo (élite) y el promedio de la población. La élite arranca alta, porque la población inicial ya trae buenas soluciones, y el promedio sube hacia ella.',
    formula: 'aptitud(g) = (costo medio inicial − costo(g)) / (costo medio inicial − mejor costo final)',
    donde: 'Convergencia del algoritmo genético en el paso 4 y en el Informe (vista «Aptitud normalizada»).',
    ver: ['convergencia-ag', 'costo-medio', 'funcion-costo', 'generacion'],
    claves: 'fitness aptitud elite promedio poblacion normalizada progreso',
  },
  'costo-medio': {
    termino: 'Costo medio de la población',
    definicion:
      'Promedio del costo de todas las combinaciones de una generación del algoritmo genético. Baja a medida que la población se concentra cerca de la mejor solución.',
    donde: 'Convergencia de una prescripción individual y vista «Costo» de la convergencia del paso 4 y del Informe (en ambas, línea azul; en la segunda, mediana entre estudiantes).',
    ver: ['convergencia-ag', 'aptitud-normalizada', 'poblacion'],
  },
  covarianza: {
    termino: 'Covarianza',
    definicion:
      'Medida de cuánto varían juntas dos variables, en sus unidades. La correlación es la covarianza llevada a la escala [−1, 1]. La inversa de la matriz de covarianzas (matriz de precisión) da las correlaciones parciales.',
    ver: ['correlacion-parcial', 'ledoit-wolf'],
  },
  cromosoma: {
    termino: 'Cromosoma y gen',
    definicion:
      'En el algoritmo genético, un cromosoma es una solución candidata: un vector con un gen por acción. Cada gen es el valor de una acción en la escala [0, 1]; al final se traduce a unidades originales.',
    ver: ['ag', 'accion', 'poblacion'],
    claves: 'genes individuo solucion candidata',
  },
  cruce: {
    termino: 'Cruce y tasa de cruce',
    definicion:
      'Operador del algoritmo genético que combina dos soluciones padre en dos hijas. Uniforme (por defecto): cada gen se intercambia con probabilidad 0,5. De un punto: se intercambian todos los genes a partir de un corte al azar. La tasa de cruce (0,9 por defecto) es la probabilidad de que una pareja se cruce; si no se cruza, las hijas son copias de los padres.',
    donde: 'Paso 3, «Algoritmo genético y semilla» (campos «Tasa de cruce» y «Cruce»).',
    ver: ['ag', 'mutacion', 'torneo'],
    claves: 'crossover uniforme un punto',
  },
  csv: {
    termino: 'CSV',
    expansion: 'Comma-Separated Values (valores separados por comas)',
    definicion:
      'Archivo de texto con una fila por registro y las columnas separadas por coma o por punto y coma. La primera fila lleva los nombres de las columnas.',
    donde: 'Paso 1 (subida) e Informe («Recomendaciones (CSV)»).',
    ver: ['excel', 'recomendaciones-csv'],
  },
  cuartiles: {
    termino: 'Cuartiles, mediana y rango intercuartílico',
    definicion:
      'Los cuartiles dividen los valores ordenados en cuatro partes iguales: el cuartil 1 deja por debajo el 25 % de los valores, la mediana el 50 % y el cuartil 3 el 75 %. El rango intercuartílico va del cuartil 1 al 3 y contiene la mitad central de los datos; es la banda de las gráficas de convergencia.',
    donde: 'Paso 1 (estadísticas descriptivas) y gráficas de convergencia.',
    ver: ['desviacion', 'media-moda'],
    claves: 'q1 q3 percentil',
  },
  dataset: {
    termino: 'Dataset y datos activos',
    definicion:
      'Un dataset es un archivo subido (CSV o Excel) con su reporte inicial, su esquema y sus modelos. Los datos activos son el dataset con el que trabajan Resumen, Modelo, Prescripciones, Informe y el Asistente; se eligen en la barra lateral, con «Usar» en la lista de Datos o con «Usar este dataset».',
    ver: ['csv', 'esquema', 'modelo-activo'],
    claves: 'conjunto de datos archivo activo',
  },
  'dataset-proyecto': {
    termino: 'Dataset del proyecto',
    expansion: 'xAPI-Edu-Data, 480 registros',
    definicion:
      'Dataset de ejemplo que se registra, con su esquema ya confirmado, cuando el servidor arranca sin ningún dataset: los 480 estudiantes de xAPI-Edu-Data (Kaggle). El objetivo es Class, con los niveles L (bajo), M (medio) y H (alto), y las acciones son manos levantadas, recursos visitados, anuncios consultados y grupos de discusión. Varios estudiantes comparten perfil inmutable (277 perfiles), por eso conviene la división agrupada.',
    donde: 'Datos (marcado como «dataset del proyecto»).',
    ver: ['xapi', 'division-agrupada'],
    claves: 'ejemplo kaggle class',
  },
  'del-rango': {
    termino: 'Del rango',
    expansion: 'Cambio como porcentaje del rango',
    definicion:
      'Tamaño de un cambio como porcentaje de la distancia entre el mínimo y el máximo observados de la acción. Equivale al cambio en la escala [0, 1] del FCM y permite comparar acciones medidas en unidades distintas.',
    formula: '(recomendada − actual) / (máximo − mínimo)',
    donde: 'Tabla de la prescripción individual (columna «Del rango») y reporte prescriptivo («… de su rango»).',
    ver: ['rango', 'cambio', 'cambio-maximo'],
    claves: 'porcentaje del rango',
  },
  desercion: {
    termino: 'Deserción',
    definicion:
      'Abandono de los estudios. Cuando el objetivo es «desertó: sí o no», el mejor nivel es «no deserta» y suele ser mucho más frecuente que el otro: conviene equilibrar los niveles y mirar el recall del nivel de riesgo.',
    ver: ['equilibrar', 'recall', 'objetivo'],
    claves: 'dropout abandono permanencia',
  },
  desviacion: {
    termino: 'Desviación estándar',
    definicion:
      'Dispersión típica de los valores alrededor de la media, en las mismas unidades. En la gráfica de selección de λ, la banda es ± 1 desviación de la exactitud entre pliegues.',
    donde: 'Paso 1 (estadísticas descriptivas) y paso 3 (selección de λ).',
    ver: ['media-moda', 'validacion-cruzada'],
  },
  'division-agrupada': {
    termino: 'División agrupada por perfil',
    definicion:
      'Forma de separar entrenamiento y prueba que mantiene juntos los registros con el mismo perfil inmutable. Evita que variantes casi iguales de un estudiante queden a ambos lados, lo que inflaría las métricas. Reparte los perfiles en 20 partes estratificadas por nivel y toma para la prueba la proporción pedida. Si hay menos de 40 perfiles distintos, se usa la división aleatoria.',
    donde: 'Paso 3 (campo «División», opción recomendada) y dato «Entrenamiento y prueba».',
    ver: ['division-aleatoria', 'perfil-inmutable', 'perfiles-compartidos', 'estratificada'],
    claves: 'agrupada grupos',
  },
  'division-aleatoria': {
    termino: 'División aleatoria',
    definicion:
      'Separa entrenamiento y prueba al azar, estratificando por el nivel del objetivo. Si el dataset tiene variantes del mismo estudiante, filtra información entre las partes: en el dataset del proyecto, la exactitud del bosque aleatorio sube de 83 % a 94 % de forma engañosa.',
    donde: 'Paso 3, campo «División».',
    ver: ['division-agrupada', 'estratificada'],
    claves: 'azar',
  },
  elitismo: {
    termino: 'Elitismo',
    definicion:
      'Las 2 mejores soluciones de cada generación pasan intactas a la siguiente. Así el mejor costo nunca empeora y, como las acciones actuales están en la población inicial, la prescripción nunca es peor que no actuar.',
    ver: ['ag', 'poblacion'],
    claves: 'elite',
  },
  'entrenamiento-prueba': {
    termino: 'Entrenamiento y prueba',
    expansion: 'Conjuntos de datos',
    definicion:
      'El conjunto de entrenamiento sirve para aprender la codificación, el Min-Max y la matriz W, y para elegir λ y α. El de prueba (30 % por defecto) son registros que el modelo no vio: con ellos se miden la exactitud y las demás métricas, y se generan las prescripciones del paso 4.',
    donde: 'Paso 3 (campo «Datos de prueba (%)» y dato «Entrenamiento y prueba») y panel del estudiante.',
    ver: ['division-agrupada', 'validacion-cruzada'],
    claves: 'train test',
  },
  equilibrar: {
    termino: 'Equilibrar los niveles del objetivo',
    definicion:
      'Opción del paso 3 que pondera cada registro por la inversa de la frecuencia de su nivel, para que cada nivel pese lo mismo al aprender W. Sin ella, con un nivel raro (por ejemplo, el 15 % deserta), el mapa tiende a predecir el nivel frecuente y no detecta a quienes están en riesgo. Con ella, λ y α se eligen por exactitud equilibrada. Se activa sola si un nivel es menos del 25 % de los registros y el dataset aún no tiene entrenamientos. No aplica a la correlación parcial.',
    formula: 'v_r = n / (k · n_nivel), con media 1',
    donde: 'Paso 3, casilla «Equilibrar los niveles del objetivo al aprender W».',
    ver: ['exactitud-equilibrada', 'desercion', 'recall'],
    claves: 'balancear balanceo desbalanceado pesos equilibrados',
  },
  esquema: {
    termino: 'Esquema',
    definicion:
      'Descripción de cómo se usa cada columna: rol, nombre visible, codificación, orden de las categorías y si es dinámica, además de cuál es el objetivo y el segmento. Al subir un archivo se sugiere uno a partir de los nombres de las columnas; «Sugerir con IA» pide otro a qwen2.5. Un esquema válido (sin errores) basta para explorar; uno confirmado (guardado) permite entrenar. Cada modelo conserva el esquema con el que se entrenó.',
    donde: 'Paso 2 (barra superior con el estado y los botones «Sugerir con IA», «Descartar cambios» y «Guardar esquema»).',
    ver: ['clasificacion', 'validacion-esquema', 'rol'],
    claves: 'schema configuracion columnas confirmado sugerido',
  },
  'estado-entrenamiento': {
    termino: 'Estado de un entrenamiento',
    definicion:
      'Listo: terminó y se puede usar. Entrenando: en curso. Con error: falló, y el mensaje explica por qué. Interrumpido: el servidor se detuvo mientras entrenaba; vuelva a entrenar. En la lista de Datos, el estado del dataset es «Esquema por revisar», «Entrenando…», «Modelo listo» o «Sin modelo».',
    donde: 'Paso 3 (lista «Entrenamientos») y Datos (columna «Estado»).',
    ver: ['modelo-activo'],
    claves: 'listo entrenando con error interrumpido',
  },
  estratificada: {
    termino: 'Estratificada',
    definicion:
      'Una división o una validación cruzada estratificada mantiene en cada parte la misma proporción de niveles del objetivo que en el total.',
    ver: ['division-agrupada', 'validacion-cruzada', 'pliegue'],
    claves: 'estratificacion',
  },
  estructura: {
    termino: 'Estructura del mapa',
    definicion:
      'Conjunto de aristas que pueden existir: de cada concepto fijo (sistema y acciones) hacia cada concepto dinámico, y entre conceptos dinámicos distintos, salvo desde el objetivo. Solo se aprenden los pesos de esas aristas, y la máscara causal puede quitar algunas. «Estructura aprendida» muestra los pesos resultantes.',
    donde: 'Paso 3 (máscara de dirección causal y sección «Estructura aprendida»).',
    ver: ['arista', 'mascara', 'w'],
  },
  'evolucion-ag': {
    termino: 'Evolución del algoritmo genético',
    definicion:
      'Panel de una prescripción individual que reproduce el historial real del AG, generación por generación, desde la población inicial (generación 0). «Reproducir», «Pausar», «Ir al final» y el control deslizante eligen la generación. Muestra el mejor costo, el costo medio, la activación del objetivo con el mejor individuo, la curva del costo hasta esa generación y, en barras, las acciones actuales frente a las mejores de esa generación; en la última, las prescritas. El AG de un estudiante tarda milisegundos: por eso se reproduce su historial en lugar de mostrarlo en vivo.',
    donde: 'Resultado de una prescripción individual: panel del estudiante y perfil de riesgo.',
    ver: ['convergencia-ag', 'generacion', 'funcion-costo', 'elitismo'],
    claves: 'fitness aptitud progreso generaciones reproducir',
  },
  exactitud: {
    termino: 'Exactitud',
    expansion: 'Accuracy',
    definicion:
      'Porcentaje de registros de prueba cuyo nivel predicho por el FCM coincide con el real. Compárela con la clase mayoritaria y con el bosque aleatorio.',
    donde: 'Paso 3 («Exactitud del FCM»), Resumen e Informe.',
    ver: ['exactitud-equilibrada', 'clase-mayoritaria', 'matriz-confusion'],
    claves: 'acierto',
  },
  'exactitud-equilibrada': {
    termino: 'Exactitud equilibrada',
    expansion: 'Balanced accuracy',
    definicion:
      'Media del recall de cada nivel: cuánto acierta el modelo dentro de cada nivel, con el mismo peso para todos. No se infla cuando un nivel es muy frecuente. Es el criterio de la validación cruzada cuando se equilibran los niveles.',
    donde: 'Paso 3 (dato «Exactitud equilibrada» y gráfica de selección con niveles equilibrados).',
    ver: ['recall', 'equilibrar', 'exactitud'],
  },
  excel: {
    termino: 'Excel',
    expansion: 'Archivos .xlsx, .xlsm y .xls',
    definicion:
      'Libro de hojas de cálculo. Al subirlo se lee la primera hoja con datos y se convierte a CSV; un aviso del reporte inicial indica qué hoja se usó.',
    donde: 'Paso 1, subida.',
    ver: ['csv'],
    claves: 'xlsx xls hoja de calculo',
  },
  excluida: {
    termino: 'Excluida',
    expansion: 'Rol de una columna',
    definicion:
      'Columna que no entra al mapa: identificadores, nombres, texto libre, columnas redundantes o columnas que revelan el objetivo.',
    donde: 'Paso 2, rol «Excluida».',
    ver: ['rol', 'fuga'],
    claves: 'excluir',
  },
  expertos: {
    termino: 'Matriz de expertos',
    definicion:
      'Método de W de García et al. (2025): cada experto da, en un CSV, el peso que cree que tiene cada arista (columnas origen, destino y peso, de −1 a 1). El FCM usa el consenso. No aprende de los datos ni tiene sesgo. Los nombres son los de las columnas (en una columna one-hot, «columna=categoría») y solo valen las aristas de la estructura.',
    donde: 'Paso 3, método «Matriz de expertos».',
    ver: ['consenso', 'estructura', 'w'],
    claves: 'experto csv conocimiento',
  },
  f1: {
    termino: 'F1 y F1 macro',
    definicion:
      'F1 combina la precisión y el recall de un nivel en una sola cifra (su media armónica). F1 macro es el promedio del F1 de todos los niveles, cada uno con el mismo peso.',
    formula: 'F1 = 2 · precisión · recall / (precisión + recall)',
    donde: 'Paso 3 (dato «F1 macro» y tabla «Por nivel»).',
    ver: ['precision', 'recall'],
  },
  frenos: {
    termino: 'Factores que frenan',
    definicion:
      'Conceptos mutables cuyo aporte al objetivo sigue siendo negativo con el plan (menor que −0,05): alejan del mejor nivel y el plan no los cambia porque no son acciones. El reporte nombra hasta tres, para orientar apoyos adicionales.',
    donde: 'Reporte prescriptivo de una prescripción individual.',
    ver: ['aporte', 'mutable', 'reporte-prescriptivo'],
    claves: 'factores del sistema',
  },
  fcm: {
    termino: 'FCM',
    expansion: 'Fuzzy Cognitive Map (mapa cognitivo difuso)',
    definicion:
      'Red de conceptos unidos por aristas con pesos entre −1 y 1. Cada concepto tiene una activación entre 0 y 1 y, en cada iteración, los conceptos dinámicos se recalculan con la regla de Kosko modificada a partir de los demás, hasta converger. Es interpretable: cada peso dice cuánto y en qué sentido influye un concepto en otro. Aquí el mapa se aprende de los datos.',
    donde: 'Toda la aplicación; el mapa interactivo está en el paso 3 y en el Resumen.',
    ver: ['kosko', 'w', 'concepto', 'prv-fcm'],
    claves: 'mapa cognitivo difuso fuzzy',
  },
  fecha: {
    termino: 'Fecha',
    expansion: 'Codificación',
    definicion:
      'Columna con fechas, como la fecha de alta de un cliente. El motor la convierte en un número que respeta el orden en el tiempo para poder normalizarla. No puede ser el objetivo.',
    donde: 'Paso 2, codificación «Fecha».',
    ver: ['codificacion'],
  },
  figuras: {
    termino: 'Figuras PNG',
    definicion:
      'Imágenes que se generan al entrenar con matplotlib: grafo del mapa, convergencia del AG, objetivo antes y después, matriz de pesos, acciones y selección de λ. Se descargan con el botón «PNG» para documentos o presentaciones.',
    donde: 'Informe.',
    ver: ['matplotlib', 'grafo'],
    claves: 'imagen descargar',
  },
  'filas-duplicadas': {
    termino: 'Filas duplicadas',
    definicion: 'Registros idénticos en todas las columnas. No se eliminan; el conteo sirve para detectar copias accidentales.',
    donde: 'Paso 1, «Dimensiones».',
    ver: ['registro'],
    claves: 'duplicados',
  },
  'filas-utiles': {
    termino: 'Filas útiles',
    definicion: 'Registros sin vacíos en las columnas que usa el esquema: los que entran al entrenamiento. Se necesitan al menos 30.',
    donde: 'Paso 2, barra superior («Esquema válido: N filas útiles»).',
    ver: ['celdas-vacias', 'validacion-esquema'],
  },
  fuga: {
    termino: 'Fuga de información',
    definicion:
      'Ocurre cuando una variable de entrada revela el objetivo: suele ser su definición o un dato posterior (por ejemplo, la nota final cuando «desertó» significa nota menor que 10). El modelo parecería perfecto, pero no serviría para prevenir. La aplicación avisa cuando una columna sola acierta el nivel del objetivo en el 99 % o más de los registros, y la excluye de la sugerencia automática.',
    donde: 'Avisos del reporte inicial y de la validación del esquema.',
    ver: ['excluida', 'validacion-esquema'],
    claves: 'leakage filtracion determina el objetivo',
  },
  'funcion-costo': {
    termino: 'Función de costo',
    expansion: 'Aptitud',
    definicion:
      'Lo que el algoritmo genético minimiza: la distancia entre la activación final del objetivo y la meta, más β por el cambio medio de las acciones (en la escala [0, 1]). Una prescripción de menor costo llega más cerca de la meta, con menos esfuerzo, o ambas cosas.',
    formula: 'costo(a) = |A*_T(a) − D_T| + β · media_k |a_k − a_k,actual|',
    donde: 'Paso 4, «Cómo decide el algoritmo genético».',
    ver: ['beta', 'a-t', 'd-t', 'convergencia-ag'],
    claves: 'costo fitness',
  },
  fuzzificacion: {
    termino: 'Fuzzificación Min-Max',
    definicion:
      'Conversión de cada valor codificado a una activación en [0, 1]: 0 es el mínimo observado y 1 el máximo. Al explorar se ajusta con todos los registros; al entrenar, solo con los de entrenamiento, para no filtrar información de la prueba.',
    formula: 'x′ = (x − mín) / (máx − mín)',
    donde: 'Paso 1, «Codificación y fuzzificación a [0, 1]».',
    ver: ['normalizado', 'codificacion'],
    claves: 'min max minmax normalizacion difuso',
  },
  generacion: {
    termino: 'Generación',
    definicion:
      'Una ronda del algoritmo genético: seleccionar padres, cruzarlos, mutar a las hijas y formar la nueva población. La generación 0 es la población inicial, antes del primer cruce: incluye las acciones actuales. «Generaciones medias del AG» es el promedio de generaciones que necesitó cada estudiante antes de detenerse (100 como máximo por defecto).',
    donde: 'Paso 3 (campo «Generaciones»), paso 4 y gráficas de convergencia (eje «Generación», desde 0).',
    ver: ['ag', 'parada-temprana', 'aptitud-normalizada'],
  },
  gradiente: {
    termino: 'Gradiente',
    definicion:
      'Indica cuánto y en qué dirección cambia el error al mover cada peso. BPTT lo calcula de forma exacta y el optimizador mueve los pesos en sentido contrario para reducir el error.',
    ver: ['bptt', 'lbfgsb'],
  },
  grafo: {
    termino: 'Grafo dirigido',
    definicion:
      'Dibujo del mapa como red de nodos y flechas. El grosor de cada arista es proporcional a la fuerza del peso y el color indica su signo: azul acerca al mejor nivel y rojo aleja. El del Informe se genera con NetworkX y matplotlib; el del paso 3 y el Resumen es interactivo.',
    donde: 'Informe («Grafo del mapa cognitivo»), paso 3 y Resumen.',
    ver: ['fcm', 'arista', 'matplotlib'],
    claves: 'red',
  },
  guardia: {
    termino: 'Guardia de tema',
    definicion:
      'Primer paso de cada respuesta del asistente: una consulta breve a qwen2.5 decide si la pregunta trata de rendimiento, deserción, el modelo o el uso de la aplicación. Si no, el asistente contesta con una frase fija y no consulta datos. Si la guardia falla, deja pasar la pregunta.',
    donde: 'Asistente («Revisando el tema de la pregunta…»).',
    ver: ['asistente'],
    claves: 'filtro fuera de tema',
  },
  herramientas: {
    termino: 'Herramientas del asistente',
    definicion:
      'Funciones con las que el asistente consulta los datos y el modelo en lugar de inventar cifras; hay 11. Cada consulta aparece sobre la respuesta como «Consultó: …», con una marca verde si funcionó o un aviso si falló. Varias muestran gráficas o tarjetas en la conversación.',
    donde: 'Asistente.',
    ver: ['asistente'],
    claves: 'tools consulto',
  },
  histograma: {
    termino: 'Histograma',
    definicion:
      'Gráfica de barras que cuenta cuántos registros caen en cada rango de valores. En «Una variable por nivel», cada barra se divide en los niveles del objetivo.',
    donde: 'Datos, pestaña «Relaciones entre variables».',
    ver: ['perfil-medio'],
  },
  ia: {
    termino: 'IA',
    expansion: 'Inteligencia artificial',
    definicion:
      '«Sugerir con IA», «Redactar con qwen2.5» y el Asistente usan el modelo de lenguaje qwen2.5, que corre en su equipo con Ollama. Parten de las cifras del modelo, pero es texto generado: revíselo antes de compartirlo.',
    ver: ['qwen', 'ollama', 'redaccion'],
    claves: 'inteligencia artificial llm modelo de lenguaje',
  },
  'id-estudiante': {
    termino: 'Id del estudiante',
    definicion:
      'Identificador de un registro: su fila en el archivo, empezando en 0 (la primera fila de datos, sin contar los encabezados). Sirve para cargar a un estudiante en el perfil de riesgo y para preguntarle al asistente por él.',
    donde: 'Registros, tabla por estudiante del paso 4, perfil de riesgo («Estudiante (fila)»), asistente y recomendaciones.csv.',
    ver: ['registro', 'recomendaciones-csv'],
    claves: 'fila numero estudiante',
  },
  inferencia: {
    termino: 'Inferencia del FCM',
    definicion:
      'Aplicar la regla de Kosko una y otra vez, a partir de un estado inicial, hasta que las activaciones se estabilizan. Los conceptos fijos toman los datos del estudiante. El objetivo parte de su media de entrenamiento (un valor neutro) en la evaluación y en el perfil de riesgo, y de su valor observado en el panel del estudiante; con un solo concepto dinámico y λ·k2 menor que 4 el estado final es el mismo. El resultado es el nivel que predice el FCM.',
    ver: ['kosko', 'convergencia', 'dinamico', 'inferencia-paso-a-paso'],
    claves: 'prediccion',
  },
  'inferencia-paso-a-paso': {
    termino: 'Inferencia paso a paso',
    definicion:
      'Gráfica con la activación del objetivo en cada iteración t de la regla de Kosko, desde t = 0 (el valor de partida) hasta el punto fijo: azul con las acciones actuales y naranja con las del simulador. Las bandas son las zonas de los niveles. Debajo, la cuenta de la iteración elegida: memoria k2·A(t−1), influencia de las acciones, influencia del resto de conceptos, sesgo k1·b (si el modelo lo tiene), entrada x y f(x). Las acciones quedan fijas, así que su influencia es la misma en todas las iteraciones, como el sesgo: cambiar una acción mueve la entrada del objetivo y la iteración lleva ese cambio hasta un nuevo punto fijo.',
    donde: 'Paso 4, panel del estudiante, bajo el simulador de acciones.',
    ver: ['inferencia', 'iteracion', 'memoria', 'simulador'],
    claves: 'trayectoria iteraciones what if kosko estabilizacion',
  },
  inmutable: {
    termino: 'Inmutable',
    expansion: 'Concepto del sistema (C_S)',
    definicion:
      'Rasgo que no cambia en el periodo analizado: edad, género, nacionalidad, curso, grado, semestre. Queda fijo en la inferencia y forma el perfil inmutable con el que se agrupan los registros. Sus pesos describen diferencias entre grupos, no causas. En los modelos sin sesgo (los entrenados antes de que la regla lo tuviera) suelen ser grandes porque hacen el papel del sesgo.',
    donde: 'Paso 2 (rol «Inmutable (C_S)»), mapa del FCM (puntos grises) y perfil de riesgo.',
    ver: ['c-s', 'perfil-inmutable', 'sesgo'],
  },
  intercepto: {
    termino: 'Intercepto',
    definicion:
      'Término constante de una regresión. En Ridge y Lasso, el intercepto c es el sesgo del concepto (b_i = tanh(c)) y no se penaliza. En un modelo sin sesgo, la regresión se ajusta sin intercepto.',
    ver: ['ridge', 'lasso', 'sesgo'],
  },
  iteracion: {
    termino: 'Iteración',
    definicion: 'Un paso de la regla de inferencia: todas las activaciones dinámicas se recalculan una vez a partir de las del paso anterior.',
    ver: ['inferencia', 'a-i'],
  },
  'l1-l2': {
    termino: 'L1 y L2',
    expansion: 'Tipos de penalización',
    definicion:
      'L2 suma los cuadrados de los pesos (‖w‖²) y los encoge sin anularlos; la usan BPTT y Ridge. L1 suma sus valores absolutos (‖w‖₁) y puede dejar pesos exactamente en 0; la usa Lasso.',
    ver: ['regularizacion', 'alfa'],
    claves: 'norma',
  },
  lbfgsb: {
    termino: 'L-BFGS-B',
    expansion: 'Limited-memory Broyden–Fletcher–Goldfarb–Shanno with Bounds',
    definicion:
      'Optimizador numérico que usa el gradiente y una aproximación de la curvatura que ocupa poca memoria; la «B» indica que respeta límites. Aquí mantiene cada peso entre −1 y 1 mientras BPTT reduce el error (hasta 500 iteraciones).',
    donde: 'Paso 3, descripción del método BPTT.',
    ver: ['bptt', 'gradiente'],
    claves: 'lbfgs optimizador',
  },
  lasso: {
    termino: 'Lasso',
    expansion: 'Regresión con penalización L1',
    definicion:
      'Método de W: una regresión lineal por concepto dinámico que explica el valor z con el que el dato observado del objetivo sería un punto fijo de la regla; su intercepto es el sesgo. La penalización L1 anula los pesos débiles y deja un mapa más simple. Los coeficientes se truncan a (−1, 1) con tanh. Es casi instantáneo; 76 % de exactitud en el dataset del proyecto.',
    formula: 'min ‖z − X·w − c‖² / (2n) + α·‖w‖₁,   w_ji = tanh(β_j),   b_i = tanh(c)',
    donde: 'Paso 3, método «Regresión Lasso».',
    ver: ['ridge', 'l1-l2', 'tanh', 'logit'],
    claves: 'regresion',
  },
  'ledoit-wolf': {
    termino: 'Ledoit-Wolf',
    expansion: 'Contracción de la covarianza',
    definicion:
      'Técnica que estabiliza la matriz de covarianzas mezclándola con una matriz más simple, para que su inversa no sea errática cuando hay variables muy correlacionadas o pocos datos. La usa la correlación parcial.',
    ver: ['correlacion-parcial', 'covarianza'],
    claves: 'contraccion shrinkage',
  },
  lilliefors: {
    termino: 'Prueba de Lilliefors',
    definicion:
      'Prueba de normalidad: una variante de Kolmogórov-Smirnov que estima la media y la desviación de los datos. En la validación del artículo decide qué prueba compara lo real con lo prescrito: si los dos grupos son normales, t de Student; si no, Wilcoxon.',
    donde: 'Informe, «Validación según el artículo» (Tabla 12).',
    ver: ['prueba-t-wilcoxon', 'reconstruccion'],
    claves: 'normalidad kolmogorov',
  },
  logit: {
    termino: 'Logit',
    definicion:
      'Inversa de la sigmoide: logit(y) = ln(y / (1 − y)). Ridge y Lasso la usan para calcular qué influencia necesita el objetivo para quedar en su valor observado. Como es infinita en 0 y en 1, antes se recorta el valor a [0,05; 0,95].',
    formula: 'z = (logit(y)/λ − k2·y) / k1',
    ver: ['sigmoide', 'ridge', 'lasso'],
  },
  mae: {
    termino: 'MAE',
    expansion: 'Mean Absolute Error (error absoluto medio)',
    definicion:
      'Promedio de las distancias entre la activación final del objetivo y la meta, en la escala [0, 1]. Menor es mejor. En la tabla de la validación cruzada es el error de la predicción respecto al valor real del objetivo.',
    formula: 'MAE = media |A*_T − D_T|',
    donde: 'Paso 4 (tabla de métricas) y paso 3 (tabla de la selección de λ).',
    ver: ['mse', 'rmse', 'psr'],
    claves: 'error absoluto medio',
  },
  'mapa-calor': {
    termino: 'Mapa de calor',
    definicion:
      'Tabla en la que el color de cada celda representa un valor entre −1 y 1: rojo para los negativos, gris cerca de 0 y azul para los positivos. Pase el cursor por una celda para leer el valor; con celdas grandes, el número se ve dentro.',
    donde: 'Datos («Correlaciones entre todas las variables») y paso 3 (matriz W).',
    ver: ['correlacion', 'w'],
    claves: 'heatmap',
  },
  mascara: {
    termino: 'Máscara de dirección causal',
    definicion:
      'Opción del paso 3 para quitar las aristas que considere lógicamente imposibles. Una arista excluida queda con peso 0 y los demás pesos se reajustan sin ella. El sesgo no es una arista: no se puede excluir. Con sesgo, quitar las aristas de los inmutables hacia el objetivo casi no cambia la exactitud (en el dataset del proyecto, BPTT sin C1-C8: 78,8 % frente a 78,9 %); en un modelo sin sesgo la bajaba mucho (57,1 %), porque esos pesos hacían el papel del sesgo.',
    donde: 'Paso 3, «Máscara de dirección causal (opcional)».',
    ver: ['arista', 'estructura', 'sesgo'],
    claves: 'causal excluir aristas',
  },
  matplotlib: {
    termino: 'Matplotlib y NetworkX',
    definicion:
      'Bibliotecas de Python del motor: matplotlib dibuja las figuras PNG del Informe y NetworkX organiza el mapa como grafo antes de dibujarlo.',
    donde: 'Informe.',
    ver: ['figuras', 'grafo'],
    claves: 'networkx python',
  },
  'matriz-confusion': {
    termino: 'Matriz de confusión',
    definicion:
      'Tabla que cruza el nivel real (filas) con el nivel que predice el FCM (columnas) en los registros de prueba. La diagonal son los aciertos; el tono de cada celda es el porcentaje de su fila, que se lee al pasar el cursor.',
    donde: 'Paso 3, «Calidad predictiva».',
    ver: ['exactitud', 'precision', 'recall'],
    claves: 'confusion',
  },
  'media-moda': {
    termino: 'Media y moda',
    definicion: 'La media es el promedio. La moda («más frecuente») es la categoría que más se repite; su frecuencia es cuántas veces aparece.',
    donde: 'Paso 1 (estadísticas descriptivas y columnas categóricas).',
    ver: ['cuartiles', 'desviacion'],
    claves: 'promedio mas frecuente',
  },
  medidor: {
    termino: 'Medidor',
    definicion:
      'Barra de 0 a 1 dividida en las zonas de los niveles del objetivo (tonos de azul, del peor al mejor); el punto oscuro marca la activación final. Cada zona termina a mitad de camino entre los valores de dos niveles.',
    donde: 'Panel del estudiante y resultado de una prescripción.',
    ver: ['a-t', 'nivel'],
  },
  'mejor-nivel': {
    termino: 'Mejor nivel y peor nivel',
    definicion:
      'Los extremos del orden del objetivo definido en el paso 2. El mejor nivel vale 1 en la escala normalizada y es la meta por defecto (con la meta escalonada, cada registro apunta antes al nivel siguiente al suyo); los registros de prueba que están en otros niveles reciben prescripción.',
    donde: 'Paso 2 (orden «Peor … Mejor»), paso 4 y gráficas.',
    ver: ['nivel', 'meta', 'meta-escalonada', 'tolerancia'],
  },
  memoria: {
    termino: 'Memoria',
    definicion:
      'Término k2·A_i(t) de la regla de Kosko modificada: cada concepto conserva parte de su estado previo. Por eso W no tiene autoconexiones.',
    ver: ['kosko', 'k1-k2'],
  },
  meta: {
    termino: 'Meta',
    expansion: 'Estado deseado del objetivo',
    definicion:
      'Nivel del objetivo al que se quiere llevar a un estudiante o perfil. Por defecto es el mejor nivel, o el siguiente al suyo con la meta escalonada; en el panel del estudiante y en el perfil de riesgo puede elegir uno intermedio como meta más realista. Se alcanza si la activación final queda a menos de la tolerancia del valor de ese nivel.',
    donde: 'Paso 4 («Meta (estado deseado del objetivo)» y «Meta en el objetivo»).',
    ver: ['d-t', 'tolerancia', 'mejor-nivel', 'meta-escalonada'],
    claves: 'estado deseado',
  },
  'meta-escalonada': {
    termino: 'Meta escalonada',
    definicion:
      'Cada registro apunta al nivel siguiente al suyo en vez de saltar al mejor: uno en L apunta a M y uno en M, a H. Así la meta es alcanzable con cambios moderados. Es la opción del perfil mejorado; el del artículo apunta siempre al mejor nivel. Con un objetivo de dos niveles no cambia nada, porque el siguiente ya es el mejor. La tasa de éxito cuenta a quien llega a su meta o a un nivel mejor; la probabilidad del mejor nivel según el bosque sigue midiendo el mejor nivel. En una prescripción individual, «Nivel siguiente (meta escalonada)» toma el siguiente al nivel observado del registro o, en un perfil, al que infiere el FCM.',
    formula: 'D_T = valor del nivel siguiente al observado;   éxito ⇔ nivel(A*_T) ≥ meta',
    donde:
      'Paso 3 (casilla «Meta escalonada»), paso 4 (frase principal, tabla de métricas, filtro «Llega a su meta», columna «Meta», gráfica antes y después, selector de meta), Resumen, Informe y Consulta.',
    ver: ['meta', 'mejor-nivel', 'psr', 'perfil-entrenamiento'],
    claves: 'escalonada nivel siguiente intermedia gradual L M H',
  },
  'modelo-activo': {
    termino: 'Modelo activo',
    definicion:
      'El entrenamiento terminado más reciente del dataset activo. Lo usan Resumen, Prescripciones, Informe y el Asistente. En el paso 3 puede ver en pantalla uno anterior, pero el activo sigue siendo el más reciente; para volver a uno anterior, elimine los posteriores.',
    donde: 'Paso 3, lista «Entrenamientos».',
    ver: ['estado-entrenamiento', 'dataset'],
  },
  monotona: {
    termino: 'Monótona',
    expansion: 'Relación monótona',
    definicion:
      'Relación en la que, cuando una variable sube, la otra siempre tiende a subir (o siempre a bajar), aunque no en línea recta. Spearman la detecta; Pearson solo mide la parte lineal.',
    ver: ['spearman', 'pearson'],
  },
  mse: {
    termino: 'MSE',
    expansion: 'Mean Squared Error (error cuadrático medio)',
    definicion:
      'Promedio de los cuadrados de las distancias entre la activación final del objetivo y la meta. Castiga más los errores grandes. Menor es mejor.',
    formula: 'MSE = media (A*_T − D_T)²',
    donde: 'Paso 4, tabla de métricas.',
    ver: ['mae', 'rmse'],
    claves: 'error cuadratico medio',
  },
  mutable: {
    termino: 'Mutable',
    expansion: 'Concepto del sistema (C_S)',
    definicion:
      'Estado del estudiante que cambia, pero no se controla directamente: ausencias, satisfacción, apoyo familiar. Por defecto conserva su valor observado; si se marca «Dinámico», el FCM lo recalcula. El algoritmo genético no lo cambia.',
    donde: 'Paso 2 (rol «Mutable (C_S)»), mapa del FCM (círculos huecos) y perfil de riesgo.',
    ver: ['c-s', 'dinamico', 'frenos'],
  },
  mutacion: {
    termino: 'Mutación y tasa de mutación',
    definicion:
      'Operador del algoritmo genético que suma a un gen un pequeño ruido aleatorio con distribución normal (gaussiana), con una desviación del 15 % del rango del gen, y recorta el resultado a sus límites. La tasa de mutación (0,25 por defecto) es la probabilidad de mutar cada gen.',
    donde: 'Paso 3, «Algoritmo genético y semilla».',
    ver: ['ag', 'cruce'],
    claves: 'gaussiana',
  },
  nivel: {
    termino: 'Nivel del objetivo',
    definicion:
      'Cada categoría ordenada del objetivo. Si el objetivo es ordinal, sus niveles son sus categorías en el orden del paso 2 (del peor al mejor), con valores repartidos de forma pareja entre 0 y 1. Si es numérico, se normaliza y se agrupa en Bajo (hasta 0,25), Medio (hasta 0,75) y Alto (más de 0,75).',
    donde: 'Toda la aplicación (etiquetas de color).',
    ver: ['mejor-nivel', 'nivel-predicho', 'objetivo'],
    claves: 'clase niveles bajo medio alto',
  },
  'nivel-observado': {
    termino: 'Nivel observado',
    definicion: 'Nivel real del objetivo de un registro, según el archivo.',
    donde: 'Paso 4 (filtro «Nivel observado» y columna «Observado») e Informe.',
    ver: ['nivel', 'nivel-predicho'],
  },
  'nivel-predicho': {
    termino: 'Nivel predicho',
    definicion:
      'Nivel que asigna el FCM: el nivel cuyo valor normalizado está más cerca de la activación final del objetivo. Con tres niveles (0; 0,5; 1), 0,7 es el nivel del medio y 0,8 el alto. El nivel prescrito es el que predice con las acciones recomendadas.',
    donde: 'Columnas «FCM actual» y «FCM prescrito» del paso 4, medidores y matriz de confusión.',
    ver: ['a-t', 'tolerancia', 'medidor'],
    claves: 'discretizacion nivel prescrito prediccion',
  },
  'nombre-visible': {
    termino: 'Nombre visible',
    definicion:
      'Nombre legible de una columna (por ejemplo «Horas de estudio» en lugar de `horas_estudio`). Lo usan las gráficas, los reportes y el asistente. Si lo deja vacío, se usa el nombre de la columna.',
    donde: 'Paso 2, columna «Nombre visible».',
    ver: ['esquema'],
  },
  nominal: {
    termino: 'Nominal con media del objetivo',
    expansion: 'Target encoding',
    definicion:
      'Codificación para categorías sin orden natural y con muchas opciones (nacionalidad, sección). Cada categoría se reemplaza por el promedio normalizado del objetivo en sus registros, suavizado hacia la media global cuando la categoría tiene pocos registros. Se ajusta solo con los datos de entrenamiento, para no filtrar el objetivo. Por construcción, estas variables quedan asociadas con el objetivo. No sirve para acciones.',
    formula: 'x = (n_c · media_c + 10 · media_global) / (n_c + 10)',
    donde: 'Paso 2, codificación «Nominal: media del objetivo».',
    ver: ['codificacion', 'one-hot', 'fuga'],
    claves: 'target encoding media suavizada',
  },
  'no-nulos': {
    termino: 'No nulos, vacíos y únicos',
    definicion: 'No nulos: celdas con valor. Vacíos: celdas sin valor, con su porcentaje. Únicos: cuántos valores distintos tiene la columna.',
    donde: 'Paso 1, «Tipos de datos y valores faltantes».',
    ver: ['celdas-vacias'],
    claves: 'nulos unicos distintos',
  },
  normalizado: {
    termino: 'Valor normalizado',
    definicion:
      'Valor llevado a la escala [0, 1] con Min-Max. Es la escala en que trabajan el FCM y el algoritmo genético; la aplicación lo traduce de vuelta a unidades originales para mostrar las recomendaciones.',
    donde: 'Paso 1 (datos normalizados), perfil medio de cada nivel y mapa de calor.',
    ver: ['fuzzificacion', 'unidades-originales'],
    claves: 'normalizacion escala',
  },
  numerica: {
    termino: 'Numérica',
    expansion: 'Codificación',
    definicion:
      'La columna ya es un número y solo pasa por Min-Max. Si tiene valores que no son números, la validación lo marca como error: use la codificación ordinal o la nominal.',
    donde: 'Paso 2, codificación «Numérica».',
    ver: ['codificacion', 'categorica'],
  },
  'numero-en-texto': {
    termino: 'Número en texto',
    expansion: 'Codificación',
    definicion: 'Extrae el número de etiquetas como «G-07» (grado 7) y lo trata como numérico. Todas las celdas deben contener al menos un dígito.',
    donde: 'Paso 2, codificación «Número en texto».',
    ver: ['codificacion'],
  },
  objetivo: {
    termino: 'Objetivo',
    expansion: 'Concepto objetivo (C_T)',
    definicion:
      'La métrica a mejorar: rendimiento, nota final, permanencia o deserción. Debe haber exactamente una columna objetivo, ordinal (ordenada del peor al mejor nivel) o numérica. Si es numérica y un valor menor es mejor (como un riesgo), marque «Un valor menor es mejor». Al menos un registro debe estar en el mejor nivel y al menos uno fuera de él.',
    donde: 'Paso 2 (rol «Objetivo (C_T)» y sección «Objetivo»).',
    ver: ['c-t', 'nivel', 'mejor-nivel'],
    claves: 'target resultado',
  },
  ollama: {
    termino: 'Ollama',
    definicion:
      'Programa que ejecuta modelos de lenguaje en su equipo. La aplicación lo usa (por defecto en http://127.0.0.1:11434) para el asistente, la sugerencia de esquema y las redacciones; nada sale a internet. Sin Ollama, todo lo demás funciona.',
    donde: 'Barra lateral, estado de los servicios.',
    ver: ['qwen', 'ia'],
  },
  'one-hot': {
    termino: 'One-hot',
    expansion: 'Codificación',
    definicion:
      'Convierte una columna nominal en un concepto 0/1 por categoría (por ejemplo «Asignatura: IT» y «Asignatura: Math»); cada registro activa solo el de su categoría. Así cada categoría tiene su propio peso. Solo se ofrece en conceptos del sistema y en columnas con hasta 30 categorías.',
    formula: 'Topic = IT → [IT: 1, Math: 0, …]',
    donde: 'Paso 2, codificación «Nominal: one-hot».',
    ver: ['codificacion', 'nominal', 'c-n'],
    claves: 'onehot indicador dummy',
  },
  ordinal: {
    termino: 'Ordinal',
    expansion: 'Label encoding',
    definicion:
      'Codificación para categorías con orden (bajo, medio, alto; no, sí): cada categoría toma su posición en el orden definido (0, 1, 2…) y luego pasa por Min-Max. El orden se ajusta con las flechas del paso 2, de menor a mayor, y debe incluir todas las categorías de los datos.',
    formula: '«Bajo», «Medio», «Alto» → 0, 1, 2 → 0; 0,5; 1',
    donde: 'Paso 2, codificación «Ordinal (label encoding)» y columna «Orden (menor a mayor) o categorías».',
    ver: ['codificacion', 'nivel'],
    claves: 'label encoding orden',
  },
  'parada-temprana': {
    termino: 'Parada temprana',
    expansion: 'Paciencia',
    definicion: 'El algoritmo genético se detiene antes del máximo de generaciones si el mejor costo no mejora durante 25 generaciones seguidas.',
    ver: ['generacion', 'convergencia-ag'],
    claves: 'early stopping',
  },
  pearson: {
    termino: 'Pearson',
    expansion: 'Correlación lineal',
    definicion: 'Mide cuánto se ajustan dos variables a una línea recta. Se calcula sobre los valores normalizados.',
    donde: 'Datos, mapa de calor de correlaciones (método «Pearson»).',
    ver: ['correlacion', 'spearman', 'monotona'],
  },
  'perfil-entrenamiento': {
    termino: 'Perfil de entrenamiento',
    definicion:
      '«Artículo» reproduce el protocolo de Hoyos, Aguilar y Toro (2023): PSO, sin sesgo, β = 0, sin tope por ausentismo, SMOTE, mutables dinámicos, 10 pliegues, aptitud de la Tabla 4, AG sin siembra de las acciones actuales y búsqueda de los parámetros del AG; la validación cruzada elige la regla de inferencia y la activación. «Mejorado» es lo que este proyecto validó: BPTT, Kosko modificada con sigmoide, sesgo, β = 0,4, tope por ausentismo y meta escalonada. Cada opción que usted cambie manda sobre el perfil; los valores exactos se leen del motor y se muestran junto al selector.',
    donde: 'Paso 3, «Perfil de entrenamiento».',
    ver: ['pso', 'regla-inferencia', 'smote', 'beta', 'sesgo', 'tope-ausentismo', 'meta-escalonada'],
    claves: 'articulo mejorado protocolo',
  },
  'perfil-inmutable': {
    termino: 'Perfil inmutable',
    definicion:
      'Combinación de los valores de todas las columnas inmutables de un registro. Los registros con el mismo perfil forman un grupo en la división agrupada y en la validación cruzada. Sin columnas inmutables, cada registro es su propio grupo.',
    ver: ['division-agrupada', 'perfiles-compartidos', 'inmutable'],
  },
  'perfil-medio': {
    termino: 'Perfil medio de cada nivel',
    definicion:
      'Media de cada variable normalizada dentro de cada nivel del objetivo. Si los puntos de los niveles quedan separados, la variable distingue a los estudiantes según su resultado. Arriba quedan las variables que más suben del peor al mejor nivel.',
    donde: 'Datos, «Cómo cambia cada variable entre niveles».',
    ver: ['normalizado', 'nivel'],
  },
  'perfil-riesgo': {
    termino: 'Perfil de riesgo',
    definicion:
      'Estado de un individuo, real o hipotético, que usted describe a mano para que el algoritmo genético calcule qué valores deben tomar las acciones para llegar a la meta. Puede partir del perfil típico o de un estudiante del archivo y editar cualquier valor.',
    donde: 'Paso 4, sección «Perfil de riesgo».',
    ver: ['perfil-tipico', 'meta', 'prescripcion'],
    claves: 'hipotetico escenario',
  },
  'perfil-tipico': {
    termino: 'Perfil típico',
    definicion: 'Punto de partida del perfil de riesgo: la mediana de cada columna numérica y la categoría más frecuente de las demás.',
    donde: 'Paso 4, botón «Perfil típico».',
    ver: ['perfil-riesgo', 'cuartiles', 'media-moda'],
  },
  'perfiles-compartidos': {
    termino: 'Perfiles compartidos',
    definicion:
      'Número de perfiles inmutables que aparecen a la vez en entrenamiento y en prueba. Con la división agrupada es 0; con la aleatoria indica cuánto se mezclan las partes.',
    donde: 'Paso 3, dato «Entrenamiento y prueba».',
    ver: ['perfil-inmutable', 'division-agrupada'],
  },
  'permitir-reducciones': {
    termino: 'Permitir reducciones',
    definicion:
      'Por defecto, el algoritmo genético solo puede mantener o aumentar cada acción. Si marca «Permitir recomendar valores menores que los actuales» (al entrenar) o «Permitir reducir acciones» (en el perfil de riesgo), también puede bajarlas. La prescripción del panel del estudiante usa la opción del entrenamiento.',
    donde: 'Paso 3 y perfil de riesgo del paso 4.',
    ver: ['accion', 'cambio-maximo'],
    claves: 'solo incrementos reducir disminuir',
  },
  peso: {
    termino: 'Peso',
    definicion:
      'Número entre −1 y 1 de una arista del mapa. Hacia el objetivo, positivo significa que aumentar ese concepto acerca al mejor nivel y negativo que aleja; el tamaño indica la fuerza. Es una asociación aprendida de los datos, no un efecto causal probado.',
    donde: 'Mapa del FCM, matriz W, «Todos los pesos hacia el objetivo» y Resumen («Qué más influye…»).',
    ver: ['w', 'arista', 'asociacion'],
    claves: 'peso causal influencia',
  },
  pizarra: {
    termino: 'Pizarra',
    definicion:
      'Nombre de esta aplicación: una interfaz web local (Node.js y React) sobre el motor PRV-FCM en Python, con un asistente que usa qwen2.5. Todo corre en su equipo.',
    ver: ['prv-fcm', 'asistente'],
  },
  plan: {
    termino: 'Plan moderado y plan máximo',
    definicion:
      'Dos prescripciones que el asistente muestra para un estudiante. El plan moderado usa β = 0,4, el valor por defecto, o el β del modelo si es mayor: cambios pequeños, preferibles para recomendar. El plan máximo usa β = 0,05 y busca el mayor efecto posible; sirve de techo. Con ausentismo alto, el tope por ausentismo limita a los dos.',
    donde: 'Tarjetas del asistente (columnas «Actual», «Moderado» y «Máximo»).',
    ver: ['beta', 'asistente', 'tope-ausentismo'],
  },
  pliegue: {
    termino: 'Pliegue',
    expansion: 'Fold',
    definicion: 'Cada parte en que la validación cruzada divide el conjunto de entrenamiento: se entrena con todas menos una, se evalúa con la restante y se rota.',
    ver: ['validacion-cruzada', 'estratificada'],
  },
  poblacion: {
    termino: 'Población',
    definicion:
      'Conjunto de soluciones candidatas del algoritmo genético en una generación: 50 por defecto (de 10 a 500). Desde el inicio incluye las acciones actuales del estudiante.',
    donde: 'Paso 3, campo «Población».',
    ver: ['ag', 'cromosoma', 'elitismo'],
  },
  precision: {
    termino: 'Precisión',
    definicion: 'De los registros que el FCM asigna a un nivel, porcentaje que de verdad está en ese nivel. Una precisión alta significa pocas falsas alarmas.',
    donde: 'Paso 3, tabla «Por nivel».',
    ver: ['recall', 'f1', 'matriz-confusion'],
  },
  prescripcion: {
    termino: 'Prescripción',
    definicion:
      'Recomendación de valores concretos para las acciones de un estudiante o de un perfil, calculada por el algoritmo genético con el FCM. Indica cuánto cambiar cada acción y el nivel que el FCM estima con ese cambio.',
    donde: 'Pasos 4 y 5.',
    ver: ['ag', 'reporte-prescriptivo', 'psr'],
    claves: 'recomendacion plan prescribir',
  },
  'prob-mejor': {
    termino: 'Probabilidad media del mejor nivel',
    definicion:
      'Promedio, entre los estudiantes prescritos, de la probabilidad que el bosque aleatorio asigna al mejor nivel, con sus acciones actuales y con las prescritas.',
    donde: 'Paso 4, descripción de la sección «Por estudiante».',
    ver: ['bosque', 'validacion-externa'],
  },
  'prv-fcm': {
    termino: 'PRV-FCM',
    expansion: 'PRescriptiVe Fuzzy Cognitive Maps (mapas cognitivos difusos prescriptivos)',
    definicion:
      'Método de Hoyos, Aguilar y Toro (2023) en el que se basa la aplicación: un FCM aprende cómo influyen las variables en un resultado y un algoritmo genético busca los cambios en las acciones que llevan a cada individuo al estado deseado.',
    ver: ['fcm', 'ag'],
    claves: 'prescriptivo metodo',
  },
  'prueba-t-wilcoxon': {
    termino: 'Pruebas t y de Wilcoxon',
    definicion:
      'Comparan, acción por acción, los valores reales con los prescritos en los mismos registros. La t de Student (⋆) supone que los datos son normales; la de Wilcoxon (†) no, porque usa rangos. Con p mayor que 0,05 no hay diferencia significativa: el modelo reproduce bien esa acción.',
    donde: 'Informe, Tabla 12.',
    ver: ['lilliefors', 'reconstruccion'],
    claves: 'p valor significancia student pareada rangos',
  },
  pso: {
    termino: 'PSO',
    expansion: 'Particle Swarm Optimization (optimización por enjambre de partículas)',
    definicion:
      'Método de W del artículo. Cada partícula es una matriz W completa; el enjambre se mueve hacia las mejores matrices que encontró cada partícula y todo el grupo, buscando el menor error entre el estado final del FCM y los datos. No usa el gradiente y es más lento que BPTT. El perfil «artículo» usa la ecuación 4 literal (ω = c1 = c2 = 1), que tiende a estancarse; con el perfil «mejorado» usa los coeficientes de Clerc.',
    donde: 'Paso 3, método «PSO (artículo)».',
    ver: ['bptt', 'perfil-entrenamiento', 'w'],
    claves: 'enjambre particulas swarm',
  },
  psr: {
    termino: 'Tasa de éxito prescriptivo',
    expansion: 'PSR en las métricas del motor',
    definicion:
      'Porcentaje de estudiantes prescritos cuya activación final del objetivo queda dentro de la tolerancia de la meta: los que el FCM ubica en el mejor nivel o, con la meta escalonada, en su meta o en un nivel mejor. Se calcula con las acciones actuales y con las prescritas; la diferencia es la mejora que el FCM atribuye a la prescripción. La cifra equivalente del bosque aleatorio es la estimación prudente.',
    formula: 'tasa de éxito = % de estudiantes con |A*_T − D_T| ≤ tolerancia',
    donde: 'Resumen, paso 4 («Tasa de éxito prescriptivo (FCM)»), Informe y asistente.',
    ver: ['tolerancia', 'bosque', 'mae', 'psr-ec19'],
    claves: 'exito prescriptivo tasa llega al mejor nivel llega a su meta',
  },
  'psr-ec19': {
    termino: 'PSR (ecuación 19)',
    expansion: 'Prescriptive Success Rate del artículo',
    definicion:
      'La PSR tal como la define la ecuación 19 de Hoyos, Aguilar y Toro (2023): un cociente entre lo que suman las acciones prescritas y lo que suman las reales en el conjunto de prueba. El artículo espera un valor menor que 1; si sale mayor, el Informe lo avisa y no lo recorta. No es la tasa de éxito prescriptivo de la aplicación, que cuenta cuántos estudiantes llegan a la meta según el FCM.',
    donde: 'Informe, «Validación según el artículo».',
    ver: ['psr', 'reconstruccion'],
    claves: 'ecuacion 19 articulo',
  },
  'punto-fijo': {
    termino: 'Punto fijo',
    definicion:
      'Estado en el que aplicar la regla de inferencia ya no cambia las activaciones; la inferencia converge a él. Ridge y Lasso buscan pesos con los que el valor observado del objetivo sea un punto fijo.',
    ver: ['convergencia', 'ridge'],
  },
  qwen: {
    termino: 'qwen2.5:7b',
    definicion:
      'Modelo de lenguaje abierto de Alibaba, de 7 mil millones de parámetros, que corre en su equipo con Ollama. Ocupa unos 5 GB de memoria. Una redacción tarda unos 15 segundos y una respuesta del asistente con consultas, de 5 a 10.',
    donde: 'Asistente, «Sugerir con IA» y «Redactar con qwen2.5».',
    ver: ['ollama', 'ia', 'asistente'],
    claves: 'modelo de lenguaje llm',
  },
  r2: {
    termino: 'R²',
    expansion: 'Coeficiente de determinación',
    definicion:
      'Qué parte de la variación de los valores reales explica lo prescrito: 1 es perfecto, 0 equivale a decir siempre la media, y es negativo si lo hace peor que la media.',
    formula: 'R² = 1 − Σ (y − ŷ)² / Σ (y − ȳ)²',
    donde: 'Informe, Tabla 11.',
    ver: ['mae', 'rmse', 'reconstruccion'],
    claves: 'r cuadrado determinacion',
  },
  rango: {
    termino: 'Rango',
    definicion:
      'Distancia entre el valor mínimo y el máximo observados de una variable. Los cambios de las acciones se expresan también como porcentaje de su rango.',
    donde: 'Paso 1 («Rango o valores»), columna «Del rango» y «Cambio máximo por acción».',
    ver: ['del-rango', 'cambio-maximo'],
  },
  recall: {
    termino: 'Recall',
    expansion: 'Sensibilidad',
    definicion:
      'De los registros que de verdad están en un nivel, porcentaje que el FCM detecta. En deserción, el recall del nivel «deserta» dice cuántos desertores encuentra el modelo.',
    donde: 'Paso 3, tabla «Por nivel».',
    ver: ['precision', 'exactitud-equilibrada', 'equilibrar'],
    claves: 'sensibilidad exhaustividad',
  },
  reconstruccion: {
    termino: 'Reconstrucción',
    expansion: 'Validación según el artículo',
    definicion:
      'Protocolo de evaluación del artículo: en el conjunto de prueba compara las acciones que prescribe el AG con las que había en los datos. Tabla 11: MAE, MSE, RMSE y R² por acción. Tabla 12: media ± DE real frente a prescrita y una prueba t o de Wilcoxon, según Lilliefors. Sin diferencia significativa, el modelo reproduce lo observado. Mide otra cosa que la tasa de éxito, que cuenta quién llega a la meta. Muchas combinaciones de acciones llevan al mismo estado, así que la prescripción no tiene por qué parecerse a lo observado.',
    donde: 'Informe, «Validación según el artículo». Falta en los modelos entrenados antes de esta versión.',
    ver: ['r2', 'prueba-t-wilcoxon', 'lilliefors', 'psr-ec19'],
    claves: 'tabla 11 tabla 12 real prescrito',
  },
  'recomendaciones-csv': {
    termino: 'Recomendaciones (CSV)',
    definicion:
      'Archivo descargable con una fila por estudiante prescrito: `id_estudiante`, nivel observado, valor actual, recomendado y cambio de cada acción, activación del objetivo antes y después, nivel con cada una y si alcanza el mejor nivel (`exito`).',
    donde: 'Informe, botón «Recomendaciones (CSV)».',
    ver: ['id-estudiante', 'prescripcion'],
    claves: 'descargar recomendaciones.csv',
  },
  redaccion: {
    termino: 'Redacción con IA',
    definicion:
      'Botón «Redactar con qwen2.5» que convierte una prescripción individual, o el resumen del Informe, en prácticas pedagógicas concretas. Parte de las cifras del modelo y, si el cambio es grande, propone metas intermedias. Es texto generado: revíselo antes de compartirlo. «Detener» la corta y «Redactar de nuevo» pide otra versión.',
    donde: 'Resultado de una prescripción individual e Informe («Recomendaciones institucionales con IA»).',
    ver: ['qwen', 'reporte-prescriptivo'],
    claves: 'redactar recomendacion',
  },
  registro: {
    termino: 'Registro',
    definicion: 'Una fila del archivo: un estudiante, un paciente o un cliente, según el dataset; en datasets expandidos, una variante de uno de ellos. El paso 2 define cómo se llama.',
    donde: 'Datos, pestaña «Registros».',
    ver: ['id-estudiante', 'sujeto'],
    claves: 'fila',
  },
  'regla-inferencia': {
    termino: 'Reglas de inferencia',
    definicion:
      'Cómo se actualiza cada concepto dinámico en cada iteración. Kosko: solo la suma ponderada de los demás. Kosko modificada: suma además su propia activación previa (memoria). Reescalada: pasa las activaciones a [−1, 1] con 2v − 1 antes de sumar, para que un concepto en 0 reste en lugar de no aportar. El perfil «mejorado» usa la modificada; el del artículo deja que la validación cruzada elija.',
    formula: 'Kosko: f(Σ_j≠i w_ji·v_j)   modificada: f(v_i + Σ w_ji·v_j)   reescalada: f((2v_i − 1) + Σ w_ji·(2v_j − 1))',
    donde: 'Paso 3, «Regla de inferencia».',
    ver: ['kosko', 'reescalada', 'activacion', 'tanh'],
    claves: 'kosko clasica modificada reescalada regla',
  },
  reescalada: {
    termino: 'Regla reescalada',
    definicion:
      'Regla de inferencia que usa 2v − 1 en lugar de v, de modo que las activaciones entran en la suma entre −1 y 1. Evita que los conceptos en 0 dejen de influir.',
    formula: 'A_i(t+1) = f( (2A_i(t) − 1) + Σ_j w_ji·(2A_j(t) − 1) )',
    donde: 'Paso 3, «Regla de inferencia».',
    ver: ['regla-inferencia', 'kosko'],
  },
  kosko: {
    termino: 'Regla de Kosko modificada',
    definicion:
      'Regla de inferencia del FCM, con memoria (Stylios y Groumpos, 2004): la nueva activación de cada concepto dinámico es la sigmoide de su activación previa (por k2) más la suma ponderada de las activaciones de los demás y el sesgo b_i del concepto (ambos por k1).',
    formula: 'A_i(t+1) = f( k2·A_i(t) + k1·(Σ_j w_ji·A_j(t) + b_i) )',
    donde: 'Paso 3, «Cómo se construye y se usa W».',
    ver: ['sigmoide', 'k1-k2', 'inferencia', 'sesgo', 'regla-inferencia'],
    claves: 'regla de inferencia',
  },
  regularizacion: {
    termino: 'Regularización',
    definicion: 'Penalización que se suma al error para preferir pesos pequeños o pocos pesos; reduce el sobreajuste. Su fuerza es α.',
    ver: ['alfa', 'l1-l2', 'sobreajuste'],
  },
  'reporte-inicial': {
    termino: 'Reporte inicial',
    definicion:
      'Primera pestaña de un dataset (paso 1): dimensiones, tipos de datos, vacíos, estadísticas descriptivas, categorías y la vista codificada y normalizada.',
    donde: 'Datos, pestaña «1. Reporte inicial».',
    ver: ['fuzzificacion', 'codificacion'],
  },
  'reporte-prescriptivo': {
    termino: 'Reporte prescriptivo',
    definicion:
      'Frases generadas con plantillas fijas a partir de los cambios que propone el algoritmo genético; cada cifra sale del modelo, sin IA. Dice qué acciones cambiar y cuánto, cuáles mantener, el resultado que estima el FCM, los factores que frenan y una nota de causalidad. En el Informe resume a todos los estudiantes prescritos.',
    donde: 'Resultado de una prescripción individual e Informe.',
    ver: ['frenos', 'redaccion', 'asociacion'],
    claves: 'frases lenguaje natural',
  },
  ridge: {
    termino: 'Ridge',
    expansion: 'Regresión con penalización L2',
    definicion:
      'Método de W: una regresión lineal por concepto dinámico que explica el valor z con el que el dato observado del objetivo sería un punto fijo de la regla; su intercepto es el sesgo. La penalización L2 encoge los pesos. Los coeficientes se truncan a (−1, 1) con tanh. Es casi instantáneo; 77 % de exactitud en el dataset del proyecto.',
    formula: 'min ‖z − X·w − c‖² + α·n·‖w‖²,   w_ji = tanh(β_j),   b_i = tanh(c)',
    donde: 'Paso 3, método «Regresión Ridge».',
    ver: ['lasso', 'l1-l2', 'tanh', 'logit', 'punto-fijo'],
    claves: 'regresion',
  },
  rmse: {
    termino: 'RMSE',
    expansion: 'Root Mean Squared Error (raíz del error cuadrático medio)',
    definicion: 'Raíz cuadrada del MSE: vuelve a la escala [0, 1] del objetivo y pesa más los errores grandes que el MAE. Menor es mejor.',
    formula: 'RMSE = √MSE',
    donde: 'Paso 4, tabla de métricas.',
    ver: ['mse', 'mae'],
    claves: 'raiz error cuadratico',
  },
  rol: {
    termino: 'Rol',
    definicion: 'Papel de una columna en el mapa: objetivo (C_T), acción (C_P), mutable o inmutable (C_S), o excluida.',
    donde: 'Paso 2, columna «Rol».',
    ver: ['objetivo', 'accion', 'mutable', 'inmutable', 'excluida'],
  },
  segmento: {
    termino: 'Segmento',
    expansion: 'Comparar por grupo',
    definicion:
      'Opción del paso 2 que separa los registros en dos grupos según el valor de una columna (por ejemplo, ausentismo «Above-7» frente al resto), para comparar el éxito de la prescripción entre ellos con el FCM y con el bosque aleatorio.',
    donde: 'Paso 2 («Comparar por grupo») y paso 4 («… que llegan a…, por grupo»).',
    ver: ['psr', 'bosque'],
    claves: 'grupo comparar',
  },
  seguimiento: {
    termino: 'Seguimiento',
    definicion:
      'Etapa 4, de retroalimentación, de García et al. (2025): tras aplicar un plan se registran las acciones aplicadas, el resultado observado y la fecha. Se guarda junto al modelo (seguimiento.jsonl) y se exporta a CSV. Por ahora no reentrena el modelo: queda pendiente.',
    donde: 'Consulta, «4. Seguimiento».',
    ver: ['consulta', 'prescripcion'],
    claves: 'retroalimentacion resultado observado registrar',
  },
  semilla: {
    termino: 'Semilla',
    definicion:
      'Número que fija el azar de la división, la validación cruzada, el algoritmo genético y el bosque aleatorio. Con la misma semilla y las mismas opciones, el entrenamiento da los mismos resultados; cambiarla muestra cuánto varían.',
    donde: 'Paso 3, «Algoritmo genético y semilla» (42 por defecto).',
    ver: ['entrenamiento-prueba'],
    claves: 'seed aleatoriedad reproducible',
  },
  sesgo: {
    termino: 'Sesgo',
    expansion: 'Bias, b_i',
    definicion:
      'Término constante que la regla de inferencia suma a la entrada de cada concepto dinámico, igual para todos los estudiantes. Equivale al peso de un concepto que siempre vale 1: si es negativo, el objetivo tiende al peor nivel antes de sumar las influencias; si es positivo, al mejor. Se aprende con los pesos y queda en [−1, 1]: BPTT lo optimiza junto con W, en Ridge y Lasso es el intercepto y con la correlación parcial vale 0. No es una variable ni una arista: el AG no lo cambia y la máscara no lo excluye. Los modelos entrenados antes de que la regla tuviera sesgo no lo tienen; en ellos, los pesos grandes de los inmutables hacían su papel.',
    formula: 'A_i(t+1) = f( k2·A_i(t) + k1·(Σ_j w_ji·A_j(t) + b_i) )',
    donde:
      'Paso 3 (dato «Método de W», mapa del FCM bajo el objetivo y su vista de tabla), paso 4 (cuenta de la inferencia paso a paso y gráfica «Qué empuja al objetivo») y contexto del asistente.',
    ver: ['kosko', 'intercepto', 'inmutable', 'aporte'],
    claves: 'bias b constante termino independiente',
  },
  sigmoide: {
    termino: 'Sigmoide',
    definicion: 'Función en forma de S que convierte cualquier número en un valor entre 0 y 1. Es la función de activación del FCM; λ controla su pendiente.',
    formula: 'f(x) = 1 / (1 + e^(−λx))',
    ver: ['lambda', 'kosko', 'logit'],
    claves: 'funcion de activacion f(x) logistica',
  },
  simulador: {
    termino: 'Simulador de acciones',
    definicion:
      'Controles deslizantes del panel del estudiante: al mover una acción, el FCM recalcula al instante el nivel con esos valores y la gráfica «Inferencia paso a paso» muestra cada iteración. No usa el algoritmo genético; «Restablecer» vuelve a las acciones actuales y «Probar en el simulador» carga las prescritas.',
    donde: 'Paso 4, panel del estudiante.',
    ver: ['inferencia', 'inferencia-paso-a-paso', 'prescripcion'],
    claves: 'simular escenario que pasaria si',
  },
  smote: {
    termino: 'SMOTE',
    expansion: 'Synthetic Minority Oversampling Technique',
    definicion:
      'Crea registros sintéticos de los niveles escasos interpolando entre vecinos cercanos del mismo nivel. Solo se aplica al conjunto de entrenamiento, después de dividir: si tocara la prueba, la evaluación mediría también registros inventados y la exactitud saldría inflada. Es una alternativa a equilibrar los niveles con pesos.',
    donde: 'Paso 3, «SMOTE en el entrenamiento».',
    ver: ['equilibrar', 'entrenamiento-prueba', 'fuga'],
    claves: 'sobremuestreo sinteticos desbalance',
  },
  sobreajuste: {
    termino: 'Sobreajuste',
    definicion:
      'Ocurre cuando un modelo aprende detalles del entrenamiento que no se repiten en datos nuevos: acierta mucho al entrenar y menos en la prueba. La regularización y la validación cruzada lo reducen.',
    ver: ['regularizacion', 'validacion-cruzada'],
    claves: 'overfitting',
  },
  soporte: {
    termino: 'Soporte',
    definicion:
      'Número de registros de prueba de cada nivel. Da contexto a la precisión, el recall y el F1: con pocos registros, esas cifras son inestables.',
    donde: 'Paso 3, tabla «Por nivel» (columna «Estudiantes»).',
    ver: ['precision', 'recall'],
  },
  spearman: {
    termino: 'Spearman',
    expansion: 'Correlación por rangos',
    definicion:
      'Correlación calculada sobre el orden de los valores: capta relaciones monótonas aunque no sean lineales y es poco sensible a valores extremos. Es la que se usa por defecto.',
    donde: 'Datos («Correlación de cada variable con…», mapa de calor y dispersión) y asistente.',
    ver: ['correlacion', 'pearson', 'monotona'],
  },
  sujeto: {
    termino: 'Sujeto',
    expansion: 'Cómo se llama cada registro',
    definicion:
      'Nombre de lo que representa cada fila del dataset, en singular y plural, y si es femenino. La interfaz y el asistente lo usan en sus textos («42 pacientes de prueba», «la persona 7»). Se guarda en el esquema y en cada modelo al entrenar. Sin él, la aplicación dice «registro»; con el esquema de xAPI, «estudiante».',
    donde: 'Paso 2, «Cómo se llama cada registro».',
    ver: ['registro', 'esquema'],
    claves: 'registro paciente cliente nombre singular plural femenino',
  },
  'tablero-clasificacion': {
    termino: 'Tablero de clasificación',
    definicion:
      'Cinco carriles (objetivo, acciones, mutables, inmutables y excluidas) con una tarjeta por columna. Arrastre una tarjeta a otro carril para cambiar su rol, o enfóquela y use las flechas izquierda y derecha. Sigue las mismas reglas que el selector de rol de la tabla: al llevar una columna al objetivo, el objetivo anterior pasa a inmutable.',
    donde: 'Paso 2, sobre la tabla de columnas.',
    ver: ['rol', 'clasificacion'],
    claves: 'arrastrar soltar drag drop carriles',
  },
  tanh: {
    termino: 'Tanh',
    expansion: 'Tangente hiperbólica',
    definicion:
      'Función que lleva cualquier número al intervalo (−1, 1). Trunca los coeficientes de Ridge y Lasso al rango de un peso y, como función de activación, se reescala a (0, 1) para que la activación siga entre 0 y 1.',
    formula: 'w_ji = tanh(β_j) ∈ (−1, 1);   activación: f(x) = (tanh(λx) + 1) / 2',
    ver: ['ridge', 'lasso', 'intervalos', 'regla-inferencia'],
    claves: 'tangente hiperbolica truncamiento',
  },
  'tipo-pandas': {
    termino: 'Tipo (pandas)',
    definicion:
      'Tipo de dato que detecta pandas, la biblioteca de Python que lee el archivo: `int64` (enteros), `float64` (decimales), `object` (texto) o `bool` (verdadero o falso).',
    donde: 'Paso 1, tabla «Tipos de datos y valores faltantes».',
    ver: ['categorica'],
    claves: 'pandas dtype',
  },
  tolerancia: {
    termino: 'Tolerancia de éxito',
    definicion:
      'Distancia a la meta que todavía cuenta como éxito: la mitad del salto entre el mejor nivel y el anterior. Con tres niveles (0; 0,5; 1) es 0,25, así que una activación final de 0,75 o más cuenta como mejor nivel. Es la línea horizontal de la gráfica «Activación del objetivo antes y después de prescribir».',
    formula: 'tolerancia = (1 − valor del nivel anterior al mejor) / 2',
    donde: 'Paso 4 y resultado de una prescripción («activación … ± …»).',
    ver: ['psr', 'meta', 'nivel-predicho'],
    claves: 'umbral exito',
  },
  'tope-ausentismo': {
    termino: 'Tope por ausentismo',
    definicion:
      'Restricción del algoritmo genético: si el estudiante tiene ausentismo alto, cada acción solo puede subir hasta un 15 % de su rango sobre su valor actual. Con muchas ausencias, los datos casi no registran el mejor nivel, y sin tope el FCM prometía alcanzarlo con planes que el bosque aleatorio no confirmaba. Se activa cuando la columna `StudentAbsenceDays` existe en el esquema y el estudiante está en la mitad alta de su escala (en xAPI, Above-7); en otros datasets no aplica. Si además hay un cambio máximo por acción, vale el más estricto.',
    donde: 'Paso 4: aviso en el resultado de la prescripción de un estudiante o de un perfil de riesgo; tarjetas y respuestas del asistente.',
    ver: ['cambio-maximo', 'beta', 'plan'],
    claves: 'restriccion ausencias absence above-7 limite condicion',
  },
  torneo: {
    termino: 'Torneo',
    expansion: 'Selección por torneo',
    definicion: 'Forma de elegir a los padres en el algoritmo genético: se toman 3 soluciones al azar y gana la de menor costo.',
    ver: ['ag', 'cruce'],
    claves: 'seleccion',
  },
  'true-false': {
    termino: 'True y False',
    expansion: 'Columnas booleanas',
    definicion:
      'Columnas con valores verdadero o falso. Se tratan como categorías de texto «True» y «False», no como 0 y 1; para usarlas como acción u objetivo, defina su orden en el paso 2.',
    ver: ['categorica', 'ordinal'],
    claves: 'booleano verdadero falso',
  },
  uci: {
    termino: 'UCI',
    expansion: 'Repositorio de aprendizaje automático de la Universidad de California en Irvine',
    definicion:
      'Repositorio público de datasets. Además del dataset del proyecto, la aplicación se probó con «Predict Students\' Dropout and Academic Success» (4424 estudiantes) y con un dataset de deserción derivado de UCI.',
    ver: ['dataset-proyecto', 'desercion'],
  },
  'unidades-originales': {
    termino: 'Unidades originales',
    definicion:
      'Valores en la escala del archivo (por ejemplo, número de manos levantadas de 0 a 100), sin normalizar. Las recomendaciones se muestran en estas unidades.',
    ver: ['normalizado', 'cambio'],
  },
  'validacion-cruzada': {
    termino: 'Validación cruzada',
    expansion: 'CV, del inglés cross-validation',
    definicion:
      'Forma de elegir λ y α sin usar la prueba. El entrenamiento se divide en pliegues estratificados y agrupados por perfil; para cada combinación de λ y α se entrena con todos los pliegues menos uno y se mide con el restante, rotando. Gana la de mayor exactitud media (o exactitud equilibrada, si se equilibran los niveles) y, a igualdad, la de menor MAE. Completa: 6 valores de λ y 3 de α con 5 pliegues. Rápida: λ de 0,5; 1 y 2 con α = 0,001 y 3 pliegues. Sin validación: λ = 1 y α = 0,001.',
    donde: 'Paso 3 («Selección de λ y α», gráfica «Selección de λ por validación cruzada» y etapa «Validación cruzada» del progreso).',
    ver: ['pliegue', 'lambda', 'alfa', 'exactitud-equilibrada'],
    claves: 'cv cross validation seleccion de hiperparametros',
  },
  'validacion-esquema': {
    termino: 'Validación del esquema',
    definicion:
      'Comprobación automática del esquema contra los datos mientras lo edita. Los errores impiden guardar: falta el objetivo, no hay acciones, una acción es nominal, hay valores no numéricos en una columna numérica, faltan categorías en un orden, quedan menos de 30 filas útiles o ningún registro está en el mejor nivel. Los avisos no lo impiden: filas que se descartarán, niveles con menos de 20 registros o columnas que determinan el objetivo.',
    donde: 'Paso 2, barra superior.',
    ver: ['esquema', 'fuga', 'filas-utiles'],
    claves: 'errores avisos problemas',
  },
  'validacion-externa': {
    termino: 'Validación externa',
    definicion:
      'Comprobación de las prescripciones con un modelo independiente, el bosque aleatorio, para no depender solo del FCM que las generó: se le pasan los mismos estudiantes con sus acciones actuales y con las prescritas, y se cuenta cuántos clasifica en el mejor nivel (con la meta escalonada, en su meta o en uno mejor).',
    donde: 'Paso 4 y Resumen.',
    ver: ['bosque', 'psr', 'prob-mejor'],
  },
  xapi: {
    termino: 'xAPI',
    expansion: 'Experience API',
    definicion:
      'Estándar para registrar actividades de aprendizaje en plataformas en línea. Da nombre al dataset del proyecto, xAPI-Edu-Data, que reúne la participación de estudiantes en una plataforma educativa.',
    ver: ['dataset-proyecto'],
    claves: 'xapi-edu-data',
  },
} satisfies Record<string, Entrada>;

export type IdTermino = keyof typeof GLOSARIO;

export interface EntradaGlosario extends Entrada {
  id: IdTermino;
}

export const ENTRADAS: EntradaGlosario[] = Object.entries(GLOSARIO).map(([id, entrada]) => ({ id: id as IdTermino, ...entrada }));

/** Minúsculas y sin tildes. Conserva la longitud del texto (en NFC), así sus posiciones sirven en el original. */
export function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Grupos del índice: los símbolos primero, en su orden; luego cada letra, en orden alfabético. */
export function gruposGlosario() {
  const simbolos = ENTRADAS.filter((e) => e.simbolo);
  const letras = new Map<string, EntradaGlosario[]>();
  for (const e of ENTRADAS.filter((x) => !x.simbolo).sort((a, b) => a.termino.localeCompare(b.termino, 'es', { sensitivity: 'base' }))) {
    const letra = normalizar(e.termino)[0].toUpperCase();
    letras.set(letra, [...(letras.get(letra) ?? []), e]);
  }
  return [{ clave: 'simbolos', titulo: 'Símbolos y notación', entradas: simbolos }, ...[...letras].map(([letra, entradas]) => ({ clave: letra.toLowerCase(), titulo: letra, entradas }))];
}

/** Entradas que contienen la consulta: primero las que empiezan por ella, luego por nombre y al final por definición. */
export function buscarEnGlosario(consulta: string): EntradaGlosario[] {
  const q = normalizar(consulta.trim());
  if (!q) return [];
  const puntuadas: { entrada: EntradaGlosario; puntaje: number }[] = [];
  for (const entrada of ENTRADAS) {
    const termino = normalizar(entrada.termino);
    const nombres = normalizar(`${entrada.termino} ${entrada.expansion ?? ''} ${entrada.claves ?? ''}`);
    const resto = normalizar(`${entrada.definicion} ${entrada.formula ?? ''} ${entrada.donde ?? ''}`);
    const puntaje = termino.startsWith(q) ? 0 : nombres.includes(q) ? 1 : resto.includes(q) ? 2 : null;
    if (puntaje !== null) puntuadas.push({ entrada, puntaje });
  }
  return puntuadas
    .sort((a, b) => a.puntaje - b.puntaje || a.entrada.termino.localeCompare(b.entrada.termino, 'es', { sensitivity: 'base' }))
    .map((p) => p.entrada);
}
