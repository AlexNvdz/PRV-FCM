// Paso 2, clasificación de nodos: qué papel cumple cada columna en el mapa cognitivo
// (C_T objetivo, C_P acción, C_S sistema) y cómo se codifica.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, RotateCcw, WandSparkles } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { api } from '../api';
import { Aviso, Boton, Clase, estiloControl } from '../componentes/ui';
import { useDatasetActivo } from '../contexto';
import type { Codificacion, ColumnaEsquema, Dataset, Esquema, PerfilColumna, Rol, Validacion } from '../tipos';
import { clase, colorNivel, DESCRIPCION_ROL, NOMBRE_CODIFICACION, rolConNotacion } from '../utilidades';

const ROLES: Rol[] = ['objetivo', 'accion', 'mutable', 'inmutable', 'excluir'];
const CODIFICACIONES: Codificacion[] = ['numerica', 'ordinal', 'nominal', 'one_hot', 'numero_en_texto'];
const MAX_ONE_HOT = 30;

function copia<T>(valor: T): T {
  return JSON.parse(JSON.stringify(valor)) as T;
}

function categoriasDe(perfil?: PerfilColumna) {
  if (!perfil) return [];
  return perfil.sugerencia.orden ?? (perfil.categorias ?? []).map((c) => c.valor).sort((a, b) => a.localeCompare(b, 'es'));
}

/** Conceptos que tendrá el mapa, numerados como los numera el motor: por rol y con un concepto por categoría one-hot. */
function conceptosPrevistos(esquema: Esquema) {
  const orden: Rol[] = ['inmutable', 'accion', 'mutable', 'objetivo'];
  const usadas = esquema.columnas.filter((c) => c.rol !== 'excluir').sort((a, b) => orden.indexOf(a.rol) - orden.indexOf(b.rol));
  const conservar = usadas.every((c) => c.id) && new Set(usadas.map((c) => c.id)).size === usadas.length && !usadas.some((c) => c.codificacion === 'one_hot');
  const salida: { id: string; nombre: string; rol: Rol }[] = [];
  for (const c of usadas) {
    const nombre = c.nombre || c.columna;
    if (c.codificacion === 'one_hot') {
      for (const categoria of c.categorias ?? []) salida.push({ id: `C${salida.length + 1}`, nombre: `${nombre}: ${categoria}`, rol: c.rol });
    } else {
      salida.push({ id: conservar ? c.id! : `C${salida.length + 1}`, nombre, rol: c.rol });
    }
  }
  return salida;
}

