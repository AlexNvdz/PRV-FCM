// Tipos de la API local (server/). Los nombres siguen el JSON del motor Python.

export type Rol = 'inmutable' | 'accion' | 'mutable' | 'objetivo' | 'excluir';
export type Codificacion = 'numerica' | 'ordinal' | 'nominal' | 'one_hot' | 'numero_en_texto' | 'fecha';
export type MetodoPesos = 'bptt' | 'ridge' | 'lasso' | 'correlacion_parcial' | 'pso' | 'expertos';
/** «articulo»: el protocolo exacto de los artículos base; «mejorado»: sesgo, β = 0.4 y tope por ausentismo. */
export type PerfilModelo = 'articulo' | 'mejorado';
export type ReglaInferencia = 'kosko' | 'kosko_modificada' | 'reescalada';
export type Activacion = 'sigmoide' | 'tanh';
export type MetodoCorrelacion = 'spearman' | 'pearson' | 'parcial';

export interface ColumnaEsquema {
  columna: string;
  rol: Rol;
  codificacion?: Codificacion;
  orden?: string[];
  categorias?: string[];
  id?: string;
  nombre?: string;
  dinamico?: boolean;
}

export interface Segmento {
  columna: string;
  valor: string;
  nombre_si: string;
  nombre_no: string;
}

/** Cómo se llama cada registro del dataset en los textos; `femenino` decide los artículos. */
export interface Sujeto {
  singular: string;
  plural: string;
  femenino: boolean;
}

export const SUJETO_POR_DEFECTO: Sujeto = { singular: 'registro', plural: 'registros', femenino: false };

export interface Esquema {
  nombre?: string;
  sujeto?: Sujeto;
  objetivo: string | null;
  invertir_objetivo?: boolean;
  niveles?: Record<string, number>;
  columnas: ColumnaEsquema[];
  segmento?: Segmento | null;
}

export interface Validacion {
  ok: boolean;
  errores: string[];
  avisos: string[];
  filas_utiles: number;
  /** Sujeto del esquema ya resuelto por el motor (xAPI: estudiante). */
  sujeto?: Sujeto;
}

export interface PerfilColumna {
  columna: string;
  tipo_dato: 'numerico' | 'categorico';
  dtype?: string;
  no_nulos?: number;
  unicos: number;
  faltantes: number;
  ejemplos: string[];
  min?: number;
  max?: number;
  media?: number;
  desviacion?: number;
  q1?: number;
  mediana?: number;
  q3?: number;
  moda?: string;
  frecuencia_moda?: number;
  categorias?: { valor: string; n: number }[];
  sugerencia: { codificacion: Codificacion; orden?: string[] };
}

export interface Perfil {
  filas: number;
  columnas: number;
  duplicados: number;
  celdas_vacias?: number;
  filas_con_vacios?: number;
  numericas?: number;
  categoricas?: number;
  perfil: PerfilColumna[];
  esquema_sugerido: Esquema;
  avisos: string[];
}

export type EventoMotor =
  | { evento: 'etapa'; etapa: string; mensaje: string }
  | { evento: 'progreso'; tarea: 'validacion_cruzada' | 'busqueda_ag' | 'prescripcion' | 'reconstruccion'; hechos: number; total: number }
  | { evento: 'fin'; mensaje: string }
  | { evento: 'error'; mensaje: string };

/** Concepto del mapa tal como lo describe el motor (one-hot: un concepto por categoría). */
export interface ConceptoMotor {
  id: string;
  columna: string;
  nombre: string;
  rol: Exclude<Rol, 'excluir'>;
  codificacion: Codificacion;
  origen: string;
}

export interface Normalizados {
  total: number;
  conceptos: (ConceptoMotor & { min: number; max: number; media: number })[];
  filas: ({ id: number; nivel: string } & Record<string, number | string>)[];
}

export interface Correlaciones {
  metodo: MetodoCorrelacion;
  n: number;
  conceptos: ConceptoMotor[];
  matriz: (number | null)[][];
}

export interface EjeDispersion {
  columna: string;
  nombre: string;
  id: string;
  codificacion: Codificacion;
  tipo: 'numerico' | 'categorico';
  categorias?: string[];
}

export interface Dispersion {
  x: EjeDispersion;
  y: EjeDispersion;
  correlacion: number | null;
  n: number;
  niveles: string[];
  puntos: { id: number; x: number; y: number; nivel: string }[];
}

