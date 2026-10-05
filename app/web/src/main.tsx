import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/literata';
import './estilos.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { Marco } from './componentes/Marco';
import { ProveedorDataset } from './contexto';
import { Asistente } from './vistas/Asistente';
import { Ayuda } from './vistas/Ayuda';
import { Datos } from './vistas/Datos';
import { DatasetDetalle } from './vistas/DatasetDetalle';
import { Informe } from './vistas/Informe';
import { Modelo } from './vistas/Modelo';
import { NoEncontrado } from './vistas/NoEncontrado';
import { Prescripciones } from './vistas/Prescripciones';
import { Resumen } from './vistas/Resumen';

const clienteConsultas = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 10_000 } },
});

const enrutador = createBrowserRouter([
  {
    path: '/',
    element: <Marco />,
    children: [
      { index: true, element: <Resumen /> },
      { path: 'datos', element: <Datos /> },
      { path: 'datos/:id', element: <DatasetDetalle /> },
      { path: 'modelo', element: <Modelo /> },
      { path: 'prescripciones', element: <Prescripciones /> },
      { path: 'informe', element: <Informe /> },
      { path: 'asistente', element: <Asistente /> },
      { path: 'ayuda', element: <Ayuda /> },
      { path: '*', element: <NoEncontrado /> },
    ],
  },
]);

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <ProveedorDataset>
        <RouterProvider router={enrutador} />
      </ProveedorDataset>
    </QueryClientProvider>
  </StrictMode>,
);
