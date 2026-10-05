// Pruebas de piezas sin servicios externos: seguridad, columnas, herramientas y almacén.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { Almacen } from '../almacen.js';
import { protegerOrigen } from '../app.js';
import { ejecutarHerramienta, leerCorrelaciones } from '../herramientas.js';
import { crearBuscadorColumnas } from '../rutas/chat.js';
import { opcionesMotor, OpcionesEntrenamiento } from '../rutas/datasets.js';

function probarOrigen(headers) {
  let status = 200;
  let siguio = false;
  const res = { status: (s) => ((status = s), res), json: () => res };
  protegerOrigen({ headers }, res, () => (siguio = true));
  return { status, siguio };
}

test('solo acepta peticiones locales', () => {
  assert.equal(probarOrigen({ host: 'localhost:3001' }).siguio, true);
  assert.equal(probarOrigen({ host: '127.0.0.1:3001', origin: 'http://localhost:5173' }).siguio, true);
  assert.equal(probarOrigen({ host: 'localhost:3001', origin: 'https://sitio-externo.example' }).status, 403);
  assert.equal(probarOrigen({ host: 'atacante.example:3001' }).status, 403);
});

const ESQUEMA = {
  columnas: [
    { columna: 'raisedhands', rol: 'accion', nombre: 'Manos levantadas' },
    { columna: 'Class', rol: 'objetivo' },
    { columna: 'PlaceofBirth', rol: 'excluir' },
  ],
};

test('el buscador de columnas acepta nombre exacto, visible o sin tildes', () => {
  const buscar = crearBuscadorColumnas(ESQUEMA);
  assert.equal(buscar('raisedhands'), 'raisedhands');
  assert.equal(buscar('RaisedHands'), 'raisedhands');
  assert.equal(buscar('manos levantadas'), 'raisedhands');
  assert.throws(() => buscar('nota'), /No existe la columna «nota».*raisedhands, Class/);
});

test('las herramientas devuelven errores legibles para que el modelo corrija', async () => {
  assert.match((await ejecutarHerramienta('no_existe', {}, {})).error, /No existe la herramienta/);
  const sinModelo = await ejecutarHerramienta('resumen_modelo', {}, { modelo: null });
  assert.match(sinModelo.error, /No hay un modelo PRV-FCM entrenado/);
  const malos = await ejecutarHerramienta('analizar_estudiante', { id_estudiante: 'abc' }, { modelo: {} });
  assert.match(malos.error, /Argumentos no válidos/);
});

test('analizar_estudiante acepta "id" como alias de id_estudiante', async () => {
  const llamadas = [];
  const prescripcion = {
    base: { activacion: 0.2, nivel: 'L' },
    prescrito: { activacion: 0.6, nivel: 'M' },
    acciones: [{ nombre: 'Manos levantadas', columna: 'raisedhands', actual: { valor: 5 }, recomendada: { valor: 40 }, cambio: 35 }],
  };
  const ctx = {
    modelo: { id: 'md-prueba' },
    rutaDatos: 'datos.csv',
    rutaModelo: 'modelo.json',
    dataset: { esquema: ESQUEMA },
    emitir: () => {},
    motor: {
      llamar: async (metodo, params) => {
        llamadas.push([metodo, params]);
        return metodo === 'estudiante' ? { registro: {}, nivel_observado: 'L', en_prueba: true } : prescripcion;
      },
    },
  };
  const resultado = await ejecutarHerramienta('analizar_estudiante', { id: 14 }, ctx);
  assert.equal(resultado.id_estudiante, 14);
  assert.match(resultado.lectura, /no es una probabilidad/);
  assert.ok(llamadas.every(([, params]) => params.id === 14));
  assert.ok(llamadas.some(([metodo, params]) => metodo === 'prescribir' && params.beta === 0.4));
});

test('la validación cruzada rápida usa una rejilla pequeña', () => {
  const rapida = opcionesMotor(OpcionesEntrenamiento.parse({ validacion_cruzada: 'rapida' }));
  assert.deepEqual(rapida.rejilla_lambda, [0.5, 1, 2]);
  assert.equal(rapida.validacion_cruzada, true);
  assert.equal(opcionesMotor(OpcionesEntrenamiento.parse({ validacion_cruzada: 'ninguna' })).validacion_cruzada, false);
  assert.throws(() => OpcionesEntrenamiento.parse({ proporcion_prueba: 0.9 }));
});

test('las opciones aceptan el método de pesos y la máscara causal', () => {
  const porDefecto = OpcionesEntrenamiento.parse({});
  assert.equal(porDefecto.metodo_pesos, 'bptt');
  assert.deepEqual(porDefecto.aristas_excluidas, []);
  const ridge = opcionesMotor(OpcionesEntrenamiento.parse({ metodo_pesos: 'ridge', aristas_excluidas: [['gender', 'Class']] }));
  assert.equal(ridge.metodo_pesos, 'ridge');
  assert.deepEqual(ridge.aristas_excluidas, [['gender', 'Class']]);
  assert.throws(() => OpcionesEntrenamiento.parse({ metodo_pesos: 'pso' }));
  assert.throws(() => OpcionesEntrenamiento.parse({ aristas_excluidas: [['solo-origen']] }));
});

