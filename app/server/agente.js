// Asistente Pizarra: qwen2.5 en Ollama con herramientas sobre los datos y el modelo PRV-FCM.
//
// 1. Guardia de tema: una llamada corta con salida JSON decide si el último
//    mensaje está dentro del alcance (rendimiento, deserción, el proyecto).
// 2. Bucle de herramientas: el modelo responde en streaming; si pide
//    herramientas, se ejecutan y su resultado vuelve al modelo (máximo 5 rondas).
// 3. Redacción directa (redactarRecomendacion): sin herramientas, convierte una
//    prescripción ya calculada en recomendaciones pedagógicas.
import { chatJson, chatStream } from './ollama.js';
import { definicionesHerramientas, ejecutarHerramienta } from './herramientas.js';
import { sujetoDe } from './sujeto.js';

const NOMBRE_METODO = { bptt: 'BPTT (gradiente exacto)', pso: 'PSO (enjambre de partículas)' };

export const MAX_RONDAS = 5;

// Respuesta fuera de tema con datos de estudiantes (rendimiento o deserción): la de siempre.
export const RESPUESTA_FUERA_DE_TEMA =
  'Solo puedo ayudarte con rendimiento académico, deserción escolar y el modelo PRV-FCM de este proyecto. ' +
  'Por ejemplo: «¿Qué acciones mejoran más el rendimiento?» o «Analiza al estudiante 14».';

const TERMINOS_PRV_FCM =
  'el modelo PRV-FCM y sus términos (pesos, sesgo, activación, β, niveles, prescripción, restricción por ausentismo), mapas cognitivos difusos, algoritmos genéticos';

/** Tema del dataset activo para la guardia y los prompts: nombre, objetivo, sujeto y acciones. Sin datos, null. */
export function temaDe({ dataset, sujeto } = {}) {
  if (!dataset) return null;
  const columnas = dataset.esquema?.columnas ?? [];
  const legible = (c) => (c.nombre && c.nombre !== c.columna ? `${c.columna} (${c.nombre})` : c.columna);
  const objetivo = columnas.find((c) => c.rol === 'objetivo');
  const s = sujeto ?? sujetoDe(dataset.validacion?.sujeto ?? dataset.esquema?.sujeto);
  return {
    nombre: dataset.nombre,
    objetivo: objetivo ? legible(objetivo) : null,
    acciones: columnas.filter((c) => c.rol === 'accion').map(legible),
    s,
    // Con estudiantes (xAPI, deserción) se conservan los términos educativos de siempre.
    educativo: s.singular === 'estudiante',
  };
}

function lineaTema(tema) {
  return (
    `Datos activos: «${tema.nombre}». Cada registro es ${tema.s.un} ${tema.s.singular}` +
    (tema.objetivo ? `; el objetivo es ${tema.objetivo}` : '') +
    (tema.acciones.length ? ` y las acciones son ${tema.acciones.join(', ')}` : '') +
    '.'
  );
}

export function promptGuardia(tema) {
  const alcance = tema
    ? `cualquier pregunta sobre esos datos, su objetivo, sus variables y acciones o sobre ${tema.s.los} ${tema.s.plural} (uno concreto, un grupo o todos)` +
      (tema.educativo ? ', rendimiento académico, deserción o permanencia escolar, docentes, cursos, aprendizaje, hábitos de estudio, asistencia, intervenciones pedagógicas' : '') +
      `, análisis o gráficas de los datos, ${TERMINOS_PRV_FCM}, los datos cargados en la aplicación y el uso de la aplicación`
    : `analítica prescriptiva, ${TERMINOS_PRV_FCM}, cómo cargar y explorar datos y el uso de la aplicación`;
  return `Eres un filtro de temas para un asistente de analítica prescriptiva. Decide si el último mensaje del usuario está dentro del alcance.

${tema ? lineaTema(tema) : 'Todavía no hay datos cargados.'}

Dentro del alcance: ${alcance}. También saludos, agradecimientos, preguntas sobre qué puede hacer el asistente y continuaciones de la conversación (por ejemplo ${tema ? `«¿y ${tema.s.el} ${tema.s.singular} 14?»` : '«¿y eso qué significa?»'} o «explícalo mejor»).

Fuera del alcance: cualquier tema sin relación con ${tema ? 'esos datos' : 'el análisis de datos'} ni con la aplicación (recetas, deportes, política, programación general, tareas personales, chistes, etc.).

Responde solo con JSON: {"en_alcance": true} o {"en_alcance": false}.`;
}

