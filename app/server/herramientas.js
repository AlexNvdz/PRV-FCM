// Herramientas que el asistente (qwen2.5 en Ollama) puede llamar para consultar
// los datos y el modelo PRV-FCM. Cada una valida sus argumentos, responde con
// un objeto pequeño (el contexto del modelo es limitado) y puede enviar a la
// interfaz una gráfica o una tarjeta con `ctx.emitir`.
import { z } from 'zod';

// Penalización del esfuerzo del plan moderado. En xAPI, con 0.4 el éxito del FCM
// no baja (59.2 %) y los cambios son menores y distintos por estudiante (README).
export const BETA_MODERADO = 0.4;

const redondear = (valor, decimales = 3) =>
  typeof valor === 'number' && Number.isFinite(valor) ? Number(valor.toFixed(decimales)) : valor;

function porcentaje(valor) {
  return typeof valor === 'number' ? `${valor.toFixed(1)} %` : null;
}

/** Correlación con signo explícito: +0.74, -0.25. */
const firmar = (valor) => `${valor >= 0 ? '+' : '-'}${Math.abs(valor).toFixed(2)}`;

const NOMBRE_ROL = { accion: 'acción', mutable: 'mutable', inmutable: 'inmutable', objetivo: 'objetivo' };

export class ErrorHerramienta extends Error {}

function requiereModelo(ctx) {
  if (!ctx.modelo) {
    throw new ErrorHerramienta('No hay un modelo PRV-FCM entrenado para este dataset. Sugiere entrenarlo en la vista «Modelo».');
  }
}

function columnasPorRol(esquema, rol) {
  return esquema.columnas.filter((c) => c.rol === rol).map((c) => ({ columna: c.columna, nombre: c.nombre ?? c.columna }));
}

// ---------------------------------------------------------------------------
// Definiciones
// ---------------------------------------------------------------------------
const FILTRO = z.object({
  columna: z.string(),
  operador: z.enum(['=', '!=', '<', '<=', '>', '>=', 'contiene']),
  valor: z.union([z.string(), z.number()]),
});

// id_estudiante es el nombre en todas las herramientas; también se acepta "id" por si el modelo lo abrevia.
const conAliasId = (valor) =>
  valor && typeof valor === 'object' && !('id_estudiante' in valor) && 'id' in valor ? { ...valor, id_estudiante: valor.id } : valor;

function conIdEstudiante(forma = {}) {
  return z.preprocess(conAliasId, z.object({ id_estudiante: z.coerce.number().int().min(0), ...forma }));
}

const NOMBRE_CORRELACION = { spearman: 'Spearman', pearson: 'Pearson', parcial: 'parcial' };

/** Correlaciones con el objetivo y pares más relacionados de una matriz de correlación del motor. */
export function leerCorrelaciones(corr, limite = 6) {
  const { conceptos, matriz } = corr;
  const iObjetivo = conceptos.findIndex((c) => c.rol === 'objetivo');
  const conObjetivo = conceptos
    .map((c, i) => ({ variable: c.nombre, rol: c.rol, r: matriz[i][iObjetivo] }))
    .filter((f, i) => i !== iObjetivo && typeof f.r === 'number')
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, limite)
    .map((f) => ({ ...f, r: redondear(f.r, 2) }));
  const pares = [];
  for (let i = 0; i < conceptos.length; i++) {
    for (let j = i + 1; j < conceptos.length; j++) {
      // Los indicadores one-hot de una misma columna se excluyen entre sí: su correlación no informa.
      if (i === iObjetivo || j === iObjetivo || conceptos[i].origen === conceptos[j].origen || typeof matriz[i][j] !== 'number') continue;
      pares.push({ a: conceptos[i].nombre, b: conceptos[j].nombre, r: matriz[i][j] });
    }
  }
  pares.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));
  return { conObjetivo, pares: pares.slice(0, limite).map((p) => ({ ...p, r: redondear(p.r, 2) })) };
}

