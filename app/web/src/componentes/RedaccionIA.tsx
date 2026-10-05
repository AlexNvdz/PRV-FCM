// Recomendación redactada por qwen2.5 a partir de una prescripción ya calculada (paso 5).
import { RotateCcw, Sparkles, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { redactar } from '../api';
import type { PedidoRedaccion } from '../tipos';
import { Aviso, Boton } from './ui';

export function RedaccionIA({
  modeloId,
  pedido,
  titulo = 'Recomendación redactada con IA',
  descripcion = 'qwen2.5 convierte la prescripción en prácticas concretas. Parte de las cifras del modelo; revísela antes de compartirla.',
}: {
  modeloId: string;
  pedido: PedidoRedaccion;
  titulo?: string;
  descripcion?: string;
}) {
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'inactivo' | 'redactando' | 'listo'>('inactivo');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controlador = useRef<AbortController | null>(null);

  useEffect(() => () => controlador.current?.abort(), []);

  async function iniciar() {
    controlador.current?.abort();
    const propio = new AbortController();
    controlador.current = propio;
    setTexto('');
    setError(null);
    setEstado('redactando');
    setAviso('Conectando con qwen2.5…');
    try {
      await redactar(
        modeloId,
        pedido,
        (evento) => {
          if (evento.tipo === 'estado') setAviso(evento.texto);
          if (evento.tipo === 'texto') {
            setAviso(null);
            setTexto((t) => t + evento.delta);
          }
          if (evento.tipo === 'error') setError(evento.mensaje);
        },
        propio.signal,
      );
    } catch (fallo) {
      if ((fallo as Error).name !== 'AbortError') setError((fallo as Error).message);
    } finally {
      if (controlador.current === propio) {
        controlador.current = null;
        setEstado('listo');
        setAviso(null);
      }
    }
  }

  return (
    <section className="rounded-xl border border-linea bg-hoja p-4" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[60ch]">
          <h3 className="font-semibold text-tinta">{titulo}</h3>
          <p className="mt-0.5 text-sm text-tinta-2">{descripcion}</p>
        </div>
        {estado === 'redactando' ? (
          <Boton icono={<Square className="size-4" aria-hidden />} onClick={() => controlador.current?.abort()}>
            Detener
          </Boton>
        ) : (
          <Boton variante={estado === 'listo' ? 'secundario' : 'principal'} icono={estado === 'listo' ? <RotateCcw className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} onClick={() => void iniciar()}>
            {estado === 'listo' ? 'Redactar de nuevo' : 'Redactar con qwen2.5'}
          </Boton>
        )}
      </div>
      {aviso && <p className="mt-3 text-sm text-tinta-2">{aviso}</p>}
      {texto && (
        <div className="prosa mt-3 text-[0.95rem] text-tinta">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{texto}</ReactMarkdown>
        </div>
      )}
      {error && (
        <Aviso tipo="error" className="mt-3">
          {error}
        </Aviso>
      )}
    </section>
  );
}