export function respuestaFueraDeTema(tema) {
  if (tema?.educativo) return RESPUESTA_FUERA_DE_TEMA;
  if (!tema) return 'Solo puedo ayudarte con analítica prescriptiva, el modelo PRV-FCM y esta aplicación. Por ejemplo: «¿Qué es PRV-FCM y cómo prescribe acciones?».';
  return (
    `Solo puedo ayudarte con los datos de «${tema.nombre}», el modelo PRV-FCM y esta aplicación. ` +
    `Por ejemplo: «¿Qué acciones acercan más a ${tema.s.los} ${tema.s.plural} al mejor nivel?» o «Analiza ${tema.s.al} ${tema.s.singular} 14».`
  );
}

const ESQUEMA_GUARDIA = {
  type: 'object',
  properties: { en_alcance: { type: 'boolean' } },
  required: ['en_alcance'],
};

/** true si el último mensaje está dentro del alcance. Si la guardia falla, deja pasar el mensaje. */
export async function estaEnAlcance(mensajes, { signal, tema = null } = {}) {
  const recientes = mensajes.slice(-4, -1).map((m) => `[${m.rol}]: ${m.contenido.slice(0, 400)}`).join('\n');
  const ultimo = mensajes.at(-1)?.contenido ?? '';
  try {
    const respuesta = await chatJson({
      mensajes: [
        { role: 'system', content: promptGuardia(tema) },
        { role: 'user', content: `${recientes ? `Conversación reciente:\n${recientes}\n\n` : ''}Último mensaje del usuario: «${ultimo}»` },
      ],
      esquema: ESQUEMA_GUARDIA,
      opciones: { num_predict: 20 },
      signal,
    });
    return respuesta.en_alcance !== false;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return true;
  }
}

export function construirPromptSistema(contexto, tema = null) {
  const cada = tema?.s.singular ?? 'registro';
  const alcance = tema?.educativo
    ? 'rendimiento académico, deserción y permanencia escolar, hábitos y participación de los estudiantes, intervenciones pedagógicas, el modelo PRV-FCM y los datos cargados en la aplicación'
    : tema
      ? `los datos de «${tema.nombre}» (${tema.s.los} ${tema.s.plural}, su objetivo, sus variables y acciones), el modelo PRV-FCM y la aplicación`
      : 'analítica prescriptiva, el modelo PRV-FCM y la aplicación';
  const practicas = tema?.educativo
    ? 'prácticas pedagógicas concretas (tutorías, seguimiento de la asistencia, participación en clase, comunicación con la familia)'
    : 'prácticas concretas propias del tema de los datos, sin inventar cifras';
  return `Eres Pizarra, el asistente de analítica prescriptiva de este proyecto. Trabajas con el modelo PRV-FCM: un mapa cognitivo difuso (FCM) aprende de los datos cómo influyen las variables de cada ${cada} en ${tema?.educativo ? 'su rendimiento o en su riesgo de deserción' : 'el objetivo'}, y un algoritmo genético (AG) busca los cambios en las acciones que llevarían a cada ${cada} al mejor nivel.

Alcance: ${alcance}. Si te piden algo fuera de ese alcance, responde en una sola frase que solo atiendes esos temas y propone una pregunta útil sobre los datos.

Conceptos del mapa (notación PRV-FCM): C_T es el concepto objetivo; C_P, los conceptos prescriptivos o acciones que el AG puede cambiar; C_S, los conceptos del sistema (inmutables y mutables) que no se controlan directamente.

Cómo trabajas:
- Responde siempre en español, con frases claras y cortas. Usa listas cuando ayuden.
- Para cualquier cifra, registro o comparación, usa las herramientas. Nunca inventes datos, registros, columnas ni métricas.
- Cita las cifras que usas (por ejemplo: «exactitud del FCM: 72.1 %»).
- Cada registro se identifica por su id (el argumento id_estudiante): la fila del archivo.
- Qué herramienta usar: recomendaciones generales o por nivel → resumen_prescripciones; un registro concreto → analizar_estudiante; un perfil hipotético («un estudiante con más de 7 ausencias que casi no visita recursos») → prescribir_perfil; panorama de cómo se relacionan todas las variables → correlaciones_variables; la relación entre dos variables que el usuario nombra → relacion_variables con x e y.
- Si una herramienta devuelve un campo «reporte» o «texto», úsalo como base de tu respuesta y conserva sus cifras.
- Si una herramienta devuelve «error», lee el mensaje, corrige los argumentos (por ejemplo, usa un nivel de la lista válida) y vuelve a llamarla una vez.
- Al recomendar, combina la prescripción del modelo con ${practicas} y explica el porqué.
- Para un registro concreto, recomienda el plan moderado y menciona el plan máximo solo como techo. No recomiendes cambiar una acción que la prescripción deja igual: el modelo no espera un beneficio que compense el esfuerzo de cambiarla.
- Si un cambio recomendado es muy grande, propón metas intermedias realistas y un seguimiento periódico.
- Si un resultado trae una restricción por ausentismo, menciónala con su texto: explica que por eso el plan sube poco las acciones${tema?.educativo ? " y que la asistencia es lo primero que conviene atender" : ""}. Si no la trae, no hables de restricciones.
- La activación del FCM va de 0 a 1 e indica cercanía al mejor nivel; no es una probabilidad. Habla de niveles.
- Aclara cuando convenga que el modelo muestra asociaciones en los datos, no causas comprobadas.
- Si no hay un modelo entrenado, dilo y sugiere entrenarlo en la vista «Modelo» (paso 3 del flujo).

${contexto}`;
}

