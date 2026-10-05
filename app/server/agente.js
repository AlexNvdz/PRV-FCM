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

const NOMBRE_METODO = { bptt: 'BPTT (gradiente exacto)', ridge: 'regresión Ridge', lasso: 'regresión Lasso', correlacion_parcial: 'correlación parcial' };

export const MAX_RONDAS = 5;

export const RESPUESTA_FUERA_DE_TEMA =
  'Solo puedo ayudarte con rendimiento académico, deserción escolar y el modelo PRV-FCM de este proyecto. ' +
  'Por ejemplo: «¿Qué acciones mejoran más el rendimiento?» o «Analiza al estudiante 14».';

const PROMPT_GUARDIA = `Eres un filtro de temas para un asistente de analítica educativa. Decide si el último mensaje del usuario está dentro del alcance.

Dentro del alcance: rendimiento académico, deserción o permanencia escolar, estudiantes, docentes, cursos, aprendizaje, hábitos de estudio, asistencia, intervenciones pedagógicas, análisis o gráficas de datos educativos, el modelo PRV-FCM, mapas cognitivos difusos, algoritmos genéticos, los datos cargados en la aplicación y el uso de la aplicación. También saludos, agradecimientos, preguntas sobre qué puede hacer el asistente y continuaciones de la conversación (por ejemplo «¿y el estudiante 14?» o «explícalo mejor»).

Fuera del alcance: cualquier otro tema (recetas, deportes, política, programación general, tareas personales, chistes, etc.).

Responde solo con JSON: {"en_alcance": true} o {"en_alcance": false}.`;

const ESQUEMA_GUARDIA = {
  type: 'object',
  properties: { en_alcance: { type: 'boolean' } },
  required: ['en_alcance'],
};

