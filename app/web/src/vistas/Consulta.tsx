// Consulta para el usuario final: elige un modelo entrenado (el tema es el nombre de su dataset),
// describe el caso, fija el estado deseado y recibe la prescripción, que puede descargar o
// imprimir. Después registra el resultado observado al aplicarla (etapa 4 de García et al., 2025).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Download, Printer, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { api } from '../api';
import { ResultadoPrescripcion } from '../componentes/prescripcion';
import { Aviso, Boton, Cargando, Clase, Encabezado, estiloControl, NivelChip, Seccion, Vacio } from '../componentes/ui';
import { nivelesDe, useDataset, useModelo } from '../hooks';
import type { ColumnaEsquema, Dataset, Esquema, ModeloDetalle, MetodoPesos, PerfilModelo, Prescripcion } from '../tipos';
import { descargarCsv, fecha, NOMBRE_METODO, NOMBRE_PERFIL, NOMBRE_ROL, num } from '../utilidades';
import { Campo } from './PerfilRiesgo';

type Valores = Record<string, string | number>;

/** Fecha local en formato AAAA-MM-DD. */
const hoy = () => new Date().toLocaleDateString('sv-SE');

const vacio = (v: string | number | undefined) => v === undefined || v === '';

/** Valor para el motor: número si la columna es numérica; texto en el resto. */
function valorDe(columna: ColumnaEsquema, valor: string | number) {
  return columna.codificacion === 'numerica' && valor !== '' && Number.isFinite(Number(valor)) ? Number(valor) : valor;
}

/** Valor original de una acción con dos decimales como máximo (o su categoría). */
const valorAccion = (v: { valor: number; categoria?: string }) => v.categoria ?? Math.round(v.valor * 100) / 100;

function ResumenModelo({ modelo }: { modelo: ModeloDetalle }) {
  const esquema = modelo.esquema!;
  const niveles = nivelesDe(esquema);
  const objetivo = esquema.columnas.find((c) => c.rol === 'objetivo');
  const acciones = esquema.columnas.filter((c) => c.rol === 'accion');
  return (
    <dl className="mt-4 grid gap-4 rounded-xl border border-linea bg-hoja p-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs text-tinta-3">
          Objetivo <Clase letra="T" />
        </dt>
        <dd className="mt-1 text-tinta">
          {objetivo?.nombre || objetivo?.columna}:{' '}
          {niveles.map((n) => (
            <span key={n} className="mr-1">
              <NivelChip nivel={n} niveles={niveles} />
            </span>
          ))}
          <span className="text-xs text-tinta-3">de peor a mejor</span>
        </dd>
      </div>
      <div>
        <dt className="text-xs text-tinta-3">
          Acciones que el modelo puede prescribir <Clase letra="P" />
        </dt>
        <dd className="mt-1 text-tinta">{acciones.map((c) => c.nombre || c.columna).join(', ') || 'ninguna'}</dd>
      </div>
    </dl>
  );
}

