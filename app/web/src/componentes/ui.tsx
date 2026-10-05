// Piezas de interfaz compartidas. Radios según jerarquía: 6px controles, 12px paneles, píldora para chips.
import { CircleAlert, CircleCheck, Info, LoaderCircle, TriangleAlert } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { clase, colorNivel } from '../utilidades';

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------
type Variante = 'principal' | 'secundario' | 'fantasma' | 'peligro';

const VARIANTES: Record<Variante, string> = {
  principal: 'bg-boton text-boton-texto hover:opacity-90 disabled:opacity-50',
  secundario: 'border border-linea bg-hoja text-tinta hover:bg-hoja-2 disabled:opacity-50',
  fantasma: 'text-tinta-2 hover:bg-hoja-2 hover:text-tinta disabled:opacity-50',
  peligro: 'border border-linea bg-hoja text-critico hover:bg-hoja-2 disabled:opacity-50',
};

export function Boton({
  variante = 'secundario',
  icono,
  cargando = false,
  className,
  children,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; icono?: ReactNode; cargando?: boolean }) {
  return (
    <button
      type="button"
      className={clase(
        'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        VARIANTES[variante],
        className,
      )}
      disabled={cargando || resto.disabled}
      {...resto}
    >
      {cargando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icono}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Estructura
// ---------------------------------------------------------------------------
export function Encabezado({ titulo, descripcion, acciones }: { titulo: ReactNode; descripcion?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[68ch]">
        <h1 className="font-serif text-[1.9rem] font-semibold leading-tight tracking-[-0.01em] text-tinta">{titulo}</h1>
        {descripcion && <p className="mt-2 text-tinta-2">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

export function Panel({
  titulo,
  descripcion,
  acciones,
  children,
  className,
  sinMargen = false,
}: {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  sinMargen?: boolean;
}) {
  return (
    <section className={clase('rounded-xl border border-linea bg-hoja', !sinMargen && 'p-5', className)}>
      {(titulo || acciones) && (
        <div className={clase('mb-4 flex flex-wrap items-start justify-between gap-3', sinMargen && 'px-5 pt-5')}>
          <div className="max-w-[70ch]">
            {titulo && <h2 className="text-[1.05rem] font-semibold text-tinta">{titulo}</h2>}
            {descripcion && <p className="mt-1 text-sm text-tinta-2">{descripcion}</p>}
          </div>
          {acciones && <div className="flex items-center gap-2">{acciones}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Sección sin marco: título y contenido separados por espacio, no por una tarjeta. */
export function Seccion({ titulo, descripcion, acciones, children }: { titulo: ReactNode; descripcion?: ReactNode; acciones?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-[70ch]">
          <h2 className="font-serif text-[1.3rem] font-semibold text-tinta">{titulo}</h2>
          {descripcion && <p className="mt-1 text-sm text-tinta-2">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------
type TipoAviso = 'error' | 'aviso' | 'info' | 'ok';

const AVISOS: Record<TipoAviso, { icono: typeof Info; color: string }> = {
  error: { icono: CircleAlert, color: 'text-critico' },
  aviso: { icono: TriangleAlert, color: 'text-aviso' },
  info: { icono: Info, color: 'text-tinta-2' },
  ok: { icono: CircleCheck, color: 'text-bien' },
};

export function Aviso({ tipo = 'info', children, className }: { tipo?: TipoAviso; children: ReactNode; className?: string }) {
  const { icono: Icono, color } = AVISOS[tipo];
  return (
    <div role={tipo === 'error' ? 'alert' : undefined} className={clase('flex gap-2.5 text-sm', className)}>
      <Icono className={clase('mt-0.5 size-4 shrink-0', color)} aria-hidden />
      <div className="text-tinta">{children}</div>
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-sm text-tinta-2" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {texto}
    </div>
  );
}

export function Vacio({ titulo, children, accion }: { titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-linea px-6 py-10 text-center">
      <p className="font-serif text-lg font-semibold text-tinta">{titulo}</p>
      {children && <div className="mx-auto mt-2 max-w-[56ch] text-sm text-tinta-2">{children}</div>}
      {accion && <div className="mt-5 flex justify-center">{accion}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Datos pequeños
// ---------------------------------------------------------------------------
export function NivelChip({ nivel, niveles, mejor }: { nivel: string | null | undefined; niveles: string[]; mejor?: string }) {
  if (!nivel) return <span className="text-tinta-3">—</span>;
  const indice = Math.max(niveles.indexOf(nivel), 0);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-linea px-2 py-0.5 text-xs font-medium text-tinta">
      <span className="size-2.5 rounded-full" style={{ background: colorNivel(indice, niveles.length) }} aria-hidden />
      {nivel}
      {mejor === nivel && <span className="sr-only"> (mejor nivel)</span>}
    </span>
  );
}

/** Clase de concepto de PRV-FCM con subíndice: C_T objetivo, C_P prescriptivo, C_S del sistema. */
export function Clase({ letra }: { letra: 'T' | 'P' | 'S' }) {
  return (
    <span className="whitespace-nowrap">
      C<sub className="text-[0.72em]">{letra}</sub>
    </span>
  );
}

/** Bloque de explicación matemática: fórmula en monoespaciada y su lectura. */
export function Formula({ children, lectura }: { children: ReactNode; lectura?: ReactNode }) {
  return (
    <div className="rounded-lg border border-linea bg-hoja-2/60 px-4 py-3">
      <p className="overflow-x-auto whitespace-nowrap font-mono text-[0.82rem] text-tinta">{children}</p>
      {lectura && <p className="mt-1.5 text-xs text-tinta-2">{lectura}</p>}
    </div>
  );
}

export function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: ReactNode; detalle?: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-tinta-2">{etiqueta}</dt>
      <dd className="tabular mt-0.5 text-xl font-semibold text-tinta">{valor}</dd>
      {detalle && <dd className="mt-0.5 text-xs text-tinta-3">{detalle}</dd>}
    </div>
  );
}

export function Pestanas<T extends string>({
  opciones,
  valor,
  alCambiar,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  alCambiar: (valor: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="tablist" aria-label={etiqueta} className="mb-6 flex gap-1 border-b border-linea">
      {opciones.map((o) => (
        <button
          key={o.valor}
          role="tab"
          type="button"
          aria-selected={o.valor === valor}
          onClick={() => alCambiar(o.valor)}
          className={clase(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            o.valor === valor ? 'border-tinta text-tinta' : 'border-transparent text-tinta-2 hover:text-tinta',
          )}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

export function Campo({ etiqueta, ayuda, children, id }: { etiqueta: string; ayuda?: ReactNode; children: ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-tinta">
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="text-xs text-tinta-3">{ayuda}</p>}
    </div>
  );
}

export const estiloControl =
  'h-9 w-full rounded-md border border-linea bg-hoja px-2.5 text-sm text-tinta placeholder:text-tinta-3 focus-visible:outline-2 disabled:opacity-60';

export function Barra({ valor, className }: { valor: number; className?: string }) {
  return (
    <div className={clase('h-1.5 w-full overflow-hidden rounded-full bg-hoja-2', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(valor)}>
      <div className="h-full rounded-full bg-serie-1 transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(0, valor))}%` }} />
    </div>
  );
}
