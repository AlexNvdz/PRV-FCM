// Punto de entrada: prepara el almacén, siembra el dataset de ejemplo y abre el servidor local.
import fs from 'node:fs';

import { Almacen } from './almacen.js';
import { crearApp } from './app.js';
import { ALMACEN, DATASET_EJEMPLO, HOST, OLLAMA_MODELO, PUERTO, RAIZ_PROYECTO, rutaPython } from './config.js';
import { Motor } from './motor.js';
import { Trabajos } from './trabajos.js';

const almacen = new Almacen(ALMACEN);
await almacen.iniciar();
const python = rutaPython();
const motor = new Motor({ python, cwd: RAIZ_PROYECTO });
const trabajos = new Trabajos({ almacen, python, cwd: RAIZ_PROYECTO });

/** La primera vez, registra el dataset xAPI del proyecto con su esquema ya definido. */
async function sembrarEjemplo() {
  if ((await almacen.listarDatasets()).length || !fs.existsSync(DATASET_EJEMPLO)) return;
  const dataset = await almacen.crearDataset({
    nombre: 'xAPI-Edu-Data (4800 registros)',
    archivo: DATASET_EJEMPLO,
    origen: 'copiar',
    ejemplo: true,
  });
  const ruta = almacen.rutaDatos(dataset.id);
  const [perfil, esquema] = await Promise.all([
    motor.llamar('perfilar', { ruta, nombre: dataset.nombre }),
    motor.llamar('esquema_xapi'),
  ]);
  const validacion = await motor.llamar('validar_esquema', { ruta, esquema });
  await almacen.guardarDataset({
    ...dataset,
    archivo: 'xAPI-Edu-Data-expanded-4800.csv',
    filas: perfil.filas,
    columnas: perfil.columnas,
    perfil,
    esquema,
    esquemaConfirmado: validacion.ok,
    validacion,
  });
  console.log('Dataset de ejemplo registrado: xAPI-Edu-Data (4800 registros).');
}

try {
  await sembrarEjemplo();
} catch (error) {
  console.warn(`No se pudo registrar el dataset de ejemplo: ${error.message}`);
}

const app = crearApp({ almacen, motor, trabajos });
const servidor = app.listen(PUERTO, HOST, (error) => {
  if (error) {
    console.error(
      error.code === 'EADDRINUSE'
        ? `El puerto ${PUERTO} está ocupado. Cierre la otra instancia o use otro puerto (PORT=3002 npm start).`
        : error.message,
    );
    process.exit(1);
  }
  console.log(`Pizarra PRV-FCM lista en http://localhost:${PUERTO}`);
  console.log(`Python: ${python} | Ollama: ${OLLAMA_MODELO}`);
});

function cerrar() {
  motor.detener();
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
