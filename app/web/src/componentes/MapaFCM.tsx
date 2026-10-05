// Mapa cognitivo difuso aprendido: el objetivo al centro y cada concepto
// alrededor, agrupado por rol. El grosor de cada arista es la fuerza del peso y
// el color su signo. Al pasar el cursor (o con Tab) se lee el peso exacto.
import { ChartColumn, Table2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ConceptoGrafo } from '../tipos';
import { firmado, NOMBRE_ROL } from '../utilidades';
import { TablaSimple } from './graficas';

interface Props {
  conceptos: ConceptoGrafo[];
  aristas: { origen: string; destino: string; peso: number }[];
  objetivo: string;
  titulo?: string;
  compacto?: boolean;
}

const ORDEN_ROL: Record<string, number> = { accion: 0, mutable: 1, inmutable: 2 };
const GRUPO: Record<string, string> = { accion: 'Acciones', mutable: 'Mutables', inmutable: 'Inmutables' };

function recortar(texto: string, largo: number) {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
}

function Marca({ rol, x, y, r, activo }: { rol: string; x: number; y: number; r: number; activo: boolean }) {
  const trazo = activo ? 'var(--tinta)' : 'var(--tinta-2)';
  if (rol === 'accion') {
    const l = r * 1.7;
    return <rect x={x - l / 2} y={y - l / 2} width={l} height={l} rx={2} fill="var(--tinta)" stroke="var(--superficie-grafica)" strokeWidth={2} />;
  }
  if (rol === 'mutable') {
    return <circle cx={x} cy={y} r={r} fill="var(--superficie-grafica)" stroke={trazo} strokeWidth={2.2} />;
  }
  return <circle cx={x} cy={y} r={r * 0.8} fill="var(--tinta-3)" stroke="var(--superficie-grafica)" strokeWidth={2} />;
}