const HERRAMIENTAS = {
  resumen_datos: {
    descripcion:
      'Resumen del dataset activo: número de registros, columna objetivo con cuántos estudiantes hay en cada nivel, y las variables según su rol (acciones, inmutables, mutables).',
    parametros: z.object({}),
    async ejecutar(_args, ctx) {
      const { dataset } = ctx;
      const estad = await ctx.estadisticas();
      return {
        dataset: dataset.nombre,
        registros: estad.filas,
        objetivo: {
          columna: estad.objetivo.columna,
          mejor_nivel: estad.objetivo.mejor_nivel,
          niveles: estad.objetivo.niveles.map((n) => ({ nivel: n.etiqueta, estudiantes: n.n })),
        },
        acciones: columnasPorRol(dataset.esquema, 'accion'),
        mutables: columnasPorRol(dataset.esquema, 'mutable'),
        inmutables: columnasPorRol(dataset.esquema, 'inmutable'),
      };
    },
  },

  resumen_modelo: {
    descripcion:
      'Métricas del modelo PRV-FCM entrenado: exactitud al predecir el nivel, lambda elegido por validación cruzada, éxito prescriptivo (PSR) con las acciones actuales y con las prescritas, confirmación de un bosque aleatorio independiente, resultados por segmento y cambio medio recomendado en cada acción.',
    parametros: z.object({}),
    async ejecutar(_args, ctx) {
      requiereModelo(ctx);
      const { metricas, graficas } = ctx.resultados;
      const pred = metricas.prediccion_fcm;
      const presc = metricas.prescripcion;
      const ext = metricas.validacion_externa;
      return {
        registros: metricas.configuracion.n_registros,
        entrenamiento: metricas.configuracion.n_entrenamiento,
        prueba: metricas.configuracion.n_prueba,
        lambda: metricas.configuracion.fcm.lambda_,
        exactitud_fcm: porcentaje(100 * pred.exactitud_rendimiento),
        exactitud_equilibrada_fcm: porcentaje(
          100 * (Object.values(pred.por_clase ?? {}).reduce((s, c) => s + c.recall, 0) / Math.max(Object.keys(pred.por_clase ?? {}).length, 1)),
        ),
        niveles_equilibrados_al_entrenar: Boolean(metricas.configuracion.fcm.balancear_niveles),
        f1_macro: porcentaje(100 * pred.F1_macro),
        exactitud_clase_mayoritaria: porcentaje(100 * pred.exactitud_clase_mayoritaria),
        exactitud_bosque_aleatorio: porcentaje(100 * ext.exactitud_prueba),
        estudiantes_prescritos: presc.n_estudiantes,
        psr_acciones_actuales: porcentaje(presc.PSR_base),
        psr_prescripcion: porcentaje(presc.PSR),
        bosque_mejor_nivel_actual: porcentaje(ext.PSR_externo_base),
        bosque_mejor_nivel_prescrito: porcentaje(ext.PSR_externo),
        por_segmento: Object.fromEntries(
          Object.entries(metricas.exito_por_segmento ?? {}).map(([nombre, s]) => [
            nombre,
            {
              estudiantes: s.n,
              psr_fcm: `${porcentaje(s.PSR_base)} → ${porcentaje(s.PSR)}`,
              bosque: `${porcentaje(ext.por_segmento?.[nombre]?.PSR_externo_base)} → ${porcentaje(ext.por_segmento?.[nombre]?.PSR_externo)}`,
            },
          ]),
        ),
        acciones_medias: graficas.acciones.map((a) => ({
          accion: a.nombre,
          columna: a.columna,
          actual: redondear(a.actual_media, 1),
          recomendada: redondear(a.recomendada_media, 1),
        })),
      };
    },
  },

  influencias_fcm: {
    descripcion:
      'Pesos causales que el mapa cognitivo difuso aprendió hacia el objetivo, del más fuerte al más débil. Un peso positivo empuja al mejor nivel; uno negativo, al peor.',
    parametros: z.object({ limite: z.coerce.number().int().min(1).max(30).optional() }),
    async ejecutar({ limite = 10 }, ctx) {
      requiereModelo(ctx);
      const influencias = ctx.resultados.graficas.influencias.slice(0, limite);
      ctx.emitir({
        tipo: 'grafica',
        grafica: 'influencias',
        titulo: `Influencias sobre ${ctx.resultados.graficas.objetivo}`,
        datos: influencias.map((i) => ({ id: i.id, nombre: i.nombre, rol: i.rol, peso: i.peso })),
      });
      const mejor = ctx.resultados.graficas.mejor_nivel;
      return influencias.map((i) => ({
        concepto: i.id,
        variable: i.nombre,
        columna: i.columna,
        rol: i.rol,
        peso: redondear(i.peso, 2),
        efecto: `aumentarla ${i.peso >= 0 ? 'acerca a' : 'aleja de'} ${mejor}`,
      }));
    },
  },

  estadisticas_variable: {
    descripcion:
      'Cómo se distribuye una variable en cada nivel del objetivo (media por nivel si es numérica, conteos si es categórica) y su correlación con el objetivo. También muestra una gráfica al usuario.',
    parametros: z.object({ columna: z.string().min(1) }),
    async ejecutar({ columna }, ctx) {
      const variable = await ctx.motor.llamar('estadistica_variable', {
        ruta: ctx.rutaDatos,
        esquema: ctx.dataset.esquema,
        columna: ctx.columnaReal(columna),
      });
      ctx.emitir({ tipo: 'grafica', grafica: 'variable', titulo: variable.nombre, datos: variable });
      const resumen = { variable: variable.nombre, columna: variable.columna, rol: variable.rol, correlacion_con_objetivo: redondear(variable.correlacion, 2) };
      if (variable.por_nivel) {
        resumen.media_por_nivel = Object.fromEntries(variable.por_nivel.map((n) => [n.nivel, redondear(n.media, 2)]));
      } else {
        resumen.por_categoria = variable.categorias.map((c) => ({ categoria: c.categoria, estudiantes: c.n, por_nivel: c.por_nivel }));
      }
      return resumen;
    },
  },

  buscar_estudiantes: {
    descripcion:
      'Lista estudiantes que cumplen condiciones. Devuelve su id_estudiante (fila del archivo), el nivel del objetivo y sus variables principales. Operadores: =, !=, <, <=, >, >=, contiene.',
    parametros: z.object({
      nivel: z.string().optional(),
      filtros: z.array(FILTRO).max(5).optional(),
      ordenar_por: z.string().optional(),
      descendente: z.boolean().optional(),
      limite: z.coerce.number().int().min(1).max(20).optional(),
    }),
    async ejecutar({ nivel, filtros = [], ordenar_por, descendente = false, limite = 10 }, ctx) {
      const { esquema } = ctx.dataset;
      const columnas = esquema.columnas.filter((c) => ['accion', 'mutable', 'objetivo'].includes(c.rol)).map((c) => c.columna);
      const pagina = await ctx.motor.llamar('filas', {
        ruta: ctx.rutaDatos,
        esquema,
        desde: 0,
        cantidad: limite,
        nivel: nivel || null,
        filtros: filtros.map((f) => ({ ...f, columna: ctx.columnaReal(f.columna) })),
        orden: ordenar_por ? ctx.columnaReal(ordenar_por) : null,
        descendente,
        columnas,
      });
      return {
        total_que_cumplen: pagina.total,
        mostrados: pagina.filas.length,
        nota: 'Para analizar o simular a uno, use su id_estudiante.',
        estudiantes: pagina.filas.map(({ id, ...resto }) => ({ id_estudiante: id, ...resto })),
      };
    },
  },

  analizar_estudiante: {
    descripcion:
      'Perfil de un estudiante por su id_estudiante: sus datos, el nivel que predice el FCM y dos prescripciones del algoritmo genético: un plan moderado (cambios pequeños, preferible para recomendar) y el plan máximo del modelo.',
    parametros: conIdEstudiante(),
    async ejecutar({ id_estudiante: id }, ctx) {
      requiereModelo(ctx);
      const base = { ruta: ctx.rutaDatos, esquema: ctx.dataset.esquema, id, modelo: ctx.rutaModelo };
      const [estudiante, maxima, moderada] = await Promise.all([
        ctx.motor.llamar('estudiante', base),
        ctx.motor.llamar('prescribir', base),
        ctx.motor.llamar('prescribir', { ...base, beta: BETA_MODERADO }),
      ]);
      ctx.emitir({ tipo: 'estudiante', id, estudiante, prescripcion: moderada, prescripcionMaxima: maxima });
      const plan = (p) => ({
        nivel_alcanzado: p.prescrito.nivel,
        activacion: redondear(p.prescrito.activacion),
        acciones: p.acciones.map((a) => ({
          accion: a.nombre,
          columna: a.columna,
          actual: redondear(a.actual.valor, 1),
          recomendada: redondear(a.recomendada.valor, 1),
          ...(Math.abs(a.cambio) < 1e-6 ? { nota: 'sin cambio: el modelo no espera beneficio' } : {}),
        })),
      });
      return {
        id_estudiante: id,
        lectura:
          `Nivel observado en los datos: ${estudiante.nivel_observado ?? 'desconocido'}. Con sus acciones actuales el FCM lo ubica en ${maxima.base.nivel} ` +
          `(activación ${redondear(maxima.base.activacion, 2)} en una escala de 0 a 1; no es una probabilidad). ` +
          `Con el plan moderado quedaría en ${moderada.prescrito.nivel} y con el plan máximo en ${maxima.prescrito.nivel}.`,
        reporte: moderada.reporte?.texto,
        datos: estudiante.registro,
        nivel_observado: estudiante.nivel_observado,
        en_conjunto_de_prueba: estudiante.en_prueba,
        plan_moderado: plan(moderada),
        plan_maximo: plan(maxima),
      };
    },
  },

  prescribir_perfil: {
    descripcion:
      'Prescripción del algoritmo genético para un perfil de riesgo hipotético. Sin id_estudiante parte del perfil típico del dataset: no envíe id_estudiante salvo que el usuario nombre un estudiante concreto. Cambia las variables de "valores" (unidades originales o categorías, por ejemplo {"StudentAbsenceDays": "Above-7", "VisITedResources": 10}). Devuelve el plan moderado y su reporte.',
    parametros: z.preprocess(
      conAliasId,
      z.object({
        id_estudiante: z.coerce.number().int().min(0).optional(),
        valores: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
        nivel_meta: z.string().optional(),
      }),
    ),
    async ejecutar({ id_estudiante, valores = {}, nivel_meta }, ctx) {
      requiereModelo(ctx);
      const base = await ctx.motor.llamar('perfil_base', { ruta: ctx.rutaDatos, esquema: ctx.dataset.esquema, id: id_estudiante ?? null });
      const cambios = Object.fromEntries(Object.entries(valores).map(([nombre, valor]) => [ctx.columnaReal(nombre), valor]));
      const perfil = { ...base.valores, ...cambios };
      const prescripcion = await ctx.motor.llamar('prescribir_perfil', {
        modelo: ctx.rutaModelo,
        perfil,
        beta: BETA_MODERADO,
        nivel_meta: nivel_meta || null,
      });
      ctx.emitir({ tipo: 'perfil', origen: base.origen, cambios, prescripcion });
      return {
        partida: base.origen,
        valores_cambiados: cambios,
        reporte: prescripcion.reporte.texto,
        nivel_actual: prescripcion.base.nivel,
        nivel_con_el_plan: prescripcion.prescrito.nivel,
        meta: prescripcion.meta.nivel,
        acciones: prescripcion.acciones.map((a) => ({
          accion: a.nombre,
          actual: redondear(a.actual.valor, 1),
          recomendada: redondear(a.recomendada.valor, 1),
          ...(Math.abs(a.cambio) < 1e-6 ? { nota: 'sin cambio: el modelo no espera beneficio' } : {}),
        })),
      };
    },
  },

  resumen_prescripciones: {
    descripcion:
      'Resumen de las prescripciones que el algoritmo genético generó para los estudiantes de prueba fuera del mejor nivel: cuántos llegan al mejor nivel, qué acciones se recomiendan con más frecuencia y cuánto cambian, también por nivel observado. Úsala para recomendaciones generales o institucionales.',
    parametros: z.object({ nivel: z.string().optional() }),
    async ejecutar({ nivel }, ctx) {
      requiereModelo(ctx);
      const resumen = await ctx.motor.llamar('resumen_prescripciones', { directorio: ctx.dirModelo, nivel: nivel || null });
      const rangos = new Map((ctx.resultados.graficas.acciones ?? []).map((a) => [a.columna, a]));
      ctx.emitir({
        tipo: 'grafica',
        grafica: 'acciones',
        titulo: nivel ? `Acciones recomendadas al nivel ${nivel}` : 'Acciones recomendadas en promedio',
        datos: resumen.acciones.map((a) => ({
          nombre: a.nombre,
          desde: a.actual_media,
          hasta: a.recomendada_media,
          min: rangos.get(a.columna)?.min,
          max: rangos.get(a.columna)?.max,
        })),
      });
      return {
        texto: resumen.texto,
        registros: resumen.n,
        llegan_al_mejor_nivel: porcentaje(resumen.pct_exito),
        acciones: resumen.acciones.map((a) => ({
          accion: a.nombre,
          media_actual: redondear(a.actual_media, 1),
          media_recomendada: redondear(a.recomendada_media, 1),
          aumenta_en: porcentaje(a.pct_aumenta),
          sin_cambio_en: porcentaje(a.pct_igual),
        })),
        por_nivel: resumen.por_nivel.map((g) => ({ nivel: g.nivel, registros: g.n, llegan_al_mejor_nivel: porcentaje(g.pct_exito) })),
        estudiantes_con_mas_mejora: resumen.ejemplos.map((e) => ({
          id_estudiante: e.id_estudiante,
          nivel_observado: e.nivel_observado,
          nivel_prescrito: e.nivel_prescrito,
        })),
        nota: resumen.nota,
      };
    },
  },

  correlaciones_variables: {
    descripcion:
      'Visión general de cómo se relacionan TODAS las variables entre sí y con el objetivo: correlación (spearman, pearson o parcial) sobre los datos normalizados. Devuelve las correlaciones con el objetivo y los pares más relacionados, y muestra el mapa de calor. Si el usuario nombra dos variables concretas, use relacion_variables.',
    parametros: z.object({
      metodo: z.enum(['spearman', 'pearson', 'parcial']).optional(),
      limite: z.coerce.number().int().min(1).max(15).optional(),
    }),
    async ejecutar({ metodo = 'spearman', limite = 6 }, ctx) {
      const corr = await ctx.motor.llamar('correlaciones', { ruta: ctx.rutaDatos, esquema: ctx.dataset.esquema, metodo });
      ctx.emitir({ tipo: 'grafica', grafica: 'correlaciones', titulo: `Correlación de ${NOMBRE_CORRELACION[metodo]} entre las variables`, datos: corr });
      const { conObjetivo, pares } = leerCorrelaciones(corr, limite);
      const objetivo = corr.conceptos.find((c) => c.rol === 'objetivo')?.nombre ?? 'el objetivo';
      // Frases ya redactadas: el modelo pequeño confunde nombres y signos si solo recibe listas de números.
      return {
        texto:
          `Correlación de ${NOMBRE_CORRELACION[metodo]} con ${objetivo}: ` +
          conObjetivo
            .map((f) => `${f.variable} [${NOMBRE_ROL[f.rol] ?? f.rol}] ${firmar(f.r)} (${f.r >= 0 ? 'cuanto más alta, mejor nivel' : 'cuanto más alta, peor nivel'})`)
            .join('; ') +
          `. Pares de variables más relacionados: ${pares.map((p) => `${p.a} y ${p.b} ${firmar(p.r)}`).join('; ')}.`,
        metodo,
        registros: corr.n,
        lectura: 'Correlación de -1 a 1 sobre los datos codificados y normalizados. Mide asociación, no causa.',
        con_el_objetivo: conObjetivo,
        pares_mas_relacionados: pares,
      };
    },
  },

  relacion_variables: {
    descripcion:
      'Relación entre DOS variables concretas que el usuario nombra («relación entre X e Y»): correlación de Spearman entre ellas y, por nivel del objetivo, la media (numéricas) o la categoría más frecuente. Muestra un diagrama de dispersión.',
    parametros: z.object({ x: z.string().min(1), y: z.string().min(1) }),
    async ejecutar({ x, y }, ctx) {
      const datos = await ctx.motor.llamar('dispersion', {
        ruta: ctx.rutaDatos,
        esquema: ctx.dataset.esquema,
        x: ctx.conceptoReal(x),
        y: ctx.conceptoReal(y),
        max_puntos: 1500,
      });
      ctx.emitir({ tipo: 'grafica', grafica: 'dispersion', titulo: `${datos.x.nombre} frente a ${datos.y.nombre}`, datos });
      const resumirEje = (eje, valores) => {
        if (!valores.length) return null;
        if (eje.tipo === 'numerico') return redondear(valores.reduce((s, v) => s + v, 0) / valores.length, 1);
        const conteo = new Map();
        for (const v of valores) conteo.set(v, (conteo.get(v) ?? 0) + 1);
        const [posicion] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
        return eje.categorias[posicion];
      };
      const porNivel = datos.niveles.map((nivel) => {
        const puntos = datos.puntos.filter((p) => p.nivel === nivel);
        return { nivel, x: resumirEje(datos.x, puntos.map((p) => p.x)), y: resumirEje(datos.y, puntos.map((p) => p.y)) };
      });
      const describir = (eje) => (eje.tipo === 'numerico' ? `media de ${eje.nombre}` : `${eje.nombre} más frecuente`);
      return {
        texto:
          `${datos.x.nombre} y ${datos.y.nombre}: correlación de Spearman ${datos.correlacion === null ? 'no definida' : firmar(datos.correlacion)} con ${datos.n} registros. ` +
          `Por nivel del objetivo: ${porNivel.map((g) => `${g.nivel}: ${describir(datos.x)} ${g.x}, ${describir(datos.y)} ${g.y}`).join('; ')}.`,
        x: datos.x.nombre,
        y: datos.y.nombre,
        correlacion_spearman: redondear(datos.correlacion, 2),
        registros: datos.n,
        por_nivel: porNivel,
        lectura: 'Las medias por nivel salen de una muestra de hasta 1500 registros; la correlación usa todos.',
      };
    },
  },

  simular_escenario: {
    descripcion:
      'Simula el nivel que alcanzaría un estudiante (id_estudiante) si cambian algunas acciones. "cambios" asigna a cada acción su nuevo valor en unidades originales, por ejemplo {"raisedhands": 60}.',
    parametros: conIdEstudiante({ cambios: z.record(z.string(), z.union([z.number(), z.string()])) }),
    async ejecutar({ id_estudiante: id, cambios }, ctx) {
      requiereModelo(ctx);
      const acciones = Object.fromEntries(Object.entries(cambios).map(([columna, valor]) => [ctx.columnaReal(columna), valor]));
      const simulacion = await ctx.motor.llamar('simular', {
        modelo: ctx.rutaModelo,
        ruta: ctx.rutaDatos,
        esquema: ctx.dataset.esquema,
        id,
        acciones,
      });
      ctx.emitir({ tipo: 'simulacion', id, simulacion });
      return {
        id_estudiante: id,
        lectura:
          `El FCM pasa de ${simulacion.base.nivel} (activación ${redondear(simulacion.base.activacion, 2)}) a ` +
          `${simulacion.simulado.nivel} (activación ${redondear(simulacion.simulado.activacion, 2)}). La activación va de 0 a 1 y no es una probabilidad.`,
        antes: { activacion: redondear(simulacion.base.activacion), nivel: simulacion.base.nivel },
        despues: { activacion: redondear(simulacion.simulado.activacion), nivel: simulacion.simulado.nivel },
        acciones: simulacion.acciones.map((a) => ({ columna: a.columna, actual: redondear(a.actual.valor, 1), simulada: redondear(a.simulada.valor, 1) })),
      };
    },
  },
};