export interface Estructura {
  conceptos: { id: string; columna: string; nombre: string; rol: Exclude<Rol, 'excluir'>; dinamico: boolean }[];
  aristas: { origen: string; destino: string }[];
}

export type EstadoModelo = 'en_curso' | 'listo' | 'error' | 'interrumpido';

export interface ModeloMeta {
  id: string;
  datasetId: string;
  creado: string;
  estado: EstadoModelo;
  opciones: Record<string, unknown>;
  eventos: EventoMotor[];
  error?: string;
  duracionMs?: number;
}

export interface DatasetResumen {
  id: string;
  nombre: string;
  creado: string;
  ejemplo: boolean;
  archivo?: string;
  filas?: number;
  columnas?: number;
  esquema: Esquema | null;
  esquemaConfirmado: boolean;
  validacion?: Validacion;
  modeloActivo: string | null;
  ultimoModelo: { id: string; estado: EstadoModelo; creado: string } | null;
}

export interface Dataset extends Omit<DatasetResumen, 'ultimoModelo'> {
  perfil?: Perfil;
  modelos: ModeloMeta[];
}

export interface PorClase {
  precision: number;
  recall: number;
  F1: number;
  soporte: number;
}

export interface FilaSeleccion {
  lambda: number;
  alpha_l2: number;
  exactitud: number;
  exactitud_de: number | null;
  MAE: number;
  /** Solo con niveles equilibrados: media del recall de cada nivel, el criterio de elección. */
  exactitud_equilibrada?: number;
}

export interface Metricas {
  configuracion: {
    datos: string;
    n_registros: number;
    division: string;
    proporcion_prueba: number;
    n_entrenamiento: number;
    n_prueba: number;
    perfiles_compartidos: number;
    semilla: number;
    /** `sesgo` falta en modelos entrenados antes de que la regla tuviera sesgo (equivale a false). */
    fcm: {
      lambda_: number;
      alpha_l2: number;
      metodo_pesos?: MetodoPesos;
      balancear_niveles?: boolean;
      sesgo?: boolean;
      inferencia?: ReglaInferencia;
      activacion?: Activacion;
      coef_memoria?: number;
      coef_influencia?: number;
    };
    /** Falta en modelos anteriores a los perfiles (equivale a «mejorado»). */
    perfil?: PerfilModelo;
    ag: Record<string, number | string>;
    prescripcion: {
      beta_esfuerzo: number;
      delta_max: number | null;
      tolerancia_exito: number;
      clases_a_prescribir: string[];
      /** Tope de las acciones por ausentismo: columna que lo activa (null = desactivado) y cambio máximo en [0, 1]. Faltan en modelos antiguos. */
      condicion_columna?: string | null;
      condicion_delta_max?: number;
    };
    mutables_dinamicos: string[];
    aristas_excluidas?: [string, string][];
  };
  seleccion_hiperparametros: FilaSeleccion[] | null;
  prediccion_fcm: {
    exactitud_rendimiento: number;
    exactitud_clase_mayoritaria: number;
    F1_macro: number;
    por_clase: Record<string, PorClase>;
    matriz_confusion: Record<string, Record<string, number>>;
    iteraciones_inferencia: number;
    convergio: boolean;
  };
  prescripcion: {
    n_estudiantes: number;
    MAE: number;
    MSE: number;
    RMSE: number;
    PSR: number;
    MAE_base: number;
    MSE_base: number;
    RMSE_base: number;
    PSR_base: number;
    cambio_medio_por_accion: number;
    generaciones_medias_ag: number;
  };
  exito_por_segmento: Record<string, { n: number; PSR_base: number; PSR: number }>;
  /** Validación del artículo (Tablas 11 y 12): qué tan cerca quedan las acciones prescritas de las reales. Falta en modelos viejos. */
  reconstruccion?: Reconstruccion;
  validacion_externa: {
    exactitud_prueba: number;
    PSR_externo_base: number;
    PSR_externo: number;
    prob_H_base: number;
    prob_H_prescrita: number;
    por_segmento: Record<string, { n: number; PSR_externo_base: number; PSR_externo: number }>;
  };
}

export interface MetricasError {
  mae: number;
  mse: number;
  rmse: number;
  r2: number | null;
}