/** Media del recall de cada nivel: con objetivos desbalanceados dice más que la exactitud simple. */
export function exactitudEquilibrada(prediccion) {
  const clases = Object.values(prediccion?.por_clase ?? {});
  return clases.length ? clases.reduce((s, c) => s + c.recall, 0) / clases.length : 0;
}

function formatearPesos(influencias, mejor) {
  return (
    influencias
      .map((i) => `${i.nombre} (${i.peso >= 0 ? '+' : ''}${i.peso.toFixed(2)}: aumentarla ${i.peso >= 0 ? 'acerca a' : 'aleja de'} ${mejor})`)
      .join(', ') || 'ninguna'
  );
}

/** Resumen compacto del dataset y del modelo activos para el prompt del sistema. */
export function describirContexto({ dataset, modelo, resultados, sujeto }) {
  if (!dataset) return 'Contexto: todavía no hay datos cargados.';
  const esquema = dataset.esquema;
  const s = sujeto ?? sujetoDe(dataset.validacion?.sujeto ?? esquema?.sujeto);
  const lineas = [
    `Contexto actual:`,
    `- Datos activos: «${dataset.nombre}». Cada registro es ${s.un} ${s.singular}: habla de ${s.plural}${s.singular === 'estudiante' ? '' : ', no de estudiantes'}, aunque el argumento de las herramientas se llame id_estudiante.`,
  ];
  if (esquema) {
    const objetivo = esquema.columnas.find((c) => c.rol === 'objetivo');
    const niveles = objetivo?.orden?.join(' < ') ?? Object.keys(esquema.niveles ?? {}).join(' < ');
    const nombres = (rol) =>
      esquema.columnas.filter((c) => c.rol === rol).map((c) => (c.nombre && c.nombre !== c.columna ? `${c.columna} (${c.nombre})` : c.columna));
    lineas.push(`- Objetivo (C_T): ${objetivo?.columna} con niveles ${niveles} (el último es el mejor).`);
    lineas.push(`- Acciones (C_P) que el AG puede cambiar: ${nombres('accion').join(', ') || 'ninguna'}.`);
    lineas.push(`- Conceptos del sistema (C_S) mutables: ${nombres('mutable').join(', ') || 'ninguna'}. Inmutables: ${nombres('inmutable').join(', ') || 'ninguna'}.`);
  }
  if (!modelo || !resultados?.metricas) {
    lineas.push('- Modelo PRV-FCM: no entrenado todavía.');
    return lineas.join('\n');
  }
  const { metricas, graficas } = resultados;
  const pred = metricas.prediccion_fcm;
  const presc = metricas.prescripcion;
  const ext = metricas.validacion_externa;
  const metodo = NOMBRE_METODO[metricas.configuracion.fcm.metodo_pesos ?? 'bptt'] ?? metricas.configuracion.fcm.metodo_pesos;
  const excluidas = metricas.configuracion.aristas_excluidas?.length ?? 0;
  const equilibrada = exactitudEquilibrada(pred);
  const nivelesModelo = Object.entries(graficas.niveles ?? {}).sort((a, b) => a[1] - b[1]).map(([n]) => n);
  lineas.push(
    `- Niveles del modelo, del peor al mejor: ${nivelesModelo.join(', ')}. Los argumentos nivel y nivel_meta usan estos nombres exactos; resumen_prescripciones solo tiene registros de ${(metricas.configuracion.prescripcion?.clases_a_prescribir ?? nivelesModelo.slice(0, -1)).join(', ')}.`,
    `- Modelo PRV-FCM entrenado con ${metricas.configuracion.n_entrenamiento} registros; pesos por ${metodo}${metricas.configuracion.fcm.balancear_niveles ? ' con niveles equilibrados' : ''} (λ = ${metricas.configuracion.fcm.lambda_})${excluidas ? `, con ${excluidas} aristas excluidas por la máscara causal` : ''}; exactitud en prueba ${(100 * pred.exactitud_rendimiento).toFixed(1)} % (equilibrada ${(100 * equilibrada).toFixed(1)} %).`,
    `- Prescripción para ${presc.n_estudiantes} ${s.plural} de prueba fuera del mejor nivel: llegan a su nivel meta (el siguiente al suyo si la meta es escalonada) ${presc.PSR_base.toFixed(1)} % con sus acciones actuales y ${presc.PSR.toFixed(1)} % con las prescritas según el FCM; un bosque aleatorio independiente lo confirma para ${ext.PSR_externo_base.toFixed(1)} % → ${ext.PSR_externo.toFixed(1)} %.`,
    `- Signo de los pesos: positivo = al aumentar la variable ${s.el} ${s.singular} se acerca a ${graficas.mejor_nivel} (mejor nivel); negativo = se aleja.`,
    `- Peso de cada acción (lo único que el AG cambia): ${formatearPesos(graficas.influencias.filter((i) => i.rol === 'accion'), graficas.mejor_nivel)}.`,
    `- Otras influencias fuertes, no controlables directamente: ${formatearPesos(graficas.influencias.filter((i) => i.rol !== 'accion').slice(0, 4), graficas.mejor_nivel)}.`,
    describirRegla(metricas.configuracion),
    describirSesgo(resultados, s),
    ...describirRestriccion(metricas.configuracion.prescripcion, esquema, s),
    '- Las acciones y las variables mutables se pueden interpretar como asociaciones útiles; los pesos de variables inmutables (por ejemplo nacionalidad, género o grado) no son causas.',
  );
  return lineas.join('\n');
}

