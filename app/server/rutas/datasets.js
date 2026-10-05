// /api/datasets: subir (CSV o Excel), perfilar, definir el esquema, explorar y entrenar.
import fs from 'node:fs/promises';
import path from 'node:path';

import express from 'express';
import multer from 'multer';
import { z } from 'zod';

import { sugerirEsquemaConIA } from '../agente.js';
import { LIMITE_SUBIDA_MB } from '../config.js';

const EXTENSIONES_CSV = new Set(['.csv', '.txt']);
const EXTENSIONES_EXCEL = new Set(['.xlsx', '.xlsm', '.xls']);

export const METODOS_PESOS = ['bptt', 'ridge', 'lasso', 'correlacion_parcial'];

export const OpcionesEntrenamiento = z.object({
  proporcion_prueba: z.number().min(0.1).max(0.5).default(0.3),
  division: z.enum(['agrupada', 'aleatoria']).default('agrupada'),
  validacion_cruzada: z.enum(['completa', 'rapida', 'ninguna']).default('completa'),
  metodo_pesos: z.enum(METODOS_PESOS).default('bptt'),
  // Pondera cada registro por la inversa de la frecuencia de su nivel del objetivo al aprender W.
  balancear_niveles: z.boolean().default(false),
  // Máscara de dirección causal: pares [columna origen, columna destino] que se eliminan del mapa.
  aristas_excluidas: z.array(z.tuple([z.string().min(1), z.string().min(1)])).max(2000).default([]),
  lambda: z.number().positive().max(20).default(1),
  alpha_l2: z.number().min(0).max(1).default(0.001),
  beta: z.number().min(0).max(5).default(0.05),
  delta_max: z.number().min(0).max(1).nullable().default(null),
  permitir_reducciones: z.boolean().default(false),
  semilla: z.number().int().min(0).max(1_000_000).default(42),
  ag: z
    .object({
      tam_poblacion: z.number().int().min(10).max(500),
      generaciones: z.number().int().min(5).max(500),
      tasa_cruce: z.number().min(0).max(1),
      tasa_mutacion: z.number().min(0).max(1),
      tipo_cruce: z.enum(['uniforme', 'un_punto']),
    })
    .partial()
    .default({}),
});

/** Opciones de la interfaz -> opciones del motor Python. */
export function opcionesMotor(opciones) {
  const { validacion_cruzada: modo, ...resto } = opciones;
  const rejillas =
    modo === 'rapida' ? { pliegues: 3, rejilla_lambda: [0.5, 1, 2], rejilla_alpha: [0.001] } : {};
  return { ...resto, ...rejillas, validacion_cruzada: modo !== 'ninguna' };
}

function error(status, mensaje, extra = {}) {
  return Object.assign(new Error(mensaje), { status, ...extra });
}