export interface Reconstruccion {
  n: number;
  /** psr_ec19: PSR de la ecuación 19 del artículo. */
  global: MetricasError & { psr_ec19: number };
  por_accion: (MetricasError & {
    columna: string;
    nombre: string;
    media_real: number;
    de_real: number;
    media_prescrita: number;
    de_prescrita: number;
    /** Normalidad por Lilliefors en cada grupo; decide la prueba. */
    normal_real: boolean;
    normal_prescrita: boolean;
    /** null solo con menos de 3 registros. */
    prueba: 't' | 'wilcoxon' | null;
    p: number | null;
  })[];
  /** Advertencias del motor, por ejemplo una PSR ec. 19 mayor que 1 (no se recorta). */
  avisos?: string[];
}

export interface ConceptoGrafo {
  id: string;
  columna: string;
  nombre: string;
  rol: Exclude<Rol, 'excluir'>;
  dinamico: boolean;
  codificacion: Codificacion;
  /** Sesgo b_i de la regla (0 en los conceptos fijos). Falta en modelos antiguos. */
  sesgo?: number;
}

export interface Influencia extends ConceptoGrafo {
  peso: number;
}

export interface AccionInfo {
  id: string;
  columna: string;
  nombre: string;
  codificacion: Codificacion;
  min: number;
  max: number;
  categorias?: string[];
}

export interface Graficas {
  convergencia: { generacion: number[]; q1: number[]; mediana: number[]; q3: number[] };
  antes_despues: { id: number; base: number; prescrito: number }[];
  acciones: { id: string; columna: string; nombre: string; actual_media: number; recomendada_media: number; min: number; max: number }[];
  umbral_mejor: number;
  objetivo: string;
  niveles: Record<string, number>;
  mejor_nivel: string;
  conceptos: ConceptoGrafo[];
  aristas: { origen: string; destino: string; peso: number }[];
  influencias: Influencia[];
  acciones_info: AccionInfo[];
  metodo_pesos?: MetodoPesos;
  /** Si la regla del modelo tiene sesgo. Falta en modelos antiguos (equivale a false). */
  sesgo?: boolean;
  aristas_excluidas?: [string, string][];
  figuras?: string[];
  sujeto?: Sujeto;
}

export interface ModeloDetalle extends ModeloMeta {
  enCurso: boolean;
  metricas?: Metricas;
  graficas?: Graficas;
  esquema?: Esquema;
  /** Siempre resuelto en un modelo listo (los antiguos de xAPI: estudiante). */
  sujeto?: Sujeto;
}

export interface EstadisticaVariable {
  columna: string;
  id: string;
  nombre: string;
  rol: Rol;
  codificacion: Codificacion;
  correlacion: number | null;
  resumen?: { media: number; mediana: number; min: number; max: number };
  por_nivel?: { nivel: string; n: number; media: number | null; mediana: number | null; q1: number | null; q3: number | null }[];
  histograma?: { bordes: number[]; conteos: Record<string, number[]> };
  categorias?: { categoria: string; n: number; por_nivel: Record<string, number> }[];
}

export interface Estadisticas {
  filas: number;
  objetivo: { columna: string; mejor_nivel: string; niveles: { etiqueta: string; valor: number; n: number }[] };
  variables: EstadisticaVariable[];
  perfil_niveles?: (ConceptoMotor & { medias: Record<string, number | null> })[];
}

export interface PaginaFilas {
  total: number;
  columnas: string[];
  filas: Record<string, string | number | boolean | null>[];
}

/** Una iteración de la regla de Kosko para el objetivo: A_o(t) = f(memoria + influencia + sesgo), con A(t−1). */
export interface PasoInferencia {
  t: number;
  memoria: number;
  influencia: number;
  /** Parte de la influencia que aportan las acciones (constante: las acciones quedan fijas). */
  influencia_acciones: number;
  /** k1·b_o, constante en todas las iteraciones (0 sin sesgo). */
  sesgo: number;
  entrada: number;
  activacion: number;
}

/** Cómo llegó el FCM a su estado final (PredictorFCM.paso_a_paso). */
export interface Inferencia {
  iteraciones: number;
  convergio: boolean;
  /** `sesgo` es b_o, el sesgo del objetivo. */
  parametros: { lambda: number; k1: number; k2: number; tolerancia: number; sesgo: number; inferencia?: ReglaInferencia; activacion?: Activacion };
  /** Activación de cada concepto dinámico en t = 0..T; el objetivo primero. */
  series: { id: string; columna: string; nombre: string; rol: Exclude<Rol, 'excluir'>; valores: number[] }[];
  pasos: PasoInferencia[];
}

export interface EstadoPrediccion {
  activacion: number;
  nivel: string;
  exito: boolean;
  dinamicos: Record<string, number>;
  inferencia?: Inferencia;
}

export interface ValorOriginal {
  valor: number;
  categoria?: string;
}

