// Configuración del servidor. Todo se puede cambiar con variables de entorno.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));

export const RAIZ_APP = path.resolve(aqui, '..');
// Carpeta del proyecto: contiene el paquete Python prvfcm/.
export const RAIZ_PROYECTO = path.resolve(RAIZ_APP, '..');
export const ALMACEN = process.env.PIZARRA_ALMACEN ?? path.join(RAIZ_APP, 'almacen');
export const WEB_DIST = path.join(RAIZ_APP, 'web', 'dist');
export const DATASET_EJEMPLO = path.join(RAIZ_PROYECTO, 'data', 'xAPI-Edu-Data-expanded-4800.csv');

// Solo escucha en la máquina local.
export const HOST = process.env.HOST ?? '127.0.0.1';
export const PUERTO = Number(process.env.PORT ?? 3001);
export const LIMITE_SUBIDA_MB = 50;

export const OLLAMA_URL = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');
export const OLLAMA_MODELO = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b';
// El mismo tamaño de contexto en todas las llamadas evita que Ollama recargue el modelo.
export const OLLAMA_CONTEXTO = Number(process.env.OLLAMA_NUM_CTX ?? 8192);

export function rutaPython() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venv =
    process.platform === 'win32'
      ? path.join(RAIZ_PROYECTO, '.venv', 'Scripts', 'python.exe')
      : path.join(RAIZ_PROYECTO, '.venv', 'bin', 'python');
  if (fs.existsSync(venv)) return venv;
  return process.platform === 'win32' ? 'python' : 'python3';
}
