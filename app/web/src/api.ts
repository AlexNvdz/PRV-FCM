// Cliente de la API local. Todas las rutas son relativas: en desarrollo Vite
// las reenvía al servidor Node; en producción las sirve el mismo servidor.
import type {
  Correlaciones,
  Dataset,
  DatasetResumen,
  Dispersion,
  Esquema,
  EstadoServicios,
  Estadisticas,
  Estructura,
  Estudiante,
  EventoChat,
  EventoMotor,
  EventoRedaccion,
  MetodoCorrelacion,
  ModeloDetalle,
  ModeloMeta,
  Normalizados,
  OpcionesEntrenamiento,
  PaginaFilas,
  PedidoRedaccion,
  PerfilBase,
  Prescripcion,
  ResumenPrescripciones,
  Simulacion,
  Validacion,
} from './tipos';

/** Opciones de una prescripción individual (estudiante o perfil de riesgo). */
export interface OpcionesPrescripcion {
  beta?: number;
  deltaMax?: number | null;
  permitirReducciones?: boolean;
  nivelMeta?: string | null;
}

export class ErrorApi extends Error {
  status: number;
  datos: Record<string, unknown>;
  constructor(mensaje: string, status: number, datos: Record<string, unknown>) {
    super(mensaje);
    this.status = status;
    this.datos = datos;
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const json = typeof opciones.body === 'string';
  const respuesta = await fetch(ruta, {
    ...opciones,
    headers: json ? { 'Content-Type': 'application/json', ...opciones.headers } : opciones.headers,
  });
  if (respuesta.status === 204) return undefined as T;
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const detalles = Array.isArray(datos.detalles) ? ` ${datos.detalles.join(' ')}` : '';
    throw new ErrorApi(`${datos.error ?? `Error ${respuesta.status}`}${detalles}`, respuesta.status, datos);
  }
  return datos as T;
}

function consulta(params: Record<string, string | number | boolean | null | undefined>) {
  const busqueda = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === null || valor === undefined || valor === '') continue;
    busqueda.set(clave, typeof valor === 'boolean' ? (valor ? '1' : '0') : String(valor));
  }
  return busqueda.toString();
}

const cuerpo = (datos: unknown) => JSON.stringify(datos);

export const api = {
  estado: () => pedir<EstadoServicios>('/api/estado'),

  datasets: () => pedir<DatasetResumen[]>('/api/datasets'),
  dataset: (id: string) => pedir<Dataset>(`/api/datasets/${id}`),
  subirDataset(archivo: File, nombre?: string) {
    const formulario = new FormData();
    formulario.append('archivo', archivo);
    if (nombre) formulario.append('nombre', nombre);
    return pedir<Dataset>('/api/datasets', { method: 'POST', body: formulario });
  },
  renombrarDataset: (id: string, nombre: string) =>
    pedir<Dataset>(`/api/datasets/${id}`, { method: 'PATCH', body: cuerpo({ nombre }) }),
  eliminarDataset: (id: string) => pedir<void>(`/api/datasets/${id}`, { method: 'DELETE' }),

  validarEsquema: (id: string, esquema: Esquema) =>
    pedir<Validacion>(`/api/datasets/${id}/esquema/validar`, { method: 'POST', body: cuerpo({ esquema }) }),
  guardarEsquema: (id: string, esquema: Esquema) =>
    pedir<Dataset>(`/api/datasets/${id}/esquema`, { method: 'PUT', body: cuerpo({ esquema }) }),
  sugerirEsquema: (id: string) =>
    pedir<{ esquema: Esquema; avisos: string[]; validacion: Validacion }>(`/api/datasets/${id}/esquema/sugerir`, { method: 'POST', body: '{}' }),

  estadisticas: (id: string) => pedir<Estadisticas>(`/api/datasets/${id}/estadisticas`),
  filas: (id: string, params: { desde?: number; cantidad?: number; orden?: string; desc?: boolean; nivel?: string }) =>
    pedir<PaginaFilas>(`/api/datasets/${id}/filas?${consulta(params)}`),
  normalizados: (id: string, params: { desde?: number; cantidad?: number }) =>
    pedir<Normalizados>(`/api/datasets/${id}/normalizados?${consulta(params)}`),
  correlaciones: (id: string, metodo: MetodoCorrelacion) => pedir<Correlaciones>(`/api/datasets/${id}/correlaciones?${consulta({ metodo })}`),
  dispersion: (id: string, x: string, y: string) => pedir<Dispersion>(`/api/datasets/${id}/dispersion?${consulta({ x, y })}`),
  estructura: (id: string) => pedir<Estructura>(`/api/datasets/${id}/estructura`),

  entrenar: (id: string, opciones: Partial<OpcionesEntrenamiento>) =>
    pedir<ModeloMeta>(`/api/datasets/${id}/entrenar`, { method: 'POST', body: cuerpo({ opciones }) }),

  modelo: (id: string) => pedir<ModeloDetalle>(`/api/modelos/${id}`),
  eliminarModelo: (id: string) => pedir<void>(`/api/modelos/${id}`, { method: 'DELETE' }),
  recomendaciones: (id: string, params: { desde?: number; cantidad?: number; orden?: string; desc?: boolean; clase?: string; exito?: boolean | null }) =>
    pedir<PaginaFilas>(`/api/modelos/${id}/recomendaciones?${consulta(params)}`),
  estudiante: (modeloId: string, id: number) => pedir<Estudiante>(`/api/modelos/${modeloId}/estudiantes/${id}`),
  simular: (modeloId: string, id: number, acciones: Record<string, number | string>) =>
    pedir<Simulacion>(`/api/modelos/${modeloId}/simular`, { method: 'POST', body: cuerpo({ id, acciones }) }),
  prescribir: (modeloId: string, datos: { id: number } & OpcionesPrescripcion) =>
    pedir<Prescripcion>(`/api/modelos/${modeloId}/prescribir`, { method: 'POST', body: cuerpo(datos) }),
  perfilBase: (modeloId: string, estudiante?: number | null) =>
    pedir<PerfilBase>(`/api/modelos/${modeloId}/perfil-base?${consulta({ estudiante })}`),
  prescribirPerfil: (modeloId: string, datos: { perfil: Record<string, string | number> } & OpcionesPrescripcion) =>
    pedir<Prescripcion>(`/api/modelos/${modeloId}/prescribir-perfil`, { method: 'POST', body: cuerpo(datos) }),
  resumenPrescripciones: (modeloId: string, nivel?: string | null) =>
    pedir<ResumenPrescripciones>(`/api/modelos/${modeloId}/resumen-prescripciones?${consulta({ nivel })}`),
  urlFigura: (modeloId: string, nombre: string) => `/api/modelos/${modeloId}/figuras/${nombre}`,
  urlRecomendacionesCsv: (modeloId: string) => `/api/modelos/${modeloId}/recomendaciones.csv`,
};

