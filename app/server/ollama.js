// Cliente mínimo de la API local de Ollama (/api/chat, /api/tags, /api/version).
import { OLLAMA_CONTEXTO, OLLAMA_MODELO, OLLAMA_URL } from './config.js';

export class ErrorOllama extends Error {
  constructor(mensaje, { status = 503 } = {}) {
    super(mensaje);
    this.status = status;
  }
}

const SIN_CONEXION = `No se pudo conectar con Ollama en ${OLLAMA_URL}. Abra Ollama (o ejecute "ollama serve") y vuelva a intentarlo.`;

async function pedir(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${OLLAMA_URL}${ruta}`, opciones);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ErrorOllama(SIN_CONEXION);
  }
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    if (respuesta.status === 404 && detalle.includes('not found')) {
      throw new ErrorOllama(`El modelo ${OLLAMA_MODELO} no está instalado. Ejecute "ollama pull ${OLLAMA_MODELO}".`);
    }
    throw new ErrorOllama(`Ollama respondió ${respuesta.status}: ${detalle.slice(0, 300)}`);
  }
  return respuesta;
}

export async function estadoOllama() {
  try {
    const [version, etiquetas] = await Promise.all([
      pedir('/api/version', { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
      pedir('/api/tags', { signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
    ]);
    const modelos = (etiquetas.models ?? []).map((m) => m.name);
    return { ok: true, version: version.version, modelo: OLLAMA_MODELO, modeloDisponible: modelos.includes(OLLAMA_MODELO), modelos };
  } catch (error) {
    return { ok: false, modelo: OLLAMA_MODELO, modeloDisponible: false, error: error instanceof ErrorOllama ? error.message : SIN_CONEXION };
  }
}

function cuerpo({ mensajes, herramientas, opciones, formato, stream }) {
  return JSON.stringify({
    model: OLLAMA_MODELO,
    messages: mensajes,
    ...(herramientas?.length ? { tools: herramientas } : {}),
    ...(formato ? { format: formato } : {}),
    stream,
    keep_alive: '30m',
    options: { num_ctx: OLLAMA_CONTEXTO, temperature: 0.3, ...opciones },
  });
}

/** Respuesta en streaming: produce cada fragmento NDJSON de Ollama. */
export async function* chatStream({ mensajes, herramientas, opciones, signal }) {
  const respuesta = await pedir('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo({ mensajes, herramientas, opciones, stream: true }),
    signal,
  });
  const decodificador = new TextDecoder();
  let pendiente = '';
  for await (const trozo of respuesta.body) {
    pendiente += decodificador.decode(trozo, { stream: true });
    let salto;
    while ((salto = pendiente.indexOf('\n')) >= 0) {
      const linea = pendiente.slice(0, salto).trim();
      pendiente = pendiente.slice(salto + 1);
      if (linea) yield leerFragmento(linea);
    }
  }
  if (pendiente.trim()) yield leerFragmento(pendiente.trim());
}

function leerFragmento(linea) {
  const fragmento = JSON.parse(linea);
  if (fragmento.error) throw new ErrorOllama(`Ollama: ${fragmento.error}`);
  return fragmento;
}

/** Respuesta completa con salida estructurada (JSON Schema). */
export async function chatJson({ mensajes, esquema, opciones, signal }) {
  const respuesta = await pedir('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: cuerpo({ mensajes, formato: esquema, opciones: { temperature: 0, ...opciones }, stream: false }),
    signal,
  });
  const datos = await respuesta.json();
  try {
    return JSON.parse(datos.message?.content ?? '');
  } catch {
    throw new ErrorOllama('El modelo no devolvió un JSON válido.', { status: 502 });
  }
}
