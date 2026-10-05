// Integración con el motor Python real (necesita el entorno .venv del proyecto).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

import { RAIZ_PROYECTO, rutaPython } from '../config.js';
import { Motor } from '../motor.js';

const motor = new Motor({ python: rutaPython(), cwd: RAIZ_PROYECTO, tiempoMaximoMs: 60_000 });
after(() => motor.detener());

test('el worker responde en paralelo y empareja cada respuesta por id', async () => {
  const [ping, esquema] = await Promise.all([motor.llamar('ping'), motor.llamar('esquema_xapi')]);
  assert.ok(ping.version);
  assert.equal(esquema.objetivo, 'Class');
});

test('perfila un CSV con punto y coma y sugiere el objetivo', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pizarra-motor-'));
  const ruta = path.join(dir, 'datos.csv');
  const filas = ['id;horas_estudio;asistencia;desercion'];
  for (let i = 0; i < 60; i++) filas.push(`E${i};${i % 20};${50 + (i % 50)};${i % 3 === 0 ? 'Sí' : 'No'}`);
  await fs.writeFile(ruta, filas.join('\n'), 'utf8');
  try {
    const perfil = await motor.llamar('perfilar', { ruta, nombre: 'prueba' });
    const roles = Object.fromEntries(perfil.esquema_sugerido.columnas.map((c) => [c.columna, c.rol]));
    assert.equal(perfil.filas, 60);
    assert.equal(roles.desercion, 'objetivo');
    assert.equal(roles.id, 'excluir');
    assert.equal(roles.horas_estudio, 'accion');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('estructura, correlaciones y dispersión con el dataset xAPI', async () => {
  const esquema = await motor.llamar('esquema_xapi');
  const estructura = await motor.llamar('estructura', { esquema });
  assert.equal(estructura.aristas.length, 15); // Las 15 fuentes fijas apuntan a Class.
  assert.ok(estructura.aristas.every((a) => a.destino === 'Class'));
  const ruta = path.join(RAIZ_PROYECTO, 'data', 'xAPI-Edu-Data-expanded-4800.csv');
  const corr = await motor.llamar('correlaciones', { ruta, esquema, metodo: 'spearman' });
  assert.equal(corr.matriz.length, 16);
  const dispersion = await motor.llamar('dispersion', { ruta, esquema, x: 'VisITedResources', y: 'raisedhands', max_puntos: 300 });
  assert.equal(dispersion.puntos.length, 300);
  assert.ok(dispersion.correlacion > 0.5);
});

test('los errores del motor llegan como rechazo con mensaje claro', async () => {
  await assert.rejects(motor.llamar('metodo_inexistente'), /Método desconocido/);
  // El worker sigue vivo después de un error.
  assert.ok((await motor.llamar('ping')).version);
});
