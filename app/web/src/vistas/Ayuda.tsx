// Ayuda: guía de uso de cada parte de la aplicación, fórmulas, problemas frecuentes y
// glosario de siglas, símbolos y términos, con un buscador sobre todo su contenido.
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';

import { Capitulo, ConFormato, unirConY } from '../componentes/ayuda';
import { Encabezado, estiloControl } from '../componentes/ui';
import { buscarEnGlosario, ENTRADAS, GLOSARIO, gruposGlosario, normalizar, type EntradaGlosario } from '../glosario';
import { clase } from '../utilidades';
import { CAPITULOS } from './guia';

const INDICE = [...CAPITULOS.map(({ id, titulo }) => ({ id, titulo })), { id: 'glosario', titulo: 'Glosario' }];
const MAX_TERMINOS = 12;
const MAX_BLOQUES = 8;

interface BloqueIndexado {
  id: string;
  titulo: string;
  capitulo: string;
  texto: string;
  normal: string;
}

/** Bloques de la guía con su texto, leídos del documento una vez que se pintan. */
function useBloquesGuia() {
  const [bloques, setBloques] = useState<BloqueIndexado[]>([]);
  useEffect(() => {
    const nodos = document.querySelectorAll<HTMLElement>('[data-buscable]');
    setBloques(
      [...nodos].map((nodo) => {
        const texto = nodo.innerText.replace(/\s+/g, ' ').trim();
        return { id: nodo.id, titulo: nodo.dataset.titulo ?? '', capitulo: nodo.dataset.capitulo ?? '', texto, normal: normalizar(texto) };
      }),
    );
  }, []);
  return bloques;
}

/** Capítulo que se está leyendo: el último cuyo inicio ya pasó por el primer tercio de la ventana. */
function useCapituloVisible() {
  const [actual, setActual] = useState(INDICE[0].id);
  useEffect(() => {
    const visibles = new Set<string>();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) visibles.add(e.target.id);
          else visibles.delete(e.target.id);
        }
        const ultimo = INDICE.findLast((c) => visibles.has(c.id));
        if (ultimo) setActual(ultimo.id);
      },
      { rootMargin: '0px 0px -66% 0px' },
    );
    for (const { id } of INDICE) {
      const nodo = document.getElementById(id);
      if (nodo) observador.observe(nodo);
    }
    return () => observador.disconnect();
  }, []);
  return actual;
}

/** Fragmento del texto alrededor de la primera coincidencia, con la coincidencia resaltada. */
function Fragmento({ bloque, consulta }: { bloque: BloqueIndexado; consulta: string }) {
  const inicio = bloque.normal.indexOf(consulta);
  if (inicio < 0) return <>{bloque.texto.slice(0, 160)}…</>;
  const desde = Math.max(0, bloque.texto.lastIndexOf(' ', Math.max(0, inicio - 70)) + 1);
  const hasta = bloque.texto.indexOf(' ', Math.min(bloque.texto.length, inicio + consulta.length + 110));
  const fin = hasta === -1 ? bloque.texto.length : hasta;
  return (
    <>
      {desde > 0 && '…'}
      {bloque.texto.slice(desde, inicio)}
      <strong className="font-semibold text-tinta">{bloque.texto.slice(inicio, inicio + consulta.length)}</strong>
      {bloque.texto.slice(inicio + consulta.length, fin)}
      {fin < bloque.texto.length && '…'}
    </>
  );
}

function TarjetaTermino({ entrada, ancla }: { entrada: EntradaGlosario; ancla: boolean }) {
  const relacionados = (entrada.ver ?? []).filter((id): id is keyof typeof GLOSARIO => id in GLOSARIO);
  return (
    <div id={ancla ? `g-${entrada.id}` : undefined} className="scroll-mt-6 rounded-lg px-4 py-3 target:bg-hoja-2 target:ring-1 target:ring-linea">
      <dt>
        <span className="text-[1.04rem] font-semibold text-tinta">
          <ConFormato texto={entrada.termino} />
        </span>
        {entrada.expansion && (
          <span className="ml-2 text-sm text-tinta-2">
            <ConFormato texto={entrada.expansion} />
          </span>
        )}
      </dt>
      <dd className="mt-1 max-w-[78ch] space-y-2 text-[0.95rem] leading-relaxed text-tinta">
        <p>
          <ConFormato texto={entrada.definicion} />
        </p>
        {entrada.formula && <p className="overflow-x-auto whitespace-nowrap rounded-md bg-hoja-2/70 px-3 py-1.5 font-mono text-[0.82rem]">{entrada.formula}</p>}
        {entrada.donde && (
          <p className="text-sm text-tinta-2">
            <span className="font-medium text-tinta">Dónde aparece: </span>
            <ConFormato texto={entrada.donde} />
          </p>
        )}
        {relacionados.length > 0 && (
          <p className="text-sm text-tinta-2">
            <span className="font-medium text-tinta">Ver también: </span>
            {unirConY(relacionados, (id) => (
              <a href={`#g-${id}`} className="underline decoration-linea underline-offset-[3px] hover:decoration-tinta">
                <ConFormato texto={GLOSARIO[id].termino} />
              </a>
            ))}
            .
          </p>
        )}
      </dd>
    </div>
  );
}

