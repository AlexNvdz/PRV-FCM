// Resultado de una prescripción individual (estudiante o perfil de riesgo): niveles antes y
// después, acciones recomendadas, reporte en lenguaje natural, evolución del AG generación por
// generación, aporte de cada concepto al objetivo y recomendación redactada con qwen2.5.
import type { ReactNode } from 'react';

import type { EstadoPrediccion, Prescripcion, ReporteIndividual } from '../tipos';
import { clase, colorNivel, firmado, num, pct } from '../utilidades';
import { EvolucionAG } from './evolucion';
import { GraficaMancuernas } from './graficas';
import { RedaccionIA } from './RedaccionIA';
import { NivelChip } from './ui';

/** Barra de 0 a 1 con las zonas de cada nivel y la activación del estudiante. */
export function Medidor({ prediccion, niveles, valores, etiqueta }: { prediccion: EstadoPrediccion; niveles: string[]; valores: Record<string, number>; etiqueta: string }) {
  const centros = niveles.map((n) => valores[n] ?? 0);
  const cortes = centros.slice(0, -1).map((c, i) => (c + centros[i + 1]) / 2);
  const limites = [0, ...cortes, 1];
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-tinta-2">{etiqueta}</span>
        <span className="tabular">
          {num(prediccion.activacion, 3)} <NivelChip nivel={prediccion.nivel} niveles={niveles} />
        </span>
      </div>
      <div className="relative mt-2 h-3 rounded-full" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={prediccion.activacion} aria-label={etiqueta}>
        <div className="absolute inset-0 flex overflow-hidden rounded-full">
          {niveles.map((n, i) => (
            <div key={n} style={{ width: `${100 * (limites[i + 1] - limites[i])}%`, background: colorNivel(i, niveles.length), opacity: 0.35 }} />
          ))}
        </div>
        <div className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-hoja bg-tinta" style={{ left: `${100 * prediccion.activacion}%` }} />
      </div>
    </div>
  );
}

export function ReporteTexto({ reporte, titulo = 'Reporte prescriptivo' }: { reporte: ReporteIndividual; titulo?: string }) {
  return (
    <section className="rounded-xl border border-linea bg-hoja p-4">
      <h3 className="font-semibold text-tinta">{titulo}</h3>
      <p className="mt-0.5 text-xs text-tinta-3">Frases generadas a partir de los cambios (deltas) que propone el AG; cada cifra sale del modelo.</p>
      {reporte.acciones.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-tinta">
          {reporte.acciones.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-tinta">{reporte.plan}</p>
      )}
      {reporte.mantener.length > 0 && reporte.acciones.length > 0 && (
        <p className="mt-2 text-sm text-tinta-2">Sin cambio: {reporte.mantener.map((m) => m.replace(/^Mantener /, '').replace(/\.$/, '')).join('; ')}.</p>
      )}
      <p className="mt-3 text-sm text-tinta">{reporte.resultado}</p>
      {reporte.frenos && <p className="mt-2 text-sm text-tinta-2">{reporte.frenos}</p>}
      <p className="mt-3 text-xs text-tinta-3">{reporte.nota}</p>
    </section>
  );
}