test('leerCorrelaciones ordena por fuerza y omite el objetivo e indicadores de una misma columna', () => {
  const corr = {
    conceptos: [
      { nombre: 'Género: F', rol: 'inmutable', origen: 'genero' },
      { nombre: 'Género: M', rol: 'inmutable', origen: 'genero' },
      { nombre: 'Horas', rol: 'accion', origen: 'horas' },
      { nombre: 'Nota', rol: 'objetivo', origen: 'nota' },
    ],
    matriz: [
      [1, -1, 0.1, -0.2],
      [-1, 1, -0.1, 0.2],
      [0.1, -0.1, 1, 0.6],
      [-0.2, 0.2, 0.6, 1],
    ],
  };
  const { conObjetivo, pares } = leerCorrelaciones(corr, 5);
  assert.deepEqual(conObjetivo.map((f) => f.variable), ['Horas', 'Género: F', 'Género: M']);
  assert.ok(pares.every((p) => !(p.a.startsWith('Género') && p.b.startsWith('Género'))));
  assert.equal(pares[0].r, 0.1);
});

function ctxConModelo(respuestas, eventos = []) {
  const llamadas = [];
  return {
    llamadas,
    eventos,
    ctx: {
      modelo: { id: 'md-prueba' },
      rutaDatos: 'datos.csv',
      rutaModelo: 'modelo.json',
      dirModelo: 'almacen/modelos/md-prueba',
      dataset: { esquema: ESQUEMA },
      resultados: { graficas: { acciones: [{ columna: 'raisedhands', min: 0, max: 100 }] } },
      columnaReal: crearBuscadorColumnas(ESQUEMA),
      emitir: (e) => eventos.push(e),
      motor: {
        llamar: async (metodo, params) => {
          llamadas.push([metodo, params]);
          return respuestas[metodo];
        },
      },
    },
  };
}

test('resumen_prescripciones lee las prescripciones del modelo y emite la gráfica de acciones', async () => {
  assert.match((await ejecutarHerramienta('resumen_prescripciones', {}, { modelo: null })).error, /No hay un modelo/);
  const { ctx, llamadas, eventos } = ctxConModelo({
    resumen_prescripciones: {
      n: 982,
      pct_exito: 59.2,
      texto: 'El algoritmo genético prescribió acciones a 982 registros.',
      acciones: [{ columna: 'raisedhands', nombre: 'Manos levantadas', actual_media: 30, recomendada_media: 90, pct_aumenta: 97, pct_igual: 3 }],
      por_nivel: [{ nivel: 'L', n: 400, pct_exito: 30 }],
      ejemplos: [{ id_estudiante: 14, nivel_observado: 'L', nivel_prescrito: 'H' }],
      nota: 'Asociación, no causa.',
    },
  });
  const resultado = await ejecutarHerramienta('resumen_prescripciones', { nivel: 'L' }, ctx);
  assert.equal(resultado.llegan_al_mejor_nivel, '59.2 %');
  assert.deepEqual(llamadas[0], ['resumen_prescripciones', { directorio: 'almacen/modelos/md-prueba', nivel: 'L' }]);
  assert.equal(eventos[0].grafica, 'acciones');
  assert.equal(eventos[0].datos[0].max, 100);
});

test('prescribir_perfil parte del perfil base, cambia los valores pedidos y usa el plan moderado', async () => {
  const prescripcion = {
    base: { activacion: 0.2, nivel: 'L' },
    prescrito: { activacion: 0.6, nivel: 'M' },
    meta: { nivel: 'H' },
    reporte: { texto: 'Para este perfil se recomienda aumentar Manos levantadas de 5 a 40.' },
    acciones: [{ nombre: 'Manos levantadas', columna: 'raisedhands', actual: { valor: 5 }, recomendada: { valor: 40 }, cambio: 35 }],
  };
  const { ctx, llamadas, eventos } = ctxConModelo({
    perfil_base: { origen: 'registro 3', valores: { raisedhands: 20, PlaceofBirth: 'KW' } },
    prescribir_perfil: prescripcion,
  });
  const resultado = await ejecutarHerramienta('prescribir_perfil', { id: 3, valores: { 'Manos levantadas': 5 } }, ctx);
  assert.equal(resultado.partida, 'registro 3');
  // Un id nulo significa "sin estudiante": se parte del perfil típico, no del registro 0.
  await ejecutarHerramienta('prescribir_perfil', { id_estudiante: null, valores: {} }, ctx);
  assert.equal(llamadas.filter(([m]) => m === 'perfil_base').at(-1)[1].id, null);
  assert.match(resultado.reporte, /Para este perfil/);
  const [, params] = llamadas.find(([m]) => m === 'prescribir_perfil');
  assert.deepEqual(params.perfil, { raisedhands: 5, PlaceofBirth: 'KW' });
  assert.equal(params.beta, 0.4);
  assert.deepEqual(llamadas[0][1].id, 3);
  assert.equal(eventos[0].tipo, 'perfil');
});

test('el almacén crea, lista y elimina datasets con sus modelos', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'pizarra-'));
  try {
    const almacen = new Almacen(raiz);
    await almacen.iniciar();
    const origen = path.join(raiz, 'origen.csv');
    await fs.writeFile(origen, 'a,b\n1,2\n');
    const dataset = await almacen.crearDataset({ nombre: 'Prueba', archivo: origen, origen: 'copiar' });
    const modelo = await almacen.crearModelo({ datasetId: dataset.id, opciones: {} });
    assert.equal((await almacen.listarDatasets()).length, 1);
    assert.equal((await almacen.listarModelos(dataset.id))[0].id, modelo.id);
    await almacen.eliminarDataset(dataset.id);
    assert.equal((await almacen.listarDatasets()).length, 0);
    assert.equal((await almacen.listarModelos()).length, 0);
    assert.throws(() => almacen.dirDataset('../fuera'), /no válido/);
  } finally {
    await fs.rm(raiz, { recursive: true, force: true });
  }
});
