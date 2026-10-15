// Bucle del agente contra un Ollama simulado: guardia, llamada a herramienta y respuesta en streaming.
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';

import { sujetoDe } from '../sujeto.js';

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

const HEART = {
  dataset: {
    nombre: 'heart',
    esquema: { columnas: [{ columna: 'chol', rol: 'accion', nombre: 'Colesterol' }, { columna: 'target', rol: 'objetivo', orden: ['0', '1'] }] },
    validacion: { sujeto: { singular: 'paciente', plural: 'pacientes', femenino: false } },
  },
  modelo: null,
  resultados: null,
};
const XAPI = { ...CTX, dataset: { ...CTX.dataset, validacion: { sujeto: { singular: 'estudiante', plural: 'estudiantes', femenino: false } } } };
const promptDeGuardia = () => peticiones.find((p) => !p.stream).messages[0].content;

test('la guardia toma el tema del dataset: acepta preguntas de pacientes y rechaza las ajenas', async () => {
  peticiones = [];
  enAlcance = true;
  respuestasStream = [[{ message: { role: 'assistant', content: 'Bajar el colesterol.' }, done: true }]];
  const eventos = [];
  await agente.ejecutarAgente({ mensajes: [{ rol: 'usuario', contenido: '¿Qué debe cambiar el paciente 213?' }], ctx: HEART, emitir: (e) => eventos.push(e) });
  assert.match(promptDeGuardia(), /analítica prescriptiva/);
  assert.match(promptDeGuardia(), /«heart»\. Cada registro es un paciente; el objetivo es target y las acciones son chol \(Colesterol\)/);
  assert.match(promptDeGuardia(), /sobre los pacientes \(uno concreto/);
  assert.doesNotMatch(promptDeGuardia(), /rendimiento académico/);
  assert.equal(eventos.filter((e) => e.tipo === 'texto').map((e) => e.delta).join(''), 'Bajar el colesterol.');
  assert.match(peticiones.find((p) => p.stream).messages[0].content, /Alcance: los datos de «heart» \(los pacientes/);

  // Fuera de tema: no llama al modelo principal y responde con el tema de los datos.
  peticiones = [];
  enAlcance = false;
  eventos.length = 0;
  await agente.ejecutarAgente({ mensajes: [{ rol: 'usuario', contenido: 'Dame una receta' }], ctx: HEART, emitir: (e) => eventos.push(e) });
  assert.equal(peticiones.filter((p) => p.stream).length, 0);
  assert.match(eventos.find((e) => e.tipo === 'texto').delta, /datos de «heart».*Analiza al paciente 14/);
  assert.equal(eventos.at(-1).fueraDeTema, true);
});

test('con estudiantes la guardia y los prompts conservan los términos educativos', async () => {
  peticiones = [];
  enAlcance = false;
  const eventos = [];
  await agente.ejecutarAgente({ mensajes: [{ rol: 'usuario', contenido: 'Dame una receta' }], ctx: XAPI, emitir: (e) => eventos.push(e) });
  assert.match(promptDeGuardia(), /rendimiento académico, deserción o permanencia escolar/);
  assert.match(promptDeGuardia(), /«¿y el estudiante 14\?»/);
  assert.equal(eventos.find((e) => e.tipo === 'texto').delta, agente.RESPUESTA_FUERA_DE_TEMA);
  const sistema = agente.construirPromptSistema('', agente.temaDe(XAPI));
  assert.match(sistema, /su rendimiento o en su riesgo de deserción/);
  assert.match(sistema, /prácticas pedagógicas concretas/);
  // Sin datos: alcance genérico.
  assert.match(agente.promptGuardia(null), /Todavía no hay datos cargados\.\n\nDentro del alcance: analítica prescriptiva/);
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

test('el contexto explica el sesgo aparte de los pesos y menciona la restricción por ausentismo', () => {
  const esquema = {
    columnas: [
      { columna: 'raisedhands', rol: 'accion' },
      { columna: 'StudentAbsenceDays', rol: 'mutable', nombre: 'Ausencias' },
      { columna: 'Class', rol: 'objetivo', orden: ['L', 'M', 'H'] },
    ],
  };
  const resultados = (sesgo, prescripcion) => ({
    metricas: {
      configuracion: { n_entrenamiento: 100, fcm: { lambda_: 1, ...(sesgo === undefined ? {} : { sesgo }) }, prescripcion },
      prediccion_fcm: { exactitud_rendimiento: 0.7, por_clase: {} },
      prescripcion: { n_estudiantes: 10, PSR_base: 10, PSR: 50 },
      validacion_externa: { PSR_externo_base: 8, PSR_externo: 40 },
    },
    graficas: {
      objetivo: 'Class',
      mejor_nivel: 'H',
      ...(sesgo === undefined ? {} : { sesgo }),
      conceptos: [{ columna: 'raisedhands', sesgo: 0 }, { columna: 'Class', sesgo: sesgo ? -0.42 : 0 }],
      influencias: [{ nombre: 'raisedhands', rol: 'accion', peso: 0.5 }],
    },
  });
  const contexto = (r) => agente.describirContexto({ dataset: { nombre: 'Prueba', esquema }, modelo: { id: 'md' }, resultados: r });

  const nuevo = contexto(resultados(true, { condicion_columna: 'StudentAbsenceDays', condicion_delta_max: 0.15 }));
  assert.match(nuevo, /Sesgo del objetivo: b = -0\.42\. .*no es una variable ni una influencia/);
  assert.match(nuevo, /hacia el peor nivel/);
  assert.match(nuevo, /Restricción por ausentismo: si StudentAbsenceDays \(Ausencias\).* 15 % de su rango/);
  assert.doesNotMatch(nuevo, /no tiene término de sesgo/);

  // Métricas antiguas: sin la clave sesgo ni la condición.
  const antiguo = contexto(resultados(undefined, { beta_esfuerzo: 0.05 }));
  assert.match(antiguo, /no tiene término de sesgo/);
  assert.doesNotMatch(antiguo, /Restricción por ausentismo/);
  // Condición desactivada (null) o columna ausente del esquema: sin restricción.
  assert.doesNotMatch(contexto(resultados(true, { condicion_columna: null, condicion_delta_max: 0.15 })), /Restricción/);
  assert.doesNotMatch(contexto(resultados(true, { condicion_columna: 'absences', condicion_delta_max: 0.15 })), /Restricción/);
});

test('el contexto menciona el perfil y, si existen, las métricas de reconstrucción', () => {
  assert.match(agente.describirPerfil({ fcm: {} }), /«mejorado»/); // Modelos anteriores a los perfiles.
  assert.match(agente.describirPerfil({ perfil: 'articulo', fcm: { inferencia: 'reescalada', activacion: 'tanh' } }), /«artículo».*reescalada con activación tangente hiperbólica/);
  assert.deepEqual(agente.describirReconstruccion(undefined), []);
  const [linea] = agente.describirReconstruccion({
    n: 120,
    global: { mae: 0.1234, mse: 0.02, rmse: 0.1414, r2: 0.61, psr_ec19: 0.875 },
    por_accion: [
      { nombre: 'Manos levantadas', p: 0.31 },
      { nombre: 'Recursos visitados', p: 0.001 },
      { nombre: 'Discusión', p: null },
    ],
  });
  assert.match(linea, /120 registros.*ecuación 19 0\.875 \(cociente.*MAE 0\.123, RMSE 0\.141, R² 0\.61/);
  assert.match(linea, /\(p > 0\.05\): Manos levantadas\. Con diferencia significativa: Recursos visitados\./);
});

test('el sujeto del modelo cambia el contexto y concuerda en género', () => {
  assert.deepEqual(sujetoDe(), { singular: 'registro', plural: 'registros', femenino: false, el: 'el', los: 'los', al: 'al', un: 'un', todos: 'todos los' });
  const persona = sujetoDe({ singular: 'persona', plural: 'personas', femenino: true });
  assert.equal(`${persona.un} ${persona.singular}, ${persona.todos} ${persona.plural}`, 'una persona, todas las personas');

  const esquema = { columnas: [{ columna: 'chol', rol: 'accion' }, { columna: 'target', rol: 'objetivo', orden: ['0', '1'] }] };
  const resultados = {
    metricas: {
      configuracion: { n_entrenamiento: 200, fcm: { lambda_: 1, sesgo: true }, prescripcion: { clases_a_prescribir: ['0'] } },
      prediccion_fcm: { exactitud_rendimiento: 0.8, por_clase: {} },
      prescripcion: { n_estudiantes: 42, PSR_base: 10, PSR: 20 },
      validacion_externa: { PSR_externo_base: 10, PSR_externo: 12 },
    },
    graficas: { objetivo: 'target', mejor_nivel: '1', niveles: { 1: 1, 0: 0 }, sesgo: true, conceptos: [{ columna: 'target', sesgo: 0.3 }], influencias: [{ nombre: 'chol', rol: 'accion', peso: -0.4 }] },
  };
  const paciente = sujetoDe({ singular: 'paciente', plural: 'pacientes', femenino: false });
  const texto = agente.describirContexto({ dataset: { nombre: 'heart', esquema }, modelo: { id: 'md' }, resultados, sujeto: paciente });
  assert.match(texto, /Cada registro es un paciente: habla de pacientes, no de estudiantes/);
  assert.match(texto, /Prescripción para 42 pacientes de prueba/);
  assert.match(texto, /Niveles del modelo, del peor al mejor: 0, 1\. .*resumen_prescripciones solo tiene registros de 0\./);
  assert.match(texto, /el paciente se acerca a 1/);
  assert.match(texto, /igual para todos los pacientes/);
  assert.doesNotMatch(texto, /estudiantes de prueba/);
  // Sin modelo, el sujeto sale de la validación del esquema (xAPI: estudiante).
  const xapi = { nombre: 'xAPI', esquema, validacion: { sujeto: { singular: 'estudiante', plural: 'estudiantes', femenino: false } } };
  assert.match(agente.describirContexto({ dataset: xapi }), /es un estudiante: habla de estudiantes, aunque/);
});

test('todas las llamadas usan el mismo tamaño de contexto (Ollama no recarga el modelo)', () => {
  const contextos = new Set(peticiones.map((p) => p.options.num_ctx));
  assert.equal(contextos.size, 1);
});
