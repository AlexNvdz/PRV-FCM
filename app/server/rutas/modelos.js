// /api/modelos: progreso del entrenamiento, resultados, simulación, prescripción individual
// (también de un perfil de riesgo), figuras del informe y recomendaciones redactadas con qwen2.5.
import fs from 'node:fs/promises';
import path from 'node:path';

import express from 'express';
import { z } from 'zod';

import { redactarRecomendacion } from '../agente.js';
import { abrirSSE } from '../sse.js';

function error(status, mensaje) {
  return Object.assign(new Error(mensaje), { status });
}

const OpcionesPrescripcion = {
  beta: z.number().min(0).max(5).optional(),
  deltaMax: z.number().min(0).max(1).nullable().optional(),
  permitirReducciones: z.boolean().optional(),
  nivelMeta: z.string().min(1).max(80).nullable().optional(),
};

function paramsPrescripcion(cuerpo) {
  return {
    beta: cuerpo.beta ?? null,
    delta_max: cuerpo.deltaMax ?? null,
    permitir_reducciones: cuerpo.permitirReducciones ?? null,
    nivel_meta: cuerpo.nivelMeta ?? null,
  };
}

// Lo que el cliente envía para redactar: la prescripción individual que ya recibió del motor.
const PrescripcionRecibida = z
  .object({
    acciones: z.array(z.object({ nombre: z.string(), actual: z.object({ valor: z.number() }).passthrough(), recomendada: z.object({ valor: z.number() }).passthrough(), cambio: z.number() }).passthrough()).max(60),
    base: z.object({ activacion: z.number(), nivel: z.string() }).passthrough(),
    prescrito: z.object({ activacion: z.number(), nivel: z.string() }).passthrough(),
    meta: z.object({ valor: z.number(), nivel: z.string() }).passthrough().optional(),
    contribuciones: z.array(z.object({ nombre: z.string(), rol: z.string(), aporte_prescrito: z.number() }).passthrough()).max(200).optional(),
    reporte: z.object({ texto: z.string() }).passthrough().optional(),
  })
  .passthrough();

const CuerpoRedactar = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('individual'), sujeto: z.string().max(120).default('este estudiante'), prescripcion: PrescripcionRecibida }),
  z.object({ tipo: z.literal('poblacion'), nivel: z.string().max(80).nullable().optional() }),
]);

