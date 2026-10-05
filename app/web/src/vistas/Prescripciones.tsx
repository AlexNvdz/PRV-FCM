// Paso 4, motor prescriptivo: qué lograría el AG con los estudiantes de prueba, el detalle
// de cada uno y la prescripción de un perfil de riesgo escrito a mano.
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { api } from '../api';
import { FlujoPasos } from '../componentes/FlujoPasos';
import { GraficaAntesDespues, GraficaConvergencia, GraficaMancuernas } from '../componentes/graficas';
import { Aviso, Boton, Cargando, Clase, Encabezado, estiloControl, Formula, NivelChip, Seccion, Vacio } from '../componentes/ui';
import { useDatasetActivo } from '../contexto';
import { useDataset, useModelo } from '../hooks';
import type { Graficas, Metricas } from '../tipos';
import { clase, entero, firmado, num, pct, pctDe } from '../utilidades';
import { DetalleEstudiante } from './DetalleEstudiante';
import { PerfilRiesgo } from './PerfilRiesgo';

function Aptitud({ m }: { m: Metricas }) {
  const ag = m.configuracion.ag;
  return (
    <details className="mt-6 max-w-4xl rounded-lg border border-linea px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium text-tinta">Cómo decide el algoritmo genético</summary>
      <div className="mt-3 space-y-3">
        <Formula lectura="Función de costo (aptitud) a minimizar: distancia del objetivo a la meta más el costo de intervención, la magnitud media del cambio en las acciones.">
          costo(a) = |A*_T(a) − D_T| + β · media_k |a_k − a_k,actual|
        </Formula>
        <p className="text-xs text-tinta-2">
          Cada cromosoma <span className="font-mono">a</span> es un valor en [0, 1] por acción <Clase letra="P" />. Para evaluarlo, el FCM parte del perfil del estudiante
          con esas acciones y se itera hasta converger: <span className="font-mono">A*_T</span> es la activación final del objetivo <Clase letra="T" /> y{' '}
          <span className="font-mono">D_T</span> la meta (1 = mejor nivel). Los conceptos <Clase letra="S" /> no cambian. Operadores: torneo de {String(ag.tam_torneo)},
          cruce {String(ag.tipo_cruce)} ({String(ag.tasa_cruce)}), mutación gaussiana ({String(ag.tasa_mutacion)}), elitismo de {String(ag.elitismo)}, población{' '}
          {String(ag.tam_poblacion)} y hasta {String(ag.generaciones)} generaciones. Las acciones actuales están en la población inicial: la prescripción nunca es peor que no
          actuar. β = {m.configuracion.prescripcion.beta_esfuerzo} en este entrenamiento.
        </p>
      </div>
    </details>
  );
}

