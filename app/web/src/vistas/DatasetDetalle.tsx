// Detalle de un dataset: reporte inicial (paso 1), clasificación de nodos (paso 2),
// relaciones entre variables y registros.
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { api } from '../api';
import { FlujoPasos } from '../componentes/FlujoPasos';
import { Aviso, Boton, Cargando, Encabezado, estiloControl, NivelChip, Pestanas, Vacio } from '../componentes/ui';
import { useDatasetActivo } from '../contexto';
import { nivelesDe, useDataset } from '../hooks';
import type { Dataset } from '../tipos';
import { clase, entero } from '../utilidades';
import { EditorEsquema } from './EditorEsquema';
import { Relaciones } from './Relaciones';
import { ReporteInicial } from './ReporteInicial';

type Pestana = 'reporte' | 'esquema' | 'relaciones' | 'registros';
const PESTANAS: Pestana[] = ['reporte', 'esquema', 'relaciones', 'registros'];

function Registros({ dataset }: { dataset: Dataset }) {
  const [desde, setDesde] = useState(0);
  const [orden, setOrden] = useState<{ columna: string; desc: boolean } | null>(null);
  const [nivel, setNivel] = useState('');
  const cantidad = 25;
  const niveles = nivelesDe(dataset.esquema);
  const consulta = useQuery({
    queryKey: ['filas', dataset.id, desde, orden, nivel, dataset.esquemaConfirmado],
    queryFn: () => api.filas(dataset.id, { desde, cantidad, orden: orden?.columna, desc: orden?.desc, nivel: nivel || undefined }),
    placeholderData: (previo) => previo,
  });
  const pagina = consulta.data;

  function ordenar(columna: string) {
    setDesde(0);
    setOrden((o) => (o?.columna === columna ? { columna, desc: !o.desc } : { columna, desc: false }));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        {dataset.esquemaConfirmado && (
          <div className="flex items-center gap-2">
            <label htmlFor="filtro-nivel" className="text-sm text-tinta-2">
              Nivel
            </label>
            <select
              id="filtro-nivel"
              className={clase(estiloControl, 'w-40!')}
              value={nivel}
              onChange={(e) => {
                setNivel(e.target.value);
                setDesde(0);
              }}
            >
              <option value="">Todos</option>
              {niveles.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
        {pagina && (
          <p className="text-sm text-tinta-2">
            {entero(pagina.total)} registros. El id es la fila del archivo (la primera es 0).
          </p>
        )}
      </div>
      {consulta.isError && <Aviso tipo="error">{consulta.error.message}</Aviso>}
      {pagina && (
        <div className={clase('overflow-auto rounded-xl border border-linea bg-hoja', consulta.isFetching && 'opacity-70')}>
          <table className="tabular w-full text-sm">
            <thead className="sticky top-0 bg-hoja-2 text-left text-xs text-tinta-2">
              <tr>
                {pagina.columnas.map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 font-medium" aria-sort={orden?.columna === c ? (orden.desc ? 'descending' : 'ascending') : 'none'}>
                    <button type="button" onClick={() => ordenar(c)} className="inline-flex items-center gap-1 hover:text-tinta">
                      {c}
                      {orden?.columna === c && (orden.desc ? <ChevronDown className="size-3" aria-hidden /> : <ChevronUp className="size-3" aria-hidden />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagina.filas.map((fila) => (
                <tr key={String(fila.id)} className="border-t border-linea">
                  {pagina.columnas.map((c) => (
                    <td key={c} className="whitespace-nowrap px-3 py-1.5 text-tinta">
                      {c === 'nivel' ? <NivelChip nivel={String(fila[c])} niveles={niveles} /> : String(fila[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagina && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="text-tinta-2">
            {entero(desde + 1)}–{entero(Math.min(desde + cantidad, pagina.total))} de {entero(pagina.total)}
          </span>
          <Boton disabled={desde === 0} onClick={() => setDesde(Math.max(0, desde - cantidad))}>
            Anterior
          </Boton>
          <Boton disabled={desde + cantidad >= pagina.total} onClick={() => setDesde(desde + cantidad)}>
            Siguiente
          </Boton>
        </div>
      )}
    </div>
  );
}

export function DatasetDetalle() {
  const { id } = useParams();
  const consulta = useDataset(id);
  const { datasetId, elegirDataset } = useDatasetActivo();
  const [parametros, setParametros] = useSearchParams();
  const pedida = parametros.get('pestana') as Pestana | null;
  const pestana: Pestana = pedida && PESTANAS.includes(pedida) ? pedida : 'reporte';
  const setPestana = (valor: Pestana) => setParametros({ pestana: valor }, { replace: true });

  if (consulta.isLoading) return <Cargando />;
  if (consulta.isError || !consulta.data) {
    return (
      <Vacio titulo="No se encontró el dataset" accion={<Link to="/datos" className="text-sm underline">Volver a Datos</Link>}>
        {consulta.error?.message}
      </Vacio>
    );
  }
  const dataset = consulta.data;
  return (
    <div>
      <FlujoPasos actual={pestana === 'esquema' ? 2 : pestana === 'reporte' ? 1 : undefined} dataset={dataset} compacto />
      <p className="mb-2 text-sm">
        <Link to="/datos" className="text-tinta-2 hover:text-tinta">
          Datos
        </Link>
      </p>
      <Encabezado
        titulo={dataset.nombre}
        descripcion={`${dataset.archivo ?? 'CSV'}: ${entero(dataset.filas)} registros y ${entero(dataset.columnas)} columnas.`}
        acciones={
          datasetId === dataset.id ? (
            <Link to="/modelo" className="inline-flex h-9 items-center rounded-md bg-boton px-3.5 text-sm font-medium text-boton-texto hover:opacity-90">
              Ir al modelo
            </Link>
          ) : (
            <Boton variante="principal" onClick={() => elegirDataset(dataset.id)}>
              Usar este dataset
            </Boton>
          )
        }
      />
      <Pestanas
        etiqueta="Secciones del dataset"
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { valor: 'reporte', texto: '1. Reporte inicial' },
          { valor: 'esquema', texto: '2. Clasificación de nodos' },
          { valor: 'relaciones', texto: 'Relaciones entre variables' },
          { valor: 'registros', texto: 'Registros' },
        ]}
      />
      {pestana === 'reporte' && <ReporteInicial dataset={dataset} alContinuar={() => setPestana('esquema')} />}
      {pestana === 'esquema' && <EditorEsquema key={dataset.id} dataset={dataset} />}
      {pestana === 'relaciones' && <Relaciones dataset={dataset} />}
      {pestana === 'registros' && <Registros dataset={dataset} />}
    </div>
  );
}