export interface Estudiante {
  id: number;
  registro: Record<string, string | number | null>;
  nivel_observado: string | null;
  en_prueba?: boolean;
  prediccion?: EstadoPrediccion;
  acciones?: (AccionInfo & { actual: ValorOriginal })[];
}

export interface Simulacion {
  acciones: { columna: string; actual: ValorOriginal; simulada: ValorOriginal }[];
  base: EstadoPrediccion;
  simulado: EstadoPrediccion;
}

export interface ReporteIndividual {
  texto: string;
  plan: string;
  acciones: string[];
  mantener: string[];
  resultado: string;
  frenos: string;
  alcanza_meta: boolean;
  nota: string;
}

export interface Contribucion {
  id: string;
  columna: string;
  nombre: string;
  rol: Exclude<Rol, 'excluir'>;
  peso: number;
  activacion_base: number;
  activacion_prescrita: number;
  aporte_base: number;
  aporte_prescrito: number;
}

export interface Prescripcion {
  acciones: {
    columna: string;
    id: string;
    nombre: string;
    actual: ValorOriginal;
    recomendada: ValorOriginal;
    cambio: number;
    min?: number;
    max?: number;
    codificacion?: Codificacion;
    categorias?: string[];
  }[];
  base: EstadoPrediccion;
  prescrito: EstadoPrediccion;
  meta?: { valor: number; nivel: string; tolerancia: number };
  costo: number;
  generaciones: number;
  /** Por generación del AG: mejor costo, costo medio, activación del objetivo y mejores acciones (en el orden de `acciones`). */
  historial?: { mejor: number[]; promedio: number[]; activacion?: number[]; acciones?: number[][] };
  contribuciones?: Contribucion[];
  /** k1·b_o: aporte constante del sesgo a la entrada del objetivo, en las unidades de las contribuciones (0 sin sesgo). */
  aporte_sesgo: number;
  /** Tope de las acciones por ausentismo; null si no aplica a este estudiante. `delta_max` está en [0, 1]. */
  restriccion: null | { columna: string; nombre: string; delta_max: number; texto: string };
  reporte?: ReporteIndividual;
  perfil?: Record<string, string | number | null>;
  /**
   * Estado deseado pedido (v_S(0) del artículo), en unidades originales. Un mutable dinámico entra en el
   * costo del AG; uno fijo se toma como valor de partida del escenario.
   */
  deseados?: { columna: string; nombre: string; valor: string | number; normalizado: number; dinamico: boolean }[];
  configuracion: {
    beta: number;
    delta_max: number | null;
    /** Columna que activa el tope por ausentismo (null = desactivado) y cambio máximo en [0, 1]. */
    condicion_columna: string | null;
    condicion_delta_max: number;
    solo_incrementos: boolean;
    poblacion?: number;
    generaciones_max?: number;
    /** Generaciones sin mejora antes de detenerse. */
    paciencia?: number;
  };
}

/** Modelo listo de cualquier dataset (GET /api/modelos); el nombre del dataset es el tema. */
export interface ModeloListo {
  id: string;
  datasetId: string;
  tema: string;
  creado: string;
  opciones: Record<string, unknown>;
  /** Los del perfil «articulo» llegan al final de la lista. */
  perfil: PerfilModelo;
}

/** Resultado observado tras aplicar una prescripción (seguimiento.jsonl del modelo). */
export interface RegistroSeguimiento {
  id: string;
  registrado: string;
  fecha: string;
  acciones_aplicadas: Record<string, string | number>;
  resultado_observado: string | number;
  nivel_base?: string;
  nivel_prescrito?: string;
  acciones_recomendadas?: Record<string, string | number>;
  perfil?: Record<string, string | number>;
  nota?: string;
}

export interface PerfilBase {
  origen: string;
  valores: Record<string, string | number>;
}

export interface ResumenPrescripciones {
  n: number;
  pct_exito?: number;
  activacion_base_media?: number;
  activacion_prescrita_media?: number;
  acciones: {
    columna: string;
    nombre: string;
    actual_media: number;
    recomendada_media: number;
    cambio_mediano: number;
    pct_aumenta: number;
    pct_reduce: number;
    pct_igual: number;
    decimales: number;
  }[];
  por_nivel: { nivel: string; n: number; pct_exito: number; activacion_base: number; activacion_prescrita: number }[];
  ejemplos: { id_estudiante: number; nivel_observado: string; activacion_base: number; activacion_prescrita: number; nivel_prescrito: string }[];
  texto: string;
  nota?: string;
}