/** Retroalimentación: qué se aplicó, qué se observó y cuándo. Se guarda junto al modelo; todavía no lo reentrena. */
function Seguimiento({ modelo, esquema, dataset, prescripcion, perfil }: { modelo: ModeloDetalle; esquema: Esquema; dataset?: Dataset; prescripcion?: Prescripcion; perfil: Valores | null }) {
  const cliente = useQueryClient();
  const registros = useQuery({ queryKey: ['seguimiento', modelo.id], queryFn: () => api.seguimiento(modelo.id) });
  const acciones = esquema.columnas.filter((c) => c.rol === 'accion');
  const objetivo = esquema.columnas.find((c) => c.rol === 'objetivo');
  const recomendadas: Valores = Object.fromEntries((prescripcion?.acciones ?? []).map((a) => [a.columna, valorAccion(a.recomendada)]));
  const [aplicadas, setAplicadas] = useState<Valores>(recomendadas);
  const [resultado, setResultado] = useState('');
  const [dia, setDia] = useState(hoy());
  const [nota, setNota] = useState('');
  const registrar = useMutation({
    mutationFn: () =>
      api.registrarSeguimiento(modelo.id, {
        fecha: dia,
        acciones_aplicadas: Object.fromEntries(acciones.filter((c) => !vacio(aplicadas[c.columna])).map((c) => [c.columna, valorDe(c, aplicadas[c.columna])])),
        resultado_observado: objetivo?.orden?.length ? resultado : Number(resultado),
        nivel_base: prescripcion?.base.nivel,
        nivel_prescrito: prescripcion?.prescrito.nivel,
        acciones_recomendadas: recomendadas,
        ...(perfil ? { perfil } : {}),
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      }),
    onSuccess: async () => {
      setResultado('');
      setNota('');
      await cliente.invalidateQueries({ queryKey: ['seguimiento', modelo.id] });
    },
  });
  const lista = registros.data ?? [];
  const nombre = (columna: string) => esquema.columnas.find((c) => c.columna === columna)?.nombre || columna;

  function exportar() {
    descargarCsv(`seguimiento-${modelo.id}.csv`, [
      ['fecha', 'registrado', ...acciones.map((c) => `${c.columna}_aplicada`), ...acciones.map((c) => `${c.columna}_recomendada`), 'resultado_observado', 'nivel_base', 'nivel_prescrito', 'nota'],
      ...lista.map((r) => [
        r.fecha,
        r.registrado,
        ...acciones.map((c) => r.acciones_aplicadas[c.columna]),
        ...acciones.map((c) => r.acciones_recomendadas?.[c.columna]),
        r.resultado_observado,
        r.nivel_base,
        r.nivel_prescrito,
        r.nota,
      ]),
    ]);
  }

  return (
    <div className="no-imprimir">
      <Seccion
        titulo="4. Seguimiento"
        descripcion="Tras aplicar el plan, registre qué acciones se aplicaron de verdad y qué resultado se observó. Es la etapa de retroalimentación del artículo de 2025."
        acciones={
          <Boton variante="fantasma" icono={<Download className="size-4" aria-hidden />} disabled={!lista.length} onClick={exportar}>
            Exportar CSV
          </Boton>
        }
      >
        <Aviso tipo="info" className="mb-4">
          Pendiente: estos registros todavía no reentrenan el modelo. Sirven para comprobar si las prescripciones funcionan y para un reentrenamiento futuro.
        </Aviso>
        {prescripcion ? (
          <form
            className="space-y-4 rounded-xl border border-linea bg-hoja p-5"
            onSubmit={(e) => {
              e.preventDefault();
              registrar.mutate();
            }}
          >
            <fieldset>
              <legend className="text-sm font-semibold text-tinta">
                Acciones aplicadas <Clase letra="P" />
              </legend>
              <p className="text-xs text-tinta-2">Parten de las recomendadas; corríjalas si se aplicó otra cosa.</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {acciones.map((c) => (
                  <Campo key={c.columna} columna={c} valor={aplicadas[c.columna]} dataset={dataset} alCambiar={(v) => setAplicadas((x) => ({ ...x, [c.columna]: v }))} />
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-tinta">
                  Resultado observado en {objetivo?.nombre || objetivo?.columna} <Clase letra="T" />
                </span>
                {objetivo?.orden?.length ? (
                  <select required className={estiloControl} value={resultado} onChange={(e) => setResultado(e.target.value)}>
                    <option value="">Elija el nivel observado</option>
                    {objetivo.orden.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input required type="number" step="any" className={estiloControl} value={resultado} onChange={(e) => setResultado(e.target.value)} />
                )}
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-tinta">Fecha del resultado</span>
                <input required type="date" max={hoy()} className={estiloControl} value={dia} onChange={(e) => setDia(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-tinta">Nota (opcional)</span>
                <input type="text" maxLength={1000} className={estiloControl} value={nota} onChange={(e) => setNota(e.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Boton type="submit" variante="principal" icono={<ClipboardCheck className="size-4" aria-hidden />} cargando={registrar.isPending}>
                Registrar resultado
              </Boton>
              {registrar.isSuccess && <span className="text-sm text-bien">Resultado registrado.</span>}
              {registrar.isError && <Aviso tipo="error">{registrar.error.message}</Aviso>}
            </div>
          </form>
        ) : (
          <p className="text-sm text-tinta-2">Calcule una prescripción para registrar su resultado.</p>
        )}

        {registros.isLoading ? (
          <Cargando texto="Leyendo el seguimiento…" />
        ) : lista.length ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-linea">
            <table className="tabular w-full text-sm">
              <caption className="sr-only">Resultados registrados de este modelo</caption>
              <thead className="bg-hoja-2 text-left text-xs text-tinta-2">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Fecha</th>
                  <th scope="col" className="px-3 py-2 font-medium">Acciones aplicadas</th>
                  <th scope="col" className="px-3 py-2 font-medium">Nivel prescrito</th>
                  <th scope="col" className="px-3 py-2 font-medium">Resultado observado</th>
                  <th scope="col" className="px-3 py-2 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody>
                {[...lista].reverse().map((r) => (
                  <tr key={r.id} className="border-t border-linea align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{r.fecha}</td>
                    <td className="px-3 py-2">
                      {Object.entries(r.acciones_aplicadas)
                        .map(([c, v]) => `${nombre(c)}: ${typeof v === 'number' ? num(v, 2) : v}`)
                        .join('; ')}
                    </td>
                    <td className="px-3 py-2">{r.nivel_prescrito ?? '—'}</td>
                    <td className="px-3 py-2 font-medium">{typeof r.resultado_observado === 'number' ? num(r.resultado_observado, 2) : r.resultado_observado}</td>
                    <td className="px-3 py-2 text-tinta-2">{r.nota ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-tinta-3">Todavía no hay resultados registrados para este modelo.</p>
        )}
      </Seccion>
    </div>
  );
}

function FormularioConsulta({ modelo, dataset, tema }: { modelo: ModeloDetalle; dataset?: Dataset; tema: string }) {
  const esquema = modelo.esquema!;
  const g = modelo.graficas!;
  // Niveles del modelo (con el objetivo binarizado son «<N» y «≥N»), del peor al mejor.
  const niveles = useMemo(() => Object.entries(g.niveles).sort((a, b) => a[1] - b[1]).map(([n]) => n), [g.niveles]);
  const columnas = esquema.columnas.filter((c) => c.rol !== 'excluir' && c.rol !== 'objetivo');
  const mutables = columnas.filter((c) => c.rol === 'mutable');
  const tipico = useQuery({ queryKey: ['perfil-base', modelo.id, null], queryFn: () => api.perfilBase(modelo.id, null), staleTime: Infinity });
  const [valores, setValores] = useState<Valores>({});
  const [deseados, setDeseados] = useState<Valores>({});
  const [meta, setMeta] = useState(niveles.at(-1) ?? '');
  const [enviado, setEnviado] = useState<{ perfil: Valores; cuando: string } | null>(null);
  const prescribir = useMutation({
    mutationFn: (datos: { perfil: Valores; deseados?: Valores; nivelMeta: string | null }) => api.prescribirPerfil(modelo.id, datos),
  });

  if (tipico.isLoading) return <Cargando texto="Preparando el formulario…" />;
  if (tipico.isError) return <Aviso tipo="error">{tipico.error.message}</Aviso>;
  const valorTipico = (c: ColumnaEsquema) => tipico.data?.valores[c.columna];
  const textoTipico = (c: ColumnaEsquema) => {
    const t = valorTipico(c);
    return t === undefined ? undefined : `Típico: ${typeof t === 'number' ? num(t, 2) : t}`;
  };
  const sinDato = columnas.filter((c) => vacio(valores[c.columna]));
  const grupos = [
    { titulo: 'Datos que no cambian', letra: 'S' as const, columnas: columnas.filter((c) => c.rol === 'inmutable'), nota: '' },
    { titulo: 'Estado actual', letra: 'S' as const, columnas: mutables, nota: '' },
    { titulo: 'Acciones actuales (opcionales)', letra: 'P' as const, columnas: columnas.filter((c) => c.rol === 'accion'), nota: 'Lo que hoy se hace. El modelo propone los nuevos valores.' },
  ];

  function calcular() {
    // Un dato vacío toma el valor típico del dataset.
    const perfil = Object.fromEntries(columnas.map((c) => [c.columna, valorDe(c, vacio(valores[c.columna]) ? (valorTipico(c) ?? '') : valores[c.columna])]));
    const pedidos = Object.fromEntries(mutables.filter((c) => !vacio(deseados[c.columna])).map((c) => [c.columna, valorDe(c, deseados[c.columna])]));
    setEnviado({ perfil, cuando: new Date().toISOString() });
    prescribir.mutate({ perfil, deseados: Object.keys(pedidos).length ? pedidos : undefined, nivelMeta: meta || null });
  }

  function exportar(p: Prescripcion) {
    const perfil = enviado?.perfil ?? {};
    const objetivo = esquema.columnas.find((c) => c.rol === 'objetivo');
    descargarCsv(`consulta-${hoy()}.csv`, [
      ['Consulta PRV-FCM'],
      ['Tema', tema],
      ['Fecha', enviado ? fecha(enviado.cuando) : hoy()],
      ['Objetivo', objetivo?.nombre || objetivo?.columna],
      [],
      ['Variable', 'Rol', 'Valor actual', 'Valor recomendado'],
      ...columnas.filter((c) => c.rol !== 'accion').map((c) => [c.nombre || c.columna, NOMBRE_ROL[c.rol], perfil[c.columna], '']),
      ...p.acciones.map((a) => [a.nombre, NOMBRE_ROL.accion, valorAccion(a.actual), valorAccion(a.recomendada)]),
      [],
      ['Nivel con las acciones actuales', p.base.nivel],
      ['Nivel con las acciones prescritas', p.prescrito.nivel],
      ['Meta', p.meta?.nivel ?? ''],
      ...(p.deseados ?? []).map((d) => [`Deseado: ${d.nombre}`, d.valor]),
      ...(p.restriccion ? [['Restricción', p.restriccion.texto]] : []),
      ['Reporte', p.reporte?.texto ?? ''],
    ]);
  }

  return (
    <>
      <div className="no-imprimir">
        <Seccion titulo="2. El caso y el estado deseado" descripcion="Complete lo que sepa. Un dato vacío toma el valor típico del dataset (se muestra en gris).">
          <form
            className="space-y-6 rounded-xl border border-linea bg-hoja p-5"
            onSubmit={(e) => {
              e.preventDefault();
              calcular();
            }}
          >
            {grupos.map(
              (grupo) =>
                grupo.columnas.length > 0 && (
                  <fieldset key={grupo.titulo}>
                    <legend className="text-sm font-semibold text-tinta">
                      {grupo.titulo} <Clase letra={grupo.letra} />
                    </legend>
                    {grupo.nota && <p className="text-xs text-tinta-2">{grupo.nota}</p>}
                    <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {grupo.columnas.map((c) => (
                        <Campo key={c.columna} columna={c} valor={valores[c.columna]} dataset={dataset} vacio={textoTipico(c)} alCambiar={(v) => setValores((x) => ({ ...x, [c.columna]: v }))} />
                      ))}
                    </div>
                  </fieldset>
                ),
            )}

            <fieldset className="space-y-3 border-t border-linea pt-5">
              <legend className="text-sm font-semibold text-tinta">Estado deseado</legend>
              <label className="flex max-w-sm flex-col gap-1 text-sm">
                <span className="text-tinta">
                  Nivel deseado del objetivo <Clase letra="T" />
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
              {mutables.length > 0 && (
                <details className="rounded-lg border border-linea px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-tinta">Valores deseados del estado (opcional)</summary>
                  <p className="mt-2 text-xs text-tinta-2">
                    Si quiere plantear un escenario, por ejemplo menos ausencias. Un concepto que el modelo recalcula entra en la meta del AG; uno fijo se toma como
                    punto de partida.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {mutables.map((c) => (
                      <Campo key={c.columna} columna={c} valor={deseados[c.columna]} dataset={dataset} vacio="Sin valor deseado" alCambiar={(v) => setDeseados((x) => ({ ...x, [c.columna]: v }))} />
                    ))}
                  </div>
                </details>
              )}
            </fieldset>

            <div className="flex flex-wrap items-center gap-3">
              <Boton type="submit" variante="principal" icono={<Sparkles className="size-4" aria-hidden />} cargando={prescribir.isPending}>
                Obtener la prescripción
              </Boton>
              {sinDato.length > 0 && (
                <span className="text-xs text-tinta-2">
                  {sinDato.length === columnas.length ? 'Sin datos: se usará el caso típico.' : `${sinDato.length} datos vacíos tomarán el valor típico.`}
                </span>
              )}
              {prescribir.isError && <Aviso tipo="error">{prescribir.error.message}</Aviso>}
            </div>
          </form>
        </Seccion>
      </div>

      {prescribir.data && (
        <Seccion
          titulo="3. Prescripción"
          descripcion={`${tema}${enviado ? `, consulta del ${fecha(enviado.cuando)}` : ''}.`.replace('..', '.')}
          acciones={
            <div className="no-imprimir flex gap-2">
              <Boton variante="fantasma" icono={<Download className="size-4" aria-hidden />} onClick={() => exportar(prescribir.data)}>
                Descargar CSV
              </Boton>
              <Boton variante="fantasma" icono={<Printer className="size-4" aria-hidden />} onClick={() => window.print()}>
                Imprimir
              </Boton>
            </div>
          }
        >
          {prescribir.data.deseados?.length ? (
            <Aviso tipo="info" className="mb-4">
              Estado deseado:{' '}
              {prescribir.data.deseados.map((d) => `${d.nombre} = ${typeof d.valor === 'number' ? num(d.valor, 2) : d.valor}${d.dinamico ? ' (meta del AG)' : ' (punto de partida)'}`).join('; ')}.
            </Aviso>
          ) : null}
          <ResultadoPrescripcion modeloId={modelo.id} prescripcion={prescribir.data} niveles={niveles} valores={g.niveles} sujeto="este caso" />
        </Seccion>
      )}

      <Seguimiento
        key={prescribir.data ? JSON.stringify(prescribir.data.acciones.map((a) => a.recomendada.valor)) : 'sin-prescripcion'}
        modelo={modelo}
        esquema={esquema}
        dataset={dataset}
        prescripcion={prescribir.data}
        perfil={enviado?.perfil ?? null}
      />
    </>
  );
}

export function Consulta() {
  const [params, setParams] = useSearchParams();
  const modelos = useQuery({ queryKey: ['modelos-listos'], queryFn: api.modelos });
  const modeloId = params.get('modelo');
  const modelo = useModelo(modeloId);
  const dataset = useDataset(modelo.data?.datasetId);
  const lista = modelos.data ?? [];
  const elegido = lista.find((m) => m.id === modeloId);
  const listo = modelo.data?.esquema && modelo.data.graficas;

  return (
    <div>
      <Encabezado
        titulo="Consulta"
        descripcion="Elija un modelo según el tema, describa el caso y reciba la prescripción del PRV-FCM: qué acciones cambiar y cuánto para llegar al estado deseado."
      />
      <div className="no-imprimir">
        <Seccion titulo="1. Tema y modelo" descripcion="Cada modelo listo de cualquier dataset; el nombre del dataset es el tema.">
          {modelos.isLoading ? (
            <Cargando texto="Buscando modelos entrenados…" />
          ) : modelos.isError ? (
            <Aviso tipo="error">{modelos.error.message}</Aviso>
          ) : !lista.length ? (
            <Vacio titulo="Todavía no hay modelos entrenados">Entrene uno en el paso 3 (Modelo) para poder consultarlo aquí.</Vacio>
          ) : (
            <label className="flex max-w-2xl flex-col gap-1 text-sm">
              <span className="text-tinta">Modelo</span>
              <select className={estiloControl} value={modeloId ?? ''} onChange={(e) => setParams(e.target.value ? { modelo: e.target.value } : {})}>
                <option value="">Elija un tema y un modelo</option>
                {lista.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.tema}: {fecha(m.creado)}, perfil {NOMBRE_PERFIL[(m.opciones.perfil as PerfilModelo | undefined) ?? 'mejorado'].toLowerCase()}
                    {m.opciones.metodo_pesos ? `, ${NOMBRE_METODO[m.opciones.metodo_pesos as MetodoPesos]}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          {modelo.isLoading && <Cargando texto="Cargando el modelo…" />}
          {modelo.isError && <Aviso tipo="error">{modelo.error.message}</Aviso>}
          {listo && <ResumenModelo modelo={modelo.data!} />}
          {modelo.data && !listo && <Aviso tipo="aviso">Este modelo no guardó su esquema o sus resultados; vuelva a entrenarlo para consultarlo.</Aviso>}
        </Seccion>
      </div>
      {listo && <FormularioConsulta key={modelo.data!.id} modelo={modelo.data!} dataset={dataset.data} tema={elegido?.tema ?? ''} />}
    </div>
  );
}