/** true si el último mensaje está dentro del alcance. Si la guardia falla, deja pasar el mensaje. */
export async function estaEnAlcance(mensajes, { signal } = {}) {
  const recientes = mensajes.slice(-4, -1).map((m) => `[${m.rol}]: ${m.contenido.slice(0, 400)}`).join('\n');
  const ultimo = mensajes.at(-1)?.contenido ?? '';
  try {
    const respuesta = await chatJson({
      mensajes: [
        { role: 'system', content: PROMPT_GUARDIA },
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

export function construirPromptSistema(contexto) {
  return `Eres Pizarra, el asistente de analítica educativa de este proyecto. Trabajas con el modelo PRV-FCM: un mapa cognitivo difuso (FCM) aprende de los datos cómo influyen las variables de cada estudiante en su rendimiento o en su riesgo de deserción, y un algoritmo genético (AG) busca los cambios en las acciones que llevarían a cada estudiante al mejor nivel.

Alcance: rendimiento académico, deserción y permanencia escolar, hábitos y participación de los estudiantes, intervenciones pedagógicas, el modelo PRV-FCM y los datos cargados en la aplicación. Si te piden algo fuera de ese alcance, responde en una sola frase que solo atiendes esos temas y propone una pregunta útil sobre los datos.

Conceptos del mapa (notación PRV-FCM): C_T es el concepto objetivo; C_P, los conceptos prescriptivos o acciones que el AG puede cambiar; C_S, los conceptos del sistema (inmutables y mutables) que no se controlan directamente.

Cómo trabajas:
- Responde siempre en español, con frases claras y cortas. Usa listas cuando ayuden.
- Para cualquier cifra, estudiante o comparación, usa las herramientas. Nunca inventes datos, estudiantes, columnas ni métricas.
- Cita las cifras que usas (por ejemplo: «exactitud del FCM: 72.1 %»).
- Los estudiantes se identifican por su id: la fila del archivo.
- Qué herramienta usar: recomendaciones generales o por nivel → resumen_prescripciones; un estudiante concreto → analizar_estudiante; un perfil hipotético («un estudiante con más de 7 ausencias que casi no visita recursos») → prescribir_perfil; panorama de cómo se relacionan todas las variables → correlaciones_variables; la relación entre dos variables que el usuario nombra → relacion_variables con x e y.
- Si una herramienta devuelve un campo «reporte» o «texto», úsalo como base de tu respuesta y conserva sus cifras.
- Al recomendar, combina la prescripción del modelo con prácticas pedagógicas concretas (tutorías, seguimiento de la asistencia, participación en clase, comunicación con la familia) y explica el porqué.
- Para un estudiante, recomienda el plan moderado y menciona el plan máximo solo como techo. No recomiendes cambiar una acción que la prescripción deja igual: el modelo no espera beneficio de ella.
- Si un cambio recomendado es muy grande, propón metas intermedias realistas y un seguimiento periódico.
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
export function describirContexto({ dataset, modelo, resultados }) {
  if (!dataset) return 'Contexto: todavía no hay datos cargados.';
  const esquema = dataset.esquema;
  const lineas = [`Contexto actual:`, `- Datos activos: «${dataset.nombre}».`];
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
  lineas.push(
    `- Modelo PRV-FCM entrenado con ${metricas.configuracion.n_entrenamiento} registros; pesos por ${metodo}${metricas.configuracion.fcm.balancear_niveles ? ' con niveles equilibrados' : ''} (λ = ${metricas.configuracion.fcm.lambda_})${excluidas ? `, con ${excluidas} aristas excluidas por la máscara causal` : ''}; exactitud en prueba ${(100 * pred.exactitud_rendimiento).toFixed(1)} % (equilibrada ${(100 * equilibrada).toFixed(1)} %).`,
    `- Prescripción para ${presc.n_estudiantes} estudiantes de prueba fuera del mejor nivel: llegan al mejor nivel ${presc.PSR_base.toFixed(1)} % con sus acciones actuales y ${presc.PSR.toFixed(1)} % con las prescritas según el FCM; un bosque aleatorio independiente lo confirma para ${ext.PSR_externo_base.toFixed(1)} % → ${ext.PSR_externo.toFixed(1)} %.`,
    `- Signo de los pesos: positivo = al aumentar la variable el estudiante se acerca a ${graficas.mejor_nivel} (mejor nivel); negativo = se aleja.`,
    `- Peso de cada acción (lo único que el AG cambia): ${formatearPesos(graficas.influencias.filter((i) => i.rol === 'accion'), graficas.mejor_nivel)}.`,
    `- Otras influencias fuertes, no controlables directamente: ${formatearPesos(graficas.influencias.filter((i) => i.rol !== 'accion').slice(0, 4), graficas.mejor_nivel)}.`,
    '- Cuidado al interpretar: la regla del FCM no tiene término de sesgo y los pesos grandes de variables inmutables (por ejemplo nacionalidad, género o grado) compensan esa falta; no los presentes como causas. Las acciones y las variables mutables sí se pueden interpretar como asociaciones útiles.',
  );
  return lineas.join('\n');
}

/**
 * Ejecuta una conversación y emite eventos para la interfaz:
 *   {tipo: 'estado', texto} {tipo: 'texto', delta} {tipo: 'herramienta', nombre, argumentos}
 *   {tipo: 'resultado', nombre, ok, error?} {tipo: 'grafica' | 'estudiante' | 'simulacion', ...}
 *   {tipo: 'fin'} {tipo: 'error', mensaje}
 */
export async function ejecutarAgente({ mensajes, ctx, guardia = true, signal, emitir }) {
  if (guardia) {
    emitir({ tipo: 'estado', texto: 'Revisando el tema de la pregunta…' });
    if (!(await estaEnAlcance(mensajes, { signal }))) {
      emitir({ tipo: 'texto', delta: RESPUESTA_FUERA_DE_TEMA });
      emitir({ tipo: 'fin', fueraDeTema: true });
      return;
    }
  }
  const historial = [
    { role: 'system', content: construirPromptSistema(describirContexto(ctx)) },
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
const PROMPT_REDACCION = `Eres Pizarra, asistente de analítica educativa. Redactas recomendaciones prácticas para docentes, tutores y directivos a partir de una prescripción del modelo PRV-FCM (un mapa cognitivo difuso aprende cómo influyen las variables en el objetivo y un algoritmo genético busca los cambios en las acciones que acercan al mejor nivel).

Reglas:
- Escribe en español y en Markdown, con frases claras y cortas. Máximo 230 palabras.
- Usa solo las cifras de los datos que recibes. No inventes cifras, variables ni estudiantes.
- No recomiendes cambiar una acción que la prescripción deja igual.
- Para cada acción con "cambio_grande": true, propone una meta intermedia (por ejemplo, la mitad del cambio en las primeras semanas) antes de la meta final.
- Habla de niveles. La activación del modelo va de 0 a 1 y no es una probabilidad: nunca la expreses como porcentaje.
- No presentes rasgos inmutables (género, nacionalidad, grado, etc.) como causas ni propongas cambiarlos.
- Cierra con una sola frase: el modelo muestra asociaciones de los datos, no causas comprobadas.`;

const ESTRUCTURA_INDIVIDUAL = `Estructura:
**Situación**: nivel actual, meta y, si los hay, los factores del sistema que frenan.
**Plan de acción**: una viñeta por cada acción que cambia, con la meta numérica del modelo y una práctica pedagógica concreta para lograrla.
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
  const hechos = tipo === 'poblacion' ? hechosPoblacion(datos, contexto) : hechosIndividual(datos, contexto);
  const pedido =
    tipo === 'poblacion'
      ? `Redacta recomendaciones institucionales para el dataset «${contexto.dataset}» a partir de este resumen de prescripciones.\n${ESTRUCTURA_POBLACION}`
      : `Redacta recomendaciones para ${datos.sujeto} a partir de esta prescripción.\n${ESTRUCTURA_INDIVIDUAL}`;
  const mensajes = [
    { role: 'system', content: PROMPT_REDACCION },
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
const PROMPT_ESQUEMA = `Eres experto en analítica educativa y en el método PRV-FCM (mapas cognitivos difusos prescriptivos). Asigna un rol a cada columna de un dataset educativo:
- objetivo: el resultado que se quiere mejorar (rendimiento, nota final, deserción o permanencia). Exactamente una columna.
- accion: comportamientos o intervenciones que el estudiante o la institución pueden cambiar directamente: horas de estudio, asistencia, participación, tutorías, uso de recursos, entregas, evaluaciones presentadas, carga académica inscrita, becas o apoyo para estar al día con la matrícula. Deben ser numéricas u ordinales. Marca al menos una.
- mutable: estados del estudiante que cambian pero no se controlan directamente (ausencias, materias reprobadas, satisfacción, apoyo familiar, becas, deudas).
- inmutable: rasgos que no cambian durante el periodo (edad, género, nacionalidad, curso, grado, nivel, semestre, ocupación de los padres).
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