const NOMBRE_INFERENCIA = { kosko: 'Kosko', kosko_modificada: 'Kosko modificada', reescalada: 'reescalada' };

/** Regla de inferencia y activación del modelo (vacío en métricas antiguas sin ellas). */
export function describirRegla(configuracion) {
  const { inferencia, activacion } = configuracion.fcm ?? {};
  if (!inferencia) return '';
  return `- Regla de inferencia ${NOMBRE_INFERENCIA[inferencia] ?? inferencia} con activación ${activacion === 'tanh' ? 'tangente hiperbólica' : 'sigmoide'}.`;
}

/** Tope de las acciones por ausentismo (lista vacía si está desactivado, si la columna no existe o en métricas antiguas). */
export function describirRestriccion(prescripcion, esquema, s = sujetoDe()) {
  const columna = esquema?.columnas.find((c) => c.columna === prescripcion?.condicion_columna && c.rol !== 'excluir');
  if (!columna || typeof prescripcion.condicion_delta_max !== 'number') return [];
  const nombre = columna.nombre && columna.nombre !== columna.columna ? `${columna.columna} (${columna.nombre})` : columna.columna;
  return [
    `- Restricción por ausentismo: si ${nombre} está en la mitad alta de su escala (en xAPI, Above-7), el AG solo puede subir cada acción hasta ` +
      `${Math.round(100 * prescripcion.condicion_delta_max)} % de su rango sobre el valor actual; por eso los planes de esos ${s.plural} son más modestos.`,
  ];
}

