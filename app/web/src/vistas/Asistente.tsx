// Asistente: conversación con qwen2.5 (Ollama) sobre los datos y el modelo PRV-FCM activos.
import { ArrowUp, CircleAlert, CircleCheck, LoaderCircle, Plus, Square } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSearchParams } from 'react-router';
import remarkGfm from 'remark-gfm';

import { conversar } from '../api';
import { GraficaDivergente, GraficaMancuernas, GraficaVariable } from '../componentes/graficas';
import { GraficaDispersion, MapaCalor } from '../componentes/relaciones';
import { Aviso, Boton, NivelChip } from '../componentes/ui';
import { useDatasetActivo } from '../contexto';
import { nivelesDe } from '../hooks';
import type { EventoChat, Prescripcion, Simulacion } from '../tipos';
import { clase, firmado, num } from '../utilidades';

type Artefacto = Extract<EventoChat, { tipo: 'grafica' | 'estudiante' | 'simulacion' | 'perfil' }>;
type Consulta = { nombre: string; argumentos: Record<string, unknown>; ok?: boolean; error?: string };

interface Mensaje {
  id: string;
  rol: 'usuario' | 'asistente';
  contenido: string;
  consultas?: Consulta[];
  artefactos?: Artefacto[];
  estado?: string;
  error?: string;
}

const NOMBRES_HERRAMIENTA: Record<string, (a: Record<string, unknown>) => string> = {
  resumen_datos: () => 'Resumen de los datos',
  resumen_modelo: () => 'Métricas del modelo',
  influencias_fcm: () => 'Pesos del mapa cognitivo',
  estadisticas_variable: (a) => `Estadísticas de ${String(a.columna ?? 'una variable')}`,
  buscar_estudiantes: () => 'Búsqueda de estudiantes',
  analizar_estudiante: (a) => `Análisis del estudiante ${String(a.id_estudiante ?? a.id ?? '')}`,
  simular_escenario: (a) => `Simulación del estudiante ${String(a.id_estudiante ?? a.id ?? '')}`,
  prescribir_perfil: () => 'Prescripción de un perfil de riesgo',
  resumen_prescripciones: (a) => `Resumen de las prescripciones${a.nivel ? ` del nivel ${String(a.nivel)}` : ''}`,
  correlaciones_variables: () => 'Correlaciones entre variables',
  relacion_variables: (a) => `Relación entre ${String(a.x ?? '')} y ${String(a.y ?? '')}`,
};

const MAX_GUARDADOS = 30;
const nuevoId = () => Math.random().toString(36).slice(2, 10);

function leerHistorial(clave: string): Mensaje[] {
  try {
    return JSON.parse(localStorage.getItem(clave) ?? '[]') as Mensaje[];
  } catch {
    return [];
  }
}