/** Definiciones en el formato de herramientas de Ollama. */
export function definicionesHerramientas() {
  return Object.entries(HERRAMIENTAS).map(([nombre, h]) => {
    const { $schema, ...parametros } = z.toJSONSchema(h.parametros); // $schema solo gastaría contexto.
    return { type: 'function', function: { name: nombre, description: h.descripcion, parameters: parametros } };
  });
}

/** Ejecuta una herramienta; los errores vuelven al modelo como {error} para que corrija. */
export async function ejecutarHerramienta(nombre, argumentos, ctx) {
  const herramienta = HERRAMIENTAS[nombre];
  if (!herramienta) return { error: `No existe la herramienta ${nombre}.` };
  const crudos = typeof argumentos === 'string' ? JSON.parse(argumentos || '{}') : (argumentos ?? {});
  // El modelo suele enviar null en los parámetros opcionales que no usa: equivalen a omitirlos
  // (z.coerce convertiría null en 0, por ejemplo un id_estudiante inexistente).
  const args = Object.fromEntries(Object.entries(crudos).filter(([, valor]) => valor !== null));
  const validacion = herramienta.parametros.safeParse(args);
  if (!validacion.success) {
    return { error: `Argumentos no válidos: ${validacion.error.issues.map((i) => `${i.path.join('.') || 'argumentos'}: ${i.message}`).join('; ')}` };
  }
  try {
    return await herramienta.ejecutar(validacion.data, ctx);
  } catch (error) {
    return { error: error.message };
  }
}

export const NOMBRES_HERRAMIENTAS = Object.keys(HERRAMIENTAS);