/** Frase sobre el sesgo del objetivo: no es un peso ni una influencia, y los modelos antiguos no lo tienen. */
export function describirSesgo({ metricas, graficas }, s = sujetoDe()) {
  const conSesgo = graficas.sesgo ?? metricas.configuracion.fcm.sesgo ?? false;
  const b = graficas.conceptos?.find((c) => c.columna === graficas.objetivo)?.sesgo;
  if (!conSesgo || typeof b !== 'number' || b === 0) {
    return '- Este modelo no tiene término de sesgo: los pesos grandes de variables inmutables compensan esa falta, así que no los presentes como causas.';
  }
  return (
    `- Sesgo del objetivo: b = ${b >= 0 ? '+' : ''}${b.toFixed(2)}. Es una constante de la regla del FCM, igual para ${s.todos} ${s.plural}; no es una variable ni una influencia. ` +
    `Al ser ${b >= 0 ? `positivo, empuja a todos hacia ${graficas.mejor_nivel}` : 'negativo, empuja a todos hacia el peor nivel'} antes de sumar las variables. ` +
    'Nadie puede cambiarlo: no lo cuentes entre los pesos ni lo recomiendes.'
  );
}

/**
 * Ejecuta una conversación y emite eventos para la interfaz:
 *   {tipo: 'estado', texto} {tipo: 'texto', delta} {tipo: 'herramienta', nombre, argumentos}
 *   {tipo: 'resultado', nombre, ok, error?} {tipo: 'grafica' | 'estudiante' | 'simulacion', ...}
 *   {tipo: 'fin'} {tipo: 'error', mensaje}
 */
export async function ejecutarAgente({ mensajes, ctx, guardia = true, signal, emitir }) {
  const tema = temaDe(ctx);
  if (guardia) {
    emitir({ tipo: 'estado', texto: 'Revisando el tema de la pregunta…' });
    if (!(await estaEnAlcance(mensajes, { signal, tema }))) {
      emitir({ tipo: 'texto', delta: respuestaFueraDeTema(tema) });
      emitir({ tipo: 'fin', fueraDeTema: true });
      return;
    }
  }
  const historial = [
    { role: 'system', content: construirPromptSistema(describirContexto(ctx), tema) },
    ...mensajes.map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.contenido })),
  ];
  const herramientas = definicionesHerramientas();
  const ctxHerramientas = { ...ctx, emitir };

  for (let ronda = 0; ronda < MAX_RONDAS; ronda++) {
    emitir({ tipo: 'estado', texto: ronda === 0 ? 'Pensando…' : 'Redactando la respuesta…' });
    let contenido = '';
    const llamadas = [];
    for await (const fragmento of chatStream({ mensajes: historial, herramientas, signal })) {
      const mensaje = fragmento.message ?? {};
      if (mensaje.content) {
        contenido += mensaje.content;
        emitir({ tipo: 'texto', delta: mensaje.content });
      }
      if (mensaje.tool_calls?.length) llamadas.push(...mensaje.tool_calls);
    }
    if (!llamadas.length) {
      emitir({ tipo: 'fin' });
      return;
    }
    historial.push({ role: 'assistant', content: contenido, tool_calls: llamadas });
    for (const llamada of llamadas) {
      const nombre = llamada.function?.name;
      const argumentos = llamada.function?.arguments ?? {};
      emitir({ tipo: 'herramienta', nombre, argumentos });
      const resultado = await ejecutarHerramienta(nombre, argumentos, ctxHerramientas);
      emitir({ tipo: 'resultado', nombre, ok: !resultado?.error, error: resultado?.error });
      historial.push({ role: 'tool', tool_name: nombre, content: JSON.stringify(resultado) });
    }
  }
  emitir({ tipo: 'texto', delta: '\n\nNecesité demasiadas consultas para esta pregunta. ¿Puedes hacerla más concreta?' });
  emitir({ tipo: 'fin' });
}

