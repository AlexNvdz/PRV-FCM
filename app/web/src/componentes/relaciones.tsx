// Gráficas de relaciones entre variables: mapa de calor divergente (correlaciones o
// pesos W), dispersión de dos variables por nivel del objetivo y perfil medio de
// cada nivel. SVG propio: tooltip al pasar el cursor, vista de tabla y colores por
// variables CSS (cambian con el tema).
import { useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';

import type { Dispersion, Estadisticas } from '../tipos';
import { clase, colorNivel, firmado, num } from '../utilidades';
import { ItemLeyenda, MarcoGrafica } from './graficas';

function recortar(texto: string, largo: number) {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
}

/** Dos decimales sin "-0" para valores que redondean a cero. */
function dosDecimales(valor: number) {
  return Math.abs(valor) < 0.005 ? '0' : num(valor, 2);
}

/** Color de un valor en [-dominio, dominio]: rojo (negativo), gris neutro (0) o azul (positivo), mezclados en OKLab. */
export function colorDivergente(valor: number, dominio = 1) {
  const intensidad = Math.round(100 * Math.min(1, Math.abs(valor) / dominio));
  return `color-mix(in oklab, var(${valor >= 0 ? '--positivo' : '--negativo'}) ${intensidad}%, var(--neutro))`;
}

function Globo({ children, x, y }: { children: ReactNode; x: number; y: number }) {
  // x e y en porcentaje del contenedor; el globo se coloca encima del punto y no se sale por los lados.
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[260px] rounded-md border border-linea bg-hoja px-3 py-2 text-xs text-tinta shadow-[0_2px_10px_rgba(0,0,0,0.08)]"
      style={{ left: `${Math.min(Math.max(x, 12), 88)}%`, top: `${y}%`, transform: 'translate(-50%, calc(-100% - 10px))' }}
      role="status"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mapa de calor divergente
// ---------------------------------------------------------------------------
export function MapaCalor({
  titulo,
  descripcion,
  filas,
  columnas,
  valores,
  etiquetaValor = 'Valor',
  vacio = 'Sin valor',
  extremos = ['Negativo', 'Positivo'],
}: {
  titulo: ReactNode;
  descripcion?: ReactNode;
  filas: { id: string; nombre: string }[];
  columnas: { id: string; nombre: string }[];
  valores: (number | null)[][];
  etiquetaValor?: string;
  vacio?: string;
  extremos?: [string, string];
}) {
  const [activa, setActiva] = useState<{ i: number; j: number } | null>(null);
  const celda = Math.max(14, Math.min(42, Math.floor(680 / Math.max(columnas.length, 1))));
  const izquierda = 220;
  const giro = celda < 30; // Con celdas angostas, los identificadores de columna van inclinados.
  const arriba = giro ? 46 : 28;
  // Un mínimo de ancho evita que pocas columnas (por ejemplo, solo el objetivo) se dibujen enormes.
  const ancho = Math.max(560, izquierda + columnas.length * celda + 8);
  const alto = arriba + filas.length * celda + 4;
  const conValores = celda >= 30;

  const tabla = {
    columnas: ['', ...columnas.map((c) => c.id)],
    filas: filas.map((f, i) => [`${f.id} ${f.nombre}`, ...columnas.map((_, j) => (valores[i][j] === null ? '—' : dosDecimales(valores[i][j]!)))]),
  };
  const valorActivo = activa ? valores[activa.i][activa.j] : null;

  return (
    <MarcoGrafica
      titulo={titulo}
      descripcion={descripcion}
      tabla={tabla}
      leyenda={
        <span className="inline-flex items-center gap-2">
          <span>{extremos[0]}</span>
          <span
            className="h-2.5 w-36 rounded-full"
            style={{ background: 'linear-gradient(90deg, var(--negativo), var(--neutro), var(--positivo))' }}
            aria-hidden
          />
          <span>{extremos[1]}</span>
          <span className="text-tinta-3">(−1 a 1; gris cercano a 0)</span>
        </span>
      }
    >
      <div className="relative" style={{ maxWidth: `${ancho * 1.15}px` }} onPointerLeave={() => setActiva(null)}>
        <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" role="img" aria-label={typeof titulo === 'string' ? `${titulo}. La vista de tabla tiene todos los valores.` : undefined}>
          {columnas.map((c, j) => {
            const x = izquierda + j * celda + celda / 2;
            const resaltada = activa?.j === j;
            return giro ? (
              <text key={c.id} x={x} y={arriba - 6} transform={`rotate(-55 ${x} ${arriba - 6})`} fontSize={10.5} fill={resaltada ? 'var(--tinta)' : 'var(--tinta-3)'} fontWeight={resaltada ? 650 : 400}>
                {c.id}
              </text>
            ) : (
              <text key={c.id} x={x} y={arriba - 9} textAnchor="middle" fontSize={11} fill={resaltada ? 'var(--tinta)' : 'var(--tinta-3)'} fontWeight={resaltada ? 650 : 400}>
                {c.id}
              </text>
            );
          })}
          {filas.map((f, i) => {
            const y = arriba + i * celda;
            const resaltada = activa?.i === i;
            return (
              <g key={f.id}>
                <text x={izquierda - 8} y={y + celda / 2 + 4} textAnchor="end" fontSize={11.5} fill={resaltada ? 'var(--tinta)' : 'var(--tinta-2)'} fontWeight={resaltada ? 650 : 400}>
                  {recortar(`${f.id} ${f.nombre}`, 28)}
                </text>
                {columnas.map((c, j) => {
                  const v = valores[i][j];
                  const x = izquierda + j * celda;
                  const oscura = v !== null && Math.abs(v) > 0.55;
                  return (
                    <g key={c.id} onPointerEnter={() => setActiva({ i, j })}>
                      <rect
                        x={x + 1}
                        y={y + 1}
                        width={celda - 2}
                        height={celda - 2}
                        rx={3}
                        fill={v === null ? 'var(--hoja-2)' : colorDivergente(v)}
                        opacity={v === null ? 0.55 : 1}
                        stroke={activa?.i === i && activa?.j === j ? 'var(--tinta)' : 'none'}
                        strokeWidth={1.5}
                      />
                      {conValores && v !== null && (
                        <text x={x + celda / 2} y={y + celda / 2 + 3.5} textAnchor="middle" fontSize={10} fill={oscura ? '#ffffff' : 'var(--tinta)'} className="tabular" pointerEvents="none">
                          {dosDecimales(v)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {activa && (
          <Globo x={(100 * (izquierda + activa.j * celda + celda / 2)) / ancho} y={(100 * (arriba + activa.i * celda)) / alto}>
            <strong>{filas[activa.i].id} {filas[activa.i].nombre}</strong>
            <br />→ {columnas[activa.j].id} {columnas[activa.j].nombre}
            <br />
            {etiquetaValor}: {valorActivo === null ? vacio : Math.abs(valorActivo) < 0.005 ? '0' : firmado(valorActivo)}
          </Globo>
        )}
      </div>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Dispersión de dos variables, coloreada por nivel del objetivo
// ---------------------------------------------------------------------------
function marcas(min: number, max: number, cantidad = 5) {
  if (max - min < 1e-9) return [min];
  const paso0 = (max - min) / cantidad;
  const potencia = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= paso0) ?? paso0;
  const inicio = Math.ceil(min / paso) * paso;
  const salida = [];
  for (let v = inicio; v <= max + 1e-9; v += paso) salida.push(Number(v.toFixed(10)));
  return salida;
}

/** Desplazamiento reproducible en [-1, 1] a partir del id, para separar puntos de una misma categoría. */
function ruido(id: number, semilla: number) {
  const s = Math.sin(id * 12.9898 + semilla * 78.233) * 43758.5453;
  return 2 * (s - Math.floor(s)) - 1;
}

export function GraficaDispersion({ datos, titulo }: { datos: Dispersion; titulo?: ReactNode }) {
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [cercano, setCercano] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const niveles = datos.niveles;
  const colores = Object.fromEntries(niveles.map((n, i) => [n, colorNivel(i, niveles.length)]));

  const geometria = useMemo(() => {
    const ancho = 880;
    const alto = 430;
    const izquierda = datos.y.tipo === 'categorico' ? Math.min(160, 40 + 7 * Math.max(...(datos.y.categorias ?? ['']).map((c) => c.length))) : 62;
    const margen = { izquierda, derecha: 16, arriba: 14, abajo: 46 };
    const eje = (e: Dispersion['x'], valores: number[], desde: number, hasta: number) => {
      if (e.tipo === 'categorico') {
        const k = e.categorias?.length ?? 1;
        const banda = (hasta - desde) / k;
        return { escala: (v: number) => desde + (v + 0.5) * banda, banda, marcas: (e.categorias ?? []).map((c, i) => ({ v: i, texto: c })) };
      }
      const min = Math.min(...valores);
      const max = Math.max(...valores);
      const relleno = (max - min || 1) * 0.04;
      const [a, b] = [min - relleno, max + relleno];
      return { escala: (v: number) => desde + ((v - a) / (b - a)) * (hasta - desde), banda: 0, marcas: marcas(min, max).map((v) => ({ v, texto: num(v, 1) })) };
    };
    const ex = eje(datos.x, datos.puntos.map((p) => p.x), margen.izquierda, ancho - margen.derecha);
    const ey = eje(datos.y, datos.puntos.map((p) => p.y), alto - margen.abajo, margen.arriba);
    const puntos = datos.puntos.map((p) => ({
      ...p,
      px: ex.escala(p.x) + (ex.banda ? ruido(p.id, 1) * ex.banda * 0.32 : 0),
      py: ey.escala(p.y) + (ey.banda ? ruido(p.id, 2) * Math.abs(ey.banda) * 0.32 : 0),
    }));
    const centros = niveles.map((n) => {
      const del = datos.puntos.filter((p) => p.nivel === n);
      if (!del.length) return null;
      const mx = del.reduce((s, p) => s + p.x, 0) / del.length;
      const my = del.reduce((s, p) => s + p.y, 0) / del.length;
      return { nivel: n, n: del.length, x: mx, y: my, px: ex.escala(mx), py: ey.escala(my) };
    });
    return { ancho, alto, margen, ex, ey, puntos, centros };
  }, [datos, niveles]);

  const { ancho, alto, margen, ex, ey, puntos, centros } = geometria;
  const visibles = puntos.filter((p) => !ocultos.has(p.nivel));
  const valorEje = (e: Dispersion['x'], v: number) => (e.tipo === 'categorico' ? (e.categorias?.[Math.round(v)] ?? num(v)) : num(v, 2));

  function alMover(evento: PointerEvent<SVGSVGElement>) {
    const caja = svg.current?.getBoundingClientRect();
    if (!caja) return;
    const x = ((evento.clientX - caja.left) / caja.width) * ancho;
    const y = ((evento.clientY - caja.top) / caja.height) * alto;
    let mejor: number | null = null;
    let distancia = 18 ** 2; // El puntero solo tiene que estar cerca, no encima del punto.
    for (let k = 0; k < visibles.length; k++) {
      const d = (visibles[k].px - x) ** 2 + (visibles[k].py - y) ** 2;
      if (d < distancia) {
        distancia = d;
        mejor = k;
      }
    }
    setCercano(mejor === null ? null : visibles[mejor].id);
  }

  const punto = cercano === null ? null : visibles.find((p) => p.id === cercano);
  const resumenNivel = (e: Dispersion['x'], valores: number[]) => {
    if (!valores.length) return '—';
    if (e.tipo === 'numerico') return num(valores.reduce((s, v) => s + v, 0) / valores.length, 2);
    const conteo = new Map<number, number>();
    for (const v of valores) conteo.set(v, (conteo.get(v) ?? 0) + 1);
    const [posicion] = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0];
    return e.categorias?.[posicion] ?? String(posicion);
  };

  return (
    <MarcoGrafica
      titulo={titulo ?? `${datos.x.nombre} frente a ${datos.y.nombre}`}
      descripcion={
        <>
          Cada punto es un registro, coloreado por su nivel del objetivo; los rombos marcan la media de cada nivel.
          {datos.correlacion !== null && ` Spearman: ${firmado(datos.correlacion)} con los ${num(datos.n, 0)} registros.`}
          {datos.puntos.length < datos.n && ` Se dibuja una muestra de ${num(datos.puntos.length, 0)}.`}
        </>
      }
      tabla={{
        columnas: ['Nivel', 'Registros en la muestra', `${datos.x.nombre} (${datos.x.tipo === 'numerico' ? 'media' : 'más frecuente'})`, `${datos.y.nombre} (${datos.y.tipo === 'numerico' ? 'media' : 'más frecuente'})`],
        filas: niveles.map((n) => {
          const del = datos.puntos.filter((p) => p.nivel === n);
          return [n, del.length, resumenNivel(datos.x, del.map((p) => p.x)), resumenNivel(datos.y, del.map((p) => p.y))];
        }),
      }}
      leyenda={
        <>
          {niveles.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={!ocultos.has(n)}
              onClick={() => setOcultos((o) => (o.has(n) ? new Set([...o].filter((x) => x !== n)) : new Set([...o, n])))}
              className={clase('rounded-md px-1.5 py-0.5 hover:bg-hoja-2', ocultos.has(n) && 'opacity-40 line-through')}
            >
              <ItemLeyenda color={colores[n]} texto={n} />
            </button>
          ))}
          <span className="text-tinta-3">Pulse un nivel para ocultarlo o mostrarlo.</span>
        </>
      }
    >
      <div className="relative">
        <svg
          ref={svg}
          viewBox={`0 0 ${ancho} ${alto}`}
          className="block w-full touch-none"
          role="img"
          aria-label={`Dispersión de ${datos.x.nombre} frente a ${datos.y.nombre}. La vista de tabla resume cada nivel.`}
          onPointerMove={alMover}
          onPointerLeave={() => setCercano(null)}
        >
          {ey.marcas.map((m) => (
            <g key={`y${m.v}`}>
              <line x1={margen.izquierda} x2={ancho - margen.derecha} y1={ey.escala(m.v)} y2={ey.escala(m.v)} stroke="var(--cuadricula)" />
              <text x={margen.izquierda - 8} y={ey.escala(m.v) + 4} textAnchor="end" fontSize={11} fill="var(--tinta-3)" className="tabular">
                {recortar(m.texto, 20)}
              </text>
            </g>
          ))}
          {ex.marcas.map((m) => (
            <text key={`x${m.v}`} x={ex.escala(m.v)} y={alto - margen.abajo + 16} textAnchor="middle" fontSize={11} fill="var(--tinta-3)" className="tabular">
              {recortar(m.texto, 14)}
            </text>
          ))}
          <line x1={margen.izquierda} x2={ancho - margen.derecha} y1={alto - margen.abajo} y2={alto - margen.abajo} stroke="var(--eje)" />
          <text x={(margen.izquierda + ancho - margen.derecha) / 2} y={alto - 8} textAnchor="middle" fontSize={12} fill="var(--tinta-2)">
            {datos.x.nombre}
          </text>
          <text x={12} y={(alto - margen.abajo + margen.arriba) / 2} textAnchor="middle" fontSize={12} fill="var(--tinta-2)" transform={`rotate(-90 12 ${(alto - margen.abajo + margen.arriba) / 2})`}>
            {datos.y.nombre}
          </text>
          {visibles.map((p) => (
            <circle key={p.id} cx={p.px} cy={p.py} r={3.4} fill={colores[p.nivel]} fillOpacity={cercano === null || cercano === p.id ? 0.6 : 0.35} />
          ))}
          {centros.map(
            (c) =>
              c &&
              !ocultos.has(c.nivel) && (
                <g key={c.nivel}>
                  <rect x={c.px - 6.5} y={c.py - 6.5} width={13} height={13} transform={`rotate(45 ${c.px} ${c.py})`} fill={colores[c.nivel]} stroke="var(--superficie-grafica)" strokeWidth={2} />
                  <text x={c.px + 11} y={c.py + 4} fontSize={11.5} fill="var(--tinta)" stroke="var(--superficie-grafica)" strokeWidth={3} paintOrder="stroke" fontWeight={600}>
                    {c.nivel}
                  </text>
                </g>
              ),
          )}
          {punto && <circle cx={punto.px} cy={punto.py} r={6} fill="none" stroke="var(--tinta)" strokeWidth={1.5} />}
        </svg>
        {punto && (
          <Globo x={(100 * punto.px) / ancho} y={(100 * punto.py) / alto}>
            <strong>Registro {punto.id}</strong> (nivel {punto.nivel})
            <br />
            {datos.x.nombre}: {valorEje(datos.x, punto.x)}
            <br />
            {datos.y.nombre}: {valorEje(datos.y, punto.y)}
          </Globo>
        )}
      </div>
    </MarcoGrafica>
  );
}

// ---------------------------------------------------------------------------
// Perfil medio de cada nivel (valores normalizados)
// ---------------------------------------------------------------------------
export function GraficaPerfilNiveles({ perfil, niveles }: { perfil: NonNullable<Estadisticas['perfil_niveles']>; niveles: string[] }) {
  const [activa, setActiva] = useState<number | null>(null);
  const peor = niveles[0];
  const mejor = niveles.at(-1)!;
  const filas = useMemo(
    () =>
      [...perfil]
        .map((p) => ({ ...p, diferencia: (p.medias[mejor] ?? 0) - (p.medias[peor] ?? 0) }))
        .sort((a, b) => b.diferencia - a.diferencia),
    [perfil, mejor, peor],
  );
  const colores = Object.fromEntries(niveles.map((n, i) => [n, colorNivel(i, niveles.length)]));
  const ancho = 900;
  const izquierda = 240;
  const derecha = 28;
  const alto = filas.length * 26 + 34;
  const x = (v: number) => izquierda + v * (ancho - izquierda - derecha);
  const fila = activa === null ? null : filas[activa];

  return (
    <MarcoGrafica
      titulo="Perfil medio de cada nivel del objetivo"
      descripcion={`Media de cada variable ya normalizada a [0, 1] en cada nivel. Arriba, las que más suben de ${peor} a ${mejor}; abajo, las que más bajan.`}
      tabla={{
        columnas: ['Variable', 'Rol', ...niveles, `Diferencia ${mejor} − ${peor}`],
        filas: filas.map((f) => [`${f.id} ${f.nombre}`, f.rol, ...niveles.map((n) => num(f.medias[n], 3)), firmado(f.diferencia)]),
      }}
      leyenda={
        <>
          {niveles.map((n) => (
            <ItemLeyenda key={n} color={colores[n]} texto={`Media en ${n}`} />
          ))}
        </>
      }
    >
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full" role="img" aria-label="Perfil medio por nivel. La vista de tabla tiene todos los valores." onPointerLeave={() => setActiva(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={4} y2={alto - 24} stroke="var(--cuadricula)" />
            <text x={x(v)} y={alto - 8} textAnchor="middle" fontSize={11} fill="var(--tinta-3)" className="tabular">
              {num(v, 2)}
            </text>
          </g>
        ))}
        {filas.map((f, i) => {
          const y = 16 + i * 26;
          const medias = niveles.map((n) => f.medias[n]).filter((v): v is number => v !== null && v !== undefined);
          return (
            <g key={f.columna} onPointerEnter={() => setActiva(i)}>
              <rect x={0} y={y - 13} width={ancho} height={26} rx={5} fill={activa === i ? 'var(--hoja-2)' : 'transparent'} />
              <text x={izquierda - 12} y={y + 4} textAnchor="end" fontSize={12} fill={activa === i ? 'var(--tinta)' : 'var(--tinta-2)'}>
                {recortar(`${f.id} ${f.nombre}`, 28)}
              </text>
              {medias.length > 1 && <line x1={x(Math.min(...medias))} x2={x(Math.max(...medias))} y1={y} y2={y} stroke="var(--eje)" strokeWidth={2} strokeLinecap="round" />}
              {niveles.map((n) =>
                f.medias[n] === null || f.medias[n] === undefined ? null : (
                  <circle key={n} cx={x(f.medias[n]!)} cy={y} r={5} fill={colores[n]} stroke="var(--superficie-grafica)" strokeWidth={2} />
                ),
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 min-h-[1.25rem] text-xs text-tinta-2" aria-live="polite">
        {fila
          ? `${fila.id} ${fila.nombre}: ${niveles.map((n) => `${n} ${num(fila.medias[n], 3)}`).join(', ')} (diferencia ${mejor} − ${peor}: ${firmado(fila.diferencia)}).`
          : 'Pase el cursor sobre una variable para leer sus medias.'}
      </p>
    </MarcoGrafica>
  );
}
