// Server-Sent Events sobre una respuesta HTTP (también sirve para peticiones POST).
export function abrirSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  // Un comentario periódico evita que proxies o el navegador cierren la conexión.
  const latido = setInterval(() => res.write(': latido\n\n'), 15_000);
  res.on('close', () => clearInterval(latido));
  return {
    enviar(evento) {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(evento)}\n\n`);
    },
    cerrar() {
      clearInterval(latido);
      if (!res.writableEnded) res.end();
    },
  };
}
