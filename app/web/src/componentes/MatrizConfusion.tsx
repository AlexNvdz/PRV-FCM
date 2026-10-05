// Matriz de confusión como tabla: el tono de cada celda es la proporción de la fila.
import { useState } from 'react';

import { clase, pct } from '../utilidades';

export function MatrizConfusion({ matriz, niveles }: { matriz: Record<string, Record<string, number>>; niveles: string[] }) {
  const [celda, setCelda] = useState<string | null>(null);
  const totales = Object.fromEntries(niveles.map((r) => [r, niveles.reduce((s, p) => s + (matriz[r]?.[p] ?? 0), 0)]));
  return (
    <figure className="rounded-xl border border-linea bg-superficie-grafica p-5">
      <figcaption className="mb-4">
        <span className="block text-[0.98rem] font-semibold text-tinta">Matriz de confusión en prueba</span>
        <span className="mt-0.5 block text-sm text-tinta-2">Filas: nivel real. Columnas: nivel que predice el FCM. El tono indica el porcentaje de la fila.</span>
      </figcaption>
      <table className="tabular w-full max-w-md border-separate border-spacing-[3px] text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-20 text-left text-xs font-medium text-tinta-3">
              Real \ FCM
            </th>
            {niveles.map((p) => (
              <th key={p} scope="col" className="pb-1 text-center text-xs font-medium text-tinta-2">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {niveles.map((real) => (
            <tr key={real}>
              <th scope="row" className="pr-2 text-left text-xs font-medium text-tinta-2">
                {real}
              </th>
              {niveles.map((predicho) => {
                const n = matriz[real]?.[predicho] ?? 0;
                const proporcion = totales[real] ? n / totales[real] : 0;
                const clave = `${real}-${predicho}`;
                const oscura = proporcion > 0.55;
                return (
                  <td
                    key={predicho}
                    tabIndex={0}
                    onMouseEnter={() => setCelda(clave)}
                    onMouseLeave={() => setCelda(null)}
                    onFocus={() => setCelda(clave)}
                    onBlur={() => setCelda(null)}
                    title={`${n} de ${totales[real]} (${pct(100 * proporcion)})`}
                    className={clase('h-14 rounded-md text-center align-middle', oscura ? 'text-white' : 'text-tinta', real === predicho && 'font-semibold')}
                    style={{ background: `color-mix(in oklab, var(--serie-1) ${Math.round(8 + 82 * proporcion)}%, var(--superficie-grafica))` }}
                  >
                    <span className="block text-base">{n}</span>
                    <span className={clase('block text-[11px]', oscura ? 'text-white/85' : 'text-tinta-2', celda !== clave && 'sr-only')}>
                      {pct(100 * proporcion)}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