function Resultados({ consulta, bloques }: { consulta: string; bloques: BloqueIndexado[] }) {
  const q = normalizar(consulta.trim());
  const terminos = useMemo(() => buscarEnGlosario(consulta), [consulta]);
  const enGuia = useMemo(
    () =>
      bloques
        .filter((b) => b.normal.includes(q))
        // Primero los bloques cuyo título contiene la búsqueda; después, en el orden de la guía.
        .sort((a, b) => Number(normalizar(b.titulo).includes(q)) - Number(normalizar(a.titulo).includes(q))),
    [bloques, q],
  );
  const total = terminos.length + enGuia.length;

  return (
    <div className="mt-4 rounded-xl border border-linea bg-hoja p-5">
      <p className="text-sm text-tinta-2" role="status">
        {total === 0 ? (
          <>
            Sin resultados para «{consulta.trim()}». Pruebe con otra palabra o recorra el{' '}
            <a href="#glosario" className="underline decoration-linea underline-offset-[3px] hover:decoration-tinta">
              glosario completo
            </a>
            .
          </>
        ) : (
          `${total} ${total === 1 ? 'resultado' : 'resultados'} para «${consulta.trim()}».`
        )}
      </p>
      {terminos.length > 0 && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-tinta">En el glosario ({terminos.length})</h2>
          <dl className="-mx-4 mt-1 divide-y divide-linea">
            {terminos.slice(0, MAX_TERMINOS).map((e) => (
              <TarjetaTermino key={e.id} entrada={e} ancla={false} />
            ))}
          </dl>
          {terminos.length > MAX_TERMINOS && (
            <p className="mt-2 text-xs text-tinta-3">Y {terminos.length - MAX_TERMINOS} términos más: escriba más letras para afinar la búsqueda.</p>
          )}
        </section>
      )}
      {enGuia.length > 0 && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold text-tinta">En la guía ({enGuia.length})</h2>
          <ul className="mt-2 space-y-3">
            {enGuia.slice(0, MAX_BLOQUES).map((b) => (
              <li key={b.id}>
                <span className="block text-xs text-tinta-3">{b.capitulo}</span>
                <a href={`#${b.id}`} className="font-medium text-tinta underline decoration-linea underline-offset-[3px] hover:decoration-tinta">
                  {b.titulo}
                </a>
                <p className="mt-0.5 text-sm text-tinta-2">
                  <Fragmento bloque={b} consulta={q} />
                </p>
              </li>
            ))}
          </ul>
          {enGuia.length > MAX_BLOQUES && <p className="mt-2 text-xs text-tinta-3">Y {enGuia.length - MAX_BLOQUES} secciones más.</p>}
        </section>
      )}
    </div>
  );
}

function Glosario() {
  const grupos = useMemo(() => gruposGlosario(), []);
  return (
    <section id="glosario" aria-labelledby="glosario-titulo" className="scroll-mt-6 border-t border-linea pt-9">
      <h2 id="glosario-titulo" className="font-serif text-[1.55rem] font-semibold leading-tight tracking-[-0.01em] text-tinta">
        Glosario
      </h2>
      <p className="mt-2 max-w-[72ch] text-tinta-2">
        {ENTRADAS.length} siglas, símbolos y términos de la aplicación, con lo que significan y dónde aparecen.
      </p>
      <nav aria-label="Letras del glosario" className="mt-4 flex flex-wrap gap-1">
        {grupos.map((g) => (
          <a
            key={g.clave}
            href={`#glosario-${g.clave}`}
            className={clase(
              'inline-flex h-8 items-center justify-center rounded-md border border-linea bg-hoja px-2.5 text-sm text-tinta hover:bg-hoja-2',
              g.clave !== 'simbolos' && 'min-w-8',
            )}
          >
            {g.clave === 'simbolos' ? 'Símbolos' : g.titulo}
          </a>
        ))}
      </nav>
      <div className="mt-6 space-y-8">
        {grupos.map((g) => (
          <section key={g.clave} id={`glosario-${g.clave}`} aria-labelledby={`glosario-${g.clave}-titulo`} className="scroll-mt-6">
            <h3 id={`glosario-${g.clave}-titulo`} className="border-b border-linea pb-1.5 font-serif text-lg font-semibold text-tinta">
              {g.titulo}
            </h3>
            <dl className="-mx-4 mt-2 space-y-1">
              {g.entradas.map((e) => (
                <TarjetaTermino key={e.id} entrada={e} ancla />
              ))}
            </dl>
          </section>
        ))}
      </div>
    </section>
  );
}

