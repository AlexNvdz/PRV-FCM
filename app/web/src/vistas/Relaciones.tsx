// Relaciones entre variables y con el objetivo: distribución del objetivo, correlación de
// cada variable con él, perfil medio por nivel, mapa de calor de correlaciones, dispersión
// de dos variables y distribución de una variable por nivel.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';

import { api } from '../api';
import { GraficaDivergente, GraficaNiveles, GraficaVariable } from '../componentes/graficas';
import { GraficaDispersion, GraficaPerfilNiveles, MapaCalor } from '../componentes/relaciones';
import { Aviso, Cargando, estiloControl, Vacio } from '../componentes/ui';
import { useEstadisticas } from '../hooks';
import type { Dataset, MetodoCorrelacion } from '../tipos';
import { clase, NOMBRE_ROL } from '../utilidades';

const METODOS: { valor: MetodoCorrelacion; texto: string; ayuda: string }[] = [
  { valor: 'spearman', texto: 'Spearman', ayuda: 'Por rangos: capta relaciones monótonas aunque no sean lineales.' },
  { valor: 'pearson', texto: 'Pearson', ayuda: 'Lineal, sobre los valores normalizados.' },
  { valor: 'parcial', texto: 'Parcial', ayuda: 'Cada par descontando a todas las demás variables: la base del método de pesos por correlación parcial.' },
];

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h3 className="font-serif text-lg font-semibold">{titulo}</h3>
      <p className="mt-1 max-w-[72ch] text-sm text-tinta-2">{descripcion}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Relaciones({ dataset }: { dataset: Dataset }) {
  const explorable = Boolean(dataset.esquema && (dataset.esquemaConfirmado || dataset.validacion?.ok));
  const estadisticas = useEstadisticas(dataset.id, dataset.esquema, explorable);
  const [metodo, setMetodo] = useState<MetodoCorrelacion>('spearman');
  const [variable, setVariable] = useState<string | null>(null);
  const [ejes, setEjes] = useState<{ x: string; y: string } | null>(null);

  const correlaciones = useQuery({
    queryKey: ['correlaciones', dataset.id, JSON.stringify(dataset.esquema), metodo],
    queryFn: () => api.correlaciones(dataset.id, metodo),
    enabled: explorable,
    staleTime: 5 * 60_000,
    placeholderData: (previo) => previo,
  });

  const datos = estadisticas.data;
  const ordenadas = useMemo(
    () => [...(datos?.variables ?? [])].filter((v) => v.correlacion !== null).sort((a, b) => Math.abs(b.correlacion!) - Math.abs(a.correlacion!)),
    [datos],
  );
  // Por defecto, la dispersión cruza las dos variables más asociadas con el objetivo.
  const ejesElegidos = ejes ?? (ordenadas.length >= 2 ? { x: ordenadas[0].columna, y: ordenadas[1].columna } : null);
  const dispersion = useQuery({
    queryKey: ['dispersion', dataset.id, JSON.stringify(dataset.esquema), ejesElegidos?.x, ejesElegidos?.y],
    queryFn: () => api.dispersion(dataset.id, ejesElegidos!.x, ejesElegidos!.y),
    enabled: explorable && Boolean(ejesElegidos),
    placeholderData: (previo) => previo,
  });

  if (!explorable) {
    return <Vacio titulo="Corrija el esquema para explorar las relaciones">Las gráficas usan el objetivo y la codificación que se definen en el paso 2.</Vacio>;
  }
  if (estadisticas.isLoading) return <Cargando texto="Calculando estadísticas…" />;
  if (estadisticas.isError) return <Aviso tipo="error">{estadisticas.error.message}</Aviso>;
  const niveles = datos!.objetivo.niveles.map((n) => n.etiqueta);
  const elegida = datos!.variables.find((v) => v.columna === (variable ?? ordenadas[0]?.columna)) ?? datos!.variables[0];
  const opcionesEje = [
    ...datos!.variables.map((v) => ({ columna: v.columna, texto: `${v.id} ${v.nombre} (${NOMBRE_ROL[v.rol].toLowerCase()})` })),
    { columna: datos!.objetivo.columna, texto: `${datos!.objetivo.columna} (objetivo)` },
  ];
  const corr = correlaciones.data;
  const ayudaMetodo = METODOS.find((m) => m.valor === metodo)!.ayuda;

  return (
    <div>
      {!dataset.esquemaConfirmado && (
        <Aviso tipo="aviso" className="mb-6">
          Se exploran los datos con el esquema sugerido. Confirme la clasificación en el paso 2 antes de entrenar.
        </Aviso>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <GraficaNiveles niveles={datos!.objetivo.niveles} objetivo={datos!.objetivo.columna} />
        <GraficaDivergente
          titulo={`Correlación de cada variable con ${datos!.objetivo.columna}`}
          descripcion="Spearman sobre los valores codificados. Asociación, no causa. Las nominales con media del objetivo se asocian con él por construcción."
          etiquetaValor="Correlación"
          datos={ordenadas.map((v) => ({ nombre: `${v.id} ${v.nombre}`, valor: v.correlacion!, detalle: NOMBRE_ROL[v.rol] }))}
        />
      </div>

      {datos!.perfil_niveles && (
        <Seccion titulo="Cómo cambia cada variable entre niveles" descripcion="Si los puntos de los niveles quedan separados, la variable distingue a los estudiantes por su resultado.">
          <GraficaPerfilNiveles perfil={datos!.perfil_niveles} niveles={niveles} />
        </Seccion>
      )}

      <Seccion titulo="Correlaciones entre todas las variables" descripcion="Cada celda es la correlación entre dos conceptos ya codificados y normalizados, objetivo incluido.">
        <div className="mb-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Método de correlación">
          {METODOS.map((m) => (
            <button
              key={m.valor}
              type="button"
              role="radio"
              aria-checked={metodo === m.valor}
              onClick={() => setMetodo(m.valor)}
              className={clase('rounded-full border px-3 py-1 text-sm', metodo === m.valor ? 'border-tinta bg-hoja-2 text-tinta' : 'border-linea text-tinta-2 hover:bg-hoja-2')}
            >
              {m.texto}
            </button>
          ))}
          <span className="text-xs text-tinta-3">{ayudaMetodo}</span>
        </div>
        {correlaciones.isError && <Aviso tipo="error">{correlaciones.error.message}</Aviso>}
        {!corr && correlaciones.isLoading && <Cargando texto="Calculando correlaciones…" />}
        {corr && (
          <div className={clase(correlaciones.isFetching && 'opacity-70')}>
            <MapaCalor
              titulo={`Matriz de correlación (${METODOS.find((m) => m.valor === corr.metodo)!.texto})`}
              descripcion={`${corr.conceptos.length} conceptos y ${corr.n.toLocaleString('es-CO')} registros. Pase el cursor por una celda para leer el valor.`}
              filas={corr.conceptos}
              columnas={corr.conceptos}
              valores={corr.matriz}
              etiquetaValor="Correlación"
              vacio="Sin variación"
              extremos={['Relación inversa', 'Relación directa']}
            />
          </div>
        )}
      </Seccion>

      <Seccion titulo="Dos variables frente a frente" descripcion="Elija dos variables: cada registro se colorea con su nivel del objetivo y los rombos marcan la media de cada nivel.">
        <div className="mb-3 grid max-w-2xl gap-3 sm:grid-cols-2">
          {(['x', 'y'] as const).map((eje) => (
            <label key={eje} className="flex flex-col gap-1.5 text-sm font-medium text-tinta">
              Eje {eje === 'x' ? 'horizontal' : 'vertical'}
              <select
                className={estiloControl}
                value={ejesElegidos?.[eje] ?? ''}
                onChange={(e) => setEjes({ ...(ejesElegidos ?? { x: '', y: '' }), [eje]: e.target.value })}
              >
                {opcionesEje.map((o) => (
                  <option key={o.columna} value={o.columna}>
                    {o.texto}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {dispersion.isError && <Aviso tipo="error">{dispersion.error.message}</Aviso>}
        {dispersion.data && (
          <div className={clase(dispersion.isFetching && 'opacity-70')}>
            <GraficaDispersion datos={dispersion.data} />
          </div>
        )}
      </Seccion>

      <Seccion titulo="Una variable por nivel" descripcion="Distribución de una variable en cada nivel del objetivo.">
        <label htmlFor="variable" className="text-sm font-medium text-tinta">
          Variable
        </label>
        <select id="variable" className={clase(estiloControl, 'mt-1.5 max-w-sm')} value={elegida?.columna} onChange={(e) => setVariable(e.target.value)}>
          {datos!.variables.map((v) => (
            <option key={v.columna} value={v.columna}>
              {v.nombre} ({NOMBRE_ROL[v.rol].toLowerCase()})
            </option>
          ))}
        </select>
        {elegida && (
          <div className="mt-4">
            <GraficaVariable variable={elegida} niveles={niveles} />
          </div>
        )}
      </Seccion>
    </div>
  );
}
