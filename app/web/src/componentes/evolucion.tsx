// Evolución del algoritmo genético de una prescripción, generación por generación.
//
// El AG de un estudiante tarda unos 20 ms en el motor, así que un flujo en vivo solo
// mostraría el final. El motor devuelve el historial completo (mejor costo, costo medio,
// activación del objetivo y mejores acciones de cada generación) y este panel lo
// reproduce: se ve cómo baja el costo y cómo se mueven las acciones hasta la prescripción.
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { Prescripcion } from '../tipos';
import { etiquetaAccion, nivelCercano, num, pct } from '../utilidades';
import { EJE, Globo, GraficaConvergenciaIndividual, ItemLeyenda, MarcoGrafica, REJILLA, TICK } from './graficas';
import { Barra, Boton, NivelChip } from './ui';

function prefiereSinMovimiento() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Acciones actuales frente a las mejores de la generación elegida, como fracción del rango de cada acción. */
function BarrasAcciones({ prescripcion, propuestas, titulo, etiqueta }: { prescripcion: Prescripcion; propuestas: number[]; titulo: string; etiqueta: string }) {
  const filas = prescripcion.acciones.map((a, k) => {
    const min = a.min ?? 0;
    const max = a.max ?? 1;
    const fraccion = (v: number) => Math.min(1, Math.max(0, (v - min) / (max - min || 1)));
    return { nombre: a.nombre, accion: a, actual: a.actual.valor, propuesta: propuestas[k] ?? a.recomendada.valor, fraccion };
  });
  return (
    <MarcoGrafica
      titulo={titulo}
      descripcion="Largo de cada barra: el valor de la acción como fracción de su rango en los datos. A la derecha, el valor en sus unidades."
      leyenda={
        <>
          <ItemLeyenda color="var(--serie-1)" texto="Acciones actuales" />
          <ItemLeyenda color="var(--serie-2)" texto={etiqueta} />
        </>
      }
      tabla={{
        columnas: ['Acción', 'Actual', etiqueta, 'Cambio', 'Del rango'],
        filas: filas.map((f) => [
          f.nombre,
          etiquetaAccion(f.accion, f.actual),
          etiquetaAccion(f.accion, f.propuesta),
          num(f.propuesta - f.actual, 2),
          `${pct(100 * f.fraccion(f.actual), 0)} → ${pct(100 * f.fraccion(f.propuesta), 0)}`,
        ]),
      }}
    >
      <ul className="space-y-3" aria-label={titulo}>
        {filas.map((f) => (
          <li key={f.nombre} className="text-sm">
            <span className="block truncate text-tinta-2">{f.nombre}</span>
            {[
              { valor: f.actual, color: 'var(--serie-1)', texto: 'Actual' },
              { valor: f.propuesta, color: 'var(--serie-2)', texto: etiqueta },
            ].map((b) => (
              <span
                key={b.texto}
                className="mt-0.5 grid grid-cols-[1fr_4.5rem] items-center gap-2"
                title={`${b.texto}: ${etiquetaAccion(f.accion, b.valor)} (${pct(100 * f.fraccion(b.valor), 0)} del rango)`}
              >
                <span className="h-2.5 border-l border-[var(--eje)]">
                  <span className="block h-full rounded-r-[4px]" style={{ width: `${Math.max(0.5, 100 * f.fraccion(b.valor))}%`, background: b.color }} />
                </span>
                <span className="tabular text-right text-xs text-tinta">{etiquetaAccion(f.accion, b.valor)}</span>
              </span>
            ))}
          </li>
        ))}
      </ul>
    </MarcoGrafica>
  );
}