export interface EstadoServicios {
  ollama: { ok: boolean; version?: string; modelo: string; modeloDisponible: boolean; error?: string };
  motor: { ok: boolean; version?: string; python?: string; ejecutable: string; error?: string };
  modelo: string;
}

/** Matriz de un experto (método «expertos»): aristas con nombres de concepto, como en /estructura. */
export interface MatrizExperto {
  experto: string;
  aristas: { origen: string; destino: string; peso: number }[];
}

/** Lo que fija un perfil de entrenamiento (GET /api/perfiles). Las claves extra del motor se muestran tal cual. */
export interface DefectosPerfil {
  metodo_pesos: MetodoPesos;
  inferencia?: ReglaInferencia | null;
  activacion?: Activacion | null;
  sesgo?: boolean;
  beta: number;
  condicion_delta_max?: number | null;
  permitir_reducciones: boolean;
  mutables_dinamicos?: boolean;
  smote: boolean;
  binarizar_objetivo?: string | number | null;
  proporcion_prueba: number;
  pliegues: number;
  busqueda_ag: boolean;
  [clave: string]: unknown;
}

export type Perfiles = Record<PerfilModelo, DefectosPerfil>;

/** Opciones que dependen del perfil: sin valor, el motor usa la del perfil elegido. */
export type OpcionDePerfil = 'proporcion_prueba' | 'pliegues' | 'metodo_pesos' | 'inferencia' | 'activacion' | 'beta' | 'permitir_reducciones' | 'smote' | 'busqueda_ag' | 'binarizar_objetivo';

export interface OpcionesEntrenamiento {
  perfil: PerfilModelo;
  proporcion_prueba?: number;
  division: 'agrupada' | 'aleatoria';
  validacion_cruzada: 'completa' | 'rapida' | 'ninguna';
  pliegues?: number;
  metodo_pesos?: MetodoPesos;
  matrices_expertos?: MatrizExperto[];
  inferencia?: ReglaInferencia;
  activacion?: Activacion;
  binarizar_objetivo?: string | number | null;
  smote?: boolean;
  busqueda_ag?: boolean;
  balancear_niveles: boolean;
  aristas_excluidas: [string, string][];
  lambda: number;
  alpha_l2: number;
  beta?: number;
  delta_max: number | null;
  permitir_reducciones?: boolean;
  semilla: number;
  ag: Partial<{ tam_poblacion: number; generaciones: number; tasa_cruce: number; tasa_mutacion: number; tipo_cruce: 'uniforme' | 'un_punto' }>;
}

// Eventos del asistente (SSE de /api/chat)
export type EventoChat =
  | { tipo: 'estado'; texto: string }
  | { tipo: 'texto'; delta: string }
  | { tipo: 'herramienta'; nombre: string; argumentos: Record<string, unknown> }
  | { tipo: 'resultado'; nombre: string; ok: boolean; error?: string }
  | { tipo: 'grafica'; grafica: 'influencias'; titulo: string; datos: { id: string; nombre: string; rol: string; peso: number }[] }
  | { tipo: 'grafica'; grafica: 'variable'; titulo: string; datos: EstadisticaVariable }
  | { tipo: 'grafica'; grafica: 'correlaciones'; titulo: string; datos: Correlaciones }
  | { tipo: 'grafica'; grafica: 'dispersion'; titulo: string; datos: Dispersion }
  | { tipo: 'grafica'; grafica: 'acciones'; titulo: string; datos: { nombre: string; desde: number; hasta: number; min?: number; max?: number }[] }
  | { tipo: 'estudiante'; id: number; estudiante: Estudiante; prescripcion: Prescripcion; prescripcionMaxima?: Prescripcion }
  | { tipo: 'perfil'; origen: string; cambios: Record<string, string | number>; prescripcion: Prescripcion }
  | { tipo: 'simulacion'; id: number; simulacion: Simulacion }
  | { tipo: 'fin'; fueraDeTema?: boolean }
  | { tipo: 'error'; mensaje: string };

// Redacción de recomendaciones con qwen2.5 (SSE de /api/modelos/:id/redactar)
export type EventoRedaccion = { tipo: 'estado'; texto: string } | { tipo: 'texto'; delta: string } | { tipo: 'fin' } | { tipo: 'error'; mensaje: string };

export type PedidoRedaccion =
  | { tipo: 'individual'; sujeto: string; prescripcion: Prescripcion }
  | { tipo: 'poblacion'; nivel?: string | null };