export function rutasModelos({ almacen, motor, trabajos }) {
  const router = express.Router();

  async function cargar(id) {
    const modelo = await almacen.obtenerModelo(id);
    if (!modelo) throw error(404, 'No existe ese modelo.');
    return modelo;
  }

  async function cargarListo(id) {
    const modelo = await cargar(id);
    if (modelo.estado !== 'listo') throw error(409, 'El modelo todavía no está listo.');
    const dataset = await almacen.obtenerDataset(modelo.datasetId);
    if (!dataset) throw error(404, 'El dataset de este modelo ya no existe.');
    // El esquema con el que se entrenó: si después cambia el del dataset, el modelo sigue siendo coherente.
    const esquema = JSON.parse(await fs.readFile(path.join(almacen.dirModelo(id), 'esquema.json'), 'utf8'));
    return {
      modelo,
      dataset,
      base: { ruta: almacen.rutaDatos(dataset.id), esquema, modelo: path.join(almacen.dirModelo(id), 'modelo.json') },
    };
  }

  router.get('/:id', async (req, res) => {
    const modelo = await cargar(req.params.id);
    let resultados = {};
    if (modelo.estado === 'listo') {
      const esquema = JSON.parse(await fs.readFile(path.join(almacen.dirModelo(modelo.id), 'esquema.json'), 'utf8').catch(() => 'null'));
      resultados = { ...(await almacen.resultadosModelo(modelo.id)), esquema };
    }
    res.json({ ...modelo, enCurso: trabajos.estaActivo(modelo.id), ...resultados });
  });

  router.delete('/:id', async (req, res) => {
    await cargar(req.params.id);
    trabajos.cancelar(req.params.id);
    await almacen.eliminarModelo(req.params.id);
    res.status(204).end();
  });

  router.get('/:id/eventos', async (req, res) => {
    const modelo = await cargar(req.params.id);
    const sse = abrirSSE(res);
    for (const evento of modelo.eventos ?? []) sse.enviar({ tipo: 'evento', evento });
    const cancelar = trabajos.suscribir(modelo.id, (mensaje) => {
      sse.enviar(mensaje);
      if (mensaje.tipo === 'fin') sse.cerrar();
    });
    if (!cancelar) {
      // Ya terminó (o se interrumpió): se envía el estado final y se cierra.
      sse.enviar({ tipo: 'fin', modelo: await almacen.obtenerModelo(modelo.id) });
      sse.cerrar();
      return;
    }
    res.on('close', cancelar);
  });

  router.get('/:id/recomendaciones', async (req, res) => {
    await cargarListo(req.params.id);
    const consulta = z
      .object({
        desde: z.coerce.number().int().min(0).default(0),
        cantidad: z.coerce.number().int().min(1).max(200).default(50),
        orden: z.string().optional(),
        desc: z.enum(['0', '1']).optional(),
        clase: z.string().optional(),
        exito: z.enum(['0', '1']).optional(),
      })
      .parse(req.query);
    const filtros = [];
    if (consulta.clase) filtros.push({ columna: 'clase_observada', operador: '=', valor: consulta.clase });
    if (consulta.exito) filtros.push({ columna: 'exito', operador: '=', valor: Number(consulta.exito) });
    res.json(
      await motor.llamar('recomendaciones', {
        directorio: almacen.dirModelo(req.params.id),
        desde: consulta.desde,
        cantidad: consulta.cantidad,
        orden: consulta.orden || null,
        descendente: consulta.desc === '1',
        filtros,
      }),
    );
  });

  router.get('/:id/info', async (req, res) => {
    const { base } = await cargarListo(req.params.id);
    res.json(await motor.llamar('modelo_info', { modelo: base.modelo }));
  });

  router.get('/:id/estudiantes/:estudiante', async (req, res) => {
    const { base } = await cargarListo(req.params.id);
    const id = z.coerce.number().int().min(0).parse(req.params.estudiante);
    res.json(await motor.llamar('estudiante', { ...base, id }));
  });

  router.post('/:id/simular', async (req, res) => {
    const { base } = await cargarListo(req.params.id);
    const cuerpo = z
      .object({ id: z.number().int().min(0), acciones: z.record(z.string(), z.union([z.number(), z.string()])) })
      .parse(req.body);
    res.json(await motor.llamar('simular', { modelo: base.modelo, ruta: base.ruta, esquema: base.esquema, ...cuerpo }));
  });

  router.post('/:id/prescribir', async (req, res) => {
    const { base } = await cargarListo(req.params.id);
    const cuerpo = z.object({ id: z.number().int().min(0), ...OpcionesPrescripcion }).parse(req.body);
    res.json(
      await motor.llamar('prescribir', { modelo: base.modelo, ruta: base.ruta, esquema: base.esquema, id: cuerpo.id, ...paramsPrescripcion(cuerpo) }),
    );
  });

  // --- Perfil de riesgo (paso 4) ---------------------------------------------
  router.get('/:id/perfil-base', async (req, res) => {
    const { base } = await cargarListo(req.params.id);
    const { estudiante } = z.object({ estudiante: z.coerce.number().int().min(0).optional() }).parse(req.query);
    res.json(await motor.llamar('perfil_base', { ruta: base.ruta, esquema: base.esquema, id: estudiante ?? null }));
  });

  router.post('/:id/prescribir-perfil', async (req, res) => {
    const { base } = await cargarListo(req.params.id);
    const cuerpo = z
      .object({ perfil: z.record(z.string(), z.union([z.string().max(200), z.number()])), ...OpcionesPrescripcion })
      .parse(req.body);
    res.json(await motor.llamar('prescribir_perfil', { modelo: base.modelo, perfil: cuerpo.perfil, ...paramsPrescripcion(cuerpo) }));
  });

  // --- Informe (paso 5) --------------------------------------------------------
  router.get('/:id/resumen-prescripciones', async (req, res) => {
    await cargarListo(req.params.id);
    const { nivel } = z.object({ nivel: z.string().max(80).optional() }).parse(req.query);
    res.json(await motor.llamar('resumen_prescripciones', { directorio: almacen.dirModelo(req.params.id), nivel: nivel || null }));
  });

  router.get('/:id/recomendaciones.csv', async (req, res) => {
    const { modelo } = await cargarListo(req.params.id);
    res.download(path.join(almacen.dirModelo(modelo.id), 'recomendaciones.csv'), `recomendaciones-${modelo.id}.csv`);
  });

  router.get('/:id/figuras/:nombre', async (req, res) => {
    const { modelo } = await cargarListo(req.params.id);
    const { graficas } = await almacen.resultadosModelo(modelo.id);
    const nombre = req.params.nombre;
    // Solo las figuras que el entrenamiento registró: el nombre nunca sale de la carpeta del modelo.
    if (!/^[a-z_]+\.png$/.test(nombre) || !(graficas?.figuras ?? []).includes(nombre)) throw error(404, 'No existe esa figura.');
    res.sendFile(path.join(almacen.dirModelo(modelo.id), 'figuras', nombre), { headers: { 'Cache-Control': 'private, max-age=3600' } });
  });

  // Recomendación en lenguaje natural redactada por qwen2.5 a partir de la prescripción (SSE).
  router.post('/:id/redactar', async (req, res) => {
    const { modelo, dataset } = await cargarListo(req.params.id);
    const cuerpo = CuerpoRedactar.parse(req.body);
    const { metricas, graficas } = await almacen.resultadosModelo(modelo.id);
    let datos;
    if (cuerpo.tipo === 'poblacion') {
      datos = await motor.llamar('resumen_prescripciones', { directorio: almacen.dirModelo(modelo.id), nivel: cuerpo.nivel || null });
    } else {
      datos = { sujeto: cuerpo.sujeto, prescripcion: cuerpo.prescripcion };
    }
    const controlador = new AbortController();
    res.on('close', () => !res.writableFinished && controlador.abort());
    const sse = abrirSSE(res);
    try {
      await redactarRecomendacion({
        tipo: cuerpo.tipo,
        datos,
        contexto: { dataset: dataset.nombre, objetivo: graficas?.objetivo, mejorNivel: graficas?.mejor_nivel, metricas },
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