function ResumenClasificacion({ esquema }: { esquema: Esquema }) {
  const conceptos = conceptosPrevistos(esquema);
  const grupos: { clave: string; titulo: ReactNode; roles: Rol[] }[] = [
    { clave: 'T', titulo: <>Objetivo <Clase letra="T" /></>, roles: ['objetivo'] },
    { clave: 'P', titulo: <>Acciones <Clase letra="P" /></>, roles: ['accion'] },
    { clave: 'S', titulo: <>Sistema <Clase letra="S" /></>, roles: ['mutable', 'inmutable'] },
  ];
  const excluidas = esquema.columnas.filter((c) => c.rol === 'excluir').length;
  return (
    <div>
      <h3 className="font-serif text-lg font-semibold">Clasificación PRV-FCM</h3>
      <p className="mt-2 text-sm text-tinta-2">
        {conceptos.length} conceptos en el mapa{excluidas ? `; ${excluidas} ${excluidas === 1 ? 'columna excluida' : 'columnas excluidas'}` : ''}.
      </p>
      <dl className="mt-3 space-y-3 text-sm">
        {grupos.map((g) => {
          const del = conceptos.filter((c) => g.roles.includes(c.rol));
          return (
            <div key={g.clave}>
              <dt className="font-medium text-tinta">
                {g.titulo}: {del.length}
                {g.clave === 'S' && del.length > 0 && (
                  <span className="font-normal text-tinta-2">
                    {' '}
                    ({del.filter((c) => c.rol === 'inmutable').length} inmutables, {del.filter((c) => c.rol === 'mutable').length} mutables)
                  </span>
                )}
              </dt>
              <dd className="mt-1 text-xs leading-relaxed text-tinta-2">{del.length ? del.map((c) => `${c.id} ${c.nombre}`).join(', ') : 'Ninguno'}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function Orden({ orden, alCambiar, etiqueta }: { orden: string[]; alCambiar: (orden: string[]) => void; etiqueta: string }) {
  function mover(indice: number, paso: number) {
    const nuevo = [...orden];
    const destino = indice + paso;
    [nuevo[indice], nuevo[destino]] = [nuevo[destino], nuevo[indice]];
    alCambiar(nuevo);
  }
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={etiqueta}>
      {orden.map((valor, i) => (
        <li key={valor} className="inline-flex items-center rounded-full border border-linea bg-hoja text-xs">
          <button type="button" className="rounded-l-full px-1.5 py-1 text-tinta-3 hover:text-tinta disabled:opacity-30" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Mover ${valor} antes`}>
            <ArrowLeft className="size-3" aria-hidden />
          </button>
          <span className="px-1 text-tinta">{valor}</span>
          <button type="button" className="rounded-r-full px-1.5 py-1 text-tinta-3 hover:text-tinta disabled:opacity-30" disabled={i === orden.length - 1} onClick={() => mover(i, 1)} aria-label={`Mover ${valor} después`}>
            <ArrowRight className="size-3" aria-hidden />
          </button>
        </li>
      ))}
    </ol>
  );
}

export function EditorEsquema({ dataset }: { dataset: Dataset }) {
  const cliente = useQueryClient();
  const { elegirDataset } = useDatasetActivo();
  const perfiles = useMemo(() => new Map((dataset.perfil?.perfil ?? []).map((p) => [p.columna, p])), [dataset.perfil]);
  const [borrador, setBorrador] = useState<Esquema>(() => copia(dataset.esquema ?? dataset.perfil!.esquema_sugerido));
  const [validacion, setValidacion] = useState<Validacion | undefined>(dataset.validacion);
  const [avisosIA, setAvisosIA] = useState<string[]>([]);
  const [guardado, setGuardado] = useState(false);
  const modificado = JSON.stringify(borrador) !== JSON.stringify(dataset.esquema);

  useEffect(() => {
    if (!modificado) {
      setValidacion(dataset.validacion);
      return;
    }
    const temporizador = setTimeout(() => {
      api.validarEsquema(dataset.id, borrador).then(setValidacion).catch(() => {});
    }, 500);
    return () => clearTimeout(temporizador);
  }, [borrador, dataset.id, dataset.validacion, modificado]);

  const guardar = useMutation({
    mutationFn: () => api.guardarEsquema(dataset.id, borrador),
    onSuccess: async () => {
      setGuardado(true);
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ['dataset', dataset.id] }),
        cliente.invalidateQueries({ queryKey: ['datasets'] }),
      ]);
    },
    onError: (error) => {
      const datos = (error as { datos?: { validacion?: Validacion } }).datos;
      if (datos?.validacion) setValidacion(datos.validacion);
    },
  });

  const sugerir = useMutation({
    mutationFn: () => api.sugerirEsquema(dataset.id),
    onSuccess: (respuesta) => {
      setBorrador(respuesta.esquema);
      setValidacion(respuesta.validacion);
      setAvisosIA(respuesta.avisos);
    },
  });

  function actualizar(columna: string, cambio: (c: ColumnaEsquema) => ColumnaEsquema) {
    setGuardado(false);
    setBorrador((actual) => ({ ...actual, columnas: actual.columnas.map((c) => (c.columna === columna ? cambio({ ...c }) : c)) }));
  }

  function cambiarRol(columna: string, rol: Rol) {
    setGuardado(false);
    setBorrador((actual) => {
      const perfil = perfiles.get(columna);
      const columnas = actual.columnas.map((c) => {
        if (c.columna !== columna) return rol === 'objetivo' && c.rol === 'objetivo' ? { ...c, rol: 'inmutable' as Rol } : c;
        const nueva: ColumnaEsquema = { ...c, rol };
        if (rol !== 'excluir' && !nueva.codificacion && perfil) Object.assign(nueva, copia(perfil.sugerencia));
        if (rol === 'objetivo' && (nueva.codificacion === 'nominal' || nueva.codificacion === 'numero_en_texto' || nueva.codificacion === 'one_hot')) {
          nueva.codificacion = 'ordinal';
          nueva.orden = categoriasDe(perfil);
          delete nueva.categorias;
        }
        if (rol === 'accion' && nueva.codificacion === 'one_hot') {
          // Una acción no puede ser one-hot ni nominal: el AG cambia un solo valor ordenado por acción.
          const sugerida: Codificacion = perfil?.sugerencia.codificacion ?? 'numerica';
          nueva.codificacion = sugerida === 'nominal' || sugerida === 'one_hot' ? 'ordinal' : sugerida;
          if (nueva.codificacion === 'ordinal') nueva.orden = categoriasDe(perfil);
          delete nueva.categorias;
        }
        if (rol === 'mutable' && nueva.dinamico === undefined) nueva.dinamico = false;
        return nueva;
      });
      const objetivo = columnas.find((c) => c.rol === 'objetivo')?.columna ?? null;
      return { ...actual, columnas, objetivo };
    });
  }

  function cambiarCodificacion(columna: string, codificacion: Codificacion) {
    actualizar(columna, (c) => {
      c.codificacion = codificacion;
      if (codificacion === 'ordinal' && !c.orden?.length) c.orden = categoriasDe(perfiles.get(columna));
      if (codificacion !== 'ordinal') delete c.orden;
      if (codificacion === 'one_hot') {
        c.categorias = (perfiles.get(columna)?.categorias ?? []).map((v) => v.valor).sort((a, b) => a.localeCompare(b, 'es'));
        c.dinamico = c.rol === 'mutable' ? false : c.dinamico;
      } else {
        delete c.categorias;
      }
      return c;
    });
  }

  const objetivo = borrador.columnas.find((c) => c.rol === 'objetivo');
  const segmentables = borrador.columnas.filter((c) => c.rol !== 'objetivo' && (perfiles.get(c.columna)?.categorias?.length ?? 0) > 1);
  const valoresSegmento = borrador.segmento ? (perfiles.get(borrador.segmento.columna)?.categorias ?? []).map((c) => c.valor) : [];

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-linea bg-papel/95 px-4 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {validacion?.ok ? (
              <Aviso tipo="ok">
                Esquema válido: {validacion.filas_utiles.toLocaleString('es-CO')} filas útiles.
                {!modificado && dataset.esquemaConfirmado && ' Guardado.'}
                {modificado && ' Cambios sin guardar.'}
              </Aviso>
            ) : (
              <Aviso tipo="error">{validacion?.errores.length ?? 0} problemas que resolver antes de guardar.</Aviso>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Boton icono={<WandSparkles className="size-4" aria-hidden />} cargando={sugerir.isPending} onClick={() => sugerir.mutate()}>
              {sugerir.isPending ? 'Consultando a qwen2.5…' : 'Sugerir con IA'}
            </Boton>
            <Boton variante="fantasma" icono={<RotateCcw className="size-4" aria-hidden />} disabled={!modificado} onClick={() => setBorrador(copia(dataset.esquema ?? dataset.perfil!.esquema_sugerido))}>
              Descartar cambios
            </Boton>
            <Boton variante="principal" cargando={guardar.isPending} disabled={!validacion?.ok || (!modificado && dataset.esquemaConfirmado)} onClick={() => guardar.mutate()}>
              Guardar esquema
            </Boton>
          </div>
        </div>
        {(validacion?.errores.length || validacion?.avisos.length || avisosIA.length || sugerir.isError || guardar.isError) ? (
          <div className="mt-3 space-y-1.5">
            {validacion?.errores.map((e) => (
              <Aviso key={e} tipo="error">
                {e}
              </Aviso>
            ))}
            {[...(validacion?.avisos ?? []), ...avisosIA].map((a) => (
              <Aviso key={a} tipo="aviso">
                {a}
              </Aviso>
            ))}
            {sugerir.isError && <Aviso tipo="error">{sugerir.error.message}</Aviso>}
            {guardar.isError && !validacion?.errores.length && <Aviso tipo="error">{guardar.error.message}</Aviso>}
          </div>
        ) : null}
        {guardado && !modificado && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Aviso tipo="ok">Clasificación guardada. El paso 3 entrena el mapa con estos conceptos.</Aviso>
            <Link
              to="/modelo"
              onClick={() => elegirDataset(dataset.id)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-boton px-3.5 text-sm font-medium text-boton-texto hover:opacity-90"
            >
              Continuar al paso 3: entrenar el FCM <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        )}
      </div>

      <section className="grid gap-8 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1fr)_300px_320px]">
        <div>
          <h3 className="font-serif text-lg font-semibold">Objetivo</h3>
          {!objetivo ? (
            <p className="mt-2 text-sm text-tinta-2">Elija en la tabla la columna que mide el rendimiento o la deserción.</p>
          ) : objetivo.codificacion === 'ordinal' && objetivo.orden ? (
            <div className="mt-2">
              <p className="text-sm text-tinta-2">
                Ordene los niveles de <strong className="text-tinta">{objetivo.columna}</strong> del peor al mejor desenlace. El último es el estado deseado de la prescripción.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-tinta-3">Peor</span>
                <Orden orden={objetivo.orden} etiqueta={`Niveles de ${objetivo.columna}`} alCambiar={(orden) => actualizar(objetivo.columna, (c) => ({ ...c, orden }))} />
                <span className="text-xs text-tinta-3">Mejor</span>
              </div>
              <div className="mt-3 flex gap-1" aria-hidden>
                {objetivo.orden.map((n, i) => (
                  <span key={n} className="h-1.5 w-10 rounded-full" style={{ background: colorNivel(i, objetivo.orden!.length) }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-2 text-sm text-tinta-2">
              <p>
                <strong className="text-tinta">{objetivo.columna}</strong> es numérico: se normaliza a [0, 1] y se agrupa en tres niveles (bajo, medio y alto).
              </p>
              <label className="inline-flex items-center gap-2 text-tinta">
                <input
                  type="checkbox"
                  checked={Boolean(borrador.invertir_objetivo)}
                  onChange={(e) => setBorrador((b) => ({ ...b, invertir_objetivo: e.target.checked }))}
                  className="size-4 accent-[var(--pizarra)]"
                />
                Un valor menor es mejor (por ejemplo, riesgo de deserción)
              </label>
            </div>
          )}
        </div>
        <div>
          <h3 className="font-serif text-lg font-semibold">Comparar por grupo</h3>
          <p className="mt-2 text-sm text-tinta-2">Opcional: separa el éxito de la prescripción entre estudiantes con un valor y el resto.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select
              aria-label="Columna del segmento"
              className={estiloControl}
              value={borrador.segmento?.columna ?? ''}
              onChange={(e) => {
                const columna = e.target.value;
                const valor = perfiles.get(columna)?.categorias?.[0]?.valor ?? '';
                setBorrador((b) => ({
                  ...b,
                  segmento: columna ? { columna, valor, nombre_si: `${columna} = ${valor}`, nombre_no: `${columna} ≠ ${valor}` } : null,
                }));
              }}
            >
              <option value="">Sin segmento</option>
              {segmentables.map((c) => (
                <option key={c.columna} value={c.columna}>
                  {c.nombre ?? c.columna}
                </option>
              ))}
            </select>
            <select
              aria-label="Valor del segmento"
              className={estiloControl}
              disabled={!borrador.segmento}
              value={borrador.segmento?.valor ?? ''}
              onChange={(e) =>
                setBorrador((b) =>
                  b.segmento
                    ? { ...b, segmento: { ...b.segmento, valor: e.target.value, nombre_si: `${b.segmento.columna} = ${e.target.value}`, nombre_no: `${b.segmento.columna} ≠ ${e.target.value}` } }
                    : b,
                )
              }
            >
              {valoresSegmento.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ResumenClasificacion esquema={borrador} />
      </section>

      <section className="mt-10">
        <h3 className="font-serif text-lg font-semibold">Columnas</h3>
        <p className="mt-1 max-w-[72ch] text-sm text-tinta-2">
          Clasifique cada columna en una de las clases de PRV-FCM: objetivo <Clase letra="T" />, acción o concepto prescriptivo <Clase letra="P" /> y
          concepto del sistema <Clase letra="S" />, que puede ser inmutable o mutable. El modelo espera esta confirmación antes de entrenar.
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-tinta-2 sm:grid-cols-2 xl:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r}>
              <dt className="inline font-semibold text-tinta">{rolConNotacion(r)}: </dt>
              <dd className="inline">{DESCRIPCION_ROL[r]}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="text-left text-xs text-tinta-3">
              <tr>
                <th scope="col" className="pb-2 font-medium">Columna</th>
                <th scope="col" className="pb-2 font-medium">Rol</th>
                <th scope="col" className="pb-2 font-medium">Nombre visible</th>
                <th scope="col" className="pb-2 font-medium">Codificación</th>
                <th scope="col" className="pb-2 font-medium">Orden (menor a mayor) o categorías</th>
                <th scope="col" className="pb-2 font-medium">
                  <abbr title="Se actualiza durante la inferencia en vez de conservar su valor observado" className="no-underline">
                    Dinámico
                  </abbr>
                </th>
              </tr>
            </thead>
            <tbody>
              {borrador.columnas.map((c) => {
                const perfil = perfiles.get(c.columna);
                const excluida = c.rol === 'excluir';
                return (
                  <tr key={c.columna} className={clase('border-t border-linea align-top', excluida && 'text-tinta-3')}>
                    <td className="py-2.5 pr-3">
                      <span className="font-medium text-tinta">{c.columna}</span>
                      {perfil && (
                        <span className="mt-0.5 block max-w-[220px] text-xs text-tinta-3">
                          {perfil.tipo_dato === 'numerico'
                            ? `Número de ${perfil.min?.toLocaleString('es-CO')} a ${perfil.max?.toLocaleString('es-CO')}`
                            : `${perfil.unicos} categorías: ${perfil.ejemplos.slice(0, 3).join(', ')}${perfil.unicos > 3 ? '…' : ''}`}
                          {perfil.faltantes > 0 && `, ${perfil.faltantes} vacíos`}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <select aria-label={`Rol de ${c.columna}`} className={clase(estiloControl, 'w-[11.5rem]!')} value={c.rol} onChange={(e) => cambiarRol(c.columna, e.target.value as Rol)}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {rolConNotacion(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 pr-3">
                      <input
                        aria-label={`Nombre visible de ${c.columna}`}
                        className={clase(estiloControl, 'w-48!')}
                        value={c.nombre ?? ''}
                        placeholder={c.columna}
                        disabled={excluida}
                        onChange={(e) => actualizar(c.columna, (x) => ({ ...x, nombre: e.target.value }))}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <select
                        aria-label={`Codificación de ${c.columna}`}
                        className={clase(estiloControl, 'w-[15rem]!')}
                        value={c.codificacion ?? 'numerica'}
                        disabled={excluida}
                        onChange={(e) => cambiarCodificacion(c.columna, e.target.value as Codificacion)}
                      >
                        {CODIFICACIONES.map((o) => {
                          // One-hot solo en conceptos del sistema y con una lista de categorías manejable.
                          const sinOneHot = o === 'one_hot' && (c.rol === 'accion' || c.rol === 'objetivo' || !perfil?.categorias || perfil.unicos > MAX_ONE_HOT);
                          return (
                            <option key={o} value={o} disabled={sinOneHot}>
                              {NOMBRE_CODIFICACION[o]}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td className="py-2.5 pr-3">
                      {!excluida && c.codificacion === 'ordinal' && c.orden ? (
                        <Orden orden={c.orden} etiqueta={`Orden de ${c.columna}`} alCambiar={(orden) => actualizar(c.columna, (x) => ({ ...x, orden }))} />
                      ) : !excluida && c.codificacion === 'one_hot' && c.categorias ? (
                        <span className="block max-w-[320px] text-xs text-tinta-2">
                          {c.categorias.length} conceptos 0/1: {c.categorias.slice(0, 8).join(', ')}
                          {c.categorias.length > 8 ? '…' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-tinta-3">—</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {c.rol === 'mutable' && c.codificacion !== 'one_hot' ? (
                        <input
                          type="checkbox"
                          aria-label={`${c.columna} se actualiza en la inferencia`}
                          checked={Boolean(c.dinamico)}
                          onChange={(e) => actualizar(c.columna, (x) => ({ ...x, dinamico: e.target.checked }))}
                          className="mt-2.5 size-4 accent-[var(--pizarra)]"
                        />
                      ) : (
                        <span className="text-xs text-tinta-3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