function TablaAcciones({ filas, antes, despues }: { filas: { nombre: string; celdas: string[]; igual: boolean[] }[]; antes: string[]; despues?: string[] }) {
  return (
    <table className="tabular w-full text-sm">
      <thead className="text-left text-xs text-tinta-3">
        <tr>
          <th scope="col" className="pb-1 font-medium">Acción</th>
          {[...antes, ...(despues ?? [])].map((t) => (
            <th key={t} scope="col" className="pb-1 text-right font-medium">
              {t}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.nombre} className="border-t border-linea">
            <th scope="row" className="py-1.5 text-left font-normal text-tinta">{f.nombre}</th>
            {f.celdas.map((c, i) => (
              <td key={i} className={clase('py-1.5 text-right', i > 0 && !f.igual[i] && 'font-semibold', i > 0 && f.igual[i] && 'text-tinta-3')}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TarjetaEstudiante({ id, prescripcion, maxima, niveles }: { id: number; prescripcion: Prescripcion; maxima?: Prescripcion; niveles: string[] }) {
  const valor = (v: { valor: number; categoria?: string }) => v.categoria ?? num(v.valor);
  return (
    <div className="rounded-xl border border-linea bg-hoja p-4">
      <p className="text-sm font-semibold">Estudiante {id}</p>
      <p className="mt-1 text-sm text-tinta-2">
        Hoy <NivelChip nivel={prescripcion.base.nivel} niveles={niveles} />, con el plan moderado <NivelChip nivel={prescripcion.prescrito.nivel} niveles={niveles} />
        {maxima && (
          <>
            , con el plan máximo <NivelChip nivel={maxima.prescrito.nivel} niveles={niveles} />
          </>
        )}
        .
      </p>
      <div className="mt-3">
        <TablaAcciones
          antes={['Actual', 'Moderado']}
          despues={maxima ? ['Máximo'] : undefined}
          filas={prescripcion.acciones.map((a, i) => {
            const m = maxima?.acciones[i];
            return {
              nombre: a.nombre,
              celdas: [valor(a.actual), valor(a.recomendada), ...(m ? [valor(m.recomendada)] : [])],
              igual: [true, Math.abs(a.cambio) < 1e-6, ...(m ? [Math.abs(m.cambio) < 1e-6] : [])],
            };
          })}
        />
      </div>
    </div>
  );
}

function TarjetaSimulacion({ id, simulacion, niveles }: { id: number; simulacion: Simulacion; niveles: string[] }) {
  const valor = (v: { valor: number; categoria?: string }) => v.categoria ?? num(v.valor);
  return (
    <div className="rounded-xl border border-linea bg-hoja p-4">
      <p className="text-sm font-semibold">Simulación del estudiante {id}</p>
      <p className="mt-1 text-sm text-tinta-2">
        <NivelChip nivel={simulacion.base.nivel} niveles={niveles} /> ({num(simulacion.base.activacion, 3)}) pasa a{' '}
        <NivelChip nivel={simulacion.simulado.nivel} niveles={niveles} /> ({num(simulacion.simulado.activacion, 3)}), {firmado(simulacion.simulado.activacion - simulacion.base.activacion, 3)}.
      </p>
      <div className="mt-3">
        <TablaAcciones
          antes={['Actual', 'Simulada']}
          filas={simulacion.acciones.map((a) => ({
            nombre: a.columna,
            celdas: [valor(a.actual), valor(a.simulada)],
            igual: [true, Math.abs(a.simulada.valor - a.actual.valor) < 1e-9],
          }))}
        />
      </div>
    </div>
  );
}

function TarjetaPerfil({ origen, cambios, prescripcion, niveles }: { origen: string; cambios: Record<string, string | number>; prescripcion: Prescripcion; niveles: string[] }) {
  const valor = (v: { valor: number; categoria?: string }) => v.categoria ?? num(v.valor);
  const listaCambios = Object.entries(cambios);
  return (
    <div className="rounded-xl border border-linea bg-hoja p-4">
      <p className="text-sm font-semibold">Perfil de riesgo</p>
      <p className="mt-1 text-sm text-tinta-2">
        Parte de {origen}
        {listaCambios.length ? ` con ${listaCambios.map(([c, v]) => `${c} = ${v}`).join(', ')}` : ''}. Hoy <NivelChip nivel={prescripcion.base.nivel} niveles={niveles} />, con el
        plan <NivelChip nivel={prescripcion.prescrito.nivel} niveles={niveles} />
        {prescripcion.meta ? (
          <>
            {' '}
            (meta <NivelChip nivel={prescripcion.meta.nivel} niveles={niveles} />)
          </>
        ) : null}
        .
      </p>
      <div className="mt-3">
        <TablaAcciones
          antes={['Actual', 'Recomendada']}
          filas={prescripcion.acciones.map((a) => ({ nombre: a.nombre, celdas: [valor(a.actual), valor(a.recomendada)], igual: [true, Math.abs(a.cambio) < 1e-6] }))}
        />
      </div>
    </div>
  );
}

function VerArtefacto({ artefacto, niveles }: { artefacto: Artefacto; niveles: string[] }) {
  if (artefacto.tipo === 'estudiante') return <TarjetaEstudiante id={artefacto.id} prescripcion={artefacto.prescripcion} maxima={artefacto.prescripcionMaxima} niveles={niveles} />;
  if (artefacto.tipo === 'simulacion') return <TarjetaSimulacion id={artefacto.id} simulacion={artefacto.simulacion} niveles={niveles} />;
  if (artefacto.tipo === 'perfil') return <TarjetaPerfil origen={artefacto.origen} cambios={artefacto.cambios} prescripcion={artefacto.prescripcion} niveles={niveles} />;
  if (artefacto.grafica === 'influencias') {
    return (
      <GraficaDivergente
        titulo={artefacto.titulo}
        etiquetaValor="Peso"
        datos={artefacto.datos.map((d) => ({ nombre: `${d.id} ${d.nombre}`, valor: d.peso, detalle: `Rol: ${d.rol}` }))}
      />
    );
  }
  if (artefacto.grafica === 'correlaciones') {
    return (
      <MapaCalor
        titulo={artefacto.titulo}
        filas={artefacto.datos.conceptos}
        columnas={artefacto.datos.conceptos}
        valores={artefacto.datos.matriz}
        etiquetaValor="Correlación"
        vacio="Sin variación"
        extremos={['Relación inversa', 'Relación directa']}
      />
    );
  }
  if (artefacto.grafica === 'dispersion') return <GraficaDispersion datos={artefacto.datos} titulo={artefacto.titulo} />;
  if (artefacto.grafica === 'acciones') {
    return <GraficaMancuernas titulo={artefacto.titulo} descripcion="Media actual y recomendada de cada acción, en unidades originales." filas={artefacto.datos} />;
  }
  return <GraficaVariable variable={artefacto.datos} niveles={niveles} />;
}

function Burbuja({ mensaje, niveles }: { mensaje: Mensaje; niveles: string[] }) {
  if (mensaje.rol === 'usuario') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-xl bg-hoja-2 px-4 py-2.5 text-[0.97rem] text-tinta">{mensaje.contenido}</p>
      </div>
    );
  }
  // Las gráficas y tarjetas usan más ancho que el texto, que se mantiene en 72 caracteres por línea.
  return (
    <div className="max-w-[920px]">
      <p className="mb-1 text-xs font-medium text-tinta-3">Pizarra</p>
      {mensaje.consultas?.length ? (
        <ul className="mb-2 space-y-1 text-xs text-tinta-2">
          {mensaje.consultas.map((c, i) => (
            <li key={i} className="flex items-center gap-1.5">
              {c.ok === undefined ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
              ) : c.ok ? (
                <CircleCheck className="size-3.5 text-bien" aria-hidden />
              ) : (
                <CircleAlert className="size-3.5 text-aviso" aria-hidden />
              )}
              Consultó: {(NOMBRES_HERRAMIENTA[c.nombre] ?? (() => c.nombre))(c.argumentos)}
              {c.error && <span className="text-tinta-3"> ({c.error})</span>}
            </li>
          ))}
        </ul>
      ) : null}
      {mensaje.artefactos?.map((a, i) => (
        <div key={i} className={clase('my-3', a.tipo !== 'grafica' && 'max-w-2xl')}>
          <VerArtefacto artefacto={a} niveles={niveles} />
        </div>
      ))}
      {mensaje.contenido ? (
        <div className="prosa max-w-[72ch] text-[0.97rem] text-tinta">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{mensaje.contenido}</ReactMarkdown>
        </div>
      ) : (
        mensaje.estado && (
          <p className="flex items-center gap-2 text-sm text-tinta-2" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            {mensaje.estado}
          </p>
        )
      )}
      {mensaje.error && (
        <Aviso tipo="error" className="mt-2">
          {mensaje.error}
        </Aviso>
      )}
    </div>
  );
}

export function Asistente() {
  const { dataset } = useDatasetActivo();
  const clave = `pizarra.chat.${dataset?.id ?? 'sin-datos'}`;
  return <Conversacion key={clave} clave={clave} />;
}

function Conversacion({ clave }: { clave: string }) {
  const { dataset } = useDatasetActivo();
  const niveles = useMemo(() => nivelesDe(dataset?.esquema), [dataset?.esquema]);
  const [mensajes, setMensajes] = useState<Mensaje[]>(() => leerHistorial(clave));
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const controlador = useRef<AbortController | null>(null);
  const final = useRef<HTMLDivElement>(null);
  const [parametros, setParametros] = useSearchParams();

  useEffect(() => {
    try {
      localStorage.setItem(clave, JSON.stringify(mensajes.filter((m) => !m.estado || m.contenido).slice(-MAX_GUARDADOS)));
    } catch {
      /* sin almacenamiento */
    }
  }, [clave, mensajes]);

  useEffect(() => {
    final.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [mensajes]);

  const actualizarUltimo = (cambio: (m: Mensaje) => Mensaje) =>
    setMensajes((lista) => [...lista.slice(0, -1), cambio(lista[lista.length - 1])]);

  const enviar = useCallback(
    async (pregunta: string) => {
      const limpia = pregunta.trim();
      if (!limpia || enviando) return;
      const historial = [...mensajes, { id: nuevoId(), rol: 'usuario' as const, contenido: limpia }];
      setMensajes([...historial, { id: nuevoId(), rol: 'asistente', contenido: '', estado: 'Conectando con qwen2.5…' }]);
      setTexto('');
      setEnviando(true);
      controlador.current = new AbortController();
      try {
        await conversar(
          {
            datasetId: dataset?.id ?? null,
            mensajes: historial.filter((m) => m.contenido && !m.error).map((m) => ({ rol: m.rol, contenido: m.contenido })),
          },
          (evento) => {
            if (evento.tipo === 'estado') actualizarUltimo((m) => ({ ...m, estado: evento.texto }));
            if (evento.tipo === 'texto') actualizarUltimo((m) => ({ ...m, contenido: m.contenido + evento.delta }));
            if (evento.tipo === 'herramienta') actualizarUltimo((m) => ({ ...m, consultas: [...(m.consultas ?? []), { nombre: evento.nombre, argumentos: evento.argumentos }] }));
            if (evento.tipo === 'resultado') {
              actualizarUltimo((m) => {
                const consultas = [...(m.consultas ?? [])];
                const pendiente = consultas.findIndex((c) => c.nombre === evento.nombre && c.ok === undefined);
                if (pendiente >= 0) consultas[pendiente] = { ...consultas[pendiente], ok: evento.ok, error: evento.error };
                return { ...m, consultas };
              });
            }
            if (evento.tipo === 'grafica' || evento.tipo === 'estudiante' || evento.tipo === 'simulacion' || evento.tipo === 'perfil') {
              actualizarUltimo((m) => ({ ...m, artefactos: [...(m.artefactos ?? []), evento] }));
            }
            if (evento.tipo === 'error') actualizarUltimo((m) => ({ ...m, error: evento.mensaje }));
            if (evento.tipo === 'fin') actualizarUltimo((m) => ({ ...m, estado: undefined }));
          },
          controlador.current.signal,
        );
      } catch (error) {
        const detenido = (error as Error).name === 'AbortError';
        actualizarUltimo((m) => ({ ...m, estado: undefined, error: detenido ? undefined : (error as Error).message, contenido: m.contenido || (detenido ? '*Respuesta detenida.*' : '') }));
      } finally {
        actualizarUltimo((m) => ({ ...m, estado: undefined }));
        setEnviando(false);
        controlador.current = null;
      }
    },
    [dataset?.id, enviando, mensajes],
  );

  // Pregunta enviada desde otra vista (?pregunta=...).
  const pregunta = parametros.get('pregunta');
  useEffect(() => {
    if (!pregunta) return;
    setParametros({}, { replace: true });
    void enviar(pregunta);
  }, [pregunta]); // Solo al llegar con la pregunta.

  function alTeclear(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void enviar(texto);
    }
  }

  const accion = dataset?.esquema?.columnas.find((c) => c.rol === 'accion');
  const sugerencias = dataset?.modeloActivo
    ? [
        `¿Qué recomendaciones generales da el modelo para los estudiantes en ${niveles[0] ?? 'el nivel más bajo'}?`,
        '¿Cómo se relacionan las variables entre sí y con el objetivo?',
        `Usa un perfil de riesgo: un estudiante típico con ${accion?.nombre ?? accion?.columna ?? 'la primera acción'} en 5. ¿Qué le recomienda el algoritmo genético?`,
        '¿Qué variables influyen más en el rendimiento según el modelo?',
        '¿Qué tan confiable es el modelo? Explícamelo en palabras simples.',
        'Analiza al estudiante 14 y dame recomendaciones concretas.',
      ]
    : ['¿Qué es PRV-FCM y cómo prescribe acciones?', '¿Qué columnas tiene el dataset y cuál es el objetivo?', '¿Cómo se relacionan las variables con el objetivo?'];

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-[1.9rem] font-semibold leading-tight">Asistente</h1>
          <p className="mt-1 max-w-[64ch] text-sm text-tinta-2">
            qwen2.5 en su equipo, con acceso a {dataset ? <strong className="text-tinta">{dataset.nombre}</strong> : 'los datos activos'}
            {dataset?.modeloActivo ? ' y a su modelo PRV-FCM' : ' (sin modelo entrenado)'}. Solo responde sobre rendimiento académico, deserción escolar y este proyecto.
          </p>
        </div>
        <Boton variante="fantasma" icono={<Plus className="size-4" aria-hidden />} disabled={enviando || mensajes.length === 0} onClick={() => setMensajes([])}>
          Nueva conversación
        </Boton>
      </header>

      <div className="flex-1 space-y-7 pb-6" aria-live="polite">
        {mensajes.length === 0 ? (
          <div>
            <p className="font-serif text-xl">¿Por dónde empezamos?</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {sugerencias.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => void enviar(s)} className="rounded-full border border-linea bg-hoja px-3.5 py-1.5 text-left text-sm text-tinta hover:bg-hoja-2">
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          mensajes.map((m) => <Burbuja key={m.id} mensaje={m} niveles={niveles} />)
        )}
        <div ref={final} />
      </div>

      <form
        className="sticky bottom-0 -mx-4 border-t border-linea bg-papel/95 px-4 pb-4 pt-3 backdrop-blur sm:-mx-8 sm:px-8"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(texto);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-linea bg-hoja p-2 focus-within:border-tinta-3">
          <label htmlFor="pregunta" className="sr-only">
            Pregunta para el asistente
          </label>
          <textarea
            id="pregunta"
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclear}
            placeholder="Pregunte sobre el rendimiento, la deserción o un estudiante (Enter envía, Mayús + Enter salta de línea)"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[0.97rem] text-tinta outline-none placeholder:text-tinta-3"
            style={{ fieldSizing: 'content' } as CSSProperties}
          />
          {enviando ? (
            <Boton variante="secundario" aria-label="Detener la respuesta" icono={<Square className="size-4" aria-hidden />} onClick={() => controlador.current?.abort()}>
              Detener
            </Boton>
          ) : (
            <Boton type="submit" variante="principal" aria-label="Enviar" disabled={!texto.trim()} icono={<ArrowUp className="size-4" aria-hidden />}>
              Enviar
            </Boton>
          )}
        </div>
      </form>
    </div>
  );
}
