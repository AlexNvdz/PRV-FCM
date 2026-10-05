// Paso 1: reporte inicial del dataset (dimensiones, tipos, vacíos y estadísticas
// descriptivas) y su codificación y fuzzificación Min-Max a [0, 1].
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { api } from '../api';
import { Aviso, Boton, Cargando, Dato, Formula, NivelChip } from '../componentes/ui';
import { nivelesDe } from '../hooks';
import type { Dataset, PerfilColumna } from '../tipos';
import { clase, entero, NOMBRE_CODIFICACION, num, NOTACION_ROL, pct } from '../utilidades';

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-serif text-lg font-semibold">{titulo}</h3>
      {descripcion && <p className="mt-1 max-w-[72ch] text-sm text-tinta-2">{descripcion}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Tabla({ columnas, filas, derecha = [] }: { columnas: string[]; filas: (string | number)[][]; derecha?: number[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-linea bg-hoja">
      <table className="tabular w-full text-sm">
        <thead className="bg-hoja-2 text-left text-xs text-tinta-2">
          <tr>
            {columnas.map((c, i) => (
              <th key={c} scope="col" className={clase('whitespace-nowrap px-3 py-2 font-medium', derecha.includes(i) && 'text-right')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={i} className="border-t border-linea">
              {fila.map((celda, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-tinta">
                    {celda}
                  </th>
                ) : (
                  <td key={j} className={clase('whitespace-nowrap px-3 py-1.5 text-tinta', derecha.includes(j) && 'text-right')}>
                    {celda}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VistaNormalizada({ dataset }: { dataset: Dataset }) {
  const [desde, setDesde] = useState(0);
  const cantidad = 12;
  const valido = Boolean(dataset.esquema && (dataset.esquemaConfirmado || dataset.validacion?.ok));
  const consulta = useQuery({
    queryKey: ['normalizados', dataset.id, JSON.stringify(dataset.esquema), desde],
    queryFn: () => api.normalizados(dataset.id, { desde, cantidad }),
    enabled: valido,
    placeholderData: (previo) => previo,
  });
  if (!valido) {
    return <Aviso tipo="aviso">El esquema actual tiene errores. Corríjalo en el paso 2 para ver los datos codificados y normalizados.</Aviso>;
  }
  if (consulta.isLoading) return <Cargando texto="Codificando y normalizando…" />;
  if (consulta.isError) return <Aviso tipo="error">{consulta.error.message}</Aviso>;
  const datos = consulta.data!;
  const niveles = nivelesDe(dataset.esquema);
  return (
    <div className="space-y-6">
      <p className="text-sm text-tinta-2">
        {dataset.esquemaConfirmado ? 'Con el esquema confirmado.' : 'Con el esquema sugerido; cambia al editarlo en el paso 2.'} Para explorar, la codificación
        y el Min-Max se ajustan con todos los registros; al entrenar se ajustan solo con la parte de entrenamiento.
      </p>
      <Tabla
        columnas={['Concepto', 'Columna', 'Clase', 'Codificación', 'Mínimo', 'Máximo', 'Media en [0, 1]']}
        derecha={[4, 5, 6]}
        filas={datos.conceptos.map((c) => [
          `${c.id} ${c.nombre}`,
          c.columna,
          NOTACION_ROL[c.rol] ?? '—',
          NOMBRE_CODIFICACION[c.codificacion],
          num(c.min, 3),
          num(c.max, 3),
          num(c.media, 3),
        ])}
      />
      <div>
        <div className={clase('overflow-x-auto rounded-xl border border-linea bg-hoja', consulta.isFetching && 'opacity-70')}>
          <table className="tabular w-full text-sm">
            <thead className="bg-hoja-2 text-left text-xs text-tinta-2">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Fila</th>
                <th scope="col" className="px-3 py-2 font-medium">Nivel</th>
                {datos.conceptos.map((c) => (
                  <th key={c.columna} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium" title={`${c.nombre} (${NOMBRE_CODIFICACION[c.codificacion]})`}>
                    {c.id}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((f) => (
                <tr key={f.id} className="border-t border-linea">
                  <th scope="row" className="px-3 py-1.5 text-left font-medium">{f.id}</th>
                  <td className="px-3 py-1.5">
                    <NivelChip nivel={f.nivel} niveles={niveles} />
                  </td>
                  {datos.conceptos.map((c) => (
                    <td key={c.columna} className="px-3 py-1.5 text-right text-tinta">
                      {num(Number(f[c.columna]), 3)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="text-tinta-2">
            {entero(desde + 1)}–{entero(Math.min(desde + cantidad, datos.total))} de {entero(datos.total)}
          </span>
          <Boton disabled={desde === 0} onClick={() => setDesde(Math.max(0, desde - cantidad))}>
            Anterior
          </Boton>
          <Boton disabled={desde + cantidad >= datos.total} onClick={() => setDesde(desde + cantidad)}>
            Siguiente
          </Boton>
        </div>
      </div>
    </div>
  );
}

const rango = (p: PerfilColumna) => (p.min === undefined ? '—' : `${num(p.min, 2)} a ${num(p.max, 2)}`);

export function ReporteInicial({ dataset, alContinuar }: { dataset: Dataset; alContinuar: () => void }) {
  const perfil = dataset.perfil;
  if (!perfil) return <Aviso tipo="error">El dataset no tiene perfil. Vuelva a subir el archivo.</Aviso>;
  const columnas = perfil.perfil;
  const numericas = columnas.filter((c) => c.tipo_dato === 'numerico');
  const categoricas = columnas.filter((c) => c.tipo_dato === 'categorico');
  const celdas = perfil.filas * perfil.columnas;
  const vacias = perfil.celdas_vacias ?? columnas.reduce((s, c) => s + c.faltantes, 0);

  return (
    <div className="space-y-10">
      <Seccion titulo="Dimensiones" descripcion="Lectura del archivo tal como se subió, antes de codificar.">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          <Dato etiqueta="Registros" valor={entero(perfil.filas)} />
          <Dato etiqueta="Columnas" valor={entero(perfil.columnas)} detalle={`${numericas.length} numéricas y ${categoricas.length} categóricas`} />
          <Dato etiqueta="Celdas vacías" valor={entero(vacias)} detalle={`${pct(celdas ? (100 * vacias) / celdas : 0, 2)} de ${entero(celdas)}`} />
          <Dato etiqueta="Filas con vacíos" valor={entero(perfil.filas_con_vacios ?? null)} detalle="Se descartan al entrenar" />
          <Dato etiqueta="Filas duplicadas" valor={entero(perfil.duplicados)} />
        </dl>
        {perfil.avisos.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {perfil.avisos.map((a) => (
              <Aviso key={a} tipo="info">
                {a}
              </Aviso>
            ))}
          </div>
        )}
      </Seccion>

      <Seccion titulo="Tipos de datos y valores faltantes">
        <Tabla
          columnas={['Columna', 'Tipo (pandas)', 'Clase', 'No nulos', 'Vacíos', 'Únicos', 'Ejemplos']}
          derecha={[3, 4, 5]}
          filas={columnas.map((c) => [
            c.columna,
            c.dtype ?? '—',
            c.tipo_dato === 'numerico' ? 'Numérica' : 'Categórica',
            entero(c.no_nulos ?? perfil.filas - c.faltantes),
            c.faltantes ? `${entero(c.faltantes)} (${pct((100 * c.faltantes) / perfil.filas)})` : '0',
            entero(c.unicos),
            c.ejemplos.slice(0, 4).join(', '),
          ])}
        />
      </Seccion>

      {numericas.length > 0 && (
        <Seccion titulo="Estadísticas descriptivas de las columnas numéricas">
          <Tabla
            columnas={['Columna', 'Media', 'Desviación estándar', 'Mínimo', 'Cuartil 1', 'Mediana', 'Cuartil 3', 'Máximo']}
            derecha={[1, 2, 3, 4, 5, 6, 7]}
            filas={numericas.map((c) => [c.columna, num(c.media, 2), num(c.desviacion, 2), num(c.min, 2), num(c.q1, 2), num(c.mediana, 2), num(c.q3, 2), num(c.max, 2)])}
          />
        </Seccion>
      )}

      {categoricas.length > 0 && (
        <Seccion titulo="Columnas categóricas">
          <Tabla
            columnas={['Columna', 'Categorías', 'Más frecuente', 'Frecuencia', 'Rango o valores']}
            derecha={[1, 3]}
            filas={categoricas.map((c) => [
              c.columna,
              entero(c.unicos),
              c.moda ?? '—',
              c.frecuencia_moda === undefined ? '—' : `${entero(c.frecuencia_moda)} (${pct((100 * c.frecuencia_moda) / Math.max(c.no_nulos ?? perfil.filas, 1))})`,
              c.categorias ? c.categorias.slice(0, 6).map((v) => v.valor).join(', ') + (c.unicos > 6 ? '…' : '') : rango(c),
            ])}
          />
        </Seccion>
      )}

      <Seccion
        titulo="Codificación y fuzzificación a [0, 1]"
        descripcion="Cada columna se convierte en un concepto del mapa con activación entre 0 y 1. La codificación de cada una se elige en el paso 2."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Formula lectura="Fuzzificación Min-Max: 0 es el mínimo observado y 1 el máximo.">x′ = (x − mín) / (máx − mín)</Formula>
          <Formula lectura="Ordinal o label encoding: cada categoría toma su posición en el orden definido y luego pasa por Min-Max.">
            «Bajo», «Medio», «Alto» → 0, 1, 2 → 0, 0,5, 1
          </Formula>
          <Formula lectura="Nominal con media del objetivo (target encoding), suavizada para categorías con pocos registros.">
            x = (n_c · media_c + 10 · media_global) / (n_c + 10)
          </Formula>
          <Formula lectura="Nominal one-hot: un concepto 0/1 por categoría; un registro activa solo el de su categoría.">
            Topic = IT → [IT: 1, Math: 0, …]
          </Formula>
        </div>
        <div className="mt-6">
          <VistaNormalizada dataset={dataset} />
        </div>
      </Seccion>

      <div className="flex flex-wrap items-center gap-3 border-t border-linea pt-6">
        <Boton variante="principal" icono={<ArrowRight className="size-4" aria-hidden />} onClick={alContinuar}>
          Continuar al paso 2: clasificar los nodos
        </Boton>
        <span className="text-sm text-tinta-2">Defina qué columna es el objetivo, cuáles son acciones y cuáles describen el sistema.</span>
      </div>
    </div>
  );
}