/** Lee una respuesta SSE (POST) y entrega cada evento `data:` ya convertido de JSON. */
async function leerEventos<T>(respuesta: Response, alEvento: (evento: T) => void) {
  if (!respuesta.ok || !respuesta.body) {
    const error = await respuesta.json().catch(() => ({}));
    throw new ErrorApi(error.error ?? `Error ${respuesta.status}`, respuesta.status, error);
  }
  const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
  let pendiente = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += value;
    let corte;
    while ((corte = pendiente.indexOf('\n\n')) >= 0) {
      const bloque = pendiente.slice(0, corte);
      pendiente = pendiente.slice(corte + 2);
      const linea = bloque.split('\n').find((l) => l.startsWith('data: '));
      if (linea) alEvento(JSON.parse(linea.slice(6)) as T);
    }
  }
}

/** Recomendación redactada por qwen2.5 a partir de una prescripción (SSE). */
export async function redactar(modeloId: string, pedido: PedidoRedaccion, alEvento: (evento: EventoRedaccion) => void, signal: AbortSignal) {
  const respuesta = await fetch(`/api/modelos/${modeloId}/redactar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
    signal,
  });
  await leerEventos(respuesta, alEvento);
}

/** Progreso de un entrenamiento (SSE). Devuelve una función para dejar de escuchar. */
export function escucharEntrenamiento(
  modeloId: string,
  alEvento: (evento: EventoMotor) => void,
  alTerminar: (modelo: ModeloMeta) => void,
) {
  const fuente = new EventSource(`/api/modelos/${modeloId}/eventos`);
  fuente.onmessage = (mensaje) => {
    const datos = JSON.parse(mensaje.data);
    if (datos.tipo === 'evento') alEvento(datos.evento);
    if (datos.tipo === 'fin') {
      fuente.close();
      alTerminar(datos.modelo);
    }
  };
  fuente.onerror = () => {
    // Si el servidor cerró tras el fin, no hay que reconectar.
    if (fuente.readyState === EventSource.CLOSED) return;
  };
  return () => fuente.close();
}

/** Conversación con el asistente: POST con respuesta SSE leída como stream. */
export async function conversar(
  datos: { mensajes: { rol: 'usuario' | 'asistente'; contenido: string }[]; datasetId: string | null },
  alEvento: (evento: EventoChat) => void,
  signal: AbortSignal,
) {
  const respuesta = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
    signal,
  });
  await leerEventos(respuesta, alEvento);
}
