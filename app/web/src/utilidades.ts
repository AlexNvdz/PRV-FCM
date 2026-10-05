// Formatos y ayudas compartidas.
import type { Codificacion, MetodoPesos, Rol } from './tipos';

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
  accion: 'Concepto prescriptivo: lo que la institución o el estudiante pueden cambiar. El AG lo ajusta.',
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
};

export const NOMBRE_METODO: Record<MetodoPesos, string> = {
  bptt: 'BPTT',
  ridge: 'Ridge',
  lasso: 'Lasso',
  correlacion_parcial: 'Correlación parcial',
};

/** Color de cada nivel del objetivo: rampa ordinal azul (del peor al mejor). */
export function colorNivel(indice: number, total: number) {
  const pasos: Record<number, number[]> = { 1: [3], 2: [1, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };
  const paso = (pasos[Math.min(total, 5)] ?? pasos[5])[Math.min(indice, 4)];
  return `var(--nivel-${paso})`;
}

export function clase(...partes: (string | false | null | undefined)[]) {
  return partes.filter(Boolean).join(' ');
}
