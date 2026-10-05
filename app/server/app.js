// Aplicación Express: API local y archivos de la SPA.
import fs from 'node:fs';
import path from 'node:path';

import express from 'express';
import multer from 'multer';
import { ZodError } from 'zod';

import { OLLAMA_MODELO, WEB_DIST, rutaPython } from './config.js';
import { estadoOllama } from './ollama.js';
import { rutasChat } from './rutas/chat.js';
import { rutasDatasets } from './rutas/datasets.js';
import { rutasModelos } from './rutas/modelos.js';

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Solo peticiones hechas a la máquina local y desde páginas locales: una web
 * externa no puede usar la API aunque el navegador tenga acceso al puerto.
 */
export function protegerOrigen(req, res, next) {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  if (!HOSTS_LOCALES.has(host)) return res.status(403).json({ error: 'Solo se aceptan peticiones locales.' });
  const origen = req.headers.origin;
  if (origen) {
    let hostname = '';
    try {
      hostname = new URL(origen).hostname;
    } catch {
      /* origen mal formado */
    }
    if (!HOSTS_LOCALES.has(hostname)) return res.status(403).json({ error: 'Origen no permitido.' });
  }
  return next();
}

export function crearApp({ almacen, motor, trabajos }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(protegerOrigen);
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/estado', async (_req, res) => {
    const [ollama, motorPython] = await Promise.all([
      estadoOllama(),
      motor
        .llamar('ping', {}, { tiempoMaximoMs: 30_000 })
        .then((r) => ({ ok: true, ...r }))
        .catch((e) => ({ ok: false, error: e.message })),
    ]);
    res.json({ ollama, motor: { ...motorPython, ejecutable: rutaPython() }, modelo: OLLAMA_MODELO });
  });
  app.use('/api/datasets', rutasDatasets({ almacen, motor, trabajos }));
  app.use('/api/modelos', rutasModelos({ almacen, motor, trabajos }));
  app.use('/api/chat', rutasChat({ almacen, motor }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta de la API no encontrada.' }));

  // SPA compilada (npm run build). En desarrollo la sirve Vite.
  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(express.static(WEB_DIST, { index: false, maxAge: '1h' }));
    app.get('/{*ruta}', (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  } else {
    app.get('/', (_req, res) =>
      res.type('text/plain').send('La interfaz no está compilada. Ejecute "npm run build" o use "npm run dev" y abra http://localhost:5173.'),
    );
  }

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return res.end();
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Datos no válidos.', detalles: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    }
    if (error instanceof multer.MulterError) {
      const mensaje = error.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo permitido.' : error.message;
      return res.status(400).json({ error: mensaje });
    }
    const status = error.status ?? 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({ error: error.message, ...(error.validacion ? { validacion: error.validacion } : {}) });
  });
  return app;
}
