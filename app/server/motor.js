// Puente con el motor PRV-FCM en Python.
//
// - Motor: un proceso `python -m prvfcm.servicio worker` que vive mientras el
//   servidor funcione. Cada petición es una línea JSON por stdin y su respuesta
//   una línea JSON por stdout; se emparejan por id.
// - entrenar(): un proceso aparte por entrenamiento, para que las consultas no
//   esperen. Emite eventos de progreso (etapa, progreso, fin, error).
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import readline from 'node:readline';

const ENTORNO = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' };

export class ErrorMotor extends Error {
  constructor(mensaje, { status = 422 } = {}) {
    super(mensaje);
    this.status = status;
  }
}

function explicarFallo(error, python) {
  if (error?.code === 'ENOENT') {
    return `No se encontró Python en "${python}". Cree el entorno virtual del proyecto (.venv) o defina la variable PYTHON.`;
  }
  return error?.message ?? String(error);
}

export class Motor {
  #proceso = null;
  #pendientes = new Map();
  #siguienteId = 1;
  #stderr = '';

  constructor({ python, cwd, tiempoMaximoMs = 120_000 }) {
    this.python = python;
    this.cwd = cwd;
    this.tiempoMaximoMs = tiempoMaximoMs;
  }

  #iniciar() {
    const proceso = spawn(this.python, ['-u', '-m', 'prvfcm.servicio', 'worker'], {
      cwd: this.cwd,
      env: ENTORNO,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.#stderr = '';
    readline.createInterface({ input: proceso.stdout }).on('line', (linea) => this.#alResponder(linea));
    proceso.stderr.setEncoding('utf8');
    proceso.stderr.on('data', (texto) => {
      this.#stderr = (this.#stderr + texto).slice(-4000);
    });
    const alTerminar = (motivo) => {
      if (this.#proceso !== proceso) return;
      this.#proceso = null;
      const ultimas = this.#stderr.trim().split('\n').slice(-2).join(' ');
      this.#rechazarTodo(new ErrorMotor(`El motor Python se detuvo (${motivo}). ${ultimas}`.trim(), { status: 503 }));
    };
    proceso.on('error', (error) => alTerminar(explicarFallo(error, this.python)));
    proceso.on('exit', (codigo) => alTerminar(`código ${codigo}`));
    proceso.stdin.on('error', () => {}); // Si el proceso murió, 'exit' ya informa.
    this.#proceso = proceso;
  }

  #alResponder(linea) {
    let respuesta;
    try {
      respuesta = JSON.parse(linea);
    } catch {
      return; // Línea ajena al protocolo.
    }
    const pendiente = this.#pendientes.get(respuesta.id);
    if (!pendiente) return;
    this.#pendientes.delete(respuesta.id);
    clearTimeout(pendiente.temporizador);
    if (respuesta.ok) pendiente.resolver(respuesta.resultado);
    else pendiente.rechazar(new ErrorMotor(respuesta.error));
  }

  #rechazarTodo(error) {
    for (const { rechazar, temporizador } of this.#pendientes.values()) {
      clearTimeout(temporizador);
      rechazar(error);
    }
    this.#pendientes.clear();
  }

  llamar(metodo, params = {}, { tiempoMaximoMs = this.tiempoMaximoMs } = {}) {
    if (!this.#proceso) this.#iniciar();
    const id = this.#siguienteId++;
    return new Promise((resolver, rechazar) => {
      const temporizador = setTimeout(() => {
        this.#pendientes.delete(id);
        rechazar(new ErrorMotor(`El motor no respondió a "${metodo}" en ${tiempoMaximoMs / 1000} s.`, { status: 504 }));
        this.reiniciar(); // Un worker colgado bloquearía todas las consultas siguientes.
      }, tiempoMaximoMs);
      this.#pendientes.set(id, { resolver, rechazar, temporizador });
      this.#proceso.stdin.write(`${JSON.stringify({ id, metodo, params })}\n`);
    });
  }

  reiniciar() {
    const proceso = this.#proceso;
    this.#proceso = null;
    this.#rechazarTodo(new ErrorMotor('El motor se reinició; repita la consulta.', { status: 503 }));
    proceso?.kill();
  }

  detener() {
    this.#proceso?.stdin.end();
    this.#proceso = null;
  }
}

/**
 * Lanza un entrenamiento en un proceso propio.
 * Devuelve un EventEmitter con 'evento' (objeto del protocolo) y 'fin' (código de salida).
 */
export function entrenar({ python, cwd, datos, esquema, opciones, salida, registro }) {
  const emisor = new EventEmitter();
  const proceso = spawn(
    python,
    ['-u', '-m', 'prvfcm.servicio', 'entrenar', '--datos', datos, '--esquema', esquema, '--opciones', opciones, '--salida', salida],
    { cwd, env: ENTORNO, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  const log = fs.createWriteStream(registro, { flags: 'a' });
  proceso.stderr.pipe(log, { end: false }); // Se cierra en 'close', cuando ya no quedan líneas.
  readline.createInterface({ input: proceso.stdout }).on('line', (linea) => {
    try {
      emisor.emit('evento', JSON.parse(linea));
    } catch {
      log.write(`${linea}\n`);
    }
  });
  proceso.on('error', (error) => {
    emisor.emit('evento', { evento: 'error', mensaje: explicarFallo(error, python) });
  });
  proceso.on('close', (codigo) => {
    log.end();
    emisor.emit('fin', codigo);
  });
  emisor.cancelar = () => proceso.kill();
  return emisor;
}
