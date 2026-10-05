// Inferencia del FCM paso a paso: cómo la regla de Kosko lleva al objetivo desde su valor
// inicial (t = 0) hasta el punto fijo, con las acciones actuales y con las del simulador.
//
// Regla: A_o(t) = f( k2·A_o(t−1) + k1·Σ_j w_jo·A_j(t−1) ), f(x) = 1 / (1 + e^(−λ·x)).
// Las acciones quedan fijas durante la inferencia, así que su aporte k1·Σ w·a a la
// entrada del objetivo es el mismo en cada iteración: cambiar una acción desplaza esa
// entrada y la iteración propaga el desplazamiento hasta un nuevo punto fijo.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { Inferencia } from '../tipos';
import { colorNivel, firmado, num } from '../utilidades';
import { EJE, Globo, ItemLeyenda, MarcoGrafica, REJILLA, TICK } from './graficas';

/** Zonas de cada nivel en [0, 1]: los cortes están a medio camino entre los valores de niveles vecinos (como el Medidor). */
function zonasDeNivel(niveles: string[], valores: Record<string, number>) {
  const centros = niveles.map((n) => valores[n] ?? 0);
  const cortes = centros.slice(0, -1).map((c, i) => (c + centros[i + 1]) / 2);
  const limites = [0, ...cortes, 1];
  return niveles.map((nivel, i) => ({ nivel, desde: limites[i], hasta: limites[i + 1], color: colorNivel(i, niveles.length) }));
}

/** La cuenta de una iteración con sus números: memoria, influencia de las acciones y del resto, y la sigmoide. */
function CuentaIteracion({ inferencia, t, objetivo }: { inferencia: Inferencia; t: number; objetivo: string }) {
  const valores = inferencia.series[0]?.valores ?? [];
  const { lambda, k1, k2 } = inferencia.parametros;
  if (t === 0) {
    return (
      <p className="text-sm text-tinta-2">
        t = 0 es el estado inicial: {objetivo} parte de su valor en los datos ({num(valores[0], 3)}) y las demás variables, de las suyas. Avance para ver la primera
        actualización.
      </p>
    );
  }
  const paso = inferencia.pasos[t - 1];
  if (!paso) return null;
  const resto = paso.influencia - paso.influencia_acciones;
  const cambio = paso.activacion - valores[t - 1];
  const tolerancia = inferencia.parametros.tolerancia;
  return (
    <div className="space-y-2 text-sm">
      <p className="overflow-x-auto whitespace-nowrap rounded-lg border border-linea bg-hoja-2/60 px-3 py-2 font-mono text-[0.8rem] text-tinta">
        A({t}) = f( {num(k2, 2)}·{num(valores[t - 1], 3)} {paso.influencia >= 0 ? '+' : '−'} {num(Math.abs(paso.influencia), 3)} ) = f({num(paso.entrada, 3)}) ={' '}
        {num(paso.activacion, 3)}
      </p>
      <dl className="tabular grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
        <dt className="text-tinta-2">Memoria k2·A({t - 1})</dt>
        <dd className="text-right text-tinta">{num(paso.memoria, 3)}</dd>
        <dt className="text-tinta-2">Influencia de las acciones k1·Σ w·a</dt>
        <dd className="text-right text-tinta">{firmado(paso.influencia_acciones, 3)}</dd>
        <dt className="text-tinta-2">Influencia del resto de conceptos</dt>
        <dd className="text-right text-tinta">{firmado(resto, 3)}</dd>
        <dt className="text-tinta-2">Entrada x y activación f(x)</dt>
        <dd className="text-right text-tinta">
          {num(paso.entrada, 3)} y {num(paso.activacion, 3)}
        </dd>
      </dl>
      <p className="text-xs text-tinta-3">
        f(x) = 1 / (1 + e^(−λ·x)) con λ = {num(lambda, 2)}; k1 = {num(k1, 2)} y k2 = {num(k2, 2)}. Cambio respecto a la iteración anterior:{' '}
        {Math.abs(cambio) < tolerancia ? `menor que ${num(tolerancia, 6)}` : firmado(cambio, 4)}
        {t === inferencia.iteraciones && (inferencia.convergio ? '; la inferencia se detiene: llegó al punto fijo' : '; se alcanzó el máximo de iteraciones')}.
      </p>
    </div>
  );
}

