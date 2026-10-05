// Tipos de la API local (server/). Los nombres siguen el JSON del motor Python.

export type Rol = 'inmutable' | 'accion' | 'mutable' | 'objetivo' | 'excluir';
export type Codificacion = 'numerica' | 'ordinal' | 'nominal' | 'one_hot' | 'numero_en_texto';
export type MetodoPesos = 'bptt' | 'ridge' | 'lasso' | 'correlacion_parcial';
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

export interface Esquema {
  nombre?: string;
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
  | { evento: 'progreso'; tarea: 'validacion_cruzada' | 'prescripcion'; hechos: number; total: number }
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
    fcm: { lambda_: number; alpha_l2: number; metodo_pesos?: MetodoPesos; balancear_niveles?: boolean; coef_memoria?: number; coef_influencia?: number };
    ag: Record<string, number | string>;
    prescripcion: { beta_esfuerzo: number; delta_max: number | null; tolerancia_exito: number; clases_a_prescribir: string[] };
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
  validacion_externa: {
    exactitud_prueba: number;
    PSR_externo_base: number;
    PSR_externo: number;
    prob_H_base: number;
    prob_H_prescrita: number;
    por_segmento: Record<string, { n: number; PSR_externo_base: number; PSR_externo: number }>;
  };
}

export interface ConceptoGrafo {
  id: string;
  columna: string;
  nombre: string;
  rol: Exclude<Rol, 'excluir'>;
  dinamico: boolean;
  codificacion: Codificacion;
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
  aristas_excluidas?: [string, string][];
  figuras?: string[];
}

export interface ModeloDetalle extends ModeloMeta {
  enCurso: boolean;
  metricas?: Metricas;
  graficas?: Graficas;
  esquema?: Esquema;
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

export interface EstadoPrediccion {
  activacion: number;
  nivel: string;
  exito: boolean;
  dinamicos: Record<string, number>;
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
  historial?: { mejor: number[]; promedio: number[] };
  contribuciones?: Contribucion[];
  reporte?: ReporteIndividual;
  perfil?: Record<string, string | number | null>;
  configuracion: { beta: number; delta_max: number | null; solo_incrementos: boolean };
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

export interface OpcionesEntrenamiento {
  proporcion_prueba: number;
  division: 'agrupada' | 'aleatoria';
  validacion_cruzada: 'completa' | 'rapida' | 'ninguna';
  metodo_pesos: MetodoPesos;
  balancear_niveles: boolean;
  aristas_excluidas: [string, string][];
  lambda: number;
  alpha_l2: number;
  beta: number;
  delta_max: number | null;
  permitir_reducciones: boolean;
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
