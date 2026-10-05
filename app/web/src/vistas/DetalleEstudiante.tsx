// Panel lateral de un estudiante: predicción, simulador de acciones y prescripción individual.
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessagesSquare, RotateCcw, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { api } from '../api';
import { TrayectoriaInferencia } from '../componentes/inferencia';
import { Medidor, ResultadoPrescripcion } from '../componentes/prescripcion';
import { Aviso, Boton, Cargando, estiloControl, NivelChip } from '../componentes/ui';
import type { Graficas } from '../tipos';
import { etiquetaAccion, num, pasoAccion } from '../utilidades';

export { Medidor };

export function DetalleEstudiante({ modeloId, id, graficas, alCerrar }: { modeloId: string; id: number; graficas: Graficas; alCerrar: () => void }) {
  const navegar = useNavigate();
  const niveles = useMemo(() => Object.entries(graficas.niveles).sort((a, b) => a[1] - b[1]).map(([n]) => n), [graficas.niveles]);
  const estudiante = useQuery({ queryKey: ['estudiante', modeloId, id], queryFn: () => api.estudiante(modeloId, id) });
  const [valores, setValores] = useState<Record<string, number>>({});
  const [beta, setBeta] = useState(0.4);
  const [delta, setDelta] = useState<number | null>(null);
  const [meta, setMeta] = useState(niveles.at(-1) ?? '');
  const cerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => cerrar.current?.focus(), []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  const acciones = estudiante.data?.acciones ?? [];
  const actuales = useMemo(() => Object.fromEntries(acciones.map((a) => [a.columna, a.actual.valor])), [acciones]);
  useEffect(() => setValores(actuales), [actuales]);
  const cambiado = acciones.some((a) => Math.abs((valores[a.columna] ?? a.actual.valor) - a.actual.valor) > 1e-9);

  const simulacion = useQuery({
    queryKey: ['simulacion', modeloId, id, valores],
    queryFn: () => api.simular(modeloId, id, valores),
    enabled: cambiado,
    placeholderData: (previo) => previo,
  });

  const prescribir = useMutation({ mutationFn: () => api.prescribir(modeloId, { id, beta, deltaMax: delta, nivelMeta: meta || null }) });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="titulo-estudiante">
      <button type="button" className="absolute inset-0 bg-black/30" aria-label="Cerrar" onClick={alCerrar} />
      <div className="relative h-full w-full max-w-[520px] overflow-y-auto border-l border-linea bg-papel px-6 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-estudiante" className="font-serif text-2xl font-semibold">
              Estudiante {id}
            </h2>
            {estudiante.data && (
              <p className="mt-1 text-sm text-tinta-2">
                Nivel observado: <NivelChip nivel={estudiante.data.nivel_observado} niveles={niveles} />
                {estudiante.data.en_prueba ? ' En el conjunto de prueba.' : ' En el conjunto de entrenamiento.'}
              </p>
            )}
          </div>
          <button ref={cerrar} type="button" onClick={alCerrar} className="rounded-md p-1.5 text-tinta-2 hover:bg-hoja-2 hover:text-tinta" aria-label="Cerrar panel">
            <X className="size-5" />
          </button>
        </div>

        {estudiante.isLoading && <Cargando />}
        {estudiante.isError && <Aviso tipo="error">{estudiante.error.message}</Aviso>}
        {estudiante.data?.prediccion && (
          <>
            <section className="mt-6 space-y-4 rounded-xl border border-linea bg-hoja p-4">
              <Medidor prediccion={estudiante.data.prediccion} niveles={niveles} valores={graficas.niveles} etiqueta="FCM con las acciones actuales" />
              {cambiado && simulacion.data && <Medidor prediccion={simulacion.data.simulado} niveles={niveles} valores={graficas.niveles} etiqueta="FCM con las acciones del simulador" />}
            </section>

            <section className="mt-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Simulador de acciones</h3>
                <Boton variante="fantasma" icono={<RotateCcw className="size-4" aria-hidden />} disabled={!cambiado} onClick={() => setValores(actuales)}>
                  Restablecer
                </Boton>
              </div>
              <p className="mt-1 text-sm text-tinta-2">Mueva cada acción: el FCM recalcula el nivel al instante y la gráfica muestra cada iteración de la inferencia.</p>
              <div className="mt-4 space-y-4">
                {acciones.map((a) => {
                  const valor = valores[a.columna] ?? a.actual.valor;
                  const minimo = a.categorias ? 0 : a.min;
                  const maximo = a.categorias ? a.categorias.length - 1 : a.max;
                  return (
                    <div key={a.columna}>
                      <div className="flex items-baseline justify-between text-sm">
                        <label htmlFor={`accion-${a.columna}`} className="font-medium text-tinta">
                          {a.nombre}
                        </label>
                        <span className="tabular text-tinta-2">
                          {etiquetaAccion(a, valor)}
                          {Math.abs(valor - a.actual.valor) > 1e-9 && <span className="text-tinta-3"> (antes {etiquetaAccion(a, a.actual.valor)})</span>}
                        </span>
                      </div>
                      <input
                        id={`accion-${a.columna}`}
                        type="range"
                        min={minimo}
                        max={maximo}
                        step={pasoAccion(a)}
                        value={valor}
                        onChange={(e) => setValores((v) => ({ ...v, [a.columna]: Number(e.target.value) }))}
                        className="mt-1.5 w-full accent-[var(--serie-2)]"
                      />
                    </div>
                  );
                })}
              </div>
              {simulacion.isError && <Aviso tipo="error" className="mt-3">{simulacion.error.message}</Aviso>}
              {estudiante.data.prediccion.inferencia && (
                <TrayectoriaInferencia
                  className="mt-5"
                  base={estudiante.data.prediccion.inferencia}
                  simulado={cambiado ? simulacion.data?.simulado.inferencia : undefined}
                  niveles={niveles}
                  valores={graficas.niveles}
                />
              )}
            </section>

            <section className="mt-8 rounded-xl border border-linea bg-hoja p-4">
              <h3 className="font-semibold">Prescripción con el algoritmo genético</h3>
              <p className="mt-1 text-sm text-tinta-2">Busca el menor cambio en las acciones que acerque al estudiante a la meta.</p>
              <label className="mt-4 flex max-w-xs flex-col gap-1 text-sm">
                <span className="text-tinta">Meta (estado deseado del objetivo)</span>
                <select className={estiloControl} value={meta} onChange={(e) => setMeta(e.target.value)}>
                  {[...niveles].reverse().map((n) => (
                    <option key={n} value={n}>
                      {n}
                      {n === niveles.at(-1) ? ' (mejor nivel)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <label className="flex flex-col gap-1">
                  <span className="text-tinta">Penalización del esfuerzo: {num(beta, 2)}</span>
                  <input type="range" min={0} max={1} step={0.05} value={beta} onChange={(e) => setBeta(Number(e.target.value))} className="accent-[var(--pizarra)]" />
                  <span className="text-xs text-tinta-3">Mayor, cambios más pequeños.</span>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-tinta">Cambio máximo: {delta === null ? 'sin límite' : `${Math.round(delta * 100)} % del rango`}</span>
                  <input type="range" min={0} max={1} step={0.05} value={delta ?? 1} onChange={(e) => setDelta(Number(e.target.value) >= 1 ? null : Number(e.target.value))} className="accent-[var(--pizarra)]" />
                  <span className="text-xs text-tinta-3">Por acción, respecto a su rango.</span>
                </label>
              </div>
              <Boton variante="principal" className="mt-4" icono={<Sparkles className="size-4" aria-hidden />} cargando={prescribir.isPending} onClick={() => prescribir.mutate()}>
                Prescribir
              </Boton>
              {prescribir.isError && <Aviso tipo="error" className="mt-3">{prescribir.error.message}</Aviso>}
            </section>
            {prescribir.data && (
              <div className="mt-4">
                <ResultadoPrescripcion
                  modeloId={modeloId}
                  prescripcion={prescribir.data}
                  niveles={niveles}
                  valores={graficas.niveles}
                  sujeto={`el estudiante ${id}`}
                  acciones={
                    <Boton onClick={() => setValores(Object.fromEntries(prescribir.data!.acciones.map((a) => [a.columna, a.recomendada.valor])))}>
                      Probar en el simulador
                    </Boton>
                  }
                />
              </div>
            )}

            <Boton
              className="mt-6"
              icono={<MessagesSquare className="size-4" aria-hidden />}
              onClick={() => navegar(`/asistente?pregunta=${encodeURIComponent(`Analiza al estudiante ${id} y dame recomendaciones concretas.`)}`)}
            >
              Preguntar al asistente por este estudiante
            </Boton>

            <details className="mt-6 text-sm">
              <summary className="cursor-pointer font-medium">Todos sus datos</summary>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(estudiante.data.registro).map(([clave, valor]) => (
                  <div key={clave} className="flex justify-between gap-2 border-b border-linea py-1">
                    <dt className="text-tinta-2">{clave}</dt>
                    <dd className="tabular text-right text-tinta">{String(valor ?? '—')}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