export function TrayectoriaInferencia({
  base,
  simulado,
  niveles,
  valores,
  etiquetas = ['Acciones actuales', 'Acciones del simulador'],
  className,
}: {
  base: Inferencia;
  simulado?: Inferencia;
  niveles: string[];
  valores: Record<string, number>;
  etiquetas?: [string, string];
  className?: string;
}) {
  // La cuenta paso a paso sigue al escenario del simulador si existe; si no, al actual.
  const enFoco = simulado ?? base;
  const [elegido, setElegido] = useState<number | null>(null);
  const t = Math.min(elegido ?? enFoco.iteraciones, enFoco.iteraciones);
  const objetivo = base.series[0];
  if (!objetivo) return null;

  const largo = Math.max(base.iteraciones, simulado?.iteraciones ?? 0);
  const filas = Array.from({ length: largo + 1 }, (_, i) => ({
    t: i,
    base: base.series[0].valores[i] ?? null,
    simulado: simulado?.series[0].valores[i] ?? null,
  }));
  const otras = [...base.series.slice(1).map((s) => ({ ...s, escenario: etiquetas[0] })), ...(simulado?.series.slice(1).map((s) => ({ ...s, escenario: etiquetas[1] })) ?? [])];
  const zonas = zonasDeNivel(niveles, valores);
  const accionesBase = base.pasos[0]?.influencia_acciones;
  const accionesSimulado = simulado?.pasos[0]?.influencia_acciones;
  const tolerancia = base.parametros.tolerancia;

  return (
    <MarcoGrafica
      className={className}
      titulo={`Inferencia paso a paso: ${objetivo.nombre}`}
      descripcion={
        <>
          La regla de Kosko se repite hasta que el objetivo cambia menos de {num(tolerancia, 6)}: {base.iteraciones} iteraciones con las acciones actuales
          {simulado ? ` y ${simulado.iteraciones} con las del simulador` : ''}. Las acciones quedan fijas y aportan {firmado(accionesBase ?? 0)} a la entrada del objetivo en
          cada iteración{accionesSimulado !== undefined ? ` (${firmado(accionesSimulado)} con el simulador)` : ''}.
        </>
      }
      leyenda={
        <>
          <ItemLeyenda color="var(--serie-1)" texto={etiquetas[0]} forma="linea" />
          {simulado && <ItemLeyenda color="var(--serie-2)" texto={etiquetas[1]} forma="linea" />}
          <span>Bandas: zona de cada nivel</span>
        </>
      }
      tabla={{
        columnas: ['Iteración t', `${etiquetas[0]}`, ...(simulado ? [etiquetas[1]] : []), ...otras.map((s) => `${s.nombre} (${s.escenario.toLowerCase()})`)],
        filas: filas.map((f) => [
          f.t,
          num(f.base, 4),
          ...(simulado ? [num(f.simulado, 4)] : []),
          ...otras.map((s) => num(s.valores[f.t], 4)),
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={filas}
          margin={{ top: 8, right: 30, left: -8, bottom: 0 }}
          onClick={(estado) => {
            const etiqueta = Number(estado?.activeLabel);
            if (Number.isFinite(etiqueta)) setElegido(etiqueta);
          }}
        >
          {zonas.map((z) => (
            <ReferenceArea
              key={z.nivel}
              y1={z.desde}
              y2={z.hasta}
              fill={z.color}
              fillOpacity={0.12}
              stroke="none"
              ifOverflow="hidden"
              label={{ value: z.nivel, position: 'right', fill: 'var(--tinta-3)', fontSize: 11 }}
            />
          ))}
          {REJILLA}
          <XAxis dataKey="t" type="number" domain={[0, largo]} allowDecimals={false} tick={TICK} axisLine={EJE} tickLine={false} />
          <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v) => num(v, 2)} />
          <ReferenceLine x={t} stroke="var(--tinta-3)" />
          <Line
            dataKey="base"
            stroke="var(--serie-1)"
            strokeWidth={2}
            dot={{ r: 4, fill: 'var(--serie-1)', stroke: 'var(--superficie-grafica)', strokeWidth: 2 }}
            activeDot={{ r: 5, stroke: 'var(--superficie-grafica)', strokeWidth: 2 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {simulado && (
            <Line
              dataKey="simulado"
              stroke="var(--serie-2)"
              strokeWidth={2}
              dot={{ r: 4, fill: 'var(--serie-2)', stroke: 'var(--superficie-grafica)', strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: 'var(--superficie-grafica)', strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          <Tooltip
            cursor={{ stroke: 'var(--eje)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Globo>
                  <strong>Iteración {label}</strong>
                  {payload[0].payload.base !== null && (
                    <div>
                      {etiquetas[0]}: {num(payload[0].payload.base, 3)}
                    </div>
                  )}
                  {simulado && payload[0].payload.simulado !== null && (
                    <div>
                      {etiquetas[1]}: {num(payload[0].payload.simulado, 3)}
                    </div>
                  )}
                  <div className="text-tinta-3">Clic para ver la cuenta</div>
                </Globo>
              ) : null
            }
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="mt-4 border-t border-linea pt-3">
        <div className="mb-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md p-1 text-tinta-2 hover:bg-hoja-2 hover:text-tinta disabled:opacity-30"
            disabled={t === 0}
            onClick={() => setElegido(t - 1)}
            aria-label="Iteración anterior"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <input
            type="range"
            min={0}
            max={enFoco.iteraciones}
            step={1}
            value={t}
            onChange={(e) => setElegido(Number(e.target.value))}
            className="min-w-0 flex-1 accent-[var(--pizarra)]"
            aria-label="Iteración que se explica"
          />
          <button
            type="button"
            className="rounded-md p-1 text-tinta-2 hover:bg-hoja-2 hover:text-tinta disabled:opacity-30"
            disabled={t === enFoco.iteraciones}
            onClick={() => setElegido(t + 1)}
            aria-label="Iteración siguiente"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <span className="tabular w-36 shrink-0 text-right text-xs text-tinta-2">
            Iteración {t} de {enFoco.iteraciones}
          </span>
        </div>
        <p className="mb-2 text-xs text-tinta-3">Cuenta con {simulado ? etiquetas[1].toLowerCase() : etiquetas[0].toLowerCase()}:</p>
        <CuentaIteracion inferencia={enFoco} t={t} objetivo={objetivo.nombre} />
      </div>
    </MarcoGrafica>
  );
}
