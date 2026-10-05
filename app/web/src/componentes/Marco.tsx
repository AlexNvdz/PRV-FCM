// Estructura de la aplicación: barra lateral de pizarra y área de contenido.
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Database, FileText, LayoutDashboard, Menu, MessagesSquare, Moon, Network, Sun, Target, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { api } from '../api';
import { useDatasetActivo, useTema } from '../contexto';
import { clase } from '../utilidades';

// "pasos" son los del flujo PRV-FCM que cubre cada sección.
const NAVEGACION = [
  { a: '/', texto: 'Resumen', icono: LayoutDashboard, pasos: '' },
  { a: '/datos', texto: 'Datos', icono: Database, pasos: '1 y 2' },
  { a: '/modelo', texto: 'Modelo', icono: Network, pasos: '3' },
  { a: '/prescripciones', texto: 'Prescripciones', icono: Target, pasos: '4' },
  { a: '/informe', texto: 'Informe', icono: FileText, pasos: '5' },
  { a: '/asistente', texto: 'Asistente', icono: MessagesSquare, pasos: '' },
  { a: '/ayuda', texto: 'Ayuda', icono: BookOpen, pasos: '' },
];

function EstadoServicios() {
  const { data, isError } = useQuery({ queryKey: ['estado'], queryFn: api.estado, refetchInterval: 30_000 });
  const lineas = data
    ? [
        {
          ok: data.ollama.ok && data.ollama.modeloDisponible,
          texto: data.ollama.ok ? (data.ollama.modeloDisponible ? `${data.modelo} listo` : `Falta ${data.modelo}`) : 'Ollama sin conexión',
          detalle: data.ollama.error,
        },
        { ok: data.motor.ok, texto: data.motor.ok ? 'Motor PRV-FCM listo' : 'Motor Python detenido', detalle: data.motor.error },
      ]
    : [{ ok: false, texto: isError ? 'Servidor sin conexión' : 'Comprobando servicios…', detalle: undefined }];
  return (
    <ul className="space-y-1.5 text-xs text-tiza-2" aria-label="Estado de los servicios locales">
      {lineas.map((l) => (
        <li key={l.texto} className="flex items-center gap-2" title={l.detalle}>
          <span className={clase('size-2 rounded-full', l.ok ? 'bg-[#6fd08c]' : 'bg-[#f0a35e]')} aria-hidden />
          <span>{l.texto}</span>
          <span className="sr-only">{l.ok ? '(disponible)' : '(no disponible)'}</span>
        </li>
      ))}
    </ul>
  );
}

function BarraLateral({ alNavegar }: { alNavegar?: () => void }) {
  const { datasets, datasetId, elegirDataset } = useDatasetActivo();
  const { tema, alternar } = useTema();
  return (
    <div className="flex h-full flex-col bg-pizarra px-4 pb-5 pt-6 text-tiza">
      <div className="px-2">
        <p className="font-serif text-[1.55rem] font-semibold leading-none tracking-[-0.01em]">Pizarra</p>
        <p className="mt-1.5 text-xs text-tiza-2">Analítica prescriptiva PRV-FCM</p>
      </div>

      <div className="mt-7 px-2">
        <label htmlFor="dataset-activo" className="text-xs text-tiza-2">
          Datos activos
        </label>
        <select
          id="dataset-activo"
          value={datasetId ?? ''}
          onChange={(e) => elegirDataset(e.target.value)}
          className="mt-1.5 h-9 w-full rounded-md border border-pizarra-3 bg-pizarra-2 px-2 text-sm text-tiza"
        >
          {datasets.length === 0 && <option value="">Sin datos</option>}
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </div>

      <nav className="mt-6 flex flex-col gap-0.5" aria-label="Secciones">
        {NAVEGACION.map(({ a, texto, icono: Icono, pasos }) => (
          <NavLink
            key={a}
            to={a}
            end={a === '/'}
            onClick={alNavegar}
            className={({ isActive }) =>
              clase(
                'relative flex items-center gap-3 rounded-md px-3 py-2 text-[0.95rem] transition-colors',
                isActive ? 'bg-pizarra-2 text-tiza' : 'text-tiza-2 hover:bg-pizarra-2/60 hover:text-tiza',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-tiza" aria-hidden />}
                <Icono className="size-[18px]" aria-hidden />
                {texto}
                {pasos && <span className="ml-auto text-[0.7rem] text-tiza-2">{pasos.includes('y') ? `pasos ${pasos}` : `paso ${pasos}`}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-4 px-2 pt-6">
        <EstadoServicios />
        <button
          type="button"
          onClick={alternar}
          className="flex items-center gap-2 rounded-md py-1 text-xs text-tiza-2 hover:text-tiza"
        >
          {tema === 'oscuro' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
          {tema === 'oscuro' ? 'Usar tema claro' : 'Usar tema oscuro'}
        </button>
      </div>
    </div>
  );
}

export function Marco() {
  const [abierto, setAbierto] = useState(false);
  const ubicacion = useLocation();
  useEffect(() => setAbierto(false), [ubicacion.pathname]);

  return (
    <div className="flex min-h-full">
      <aside className="hidden w-[248px] shrink-0 lg:block">
        <div className="sticky top-0 h-screen">
          <BarraLateral />
        </div>
      </aside>

      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Cerrar menú" onClick={() => setAbierto(false)} />
          <div className="relative h-full w-[264px]">
            <BarraLateral alNavegar={() => setAbierto(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between bg-pizarra px-4 py-3 text-tiza lg:hidden">
          <span className="font-serif text-lg font-semibold">Pizarra</span>
          <button type="button" onClick={() => setAbierto((v) => !v)} aria-label={abierto ? 'Cerrar menú' : 'Abrir menú'} className="rounded-md p-1.5 hover:bg-pizarra-2">
            {abierto ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 sm:px-8 lg:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
