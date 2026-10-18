// Gráficas de la aplicación. Cada una tiene su tabla equivalente (botón "Ver tabla"),
// tooltip al pasar el cursor y colores por variables CSS, así cambian con el tema.
import { Table2, ChartColumn } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { EstadisticaVariable, FilaSeleccion, Graficas } from '../tipos';
import { clase, colorNivel, firmado, formatoEje, mayuscula, num, pct, type SujetoTexto } from '../utilidades';
import { estiloControl } from './ui';

// ---------------------------------------------------------------------------
// Marco común: título, alternar gráfica/tabla
// ---------------------------------------------------------------------------
export interface TablaDatos {
  columnas: string[];
  filas: (string | number)[][];
}

export function MarcoGrafica({
  titulo,
  descripcion,
  tabla,
  leyenda,
  children,
  className,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  tabla: TablaDatos;
  leyenda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [verTabla, setVerTabla] = useState(false);
  return (
    <figure className={clase('rounded-xl border border-linea bg-superficie-grafica p-5', className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <figcaption className="max-w-[62ch]">
          <span className="block text-[0.98rem] font-semibold text-tinta">{titulo}</span>
          {descripcion && <span className="mt-0.5 block text-sm text-tinta-2">{descripcion}</span>}
        </figcaption>
        <button
          type="button"
          onClick={() => setVerTabla((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-tinta-2 hover:bg-hoja-2 hover:text-tinta"
          aria-pressed={verTabla}
        >
          {verTabla ? <ChartColumn className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
          {verTabla ? 'Ver gráfica' : 'Ver tabla'}
        </button>
      </div>
      {verTabla ? <TablaSimple tabla={tabla} /> : children}
      {!verTabla && leyenda && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-2">{leyenda}</div>}
    </figure>
  );
}

export function TablaSimple({ tabla }: { tabla: TablaDatos }) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-linea">
      <table className="tabular w-full text-sm">
        <thead className="sticky top-0 bg-hoja-2 text-left text-tinta-2">
          <tr>
            {tabla.columnas.map((c) => (
              <th key={c} scope="col" className="px-3 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((fila, i) => (
            <tr key={i} className="border-t border-linea">
              {fila.map((celda, j) => (
                <td key={j} className="px-3 py-1.5 text-tinta">
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ItemLeyenda({ color, texto, forma = 'punto' }: { color: string; texto: string; forma?: 'punto' | 'linea' }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {forma === 'punto' ? (
        <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      ) : (
        <span className="h-0.5 w-4 rounded-full" style={{ background: color }} aria-hidden />
      )}
      {texto}
    </span>
  );
}

export function Globo({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-linea bg-hoja px-3 py-2 text-xs text-tinta shadow-[0_2px_10px_rgba(0,0,0,0.08)]">{children}</div>;
}

export const EJE = { stroke: 'var(--eje)' };

/** Nombre de categoría recortado a una línea; el nombre completo queda en el tooltip y en la tabla. */
function TickRecortado(props: { x?: number; y?: number; payload?: { value: string } }) {
  const texto = String(props.payload?.value ?? '');
  return (
    <text x={props.x} y={props.y} dy={4} textAnchor="end" fontSize={12.5} fill="var(--tinta-2)">
      {texto.length > 26 ? `${texto.slice(0, 25)}…` : texto}
    </text>
  );
}

/** Valor de cada barra: tras el extremo si es positiva; junto al cero si es negativa, lejos de los nombres. */
function EtiquetaValor(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string; formato: (v: number) => string }) {
  const x = Number(props.x ?? 0);
  const ancho = Number(props.width ?? 0);
  const valor = Number(props.value ?? 0);
  // En barras negativas Recharts entrega x en el cero y un ancho negativo.
  const posicion = valor >= 0 ? x + ancho + 6 : x + 6;
  return (
    <text x={posicion} y={Number(props.y ?? 0) + Number(props.height ?? 0) / 2 + 4} textAnchor="start" fontSize={11.5} fill="var(--tinta-2)" className="tabular">
      {props.formato(valor)}
    </text>
  );
}
export const TICK = { fill: 'var(--tinta-3)', fontSize: 12 };
export const REJILLA = <CartesianGrid stroke="var(--cuadricula)" vertical={false} />;

// ---------------------------------------------------------------------------
// Distribución del objetivo
// ---------------------------------------------------------------------------
export function GraficaNiveles({ niveles, objetivo, s }: { niveles: { etiqueta: string; n: number }[]; objetivo: string; s: SujetoTexto }) {
  const total = niveles.reduce((s, n) => s + n.n, 0);
  const datos = niveles.map((n, i) => ({ ...n, color: colorNivel(i, niveles.length), porcentaje: (100 * n.n) / total }));
  return (
    <MarcoGrafica
      titulo={`${mayuscula(s.plural)} por nivel de ${objetivo}`}
      descripcion="Del peor al mejor nivel."
      tabla={{ columnas: ['Nivel', mayuscula(s.plural), 'Porcentaje'], filas: datos.map((d) => [d.etiqueta, d.n, pct(d.porcentaje)]) }}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={datos} margin={{ top: 18, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
          {REJILLA}
          <XAxis dataKey="etiqueta" tick={TICK} axisLine={EJE} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: 'var(--hoja-2)' }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <Globo>
                  <strong>{payload[0].payload.etiqueta}</strong>: {payload[0].payload.n} {s.plural} ({pct(payload[0].payload.porcentaje)})
                </Globo>
              ) : null
            }
          />
          <Bar dataKey="n" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: 'var(--tinta-2)', fontSize: 12, formatter: (v: unknown) => num(Number(v), 0) }}>
            {datos.map((d) => (
              <Cell key={d.etiqueta} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Barras divergentes (correlaciones o pesos)
// ---------------------------------------------------------------------------
export function GraficaDivergente({
  titulo,
  descripcion,
  datos,
  etiquetaValor,
  formato = (v) => firmado(v),
  dominio,
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  datos: { nombre: string; valor: number; detalle?: string }[];
  etiquetaValor: string;
  formato?: (v: number) => string;
  dominio?: [number, number];
}) {
  const alto = Math.max(160, datos.length * 30 + 30);
  const maximo = Math.max(1e-6, ...datos.map((d) => Math.abs(d.valor)));
  const tope = maximo > 0.6 ? 1 : Math.ceil(maximo * 12) / 10;
  const limite = dominio ?? [-tope, tope];
  return (
    <MarcoGrafica
      titulo={titulo}
      descripcion={descripcion}
      tabla={{ columnas: ['Variable', etiquetaValor, ''], filas: datos.map((d) => [d.nombre, formato(d.valor), d.detalle ?? '']) }}
      leyenda={
        <>
          <ItemLeyenda color="var(--positivo)" texto="Empuja al mejor nivel" />
          <ItemLeyenda color="var(--negativo)" texto="Empuja al peor nivel" />
        </>
      }
    >
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 0 }} barCategoryGap={5}>
          <CartesianGrid stroke="var(--cuadricula)" horizontal={false} />
          <XAxis type="number" domain={limite} tick={TICK} axisLine={EJE} tickLine={false} tickFormatter={(v) => num(v, 1)} />
          <YAxis type="category" dataKey="nombre" width={190} tick={<TickRecortado />} axisLine={false} tickLine={false} interval={0} />
          <ReferenceLine x={0} stroke="var(--eje)" />
          <Tooltip
            cursor={{ fill: 'var(--hoja-2)' }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <Globo>
                  <strong>{payload[0].payload.nombre}</strong>
                  <br />
                  {etiquetaValor}: {formato(payload[0].payload.valor)}
                  {payload[0].payload.detalle && (
                    <>
                      <br />
                      <span className="text-tinta-2">{payload[0].payload.detalle}</span>
                    </>
                  )}
                </Globo>
              ) : null
            }
          />
          <Bar dataKey="valor" radius={4} label={<EtiquetaValor formato={formato} />}>
            {datos.map((d) => (
              <Cell key={d.nombre} fill={d.valor >= 0 ? 'var(--positivo)' : 'var(--negativo)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Una variable por nivel del objetivo
// ---------------------------------------------------------------------------
export function GraficaVariable({ variable, niveles, s }: { variable: EstadisticaVariable; niveles: string[]; s: SujetoTexto }) {
  const colores = Object.fromEntries(niveles.map((n, i) => [n, colorNivel(i, niveles.length)]));
  const leyenda = niveles.map((n) => <ItemLeyenda key={n} color={colores[n]} texto={n} />);
  const correlacion = variable.correlacion === null ? '' : ` Correlación con el objetivo: ${firmado(variable.correlacion)}.`;

  if (variable.histograma && variable.por_nivel) {
    const { bordes, conteos } = variable.histograma;
    const datos = bordes.slice(0, -1).map((desde, i) => {
      const fila: Record<string, number | string> = { rango: `${num(desde, 1)}–${num(bordes[i + 1], 1)}` };
      for (const n of niveles) fila[n] = conteos[n]?.[i] ?? 0;
      return fila;
    });
    return (
      <MarcoGrafica
        titulo={`${variable.nombre}: distribución por nivel`}
        descripcion={`Media por nivel: ${variable.por_nivel.map((p) => `${p.nivel} ${num(p.media)}`).join(', ')}.${correlacion}`}
        leyenda={leyenda}
        tabla={{
          columnas: ['Rango', ...niveles],
          filas: datos.map((d) => [d.rango as string, ...niveles.map((n) => d[n] as number)]),
        }}
      >
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={datos} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={2}>
            {REJILLA}
            <XAxis dataKey="rango" tick={{ ...TICK, fontSize: 11 }} axisLine={EJE} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'var(--hoja-2)' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <Globo>
                    <strong>{label}</strong>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)}>
                        {String(p.dataKey)}: {String(p.value)} {s.plural}
                      </div>
                    ))}
                  </Globo>
                ) : null
              }
            />
            {niveles.map((n, i) => (
              <Bar key={n} dataKey={n} stackId="niveles" fill={colores[n]} stroke="var(--superficie-grafica)" strokeWidth={1} radius={i === niveles.length - 1 ? [4, 4, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </MarcoGrafica>
    );
  }

  const categorias = variable.categorias ?? [];
  const datos = categorias.map((c) => {
    const fila: Record<string, number | string> = { categoria: c.categoria, total: c.n };
    for (const n of niveles) fila[n] = c.n ? (100 * (c.por_nivel[n] ?? 0)) / c.n : 0;
    return fila;
  });
  return (
    <MarcoGrafica
      titulo={`${variable.nombre}: nivel del objetivo en cada categoría`}
      descripcion={`Porcentaje de ${s.plural} de cada categoría en cada nivel.${correlacion}`}
      leyenda={leyenda}
      tabla={{
        columnas: ['Categoría', mayuscula(s.plural), ...niveles],
        filas: categorias.map((c) => [c.categoria, c.n, ...niveles.map((n) => c.por_nivel[n] ?? 0)]),
      }}
    >
      <ResponsiveContainer width="100%" height={Math.max(150, datos.length * 34 + 40)}>
        <BarChart data={datos} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barCategoryGap={6}>
          <XAxis type="number" domain={[0, 100]} tick={TICK} axisLine={EJE} tickLine={false} tickFormatter={(v) => `${v} %`} />
          <YAxis type="category" dataKey="categoria" width={130} tick={{ ...TICK, fill: 'var(--tinta-2)' }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip
            cursor={{ fill: 'var(--hoja-2)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Globo>
                  <strong>{label}</strong> ({payload[0].payload.total} {s.plural})
                  {payload.map((p) => (
                    <div key={String(p.dataKey)}>
                      {String(p.dataKey)}: {pct(Number(p.value))}
                    </div>
                  ))}
                </Globo>
              ) : null
            }
          />
          {niveles.map((n) => (
            <Bar key={n} dataKey={n} stackId="niveles" fill={colores[n]} stroke="var(--superficie-grafica)" strokeWidth={2} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Selección de lambda por validación cruzada
// ---------------------------------------------------------------------------
export function GraficaSeleccion({ tabla, lambda, alpha, mayoritaria }: { tabla: FilaSeleccion[]; lambda: number; alpha: number; mayoritaria?: number }) {
  const lambdas = [...new Set(tabla.map((f) => f.lambda))].sort((a, b) => a - b);
  const alphas = [...new Set(tabla.map((f) => f.alpha_l2))].sort((a, b) => a - b);
  // Con niveles equilibrados, el criterio de elección es la exactitud equilibrada: se grafica esa.
  const equilibrada = tabla.some((f) => typeof f.exactitud_equilibrada === 'number');
  const medida = (f: FilaSeleccion) => (equilibrada ? (f.exactitud_equilibrada ?? 0) : f.exactitud);
  const nombreMedida = equilibrada ? 'exactitud equilibrada' : 'exactitud';
  const datos = lambdas.map((l) => {
    const fila: Record<string, number | [number, number]> = { lambda: l };
    for (const a of alphas) {
      const f = tabla.find((t) => t.lambda === l && t.alpha_l2 === a);
      if (!f) continue;
      fila[`a${a}`] = 100 * medida(f);
      if (a === alpha && !equilibrada) fila.banda = [100 * (f.exactitud - (f.exactitud_de ?? 0)), 100 * (f.exactitud + (f.exactitud_de ?? 0))];
    }
    return fila;
  });
  const elegida = tabla.find((f) => f.lambda === lambda && f.alpha_l2 === alpha);
  return (
    <MarcoGrafica
      titulo="Selección de λ por validación cruzada"
      descripcion={`Elegido: λ = ${num(lambda, 2)}, α = ${alpha} (${pct(100 * (elegida ? medida(elegida) : 0))} de ${nombreMedida} media).`}
      leyenda={
        <>
          <ItemLeyenda color="var(--serie-1)" texto={equilibrada ? `α = ${alpha}` : `α = ${alpha} (banda: ± 1 desviación)`} forma="linea" />
          {alphas.length > 1 && <ItemLeyenda color="var(--eje)" texto={`Otros α (${alphas.filter((a) => a !== alpha).join(', ')})`} forma="linea" />}
          {mayoritaria !== undefined && !equilibrada && <ItemLeyenda color="var(--tinta-3)" texto={`Clase mayoritaria (${pct(100 * mayoritaria, 0)})`} forma="linea" />}
        </>
      }
      tabla={{
        columnas: ['λ', 'α', 'Exactitud media', ...(equilibrada ? ['Exactitud equilibrada'] : []), 'Desviación', 'MAE'],
        filas: [...tabla]
          .sort((a, b) => a.lambda - b.lambda || a.alpha_l2 - b.alpha_l2)
          .map((f) => [
            num(f.lambda, 2),
            f.alpha_l2,
            pct(100 * f.exactitud),
            ...(equilibrada ? [pct(100 * (f.exactitud_equilibrada ?? 0))] : []),
            pct(100 * (f.exactitud_de ?? 0)),
            num(f.MAE, 3),
          ]),
      }}
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={datos} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
          {REJILLA}
          <XAxis dataKey="lambda" type="number" scale="log" domain={[lambdas[0], lambdas.at(-1) ?? 1]} ticks={lambdas} tick={TICK} axisLine={EJE} tickLine={false} tickFormatter={(v) => num(v, 2)} />
          <YAxis domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} />
          {mayoritaria !== undefined && !equilibrada && <ReferenceLine y={100 * mayoritaria} stroke="var(--tinta-3)" />}
          <Area dataKey="banda" stroke="none" fill="var(--serie-1)" fillOpacity={0.12} isAnimationActive={false} />
          {alphas
            .filter((a) => a !== alpha)
            .map((a) => (
              <Line key={a} dataKey={`a${a}`} stroke="var(--eje)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            ))}
          <Line dataKey={`a${alpha}`} stroke="var(--serie-1)" strokeWidth={2} dot={{ r: 4, fill: 'var(--serie-1)', stroke: 'var(--superficie-grafica)', strokeWidth: 2 }} isAnimationActive={false} />
          <Tooltip
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Globo>
                  <strong>λ = {num(Number(label), 2)}</strong>
                  {alphas.map((a) => {
                    const valor = payload[0].payload[`a${a}`];
                    return valor === undefined ? null : (
                      <div key={a}>
                        α = {a}: {pct(valor as number)}
                      </div>
                    );
                  })}
                </Globo>
              ) : null
            }
          />
        </ComposedChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Antes y después de la prescripción
// ---------------------------------------------------------------------------
export function GraficaAntesDespues({
  datos,
  umbral,
  mejor,
  s,
}: {
  datos: { id: number; base: number; prescrito: number; meta?: string; umbral_meta?: number }[];
  umbral: number;
  mejor: string;
  s: SujetoTexto;
}) {
  const puntos = datos.map((d, i) => ({ ...d, orden: i + 1 }));
  // Una línea por meta: con meta escalonada, una por nivel siguiente; si no (o en modelos antiguos), la del mejor nivel.
  const lineas = [...new Map(datos.flatMap((d) => (d.meta !== undefined && d.umbral_meta !== undefined ? [[d.meta, d.umbral_meta] as const] : []))).entries()].sort((a, b) => a[1] - b[1]);
  if (!lineas.length) lineas.push([mejor, umbral]);
  const varias = lineas.length > 1;
  const ordenado = `Cada ${s.singular} ${s.femenino ? 'ordenada' : 'ordenado'} por su activación actual`;
  return (
    <MarcoGrafica
      titulo="Activación del objetivo antes y después de prescribir"
      descripcion={
        varias
          ? `${ordenado}. Apunta al nivel siguiente al suyo y lo alcanza sobre la línea de su meta (${lineas.map(([n, u]) => `${n} desde ${num(u, 2)}`).join('; ')}).`
          : `${ordenado}. Sobre la línea (${num(lineas[0][1], 2)}) queda en ${lineas[0][0]}.`
      }
      leyenda={
        <>
          <ItemLeyenda color="var(--serie-1)" texto="Acciones actuales" forma="linea" />
          <ItemLeyenda color="var(--serie-2)" texto="Acciones prescritas" />
        </>
      }
      tabla={{
        columnas: [`${mayuscula(s.singular)} (id)`, ...(varias ? ['Meta'] : []), 'Actual', 'Prescrita'],
        filas: puntos.map((p) => [p.id, ...(varias ? [p.meta ?? ''] : []), num(p.base, 3), num(p.prescrito, 3)]),
      }}
    >
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={puntos} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
          {REJILLA}
          <XAxis dataKey="orden" type="number" domain={[1, puntos.length]} tick={TICK} axisLine={EJE} tickLine={false} />
          <YAxis domain={[0, 1]} tick={TICK} axisLine={false} tickLine={false} />
          {lineas.map(([nivel, u]) => (
            <ReferenceLine key={nivel} y={u} stroke="var(--tinta-3)" label={varias ? { value: nivel, position: 'insideTopLeft', fill: 'var(--tinta-2)', fontSize: 11 } : undefined} />
          ))}
          <Scatter dataKey="prescrito" fill="var(--serie-2)" fillOpacity={0.55} shape="circle" isAnimationActive={false} />
          <Line dataKey="base" stroke="var(--serie-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Globo>
                  <strong>{mayuscula(s.singular)} {payload[0].payload.id}</strong>
                  {varias && <div>Meta: {payload[0].payload.meta}</div>}
                  <div>Actual: {num(payload[0].payload.base, 3)}</div>
                  <div>Prescrita: {num(payload[0].payload.prescrito, 3)}</div>
                </Globo>
              ) : null
            }
          />
        </ComposedChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Convergencia del AG
// ---------------------------------------------------------------------------
/** Nombre de una generación del AG: la 0 es la población inicial, antes del primer cruce. */
export const nombreGeneracion = (g: number) => (g === 0 ? 'Población inicial (generación 0)' : `Generación ${g}`);

const EJE_GENERACION = { value: 'Generación', position: 'insideBottom', offset: -2, fill: 'var(--tinta-3)', fontSize: 11 } as const;

export function GraficaConvergencia({ datos, s }: { datos: Graficas['convergencia']; s: SujetoTexto }) {
  const { progreso, medio } = datos;
  const [vista, setVista] = useState<'aptitud' | 'costo'>('aptitud');
  // Modelos antiguos: sin progreso ni costo medio, solo la mediana del mejor costo (en azul, como antes).
  const nuevo = Boolean(progreso);
  const colorMejor = nuevo ? 'var(--serie-2)' : 'var(--serie-1)';
  const selector = nuevo && (
    <label className="mb-3 flex items-center gap-2 text-xs text-tinta-2">
      Ver
      <select className={clase(estiloControl, 'h-8 w-52! text-xs')} value={vista} onChange={(e) => setVista(e.target.value as 'aptitud' | 'costo')}>
        <option value="aptitud">Aptitud normalizada</option>
        <option value="costo">Costo</option>
      </select>
    </label>
  );

  if (progreso && vista === 'aptitud') {
    const filas = datos.generacion.map((g, i) => ({ generacion: g, mejor: progreso.mejor[i], medio: progreso.medio[i] }));
    const minimo = Math.min(0, ...progreso.mejor, ...progreso.medio);
    return (
      <MarcoGrafica
        titulo="Convergencia del algoritmo genético"
        descripcion={`Cuanto más arriba, mejor. El AG minimiza el costo; aquí se muestra como aptitud: 0 es el costo medio de la población inicial de cada ${s.singular} y 1, su mejor costo final. Mediana entre ${s.plural}.`}
        leyenda={
          <>
            <ItemLeyenda color="var(--serie-2)" texto="Mejor individuo (élite)" forma="linea" />
            <ItemLeyenda color="var(--serie-1)" texto="Promedio de la población" forma="linea" />
          </>
        }
        tabla={{
          columnas: ['Generación', 'Mejor individuo (élite)', 'Promedio de la población'],
          filas: filas.map((f) => [f.generacion === 0 ? '0 (población inicial)' : f.generacion, num(f.mejor, 3), num(f.medio, 3)]),
        }}
      >
        {selector}
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={filas} margin={{ top: 10, right: 16, left: -4, bottom: 12 }}>
            {REJILLA}
            <XAxis dataKey="generacion" type="number" domain={[0, 'dataMax']} allowDecimals={false} tick={TICK} axisLine={EJE} tickLine={false} label={EJE_GENERACION} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => num(v, 2)} domain={[Math.floor(minimo * 10) / 10, 1]} />
            <Line dataKey="medio" stroke="var(--serie-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="mejor" stroke="var(--serie-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Tooltip
              cursor={{ stroke: 'var(--eje)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <Globo>
                    <strong>{nombreGeneracion(payload[0].payload.generacion)}</strong>
                    <div>Mejor individuo: {num(payload[0].payload.mejor, 3)}</div>
                    <div>Promedio de la población: {num(payload[0].payload.medio, 3)}</div>
                  </Globo>
                ) : null
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </MarcoGrafica>
    );
  }

  const filas = datos.generacion.map((g, i) => ({ generacion: g, banda: [datos.q1[i], datos.q3[i]], mediana: datos.mediana[i], medio: medio?.[i] ?? null }));
  return (
    <MarcoGrafica
      titulo="Convergencia del algoritmo genético"
      descripcion={`Mejor costo por generación: mediana y rango intercuartílico entre ${s.plural}${medio ? ', con la mediana del costo medio de la población' : ''}. Menor es mejor.`}
      leyenda={
        <>
          <ItemLeyenda color={colorMejor} texto="Mejor costo: mediana (banda: cuartiles 1 y 3)" forma="linea" />
          {medio && <ItemLeyenda color="var(--serie-1)" texto="Costo medio de la población" forma="linea" />}
        </>
      }
      tabla={{
        columnas: ['Generación', 'Cuartil 1', 'Mediana', 'Cuartil 3', ...(medio ? ['Costo medio'] : [])],
        filas: filas.map((f) => [
          f.generacion === 0 ? '0 (población inicial)' : f.generacion,
          num(f.banda[0], 4),
          num(f.mediana, 4),
          num(f.banda[1], 4),
          ...(medio ? [num(f.medio, 4)] : []),
        ]),
      }}
    >
      {selector}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={filas} margin={{ top: 10, right: 16, left: -4, bottom: nuevo ? 12 : 0 }}>
          {REJILLA}
          <XAxis
            dataKey="generacion"
            type="number"
            domain={['dataMin', 'dataMax']}
            allowDecimals={false}
            tick={TICK}
            axisLine={EJE}
            tickLine={false}
            label={nuevo ? EJE_GENERACION : undefined}
          />
          <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={formatoEje([...datos.q1, ...datos.q3, ...(medio ?? [])])} domain={['auto', 'auto']} />
          <Area dataKey="banda" stroke="none" fill={colorMejor} fillOpacity={0.14} isAnimationActive={false} />
          {medio && <Line dataKey="medio" stroke="var(--serie-1)" strokeWidth={2} dot={false} isAnimationActive={false} />}
          <Line dataKey="mediana" stroke={colorMejor} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Globo>
                  <strong>{nombreGeneracion(payload[0].payload.generacion)}</strong>
                  <div>Mejor costo, mediana: {num(payload[0].payload.mediana, 4)}</div>
                  {payload[0].payload.medio !== null && <div>Costo medio: {num(payload[0].payload.medio, 4)}</div>}
                </Globo>
              ) : null
            }
          />
        </ComposedChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Convergencia del AG para una sola prescripción
// ---------------------------------------------------------------------------
export function GraficaConvergenciaIndividual({ historial }: { historial: { mejor: number[]; promedio: number[] } }) {
  // La posición 0 del historial es la población inicial (generación 0).
  const filas = historial.mejor.map((mejor, i) => ({ generacion: i, mejor, promedio: historial.promedio[i] ?? null }));
  return (
    <MarcoGrafica
      titulo="Convergencia del algoritmo genético"
      descripcion={`Costo por generación (población inicial y ${filas.length - 1} generaciones): el mejor individuo y la media de la población. El mejor nunca empeora gracias al elitismo.`}
      leyenda={
        <>
          <ItemLeyenda color="var(--serie-2)" texto="Mejor costo" forma="linea" />
          <ItemLeyenda color="var(--serie-1)" texto="Costo medio de la población" forma="linea" />
        </>
      }
      tabla={{
        columnas: ['Generación', 'Mejor costo', 'Costo medio'],
        filas: filas.map((f) => [f.generacion === 0 ? '0 (población inicial)' : f.generacion, num(f.mejor, 4), f.promedio === null ? '—' : num(f.promedio, 4)]),
      }}
    >
      <ResponsiveContainer width="100%" height={210}>
        <ComposedChart data={filas} margin={{ top: 10, right: 16, left: -4, bottom: 0 }}>
          {REJILLA}
          <XAxis dataKey="generacion" type="number" domain={[0, 'dataMax']} allowDecimals={false} tick={TICK} axisLine={EJE} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={formatoEje([...historial.mejor, ...historial.promedio])} domain={['auto', 'auto']} />
          <Line dataKey="promedio" stroke="var(--serie-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="mejor" stroke="var(--serie-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Globo>
                  <strong>{nombreGeneracion(payload[0].payload.generacion)}</strong>
                  <div>Mejor costo: {num(payload[0].payload.mejor, 4)}</div>
                  {payload[0].payload.promedio !== null && <div>Costo medio: {num(payload[0].payload.promedio, 4)}</div>}
                </Globo>
              ) : null
            }
          />
        </ComposedChart>
      </ResponsiveContainer>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Mancuernas: un valor antes y otro después por fila
// ---------------------------------------------------------------------------
export function GraficaMancuernas({
  titulo,
  descripcion,
  filas,
  formato = (v) => num(v),
  formatoCambio = (v) => firmado(v, 1),
  dominio,
  referencia,
  etiquetas = ['Actual', 'Recomendado'],
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  filas: { nombre: string; desde: number; hasta: number; min?: number; max?: number }[];
  formato?: (v: number) => string;
  formatoCambio?: (v: number) => string;
  dominio?: [number, number];
  /** Valor con una línea vertical de referencia (por ejemplo, 0); requiere un dominio común. */
  referencia?: number;
  etiquetas?: [string, string];
}) {
  const [activa, setActiva] = useState<number | null>(null);
  // El margen izquierdo crece con el nombre más largo (recortado a 26 caracteres) para que nunca se corte.
  const largoNombre = Math.max(0, ...filas.map((f) => Math.min(f.nombre.length, 26)));
  const izquierda = Math.min(230, Math.max(160, Math.round(largoNombre * 7.6) + 22));
  const ancho = 560 + izquierda - 160;
  const derecha = 96;
  const alto = filas.length * 46 + 24;
  const escala = (fila: Partial<(typeof filas)[number]>, v: number) => {
    const [min, max] = dominio ?? [fila.min ?? 0, fila.max ?? 1];
    return izquierda + ((v - min) / (max - min || 1)) * (ancho - izquierda - derecha);
  };
  return (
    <MarcoGrafica
      titulo={titulo}
      descripcion={descripcion}
      leyenda={
        <>
          <ItemLeyenda color="var(--serie-1)" texto={etiquetas[0]} />
          <ItemLeyenda color="var(--serie-2)" texto={etiquetas[1]} />
        </>
      }
      tabla={{ columnas: ['', etiquetas[0], etiquetas[1], 'Cambio'], filas: filas.map((f) => [f.nombre, formato(f.desde), formato(f.hasta), formatoCambio(f.hasta - f.desde)]) }}
    >
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full" role="img" aria-label={typeof titulo === 'string' ? titulo : undefined}>
        {referencia !== undefined && dominio && (
          <line x1={escala({}, referencia)} x2={escala({}, referencia)} y1={2} y2={alto - 2} stroke="var(--eje)" strokeWidth={1} />
        )}
        {filas.map((f, i) => {
          const y = 24 + i * 46;
          const x1 = escala(f, f.desde);
          const x2 = escala(f, f.hasta);
          const resaltada = activa === i;
          return (
            <g key={f.nombre} onMouseEnter={() => setActiva(i)} onMouseLeave={() => setActiva(null)} onFocus={() => setActiva(i)} onBlur={() => setActiva(null)} tabIndex={0}>
              <rect x={0} y={y - 20} width={ancho} height={40} fill={resaltada ? 'var(--hoja-2)' : 'transparent'} rx={6} />
              <text x={izquierda - 14} y={y + 4} textAnchor="end" fontSize={14} fill="var(--tinta-2)">
                {f.nombre.length > 26 ? `${f.nombre.slice(0, 25)}…` : f.nombre}
              </text>
              <line x1={izquierda} x2={ancho - derecha} y1={y} y2={y} stroke="var(--cuadricula)" />
              <line x1={x1} x2={x2} y1={y} y2={y} stroke="var(--eje)" strokeWidth={3} strokeLinecap="round" />
              <circle cx={x1} cy={y} r={6} fill="var(--serie-1)" stroke="var(--superficie-grafica)" strokeWidth={2} />
              <circle cx={x2} cy={y} r={6} fill="var(--serie-2)" stroke="var(--superficie-grafica)" strokeWidth={2} />
              <text x={Math.max(x1, x2) + 12} y={y + 5} fontSize={13} fill="var(--tinta-2)" className="tabular">
                {formato(f.hasta)} ({formatoCambio(f.hasta - f.desde)})
              </text>
              {resaltada && (
                <text x={izquierda} y={y - 10} fontSize={12} fill="var(--tinta-3)">
                  {etiquetas[0]} {formato(f.desde)} → {etiquetas[1]} {formato(f.hasta)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </MarcoGrafica>
  );
}