export function TablaPrescripcion({ prescripcion }: { prescripcion: Prescripcion }) {
  const valor = (v: { valor: number; categoria?: string }) => v.categoria ?? num(v.valor);
  return (
    <table className="tabular w-full text-sm">
      <thead className="text-left text-xs text-tinta-3">
        <tr>
          <th scope="col" className="pb-1 font-medium">Acción (C_P)</th>
          <th scope="col" className="pb-1 text-right font-medium">Actual</th>
          <th scope="col" className="pb-1 text-right font-medium">Recomendada</th>
          <th scope="col" className="pb-1 text-right font-medium">Cambio</th>
          <th scope="col" className="pb-1 text-right font-medium">Del rango</th>
        </tr>
      </thead>
      <tbody>
        {prescripcion.acciones.map((a) => {
          const igual = Math.abs(a.cambio) < 1e-6;
          const rango = a.max !== undefined && a.min !== undefined ? a.max - a.min : null;
          return (
            <tr key={a.columna} className="border-t border-linea">
              <th scope="row" className="py-1.5 text-left font-normal">{a.nombre}</th>
              <td className="py-1.5 text-right">{valor(a.actual)}</td>
              <td className="py-1.5 text-right font-medium">{valor(a.recomendada)}</td>
              <td className={clase('py-1.5 text-right', igual && 'text-tinta-3')}>{igual ? 'igual' : firmado(a.cambio, 1)}</td>
              <td className={clase('py-1.5 text-right', igual && 'text-tinta-3')}>{igual || !rango ? '—' : pct((100 * a.cambio) / rango, 0)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Gráfica de aportes k1·w·A al objetivo: las acciones cambian con el plan; el resto se mantiene. */
export function GraficaAportes({ prescripcion }: { prescripcion: Prescripcion }) {
  const contribuciones = prescripcion.contribuciones ?? [];
  if (!contribuciones.length) return null;
  const acciones = contribuciones.filter((c) => c.rol === 'accion');
  const otras = contribuciones.filter((c) => c.rol !== 'accion').slice(0, Math.max(3, 9 - acciones.length));
  const filas = [...acciones, ...otras]
    .sort((a, b) => b.aporte_prescrito - a.aporte_prescrito)
    .map((c) => ({ nombre: `${c.id} ${c.nombre}`, desde: c.aporte_base, hasta: c.aporte_prescrito }));
  const limite = Math.max(0.5, ...filas.flatMap((f) => [Math.abs(f.desde), Math.abs(f.hasta)]));
  const dominio: [number, number] = [-Math.ceil(limite * 4) / 4, Math.ceil(limite * 4) / 4];
  return (
    <GraficaMancuernas
      titulo="Qué empuja al objetivo"
      descripcion="Aporte de cada concepto a la entrada del objetivo (peso × activación). Positivo acerca al mejor nivel; solo las acciones cambian con el plan."
      filas={filas}
      dominio={dominio}
      referencia={0}
      formato={(v) => firmado(v)}
      formatoCambio={(v) => firmado(v)}
      etiquetas={['Acciones actuales', 'Con el plan']}
    />
  );
}

export function ResultadoPrescripcion({
  modeloId,
  prescripcion,
  niveles,
  valores,
  sujeto,
  acciones,
}: {
  modeloId: string;
  prescripcion: Prescripcion;
  niveles: string[];
  valores: Record<string, number>;
  sujeto: string;
  acciones?: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-xl border border-linea bg-hoja p-4">
        <Medidor prediccion={prescripcion.base} niveles={niveles} valores={valores} etiqueta="FCM con las acciones actuales" />
        <Medidor prediccion={prescripcion.prescrito} niveles={niveles} valores={valores} etiqueta="FCM con las acciones prescritas" />
        {prescripcion.meta && (
          <p className="text-xs text-tinta-2">
            Meta del AG: nivel <NivelChip nivel={prescripcion.meta.nivel} niveles={niveles} /> (activación {num(prescripcion.meta.valor, 2)} ± {num(prescripcion.meta.tolerancia, 2)}).{' '}
            {prescripcion.prescrito.exito ? 'La prescripción la alcanza.' : 'La prescripción no la alcanza con estas restricciones.'} {prescripcion.generaciones} generaciones, β = {num(prescripcion.configuracion.beta, 2)}.
          </p>
        )}
        <TablaPrescripcion prescripcion={prescripcion} />
        {acciones}
      </section>
      {prescripcion.reporte && <ReporteTexto reporte={prescripcion.reporte} />}
      <EvolucionAG key={`${prescripcion.costo}-${prescripcion.generaciones}`} prescripcion={prescripcion} niveles={niveles} valores={valores} />
      <GraficaAportes prescripcion={prescripcion} />
      <RedaccionIA key={JSON.stringify(prescripcion.acciones.map((a) => a.recomendada.valor))} modeloId={modeloId} pedido={{ tipo: 'individual', sujeto, prescripcion }} />
    </div>
  );
}
