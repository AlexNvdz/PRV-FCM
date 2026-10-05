// Paso 4: perfil de riesgo. El usuario escribe (o carga) el estado de un individuo y el
// algoritmo genético calcula qué valores deben tomar las acciones para llegar a la meta.
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { api } from '../api';
import { ResultadoPrescripcion } from '../componentes/prescripcion';
import { Aviso, Boton, Cargando, Clase, estiloControl } from '../componentes/ui';
import type { ColumnaEsquema, Dataset, ModeloDetalle } from '../tipos';
import { num } from '../utilidades';

type Valores = Record<string, string | number>;

function opcionesDe(columna: ColumnaEsquema, dataset: Dataset | undefined): string[] | null {
  if (columna.codificacion === 'ordinal') return columna.orden ?? null;
  if (columna.codificacion === 'one_hot') return columna.categorias ?? null;
  if (columna.codificacion === 'nominal' || columna.codificacion === 'numero_en_texto') {
    const perfil = dataset?.perfil?.perfil.find((p) => p.columna === columna.columna);
    return perfil?.categorias?.map((c) => c.valor).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })) ?? null;
  }
  return null;
}

function Campo({ columna, valor, dataset, alCambiar }: { columna: ColumnaEsquema; valor: string | number | undefined; dataset?: Dataset; alCambiar: (v: string) => void }) {
  const opciones = opcionesDe(columna, dataset);
  const perfil = dataset?.perfil?.perfil.find((p) => p.columna === columna.columna);
  const id = `perfil-${columna.columna}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="truncate text-sm text-tinta" title={columna.columna}>
        {columna.nombre || columna.columna}
      </label>
      {opciones ? (
        <select id={id} className={estiloControl} value={valor === undefined ? '' : String(valor)} onChange={(e) => alCambiar(e.target.value)}>
          {!opciones.includes(String(valor ?? '')) && <option value={String(valor ?? '')}>{String(valor ?? '') || 'Elija un valor'}</option>}
          {opciones.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="number"
          step="any"
          className={estiloControl}
          value={valor === undefined ? '' : String(valor)}
          onChange={(e) => alCambiar(e.target.value)}
          placeholder={perfil?.min !== undefined ? `${num(perfil.min)} a ${num(perfil.max)}` : undefined}
        />
      )}
    </div>
  );
}

export function PerfilRiesgo({ modelo, dataset }: { modelo: ModeloDetalle; dataset?: Dataset }) {
  const g = modelo.graficas!;
  const niveles = useMemo(() => Object.entries(g.niveles).sort((a, b) => a[1] - b[1]).map(([n]) => n), [g.niveles]);
  const columnas = (modelo.esquema?.columnas ?? []).filter((c) => c.rol !== 'excluir' && c.rol !== 'objetivo');
  const [valores, setValores] = useState<Valores>({});
  const [origen, setOrigen] = useState('');
  const [estudiante, setEstudiante] = useState('');
  const [meta, setMeta] = useState(niveles.at(-1) ?? '');
  const [beta, setBeta] = useState(0.4);
  const [delta, setDelta] = useState<number | null>(null);
  const [reducir, setReducir] = useState(false);

  const tipico = useQuery({ queryKey: ['perfil-base', modelo.id, null], queryFn: () => api.perfilBase(modelo.id, null), staleTime: Infinity });
  useEffect(() => {
    if (tipico.data && !origen) {
      setValores(tipico.data.valores);
      setOrigen(tipico.data.origen);
    }
  }, [tipico.data, origen]);

  const cargar = useMutation({
    mutationFn: (numero: number | null) => api.perfilBase(modelo.id, numero),
    onSuccess: (base) => {
      setValores(base.valores);
      setOrigen(base.origen);
    },
  });
  const prescribir = useMutation({
    mutationFn: () => api.prescribirPerfil(modelo.id, { perfil: valores, beta, deltaMax: delta, permitirReducciones: reducir, nivelMeta: meta || null }),
  });

  if (!modelo.esquema) return <Aviso tipo="aviso">Este modelo no guardó su esquema; vuelva a entrenarlo para usar el perfil de riesgo.</Aviso>;
  if (tipico.isLoading) return <Cargando texto="Preparando el perfil típico…" />;
  const grupos = [
    { titulo: <>Sistema inmutable <Clase letra="S" /></>, columnas: columnas.filter((c) => c.rol === 'inmutable') },
    { titulo: <>Sistema mutable <Clase letra="S" /></>, columnas: columnas.filter((c) => c.rol === 'mutable') },
    { titulo: <>Acciones <Clase letra="P" />: valores actuales, el AG propone los nuevos</>, columnas: columnas.filter((c) => c.rol === 'accion') },
  ];

  return (
    <div className="grid items-start gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        className="space-y-6 rounded-xl border border-linea bg-hoja p-5"
        onSubmit={(e) => {
          e.preventDefault();
          prescribir.mutate();
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-sm font-medium text-tinta">Punto de partida</p>
            <p className="text-xs text-tinta-2">Ahora: {origen || '—'}. Edite cualquier valor para describir el perfil.</p>
          </div>
          <Boton variante="fantasma" icono={<Download className="size-4" aria-hidden />} cargando={cargar.isPending && cargar.variables === null} onClick={() => cargar.mutate(null)}>
            Perfil típico
          </Boton>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-tinta-2">
              Estudiante (fila)
              <input type="number" min={0} className={`${estiloControl} w-[7rem]!`} value={estudiante} onChange={(e) => setEstudiante(e.target.value)} />
            </label>
            <Boton disabled={estudiante === ''} cargando={cargar.isPending && cargar.variables !== null} onClick={() => cargar.mutate(Number(estudiante))}>
              Cargar
            </Boton>
          </div>
        </div>
        {cargar.isError && <Aviso tipo="error">{cargar.error.message}</Aviso>}

        {grupos.map(
          (grupo, k) =>
            grupo.columnas.length > 0 && (
              <fieldset key={k}>
                <legend className="text-sm font-semibold text-tinta">{grupo.titulo}</legend>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grupo.columnas.map((c) => (
                    <Campo key={c.columna} columna={c} valor={valores[c.columna]} dataset={dataset} alCambiar={(v) => setValores((x) => ({ ...x, [c.columna]: v }))} />
                  ))}
                </div>
              </fieldset>
            ),
        )}

        <fieldset className="grid gap-4 border-t border-linea pt-5 sm:grid-cols-2">
          <legend className="sr-only">Meta y restricciones</legend>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-tinta">
              Meta en el objetivo <Clase letra="T" />
            </span>
            <select className={estiloControl} value={meta} onChange={(e) => setMeta(e.target.value)}>
              {[...niveles].reverse().map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === niveles.at(-1) ? ' (mejor nivel)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-tinta">Costo de intervención (β): {num(beta, 2)}</span>
            <input type="range" min={0} max={1} step={0.05} value={beta} onChange={(e) => setBeta(Number(e.target.value))} className="accent-[var(--pizarra)]" />
            <span className="text-xs text-tinta-3">Mayor, cambios más pequeños.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-tinta">Cambio máximo por acción: {delta === null ? 'sin límite' : `${Math.round(delta * 100)} % del rango`}</span>
            <input type="range" min={0} max={1} step={0.05} value={delta ?? 1} onChange={(e) => setDelta(Number(e.target.value) >= 1 ? null : Number(e.target.value))} className="accent-[var(--pizarra)]" />
          </label>
          <label className="flex items-center gap-2 self-center text-sm text-tinta">
            <input type="checkbox" className="size-4 accent-[var(--pizarra)]" checked={reducir} onChange={(e) => setReducir(e.target.checked)} />
            Permitir reducir acciones
          </label>
        </fieldset>

        <Boton type="submit" variante="principal" icono={<Sparkles className="size-4" aria-hidden />} cargando={prescribir.isPending}>
          Calcular la prescripción
        </Boton>
        {prescribir.isError && <Aviso tipo="error">{prescribir.error.message}</Aviso>}
      </form>

      <div>
        {prescribir.data ? (
          <ResultadoPrescripcion modeloId={modelo.id} prescripcion={prescribir.data} niveles={niveles} valores={g.niveles} sujeto="este perfil" />
        ) : (
          <div className="rounded-xl border border-dashed border-linea px-6 py-10 text-center text-sm text-tinta-2">
            Describa el perfil y pulse «Calcular la prescripción». El AG probará combinaciones de acciones con el FCM y devolverá la que más acerca el objetivo a la
            meta con el menor costo de intervención.
          </div>
        )}
      </div>
    </div>
  );
}
