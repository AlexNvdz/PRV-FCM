// Paso 5, visualización y recomendaciones: reporte prescriptivo en lenguaje natural del
// conjunto de prueba, recomendaciones redactadas con qwen2.5, grafo del mapa (NetworkX y
// matplotlib), convergencia del AG y el resto de figuras.
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { api } from '../api';
import { FlujoPasos } from '../componentes/FlujoPasos';
import { GraficaConvergencia, GraficaMancuernas } from '../componentes/graficas';
import { RedaccionIA } from '../componentes/RedaccionIA';
import { Aviso, Cargando, Encabezado, estiloControl, NivelChip, Seccion, Vacio } from '../componentes/ui';
import { useDatasetActivo } from '../contexto';
import { useModelo } from '../hooks';
import { entero, NOMBRE_METODO, num, pct } from '../utilidades';
import { DetalleEstudiante } from './DetalleEstudiante';

const FIGURAS: Record<string, { titulo: string; descripcion: string }> = {
  'red_fcm.png': {
    titulo: 'Mapa cognitivo como grafo dirigido',
    descripcion: 'NetworkX y matplotlib: nodos por clase de concepto y aristas con grosor proporcional a |w|; azul acerca al mejor nivel y rojo aleja.',
  },
  'convergencia_ag.png': {
    titulo: 'Convergencia del algoritmo genético',
    descripcion: 'Mejor costo por generación: mediana y rango intercuartílico entre los estudiantes prescritos.',
  },
  'rendimiento_antes_despues.png': { titulo: 'Objetivo antes y después de prescribir', descripcion: 'Activación que infiere el FCM con las acciones actuales y con las prescritas.' },
  'pesos_fcm.png': { titulo: 'Matriz de pesos aprendida', descripcion: 'Pesos w_ji hacia los conceptos dinámicos (origen en filas, destino en columnas).' },
  'acciones_recomendadas.png': { titulo: 'Acciones: media actual y recomendada', descripcion: 'Unidades originales del dataset.' },
  'seleccion_hiperparametros.png': { titulo: 'Selección de λ por validación cruzada', descripcion: 'Exactitud media de validación para cada combinación de λ y α.' },
};

function Figura({ modeloId, nombre }: { modeloId: string; nombre: string }) {
  const info = FIGURAS[nombre] ?? { titulo: nombre, descripcion: '' };
  const url = api.urlFigura(modeloId, nombre);
  return (
    <figure className="rounded-xl border border-linea bg-superficie-grafica p-4">
      <figcaption className="mb-3 flex items-start justify-between gap-3">
        <span>
          <span className="block text-[0.98rem] font-semibold text-tinta">{info.titulo}</span>
          <span className="mt-0.5 block text-sm text-tinta-2">{info.descripcion}</span>
        </span>
        <a href={url} download={nombre} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-tinta-2 hover:bg-hoja-2 hover:text-tinta">
          <Download className="size-3.5" aria-hidden />
          PNG
        </a>
      </figcaption>
      <img src={url} alt={`${info.titulo}. ${info.descripcion}`} loading="lazy" className="w-full rounded-md bg-[#fcfcfb]" />
    </figure>
  );
}