export function MapaFCM({ conceptos, aristas, objetivo, titulo = 'Mapa cognitivo difuso aprendido', compacto = false }: Props) {
  const [activo, setActivo] = useState<string | null>(null);
  const [verTabla, setVerTabla] = useState(false);

  const disposicion = useMemo(() => {
    const ancho = compacto ? 620 : 800;
    const alto = compacto ? 470 : 580;
    const cx = ancho / 2;
    const cy = alto / 2;
    const radio = compacto ? 150 : 200;
    const centro = conceptos.find((c) => c.columna === objetivo);
    const externos = conceptos
      .filter((c) => !c.dinamico)
      .map((c, i) => ({ c, i }))
      .sort((a, b) => ORDEN_ROL[a.c.rol] - ORDEN_ROL[b.c.rol] || a.i - b.i)
      .map(({ c }) => c);
    const internos = conceptos.filter((c) => c.dinamico && c.columna !== objetivo);
    // Un hueco entre grupos de rol para que se lean como capas distintas.
    const grupos = [...new Set(externos.map((c) => c.rol))];
    const pasos = externos.length + grupos.length;
    const posiciones = new Map<string, { x: number; y: number; angulo: number; c: ConceptoGrafo }>();
    let paso = 0;
    let rolPrevio: string | null = null;
    const sectores: { rol: string; desde: number; hasta: number }[] = [];
    for (const c of externos) {
      if (c.rol !== rolPrevio) {
        if (rolPrevio !== null) paso += 1;
        sectores.push({ rol: c.rol, desde: paso, hasta: paso });
        rolPrevio = c.rol;
      }
      const angulo = -Math.PI / 2 + (2 * Math.PI * (paso + 0.5)) / pasos;
      posiciones.set(c.id, { x: cx + radio * Math.cos(angulo), y: cy + radio * Math.sin(angulo), angulo, c });
      sectores[sectores.length - 1].hasta = paso;
      paso += 1;
    }
    internos.forEach((c, k) => {
      const angulo = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(internos.length, 1);
      posiciones.set(c.id, { x: cx + radio * 0.46 * Math.cos(angulo), y: cy + radio * 0.46 * Math.sin(angulo), angulo, c });
    });
    if (centro) posiciones.set(centro.id, { x: cx, y: cy, angulo: 0, c: centro });
    const pesoMax = Math.max(1e-6, ...aristas.map((a) => Math.abs(a.peso)));
    const rotulos = sectores.map((s) => {
      const medio = -Math.PI / 2 + (2 * Math.PI * ((s.desde + s.hasta) / 2 + 0.5)) / pasos;
      return { rol: s.rol, x: cx + radio * 0.66 * Math.cos(medio), y: cy + radio * 0.66 * Math.sin(medio) };
    });
    return { ancho, alto, cx, cy, radio, centro, posiciones, pesoMax, rotulos, muchos: externos.length > 22 };
  }, [conceptos, aristas, objetivo, compacto]);

  const { ancho, alto, centro, posiciones, pesoMax, rotulos, muchos } = disposicion;
  const radioCentro = compacto ? 30 : 38;
  const radioNodo = muchos ? 5 : 6.5;
  const letra = muchos ? 10.5 : compacto ? 11.5 : 12.5;
  const pesoDe = (id: string) => aristas.find((a) => a.origen === id && a.destino === centro?.id)?.peso;
  const activoConcepto = activo ? posiciones.get(activo)?.c : null;
  const pesoActivo = activo ? pesoDe(activo) : undefined;

  const filasTabla = aristas
    .filter((a) => a.destino === centro?.id)
    .sort((a, b) => Math.abs(b.peso) - Math.abs(a.peso))
    .map((a) => {
      const c = posiciones.get(a.origen)?.c;
      return [a.origen, c?.nombre ?? '', c ? NOMBRE_ROL[c.rol] : '', firmado(a.peso)];
    });

  return (
    <figure className="overflow-hidden rounded-xl border border-linea bg-superficie-grafica">
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <figcaption className="max-w-[62ch]">
          <span className="block text-[0.98rem] font-semibold text-tinta">{titulo}</span>
          <span className="mt-0.5 block text-sm text-tinta-2">
            Pesos hacia {centro?.nombre ?? objetivo}: el grosor es la fuerza y el color, el sentido.
          </span>
        </figcaption>
        <button
          type="button"
          onClick={() => setVerTabla((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-tinta-2 hover:bg-hoja-2 hover:text-tinta"
          aria-pressed={verTabla}
        >
          {verTabla ? <ChartColumn className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
          {verTabla ? 'Ver mapa' : 'Ver tabla'}
        </button>
      </div>

      {verTabla ? (
        <div className="p-5">
          <TablaSimple tabla={{ columnas: ['Concepto', 'Variable', 'Rol', 'Peso'], filas: filasTabla }} />
        </div>
      ) : (
        <>
          <div className="cuadriculado mt-3 border-y border-linea">
            <svg viewBox={`0 0 ${ancho} ${alto}`} className="mx-auto block w-full max-w-[860px]" role="img" aria-label={`${titulo}. Use Tab para recorrer los conceptos.`}>
              {rotulos.map((r) => (
                <text
                  key={r.rol}
                  x={r.x}
                  y={r.y}
                  textAnchor="middle"
                  fontSize={11.5}
                  fill="var(--tinta-3)"
                  stroke="var(--superficie-grafica)"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {GRUPO[r.rol]}
                </text>
              ))}

              {aristas.map((a, k) => {
                const o = posiciones.get(a.origen);
                const d = posiciones.get(a.destino);
                if (!o || !d) return null;
                const fuerza = Math.abs(a.peso) / pesoMax;
                const hacia = d.c.id === centro?.id ? radioCentro + 4 : radioNodo + 3;
                const dx = d.x - o.x;
                const dy = d.y - o.y;
                const largo = Math.hypot(dx, dy);
                const x2 = d.x - (dx / largo) * hacia;
                const y2 = d.y - (dy / largo) * hacia;
                const tenue = activo !== null && a.origen !== activo && a.destino !== activo;
                return (
                  <line
                    key={`${a.origen}-${a.destino}`}
                    x1={o.x}
                    y1={o.y}
                    x2={x2}
                    y2={y2}
                    stroke={a.peso >= 0 ? 'var(--positivo)' : 'var(--negativo)'}
                    strokeWidth={0.8 + 5.2 * fuerza}
                    strokeLinecap="round"
                    strokeOpacity={tenue ? 0.1 : 0.3 + 0.65 * fuerza}
                    className="arista-animada"
                    style={{ ['--largo' as string]: `${largo}`, ['--retraso' as string]: `${k * 35}ms` }}
                  />
                );
              })}

              {[...posiciones.values()].map(({ x, y, angulo, c }) => {
                if (c.id === centro?.id) return null;
                const derecha = Math.cos(angulo) >= -0.01;
                const esActivo = activo === c.id;
                const lx = x + (derecha ? 1 : -1) * (radioNodo + 7);
                return (
                  <g
                    key={c.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${c.id} ${c.nombre}, ${NOMBRE_ROL[c.rol]}, peso ${firmado(pesoDe(c.id) ?? 0)}`}
                    onMouseEnter={() => setActivo(c.id)}
                    onMouseLeave={() => setActivo(null)}
                    onFocus={() => setActivo(c.id)}
                    onBlur={() => setActivo(null)}
                    className="cursor-default outline-none"
                    opacity={activo !== null && !esActivo ? 0.45 : 1}
                  >
                    <circle cx={x} cy={y} r={16} fill="transparent" />
                    <Marca rol={c.rol} x={x} y={y} r={radioNodo} activo={esActivo} />
                    <text
                      x={lx}
                      y={y + 4}
                      textAnchor={derecha ? 'start' : 'end'}
                      fontSize={letra}
                      fill={esActivo ? 'var(--tinta)' : 'var(--tinta-2)'}
                      fontWeight={esActivo ? 650 : 400}
                      stroke="var(--superficie-grafica)"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {recortar(`${c.id} ${c.nombre}`, muchos ? 18 : 24)}
                    </text>
                  </g>
                );
              })}

              {centro && (
                <g>
                  <circle cx={disposicion.cx} cy={disposicion.cy} r={radioCentro} fill="var(--pizarra)" stroke="var(--superficie-grafica)" strokeWidth={3} />
                  <text x={disposicion.cx} y={disposicion.cy - 2} textAnchor="middle" fontSize={compacto ? 12 : 13.5} fontWeight={650} fill="var(--tiza)">
                    {recortar(centro.columna, 10)}
                  </text>
                  <text x={disposicion.cx} y={disposicion.cy + 13} textAnchor="middle" fontSize={10} fill="var(--tiza-2)">
                    objetivo
                  </text>
                </g>
              )}
            </svg>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-xs text-tinta-2" aria-live="polite">
            <p className="min-h-[1.25rem]">
              {activoConcepto ? (
                <>
                  <strong className="text-tinta">
                    {activoConcepto.id} {activoConcepto.nombre}
                  </strong>{' '}
                  ({NOMBRE_ROL[activoConcepto.rol].toLowerCase()}): peso {firmado(pesoActivo ?? 0)},{' '}
                  {(pesoActivo ?? 0) >= 0 ? 'empuja hacia el mejor nivel' : 'empuja hacia el peor nivel'}
                  {activoConcepto.rol === 'inmutable' && '. En inmutables el peso puede compensar la falta de sesgo del modelo.'}
                </>
              ) : (
                'Pase el cursor o use Tab sobre un concepto para leer su peso.'
              )}
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden>
                  <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="var(--tinta)" />
                </svg>
                Acción
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden>
                  <circle cx="6" cy="6" r="4.2" fill="none" stroke="var(--tinta-2)" strokeWidth="2" />
                </svg>
                Mutable
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden>
                  <circle cx="6" cy="6" r="4" fill="var(--tinta-3)" />
                </svg>
                Inmutable
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-4 rounded-full bg-positivo" aria-hidden />
                Peso positivo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-4 rounded-full bg-negativo" aria-hidden />
                Peso negativo
              </span>
            </div>
          </div>
        </>
      )}
    </figure>
  );
}
