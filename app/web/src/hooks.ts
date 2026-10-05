// Consultas compartidas entre vistas.
import { useQuery } from '@tanstack/react-query';

import { api } from './api';
import type { Esquema } from './tipos';

export function useDataset(id: string | null | undefined) {
  return useQuery({ queryKey: ['dataset', id], queryFn: () => api.dataset(id!), enabled: Boolean(id) });
}

export function useModelo(id: string | null | undefined) {
  return useQuery({ queryKey: ['modelo', id], queryFn: () => api.modelo(id!), enabled: Boolean(id), staleTime: 60_000 });
}

export function useEstadisticas(id: string | null | undefined, esquema: Esquema | null | undefined, confirmado: boolean | undefined) {
  return useQuery({
    queryKey: ['estadisticas', id, JSON.stringify(esquema)],
    queryFn: () => api.estadisticas(id!),
    enabled: Boolean(id && confirmado),
    staleTime: 5 * 60_000,
  });
}

/** Niveles del objetivo del peor al mejor, según el esquema. */
export function nivelesDe(esquema: Esquema | null | undefined): string[] {
  if (!esquema) return [];
  const objetivo = esquema.columnas.find((c) => c.rol === 'objetivo');
  if (objetivo?.codificacion === 'ordinal' && objetivo.orden) return objetivo.orden;
  return Object.entries(esquema.niveles ?? { Bajo: 0, Medio: 0.5, Alto: 1 })
    .sort((a, b) => a[1] - b[1])
    .map(([n]) => n);
}
