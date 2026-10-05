// /api/chat: conversación con el asistente, transmitida como eventos SSE.
import path from 'node:path';

import express from 'express';
import { z } from 'zod';

import { ejecutarAgente } from '../agente.js';
import { ErrorHerramienta } from '../herramientas.js';
import { abrirSSE } from '../sse.js';

const MAX_MENSAJES = 30;

const CuerpoChat = z.object({
  mensajes: z
    .array(z.object({ rol: z.enum(['usuario', 'asistente']), contenido: z.string().min(1).max(8000) }))
    .min(1),
  datasetId: z.string().nullable().optional(),
  guardia: z.boolean().default(true),
});

/** Traduce el nombre que use el modelo (columna, nombre visible o sin mayúsculas) a la columna real. */
export function crearBuscadorColumnas(esquema) {
  const columnas = esquema?.columnas ?? [];
  const normalizar = (texto) =>
    String(texto)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  return (nombre) => {
    const buscado = normalizar(nombre);
    const encontrada = columnas.find((c) => c.columna === nombre) ??
      columnas.find((c) => normalizar(c.columna) === buscado || normalizar(c.nombre ?? '') === buscado);
    if (!encontrada) {
      const validas = columnas.filter((c) => c.rol !== 'excluir').map((c) => c.columna).join(', ');
      throw new ErrorHerramienta(`No existe la columna «${nombre}». Columnas válidas: ${validas}.`);
    }
    return encontrada.columna;
  };
}

export function rutasChat({ almacen, motor }) {
  const router = express.Router();
  const cacheEstadisticas = new Map();

  async function contexto(datasetId) {
    if (!datasetId) return { dataset: null, modelo: null, resultados: null, motor };
    const dataset = await almacen.obtenerDataset(datasetId);
    if (!dataset) return { dataset: null, modelo: null, resultados: null, motor };
    const modelo = dataset.esquemaConfirmado ? await almacen.modeloActivo(dataset.id) : null;
    const rutaDatos = almacen.rutaDatos(dataset.id);
    const columnaReal = crearBuscadorColumnas(dataset.esquema);
    return {
      dataset,
      modelo,
      resultados: modelo ? await almacen.resultadosModelo(modelo.id) : null,
      motor,
      rutaDatos,
      dirModelo: modelo ? almacen.dirModelo(modelo.id) : null,
      rutaModelo: modelo ? path.join(almacen.dirModelo(modelo.id), 'modelo.json') : null,
      columnaReal,
      /** Columna que es un concepto del mapa: las one-hot se expanden en varios conceptos y no sirven como eje. */
      conceptoReal(nombre) {
        const columna = columnaReal(nombre);
        if (dataset.esquema.columnas.find((c) => c.columna === columna)?.codificacion === 'one_hot') {
          throw new ErrorHerramienta(`«${columna}» usa codificación one-hot; para ver su relación con el objetivo use estadisticas_variable.`);
        }
        return columna;
      },
      async estadisticas() {
        if (!dataset.esquemaConfirmado) throw new ErrorHerramienta('El esquema del dataset no está confirmado todavía.');
        const clave = `${dataset.id}:${JSON.stringify(dataset.esquema)}`;
        if (!cacheEstadisticas.has(clave)) {
          cacheEstadisticas.set(clave, await motor.llamar('estadisticas', { ruta: rutaDatos, esquema: dataset.esquema }));
        }
        return cacheEstadisticas.get(clave);
      },
    };
  }

  router.post('/', async (req, res) => {
    const { mensajes, datasetId, guardia } = CuerpoChat.parse(req.body);
    if (mensajes.at(-1).rol !== 'usuario') throw Object.assign(new Error('El último mensaje debe ser del usuario.'), { status: 400 });
    const ctx = await contexto(datasetId);
    const controlador = new AbortController();
    res.on('close', () => !res.writableFinished && controlador.abort());
    const sse = abrirSSE(res);
    try {
      await ejecutarAgente({
        mensajes: mensajes.slice(-MAX_MENSAJES),
        ctx,
        guardia,
        signal: controlador.signal,
        emitir: sse.enviar,
      });
    } catch (fallo) {
      if (fallo.name !== 'AbortError') sse.enviar({ tipo: 'error', mensaje: fallo.message });
    } finally {
      sse.cerrar();
    }
  });

  return router;
}