export function Informe() {
  const { dataset, cargando } = useDatasetActivo();
  const modelo = useModelo(dataset?.modeloActivo);
  const [nivel, setNivel] = useState('');
  const [estudiante, setEstudiante] = useState<number | null>(null);
  const modeloId = modelo.data?.estado === 'listo' ? modelo.data.id : null;
  const resumen = useQuery({
    queryKey: ['resumen-prescripciones', modeloId, nivel],
    queryFn: () => api.resumenPrescripciones(modeloId!, nivel || null),
    enabled: Boolean(modeloId),
    placeholderData: (previo) => previo,
  });

  if (cargando || modelo.isLoading) return <Cargando />;
  if (!dataset?.modeloActivo || !modelo.data?.metricas || !modelo.data.graficas) {
    return (
      <div>
        <FlujoPasos actual={5} compacto />
        <Vacio titulo="Todavía no hay un modelo entrenado" accion={<Link to="/modelo" className="inline-flex h-9 items-center rounded-md bg-boton px-4 text-sm font-medium text-boton-texto">Ir al paso 3</Link>}>
          El informe muestra el grafo del mapa, la convergencia del algoritmo genético y las recomendaciones del modelo activo.
        </Vacio>
      </div>
    );
  }
  const m = modelo.data.metricas;
  const g = modelo.data.graficas;
  const niveles = Object.entries(g.niveles).sort((a, b) => a[1] - b[1]).map(([n]) => n);
  const figuras = g.figuras ?? [];
  const r = resumen.data;
  const rangos = new Map(g.acciones.map((a) => [a.columna, a]));

  return (
    <div>
      <FlujoPasos actual={5} compacto />
      <Encabezado
        titulo="Paso 5: visualización y recomendaciones"
        descripcion={
          <>
            Modelo de <strong className="text-tinta">{dataset.nombre}</strong> con pesos por {NOMBRE_METODO[m.configuracion.fcm.metodo_pesos ?? 'bptt']} (λ ={' '}
            {num(m.configuracion.fcm.lambda_, 2)}): exactitud en prueba {pct(100 * m.prediccion_fcm.exactitud_rendimiento)}.
          </>
        }
        acciones={
          <a href={api.urlRecomendacionesCsv(modelo.data.id)} className="inline-flex h-9 items-center gap-2 rounded-md border border-linea bg-hoja px-3.5 text-sm font-medium text-tinta hover:bg-hoja-2">
            <Download className="size-4" aria-hidden />
            Recomendaciones (CSV)
          </a>
        }
      />

      <Seccion titulo="Reporte prescriptivo" descripcion="Los cambios que el algoritmo genético propone a los estudiantes de prueba, traducidos a frases. Cada cifra sale de las prescripciones.">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="nivel-informe" className="text-tinta-2">
            Nivel observado
          </label>
          <select id="nivel-informe" className={`${estiloControl} w-[10rem]!`} value={nivel} onChange={(e) => setNivel(e.target.value)}>
            <option value="">Todos</option>
            {m.configuracion.prescripcion.clases_a_prescribir.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        {resumen.isError && <Aviso tipo="error">{resumen.error.message}</Aviso>}
        {!r && resumen.isLoading && <Cargando texto="Resumiendo las prescripciones…" />}
        {r && (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="space-y-5">
              <p className="max-w-[70ch] font-serif text-[1.15rem] leading-relaxed text-tinta">{r.texto}</p>
              {r.nota && <p className="text-xs text-tinta-3">{r.nota}</p>}
              <table className="tabular w-full text-sm">
                <caption className="mb-2 text-left text-sm font-semibold">Qué cambia en cada acción</caption>
                <thead className="text-left text-xs text-tinta-3">
                  <tr>
                    <th scope="col" className="pb-1 font-medium">Acción</th>
                    <th scope="col" className="pb-1 text-right font-medium">Media actual</th>
                    <th scope="col" className="pb-1 text-right font-medium">Media recomendada</th>
                    <th scope="col" className="pb-1 text-right font-medium">Aumenta en</th>
                    <th scope="col" className="pb-1 text-right font-medium">Sin cambio en</th>
                  </tr>
                </thead>
                <tbody>
                  {r.acciones.map((a) => (
                    <tr key={a.columna} className="border-t border-linea">
                      <th scope="row" className="py-1.5 text-left font-normal">{a.nombre}</th>
                      <td className="py-1.5 text-right">{num(a.actual_media, a.decimales)}</td>
                      <td className="py-1.5 text-right font-medium">{num(a.recomendada_media, a.decimales)}</td>
                      <td className="py-1.5 text-right">{pct(a.pct_aumenta, 0)}</td>
                      <td className="py-1.5 text-right">{pct(a.pct_igual, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.por_nivel.length > 1 && (
                <table className="tabular w-full text-sm">
                  <caption className="mb-2 text-left text-sm font-semibold">Por nivel observado</caption>
                  <thead className="text-left text-xs text-tinta-3">
                    <tr>
                      <th scope="col" className="pb-1 font-medium">Nivel</th>
                      <th scope="col" className="pb-1 text-right font-medium">Registros</th>
                      <th scope="col" className="pb-1 text-right font-medium">Activación actual</th>
                      <th scope="col" className="pb-1 text-right font-medium">Con la prescripción</th>
                      <th scope="col" className="pb-1 text-right font-medium">Llegan a {g.mejor_nivel}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.por_nivel.map((p) => (
                      <tr key={p.nivel} className="border-t border-linea">
                        <th scope="row" className="py-1.5 text-left font-normal">
                          <NivelChip nivel={p.nivel} niveles={niveles} />
                        </th>
                        <td className="py-1.5 text-right">{entero(p.n)}</td>
                        <td className="py-1.5 text-right">{num(p.activacion_base, 3)}</td>
                        <td className="py-1.5 text-right">{num(p.activacion_prescrita, 3)}</td>
                        <td className="py-1.5 text-right font-medium">{pct(p.pct_exito)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div>
                <p className="text-sm font-semibold">Estudiantes con más mejora</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {r.ejemplos.map((e) => (
                    <li key={e.id_estudiante}>
                      <button type="button" onClick={() => setEstudiante(e.id_estudiante)} className="inline-flex items-center gap-1.5 rounded-full border border-linea bg-hoja px-3 py-1 text-sm hover:bg-hoja-2">
                        Estudiante {e.id_estudiante}: <NivelChip nivel={e.nivel_observado} niveles={niveles} /> → <NivelChip nivel={e.nivel_prescrito} niveles={niveles} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="space-y-6">
              <GraficaMancuernas
                titulo={nivel ? `Acciones del nivel ${nivel}: media actual y recomendada` : 'Acciones: media actual y recomendada'}
                descripcion="Unidades originales del dataset."
                filas={r.acciones.map((a) => ({ nombre: a.nombre, desde: a.actual_media, hasta: a.recomendada_media, min: rangos.get(a.columna)?.min, max: rangos.get(a.columna)?.max }))}
              />
              <RedaccionIA
                key={nivel}
                modeloId={modelo.data.id}
                pedido={{ tipo: 'poblacion', nivel: nivel || null }}
                titulo="Recomendaciones institucionales con IA"
                descripcion="qwen2.5 redacta un plan para docentes y directivos a partir de este resumen. Revíselo antes de compartirlo."
              />
            </div>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Grafo del mapa cognitivo" descripcion="Generado con NetworkX y matplotlib al entrenar; el mapa interactivo está en el paso 3.">
        {figuras.includes('red_fcm.png') ? (
          <div className="max-w-4xl">
            <Figura modeloId={modelo.data.id} nombre="red_fcm.png" />
          </div>
        ) : (
          <Aviso tipo="aviso">Este modelo se entrenó antes de que existieran las figuras del informe. Vuelva a entrenarlo en el paso 3 para generarlas.</Aviso>
        )}
      </Seccion>

      <Seccion titulo="Convergencia del algoritmo genético" descripcion="Cómo baja el costo generación a generación: la versión interactiva y la figura de matplotlib.">
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <GraficaConvergencia datos={g.convergencia} />
          {figuras.includes('convergencia_ag.png') && <Figura modeloId={modelo.data.id} nombre="convergencia_ag.png" />}
        </div>
      </Seccion>

      {figuras.filter((f) => f !== 'red_fcm.png' && f !== 'convergencia_ag.png').length > 0 && (
        <Seccion titulo="Otras figuras del informe" descripcion="PNG listos para un documento o una presentación.">
          <div className="grid items-start gap-6 xl:grid-cols-2">
            {figuras
              .filter((f) => f !== 'red_fcm.png' && f !== 'convergencia_ag.png')
              .map((f) => (
                <Figura key={f} modeloId={modelo.data!.id} nombre={f} />
              ))}
          </div>
        </Seccion>
      )}

      {estudiante !== null && <DetalleEstudiante modeloId={modelo.data.id} id={estudiante} graficas={g} alCerrar={() => setEstudiante(null)} />}
    </div>
  );
}
