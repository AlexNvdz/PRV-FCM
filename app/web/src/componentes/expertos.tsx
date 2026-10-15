// Método «expertos» (García et al., 2025): cada experto aporta un CSV con columnas origen,
// destino y peso. Se valida cada archivo contra la estructura del mapa y se muestra la matriz
// de consenso: la media de todos los expertos, con 0 donde un experto no dio la arista.
import { useQuery } from '@tanstack/react-query';
import { Trash2, Upload } from 'lucide-react';
import { useState } from 'react';

import { api } from '../api';
import type { Dataset, Estructura, MatrizExperto } from '../tipos';
import { MapaCalor } from './relaciones';
import { Aviso, Boton, Cargando } from './ui';

const clave = (origen: string, destino: string) => `${origen}\u0000${destino}`;

/** Lee el CSV de un experto y devuelve su matriz o los errores (con el número de línea). */
export function leerMatrizExperto(texto: string, experto: string, estructura: Estructura): { matriz: MatrizExperto | null; errores: string[] } {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { matriz: null, errores: ['El archivo está vacío.'] };
  const separador = lineas[0].includes(';') && !lineas[0].includes(',') ? ';' : ',';
  const partir = (linea: string) => linea.split(separador).map((c) => c.trim().replace(/^"(.*)"$/, '$1'));
  const cabecera = partir(lineas[0]).map((c) => c.toLowerCase());
  const [io, id, ip] = ['origen', 'destino', 'peso'].map((c) => cabecera.indexOf(c));
  if (io < 0 || id < 0 || ip < 0) return { matriz: null, errores: ['La primera fila debe tener las columnas origen, destino y peso.'] };
  const permitidas = new Set(estructura.aristas.map((a) => clave(a.origen, a.destino)));
  const vistas = new Set<string>();
  const errores: string[] = [];
  const aristas: MatrizExperto['aristas'] = [];
  lineas.slice(1).forEach((linea, k) => {
    const celdas = partir(linea);
    const [origen, destino] = [celdas[io], celdas[id]];
    const textoPeso = celdas[ip] ?? '';
    const peso = textoPeso === '' ? Number.NaN : Number(separador === ';' ? textoPeso.replace(',', '.') : textoPeso);
    const fila = `Línea ${k + 2}`;
    if (!origen || !destino) errores.push(`${fila}: falta el origen o el destino.`);
    else if (!Number.isFinite(peso) || peso < -1 || peso > 1) errores.push(`${fila}: el peso de ${origen} → ${destino} debe ser un número entre −1 y 1.`);
    else if (!permitidas.has(clave(origen, destino))) errores.push(`${fila}: la estructura no tiene la arista ${origen} → ${destino}.`);
    else if (vistas.has(clave(origen, destino))) errores.push(`${fila}: la arista ${origen} → ${destino} está repetida.`);
    else {
      vistas.add(clave(origen, destino));
      aristas.push({ origen, destino, peso });
    }
  });
  if (!errores.length && !aristas.length) errores.push('El archivo no tiene aristas.');
  return { matriz: errores.length ? null : { experto, aristas }, errores };
}

/** Media de todos los expertos por arista; un experto que no dio la arista cuenta 0. */
export function consenso(matrices: MatrizExperto[]) {
  const suma = new Map<string, number>();
  for (const m of matrices) for (const a of m.aristas) suma.set(clave(a.origen, a.destino), (suma.get(clave(a.origen, a.destino)) ?? 0) + a.peso);
  return new Map([...suma].map(([k, v]) => [k, v / matrices.length]));
}

