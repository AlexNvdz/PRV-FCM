// Datos (paso 1): subir CSV o Excel y administrar los datasets.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, Trash2 } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { api } from '../api';
import { FlujoPasos } from '../componentes/FlujoPasos';
import { Aviso, Boton, Cargando, Encabezado, estiloControl } from '../componentes/ui';
import { useDatasetActivo } from '../contexto';
import type { DatasetResumen } from '../tipos';
import { clase, entero, fecha } from '../utilidades';

function ZonaSubida() {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const { elegirDataset } = useDatasetActivo();
  const entrada = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);
  const [nombre, setNombre] = useState('');
  const subir = useMutation({
    mutationFn: (archivo: File) => api.subirDataset(archivo, nombre.trim() || undefined),
    onSuccess: async (dataset) => {
      await cliente.invalidateQueries({ queryKey: ['datasets'] });
      elegirDataset(dataset.id);
      navegar(`/datos/${dataset.id}?pestana=reporte`);
    },
  });

  function soltar(evento: DragEvent) {
    evento.preventDefault();
    setEncima(false);
    const archivo = evento.dataTransfer.files[0];
    if (archivo) subir.mutate(archivo);
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={soltar}
        className={clase(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          encima ? 'border-foco bg-hoja-2' : 'border-linea bg-hoja',
        )}
      >
        <FileUp className="size-7 text-tinta-3" aria-hidden />
        <p className="mt-3 font-medium text-tinta">Arrastre aquí un archivo CSV o Excel</p>
        <p className="mt-1 max-w-[52ch] text-sm text-tinta-2">
          Una fila por estudiante. Debe incluir el resultado (rendimiento, nota final o deserción) y las acciones que se pueden cambiar.
          CSV con coma o punto y coma, o Excel (.xlsx, .xls: se usa la primera hoja con datos), hasta 50 MB.
        </p>
        <Boton variante="principal" className="mt-5" cargando={subir.isPending} onClick={() => entrada.current?.click()}>
          {subir.isPending ? 'Analizando columnas…' : 'Elegir archivo'}
        </Boton>
        <input
          ref={entrada}
          type="file"
          accept=".csv,.txt,text/csv,.xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="sr-only"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) subir.mutate(archivo);
            e.target.value = '';
          }}
        />
        {subir.isError && (
          <Aviso tipo="error" className="mt-4 text-left">
            {subir.error.message}
          </Aviso>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="nombre-dataset" className="text-sm font-medium text-tinta">
          Nombre (opcional)
        </label>
        <input
          id="nombre-dataset"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Por ejemplo: Deserción 2025-1"
          className={estiloControl}
          maxLength={80}
        />
        <p className="text-xs text-tinta-3">Si lo deja vacío, se usa el nombre del archivo. Todo queda en este equipo.</p>
      </div>
    </div>
  );
}

function EstadoDataset({ d }: { d: DatasetResumen }) {
  if (!d.esquemaConfirmado) return <span className="text-aviso">Esquema por revisar</span>;
  if (d.ultimoModelo?.estado === 'en_curso') return <span className="text-tinta-2">Entrenando…</span>;
  if (d.modeloActivo) return <span className="text-bien">Modelo listo</span>;
  return <span className="text-tinta-2">Sin modelo</span>;
}

function FilaDataset({ d, activo }: { d: DatasetResumen; activo: boolean }) {
  const cliente = useQueryClient();
  const { elegirDataset } = useDatasetActivo();
  const [confirmar, setConfirmar] = useState(false);
  const eliminar = useMutation({
    mutationFn: () => api.eliminarDataset(d.id),
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['datasets'] }),
  });
  return (
    <tr className="border-t border-linea align-middle">
      <td className="py-3 pr-4">
        <Link to={`/datos/${d.id}`} className="font-medium text-tinta underline-offset-4 hover:underline">
          {d.nombre}
        </Link>
        <span className="mt-0.5 block text-xs text-tinta-3">
          {d.archivo ?? 'CSV'}
          {d.ejemplo && ', dataset del proyecto'}
        </span>
      </td>
      <td className="tabular py-3 pr-4 text-right text-tinta-2">{entero(d.filas)}</td>
      <td className="tabular py-3 pr-4 text-right text-tinta-2">{entero(d.columnas)}</td>
      <td className="py-3 pr-4 text-sm">
        <EstadoDataset d={d} />
      </td>
      <td className="py-3 pr-4 text-sm text-tinta-2">{fecha(d.creado)}</td>
      <td className="py-3 text-right">
        {confirmar ? (
          <span className="inline-flex items-center gap-2 text-sm">
            ¿Eliminar con sus modelos?
            <Boton variante="peligro" cargando={eliminar.isPending} onClick={() => eliminar.mutate()}>
              Eliminar
            </Boton>
            <Boton variante="fantasma" onClick={() => setConfirmar(false)}>
              Cancelar
            </Boton>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            {activo ? (
              <span className="px-3 text-sm text-tinta-3">En uso</span>
            ) : (
              <Boton variante="fantasma" onClick={() => elegirDataset(d.id)}>
                Usar
              </Boton>
            )}
            <Boton variante="fantasma" aria-label={`Eliminar ${d.nombre}`} icono={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmar(true)} />
          </span>
        )}
      </td>
    </tr>
  );
}

export function Datos() {
  const { datasets, cargando, datasetId } = useDatasetActivo();
  return (
    <div>
      <FlujoPasos actual={1} compacto />
      <Encabezado
        titulo="Paso 1: ingesta y exploración"
        descripcion="Suba datasets de rendimiento académico o deserción escolar. Cada uno recibe un reporte inicial y, en el paso 2, cada columna se clasifica como objetivo, acción o concepto del sistema."
      />
      <ZonaSubida />
      <section className="mt-12">
        <h2 className="font-serif text-[1.3rem] font-semibold">Datasets</h2>
        {cargando ? (
          <Cargando />
        ) : datasets.length === 0 ? (
          <p className="mt-3 text-sm text-tinta-2">Todavía no hay datasets.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-tinta-3">
                <tr>
                  <th scope="col" className="pb-2 font-medium">Nombre</th>
                  <th scope="col" className="pb-2 pr-4 text-right font-medium">Registros</th>
                  <th scope="col" className="pb-2 pr-4 text-right font-medium">Columnas</th>
                  <th scope="col" className="pb-2 font-medium">Estado</th>
                  <th scope="col" className="pb-2 font-medium">Subido</th>
                  <th scope="col" className="pb-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <FilaDataset key={d.id} d={d} activo={d.id === datasetId} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