// ---------------------------------------------------------------------------
// Redacción de recomendaciones a partir de una prescripción ya calculada
// ---------------------------------------------------------------------------
/** Para quién se redacta: con estudiantes, docentes y directivos; en otros temas no se inventan roles. */
const promptRedaccion = (s) => `Eres Pizarra, asistente de analítica prescriptiva. Redactas recomendaciones prácticas para ${s.singular === 'estudiante' ? 'docentes, tutores y directivos' : `quienes toman decisiones sobre ${s.los} ${s.plural}`} a partir de una prescripción del modelo PRV-FCM (un mapa cognitivo difuso aprende cómo influyen las variables en el objetivo y un algoritmo genético busca los cambios en las acciones que acercan al mejor nivel).

Reglas:
- Escribe en español y en Markdown, con frases claras y cortas. Máximo 230 palabras.
- Usa solo las cifras de los datos que recibes. No inventes cifras, variables ni registros.
- No recomiendes cambiar una acción que la prescripción deja igual.
- Para cada acción con "cambio_grande": true, propone una meta intermedia (por ejemplo, la mitad del cambio en las primeras semanas) antes de la meta final.
- Habla de niveles. La activación del modelo va de 0 a 1 y no es una probabilidad: nunca la expreses como porcentaje.
- No presentes rasgos inmutables (género, nacionalidad, grado, etc.) como causas ni propongas cambiarlos.
- Si los datos traen "restriccion", menciónala en la situación: explica que por eso el plan sube poco las acciones.
- Cierra con una sola frase: el modelo muestra asociaciones de los datos, no causas comprobadas.`;

const estructuraIndividual = (s) => `Estructura:
**Situación**: nivel actual, meta y, si los hay, los factores del sistema que frenan.
**Plan de acción**: una viñeta por cada acción que cambia, con la meta numérica del modelo y una práctica ${s.singular === 'estudiante' ? 'pedagógica ' : ''}concreta para lograrla.
**Seguimiento**: qué revisar y cada cuánto.`;

const ESTRUCTURA_POBLACION = `Estructura:
**Hallazgo principal**: qué logra la prescripción y la cifra prudente del bosque aleatorio.
**Acciones institucionales**: una viñeta por cada acción que la prescripción aumenta con frecuencia, con un programa o práctica concreta.
**Por nivel**: diferencias entre los niveles, si las hay.
**Seguimiento**: indicadores para revisar el avance.`;

const redondeo = (valor, decimales = 2) => (typeof valor === 'number' && Number.isFinite(valor) ? Number(valor.toFixed(decimales)) : valor);

/** Datos compactos de una prescripción individual para el modelo de lenguaje. */
export function hechosIndividual({ sujeto, prescripcion }, contexto = {}) {
  // Las activaciones van solo dentro del reporte, con su escala: sueltas, el modelo las lee como porcentajes.
  return {
    sujeto,
    objetivo: contexto.objetivo,
    mejor_nivel: contexto.mejorNivel,
    meta: prescripcion.meta?.nivel ?? contexto.mejorNivel,
    nivel_actual: prescripcion.base.nivel,
    nivel_con_el_plan: prescripcion.prescrito.nivel,
    alcanza_la_meta: Boolean(prescripcion.prescrito.exito),
    acciones: prescripcion.acciones.map((a) => {
      const rango = typeof a.max === 'number' && typeof a.min === 'number' && a.max > a.min ? a.max - a.min : null;
      if (Math.abs(a.cambio) < 1e-6) return { accion: a.nombre, actual: a.actual.categoria ?? redondeo(a.actual.valor, 1), nota: 'sin cambio' };
      return {
        accion: a.nombre,
        actual: a.actual.categoria ?? redondeo(a.actual.valor, 1),
        recomendada: a.recomendada.categoria ?? redondeo(a.recomendada.valor, 1),
        cambio: redondeo(a.cambio, 1),
        ...(rango ? { cambio_grande: Math.abs(a.cambio) / rango > 0.3 } : {}),
      };
    }),
    factores_del_sistema_que_frenan: (prescripcion.contribuciones ?? [])
      .filter((c) => c.rol === 'mutable' && c.aporte_prescrito < -0.05)
      .slice(0, 3)
      .map((c) => ({ variable: c.nombre, aporte: redondeo(c.aporte_prescrito) })),
    ...(prescripcion.restriccion ? { restriccion: prescripcion.restriccion.texto } : {}),
    reporte_del_modelo: prescripcion.reporte?.texto,
  };
}

