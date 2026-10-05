// Paso 3: entrenar el PRV-FCM (extracción de la matriz de pesos W, máscara causal) y
// revisar su calidad predictiva y su estructura.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, LoaderCircle, Play, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { api, escucharEntrenamiento } from '../api';
import { FlujoPasos } from '../componentes/FlujoPasos';
import { GraficaDivergente, GraficaSeleccion } from '../componentes/graficas';
import { MapaFCM } from '../componentes/MapaFCM';
import { MatrizConfusion } from '../componentes/MatrizConfusion';
import { MapaCalor } from '../componentes/relaciones';
import { Aviso, Barra, Boton, Cargando, Clase, Dato, Encabezado, estiloControl, Formula, Seccion, Vacio } from '../componentes/ui';
import { useDatasetActivo } from '../contexto';
import { nivelesDe, useDataset, useEstadisticas, useModelo } from '../hooks';
import type { Dataset, EventoMotor, Graficas, MetodoPesos, ModeloMeta, OpcionesEntrenamiento } from '../tipos';
import { clase, duracion, entero, fecha, NOMBRE_METODO, NOMBRE_ROL, num, pct, pctDe } from '../utilidades';

const OPCIONES_INICIALES: OpcionesEntrenamiento = {
  proporcion_prueba: 0.3,
  division: 'agrupada',
  validacion_cruzada: 'completa',
  metodo_pesos: 'bptt',
  balancear_niveles: false,
  aristas_excluidas: [],
  lambda: 1,
  alpha_l2: 0.001,
  beta: 0.05,
  delta_max: null,
  permitir_reducciones: false,
  semilla: 42,
  ag: {},
};

/** Opciones de la interfaz a partir de las que guardó un entrenamiento (formato del motor). */
function opcionesDesdeModelo(opciones: Record<string, unknown>): OpcionesEntrenamiento {
  const o = opciones as Partial<OpcionesEntrenamiento> & { validacion_cruzada?: boolean; rejilla_lambda?: number[] };
  return {
    ...OPCIONES_INICIALES,
    proporcion_prueba: o.proporcion_prueba ?? OPCIONES_INICIALES.proporcion_prueba,
    division: o.division ?? OPCIONES_INICIALES.division,
    validacion_cruzada: o.validacion_cruzada === false ? 'ninguna' : o.rejilla_lambda ? 'rapida' : 'completa',
    metodo_pesos: o.metodo_pesos ?? 'bptt',
    balancear_niveles: o.balancear_niveles ?? false,
    aristas_excluidas: o.aristas_excluidas ?? [],
    lambda: o.lambda ?? OPCIONES_INICIALES.lambda,
    alpha_l2: o.alpha_l2 ?? OPCIONES_INICIALES.alpha_l2,
    beta: o.beta ?? OPCIONES_INICIALES.beta,
    delta_max: o.delta_max ?? null,
    permitir_reducciones: o.permitir_reducciones ?? false,
    semilla: o.semilla ?? OPCIONES_INICIALES.semilla,
    ag: o.ag ?? {},
  };
}

const MODOS_CV = [
  { valor: 'completa', texto: 'Completa', ayuda: '6 valores de λ y 3 de α, 5 pliegues. Uno o dos minutos con BPTT.' },
  { valor: 'rapida', texto: 'Rápida', ayuda: 'λ de 0.5 a 2, 3 pliegues. Unos segundos.' },
  { valor: 'ninguna', texto: 'Sin validación', ayuda: 'Usa λ = 1 y α = 0.001 directamente.' },
] as const;

const METODOS: { valor: MetodoPesos; texto: string; ayuda: string }[] = [
  { valor: 'bptt', texto: 'BPTT (recomendado)', ayuda: 'Gradiente exacto a través de las iteraciones del FCM y L-BFGS-B con W en [−1, 1]. 72 % de exactitud en xAPI.' },
  { valor: 'ridge', texto: 'Regresión Ridge', ayuda: 'Regresión lineal con penalización L2 por concepto dinámico; tanh trunca a [−1, 1]. Instantánea, 71 % en xAPI.' },
  { valor: 'lasso', texto: 'Regresión Lasso', ayuda: 'Penalización L1: anula los pesos débiles; tanh trunca a [−1, 1]. 71 % en xAPI.' },
  { valor: 'correlacion_parcial', texto: 'Correlación parcial', ayuda: 'w = correlación de cada par dados los demás. Describe la estructura, pero no calibra la inferencia: 48 % en xAPI.' },
];

