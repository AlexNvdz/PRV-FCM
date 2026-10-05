// Los cinco pasos del flujo PRV-FCM, con su estado para el dataset activo. Cada paso
// espera la confirmación del anterior: guardar el esquema, entrenar el modelo, etc.
import { Check, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { useDatasetActivo } from '../contexto';
import { clase } from '../utilidades';
import { Clase } from './ui';

export type NumeroPaso = 1 | 2 | 3 | 4 | 5;

interface EstadoDataset {
  id: string;
  esquemaConfirmado: boolean;
  modeloActivo: string | null;
}

const PASOS: { n: NumeroPaso; titulo: string; detalle: ReactNode }[] = [
  { n: 1, titulo: 'Ingesta y exploración', detalle: 'Reporte inicial, codificación y fuzzificación a [0, 1].' },
  {
    n: 2,
    titulo: 'Clasificación de nodos',
    detalle: (
      <>
        Objetivo <Clase letra="T" />, acciones <Clase letra="P" /> y sistema <Clase letra="S" />.
      </>
    ),
  },
  { n: 3, titulo: 'Entrenamiento del FCM', detalle: 'Matriz de pesos W y máscara causal opcional.' },
  { n: 4, titulo: 'Motor prescriptivo', detalle: 'Algoritmo genético por estudiante y perfil de riesgo.' },
  { n: 5, titulo: 'Visualización y recomendaciones', detalle: 'Grafo, convergencia y reporte en lenguaje natural.' },
];

function enlace(n: NumeroPaso, dataset: EstadoDataset | null) {
  if (!dataset) return '/datos';
  return {
    1: `/datos/${dataset.id}?pestana=reporte`,
    2: `/datos/${dataset.id}?pestana=esquema`,
    3: '/modelo',
    4: '/prescripciones',
    5: '/informe',
  }[n];
}

export function FlujoPasos({ actual, dataset: propio, compacto = false }: { actual?: NumeroPaso; dataset?: EstadoDataset | null; compacto?: boolean }) {
  const { dataset: activo, elegirDataset } = useDatasetActivo();
  const dataset = propio === undefined ? activo : propio;
  // Los pasos 3 a 5 trabajan con el dataset activo: al seguir el flujo desde otro dataset, ese pasa a ser el activo.
  const activar = () => {
    if (dataset && activo?.id !== dataset.id) elegirDataset(dataset.id);
  };
  const hecho: Record<NumeroPaso, boolean> = {
    1: Boolean(dataset),
    2: Boolean(dataset?.esquemaConfirmado),
    3: Boolean(dataset?.modeloActivo),
    4: Boolean(dataset?.modeloActivo),
    5: false,
  };
  const disponible: Record<NumeroPaso, boolean> = {
    1: true,
    2: Boolean(dataset),
    3: Boolean(dataset?.esquemaConfirmado),
    4: Boolean(dataset?.modeloActivo),
    5: Boolean(dataset?.modeloActivo),
  };

  return (
    <nav aria-label="Flujo de trabajo PRV-FCM" className={clase(compacto ? 'mb-6' : '')}>
      <ol className={clase('grid gap-2', compacto ? 'grid-cols-2 sm:grid-cols-5' : 'sm:grid-cols-2 lg:grid-cols-5')}>
        {PASOS.map((paso) => {
          const esActual = paso.n === actual;
          const contenido = (
            <>
              <span
                className={clase(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  hecho[paso.n] ? 'bg-bien text-hoja' : esActual ? 'bg-boton text-boton-texto' : 'border border-linea text-tinta-2',
                )}
                aria-hidden
              >
                {hecho[paso.n] ? <Check className="size-3.5" /> : !disponible[paso.n] ? <Lock className="size-3" /> : paso.n}
              </span>
              <span className="min-w-0">
                <span className={clase('block font-medium leading-snug', compacto ? 'text-[0.8rem]' : 'text-sm', disponible[paso.n] ? 'text-tinta' : 'text-tinta-3')}>
                  <span className="sr-only">Paso {paso.n}: </span>
                  {paso.titulo}
                </span>
                {!compacto && <span className="mt-0.5 block text-xs text-tinta-2">{paso.detalle}</span>}
                <span className="sr-only">{hecho[paso.n] ? ' (hecho)' : !disponible[paso.n] ? ' (requiere el paso anterior)' : ''}</span>
              </span>
            </>
          );
          const estilo = clase(
            'flex h-full gap-2.5 rounded-lg border px-3 transition-colors',
            compacto ? 'items-center py-2' : 'items-start py-3',
            esActual ? 'border-tinta bg-hoja-2' : 'border-linea bg-hoja',
            disponible[paso.n] && !esActual && 'hover:bg-hoja-2',
          );
          return (
            <li key={paso.n}>
              {disponible[paso.n] ? (
                <Link to={enlace(paso.n, dataset)} onClick={activar} className={estilo} aria-current={esActual ? 'step' : undefined}>
                  {contenido}
                </Link>
              ) : (
                <span className={clase(estilo, 'cursor-not-allowed opacity-70')} aria-disabled="true">
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
