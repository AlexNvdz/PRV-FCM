// Cómo se llama cada registro del dataset (paciente, cliente, estudiante) en los textos.
// El motor lo resuelve en el esquema; aquí solo se completan los artículos.

export const SUJETO_POR_DEFECTO = { singular: 'registro', plural: 'registros', femenino: false };

export function sujetoDe(sujeto) {
  const { singular, plural, femenino } = { ...SUJETO_POR_DEFECTO, ...sujeto };
  return {
    singular,
    plural,
    femenino,
    el: femenino ? 'la' : 'el',
    los: femenino ? 'las' : 'los',
    al: femenino ? 'a la' : 'al',
    un: femenino ? 'una' : 'un',
    todos: femenino ? 'todas las' : 'todos los',
  };
}

/** Sujeto de un modelo listo: graficas.json lo trae; en los anteriores al campo, el motor lo resuelve al cargar modelo.json (xAPI: estudiante). */
export async function sujetoModelo(motor, rutaModelo, graficas) {
  return graficas?.sujeto ?? (await motor.llamar('modelo_info', { modelo: rutaModelo }).catch(() => ({}))).sujeto ?? SUJETO_POR_DEFECTO;
}