function Contenido({ actual, alElegir }: { actual?: string; alElegir?: () => void }) {
  return (
    <ol className="space-y-0.5 text-sm">
      {INDICE.map((c) => (
        <li key={c.id}>
          <a
            href={`#${c.id}`}
            onClick={alElegir}
            aria-current={actual === c.id ? 'location' : undefined}
            className={clase(
              'block rounded-md border-l-2 px-3 py-1 transition-colors',
              actual === c.id ? 'border-tinta bg-hoja-2 font-medium text-tinta' : 'border-transparent text-tinta-2 hover:bg-hoja-2 hover:text-tinta',
            )}
          >
            {c.titulo}
          </a>
        </li>
      ))}
    </ol>
  );
}

export function Ayuda() {
  const [consulta, setConsulta] = useState('');
  const [indiceAbierto, setIndiceAbierto] = useState(false);
  const bloques = useBloquesGuia();
  const actual = useCapituloVisible();
  const { hash } = useLocation();
  const buscando = normalizar(consulta.trim()).length >= 2 || /[^\x00-\x7f]/.test(consulta.trim());

  // Al llegar con un ancla (por ejemplo /ayuda#g-bptt), el contenido aún no existía cuando el navegador la buscó.
  useEffect(() => {
    if (hash) document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
  }, [hash]);

  return (
    <div>
      <Encabezado
        titulo="Guía de uso y glosario"
        descripcion="Cómo usar cada parte de Pizarra, paso a paso, y qué significa cada sigla, símbolo y término que aparece en la aplicación. Los términos subrayados con puntos llevan a su definición en el glosario."
      />

      <div role="search" className="max-w-4xl">
        <label htmlFor="buscar-ayuda" className="sr-only">
          Buscar en la guía y el glosario
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tinta-3" aria-hidden />
          <input
            id="buscar-ayuda"
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setConsulta('')}
            placeholder="Buscar: BPTT, PSR, λ, máscara, perfil de riesgo…"
            autoComplete="off"
            className={clase(estiloControl, 'h-11! pl-9! pr-10 text-[0.95rem] [&::-webkit-search-cancel-button]:hidden')}
          />
          {consulta && (
            <button
              type="button"
              onClick={() => setConsulta('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-tinta-3 hover:bg-hoja-2 hover:text-tinta"
              aria-label="Borrar la búsqueda"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {buscando && <Resultados consulta={consulta} bloques={bloques} />}
      </div>

      <details open={indiceAbierto} onToggle={(e) => setIndiceAbierto(e.currentTarget.open)} className="mt-6 rounded-xl border border-linea bg-hoja px-4 py-3 xl:hidden">
        <summary className="cursor-pointer text-sm font-medium text-tinta">Contenido</summary>
        <nav aria-label="Contenido de la ayuda" className="mt-3">
          <Contenido alElegir={() => setIndiceAbierto(false)} />
        </nav>
      </details>

      <div className="mt-10 grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_230px]">
        <div className="min-w-0 space-y-9">
          {CAPITULOS.map(({ id, titulo, Contenido: Texto }) => (
            <Capitulo key={id} id={id} titulo={titulo}>
              <Texto />
            </Capitulo>
          ))}
          <Glosario />
        </div>
        <aside className="sticky top-8 hidden max-h-[calc(100vh-4rem)] overflow-y-auto xl:block">
          <p className="mb-2 px-3 text-xs font-medium text-tinta-3">En esta página</p>
          <nav aria-label="Contenido de la ayuda">
            <Contenido actual={actual} />
          </nav>
        </aside>
      </div>
    </div>
  );
}