export function EditorExpertos({ dataset, matrices, alCambiar }: { dataset: Dataset; matrices: MatrizExperto[]; alCambiar: (m: MatrizExperto[]) => void }) {
  const estructura = useQuery({
    queryKey: ['estructura', dataset.id, JSON.stringify(dataset.esquema)],
    queryFn: () => api.estructura(dataset.id),
    staleTime: Infinity,
  });
  const [errores, setErrores] = useState<{ archivo: string; errores: string[] }[]>([]);

  if (estructura.isLoading) return <Cargando texto="Leyendo la estructura del mapa…" />;
  if (estructura.isError || !estructura.data) return <Aviso tipo="error">{estructura.error?.message ?? 'No se pudo leer la estructura.'}</Aviso>;
  const datos = estructura.data;

  async function leerArchivos(archivos: FileList) {
    const leidos = await Promise.all(
      [...archivos].map(async (f) => ({ archivo: f.name, ...leerMatrizExperto(await f.text(), f.name.replace(/\.[^.]+$/, ''), datos) })),
    );
    setErrores(leidos.filter((l) => l.errores.length).map(({ archivo, errores: e }) => ({ archivo, errores: e })));
    const nuevas = leidos.flatMap((l) => (l.matriz ? [l.matriz] : []));
    // Un archivo con el mismo nombre de experto reemplaza al anterior.
    alCambiar([...matrices.filter((m) => !nuevas.some((n) => n.experto === m.experto)), ...nuevas]);
  }

  const media = consenso(matrices);
  const destinos = datos.conceptos.filter((c) => datos.aristas.some((a) => a.destino === c.columna));
  const fuentes = datos.conceptos.filter((c) => datos.aristas.some((a) => a.origen === c.columna));
  const aFila = (c: (typeof datos.conceptos)[number]) => ({ id: c.id, nombre: c.nombre });

  return (
    <div className="space-y-4">
      <p className="text-xs text-tinta-2">
        Un CSV por experto, con las columnas <code>origen</code>, <code>destino</code> y <code>peso</code> (de −1 a 1). Los nombres son los de las columnas del
        dataset; en una columna one-hot, <code>columna=categoría</code>. El nombre del archivo es el del experto. Solo valen las aristas de la estructura (de{' '}
        {datos.aristas.length} posibles).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-linea bg-hoja px-3.5 text-sm font-medium text-tinta hover:bg-hoja-2 focus-within:outline-2">
          <Upload className="size-4" aria-hidden />
          Subir matrices (CSV)
          <input
            type="file"
            accept=".csv,text/csv"
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) void leerArchivos(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <span className="text-xs text-tinta-2">{matrices.length ? `${matrices.length} expertos cargados.` : 'Ningún experto cargado.'}</span>
      </div>
      {errores.map((e) => (
        <Aviso key={e.archivo} tipo="error">
          <strong>{e.archivo}</strong> no se cargó: {e.errores.slice(0, 6).join(' ')}
          {e.errores.length > 6 ? ` Y ${e.errores.length - 6} errores más.` : ''}
        </Aviso>
      ))}
      {matrices.length > 0 && (
        <>
          <ul className="flex flex-wrap gap-2 text-sm">
            {matrices.map((m) => (
              <li key={m.experto} className="inline-flex items-center gap-1 rounded-md border border-linea px-2 py-1">
                {m.experto} <span className="text-xs text-tinta-3">({m.aristas.length} aristas)</span>
                <Boton
                  variante="fantasma"
                  aria-label={`Quitar la matriz de ${m.experto}`}
                  icono={<Trash2 className="size-3.5" aria-hidden />}
                  onClick={() => alCambiar(matrices.filter((x) => x.experto !== m.experto))}
                />
              </li>
            ))}
          </ul>
          <MapaCalor
            titulo="Matriz de consenso"
            descripcion={`Media de los ${matrices.length} expertos; si un experto no dio una arista, cuenta 0. Es la W que usará el FCM.`}
            filas={fuentes.map(aFila)}
            columnas={destinos.map(aFila)}
            valores={fuentes.map((o) => destinos.map((d) => (datos.aristas.some((a) => a.origen === o.columna && a.destino === d.columna) ? (media.get(clave(o.columna, d.columna)) ?? 0) : null)))}
            etiquetaValor="Peso de consenso"
            vacio="Sin arista en la estructura"
            extremos={['Aleja del mejor nivel', 'Acerca al mejor nivel']}
          />
        </>
      )}
    </div>
  );
}
