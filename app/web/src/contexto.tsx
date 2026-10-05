// Estado global mínimo: el dataset activo y el tema.
import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from './api';
import type { DatasetResumen } from './tipos';

interface ValorContexto {
  datasets: DatasetResumen[];
  cargando: boolean;
  datasetId: string | null;
  dataset: DatasetResumen | null;
  elegirDataset: (id: string) => void;
}

const Contexto = createContext<ValorContexto | null>(null);
const CLAVE = 'pizarra.dataset';

function leer(clave: string) {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function escribir(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function ProveedorDataset({ children }: { children: ReactNode }) {
  const consulta = useQuery({ queryKey: ['datasets'], queryFn: api.datasets });
  const [elegido, setElegido] = useState<string | null>(() => leer(CLAVE));
  const datasets = useMemo(() => consulta.data ?? [], [consulta.data]);
  const dataset = datasets.find((d) => d.id === elegido) ?? datasets[0] ?? null;

  const elegirDataset = useCallback((id: string) => {
    setElegido(id);
    escribir(CLAVE, id);
  }, []);

  const valor = useMemo(
    () => ({ datasets, cargando: consulta.isLoading, datasetId: dataset?.id ?? null, dataset, elegirDataset }),
    [datasets, consulta.isLoading, dataset, elegirDataset],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useDatasetActivo() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useDatasetActivo necesita ProveedorDataset.');
  return valor;
}

export function useTema() {
  const [tema, setTema] = useState(() => document.documentElement.dataset.tema ?? 'claro');
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    escribir('pizarra.tema', tema);
  }, [tema]);
  return { tema, alternar: () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro')) };
}

/** Lee y escribe un valor en localStorage (conveniencias por usuario, nunca datos críticos). */
export function usePersistente<T>(clave: string, inicial: T) {
  const [valor, setValor] = useState<T>(() => {
    const guardado = leer(clave);
    if (guardado === null) return inicial;
    try {
      return JSON.parse(guardado) as T;
    } catch {
      return inicial;
    }
  });
  useEffect(() => escribir(clave, JSON.stringify(valor)), [clave, valor]);
  return [valor, setValor] as const;
}
