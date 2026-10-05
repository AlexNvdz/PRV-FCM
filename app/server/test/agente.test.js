// Bucle del agente contra un Ollama simulado: guardia, llamada a herramienta y respuesta en streaming.
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';

let servidor;
let peticiones = [];
let respuestasStream = [];
let enAlcance = true;
let agente;

function ndjson(res, fragmentos) {
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
  for (const f of fragmentos) res.write(`${JSON.stringify(f)}\n`);
  res.end();
}

before(async () => {
  servidor = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (d) => (cuerpo += d));
    req.on('end', () => {
      const datos = JSON.parse(cuerpo || '{}');
      peticiones.push(datos);
      if (!datos.stream) {
        // Guardia de tema: salida estructurada.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify({ en_alcance: enAlcance }) }, done: true }));
        return;
      }
      ndjson(res, respuestasStream.shift());
    });
  });
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  process.env.OLLAMA_URL = `http://127.0.0.1:${servidor.address().port}`;
  agente = await import('../agente.js');
});

after(() => servidor.close());

const CTX = {
  dataset: {
    nombre: 'Prueba',
    esquema: { columnas: [{ columna: 'raisedhands', rol: 'accion' }, { columna: 'Class', rol: 'objetivo', orden: ['L', 'M', 'H'] }] },
  },
  modelo: null,
  resultados: null,
};

test('el agente llama una herramienta y responde con su resultado', async () => {
  peticiones = [];
  enAlcance = true;
  respuestasStream = [
    [{ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'resumen_modelo', arguments: {} } }] }, done: true }],
    [{ message: { role: 'assistant', content: 'Todavía no hay ' }, done: false }, { message: { role: 'assistant', content: 'modelo.' }, done: true }],
  ];
  const eventos = [];
  await agente.ejecutarAgente({ mensajes: [{ rol: 'usuario', contenido: '¿Qué tan bueno es el modelo?' }], ctx: CTX, emitir: (e) => eventos.push(e) });

  const tipos = eventos.map((e) => e.tipo);
  assert.deepEqual(tipos.filter((t) => t !== 'estado'), ['herramienta', 'resultado', 'texto', 'texto', 'fin']);
  assert.equal(eventos.find((e) => e.tipo === 'resultado').ok, false); // Sin modelo: la herramienta explica el error.
  assert.equal(eventos.filter((e) => e.tipo === 'texto').map((e) => e.delta).join(''), 'Todavía no hay modelo.');

  // La segunda llamada en streaming lleva el resultado de la herramienta.
  const segunda = peticiones.filter((p) => p.stream)[1];
  const mensajeHerramienta = segunda.messages.at(-1);
  assert.equal(mensajeHerramienta.role, 'tool');
  assert.equal(mensajeHerramienta.tool_name, 'resumen_modelo');
  assert.match(mensajeHerramienta.content, /No hay un modelo PRV-FCM entrenado/);
  assert.ok(segunda.tools.some((t) => t.function.name === 'analizar_estudiante'));
  assert.match(segunda.messages[0].content, /Eres Pizarra/);
});

test('la guardia responde sin llamar al modelo principal si el tema no corresponde', async () => {
  peticiones = [];
  enAlcance = false;
  const eventos = [];
  await agente.ejecutarAgente({ mensajes: [{ rol: 'usuario', contenido: 'Dame una receta' }], ctx: CTX, emitir: (e) => eventos.push(e) });
  assert.equal(peticiones.filter((p) => p.stream).length, 0);
  assert.equal(eventos.find((e) => e.tipo === 'texto').delta, agente.RESPUESTA_FUERA_DE_TEMA);
  assert.equal(eventos.at(-1).fueraDeTema, true);
});

test('redactarRecomendacion convierte una prescripción en texto sin herramientas', async () => {
  peticiones = [];
  respuestasStream = [
    [{ message: { role: 'assistant', content: '**Situación**: ' }, done: false }, { message: { role: 'assistant', content: 'nivel L.' }, done: true }],
  ];
  const eventos = [];
  await agente.redactarRecomendacion({
    tipo: 'individual',
    datos: {
      sujeto: 'el estudiante 14',
      prescripcion: {
        base: { activacion: 0.21, nivel: 'L' },
        prescrito: { activacion: 0.8, nivel: 'H' },
        meta: { nivel: 'H' },
        acciones: [
          { nombre: 'Recursos visitados', actual: { valor: 10 }, recomendada: { valor: 70 }, cambio: 60, min: 0, max: 100 },
          { nombre: 'Discusión', actual: { valor: 30 }, recomendada: { valor: 30 }, cambio: 0, min: 0, max: 100 },
        ],
        contribuciones: [{ nombre: 'Ausentismo', rol: 'mutable', aporte_prescrito: -0.9 }],
        reporte: { texto: 'Para el estudiante 14 se recomienda aumentar Recursos visitados de 10 a 70.' },
      },
    },
    contexto: { objetivo: 'Class', mejorNivel: 'H' },
    emitir: (e) => eventos.push(e),
  });
  assert.deepEqual(eventos.map((e) => e.tipo), ['estado', 'texto', 'texto', 'fin']);
  const peticion = peticiones[0];
  assert.equal(peticion.tools, undefined);
  const datos = JSON.parse(peticion.messages[1].content.split('Datos:\n')[1]);
  assert.equal(datos.acciones[1].nota, 'sin cambio');
  assert.equal(datos.acciones[0].cambio_grande, true);
  assert.equal(datos.activacion_actual, undefined); // Sin activaciones sueltas que el modelo lea como porcentajes.
  assert.equal(datos.factores_del_sistema_que_frenan[0].variable, 'Ausentismo');
  assert.match(datos.reporte_del_modelo, /estudiante 14/);
});

test('todas las llamadas usan el mismo tamaño de contexto (Ollama no recarga el modelo)', () => {
  const contextos = new Set(peticiones.map((p) => p.options.num_ctx));
  assert.equal(contextos.size, 1);
});