function TablaMetricas({ m }: { m: Metricas }) {
  const p = m.prescripcion;
  const e = m.validacion_externa;
  const filas: [string, string, string, string][] = [
    ['Éxito prescriptivo (PSR, FCM)', pct(p.PSR_base), pct(p.PSR), 'Estudiantes que el FCM ubica en el mejor nivel'],
    ['En el mejor nivel según el bosque aleatorio', pct(e.PSR_externo_base), pct(e.PSR_externo), 'Modelo independiente: la cifra prudente'],
    ['MAE respecto al estado deseado', num(p.MAE_base, 3), num(p.MAE, 3), 'Menor es mejor'],
    ['MSE', num(p.MSE_base, 3), num(p.MSE, 3), ''],
    ['RMSE', num(p.RMSE_base, 3), num(p.RMSE, 3), ''],
  ];
  return (
    <table className="tabular w-full text-sm">
      <thead className="text-left text-xs text-tinta-3">
        <tr>
          <th scope="col" className="pb-2 font-medium">Métrica</th>
          <th scope="col" className="pb-2 text-right font-medium">Acciones actuales</th>
          <th scope="col" className="pb-2 text-right font-medium">Prescritas</th>
          <th scope="col" className="hidden pb-2 pl-6 font-medium md:table-cell">Lectura</th>
        </tr>
      </thead>
      <tbody>
        {filas.map(([nombre, antes, despues, lectura]) => (
          <tr key={nombre} className="border-t border-linea">
            <th scope="row" className="py-2 text-left font-medium">{nombre}</th>
            <td className="py-2 text-right text-tinta-2">{antes}</td>
            <td className="py-2 text-right font-semibold">{despues}</td>
            <td className="hidden py-2 pl-6 text-tinta-3 md:table-cell">{lectura}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Recomendaciones({ modeloId, g, m, alElegir }: { modeloId: string; g: Graficas; m: Metricas; alElegir: (id: number) => void }) {
  const [desde, setDesde] = useState(0);
  const [clasePrescrita, setClase] = useState('');
  const [exito, setExito] = useState<'' | '1' | '0'>('');
  const [orden, setOrden] = useState<{ columna: string; desc: boolean }>({ columna: `${g.objetivo}_fcm_base`, desc: false });
  const cantidad = 20;
  const niveles = Object.entries(g.niveles).sort((a, b) => a[1] - b[1]).map(([n]) => n);
  const consulta = useQuery({
    queryKey: ['recomendaciones', modeloId, desde, clasePrescrita, exito, orden],
    queryFn: () => api.recomendaciones(modeloId, { desde, cantidad, clase: clasePrescrita || undefined, exito: exito === '' ? null : exito === '1', orden: orden.columna, desc: orden.desc }),
    placeholderData: (previo) => previo,
  });
  const pagina = consulta.data;

  function Cabecera({ columna, texto, derecha = false }: { columna: string; texto: string; derecha?: boolean }) {
    const activa = orden.columna === columna;
    return (
      <th scope="col" className={clase('whitespace-nowrap px-3 py-2 font-medium', derecha && 'text-right')} aria-sort={activa ? (orden.desc ? 'descending' : 'ascending') : 'none'}>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-tinta"
          onClick={() => {
            setDesde(0);
            setOrden((o) => ({ columna, desc: o.columna === columna ? !o.desc : true }));
          }}
        >
          {texto}
          {activa && (orden.desc ? <ChevronDown className="size-3" aria-hidden /> : <ChevronUp className="size-3" aria-hidden />)}
        </button>
      </th>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-tinta-2">Nivel observado</span>
          <select className={clase(estiloControl, 'w-32!')} value={clasePrescrita} onChange={(e) => { setClase(e.target.value); setDesde(0); }}>
            <option value="">Todos</option>
            {m.configuracion.prescripcion.clases_a_prescribir.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-tinta-2">Llega al mejor nivel</span>
          <select className={clase(estiloControl, 'w-28!')} value={exito} onChange={(e) => { setExito(e.target.value as '' | '1' | '0'); setDesde(0); }}>
            <option value="">Todos</option>
            <option value="1">Sí</option>
            <option value="0">No</option>
          </select>
        </label>
        {pagina && <span className="ml-auto text-tinta-2">{entero(pagina.total)} estudiantes. Seleccione uno para simular.</span>}
      </div>
      {consulta.isError && <Aviso tipo="error">{consulta.error.message}</Aviso>}
      {pagina && (
        <div className={clase('overflow-x-auto rounded-xl border border-linea bg-hoja', consulta.isFetching && 'opacity-70')}>
          <table className="tabular w-full min-w-[860px] text-sm">
            <thead className="bg-hoja-2 text-left text-xs text-tinta-2">
              <tr>
                <Cabecera columna="id_estudiante" texto="Estudiante" />
                <th scope="col" className="px-3 py-2 font-medium">Observado</th>
                {g.acciones.map((a) => (
                  <Cabecera key={a.columna} columna={`${a.columna}_cambio`} texto={`${a.nombre}`} derecha />
                ))}
                <Cabecera columna={`${g.objetivo}_fcm_base`} texto="FCM actual" derecha />
                <Cabecera columna={`${g.objetivo}_fcm_prescrito`} texto="FCM prescrito" derecha />
              </tr>
            </thead>
            <tbody>
              {pagina.filas.map((f) => (
                <tr key={String(f.id_estudiante)} className="cursor-pointer border-t border-linea hover:bg-hoja-2" onClick={() => alElegir(Number(f.id_estudiante))}>
                  <td className="px-3 py-2">
                    <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={(e) => { e.stopPropagation(); alElegir(Number(f.id_estudiante)); }}>
                      {String(f.id_estudiante)}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <NivelChip nivel={String(f.clase_observada)} niveles={niveles} />
                  </td>
                  {g.acciones.map((a) => {
                    const cambio = Number(f[`${a.columna}_cambio`]);
                    return (
                      <td key={a.columna} className="whitespace-nowrap px-3 py-2 text-right">
                        {num(Number(f[`${a.columna}_actual`]))} → <strong>{num(Number(f[`${a.columna}_recomendado`]))}</strong>
                        <span className="block text-xs text-tinta-3">{Math.abs(cambio) < 1e-6 ? 'igual' : firmado(cambio, 1)}</span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right">
                    {num(Number(f[`${g.objetivo}_fcm_base`]), 3)} <NivelChip nivel={String(f.nivel_base)} niveles={niveles} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {num(Number(f[`${g.objetivo}_fcm_prescrito`]), 3)} <NivelChip nivel={String(f.nivel_prescrito)} niveles={niveles} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagina && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="text-tinta-2">
            {entero(Math.min(desde + 1, pagina.total))}–{entero(Math.min(desde + cantidad, pagina.total))} de {entero(pagina.total)}
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

export function Prescripciones() {
  const { dataset, cargando } = useDatasetActivo();
  const modelo = useModelo(dataset?.modeloActivo);
  const detalle = useDataset(dataset?.id);
  const [estudiante, setEstudiante] = useState<number | null>(null);

  if (cargando || modelo.isLoading) return <Cargando />;
  if (!dataset?.modeloActivo) {
    return (
      <div>
        <FlujoPasos actual={4} compacto />
        <Vacio titulo="Todavía no hay prescripciones" accion={<Link to="/modelo" className="inline-flex h-9 items-center rounded-md bg-boton px-4 text-sm font-medium text-boton-texto">Entrenar el modelo</Link>}>
          Entrene el modelo PRV-FCM (paso 3) para que el algoritmo genético proponga acciones a los estudiantes de prueba.
        </Vacio>
      </div>
    );
  }
  if (modelo.isError || !modelo.data?.metricas || !modelo.data.graficas) return <Aviso tipo="error">No se pudieron cargar los resultados del modelo.</Aviso>;
  const m = modelo.data.metricas;
  const g = modelo.data.graficas;
  const segmentos = Object.entries(m.exito_por_segmento ?? {});

  return (
    <div>
      <FlujoPasos actual={4} compacto />
      <Encabezado
        titulo="Paso 4: motor prescriptivo"
        descripcion={`${entero(m.prescripcion.n_estudiantes)} estudiantes de prueba con nivel ${m.configuracion.prescripcion.clases_a_prescribir.join(' o ')}. Para cada uno, el algoritmo genético busca cómo cambiar sus acciones para llegar a ${g.mejor_nivel}.`}
      />
      <p className="max-w-[62ch] font-serif text-[1.6rem] leading-snug">
        El FCM ubicaría en {g.mejor_nivel} al <span className="resaltado">{pct(m.prescripcion.PSR)}</span>; hoy ubica al {pct(m.prescripcion.PSR_base)}. Un bosque aleatorio lo confirma para el {pct(m.validacion_externa.PSR_externo)}.
      </p>
      <div className="mt-8 max-w-4xl">
        <TablaMetricas m={m} />
        <p className="mt-2 text-xs text-tinta-3">
          Cambio medio por acción: {num(m.prescripcion.cambio_medio_por_accion, 2)} del rango. Generaciones medias del AG: {num(m.prescripcion.generaciones_medias_ag)}. β = {m.configuracion.prescripcion.beta_esfuerzo}.
        </p>
      </div>
      <Aptitud m={m} />

      <Seccion titulo="Qué propone el algoritmo genético">
        <div className="grid gap-6 xl:grid-cols-2">
          <GraficaAntesDespues datos={g.antes_despues} umbral={g.umbral_mejor} mejor={g.mejor_nivel} />
          <GraficaMancuernas
            titulo="Acciones: nivel medio actual y recomendado"
            descripcion="Unidades originales del dataset."
            filas={g.acciones.map((a) => ({ nombre: a.nombre, desde: a.actual_media, hasta: a.recomendada_media, min: a.min, max: a.max }))}
          />
          {segmentos.length > 0 && (
            <GraficaMancuernas
              titulo={`Estudiantes que llegan a ${g.mejor_nivel}, por grupo`}
              descripcion="El FCM frente al bosque aleatorio independiente, con acciones actuales y prescritas."
              dominio={[0, 100]}
              formato={(v) => pct(v)}
              etiquetas={['Acciones actuales', 'Prescritas']}
              filas={segmentos.flatMap(([nombre, s]) => [
                { nombre: `${nombre}: FCM`, desde: s.PSR_base, hasta: s.PSR },
                { nombre: `${nombre}: bosque`, desde: m.validacion_externa.por_segmento[nombre]?.PSR_externo_base ?? 0, hasta: m.validacion_externa.por_segmento[nombre]?.PSR_externo ?? 0 },
              ])}
            />
          )}
          <GraficaConvergencia datos={g.convergencia} />
        </div>
      </Seccion>

      <Seccion titulo="Por estudiante" descripcion={`Probabilidad media del mejor nivel según el bosque: ${pctDe(m.validacion_externa.prob_H_base)} → ${pctDe(m.validacion_externa.prob_H_prescrita)}.`}>
        <Recomendaciones modeloId={modelo.data.id} g={g} m={m} alElegir={setEstudiante} />
      </Seccion>

      <Seccion
        titulo="Perfil de riesgo"
        descripcion="Describa el estado inicial de un individuo, real o hipotético, y elija la meta: el AG calcula qué valores exactos deben tomar las acciones para alcanzarla."
      >
        <PerfilRiesgo modelo={modelo.data} dataset={detalle.data} />
      </Seccion>

      <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-linea pt-6">
        <Link to="/informe" className="inline-flex h-9 items-center gap-2 rounded-md bg-boton px-3.5 text-sm font-medium text-boton-texto hover:opacity-90">
          Continuar al paso 5: visualización y recomendaciones <ArrowRight className="size-4" aria-hidden />
        </Link>
        <span className="text-sm text-tinta-2">Grafo del mapa, convergencia del AG y reporte prescriptivo en lenguaje natural.</span>
      </div>

      {estudiante !== null && <DetalleEstudiante modeloId={modelo.data.id} id={estudiante} graficas={g} alCerrar={() => setEstudiante(null)} />}
    </div>
  );
}
