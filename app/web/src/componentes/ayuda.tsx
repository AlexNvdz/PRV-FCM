// Piezas de la página de ayuda: capítulos y bloques que indexa su buscador, enlaces a
// términos del glosario y texto con marcas simples (código y subíndices).
import { createContext, Fragment, useContext, type ReactNode } from 'react';

import { GLOSARIO, type IdTermino } from '../glosario';

const ContextoCapitulo = createContext('');

/** Capítulo de la guía: título con ancla. Sus bloques lo citan en los resultados de búsqueda. */
export function Capitulo({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="scroll-mt-6 border-t border-linea pt-9 first:border-t-0 first:pt-0">
      <h2 id={`${id}-titulo`} className="font-serif text-[1.55rem] font-semibold leading-tight tracking-[-0.01em] text-tinta">
        {titulo}
      </h2>
      <ContextoCapitulo.Provider value={titulo}>
        <div className="mt-6 space-y-9">{children}</div>
      </ContextoCapitulo.Provider>
    </section>
  );
}

/** Bloque de un capítulo: la unidad que encuentra el buscador de la ayuda. */
export function Bloque({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  const capitulo = useContext(ContextoCapitulo);
  return (
    <section id={id} data-buscable="" data-titulo={titulo} data-capitulo={capitulo} className="scroll-mt-6">
      <h3 className="text-[1.08rem] font-semibold text-tinta">{titulo}</h3>
      <div className="mt-2.5 max-w-[78ch] space-y-3 text-[0.96rem] leading-relaxed text-tinta">{children}</div>
    </section>
  );
}

/** Texto con marcas: `código` entre comillas invertidas y subíndices con guion bajo (C_T, w_ji). */
export function ConFormato({ texto }: { texto: string }) {
  return (
    <>
      {texto.split('`').map((parte, i) =>
        i % 2 === 1 ? (
          <Codigo key={i}>{parte}</Codigo>
        ) : (
          <Fragment key={i}>
            {parte.split(/(?<=[\p{L}*)])_(\p{L}[\p{L}\d]*|\d+)/u).map((trozo, j) =>
              j % 2 === 1 ? (
                <sub key={j} className="text-[0.72em]">
                  {trozo}
                </sub>
              ) : (
                trozo
              ),
            )}
          </Fragment>
        ),
      )}
    </>
  );
}

/** Primera oración de una definición, sin marcas: el texto emergente de los enlaces al glosario. */
function primeraOracion(texto: string) {
  const fin = texto.search(/\.\s/);
  return (fin === -1 ? texto : texto.slice(0, fin + 1)).replaceAll('`', '');
}

/** Enlace a la definición de un término del glosario. */
export function T({ a, children }: { a: IdTermino; children?: ReactNode }) {
  const entrada = GLOSARIO[a];
  const expansion = 'expansion' in entrada ? `${entrada.expansion}. ` : '';
  return (
    <a
      href={`#g-${a}`}
      title={`${expansion}${primeraOracion(entrada.definicion)}`}
      className="underline decoration-tinta-3 decoration-dotted underline-offset-[3px] hover:decoration-tinta hover:decoration-solid"
    >
      {children ?? <ConFormato texto={entrada.termino} />}
    </a>
  );
}

/** Enumeración en español: «a», «a y b», «a, b y c». */
export function unirConY<E>(elementos: E[], pintar: (elemento: E) => ReactNode) {
  return elementos.map((elemento, i) => (
    <Fragment key={i}>
      {i > 0 && (i === elementos.length - 1 ? ' y ' : ', ')}
      {pintar(elemento)}
    </Fragment>
  ));
}

/** Remisión a entradas del glosario por su nombre, entre comillas: «A», «B» y «C». */
export function Entradas({ a }: { a: IdTermino[] }) {
  return <>{unirConY(a, (id) => <>«<T a={id} />»</>)}</>;
}

/** Enlace a otra parte de la ayuda. */
export function Ir({ a, children }: { a: string; children: ReactNode }) {
  return (
    <a href={`#${a}`} className="font-medium underline underline-offset-[3px] decoration-linea hover:decoration-tinta">
      {children}
    </a>
  );
}

export function Codigo({ children }: { children: ReactNode }) {
  return <code className="rounded bg-hoja-2 px-1 py-px font-mono text-[0.86em] text-tinta">{children}</code>;
}

export function Tecla({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-linea bg-hoja px-1.5 py-px font-mono text-[0.8em] text-tinta shadow-[0_1px_0_var(--linea)]">{children}</kbd>;
}

/** Instrucciones en orden. */
export function Pasos({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:text-tinta-3">{children}</ol>;
}

export function Lista({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-tinta-3">{children}</ul>;
}

/** Lista de definiciones: un nombre (control, dato, columna) y lo que significa. */
export function Defs({ children }: { children: ReactNode }) {
  return <dl className="space-y-3">{children}</dl>;
}

export function Def({ t, children }: { t: ReactNode; children: ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-tinta">{t}</dt>
      <dd className="mt-0.5 text-tinta-2">{children}</dd>
    </div>
  );
}