export function rutasDatasets({ almacen, motor, trabajos }) {
  const router = express.Router();
  const subida = multer({ dest: almacen.dirTemporal, limits: { fileSize: LIMITE_SUBIDA_MB * 1024 * 1024 } });
  const cacheEstadisticas = new Map();

  async function cargar(id) {
    const dataset = await almacen.obtenerDataset(id);
    if (!dataset) throw error(404, 'No existe ese dataset.');
    return dataset;
  }

  async function resumen(dataset) {
    const modelos = await almacen.listarModelos(dataset.id);
    const { perfil, ...resto } = dataset;
    return {
      ...resto,
      columnasPerfil: perfil?.perfil?.length ?? 0,
      modeloActivo: modelos.find((m) => m.estado === 'listo')?.id ?? null,
      ultimoModelo: modelos[0] ? { id: modelos[0].id, estado: modelos[0].estado, creado: modelos[0].creado } : null,
    };
  }

  router.get('/', async (_req, res) => {
    const datasets = await almacen.listarDatasets();
    res.json(await Promise.all(datasets.map(resumen)));
  });

  router.post('/', subida.single('archivo'), async (req, res) => {
    if (!req.file) throw error(400, 'Adjunte un archivo CSV o Excel.');
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (!EXTENSIONES_CSV.has(extension) && !EXTENSIONES_EXCEL.has(extension)) {
      await fs.rm(req.file.path, { force: true });
      throw error(400, 'Solo se aceptan archivos CSV (.csv, .txt) o Excel (.xlsx, .xls).');
    }
    // Un libro de Excel se guarda como CSV: el resto del motor trabaja siempre con datos.csv.
    let archivo = req.file.path;
    let hojaExcel = null;
    if (EXTENSIONES_EXCEL.has(extension)) {
      archivo = `${req.file.path}.csv`;
      try {
        hojaExcel = await motor.llamar('convertir_excel', { origen: req.file.path, destino: archivo, extension });
      } catch (fallo) {
        await fs.rm(archivo, { force: true });
        throw error(422, `No se pudo leer el libro de Excel: ${fallo.message}`);
      } finally {
        await fs.rm(req.file.path, { force: true });
      }
    }
    const nombre = (req.body?.nombre?.trim() || path.basename(req.file.originalname, extension)).slice(0, 80);
    const dataset = await almacen.crearDataset({ nombre, archivo, origen: 'mover' });
    try {
      const ruta = almacen.rutaDatos(dataset.id);
      const perfil = await motor.llamar('perfilar', { ruta, nombre });
      if (hojaExcel) {
        const otras = hojaExcel.hojas.length > 1 ? ` El libro tiene ${hojaExcel.hojas.length} hojas; se usó la primera con datos.` : '';
        perfil.avisos.unshift(`Se leyó la hoja «${hojaExcel.hoja}» del libro de Excel.${otras}`);
      }
      const validacion = await motor.llamar('validar_esquema', { ruta, esquema: perfil.esquema_sugerido });
      Object.assign(dataset, {
        archivo: req.file.originalname,
        filas: perfil.filas,
        columnas: perfil.columnas,
        perfil,
        esquema: perfil.esquema_sugerido,
        esquemaConfirmado: false,
        validacion,
      });
      await almacen.guardarDataset(dataset);
    } catch (fallo) {
      await almacen.eliminarDataset(dataset.id);
      throw error(422, `No se pudo leer el archivo: ${fallo.message}`);
    }
    res.status(201).json(dataset);
  });

  router.get('/:id', async (req, res) => {
    let dataset = await cargar(req.params.id);
    // Los perfiles anteriores al reporte inicial completo no traen tipos ni cuartiles: se recalculan una vez.
    if (dataset.perfil && dataset.perfil.perfil?.[0] && dataset.perfil.perfil[0].dtype === undefined) {
      const perfil = await motor.llamar('perfilar', { ruta: almacen.rutaDatos(dataset.id), nombre: dataset.nombre });
      dataset = await almacen.guardarDataset({ ...dataset, perfil: { ...perfil, avisos: dataset.perfil.avisos ?? perfil.avisos } });
    }
    const modelos = await almacen.listarModelos(dataset.id);
    res.json({ ...dataset, modelos, modeloActivo: modelos.find((m) => m.estado === 'listo')?.id ?? null });
  });

  router.patch('/:id', async (req, res) => {
    const { nombre } = z.object({ nombre: z.string().trim().min(1).max(80) }).parse(req.body);
    const dataset = await cargar(req.params.id);
    res.json(await almacen.guardarDataset({ ...dataset, nombre }));
  });

  router.delete('/:id', async (req, res) => {
    await cargar(req.params.id);
    for (const modelo of await almacen.listarModelos(req.params.id)) trabajos.cancelar(modelo.id);
    await almacen.eliminarDataset(req.params.id);
    res.status(204).end();
  });

  // --- Esquema -------------------------------------------------------------
  const CuerpoEsquema = z.object({ esquema: z.record(z.string(), z.unknown()) });

  router.post('/:id/esquema/validar', async (req, res) => {
    const { esquema } = CuerpoEsquema.parse(req.body);
    await cargar(req.params.id);
    res.json(await motor.llamar('validar_esquema', { ruta: almacen.rutaDatos(req.params.id), esquema }));
  });

  router.put('/:id/esquema', async (req, res) => {
    const { esquema } = CuerpoEsquema.parse(req.body);
    const dataset = await cargar(req.params.id);
    const validacion = await motor.llamar('validar_esquema', { ruta: almacen.rutaDatos(dataset.id), esquema });
    if (!validacion.ok) throw error(422, 'El esquema tiene errores.', { validacion });
    const guardado = await almacen.guardarDataset({ ...dataset, esquema, esquemaConfirmado: true, validacion });
    res.json(guardado);
  });

  router.post('/:id/esquema/sugerir', async (req, res) => {
    const dataset = await cargar(req.params.id);
    const controlador = new AbortController();
    res.on('close', () => !res.writableFinished && controlador.abort());
    const { esquema, avisos } = await sugerirEsquemaConIA({
      perfil: dataset.perfil,
      esquemaBase: dataset.perfil.esquema_sugerido,
      signal: controlador.signal,
    });
    const validacion = await motor.llamar('validar_esquema', { ruta: almacen.rutaDatos(dataset.id), esquema });
    res.json({ esquema, avisos, validacion });
  });

  // --- Exploración ---------------------------------------------------------
  async function datasetConEsquema(id) {
    const dataset = await cargar(id);
    if (!dataset.esquemaConfirmado) throw error(409, 'Confirme primero el esquema del dataset.');
    return dataset;
  }

  /** Para explorar basta un esquema válido, aunque no esté confirmado: el sugerido sirve para ver relaciones. */
  async function datasetExplorable(id) {
    const dataset = await cargar(id);
    if (!dataset.esquema || !(dataset.esquemaConfirmado || dataset.validacion?.ok)) {
      throw error(409, 'El esquema tiene errores: corríjalo en el paso 2 para explorar los datos codificados.');
    }
    return dataset;
  }

  router.get('/:id/estadisticas', async (req, res) => {
    const dataset = await datasetExplorable(req.params.id);
    const clave = `${dataset.id}:${JSON.stringify(dataset.esquema)}`;
    if (!cacheEstadisticas.has(clave)) {
      cacheEstadisticas.set(clave, await motor.llamar('estadisticas', { ruta: almacen.rutaDatos(dataset.id), esquema: dataset.esquema }));
    }
    res.json(cacheEstadisticas.get(clave));
  });

  router.get('/:id/normalizados', async (req, res) => {
    const dataset = await datasetExplorable(req.params.id);
    const { desde, cantidad } = z
      .object({ desde: z.coerce.number().int().min(0).default(0), cantidad: z.coerce.number().int().min(1).max(100).default(15) })
      .parse(req.query);
    res.json(await motor.llamar('normalizados', { ruta: almacen.rutaDatos(dataset.id), esquema: dataset.esquema, desde, cantidad }));
  });

  router.get('/:id/correlaciones', async (req, res) => {
    const dataset = await datasetExplorable(req.params.id);
    const { metodo } = z.object({ metodo: z.enum(['pearson', 'spearman', 'parcial']).default('spearman') }).parse(req.query);
    res.json(await motor.llamar('correlaciones', { ruta: almacen.rutaDatos(dataset.id), esquema: dataset.esquema, metodo }));
  });

  router.get('/:id/dispersion', async (req, res) => {
    const dataset = await datasetExplorable(req.params.id);
    const { x, y } = z.object({ x: z.string().min(1), y: z.string().min(1) }).parse(req.query);
    res.json(await motor.llamar('dispersion', { ruta: almacen.rutaDatos(dataset.id), esquema: dataset.esquema, x, y, max_puntos: 1500 }));
  });

  // Aristas que permite la estructura según los roles: base del editor de la máscara causal (paso 3).
  router.get('/:id/estructura', async (req, res) => {
    const dataset = await datasetConEsquema(req.params.id);
    res.json(await motor.llamar('estructura', { esquema: dataset.esquema }));
  });

  router.get('/:id/filas', async (req, res) => {
    const dataset = await cargar(req.params.id);
    const consulta = z
      .object({
        desde: z.coerce.number().int().min(0).default(0),
        cantidad: z.coerce.number().int().min(1).max(200).default(50),
        orden: z.string().optional(),
        desc: z.enum(['0', '1']).optional(),
        nivel: z.string().optional(),
        filtros: z.string().optional(),
      })
      .parse(req.query);
    let filtros = [];
    if (consulta.filtros) {
      try {
        filtros = JSON.parse(consulta.filtros);
      } catch {
        throw error(400, 'Filtros mal formados.');
      }
    }
    res.json(
      await motor.llamar('filas', {
        ruta: almacen.rutaDatos(dataset.id),
        esquema: dataset.esquemaConfirmado ? dataset.esquema : null,
        desde: consulta.desde,
        cantidad: consulta.cantidad,
        orden: consulta.orden || null,
        descendente: consulta.desc === '1',
        nivel: consulta.nivel || null,
        filtros,
      }),
    );
  });

  // --- Entrenamiento -------------------------------------------------------
  router.post('/:id/entrenar', async (req, res) => {
    const dataset = await datasetConEsquema(req.params.id);
    const opciones = OpcionesEntrenamiento.parse(req.body?.opciones ?? {});
    if (opciones.aristas_excluidas.length) {
      const { aristas } = await motor.llamar('estructura', { esquema: dataset.esquema });
      const permitidas = new Set(aristas.map((a) => `${a.origen}\u0000${a.destino}`));
      const desconocidas = opciones.aristas_excluidas.filter(([o, d]) => !permitidas.has(`${o}\u0000${d}`));
      if (desconocidas.length) {
        throw error(422, `La máscara causal incluye aristas que la estructura no tiene: ${desconocidas.map(([o, d]) => `${o} → ${d}`).join(', ')}.`);
      }
    }
    const modelo = await trabajos.iniciar({ dataset, opciones: opcionesMotor(opciones) });
    res.status(202).json({ ...modelo, opcionesInterfaz: opciones });
  });

  return router;
}