/** Datos compactos del resumen de prescripciones del conjunto de prueba. */
export function hechosPoblacion(resumen, contexto = {}) {
  const ext = contexto.metricas?.validacion_externa;
  return {
    objetivo: contexto.objetivo,
    mejor_nivel: contexto.mejorNivel,
    registros_prescritos: resumen.n,
    llegan_al_mejor_nivel_segun_fcm: `${redondeo(resumen.pct_exito, 1)} %`,
    ...(ext ? { bosque_aleatorio_mejor_nivel: `${redondeo(ext.PSR_externo_base, 1)} % → ${redondeo(ext.PSR_externo, 1)} %` } : {}),
    acciones: resumen.acciones.map((a) => ({
      accion: a.nombre,
      media_actual: redondeo(a.actual_media, 1),
      media_recomendada: redondeo(a.recomendada_media, 1),
      porcentaje_que_aumenta: `${redondeo(a.pct_aumenta, 0)} %`,
      porcentaje_sin_cambio: `${redondeo(a.pct_igual, 0)} %`,
    })),
    por_nivel: resumen.por_nivel.map((g) => ({ nivel: g.nivel, registros: g.n, llegan_al_mejor_nivel: `${redondeo(g.pct_exito, 1)} %` })),
    reporte_del_modelo: resumen.texto,
  };
}

/** Redacta en streaming (eventos estado, texto, fin) recomendaciones a partir de una prescripción individual o del resumen. */
export async function redactarRecomendacion({ tipo, datos, contexto, signal, emitir }) {
  emitir({ tipo: 'estado', texto: 'Redactando con qwen2.5…' });
  const s = sujetoDe(contexto?.sujeto);
  const hechos = tipo === 'poblacion' ? hechosPoblacion(datos, contexto) : hechosIndividual(datos, contexto);
  const pedido =
    tipo === 'poblacion'
      ? `Redacta recomendaciones institucionales para el dataset «${contexto.dataset}» a partir de este resumen de prescripciones.\n${ESTRUCTURA_POBLACION}`
      : `Redacta recomendaciones para ${datos.sujeto} a partir de esta prescripción.\n${estructuraIndividual(s)}`;
  const mensajes = [
    { role: 'system', content: promptRedaccion(s) },
    { role: 'user', content: `${pedido}\n\nDatos:\n${JSON.stringify(hechos)}` },
  ];
  for await (const fragmento of chatStream({ mensajes, opciones: { num_predict: 900 }, signal })) {
    if (fragmento.message?.content) emitir({ tipo: 'texto', delta: fragmento.message.content });
  }
  emitir({ tipo: 'fin' });
}

// ---------------------------------------------------------------------------
// Sugerencia de esquema con el modelo
// ---------------------------------------------------------------------------
const PROMPT_ESQUEMA = `Eres experto en analítica prescriptiva y en el método PRV-FCM (mapas cognitivos difusos prescriptivos). Asigna un rol a cada columna de un dataset, sea de estudiantes, pacientes, clientes u otro tema:
- objetivo: el resultado que se quiere mejorar (nota final, deserción, diagnóstico, respuesta a una campaña, abandono de un servicio). Exactamente una columna.
- accion: lo que se puede cambiar directamente con una intervención o un comportamiento. En educación: horas de estudio, asistencia, tutorías, uso de recursos; en salud: tratamiento, actividad física, valores clínicos que se busca controlar (presión, colesterol); en comercio: descuentos, contactos, compras por un canal. Deben ser numéricas u ordinales. Marca al menos una.
- mutable: estados que cambian pero no se controlan directamente (ausencias, materias reprobadas, síntomas, resultados de pruebas, días desde la última compra, satisfacción, deudas).
- inmutable: rasgos que no cambian durante el periodo (edad, sexo, nacionalidad, nivel educativo, grado, ocupación de los padres, año de nacimiento).
- excluir: identificadores, nombres, texto libre o columnas redundantes.
Da también un nombre corto y legible en español para cada columna, con espacios y mayúscula inicial (por ejemplo «Horas de estudio», no «horas_estudio»). Si el objetivo es categórico, ordena sus categorías del peor al mejor desenlace en "orden_objetivo".`;

