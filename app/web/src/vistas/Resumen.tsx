// Resumen: el hallazgo principal en una frase y el mapa cognitivo del modelo activo.
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';

import { FlujoPasos } from '../componentes/FlujoPasos';
import { GraficaDivergente, GraficaMancuernas, GraficaNiveles } from '../componentes/graficas';
import { MapaFCM } from '../componentes/MapaFCM';
import { Aviso, Cargando, Dato, Vacio } from '../componentes/ui';
import { useDatasetActivo } from '../contexto';
import { nivelesDe, useEstadisticas, useModelo } from '../hooks';
import { entero, fecha, num, pct, pctDe } from '../utilidades';

const enlacePrincipal = 'inline-flex h-10 items-center gap-2 rounded-md bg-boton px-4 text-sm font-medium text-boton-texto hover:opacity-90';
const enlaceSecundario = 'inline-flex h-10 items-center gap-2 rounded-md border border-linea bg-hoja px-4 text-sm font-medium text-tinta hover:bg-hoja-2';

export function Resumen() {
  const { dataset, cargando } = useDatasetActivo();
  const modelo = useModelo(dataset?.modeloActivo);
  const estadisticas = useEstadisticas(dataset?.id, dataset?.esquema, dataset?.esquemaConfirmado);

  if (cargando) return <Cargando />;
  if (!dataset) {
    return (
      <div>
        <div className="mb-8">
          <FlujoPasos actual={1} />
        </div>
        <Vacio titulo="Todavía no hay datos" accion={<Link to="/datos" className={enlacePrincipal}>Subir un dataset</Link>}>
          Suba un CSV o un Excel sobre rendimiento académico o deserción escolar para empezar el paso 1.
        </Vacio>
      </div>
    );
  }

  const niveles = nivelesDe(dataset.esquema);
  const mejor = niveles.at(-1) ?? '';
  const metricas = modelo.data?.metricas;
  const graficas = modelo.data?.graficas;

  const pasoActual = !dataset.esquemaConfirmado ? 2 : !dataset.modeloActivo ? 3 : 5;

  return (
    <div>
      <section className="mb-10" aria-labelledby="titulo-flujo">
        <h2 id="titulo-flujo" className="mb-3 text-sm font-medium text-tinta-2">
          Flujo PRV-FCM: cada paso espera la confirmación del anterior
        </h2>
        <FlujoPasos actual={pasoActual} />
      </section>
      <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="pt-2">
          <p className="text-sm text-tinta-2">{dataset.nombre}</p>
          {!dataset.esquemaConfirmado ? (
            <>
              <h1 className="mt-3 font-serif text-[2.2rem] font-semibold leading-[1.15] tracking-[-0.015em]">
                Revise cómo se usa cada columna antes de entrenar el modelo.
              </h1>
              <div className="mt-7">
                <Link to={`/datos/${dataset.id}`} className={enlacePrincipal}>
                  Revisar el esquema
                </Link>
              </div>
            </>
          ) : !metricas || !graficas ? (
            <>
              <h1 className="mt-3 font-serif text-[2.2rem] font-semibold leading-[1.15] tracking-[-0.015em]">
                Entrene el modelo PRV-FCM para ver qué acciones llevarían a cada estudiante a {mejor}.
              </h1>
              <p className="mt-4 max-w-[60ch] text-tinta-2">
                El mapa cognitivo difuso aprende cómo influye cada variable en {dataset.esquema?.objetivo}; después, el algoritmo genético
                busca el cambio en las acciones que mejora a cada estudiante.
              </p>
              <div className="mt-7">
                <Link to="/modelo" className={enlacePrincipal}>
                  Entrenar el modelo
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="mt-3 font-serif text-[2.35rem] font-semibold leading-[1.14] tracking-[-0.015em]">
                Con las acciones prescritas, <span className="resaltado">{pct(metricas.prescripcion.PSR, 0)}</span> de los{' '}
                {entero(metricas.prescripcion.n_estudiantes)} estudiantes de prueba por debajo de {mejor} llegaría a {mejor} según el FCM.
              </h1>
              <p className="mt-5 max-w-[60ch] text-[1.02rem] text-tinta-2">
                Hoy lo logra el {pct(metricas.prescripcion.PSR_base)}. Un bosque aleatorio independiente confirma la mejora para el{' '}
                {pct(metricas.validacion_externa.PSR_externo)} (antes {pct(metricas.validacion_externa.PSR_externo_base)}): esa es la cifra prudente.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                <Link to="/prescripciones" className={enlacePrincipal}>
                  Ver prescripciones
                </Link>
                <Link to="/asistente" className={enlaceSecundario}>
                  Preguntar al asistente <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </div>
              <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-t border-linea pt-6">
                <Dato etiqueta="Exactitud del FCM en prueba" valor={pctDe(metricas.prediccion_fcm.exactitud_rendimiento)} detalle={`Clase mayoritaria: ${pctDe(metricas.prediccion_fcm.exactitud_clase_mayoritaria)}`} />
                <Dato etiqueta="Bosque aleatorio (referencia)" valor={pctDe(metricas.validacion_externa.exactitud_prueba)} detalle="Modelo externo, no interpretable" />
                <Dato etiqueta="Pendiente elegida" valor={`λ = ${num(metricas.configuracion.fcm.lambda_, 2)}`} detalle="Por validación cruzada" />
                <Dato etiqueta="Entrenado" valor={<span className="text-base font-medium">{fecha(modelo.data!.creado)}</span>} detalle={`${entero(metricas.configuracion.n_entrenamiento)} registros de entrenamiento`} />
              </dl>
            </>
          )}
        </div>

        {graficas ? (
          <MapaFCM conceptos={graficas.conceptos} aristas={graficas.aristas} objetivo={graficas.objetivo} compacto />
        ) : estadisticas.data ? (
          <GraficaNiveles niveles={estadisticas.data.objetivo.niveles} objetivo={estadisticas.data.objetivo.columna} />
        ) : null}
      </div>

      {modelo.isError && (
        <Aviso tipo="error" className="mt-8">
          No se pudo cargar el modelo: {modelo.error.message}
        </Aviso>
      )}

      {graficas && metricas && (
        <div className="mt-14 grid items-start gap-6 xl:grid-cols-2">
          <GraficaMancuernas
            titulo="Qué cambia la prescripción, en promedio"
            descripcion="Nivel medio de cada acción: actual y recomendado (unidades originales)."
            filas={graficas.acciones.map((a) => ({ nombre: a.nombre, desde: a.actual_media, hasta: a.recomendada_media, min: a.min, max: a.max }))}
          />
          <GraficaDivergente
            titulo={`Qué más influye en ${graficas.objetivo}`}
            descripcion="Los ocho pesos más fuertes del mapa cognitivo."
            etiquetaValor="Peso"
            datos={graficas.influencias.slice(0, 8).map((i) => ({ nombre: `${i.id} ${i.nombre}`, valor: i.peso, detalle: i.rol === 'inmutable' ? 'Inmutable: puede compensar la falta de sesgo' : undefined }))}
          />
        </div>
      )}
    </div>
  );
}
