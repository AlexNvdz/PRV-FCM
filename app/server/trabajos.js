// Entrenamientos en curso: lanza el proceso Python, guarda su avance en el
// meta del modelo y reenvía cada evento a quienes lo estén mirando (SSE).
import fs from 'node:fs/promises';
import path from 'node:path';

import { entrenar } from './motor.js';

const MAX_EVENTOS = 60;

export class Trabajos {
  #activos = new Map(); // modeloId -> { proceso, suscriptores: Set<fn> }

  constructor({ almacen, python, cwd }) {
    this.almacen = almacen;
    this.python = python;
    this.cwd = cwd;
  }

  estaActivo(modeloId) {
    return this.#activos.has(modeloId);
  }

  async iniciar({ dataset, opciones }) {
    const meta = await this.almacen.crearModelo({ datasetId: dataset.id, opciones });
    const dir = this.almacen.dirModelo(meta.id);
    const rutaEsquema = path.join(dir, 'esquema.json');
    const rutaOpciones = path.join(dir, 'opciones.json');
    await Promise.all([
      fs.writeFile(rutaEsquema, JSON.stringify(dataset.esquema), 'utf8'),
      fs.writeFile(rutaOpciones, JSON.stringify(opciones), 'utf8'),
    ]);
    const inicio = Date.now();
    const proceso = entrenar({
      python: this.python,
      cwd: this.cwd,
      datos: this.almacen.rutaDatos(dataset.id),
      esquema: rutaEsquema,
      opciones: rutaOpciones,
      salida: dir,
      registro: path.join(dir, 'registro.log'),
    });
    const trabajo = { proceso, suscriptores: new Set(), meta };
    this.#activos.set(meta.id, trabajo);

    let guardando = Promise.resolve();
    const guardar = () => {
      guardando = guardando.then(() => this.almacen.guardarModelo(trabajo.meta)).catch(() => {});
      return guardando;
    };

    proceso.on('evento', (evento) => {
      const eventos = trabajo.meta.eventos;
      // Solo el último progreso de cada tarea; las etapas se conservan todas.
      const previo = evento.evento === 'progreso' ? eventos.findIndex((e) => e.evento === 'progreso' && e.tarea === evento.tarea) : -1;
      if (previo >= 0) eventos[previo] = evento;
      else eventos.push(evento);
      trabajo.meta.eventos = eventos.slice(-MAX_EVENTOS);
      if (evento.evento === 'error') trabajo.meta.error = evento.mensaje;
      this.#notificar(trabajo, { tipo: 'evento', evento });
      if (evento.evento !== 'progreso') guardar();
    });

    proceso.on('fin', async (codigo) => {
      const listo = codigo === 0 && !trabajo.meta.error;
      trabajo.meta = {
        ...trabajo.meta,
        estado: listo ? 'listo' : 'error',
        error: listo ? undefined : (trabajo.meta.error ?? `El entrenamiento terminó con código ${codigo}. Revise registro.log.`),
        duracionMs: Date.now() - inicio,
      };
      await guardar();
      this.#activos.delete(meta.id);
      this.#notificar(trabajo, { tipo: 'fin', modelo: trabajo.meta });
    });
    return meta;
  }

  suscribir(modeloId, funcion) {
    const trabajo = this.#activos.get(modeloId);
    if (!trabajo) return null;
    trabajo.suscriptores.add(funcion);
    return () => trabajo.suscriptores.delete(funcion);
  }

  cancelar(modeloId) {
    this.#activos.get(modeloId)?.proceso.cancelar();
  }

  #notificar(trabajo, mensaje) {
    for (const funcion of trabajo.suscriptores) funcion(mensaje);
  }
}