const ESQUEMA_SUGERENCIA = {
  type: 'object',
  properties: {
    columnas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          columna: { type: 'string' },
          rol: { type: 'string', enum: ['inmutable', 'accion', 'mutable', 'objetivo', 'excluir'] },
          nombre: { type: 'string' },
        },
        required: ['columna', 'rol', 'nombre'],
      },
    },
    orden_objetivo: { type: 'array', items: { type: 'string' } },
  },
  required: ['columnas'],
};

/** Pide al modelo roles y nombres; la codificación viene del perfilado heurístico. */
export async function sugerirEsquemaConIA({ perfil, esquemaBase, signal }) {
  const descripcion = perfil.perfil
    .map((c) => `- ${c.columna} (${c.tipo_dato}, ${c.unicos} valores distintos; ejemplos: ${c.ejemplos.slice(0, 4).join(', ')})`)
    .join('\n');
  const respuesta = await chatJson({
    mensajes: [
      { role: 'system', content: PROMPT_ESQUEMA },
      { role: 'user', content: `Dataset con ${perfil.filas} registros y estas columnas:\n${descripcion}` },
    ],
    esquema: ESQUEMA_SUGERENCIA,
    signal,
  });
  const porColumna = new Map((respuesta.columnas ?? []).map((c) => [c.columna, c]));
  const perfilDe = new Map(perfil.perfil.map((c) => [c.columna, c]));
  const avisos = [];
  // Si el modelo no propone acciones, se conservan las que sugirió el perfilado por nombre.
  const iaSinAcciones = !(respuesta.columnas ?? []).some((c) => c.rol === 'accion');
  if (iaSinAcciones) avisos.push('El modelo no propuso acciones; se conservaron las sugeridas por el nombre de las columnas. Revíselas.');
  const legible = (nombre) => {
    const texto = String(nombre ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
  };
  const columnas = esquemaBase.columnas.map((base) => {
    const ia = porColumna.get(base.columna);
    if (!ia) return base;
    const rol = iaSinAcciones && base.rol === 'accion' ? 'accion' : ia.rol;
    const nueva = { ...base, rol, nombre: legible(ia.nombre) || base.nombre };
    if (rol === 'excluir') return { columna: base.columna, rol: 'excluir', nombre: nueva.nombre };
    if (!nueva.codificacion) Object.assign(nueva, perfilDe.get(base.columna)?.sugerencia ?? { codificacion: 'numerica' });
    if (rol === 'accion' && nueva.codificacion === 'nominal') {
      avisos.push(`${base.columna} quedó como inmutable: una acción no puede tener codificación nominal.`);
      nueva.rol = 'inmutable';
    }
    return nueva;
  });
  const objetivos = columnas.filter((c) => c.rol === 'objetivo');
  if (objetivos.length !== 1) avisos.push('Revise el objetivo: el modelo no marcó exactamente una columna.');
  const objetivo = objetivos[0];
  if (objetivo && Array.isArray(respuesta.orden_objetivo) && respuesta.orden_objetivo.length > 1) {
    const categorias = (perfilDe.get(objetivo.columna)?.categorias ?? []).map((c) => c.valor);
    const mismo = [...respuesta.orden_objetivo].sort().join('|') === [...categorias].sort().join('|');
    if (mismo && objetivo.codificacion !== 'numerica') {
      objetivo.codificacion = 'ordinal';
      objetivo.orden = respuesta.orden_objetivo;
    }
  }
  if (objetivo && objetivo.codificacion !== 'numerica' && !objetivo.orden) {
    avisos.push(`Defina el orden de ${objetivo.columna}, del peor al mejor nivel.`);
  }
  return { esquema: { ...esquemaBase, objetivo: objetivo?.columna ?? null, columnas }, avisos };
}