export function EvolucionAG({ prescripcion, niveles, valores }: { prescripcion: Prescripcion; niveles: string[]; valores: Record<string, number> }) {
  const historial = prescripcion.historial;
  const total = historial?.mejor.length ?? 0;
  const [generacion, setGeneracion] = useState(() => (prefiereSinMovimiento() ? total : 1));
  const [reproducir, setReproducir] = useState(() => !prefiereSinMovimiento());
  // La reproducción se detiene sola en la última generación.
  const reproduciendo = reproducir && generacion < total;

  // Unos dos segundos y medio de reproducción, sin bajar de 30 ms por generación.
  const intervalo = Math.min(120, Math.max(30, 2500 / Math.max(total, 1)));
  useEffect(() => {
    if (!reproduciendo) return;
    const temporizador = window.setTimeout(() => setGeneracion((g) => g + 1), intervalo);
    return () => window.clearTimeout(temporizador);
  }, [reproduciendo, generacion, intervalo]);

  if (!historial || !total) return null;
  // Prescripciones guardadas antes de que el motor enviara el historial de acciones: solo la curva.
  if (!historial.acciones?.length || !historial.activacion?.length) return <GraficaConvergenciaIndividual historial={historial} />;

  const g = Math.min(Math.max(generacion, 1), total);
  const final = g === total;
  const filas = historial.mejor.map((mejor, i) => ({
    generacion: i + 1,
    mejor: i < g ? mejor : null,
    promedio: i < g ? (historial.promedio[i] ?? null) : null,
  }));
  const todos = [...historial.mejor, ...historial.promedio];
  const minimo = Math.min(...todos);
  const maximo = Math.max(...todos);
  const margen = (maximo - minimo) * 0.08 || 0.01;
  const activacion = historial.activacion[g - 1];
  const { generaciones_max: maximoGeneraciones, paciencia, poblacion } = prescripcion.configuracion;
  const temprano = maximoGeneraciones !== undefined && total < maximoGeneraciones;

  return (
    <section className="space-y-4 rounded-xl border border-linea bg-hoja p-4">
      <div>
        <h3 className="font-semibold text-tinta">Evolución del algoritmo genético</h3>
        <p className="mt-0.5 text-sm text-tinta-2">
          El AG terminó en milisegundos; aquí se reproduce su historial real. En cada generación{poblacion ? ` ${poblacion} individuos` : ' la población'} compiten por el menor
          costo: distancia del objetivo a la meta más β por el esfuerzo de cambiar las acciones.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Boton
          variante="fantasma"
          icono={reproduciendo ? <Pause className="size-4" aria-hidden /> : final ? <RotateCcw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
          onClick={() => {
            if (reproduciendo) {
              setReproducir(false);
              return;
            }
            if (final) setGeneracion(1);
            setReproducir(true);
          }}
        >
          {reproduciendo ? 'Pausar' : final ? 'Reproducir de nuevo' : 'Reproducir'}
        </Boton>
        <Boton
          variante="fantasma"
          icono={<SkipForward className="size-4" aria-hidden />}
          disabled={final}
          onClick={() => {
            setReproducir(false);
            setGeneracion(total);
          }}
        >
          Ir al final
        </Boton>
      </div>
      <input
        type="range"
        min={1}
        max={total}
        step={1}
        value={g}
        onChange={(e) => {
          setReproducir(false);
          setGeneracion(Number(e.target.value));
        }}
        className="w-full accent-[var(--pizarra)]"
        aria-label="Generación que se muestra"
      />
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="tabular text-tinta">
            Generación {g} de {total}
          </span>
          {temprano && (
            <span className="text-xs text-tinta-3">
              Se detuvo antes del máximo de {maximoGeneraciones}: {paciencia ?? 'varias'} generaciones seguidas sin mejorar.
            </span>
          )}
        </div>
        <Barra valor={(100 * g) / total} className="mt-1.5" />
      </div>

      <dl className="tabular grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-xs text-tinta-2">Mejor costo</dt>
          <dd className="mt-0.5 font-semibold text-tinta">{num(historial.mejor[g - 1], 4)}</dd>
        </div>
        <div>
          <dt className="text-xs text-tinta-2">Costo medio</dt>
          <dd className="mt-0.5 font-semibold text-tinta">{num(historial.promedio[g - 1], 4)}</dd>
        </div>
        <div>
          <dt className="text-xs text-tinta-2">Objetivo con el mejor</dt>
          <dd className="mt-0.5 font-semibold text-tinta">
            {num(activacion, 3)} <NivelChip nivel={nivelCercano(activacion, valores)} niveles={niveles} />
          </dd>
        </div>
      </dl>

      <MarcoGrafica
        titulo="Costo por generación"
        descripcion="El mejor costo nunca sube: el elitismo conserva a los mejores individuos. El costo medio muestra cuánto se parece la población a su mejor individuo."
        leyenda={
          <>
            <ItemLeyenda color="var(--serie-1)" texto="Mejor costo" forma="linea" />
            <ItemLeyenda color="var(--serie-2)" texto="Costo medio de la población" forma="linea" />
          </>
        }
        tabla={{
          columnas: ['Generación', 'Mejor costo', 'Costo medio', 'Objetivo con el mejor'],
          filas: historial.mejor.map((mejor, i) => [i + 1, num(mejor, 4), num(historial.promedio[i], 4), num(historial.activacion![i], 3)]),
        }}
      >
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={filas} margin={{ top: 10, right: 16, left: -4, bottom: 0 }}>
            {REJILLA}
            <XAxis dataKey="generacion" type="number" domain={[1, total]} allowDecimals={false} tick={TICK} axisLine={EJE} tickLine={false} />
            <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => num(v, 2)} domain={[Math.max(0, minimo - margen), maximo + margen]} />
            <Line dataKey="promedio" stroke="var(--serie-2)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="mejor" stroke="var(--serie-1)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Tooltip
              cursor={{ stroke: 'var(--eje)' }}
              content={({ active, payload, label }) =>
                active && payload?.length && payload[0].payload.mejor !== null ? (
                  <Globo>
                    <strong>Generación {label}</strong>
                    <div>Mejor costo: {num(payload[0].payload.mejor, 4)}</div>
                    {payload[0].payload.promedio !== null && <div>Costo medio: {num(payload[0].payload.promedio, 4)}</div>}
                  </Globo>
                ) : null
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
      </MarcoGrafica>

      <BarrasAcciones
        prescripcion={prescripcion}
        propuestas={historial.acciones[g - 1]}
        titulo={final ? 'Acciones actuales y prescritas por el modelo' : `Acciones actuales y mejores de la generación ${g}`}
        etiqueta={final ? 'Acciones prescritas' : `Generación ${g}`}
      />
    </section>
  );
}
