// Registro en disco de datasets y modelos (sin base de datos).
//
//   almacen/datasets/<id>/datos.csv       archivo subido
//   almacen/datasets/<id>/dataset.json    nombre, perfil, esquema y validación
//   almacen/modelos/<id>/modelo_meta.json estado del entrenamiento y opciones
//   almacen/modelos/<id>/...              salidas del motor (metricas.json, graficas.json, modelo.json, ...)
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export class Almacen {
  constructor(raiz) {
    this.raiz = raiz;
    this.dirDatasets = path.join(raiz, 'datasets');
    this.dirModelos = path.join(raiz, 'modelos');
    this.dirTemporal = path.join(raiz, 'tmp');
  }

  async iniciar() {
    await Promise.all([this.dirDatasets, this.dirModelos, this.dirTemporal].map((d) => fs.mkdir(d, { recursive: true })));
    // Un entrenamiento que seguía en curso cuando se cerró el servidor ya no terminará.
    for (const modelo of await this.listarModelos()) {
      if (modelo.estado === 'en_curso') {
        await this.guardarModelo({ ...modelo, estado: 'interrumpido', error: 'El servidor se detuvo durante el entrenamiento.' });
      }
    }
  }

  static nuevoId(prefijo) {
    return `${prefijo}-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  }

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  static async leerJson(ruta, porDefecto = null) {
    try {
      return JSON.parse(await fs.readFile(ruta, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return porDefecto;
      throw error;
    }
  }

  static async escribirJson(ruta, datos) {
    const temporal = `${ruta}.${process.pid}.tmp`;
    await fs.writeFile(temporal, JSON.stringify(datos, null, 2), 'utf8');
    await fs.rename(temporal, ruta);
  }

  static idValido(id) {
    return typeof id === 'string' && /^[a-z]{2,3}-[a-z0-9]{6,20}$/.test(id);
  }

  // ------------------------------------------------------------------
  // Datasets
  // ------------------------------------------------------------------
  dirDataset(id) {
    if (!Almacen.idValido(id)) throw Object.assign(new Error('Identificador de dataset no válido.'), { status: 400 });
    return path.join(this.dirDatasets, id);
  }

  rutaDatos(id) {
    return path.join(this.dirDataset(id), 'datos.csv');
  }

  async listarDatasets() {
    const ids = await fs.readdir(this.dirDatasets).catch(() => []);
    const datasets = await Promise.all(ids.filter(Almacen.idValido).map((id) => this.obtenerDataset(id)));
    return datasets.filter(Boolean).sort((a, b) => b.creado.localeCompare(a.creado));
  }

  async obtenerDataset(id) {
    return Almacen.leerJson(path.join(this.dirDataset(id), 'dataset.json'));
  }

  async crearDataset({ nombre, archivo, origen, ejemplo = false }) {
    const id = Almacen.nuevoId('ds');
    const dir = this.dirDataset(id);
    await fs.mkdir(dir, { recursive: true });
    const destino = path.join(dir, 'datos.csv');
    if (origen === 'mover') await fs.rename(archivo, destino);
    else await fs.copyFile(archivo, destino);
    const meta = { id, nombre, creado: new Date().toISOString(), ejemplo, esquema: null, esquemaConfirmado: false };
    await this.guardarDataset(meta);
    return meta;
  }

  async guardarDataset(meta) {
    await Almacen.escribirJson(path.join(this.dirDataset(meta.id), 'dataset.json'), meta);
    return meta;
  }

  async eliminarDataset(id) {
    for (const modelo of await this.listarModelos(id)) await this.eliminarModelo(modelo.id);
    await fs.rm(this.dirDataset(id), { recursive: true, force: true });
  }

  // ------------------------------------------------------------------
  // Modelos
  // ------------------------------------------------------------------
  dirModelo(id) {
    if (!Almacen.idValido(id)) throw Object.assign(new Error('Identificador de modelo no válido.'), { status: 400 });
    return path.join(this.dirModelos, id);
  }

  async listarModelos(datasetId = null) {
    const ids = await fs.readdir(this.dirModelos).catch(() => []);
    const modelos = await Promise.all(ids.filter(Almacen.idValido).map((id) => this.obtenerModelo(id)));
    return modelos
      .filter((m) => m && (!datasetId || m.datasetId === datasetId))
      .sort((a, b) => b.creado.localeCompare(a.creado));
  }

  async obtenerModelo(id) {
    return Almacen.leerJson(path.join(this.dirModelo(id), 'modelo_meta.json'));
  }

  async crearModelo({ datasetId, opciones }) {
    const id = Almacen.nuevoId('md');
    await fs.mkdir(this.dirModelo(id), { recursive: true });
    const meta = { id, datasetId, creado: new Date().toISOString(), estado: 'en_curso', opciones, eventos: [] };
    await this.guardarModelo(meta);
    return meta;
  }

  async guardarModelo(meta) {
    await Almacen.escribirJson(path.join(this.dirModelo(meta.id), 'modelo_meta.json'), meta);
    return meta;
  }

  async eliminarModelo(id) {
    await fs.rm(this.dirModelo(id), { recursive: true, force: true });
  }

  /** Último modelo terminado de un dataset. */
  async modeloActivo(datasetId) {
    return (await this.listarModelos(datasetId)).find((m) => m.estado === 'listo') ?? null;
  }

  async resultadosModelo(id) {
    const dir = this.dirModelo(id);
    const [metricas, graficas] = await Promise.all([
      Almacen.leerJson(path.join(dir, 'metricas.json')),
      Almacen.leerJson(path.join(dir, 'graficas.json')),
    ]);
    return { metricas, graficas };
  }
}