const ETAPAS = [
  { clave: 'carga', texto: 'Lectura de datos' },
  { clave: 'preprocesamiento', texto: 'División y codificación' },
  { clave: 'seleccion', texto: 'Validación cruzada' },
  { clave: 'fcm', texto: 'Extracción de W y aprendizaje del FCM' },
  { clave: 'prescripcion', texto: 'Prescripción con el AG' },
  { clave: 'evaluacion', texto: 'Evaluación' },
  { clave: 'figuras', texto: 'Figuras del informe' },
];

/** Paso 3.3: máscara de dirección causal. Cada casilla es una arista que la estructura permite; desmarcarla la elimina. */
function EditorMascara({ dataset, excluidas, alCambiar }: { dataset: Dataset; excluidas: [string, string][]; alCambiar: (e: [string, string][]) => void }) {
  const estructura = useQuery({
    queryKey: ['estructura', dataset.id, JSON.stringify(dataset.esquema)],
    queryFn: () => api.estructura(dataset.id),
    staleTime: Infinity,
  });
  const datos = estructura.data;
  const permitida = (o: string, d: string) => Boolean(datos?.aristas.some((a) => a.origen === o && a.destino === d));
  const excluida = (o: string, d: string) => excluidas.some(([x, y]) => x === o && y === d);

  // Si el esquema cambió, se descartan las exclusiones que ya no corresponden a una arista.
  useEffect(() => {
    if (!datos) return;
    const validas = excluidas.filter(([o, d]) => datos.aristas.some((a) => a.origen === o && a.destino === d));
    if (validas.length !== excluidas.length) alCambiar(validas);
  }, [datos, excluidas, alCambiar]);

  if (estructura.isLoading) return <Cargando texto="Leyendo la estructura del mapa…" />;
  if (estructura.isError || !datos) return <Aviso tipo="error">{estructura.error?.message ?? 'No se pudo leer la estructura.'}</Aviso>;
  const destinos = datos.conceptos.filter((c) => datos.aristas.some((a) => a.destino === c.columna));
  const orden = { accion: 0, mutable: 1, inmutable: 2, objetivo: 3 } as const;
  const fuentes = datos.conceptos.filter((c) => datos.aristas.some((a) => a.origen === c.columna)).sort((a, b) => orden[a.rol] - orden[b.rol]);
  const alternar = (o: string, d: string) => alCambiar(excluida(o, d) ? excluidas.filter(([x, y]) => !(x === o && y === d)) : [...excluidas, [o, d]]);
  const objetivo = datos.conceptos.find((c) => c.rol === 'objetivo');
  const inmutablesAlObjetivo = objetivo
    ? datos.aristas.filter((a) => a.destino === objetivo.columna && datos.conceptos.find((c) => c.columna === a.origen)?.rol === 'inmutable').map((a) => [a.origen, a.destino] as [string, string])
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="fantasma" disabled={!excluidas.length} onClick={() => alCambiar([])}>
          Permitir todas
        </Boton>
        <Boton variante="fantasma" disabled={!inmutablesAlObjetivo.length} onClick={() => alCambiar(inmutablesAlObjetivo)}>
          Quitar inmutables hacia el objetivo
        </Boton>
        <span className="text-xs text-tinta-2">
          {datos.aristas.length - excluidas.length} de {datos.aristas.length} aristas permitidas
          {excluidas.length ? `; ${excluidas.length} excluidas` : ''}.
        </span>
      </div>
      <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-linea">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-hoja-2 text-left text-xs text-tinta-2">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Origen (fila) → destino (columna)</th>
              {destinos.map((d) => (
                <th key={d.columna} scope="col" className="px-3 py-2 text-center font-medium" title={d.nombre}>
                  {d.id} {d.rol === 'objetivo' ? '(objetivo)' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fuentes.map((f) => (
              <tr key={f.columna} className="border-t border-linea">
                <th scope="row" className="px-3 py-1.5 text-left font-normal">
                  <span className="text-tinta">
                    {f.id} {f.nombre}
                  </span>
                  <span className="ml-2 text-xs text-tinta-3">{NOMBRE_ROL[f.rol].toLowerCase()}</span>
                </th>
                {destinos.map((d) => (
                  <td key={d.columna} className="px-3 py-1.5 text-center">
                    {permitida(f.columna, d.columna) ? (
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--pizarra)]"
                        checked={!excluida(f.columna, d.columna)}
                        onChange={() => alternar(f.columna, d.columna)}
                        aria-label={`Arista ${f.id} ${f.nombre} hacia ${d.id} ${d.nombre}`}
                      />
                    ) : (
                      <span className="text-tinta-3" aria-label="No existe en la estructura">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Matriz W (n x n): pesos de las aristas de la estructura; el resto de celdas no existe. */
function MatrizW({ graficas }: { graficas: Graficas }) {
  const [completa, setCompleta] = useState(true);
  const conceptos = graficas.conceptos;
  const peso = new Map(graficas.aristas.map((a) => [`${a.origen}\u0000${a.destino}`, a.peso]));
  const destinos = completa ? conceptos : conceptos.filter((c) => graficas.aristas.some((a) => a.destino === c.id));
  return (
    <div>
      <label className="mb-3 inline-flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" className="size-4 accent-[var(--pizarra)]" checked={completa} onChange={(e) => setCompleta(e.target.checked)} />
        Matriz completa n × n (si no, solo las columnas que reciben aristas)
      </label>
      <MapaCalor
        titulo="Matriz de adyacencia W aprendida"
        descripcion={`Fila: concepto de origen j. Columna: concepto de destino i. Celda: peso w_ji. ${graficas.aristas.length} aristas; las celdas grises no existen en la estructura.`}
        filas={conceptos}
        columnas={destinos}
        valores={conceptos.map((o) => destinos.map((d) => peso.get(`${o.id}\u0000${d.id}`) ?? null))}
        etiquetaValor="Peso"
        vacio="Sin arista en la estructura"
        extremos={['Aleja del mejor nivel', 'Acerca al mejor nivel']}
      />
    </div>
  );
}

function Progreso({ eventos, error }: { eventos: EventoMotor[]; error?: string }) {
  const etapas = new Map(eventos.filter((e) => e.evento === 'etapa').map((e) => [e.etapa, e.mensaje]));
  const progreso = Object.fromEntries(
    eventos.filter((e) => e.evento === 'progreso').map((e) => [e.tarea, (100 * e.hechos) / e.total]),
  ) as Record<string, number>;
  const errorFinal = error ?? eventos.find((e) => e.evento === 'error')?.mensaje;
  const ultima = [...ETAPAS].reverse().find((e) => etapas.has(e.clave))?.clave;
  return (
    <ol className="space-y-3" aria-live="polite">
      {ETAPAS.map((etapa) => {
        const hecha = etapas.has(etapa.clave) && etapa.clave !== ultima;
        const actual = etapa.clave === ultima && !errorFinal && !eventos.some((e) => e.evento === 'fin');
        const tarea = etapa.clave === 'seleccion' ? 'validacion_cruzada' : etapa.clave === 'prescripcion' ? 'prescripcion' : null;
        const enCursoTarea = tarea && progreso[tarea] !== undefined && progreso[tarea] < 100 && !etapas.has(etapa.clave === 'seleccion' ? 'seleccion' : 'evaluacion');
        return (
          <li key={etapa.clave} className="flex gap-3">
            <span className="mt-0.5">
              {hecha || (etapa.clave === ultima && eventos.some((e) => e.evento === 'fin')) ? (
                <CircleCheck className="size-4 text-bien" aria-hidden />
              ) : actual || enCursoTarea ? (
                <LoaderCircle className="size-4 animate-spin text-tinta-2" aria-hidden />
              ) : (
                <span className="block size-4 rounded-full border border-linea" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className={clase(etapas.has(etapa.clave) || enCursoTarea ? 'text-tinta' : 'text-tinta-3')}>{etapa.texto}</p>
              {etapas.get(etapa.clave) && <p className="text-xs text-tinta-2">{etapas.get(etapa.clave)}</p>}
              {enCursoTarea && <Barra valor={progreso[tarea!]} className="mt-1.5 max-w-sm" />}
            </div>
          </li>
        );
      })}
      {errorFinal && (
        <li>
          <Aviso tipo="error">{errorFinal}</Aviso>
        </li>
      )}
    </ol>
  );
}

/** Nivel del objetivo menos frecuente y su proporción, si es menor que el 25 %: conviene equilibrar. */
function nivelMinoritario(niveles: { etiqueta: string; n: number }[] | undefined) {
  if (!niveles?.length) return null;
  const total = niveles.reduce((s, n) => s + n.n, 0);
  const menor = [...niveles].sort((a, b) => a.n - b.n)[0];
  return total && menor.n / total < 0.25 ? { etiqueta: menor.etiqueta, proporcion: menor.n / total } : null;
}

function FormularioEntrenamiento({ dataset, alIniciar, ocupado }: { dataset: Dataset; alIniciar: (m: ModeloMeta) => void; ocupado: boolean }) {
  // Parte de las opciones del último entrenamiento terminado: método de pesos, equilibrio y máscara incluidos.
  const ultimo = dataset.modelos.find((m) => m.estado === 'listo');
  const [opciones, setOpciones] = useState(() => (ultimo ? opcionesDesdeModelo(ultimo.opciones) : OPCIONES_INICIALES));
  const [equilibrioElegido, setEquilibrioElegido] = useState(Boolean(ultimo));
  const estadisticas = useEstadisticas(dataset.id, dataset.esquema, dataset.esquemaConfirmado);
  const minoritario = nivelMinoritario(estadisticas.data?.objetivo.niveles);
  const desbalanceado = Boolean(minoritario);
  // Sin entrenamientos previos, un objetivo desbalanceado activa el equilibrio por defecto.
  useEffect(() => {
    if (equilibrioElegido || !estadisticas.data) return;
    setOpciones((o) => (o.balancear_niveles === desbalanceado ? o : { ...o, balancear_niveles: desbalanceado }));
  }, [equilibrioElegido, estadisticas.data, desbalanceado]);
  const entrenar = useMutation({ mutationFn: () => api.entrenar(dataset.id, opciones), onSuccess: alIniciar });
  const ponerExcluidas = useMemo(() => (aristas: [string, string][]) => setOpciones((o) => ({ ...o, aristas_excluidas: aristas })), []);
  const poner = <K extends keyof OpcionesEntrenamiento>(clave: K, valor: OpcionesEntrenamiento[K]) => setOpciones((o) => ({ ...o, [clave]: valor }));
  const ponerAg = (clave: keyof OpcionesEntrenamiento['ag'], valor: string) =>
    setOpciones((o) => {
      const ag = { ...o.ag };
      if (valor === '') delete ag[clave];
      else (ag as Record<string, number | string>)[clave] = clave === 'tipo_cruce' ? valor : Number(valor);
      return { ...o, ag };
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        entrenar.mutate();
      }}
      className="space-y-6"
    >
      <fieldset>
        <legend className="text-sm font-medium text-tinta">Método de extracción de la matriz de pesos W</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {METODOS.map((m) => (
            <label key={m.valor} className={clase('cursor-pointer rounded-lg border px-3 py-2.5 text-sm', opciones.metodo_pesos === m.valor ? 'border-tinta bg-hoja-2' : 'border-linea')}>
              <input type="radio" name="metodo" className="sr-only" checked={opciones.metodo_pesos === m.valor} onChange={() => poner('metodo_pesos', m.valor)} />
              <span className="font-medium text-tinta">{m.texto}</span>
              <span className="mt-0.5 block text-xs text-tinta-2">{m.ayuda}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-[var(--pizarra)]"
          checked={opciones.balancear_niveles}
          disabled={opciones.metodo_pesos === 'correlacion_parcial'}
          onChange={(e) => {
            setEquilibrioElegido(true);
            poner('balancear_niveles', e.target.checked);
          }}
        />
        <span>
          <span className="text-tinta">Equilibrar los niveles del objetivo al aprender W</span>
          <span className="block text-xs text-tinta-3">
            {minoritario
              ? `El nivel ${minoritario.etiqueta} es solo el ${pct(100 * minoritario.proporcion)} de los registros: sin equilibrar, el mapa tiende a predecir el nivel frecuente y no detecta a quienes están en riesgo. `
              : 'Cada registro pesa según la frecuencia de su nivel; útil cuando un nivel es mucho más frecuente. '}
            λ y α se eligen entonces por exactitud equilibrada. No aplica a la correlación parcial.
          </span>
        </span>
      </label>

      <details className="rounded-lg border border-linea px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-tinta">Cómo se construye y se usa W</summary>
        <div className="mt-3 space-y-3">
          <Formula lectura="Regla de Kosko modificada con memoria. Solo los conceptos dinámicos (el objetivo) se actualizan; los demás quedan fijos en su valor.">
            A_i(t+1) = f( k2·A_i(t) + k1·Σ_j w_ji·A_j(t) ),   f(x) = 1 / (1 + e^(−λx))
          </Formula>
          <Formula lectura="Ridge y Lasso: con y el valor observado del objetivo, este es el valor que debe sumar la influencia para que y sea un punto fijo de la regla. Se ajusta sin intercepto porque la regla no tiene sesgo.">
            z = ( logit(y)/λ − k2·y ) / k1 ≈ Σ_j w_ji·x_j,   Ridge: + α·n·‖w‖²   Lasso: + α·‖w‖₁
          </Formula>
          <Formula lectura="Truncamiento de los coeficientes de la regresión al rango de un peso causal. BPTT ya los acota con L-BFGS-B; la correlación parcial ya está en [−1, 1].">
            w_ji = tanh(β_j) ∈ (−1, 1)
          </Formula>
          <Formula lectura="Correlación parcial: la relación directa entre dos conceptos descontando a todos los demás (P es la inversa de la covarianza, con contracción de Ledoit-Wolf).">
            w_ji = −P_ji / √(P_jj·P_ii)
          </Formula>
          <p className="text-xs text-tinta-2">
            Las aristas van de los conceptos fijos (<Clase letra="S" /> y <Clase letra="P" />) hacia los dinámicos; el objetivo <Clase letra="T" /> no tiene aristas
            de salida. λ y α se eligen por validación cruzada agrupada.
          </p>
        </div>
      </details>

      <details className="rounded-lg border border-linea px-4 py-3 text-sm" open={opciones.aristas_excluidas.length > 0}>
        <summary className="cursor-pointer font-medium text-tinta">
          Máscara de dirección causal (opcional){opciones.aristas_excluidas.length ? `: ${opciones.aristas_excluidas.length} aristas excluidas` : ''}
        </summary>
        <p className="mt-2 text-xs text-tinta-2">
          Desmarque las conexiones que considere lógicamente imposibles. El peso de una arista excluida queda en 0 y el resto se reajusta sin ella: como la
          regla no tiene sesgo, quitar inmutables suele bajar la exactitud.
        </p>
        <div className="mt-3">
          <EditorMascara dataset={dataset} excluidas={opciones.aristas_excluidas} alCambiar={ponerExcluidas} />
        </div>
      </details>

      <fieldset>
        <legend className="text-sm font-medium text-tinta">Selección de λ y α</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {MODOS_CV.map((m) => (
            <label key={m.valor} className={clase('cursor-pointer rounded-lg border px-3 py-2.5 text-sm', opciones.validacion_cruzada === m.valor ? 'border-tinta bg-hoja-2' : 'border-linea')}>
              <input type="radio" name="cv" className="sr-only" checked={opciones.validacion_cruzada === m.valor} onChange={() => poner('validacion_cruzada', m.valor)} />
              <span className="font-medium text-tinta">{m.texto}</span>
              <span className="mt-0.5 block text-xs text-tinta-2">{m.ayuda}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="division" className="text-sm font-medium">División</label>
          <select id="division" className={estiloControl} value={opciones.division} onChange={(e) => poner('division', e.target.value as OpcionesEntrenamiento['division'])}>
            <option value="agrupada">Agrupada por perfil (recomendada)</option>
            <option value="aleatoria">Aleatoria</option>
          </select>
          <p className="text-xs text-tinta-3">Agrupada evita que variantes del mismo estudiante estén en ambas partes.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="prueba" className="text-sm font-medium">Datos de prueba (%)</label>
          <input id="prueba" type="number" min={10} max={50} step={5} className={estiloControl} value={Math.round(opciones.proporcion_prueba * 100)} onChange={(e) => poner('proporcion_prueba', Number(e.target.value) / 100)} />
          <p className="text-xs text-tinta-3">Los artículos usan 30 %.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="beta" className="text-sm font-medium">Penalización del esfuerzo (β)</label>
          <input id="beta" type="number" min={0} max={5} step={0.05} className={estiloControl} value={opciones.beta} onChange={(e) => poner('beta', Number(e.target.value))} />
          <p className="text-xs text-tinta-3">0.05 busca el máximo efecto; 0.4 da cambios moderados.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="delta" className="text-sm font-medium">Cambio máximo por acción</label>
          <input
            id="delta"
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="Sin límite"
            className={estiloControl}
            value={opciones.delta_max ?? ''}
            onChange={(e) => poner('delta_max', e.target.value === '' ? null : Number(e.target.value))}
          />
          <p className="text-xs text-tinta-3">Fracción del rango de la acción (0 a 1).</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-[var(--pizarra)]" checked={opciones.permitir_reducciones} onChange={(e) => poner('permitir_reducciones', e.target.checked)} />
        Permitir recomendar valores menores que los actuales
      </label>

      <details className="rounded-lg border border-linea px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-tinta">Algoritmo genético y semilla</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { clave: 'tam_poblacion' as const, texto: 'Población', paso: 10, marcador: '50' },
            { clave: 'generaciones' as const, texto: 'Generaciones', paso: 10, marcador: '100' },
            { clave: 'tasa_cruce' as const, texto: 'Tasa de cruce', paso: 0.05, marcador: '0.9' },
            { clave: 'tasa_mutacion' as const, texto: 'Tasa de mutación', paso: 0.05, marcador: '0.25' },
          ].map((c) => (
            <div key={c.clave} className="flex flex-col gap-1.5">
              <label htmlFor={c.clave} className="text-xs font-medium">{c.texto}</label>
              <input id={c.clave} type="number" step={c.paso} placeholder={c.marcador} className={estiloControl} value={(opciones.ag[c.clave] as number | undefined) ?? ''} onChange={(e) => ponerAg(c.clave, e.target.value)} />
            </div>
          ))}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cruce" className="text-xs font-medium">Cruce</label>
            <select id="cruce" className={estiloControl} value={opciones.ag.tipo_cruce ?? ''} onChange={(e) => ponerAg('tipo_cruce', e.target.value)}>
              <option value="">Uniforme</option>
              <option value="un_punto">Un punto</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="semilla" className="text-xs font-medium">Semilla</label>
            <input id="semilla" type="number" min={0} className={estiloControl} value={opciones.semilla} onChange={(e) => poner('semilla', Number(e.target.value))} />
          </div>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <Boton type="submit" variante="principal" icono={<Play className="size-4" aria-hidden />} cargando={entrenar.isPending} disabled={ocupado}>
          {ocupado ? 'Entrenando…' : 'Entrenar modelo'}
        </Boton>
        {entrenar.isError && <Aviso tipo="error">{entrenar.error.message}</Aviso>}
      </div>
    </form>
  );
}

function Historial({ modelos, visto, alVer }: { modelos: ModeloMeta[]; visto: string | null; alVer: (id: string) => void }) {
  const cliente = useQueryClient();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const eliminar = useMutation({
    mutationFn: (id: string) => api.eliminarModelo(id),
    onSuccess: async () => {
      setConfirmar(null);
      await cliente.invalidateQueries({ queryKey: ['dataset'] });
      await cliente.invalidateQueries({ queryKey: ['datasets'] });
    },
  });
  const estado = { listo: 'Listo', en_curso: 'Entrenando', error: 'Con error', interrumpido: 'Interrumpido' } as const;
  return (
    <ul className="divide-y divide-linea rounded-xl border border-linea bg-hoja">
      {modelos.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
          <button type="button" disabled={m.estado !== 'listo'} onClick={() => alVer(m.id)} className={clase('text-left', m.estado === 'listo' && 'hover:underline', visto === m.id && 'font-semibold')}>
            {fecha(m.creado)}
          </button>
          <span className={clase('text-xs', m.estado === 'listo' ? 'text-bien' : m.estado === 'en_curso' ? 'text-tinta-2' : 'text-critico')}>{estado[m.estado]}</span>
          <span className="text-xs text-tinta-3">
            {NOMBRE_METODO[(m.opciones.metodo_pesos as MetodoPesos | undefined) ?? 'bptt']}
            {m.opciones.balancear_niveles ? ' con niveles equilibrados' : ''},{' '}
            {m.opciones.validacion_cruzada ? `CV ${m.opciones.rejilla_lambda ? 'rápida' : 'completa'}` : 'sin CV'}, β = {String(m.opciones.beta ?? 0.05)}
            {Array.isArray(m.opciones.aristas_excluidas) && m.opciones.aristas_excluidas.length ? `, ${m.opciones.aristas_excluidas.length} aristas excluidas` : ''}
            {m.duracionMs ? `, ${duracion(m.duracionMs)}` : ''}
          </span>
          {visto === m.id && <span className="text-xs text-tinta-2">(en pantalla)</span>}
          <span className="ml-auto">
            {confirmar === m.id ? (
              <span className="inline-flex items-center gap-2">
                <Boton variante="peligro" cargando={eliminar.isPending} onClick={() => eliminar.mutate(m.id)}>
                  Eliminar
                </Boton>
                <Boton variante="fantasma" onClick={() => setConfirmar(null)}>
                  Cancelar
                </Boton>
              </span>
            ) : (
              <Boton variante="fantasma" aria-label="Eliminar este entrenamiento" icono={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmar(m.id)} />
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function Modelo() {
  const { dataset: activo } = useDatasetActivo();
  const cliente = useQueryClient();
  const detalle = useDataset(activo?.id);
  const [visto, setVisto] = useState<string | null>(null);
  const [trabajo, setTrabajo] = useState<{ id: string; eventos: EventoMotor[]; error?: string; terminado: boolean } | null>(null);

  const dataset = detalle.data;
  const enCurso = useMemo(() => dataset?.modelos.find((m) => m.estado === 'en_curso') ?? null, [dataset]);
  const idVisto = visto ?? dataset?.modeloActivo ?? null;
  const modelo = useModelo(idVisto);

  // Si hay un entrenamiento en curso (por ejemplo, tras recargar), se sigue su progreso.
  const idEscuchado = trabajo?.id ?? enCurso?.id ?? null;
  useEffect(() => {
    if (!idEscuchado) return;
    setTrabajo((t) => (t?.id === idEscuchado ? t : { id: idEscuchado, eventos: [], terminado: false }));
    return escucharEntrenamiento(
      idEscuchado,
      (evento) =>
        setTrabajo((t) => {
          if (!t || t.id !== idEscuchado) return t;
          const eventos = evento.evento === 'progreso' ? [...t.eventos.filter((e) => !(e.evento === 'progreso' && e.tarea === evento.tarea)), evento] : [...t.eventos, evento];
          return { ...t, eventos };
        }),
      async (final) => {
        setTrabajo((t) => (t ? { ...t, terminado: true, error: final.estado === 'listo' ? undefined : final.error } : t));
        await Promise.all([cliente.invalidateQueries({ queryKey: ['dataset', final.datasetId] }), cliente.invalidateQueries({ queryKey: ['datasets'] })]);
        if (final.estado === 'listo') setVisto(final.id);
      },
    );
  }, [idEscuchado, cliente]);

  if (!activo) return <Vacio titulo="No hay un dataset activo" accion={<Link to="/datos" className="text-sm underline">Ir a Datos</Link>} />;
  if (detalle.isLoading || !dataset) return <Cargando />;

  const niveles = nivelesDe(dataset.esquema);
  const m = modelo.data?.metricas;
  const g = modelo.data?.graficas;
  const ocupado = Boolean(enCurso) || Boolean(trabajo && !trabajo.terminado);

  return (
    <div>
      <FlujoPasos actual={3} compacto />
      <Encabezado
        titulo="Paso 3: entrenamiento del FCM"
        descripcion={
          <>
            El mapa cognitivo difuso se entrena con los datos de <strong className="text-tinta">{dataset.nombre}</strong>: se extrae la matriz de pesos W, la
            pendiente λ se elige por validación cruzada y el algoritmo genético prescribe acciones para los estudiantes de prueba fuera del mejor nivel.
          </>
        }
      />

      {!dataset.esquemaConfirmado ? (
        <Vacio titulo="Primero confirme el esquema" accion={<Link to={`/datos/${dataset.id}`} className="inline-flex h-9 items-center rounded-md bg-boton px-4 text-sm font-medium text-boton-texto">Revisar el esquema</Link>}>
          El modelo necesita saber cuál columna es el objetivo y cuáles son acciones.
        </Vacio>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-xl border border-linea bg-hoja p-5">
            <h2 className="mb-4 text-[1.05rem] font-semibold">Entrenar</h2>
            <FormularioEntrenamiento key={dataset.id} dataset={dataset} ocupado={ocupado} alIniciar={(meta) => setTrabajo({ id: meta.id, eventos: [], terminado: false })} />
          </div>
          <div className="rounded-xl border border-linea bg-hoja p-5">
            <h2 className="mb-4 text-[1.05rem] font-semibold">Progreso</h2>
            {trabajo ? <Progreso eventos={trabajo.eventos} error={trabajo.error} /> : <p className="text-sm text-tinta-2">Sin entrenamientos en curso.</p>}
          </div>
        </div>
      )}

      {modelo.isLoading && idVisto && <Cargando texto="Cargando resultados…" />}
      {m && g && (
        <>
          <Seccion titulo="Calidad predictiva" descripcion={`Modelo del ${fecha(modelo.data!.creado)}. El FCM predice el nivel de ${g.objetivo} de estudiantes que no vio al entrenar.`}>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4 xl:grid-cols-8">
              <Dato etiqueta="Exactitud del FCM" valor={pctDe(m.prediccion_fcm.exactitud_rendimiento)} />
              <Dato
                etiqueta="Exactitud equilibrada"
                valor={pctDe(Object.values(m.prediccion_fcm.por_clase).reduce((s, c) => s + c.recall, 0) / Math.max(Object.keys(m.prediccion_fcm.por_clase).length, 1))}
                detalle="Media del recall de cada nivel"
              />
              <Dato etiqueta="F1 macro" valor={pctDe(m.prediccion_fcm.F1_macro)} />
              <Dato etiqueta="Clase mayoritaria" valor={pctDe(m.prediccion_fcm.exactitud_clase_mayoritaria)} detalle="Línea base trivial" />
              <Dato etiqueta="Bosque aleatorio" valor={pctDe(m.validacion_externa.exactitud_prueba)} detalle="Referencia externa" />
              <Dato
                etiqueta="Método de W"
                valor={NOMBRE_METODO[m.configuracion.fcm.metodo_pesos ?? 'bptt']}
                detalle={[
                  m.configuracion.fcm.balancear_niveles ? 'Niveles equilibrados' : null,
                  m.configuracion.aristas_excluidas?.length ? `${m.configuracion.aristas_excluidas.length} aristas excluidas` : 'Sin máscara',
                ]
                  .filter(Boolean)
                  .join('; ')}
              />
              <Dato etiqueta="λ y α" valor={`${num(m.configuracion.fcm.lambda_, 2)} y ${m.configuracion.fcm.alpha_l2}`} />
              <Dato etiqueta="Entrenamiento y prueba" valor={`${entero(m.configuracion.n_entrenamiento)} / ${entero(m.configuracion.n_prueba)}`} detalle={`${m.configuracion.perfiles_compartidos} perfiles compartidos`} />
            </dl>
            <div className="mt-8 grid gap-6 xl:grid-cols-2">
              {m.seleccion_hiperparametros ? (
                <GraficaSeleccion tabla={m.seleccion_hiperparametros} lambda={m.configuracion.fcm.lambda_} alpha={m.configuracion.fcm.alpha_l2} mayoritaria={m.prediccion_fcm.exactitud_clase_mayoritaria} />
              ) : (
                <Aviso tipo="info">Este modelo se entrenó sin validación cruzada (λ = {num(m.configuracion.fcm.lambda_, 2)}).</Aviso>
              )}
              <div className="space-y-6">
                <MatrizConfusion matriz={m.prediccion_fcm.matriz_confusion} niveles={niveles} />
                <table className="tabular w-full text-sm">
                  <caption className="mb-2 text-left text-sm font-semibold">Por nivel</caption>
                  <thead className="text-left text-xs text-tinta-3">
                    <tr>
                      <th scope="col" className="pb-1 font-medium">Nivel</th>
                      <th scope="col" className="pb-1 text-right font-medium">Precisión</th>
                      <th scope="col" className="pb-1 text-right font-medium">Recall</th>
                      <th scope="col" className="pb-1 text-right font-medium">F1</th>
                      <th scope="col" className="pb-1 text-right font-medium">Estudiantes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(m.prediccion_fcm.por_clase).map(([nivel, c]) => (
                      <tr key={nivel} className="border-t border-linea">
                        <th scope="row" className="py-1.5 text-left font-medium">{nivel}</th>
                        <td className="py-1.5 text-right">{pctDe(c.precision)}</td>
                        <td className="py-1.5 text-right">{pctDe(c.recall)}</td>
                        <td className="py-1.5 text-right">{pctDe(c.F1)}</td>
                        <td className="py-1.5 text-right">{entero(c.soporte)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Seccion>

          <Seccion titulo="Estructura aprendida" descripcion="Cada concepto influye sobre el objetivo con un peso entre −1 y 1. Los inmutables con pesos grandes suelen compensar la falta de sesgo de la regla, no son causas.">
            <MapaFCM conceptos={g.conceptos} aristas={g.aristas} objetivo={g.objetivo} />
            <div className="mt-6 space-y-6">
              <MatrizW graficas={g} />
              <GraficaDivergente
                titulo="Todos los pesos hacia el objetivo"
                etiquetaValor="Peso"
                datos={g.influencias.map((i) => ({ nombre: `${i.id} ${i.nombre}`, valor: i.peso, detalle: `Rol: ${i.rol}` }))}
              />
            </div>
            {modelo.data?.id === dataset.modeloActivo && (
              <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-linea pt-6">
                <Link to="/prescripciones" className="inline-flex h-9 items-center gap-2 rounded-md bg-boton px-3.5 text-sm font-medium text-boton-texto hover:opacity-90">
                  Continuar al paso 4: motor prescriptivo <ArrowRight className="size-4" aria-hidden />
                </Link>
                <span className="text-sm text-tinta-2">El AG ya prescribió acciones a los estudiantes de prueba; ahí también puede probar un perfil de riesgo.</span>
              </div>
            )}
          </Seccion>
        </>
      )}

      {dataset.modelos.length > 0 && (
        <Seccion titulo="Entrenamientos" descripcion="El más reciente terminado es el que usan el resumen, las prescripciones y el asistente.">
          <Historial modelos={dataset.modelos} visto={idVisto} alVer={setVisto} />
        </Seccion>
      )}
    </div>
  );
}
