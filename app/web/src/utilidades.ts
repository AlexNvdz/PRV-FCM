// Formatos y ayudas compartidas.
import { SUJETO_POR_DEFECTO, type Activacion, type Codificacion, type DatasetResumen, type MetodoPesos, type PerfilModelo, type ReglaInferencia, type Rol, type Sujeto, type ValorOriginal } from './tipos';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

export function pct(valor: number | null | undefined, decimales = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return `${valor.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}

/** Proporción (0-1) como porcentaje. */
export function pctDe(proporcion: number | null | undefined, decimales = 1) {
  return pct(proporcion === null || proporcion === undefined ? proporcion : 100 * proporcion, decimales);
}

export function num(valor: number | null | undefined, decimales = 1) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—';
  return valor.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

export function entero(valor: number | null | undefined) {
  return valor === null || valor === undefined ? '—' : numero.format(Math.round(valor));
}

export function firmado(valor: number, decimales = 2) {
  const texto = Math.abs(valor).toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  return `${valor >= 0 ? '+' : '−'}${texto}`;
}

export function fecha(iso: string) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Cómo se llama cada registro (paciente, cliente, estudiante) con sus artículos; por defecto «registro». */
export function sujetoDe(sujeto?: Partial<Sujeto> | null) {
  const { singular, plural, femenino } = { ...SUJETO_POR_DEFECTO, ...sujeto };
  return {
    singular,
    plural,
    femenino,
    el: femenino ? 'la' : 'el',
    los: femenino ? 'las' : 'los',
    al: femenino ? 'a la' : 'al',
    del: femenino ? 'de la' : 'del',
    este: femenino ? 'esta' : 'este',
    un: femenino ? 'una' : 'un',
    todos: femenino ? 'todas las' : 'todos los',
  };
}
export type SujetoTexto = ReturnType<typeof sujetoDe>;

/** El del modelo si hay uno; si no, el que el motor resolvió al validar el esquema (xAPI: estudiante). */
export const sujetoDeDataset = (dataset?: Pick<DatasetResumen, 'esquema' | 'validacion'> | null, modelo?: { sujeto?: Sujeto } | null) =>
  sujetoDe(modelo?.sujeto ?? dataset?.validacion?.sujeto ?? dataset?.esquema?.sujeto);

export function duracion(ms?: number) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export const NOMBRE_ROL: Record<Rol, string> = {
  inmutable: 'Inmutable',
  accion: 'Acción',
  mutable: 'Mutable',
  objetivo: 'Objetivo',
  excluir: 'Excluida',
};

/** Clase de concepto en la notación de PRV-FCM: C_T objetivo, C_P prescriptivo, C_S del sistema. */
export const NOTACION_ROL: Record<Rol, string | null> = {
  objetivo: 'C_T',
  accion: 'C_P',
  mutable: 'C_S',
  inmutable: 'C_S',
  excluir: null,
};

export function rolConNotacion(rol: Rol) {
  return NOTACION_ROL[rol] ? `${NOMBRE_ROL[rol]} (${NOTACION_ROL[rol]})` : NOMBRE_ROL[rol];
}

export const DESCRIPCION_ROL: Record<Rol, string> = {
  objetivo: 'Concepto objetivo: la métrica a maximizar o minimizar, como el rendimiento o la permanencia.',
  accion: 'Concepto prescriptivo: lo que se puede cambiar directamente (una intervención o un comportamiento). El AG lo ajusta.',
  mutable: 'Concepto del sistema que cambia pero no se controla directamente: ausencias, satisfacción.',
  inmutable: 'Concepto del sistema fijo en el periodo: edad, género, curso.',
  excluir: 'No se usa: identificadores, texto libre o columnas redundantes.',
};

export const NOMBRE_CODIFICACION: Record<Codificacion, string> = {
  numerica: 'Numérica',
  ordinal: 'Ordinal (label encoding)',
  nominal: 'Nominal: media del objetivo',
  one_hot: 'Nominal: one-hot',
  numero_en_texto: 'Número en texto',
  fecha: 'Fecha',
};

export const NOMBRE_METODO: Record<MetodoPesos, string> = {
  bptt: 'BPTT',
  ridge: 'Ridge',
  lasso: 'Lasso',
  correlacion_parcial: 'Correlación parcial',
  pso: 'PSO',
  expertos: 'Expertos',
};

export const NOMBRE_PERFIL: Record<PerfilModelo, string> = { articulo: 'Artículo', mejorado: 'Mejorado' };

export const NOMBRE_INFERENCIA: Record<ReglaInferencia, string> = { kosko: 'Kosko', kosko_modificada: 'Kosko modificada', reescalada: 'Reescalada' };

export const NOMBRE_ACTIVACION: Record<Activacion, string> = { sigmoide: 'Sigmoide', tanh: 'Tangente hiperbólica' };

/** Descarga filas como CSV (UTF-8 con BOM para que Excel lea las tildes). */
export function descargarCsv(nombre: string, filas: (string | number | boolean | null | undefined)[][]) {
  const celda = (v: string | number | boolean | null | undefined) => {
    const texto = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const csv = `\ufeff${filas.map((f) => f.map(celda).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Nivel cuyo valor está más cerca de la activación, como `discretizar_rendimiento` del motor. */
export function nivelCercano(activacion: number, valores: Record<string, number>) {
  return Object.entries(valores).reduce((mejor, actual) => (Math.abs(actual[1] - activacion) < Math.abs(mejor[1] - activacion) ? actual : mejor))[0];
}

type RangoAccion = { categorias?: string[]; min?: number; max?: number };

/** Paso de un control de acción: una categoría, o una fracción del rango numérico. */
export function pasoAccion(accion: RangoAccion) {
  if (accion.categorias) return 1;
  const rango = (accion.max ?? 1) - (accion.min ?? 0);
  return rango > 20 ? 1 : rango > 2 ? 0.1 : 0.01;
}

/** Acción ordinal de dos categorías (campañas): la primera es «no activada» y la segunda «activada». */
export const esBinaria = (accion: RangoAccion) => accion.categorias?.length === 2;
const activa = (accion: RangoAccion, v: ValorOriginal) => v.categoria === accion.categorias?.[1];

/** Fila de la gráfica de mancuernas: la media de una acción binaria es la proporción de registros con ella activa, y se grafica en %. */
export function filaMancuerna(a: { nombre: string; actual_media: number; recomendada_media: number; min?: number; max?: number }, categorias?: string[]) {
  return categorias?.length === 2
    ? { nombre: `${a.nombre} (% activa)`, desde: 100 * a.actual_media, hasta: 100 * a.recomendada_media, min: 0, max: 100 }
    : { nombre: a.nombre, desde: a.actual_media, hasta: a.recomendada_media, min: a.min, max: a.max };
}

/** Valor de una acción en unidades originales; si es ordinal, la categoría que le corresponde, y si es binaria, Activa o No activa. */
export function etiquetaAccion(accion: RangoAccion, valor: number) {
  if (esBinaria(accion)) return Math.round(valor) >= 1 ? 'Activa' : 'No activa';
  if (accion.categorias) return accion.categorias[Math.round(valor)] ?? num(valor);
  return num(valor, pasoAccion(accion) < 1 ? 2 : 0);
}

/** Valor de una acción tal como lo devuelve el motor (actual o recomendado); si es binaria, Activa o No activa. */
export function textoAccion(accion: RangoAccion, v: ValorOriginal) {
  if (esBinaria(accion)) return activa(accion, v) ? 'Activa' : 'No activa';
  return v.categoria ?? num(v.valor);
}

/** Valor recomendado de una acción; si es binaria, la decisión frente al actual. */
export function recomendacionAccion(accion: RangoAccion & { actual: ValorOriginal; recomendada: ValorOriginal }) {
  if (!esBinaria(accion)) return textoAccion(accion, accion.recomendada);
  const antes = activa(accion, accion.actual);
  if (activa(accion, accion.recomendada)) return antes ? 'Mantener activa' : 'Activar';
  return antes ? 'Desactivar' : 'No activar';
}

/** Color de cada nivel del objetivo: rampa ordinal azul (del peor al mejor). */
export function colorNivel(indice: number, total: number) {
  const pasos: Record<number, number[]> = { 1: [3], 2: [1, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
  const paso = (pasos[Math.min(total, 5)] ?? pasos[5])[Math.min(indice, 4)];
  return `var(--nivel-${paso})`;
}

export function clase(...partes: (string | false | null | undefined)[]) {
  return partes.filter(Boolean).join(' ');
}
