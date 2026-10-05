// Guía de uso de Pizarra: un capítulo por parte de la aplicación. Cada bloque es una
// unidad del buscador de la ayuda y los términos enlazan a su entrada del glosario.
import type { ReactNode } from 'react';

import { Bloque, Codigo, Def, Defs, Entradas, Ir, Lista, Pasos, T, Tecla } from '../componentes/ayuda';
import { Aviso, Clase, Formula } from '../componentes/ui';

export interface CapituloGuia {
  id: string;
  titulo: string;
  Contenido: () => ReactNode;
}

// ---------------------------------------------------------------------------
// Qué hace Pizarra
// ---------------------------------------------------------------------------
const FLUJO = [
  {
    n: 1,
    titulo: 'ingesta y exploración',
    donde: 'Datos',
    texto: 'Suba un CSV o un Excel y lea su reporte inicial: tipos, vacíos, estadísticas y la conversión de cada columna a valores entre 0 y 1.',
    previo: 'Es el punto de partida.',
  },
  {
    n: 2,
    titulo: 'clasificación de nodos',
    donde: 'Datos, pestaña «2. Clasificación de nodos»',
    texto: 'Indique qué columna es el objetivo, cuáles son acciones y cuáles describen el sistema, y guarde el esquema.',
    previo: 'Requiere un dataset subido.',
  },
  {
    n: 3,
    titulo: 'entrenamiento del FCM',
    donde: 'Modelo',
    texto: 'Aprenda la matriz de pesos W y revise la calidad predictiva y la estructura del mapa.',
    previo: 'Requiere el esquema guardado.',
  },
  {
    n: 4,
    titulo: 'motor prescriptivo',
    donde: 'Prescripciones',
    texto: 'Revise las acciones que el AG recomienda a cada estudiante de prueba y calcule prescripciones para un estudiante o un perfil de riesgo.',
    previo: 'Requiere un modelo entrenado.',
  },
  {
    n: 5,
    titulo: 'visualización y recomendaciones',
    donde: 'Informe',
    texto: 'Lea el reporte prescriptivo, descargue las figuras y las recomendaciones, y pida una redacción con IA.',
    previo: 'Requiere un modelo entrenado.',
  },
];

function Introduccion() {
  return (
    <>
      <Bloque id="introduccion-idea" titulo="Para qué sirve">
        <p>
          Pizarra analiza datos de estudiantes para responder dos preguntas: qué variables se asocian con el rendimiento académico o con el riesgo de{' '}
          <T a="desercion">deserción</T>, y qué cambios concretos en las acciones que sí se pueden modificar llevarían a cada estudiante a un mejor
          resultado.
        </p>
        <p>
          Para eso usa el método <T a="prv-fcm" />. Primero, un <T a="fcm">mapa cognitivo difuso (FCM)</T> aprende de los datos cuánto y en qué sentido
          influye cada variable en el <T a="objetivo">objetivo</T>. Después, un <T a="ag">algoritmo genético (AG)</T> prueba muchas combinaciones de{' '}
          <T a="accion">acciones</T> sobre ese mapa y elige, para cada estudiante, la que más lo acerca a la <T a="meta">meta</T> con el menor cambio.
        </p>
        <p>Todo corre en su equipo: los datos, el motor de cálculo y el modelo de lenguaje del asistente. Nada se envía a internet.</p>
      </Bloque>

      <Bloque id="introduccion-flujo" titulo="El flujo de cinco pasos">
        <p>La aplicación sigue cinco pasos en orden; cada uno espera la confirmación del anterior.</p>
        <ol className="space-y-3">
          {FLUJO.map((paso) => (
            <li key={paso.n} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-linea text-xs font-semibold text-tinta-2" aria-hidden>
                {paso.n}
              </span>
              <div>
                <p>
                  <Ir a={`paso-${paso.n}`}>
                    Paso {paso.n}: {paso.titulo}
                  </Ir>{' '}
                  <span className="text-sm text-tinta-2">(en {paso.donde})</span>
                </p>
                <p className="text-tinta-2">
                  {paso.texto} {paso.previo}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p>
          El <Ir a="resumen">Resumen</Ir> muestra el hallazgo principal del dataset activo y el <Ir a="asistente">Asistente</Ir> responde preguntas en
          cualquier momento.
        </p>
      </Bloque>

      <Bloque id="introduccion-recorrido" titulo="Recorrido rápido con el dataset del proyecto">
        <Pasos>
          <li>
            Abra «Datos». El <T a="dataset-proyecto">dataset del proyecto</T> (xAPI-Edu-Data, 4800 registros) ya está registrado y con su esquema
            confirmado. Pulse su nombre para leer el reporte inicial.
          </li>
          <li>
            Abra la pestaña «2. Clasificación de nodos» y observe qué columnas son acciones: manos levantadas, recursos visitados, anuncios consultados y
            grupos de discusión. No hace falta cambiar nada.
          </li>
          <li>Vaya a «Modelo», deje las opciones por defecto y pulse «Entrenar modelo». Con la validación cruzada completa tarda uno o dos minutos.</li>
          <li>En «Prescripciones», lea la tabla de métricas y pulse un estudiante para abrir su panel: mueva el simulador y pulse «Prescribir».</li>
          <li>En «Informe», lea el reporte prescriptivo y pulse «Redactar con qwen2.5».</li>
          <li>Abra el «Asistente» y pregunte, por ejemplo: «¿Qué variables influyen más en el rendimiento según el modelo?».</li>
        </Pasos>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Antes de empezar
// ---------------------------------------------------------------------------
function AntesDeEmpezar() {
  return (
    <>
      <Bloque id="antes-requisitos" titulo="Requisitos">
        <Lista>
          <li>Node.js 22 o superior.</li>
          <li>
            El entorno de Python del proyecto (<Codigo>.venv</Codigo>) con las dependencias de <Codigo>requirements.txt</Codigo>.
          </li>
          <li>
            <T a="ollama" /> con el modelo <T a="qwen" />: instálelo con <Codigo>ollama pull qwen2.5:7b</Codigo>. Solo lo necesitan el asistente, «Sugerir
            con IA» y las redacciones; todo lo demás funciona sin él.
          </li>
        </Lista>
      </Bloque>

      <Bloque id="antes-abrir" titulo="Abrir la aplicación">
        <Pasos>
          <li>
            Abra una terminal en la carpeta <Codigo>app</Codigo> del proyecto.
          </li>
          <li>
            La primera vez, ejecute <Codigo>npm install</Codigo>.
          </li>
          <li>
            Ejecute <Codigo>npm run app</Codigo>: compila la interfaz y abre el servidor.
          </li>
          <li>
            Abra <Codigo>http://localhost:3001</Codigo> en el navegador.
          </li>
        </Pasos>
        <p>
          El servidor solo atiende a este equipo. Para trabajar en la interfaz con recarga automática, use <Codigo>npm run dev</Codigo> y abra{' '}
          <Codigo>http://localhost:5173</Codigo>. Si cambia el motor de Python o el servidor, reinícielo: el motor queda abierto mientras el servidor corre.
        </p>
      </Bloque>

      <Bloque id="antes-variables" titulo="Variables de entorno opcionales">
        <p>
          Defínalas antes de <Codigo>npm run app</Codigo>. En PowerShell, por ejemplo: <Codigo>$env:PORT = '3002'</Codigo>.
        </p>
        <Defs>
          <Def t={<Codigo>PORT</Codigo>}>Puerto del servidor. Por defecto, 3001.</Def>
          <Def t={<Codigo>PYTHON</Codigo>}>
            Ruta del intérprete de Python. Por defecto, el de <Codigo>.venv</Codigo> del proyecto.
          </Def>
          <Def t={<Codigo>OLLAMA_URL</Codigo>}>
            Dirección de Ollama. Por defecto, <Codigo>http://127.0.0.1:11434</Codigo>.
          </Def>
          <Def t={<Codigo>OLLAMA_MODEL</Codigo>}>Modelo de lenguaje. Por defecto, qwen2.5:7b.</Def>
          <Def t={<Codigo>OLLAMA_NUM_CTX</Codigo>}>
            Tamaño del contexto del modelo de lenguaje: cuánto texto puede leer a la vez, en fragmentos de palabra llamados tokens. Por defecto, 8192.
          </Def>
          <Def t={<Codigo>PIZARRA_ALMACEN</Codigo>}>
            Carpeta donde se guardan los datasets y los modelos. Por defecto, <Codigo>app/almacen</Codigo>.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="antes-datos" titulo="Dónde quedan sus datos">
        <Lista>
          <li>
            Los datasets y los modelos se guardan como archivos en <Codigo>app/almacen</Codigo>, sin base de datos. Eliminar un dataset borra también sus
            modelos.
          </li>
          <li>
            Si el servidor arranca sin ningún dataset, registra el <T a="dataset-proyecto">dataset del proyecto</T> con su esquema confirmado.
          </li>
          <li>
            El navegador recuerda el dataset activo, el tema y el historial del asistente de cada dataset. Otro navegador o una ventana privada empiezan
            vacíos.
          </li>
        </Lista>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Barra lateral y barra de pasos
// ---------------------------------------------------------------------------
function Navegacion() {
  return (
    <>
      <Bloque id="navegacion-lateral" titulo="Barra lateral">
        <Defs>
          <Def t="Datos activos">
            Lista para elegir el <T a="dataset">dataset activo</T>: el que usan Resumen, Modelo, Prescripciones, Informe y el Asistente.
          </Def>
          <Def t="Secciones">
            Resumen, Datos (pasos 1 y 2), Modelo (paso 3), Prescripciones (paso 4), Informe (paso 5), Asistente y Ayuda. La sección abierta se marca con
            una línea a la izquierda.
          </Def>
          <Def t="Estado de los servicios">
            Se revisa cada 30 segundos. Un punto verde indica que el servicio está disponible y uno naranja, que no; pase el cursor por una línea para
            ver el detalle del error.
            <Lista>
              <li>«qwen2.5:7b listo»: Ollama responde y tiene el modelo.</li>
              <li>
                «Falta qwen2.5:7b»: Ollama responde, pero no tiene el modelo. Ejecute <Codigo>ollama pull qwen2.5:7b</Codigo>.
              </li>
              <li>
                «Ollama sin conexión»: abra Ollama o ejecute <Codigo>ollama serve</Codigo>.
              </li>
              <li>«Motor PRV-FCM listo» o «Motor Python detenido»: el proceso de Python que hace los cálculos.</li>
              <li>«Servidor sin conexión»: el servidor de la aplicación no responde.</li>
            </Lista>
          </Def>
          <Def t="Usar tema oscuro o claro">Cambia los colores de toda la aplicación; las gráficas se adaptan.</Def>
        </Defs>
        <p>En pantallas angostas, la barra lateral se abre con el botón de menú de la esquina superior derecha.</p>
      </Bloque>

      <Bloque id="navegacion-pasos" titulo="Barra de pasos">
        <p>Aparece arriba de cada vista del flujo. Cada tarjeta es un paso:</p>
        <Lista>
          <li>Una marca de verificación indica que el paso está hecho para el dataset activo.</li>
          <li>Un número indica que el paso está disponible.</li>
          <li>Un candado indica que el paso requiere el anterior: el paso 3 espera el esquema guardado y los pasos 4 y 5, un modelo entrenado.</li>
          <li>El paso en el que está tiene el borde más oscuro.</li>
        </Lista>
        <p>Pulse una tarjeta para ir a ese paso. Si la pulsa desde el detalle de otro dataset, ese dataset pasa a ser el activo.</p>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Paso 1
// ---------------------------------------------------------------------------
function Paso1() {
  return (
    <>
      <Bloque id="paso-1-subir" titulo="Subir un archivo">
        <Pasos>
          <li>Abra «Datos» en la barra lateral.</li>
          <li>Si quiere, escriba un nombre en «Nombre (opcional)». Si lo deja vacío, se usa el nombre del archivo.</li>
          <li>Arrastre el archivo a la zona punteada o pulse «Elegir archivo».</li>
          <li>Mientras se analizan las columnas, el botón dice «Analizando columnas…». Al terminar se abre el reporte inicial y el dataset queda activo.</li>
        </Pasos>
        <p>
          Formato esperado: una fila por estudiante y una columna por variable, con los nombres en la primera fila. Debe incluir el resultado
          (rendimiento, nota final o deserción) y al menos una acción que se pueda cambiar. Se admiten <T a="csv" /> separado por coma o por punto y coma
          y <T a="excel" /> (.xlsx, .xlsm o .xls; se usa la primera hoja con datos), hasta 50 MB.
        </p>
        <Aviso tipo="info">
          Una columna que por sí sola determina el objetivo, como la nota final cuando «desertó» se define por una nota menor que 10, se excluye de la
          sugerencia con un aviso: es una <T a="fuga">fuga de información</T>.
        </Aviso>
      </Bloque>

      <Bloque id="paso-1-lista" titulo="Lista de datasets">
        <Defs>
          <Def t="Nombre">Enlace al detalle del dataset. Debajo, el archivo de origen y, si aplica, «dataset del proyecto».</Def>
          <Def t="Registros y columnas">Tamaño del archivo.</Def>
          <Def t="Estado">
            «Esquema por revisar» (falta el paso 2), «Entrenando…», «Modelo listo» o «Sin modelo». Vea{' '}
            <Entradas a={['estado-entrenamiento']} />.
          </Def>
          <Def t="Subido">Fecha y hora de la subida.</Def>
          <Def t="Usar">Vuelve activo el dataset. Si ya lo es, dice «En uso».</Def>
          <Def t="Papelera">
            Pide confirmar «¿Eliminar con sus modelos?». Al pulsar «Eliminar» se borran el dataset y todos sus modelos; no se puede deshacer.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="paso-1-detalle" titulo="Detalle de un dataset">
        <p>
          Al pulsar un dataset se abre su detalle con cuatro pestañas: «1. Reporte inicial», «2. Clasificación de nodos», «Relaciones entre variables» y
          «Registros». Arriba, «Usar este dataset» lo vuelve activo; si ya lo es, «Ir al modelo» lleva al paso 3. El enlace «Datos» vuelve a la lista.
        </p>
      </Bloque>

      <Bloque id="paso-1-reporte" titulo="Reporte inicial">
        <Defs>
          <Def t="Dimensiones">
            Registros, columnas (numéricas y categóricas), <T a="celdas-vacias">celdas vacías</T> con su porcentaje, filas con vacíos (se descartan al
            entrenar) y <T a="filas-duplicadas">filas duplicadas</T>. Debajo, los avisos de la lectura; por ejemplo, qué hoja de Excel se leyó.
          </Def>
          <Def t="Tipos de datos y valores faltantes">
            Por columna: el <T a="tipo-pandas">tipo que detecta pandas</T>, si es <T a="categorica">numérica o categórica</T>, cuántas celdas tienen
            valor, cuántas están vacías, cuántos valores distintos tiene (<T a="no-nulos">únicos</T>) y algunos ejemplos.
          </Def>
          <Def t="Estadísticas descriptivas de las columnas numéricas">
            <T a="media-moda">Media</T>, <T a="desviacion">desviación estándar</T>, mínimo, <T a="cuartiles">cuartil 1, mediana y cuartil 3</T> y
            máximo.
          </Def>
          <Def t="Columnas categóricas">Número de categorías, la más frecuente y su frecuencia, y las primeras categorías.</Def>
          <Def t="Codificación y fuzzificación a [0, 1]">
            Las cuatro fórmulas de conversión (<T a="fuzzificacion">Min-Max</T>, <T a="ordinal">ordinal</T>, <T a="nominal">media del objetivo</T> y{' '}
            <T a="one-hot">one-hot</T>) y dos tablas. La primera lista los conceptos: identificador, columna, clase (<Clase letra="T" />, <Clase letra="P" /> o{' '}
            <Clase letra="S" />
            ), codificación, mínimo y máximo codificados y media en [0, 1]. La segunda muestra los registros ya normalizados, 12 por página; pase el
            cursor por un encabezado C1, C2… para ver el nombre de la variable.
          </Def>
        </Defs>
        <p>Al final, «Continuar al paso 2: clasificar los nodos» abre la pestaña siguiente.</p>
        <Aviso tipo="info">
          La vista codificada usa el esquema actual: si lo cambia en el paso 2, cambia aquí. Para explorar, la codificación y el Min-Max se ajustan con
          todos los registros; al entrenar, solo con los de entrenamiento.
        </Aviso>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Paso 2
// ---------------------------------------------------------------------------
function Paso2() {
  return (
    <>
      <Bloque id="paso-2-roles" titulo="Los roles">
        <p>
          Cada columna se convierte en uno o más <T a="concepto">conceptos</T> del mapa, según su <T a="rol">rol</T>. La aplicación propone una clasificación
          a partir de los nombres de las columnas; revísela siempre.
        </p>
        <Defs>
          <Def t={<>Objetivo <Clase letra="T" /></>}>
            La métrica a mejorar. Exactamente una columna, ordinal o numérica. Vea <Entradas a={['objetivo']} />.
          </Def>
          <Def t={<>Acción <Clase letra="P" /></>}>
            Lo que la institución o el estudiante pueden cambiar. Al menos una, numérica u ordinal. Vea <Entradas a={['accion']} />.
          </Def>
          <Def t={<>Mutable <Clase letra="S" /></>}>
            Cambia, pero no se controla directamente: ausencias, satisfacción. Vea <Entradas a={['mutable']} />.
          </Def>
          <Def t={<>Inmutable <Clase letra="S" /></>}>
            Fijo en el periodo: edad, género, curso. Vea <Entradas a={['inmutable']} />.
          </Def>
          <Def t="Excluida">No se usa: identificadores, texto libre, columnas redundantes o que revelan el objetivo.</Def>
        </Defs>
        <Aviso tipo="info">
          Para decidir, pregúntese: ¿la institución o el estudiante pueden cambiarla desde mañana? Acción. ¿Cambia con el tiempo, pero no por decisión
          directa? Mutable. ¿No cambia en el periodo? Inmutable. ¿Es un identificador o se conoce después del resultado? Excluida.
        </Aviso>
      </Bloque>

      <Bloque id="paso-2-tablero" titulo="Tablero de clasificación">
        <p>
          Sobre la tabla, el <T a="tablero-clasificacion">tablero</T> muestra una tarjeta por columna en cinco carriles: objetivo, acciones, mutables,
          inmutables y excluidas. Cada carril indica cuántas columnas tiene.
        </p>
        <Pasos>
          <li>Arrastre una tarjeta a otro carril para cambiar su rol.</li>
          <li>
            Con el teclado, enfoque una tarjeta con <Tecla>Tab</Tecla> y use <Tecla>←</Tecla> y <Tecla>→</Tecla> para moverla al carril vecino.
          </li>
          <li>Las reglas son las del selector de rol de la tabla: al llevar una columna al objetivo, el objetivo anterior pasa a inmutable.</li>
        </Pasos>
      </Bloque>

      <Bloque id="paso-2-tabla" titulo="La tabla de columnas">
        <Defs>
          <Def t="Columna">Nombre en el archivo y, debajo, su rango o sus categorías y los vacíos.</Def>
          <Def t="Rol">Uno de los cinco. Al marcar un nuevo objetivo, el anterior pasa a inmutable.</Def>
          <Def t="Nombre visible">
            El <T a="nombre-visible">nombre legible</T> que usan las gráficas, los reportes y el asistente.
          </Def>
          <Def t="Codificación">
            Numérica, Ordinal (label encoding), Nominal: media del objetivo, Nominal: one-hot o Número en texto (vea <Entradas a={['codificacion']} />
            ). One-hot aparece desactivada para acciones, para el objetivo y para columnas numéricas o con más de 30 categorías. Al marcar una columna
            como objetivo, una codificación que no le sirve pasa a ordinal; al marcarla como acción, una one-hot pasa a ordinal o numérica.
          </Def>
          <Def t="Orden (menor a mayor) o categorías">
            En las ordinales, mueva cada categoría con sus flechas hasta dejarlas de menor a mayor. En las one-hot, la lista de conceptos 0/1 que se
            crearán.
          </Def>
          <Def t="Dinámico">
            Solo en mutables. Márquelo para que el FCM recalcule ese concepto en lugar de conservar su valor observado (vea{' '}
            <Entradas a={['dinamico']} />). Déjelo sin marcar salvo que tenga una razón.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="paso-2-objetivo" titulo="El objetivo y sus niveles">
        <Lista>
          <li>
            Objetivo ordinal: ordene sus niveles del peor al mejor desenlace con las flechas, entre «Peor» y «Mejor». El último es el{' '}
            <T a="mejor-nivel">mejor nivel</T>, el estado deseado de la prescripción. La barra de colores de abajo muestra el tono de cada nivel en las
            gráficas.
          </li>
          <li>
            Objetivo numérico: se normaliza a [0, 1] y se agrupa en tres <T a="nivel">niveles</T>: Bajo, Medio y Alto. Si un valor menor es mejor (por
            ejemplo, un riesgo de deserción o las materias perdidas), marque «Un valor menor es mejor».
          </li>
        </Lista>
      </Bloque>

      <Bloque id="paso-2-segmento" titulo="Comparar por grupo">
        <p>
          Opcional. Elija una columna categórica y uno de sus valores: el paso 4 mostrará el éxito de la prescripción para «columna = valor» frente a
          «columna ≠ valor», con el FCM y con el bosque aleatorio. Elija «Sin segmento» para quitarlo. Vea <Entradas a={['segmento']} />.
        </p>
      </Bloque>

      <Bloque id="paso-2-resumen" titulo="Resumen de la clasificación">
        <p>
          Junto a «Objetivo» y «Comparar por grupo», «Clasificación PRV-FCM» cuenta los conceptos que tendrá el mapa, ya numerados como los verá el modelo (
          <T a="c-n">C1, C2…</T>): el objetivo <Clase letra="T" />, las acciones <Clase letra="P" /> y el sistema <Clase letra="S" /> (inmutables y
          mutables), además de cuántas columnas se excluyen.
        </p>
      </Bloque>

      <Bloque id="paso-2-guardar" titulo="Validar, sugerir y guardar">
        <Defs>
          <Def t="Barra superior">
            <T a="validacion-esquema">Valida el esquema</T> mientras edita: «Esquema válido: N filas útiles» o «N problemas que resolver antes de
            guardar». Debajo, los errores (impiden guardar) y los avisos (conviene leerlos). Indica también si hay «Cambios sin guardar».
          </Def>
          <Def t="Sugerir con IA">
            <T a="qwen" /> propone roles y nombres visibles a partir de los nombres, tipos y ejemplos de las columnas. Reemplaza el borrador, pero no lo
            guarda: revise el resultado. Requiere Ollama.
          </Def>
          <Def t="Descartar cambios">Vuelve al último esquema guardado.</Def>
          <Def t="Guardar esquema">
            Confirma la clasificación. Solo se activa si el esquema es válido y tiene cambios, o si aún no estaba confirmado. Al guardar aparece
            «Continuar al paso 3: entrenar el FCM».
          </Def>
        </Defs>
        <Aviso tipo="aviso">
          Cambiar el esquema no modifica los modelos ya entrenados: cada uno conserva el esquema con el que se entrenó. Para usar la nueva clasificación,
          vuelva a entrenar.
        </Aviso>
      </Bloque>

      <Bloque id="paso-2-errores" titulo="Errores y avisos frecuentes">
        <Defs>
          <Def t="«Marque exactamente una columna como objetivo»">Elija un objetivo en la columna «Rol».</Def>
          <Def t="«Marque al menos una columna como acción»">Elija al menos una acción: la variable que el AG puede cambiar.</Def>
          <Def t="«Una acción debe ser numérica u ordinal»">Cambie su codificación a numérica u ordinal.</Def>
          <Def t="«Hay valores no numéricos»">La columna tiene texto: use la codificación ordinal o la nominal.</Def>
          <Def t="«Faltan en el orden las categorías…»">
            Cambie la codificación a otra y de nuevo a «Ordinal (label encoding)»: el orden se rehace con todas las categorías del archivo. Después,
            ordénelas.
          </Def>
          <Def t="«Quedan N filas completas; se necesitan al menos 30»">
            Demasiados vacíos en las columnas usadas: excluya las columnas con más vacíos.
          </Def>
          <Def t="«Ningún registro está en el mejor nivel»">
            El orden del objetivo está invertido o, si es numérico, falta marcar «Un valor menor es mejor».
          </Def>
          <Def t="«Todos los registros están en el mejor nivel»">No hay a quién prescribir: revise el objetivo.</Def>
          <Def t="«… acierta el nivel de … en el 99 % de los registros»">
            Posible <T a="fuga">fuga de información</T>. Si la columna es la definición del objetivo o un dato posterior, márquela como excluida.
          </Def>
          <Def t="Otros avisos">
            Filas que se descartarán por vacíos, columnas con un solo valor, niveles con menos de 20 registros (métricas inestables), nominales con más de
            50 categorías y categorías one-hot sin indicador. No impiden guardar.
          </Def>
        </Defs>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Relaciones entre variables y registros
// ---------------------------------------------------------------------------
function Relaciones() {
  return (
    <>
      <Bloque id="relaciones-variables" titulo="Relaciones entre variables">
        <p>
          Funciona con un esquema válido aunque no esté guardado; un aviso lo indica. Las gráficas usan los valores ya codificados y se explican en{' '}
          <Ir a="graficas">Cómo leer las gráficas</Ir>.
        </p>
        <Defs>
          <Def t="Estudiantes por nivel de…">
            Cuántos registros hay en cada nivel, del peor al mejor. Un nivel muy pequeño sugiere <T a="equilibrar">equilibrar los niveles</T> en el paso 3.
          </Def>
          <Def t="Correlación de cada variable con…">
            <T a="spearman" /> de cada variable con el objetivo, de la más a la menos asociada. Azul: los valores altos de la variable van con mejores
            niveles; rojo: con peores.
          </Def>
          <Def t="Cómo cambia cada variable entre niveles">
            El <T a="perfil-medio">perfil medio de cada nivel</T>. Pase el cursor por una fila para leer las medias.
          </Def>
          <Def t="Correlaciones entre todas las variables">
            <T a="mapa-calor">Mapa de calor</T> con todos los conceptos, objetivo incluido. Elija el método: <T a="spearman" />, <T a="pearson" /> o{' '}
            <T a="correlacion-parcial">parcial</T>. Una celda gris es una variable sin variación.
          </Def>
          <Def t="Dos variables frente a frente">
            Elija el eje horizontal y el vertical (cualquier variable o el objetivo). Cada punto es un registro coloreado por su nivel; los rombos marcan
            la media de cada nivel. Pulse un nivel en la leyenda para ocultarlo o mostrarlo y acerque el cursor a un punto para ver su registro. Por
            defecto cruza las dos variables más asociadas con el objetivo. Con muchos registros se dibuja una muestra de 1500.
          </Def>
          <Def t="Una variable por nivel">
            Elija una variable: si es numérica, un <T a="histograma">histograma</T> dividido por nivel; si es categórica, el porcentaje de cada nivel en cada
            categoría.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="relaciones-registros" titulo="Registros">
        <p>
          La tabla del archivo, 25 filas por página. Pulse el encabezado de una columna para ordenar por ella; púlselo otra vez para invertir el orden.
          Con el esquema guardado, «Nivel» filtra por nivel del objetivo y la columna «nivel» muestra el de cada registro. El{' '}
          <T a="id-estudiante">id</T> es la fila del archivo, empezando en 0: es el número que piden el perfil de riesgo y el asistente.
        </p>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Paso 3
// ---------------------------------------------------------------------------
function Paso3() {
  return (
    <>
      <Bloque id="paso-3-vista" titulo="La vista Modelo">
        <p>
          Requiere el esquema guardado. A la izquierda está el formulario «Entrenar»; a la derecha, «Progreso». El formulario parte de las opciones del
          último entrenamiento terminado. Debajo aparecen los resultados del modelo y la lista de entrenamientos.
        </p>
      </Bloque>

      <Bloque id="paso-3-metodo" titulo="Método de extracción de la matriz de pesos W">
        <p>
          Elige cómo se aprende <T a="w">W</T>, la influencia de cada concepto sobre los demás:
        </p>
        <Defs>
          <Def t="BPTT (recomendado)">
            <T a="bptt">Gradiente exacto</T> a través de las iteraciones del FCM y optimizador <T a="lbfgsb" /> con W en [−1, 1]. Es el más preciso (72 %
            en el dataset del proyecto) y el más lento.
          </Def>
          <Def t="Regresión Ridge">
            <T a="ridge">Regresión lineal con penalización L2</T> por concepto dinámico; <T a="tanh">tanh</T> trunca los pesos a (−1, 1). Instantánea; 71 %.
          </Def>
          <Def t="Regresión Lasso">
            <T a="lasso">Penalización L1</T>: anula los pesos débiles y deja un mapa más simple. Instantánea; 71 %.
          </Def>
          <Def t="Correlación parcial">
            Cada peso es la <T a="correlacion-parcial">correlación parcial</T> del par, dados los demás. Describe la estructura, pero no calibra la inferencia: 48 %.
          </Def>
        </Defs>
        <p>El apartado plegable «Cómo se construye y se usa W» muestra sus fórmulas; también están en <Ir a="formulas">Fórmulas</Ir>.</p>
      </Bloque>

      <Bloque id="paso-3-equilibrar" titulo="Equilibrar los niveles del objetivo">
        <p>
          Marque «Equilibrar los niveles del objetivo al aprender W» cuando un nivel sea mucho menos frecuente que los demás, como en la deserción. Cada
          registro pesa según la frecuencia de su nivel y λ y α se eligen por <T a="exactitud-equilibrada">exactitud equilibrada</T>. Sin entrenamientos previos, se activa sola
          si un nivel es menos del 25 % de los registros, y el texto de ayuda dice cuál. No aplica a la correlación parcial. Vea{' '}
          <Entradas a={['equilibrar']} />.
        </p>
      </Bloque>

      <Bloque id="paso-3-mascara" titulo="Máscara de dirección causal">
        <Pasos>
          <li>Abra «Máscara de dirección causal (opcional)».</li>
          <li>
            La tabla tiene una fila por concepto de origen (acciones, mutables e inmutables) y una columna por concepto de destino (los dinámicos y el
            objetivo). Cada casilla es una <T a="arista">arista</T> que la <T a="estructura">estructura del mapa</T> permite; un guion indica que no existe.
          </li>
          <li>Desmarque las conexiones que considere lógicamente imposibles. El contador indica cuántas aristas quedan permitidas.</li>
          <li>«Permitir todas» las vuelve a marcar; «Quitar inmutables hacia el objetivo» desmarca de una vez las de los inmutables.</li>
        </Pasos>
        <Aviso tipo="aviso">
          Una arista excluida queda con peso 0 y los demás pesos se reajustan sin ella. Como la regla no tiene <T a="sesgo">sesgo</T>, quitar inmutables suele
          bajar la exactitud. Vea <Entradas a={['mascara']} />.
        </Aviso>
      </Bloque>

      <Bloque id="paso-3-validacion" titulo="Selección de λ y α">
        <p>
          Elige cómo se escogen la pendiente <T a="lambda">λ</T> y la regularización <T a="alfa">α</T> con <T a="validacion-cruzada">validación cruzada</T>:
        </p>
        <Defs>
          <Def t="Completa">6 valores de λ (0,5; 1; 2; 3; 5 y 10) y 3 de α (0,0001; 0,001 y 0,01), con 5 pliegues. Uno o dos minutos con BPTT.</Def>
          <Def t="Rápida">λ de 0,5; 1 y 2 con α = 0,001 y 3 pliegues. Unos segundos.</Def>
          <Def t="Sin validación">Usa λ = 1 y α = 0,001 directamente.</Def>
        </Defs>
      </Bloque>

      <Bloque id="paso-3-opciones" titulo="Otras opciones">
        <Defs>
          <Def t="División">
            <T a="division-agrupada">Agrupada por perfil</T> (recomendada) o <T a="division-aleatoria">aleatoria</T>.
          </Def>
          <Def t="Datos de prueba (%)">
            Proporción de registros que se reserva para la <T a="entrenamiento-prueba">prueba</T>: de 10 a 50, de 5 en 5; 30 por defecto, como en los
            artículos.
          </Def>
          <Def t="Penalización del esfuerzo (β)">
            De 0 a 5; 0,05 por defecto. 0,05 busca el máximo efecto; 0,4 da cambios moderados. Vea <Entradas a={['beta']} />.
          </Def>
          <Def t="Cambio máximo por acción">
            Fracción del rango de cada acción, de 0 a 1. Vacío: sin límite. Vea <Entradas a={['cambio-maximo']} />.
          </Def>
          <Def t="Permitir recomendar valores menores que los actuales">
            Sin marcar, el AG solo mantiene o aumenta las acciones. Vea <Entradas a={['permitir-reducciones']} />.
          </Def>
          <Def t="Algoritmo genético y semilla">
            Apartado plegable. <T a="poblacion">Población</T> (50), <T a="generacion">Generaciones</T> (100), <T a="cruce">Tasa de cruce</T> (0,9),{' '}
            <T a="mutacion">Tasa de mutación</T> (0,25), tipo de cruce (Uniforme o Un punto) y <T a="semilla" /> (42). Un campo vacío usa el valor por
            defecto, que se ve en gris.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="paso-3-progreso" titulo="Entrenar y seguir el progreso">
        <p>Pulse «Entrenar modelo». El panel «Progreso» marca cada etapa:</p>
        <Pasos>
          <li>Lectura de datos.</li>
          <li>División y codificación: separa entrenamiento y prueba y ajusta la codificación y el Min-Max.</li>
          <li>Validación cruzada, con una barra de avance.</li>
          <li>Extracción de W y aprendizaje del FCM.</li>
          <li>Prescripción con el AG para cada estudiante de prueba fuera del mejor nivel, con una barra de avance.</li>
          <li>Evaluación: métricas, bosque aleatorio y segmentos.</li>
          <li>Figuras del informe.</li>
        </Pasos>
        <p>
          Puede cambiar de vista o recargar la página: el entrenamiento sigue y el progreso se retoma. Mientras entrena, el botón queda desactivado. Si
          falla, el error aparece al final de la lista.
        </p>
      </Bloque>

      <Bloque id="paso-3-calidad" titulo="Calidad predictiva">
        <p>El FCM predice el nivel de los registros de prueba, que no vio al entrenar.</p>
        <Defs>
          <Def t="Exactitud del FCM">
            Porcentaje de niveles acertados. Vea <Entradas a={['exactitud']} />.
          </Def>
          <Def t="Exactitud equilibrada">
            Media del recall de cada nivel. Vea <Entradas a={['exactitud-equilibrada']} />.
          </Def>
          <Def t="F1 macro">
            Promedio del F1 de los niveles. Vea <Entradas a={['f1']} />.
          </Def>
          <Def t="Clase mayoritaria">
            La línea base trivial que hay que superar. Vea <Entradas a={['clase-mayoritaria']} />.
          </Def>
          <Def t="Bosque aleatorio">
            Exactitud del modelo externo de referencia. Vea <Entradas a={['bosque']} />.
          </Def>
          <Def t="Método de W">Método usado y, debajo, si se equilibraron los niveles y cuántas aristas se excluyeron («Sin máscara» si ninguna).</Def>
          <Def t="λ y α">Valores elegidos.</Def>
          <Def t="Entrenamiento y prueba">
            Registros de cada parte y <T a="perfiles-compartidos">perfiles compartidos</T>.
          </Def>
        </Defs>
        <p>
          Debajo: la gráfica «Selección de λ por validación cruzada» (o un aviso si se entrenó sin validación), la <T a="matriz-confusion">matriz de confusión</T> y la tabla
          «Por nivel» con <T a="precision">precisión</T>, <T a="recall">recall</T>, F1 y número de estudiantes (<T a="soporte">soporte</T>).
        </p>
        <Aviso tipo="info">
          Un modelo útil supera con claridad a la clase mayoritaria. El bosque aleatorio suele acertar más porque no tiene que ser interpretable: la
          distancia entre ambos es lo que cuesta poder leer el modelo.
        </Aviso>
      </Bloque>

      <Bloque id="paso-3-estructura" titulo="Estructura aprendida">
        <Lista>
          <li>
            El mapa interactivo del FCM, con el objetivo al centro. Se explica en <Ir a="graficas-mapa">Cómo leer las gráficas</Ir>.
          </li>
          <li>
            «Matriz de adyacencia W aprendida»: un <T a="mapa-calor">mapa de calor</T> con el peso de cada arista. Con «Matriz completa n × n» marcada se ven todas las
            columnas; sin marcar, solo las que reciben aristas.
          </li>
          <li>«Todos los pesos hacia el objetivo»: barras con el peso de cada concepto, de la más fuerte a la más débil.</li>
          <li>«Continuar al paso 4: motor prescriptivo», si el modelo en pantalla es el activo.</li>
        </Lista>
        <Aviso tipo="aviso">
          Los inmutables con pesos grandes suelen compensar la falta de <T a="sesgo">sesgo</T> de la regla: no son causas. Lea los pesos como{' '}
          <T a="asociacion">asociaciones</T>.
        </Aviso>
      </Bloque>

      <Bloque id="paso-3-historial" titulo="Entrenamientos">
        <p>
          Lista de los entrenamientos del dataset, del más reciente al más antiguo. Cada fila muestra la fecha (púlsela para ver ese modelo en pantalla),
          el estado («Listo», «Entrenando», «Con error» o «Interrumpido»), el método de W, si se equilibraron los niveles, la validación («CV completa»,
          «CV rápida» o «sin CV»), β, las aristas excluidas y la duración. «(en pantalla)» marca el que se está viendo. La papelera lo elimina tras
          confirmar.
        </p>
        <p>
          El más reciente terminado es el <T a="modelo-activo">modelo activo</T>: el que usan el Resumen, las Prescripciones, el Informe y el Asistente.
        </p>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Paso 4
// ---------------------------------------------------------------------------
function Paso4() {
  return (
    <>
      <Bloque id="paso-4-metricas" titulo="Métricas de la prescripción">
        <p>
          Al entrenar, el AG ya prescribió acciones a los estudiantes de prueba que no están en el mejor nivel. La frase principal compara cuántos ubica
          el FCM en el mejor nivel con las acciones prescritas y con las actuales, y cuántos confirma el <T a="bosque">bosque aleatorio</T>.
        </p>
        <Defs>
          <Def t="Éxito prescriptivo (PSR, FCM)">
            <T a="psr" /> con las acciones actuales y con las prescritas.
          </Def>
          <Def t="En el mejor nivel según el bosque aleatorio">
            La misma cuenta con el modelo independiente: la cifra prudente (<T a="validacion-externa">validación externa</T>).
          </Def>
          <Def t="MAE respecto al estado deseado, MSE y RMSE">
            Distancia media entre la activación final del objetivo y la meta. Menor es mejor. Vea <Entradas a={['mae', 'mse', 'rmse']} />.
          </Def>
        </Defs>
        <p>
          Debajo de la tabla: el <T a="cambio-medio">cambio medio por acción</T>, las generaciones medias del AG y β. El apartado plegable «Cómo decide el algoritmo genético»
          muestra la <T a="funcion-costo">función de costo</T> y los parámetros con que se entrenó.
        </p>
      </Bloque>

      <Bloque id="paso-4-graficas" titulo="Qué propone el algoritmo genético">
        <Defs>
          <Def t="Activación del objetivo antes y después de prescribir">
            Cada estudiante ordenado por su activación actual (línea azul) y su activación con la prescripción (puntos naranjas). Sobre la línea
            horizontal queda en el mejor nivel.
          </Def>
          <Def t="Acciones: nivel medio actual y recomendado">Media de cada acción, en unidades originales.</Def>
          <Def t="Estudiantes que llegan a…, por grupo">
            Solo si definió un <T a="segmento">segmento</T>: el porcentaje que llega al mejor nivel en cada grupo, según el FCM y según el bosque.
          </Def>
          <Def t="Convergencia del algoritmo genético">
            Mediana y rango intercuartílico del mejor costo por generación. Vea <Entradas a={['convergencia-ag']} />.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="paso-4-tabla" titulo="Por estudiante">
        <p>
          La descripción muestra la <T a="prob-mejor">probabilidad media del mejor nivel</T> según el bosque, antes y después. La tabla tiene 20
          estudiantes por página:
        </p>
        <Defs>
          <Def t="Filtros">
            «Nivel observado» (los niveles que recibieron prescripción) y «Llega al mejor nivel» (Sí o No, según el FCM con la prescripción).
          </Def>
          <Def t="Columnas">
            Estudiante (su <T a="id-estudiante">id</T>), nivel observado, cada acción como «actual → recomendado» con el cambio debajo, «FCM actual» y
            «FCM prescrito» (activación y nivel predicho).
          </Def>
          <Def t="Ordenar">Pulse un encabezado para ordenar; otra vez, para invertir el orden.</Def>
          <Def t="Abrir un estudiante">Pulse una fila o el número del estudiante para abrir su panel.</Def>
        </Defs>
      </Bloque>

      <Bloque id="paso-4-panel" titulo="Panel del estudiante">
        <Pasos>
          <li>Arriba: el nivel observado y si el estudiante está en el conjunto de prueba o en el de entrenamiento.</li>
          <li>
            Un <T a="medidor">medidor</T> «FCM con las acciones actuales».
          </li>
          <li>
            «Simulador de acciones»: mueva los controles de cada acción y aparece un segundo medidor, «FCM con las acciones del simulador». «Restablecer»
            vuelve a las acciones actuales. Vea <Entradas a={['simulador']} />.
          </li>
          <li>
            «Inferencia paso a paso»: la activación del objetivo en cada <T a="iteracion">iteración</T>, con las acciones actuales y con las del simulador.
            Elija una iteración con las flechas, el control deslizante o un clic en la gráfica para ver su cuenta. Vea <Entradas a={['inferencia-paso-a-paso']} />.
          </li>
          <li>
            «Prescripción con el algoritmo genético»: elija la <T a="meta">meta</T>, la penalización del esfuerzo (de 0 a 1; 0,4 por defecto) y el cambio
            máximo (a la derecha, sin límite), y pulse «Prescribir». Las reducciones siguen la opción del entrenamiento.
          </li>
          <li>Con el resultado, «Probar en el simulador» copia las acciones recomendadas a los controles.</li>
          <li>«Preguntar al asistente por este estudiante» abre el Asistente con la pregunta ya enviada.</li>
          <li>«Todos sus datos» despliega el registro completo.</li>
        </Pasos>
        <p>
          Cierre el panel con la X, con la tecla <Tecla>Esc</Tecla> o pulsando fuera de él.
        </p>
      </Bloque>

      <Bloque id="paso-4-perfil" titulo="Perfil de riesgo">
        <p>
          Describa el estado de un individuo, real o hipotético, y el AG calcula qué valores deben tomar las acciones para llegar a la meta. Vea{' '}
          <Entradas a={['perfil-riesgo']} />.
        </p>
        <Pasos>
          <li>
            Punto de partida: el formulario abre con el <T a="perfil-tipico">perfil típico</T>. «Perfil típico» lo restaura; para partir de un registro, escriba su fila
            en «Estudiante (fila)» y pulse «Cargar».
          </li>
          <li>
            Edite cualquier valor en los grupos «Sistema inmutable», «Sistema mutable» y «Acciones» (valores actuales; el AG propone los nuevos). Las
            categorías se eligen de una lista y los números se escriben (un campo vacío muestra el rango observado).
          </li>
          <li>
            Elija la «Meta en el objetivo», el «Costo de intervención (β)» (de 0 a 1; 0,4 por defecto; mayor da cambios más pequeños), el «Cambio máximo
            por acción» (al extremo derecho, sin límite) y si quiere «Permitir reducir acciones».
          </li>
          <li>Pulse «Calcular la prescripción». El resultado aparece a la derecha (o debajo, en pantallas angostas).</li>
        </Pasos>
        <Aviso tipo="info">
          Sirve para preguntas del tipo «¿qué necesitaría un estudiante con muchas ausencias para llegar al mejor nivel?»: cargue un perfil, cambie las
          ausencias y calcule.
        </Aviso>
      </Bloque>

      <Bloque id="paso-4-resultado" titulo="Leer una prescripción individual">
        <Defs>
          <Def t="Medidores">«FCM con las acciones actuales» y «FCM con las acciones prescritas»: activación final y nivel.</Def>
          <Def t="Meta del AG">
            Nivel meta, su activación ± la <T a="tolerancia">tolerancia</T>, si la prescripción la alcanza, las generaciones que usó el AG y β.
          </Def>
          <Def t="Tabla de acciones">
            «Acción (C_P)», «Actual», «Recomendada», «Cambio» en unidades originales y «Del rango» (vea <Entradas a={['del-rango']} />). «igual» indica que no
            cambia.
          </Def>
          <Def t="Reporte prescriptivo">
            Frases con cada cambio, las acciones sin cambio, el resultado estimado, los <T a="frenos">factores que frenan</T> y la nota de causalidad.
            Vea <Entradas a={['reporte-prescriptivo']} />.
          </Def>
          <Def t="Evolución del algoritmo genético">
            Reproduce el historial del AG al abrirse el resultado (sin animación si el sistema pide reducir el movimiento). «Pausar», «Reproducir»,
            «Ir al final» y el control deslizante eligen la generación. Muestra el mejor costo, el costo medio, el objetivo con el mejor individuo, la
            curva «Costo por generación» y las barras «Acciones actuales y prescritas por el modelo»; antes de la última generación, las barras son las
            mejores acciones de esa generación. Si el AG se detuvo antes del máximo, lo indica. Vea <Entradas a={['evolucion-ag']} />.
          </Def>
          <Def t="Qué empuja al objetivo">
            <T a="aporte">Aporte</T> de cada concepto con las acciones actuales y con el plan.
          </Def>
          <Def t="Recomendación redactada con IA">
            Pulse «Redactar con qwen2.5» para convertir la prescripción en prácticas concretas. Vea <Entradas a={['redaccion']} />.
          </Def>
        </Defs>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Paso 5
// ---------------------------------------------------------------------------
function Paso5() {
  return (
    <>
      <Bloque id="paso-5-encabezado" titulo="Encabezado y descarga">
        <p>
          El encabezado resume el modelo activo: dataset, método de W, λ y exactitud en prueba. «Recomendaciones (CSV)» descarga las prescripciones de
          todos los estudiantes de prueba (vea <Entradas a={['recomendaciones-csv']} />).
        </p>
      </Bloque>

      <Bloque id="paso-5-reporte" titulo="Reporte prescriptivo del conjunto de prueba">
        <Lista>
          <li>«Nivel observado» limita el reporte a los estudiantes de un nivel; «Todos» los incluye a todos.</li>
          <li>El texto resume cuántos llegan al mejor nivel, la recomendación más frecuente y el resultado por nivel; cada cifra sale de las prescripciones.</li>
          <li>
            «Qué cambia en cada acción»: media actual y recomendada, y los porcentajes «Aumenta en» y «Sin cambio en» (vea <Entradas a={['aumenta']} />
            ).
          </li>
          <li>«Por nivel observado» (con más de un nivel): registros, activación actual, activación con la prescripción y porcentaje que llega al mejor nivel.</li>
          <li>«Estudiantes con más mejora»: los cinco con mayor aumento de activación; pulse uno para abrir su panel.</li>
          <li>A la derecha, las acciones medias actual y recomendada en una gráfica.</li>
          <li>
            «Recomendaciones institucionales con IA»: qwen2.5 redacta un plan para docentes y directivos a partir del resumen (del nivel elegido). Revíselo
            antes de compartirlo.
          </li>
        </Lista>
      </Bloque>

      <Bloque id="paso-5-figuras" titulo="Figuras del informe">
        <Lista>
          <li>«Grafo del mapa cognitivo»: el mapa como <T a="grafo">grafo dirigido</T>, dibujado con NetworkX y matplotlib.</li>
          <li>«Convergencia del algoritmo genético»: la versión interactiva y la figura de matplotlib.</li>
          <li>
            «Otras figuras del informe»: el objetivo antes y después de prescribir, la matriz de pesos, las acciones actual y recomendada y la selección de
            λ.
          </li>
        </Lista>
        <p>
          Cada <T a="figuras">figura</T> tiene un botón «PNG» para descargarla. Si un modelo se entrenó antes de que existieran las figuras, un aviso pide
          volver a entrenarlo.
        </p>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------
function Resumen() {
  return (
    <Bloque id="resumen-pagina" titulo="La página de inicio">
      <p>Arriba, la barra de pasos con el paso que sigue. Debajo, un mensaje según el estado del dataset activo:</p>
      <Lista>
        <li>Sin datos: «Subir un dataset».</li>
        <li>Con el esquema sin confirmar: «Revisar el esquema».</li>
        <li>Sin modelo: «Entrenar el modelo».</li>
        <li>
          Con un modelo: el hallazgo principal. Qué porcentaje de los estudiantes de prueba por debajo del mejor nivel llegaría a él con las acciones
          prescritas según el FCM, cuántos lo logran hoy y la cifra prudente del bosque aleatorio. Botones «Ver prescripciones» y «Preguntar al
          asistente».
        </li>
      </Lista>
      <p>
        Con un modelo también aparecen cuatro datos (exactitud del FCM en prueba con la clase mayoritaria, bosque aleatorio, pendiente elegida λ y fecha
        de entrenamiento), el mapa del FCM y dos gráficas: «Qué cambia la prescripción, en promedio» y «Qué más influye en…», con los ocho pesos más
        fuertes. Sin modelo, a la derecha se ve la distribución del objetivo.
      </p>
    </Bloque>
  );
}

// ---------------------------------------------------------------------------
// Asistente
// ---------------------------------------------------------------------------
const HERRAMIENTAS: [string, string][] = [
  ['Resumen de los datos', 'Registros, objetivo con sus niveles y variables por rol.'],
  ['Métricas del modelo', 'Exactitud, λ, PSR antes y después, bosque aleatorio, segmentos y cambio medio de cada acción.'],
  ['Pesos del mapa cognitivo', 'Influencias hacia el objetivo, de la más fuerte a la más débil, con una gráfica.'],
  ['Estadísticas de una variable', 'Distribución por nivel y correlación con el objetivo, con una gráfica.'],
  ['Búsqueda de estudiantes', 'Estudiantes de un nivel o que cumplen condiciones (=, !=, <, <=, >, >= o contiene).'],
  ['Análisis de un estudiante', 'Sus datos, el nivel que predice el FCM y los planes moderado y máximo, en una tarjeta.'],
  ['Simulación de un estudiante', 'El nivel que alcanzaría con otras acciones, en una tarjeta.'],
  ['Prescripción de un perfil de riesgo', 'Parte del perfil típico (o de un estudiante) con los cambios que pida, en una tarjeta.'],
  ['Resumen de las prescripciones', 'Cuántos llegan al mejor nivel y qué acciones se recomiendan, también por nivel, con una gráfica.'],
  ['Correlaciones entre variables', 'Todas las variables entre sí y con el objetivo, con un mapa de calor.'],
  ['Relación entre dos variables', 'Spearman y media (o categoría más frecuente) por nivel, con un diagrama de dispersión.'],
];

function Asistente() {
  return (
    <>
      <Bloque id="asistente-uso" titulo="Cómo preguntar">
        <Lista>
          <li>
            Escriba en el cuadro inferior. <Tecla>Enter</Tecla> envía y <Tecla>Mayús</Tecla> + <Tecla>Enter</Tecla> salta de línea.
          </li>
          <li>Sin conversación, aparecen preguntas sugeridas: púlselas para enviarlas.</li>
          <li>«Detener» corta una respuesta en curso. «Nueva conversación» borra el historial de este dataset.</li>
          <li>
            Sobre cada respuesta se listan las consultas («Consultó: …») y, cuando aplica, gráficas y tarjetas con cifras del modelo. Vea{' '}
            <Entradas a={['herramientas']} />.
          </li>
          <li>Trabaja con el dataset activo y su modelo. El historial se guarda en este navegador, por dataset (los últimos 30 mensajes).</li>
          <li>
            Solo responde sobre rendimiento académico, deserción, el modelo PRV-FCM y el uso de la aplicación (vea <Entradas a={['guardia']} />
            ).
          </li>
          <li>Una respuesta tarda de 5 a 10 segundos; la primera puede tardar más mientras Ollama carga el modelo.</li>
        </Lista>
      </Bloque>

      <Bloque id="asistente-herramientas" titulo="Qué puede consultar">
        <p>El asistente elige entre 11 consultas según la pregunta:</p>
        <Defs>
          {HERRAMIENTAS.map(([nombre, texto]) => (
            <Def key={nombre} t={nombre}>
              {texto}
            </Def>
          ))}
        </Defs>
        <p>
          En las tarjetas de un estudiante, el <T a="plan">plan moderado</T> usa β = 0,4 y el plan máximo, el β del entrenamiento.
        </p>
      </Bloque>

      <Bloque id="asistente-ejemplos" titulo="Preguntas de ejemplo">
        <Lista>
          <li>«¿Qué variables influyen más en el rendimiento según el modelo?»</li>
          <li>«Analiza al estudiante 14 y dame recomendaciones concretas.»</li>
          <li>«¿Qué pasaría con el estudiante 14 si levanta la mano 60 veces?»</li>
          <li>«Usa un perfil de riesgo: un estudiante típico con más de 7 ausencias. ¿Qué le recomienda el algoritmo genético?»</li>
          <li>«¿Qué recomendaciones generales da el modelo para los estudiantes del nivel más bajo?»</li>
          <li>«¿Cómo se relacionan las ausencias con el rendimiento?»</li>
          <li>«¿Qué tan confiable es el modelo? Explícamelo en palabras simples.»</li>
        </Lista>
        <Aviso tipo="aviso">
          El asistente puede equivocarse al redactar. Las cifras de sus tarjetas y gráficas salen del modelo: compárelas con el texto.
        </Aviso>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Cómo leer las gráficas
// ---------------------------------------------------------------------------
function Graficas() {
  return (
    <>
      <Bloque id="graficas-comunes" titulo="Lo común a todas">
        <Lista>
          <li>«Ver tabla» cambia la gráfica por una tabla con los mismos datos; «Ver gráfica» (o «Ver mapa») la devuelve.</li>
          <li>Pase el cursor, o recorra con la tecla Tab donde se indica, para leer los valores exactos.</li>
          <li>
            Azul es positivo: acerca al mejor nivel o indica una relación directa. Rojo es negativo: aleja del mejor nivel o indica una relación inversa.
            Gris es un valor cercano a 0.
          </li>
          <li>Los niveles del objetivo usan una rampa de azules ordenada del peor al mejor; la leyenda de cada gráfica indica el color de cada nivel.</li>
          <li>En las comparaciones, azul es lo actual (antes) y naranja lo recomendado o prescrito (después).</li>
        </Lista>
      </Bloque>

      <Bloque id="graficas-barras" titulo="Barras">
        <Defs>
          <Def t="Estudiantes por nivel">Una barra por nivel, del peor al mejor, con el número de estudiantes; el globo indica su porcentaje.</Def>
          <Def t="Barras divergentes">
            En las correlaciones y los pesos, una barra horizontal por variable, de la más fuerte a la más débil. Hacia la derecha del 0 (azul) empuja al
            mejor nivel; hacia la izquierda (rojo), al peor. El número de cada barra es su valor.
          </Def>
          <Def t="Una variable por nivel">
            Numérica: un histograma con cada barra dividida por nivel. Categórica: una barra por categoría con el porcentaje de cada nivel, que suma 100 %.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="graficas-mancuernas" titulo="Mancuernas: antes y después">
        <p>
          Una fila por acción o grupo, con un punto azul (actual), uno naranja (recomendado) y una línea entre ambos. A la derecha, el valor final y el
          cambio entre paréntesis. Cada acción usa su propia escala, de su mínimo a su máximo observados; los porcentajes por grupo y los aportes comparten
          una escala, y los aportes tienen una línea vertical en 0. Pase el cursor por una fila para leer los dos valores.
        </p>
      </Bloque>

      <Bloque id="graficas-calor" titulo="Mapa de calor y matriz W">
        <p>
          Filas y columnas son conceptos (identificador y nombre). El color de cada celda es su valor entre −1 y 1. Al pasar el cursor, un globo dice
          «fila → columna» y el valor. En la matriz W, la fila es el origen y la columna el destino, y una celda gris es una arista que no existe. Con
          muchos conceptos, los identificadores de las columnas se inclinan y el número de cada celda se lee en el globo o en la tabla.
        </p>
      </Bloque>

      <Bloque id="graficas-dispersion" titulo="Dispersión y perfil por nivel">
        <Defs>
          <Def t="Dos variables frente a frente">
            Un punto por registro, del color de su nivel; los rombos son las medias de cada nivel. En un eje categórico, los puntos se separan un poco al
            azar para que no se tapen. La leyenda oculta o muestra niveles y la tabla resume cada nivel.
          </Def>
          <Def t="Perfil medio de cada nivel">
            Una fila por variable con un punto por nivel en la escala [0, 1] y una línea gris entre la media menor y la mayor. Arriba, las variables que
            más suben del peor al mejor nivel; abajo, las que más bajan.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="graficas-mapa" titulo="Mapa del FCM">
        <Lista>
          <li>El objetivo está al centro, en un círculo oscuro. Los demás conceptos lo rodean, agrupados por rol con un rótulo: Acciones, Mutables e Inmutables.</li>
          <li>Formas: un cuadrado oscuro es una acción, un círculo hueco un mutable y un punto gris un inmutable. Los mutables dinámicos van en un anillo interior.</li>
          <li>El grosor de cada flecha es la fuerza del peso hacia el objetivo y su color, el signo: azul acerca al mejor nivel y rojo aleja.</li>
          <li>Pase el cursor o recorra los conceptos con la tecla Tab: el texto de abajo da el peso exacto y su sentido.</li>
          <li>«Ver tabla» lista los pesos hacia el objetivo, del más fuerte al más débil.</li>
        </Lista>
      </Bloque>

      <Bloque id="graficas-modelo" titulo="Gráficas del modelo">
        <Defs>
          <Def t="Matriz de confusión">
            Filas: nivel real. Columnas: nivel que predice el FCM. El tono indica el porcentaje de la fila; los aciertos están en la diagonal, en negrita.
          </Def>
          <Def t="Selección de λ por validación cruzada">
            El eje horizontal es λ en escala logarítmica y el vertical, la exactitud (o la exactitud equilibrada) media de validación. La línea azul es
            el α elegido, con una banda de ± 1 desviación; las grises son los otros α; la línea gris horizontal es la clase mayoritaria. Con niveles
            equilibrados no se dibujan la banda ni la clase mayoritaria.
          </Def>
          <Def t="Activación del objetivo antes y después">
            Línea azul: la activación actual de cada estudiante, ordenada. Puntos naranjas: la activación con la prescripción. Línea horizontal: el umbral
            del mejor nivel (1 menos la tolerancia).
          </Def>
          <Def t="Convergencia del AG">
            En el paso 4 y el Informe, la mediana del mejor costo por generación entre estudiantes, con la banda de los cuartiles 1 y 3. En una
            prescripción individual («Costo por generación»), el mejor costo (azul) y el costo medio de la población (naranja), que se dibujan hasta la
            generación elegida.
          </Def>
          <Def t="Inferencia paso a paso">
            Eje horizontal: la iteración t; vertical: la activación del objetivo, de 0 a 1, sobre las bandas de los niveles. Azul con las acciones
            actuales, naranja con las del simulador; la línea vertical marca la iteración cuya cuenta se muestra debajo.
          </Def>
          <Def t="Acciones actuales y prescritas">
            Una pareja de barras por acción: la actual (azul) y la prescrita o la mejor de la generación elegida (naranja), como fracción del rango de la
            acción; la etiqueta da el valor en sus unidades.
          </Def>
          <Def t="Medidor">
            Barra de 0 a 1 con las zonas de los niveles y un punto en la activación final. Vea <Entradas a={['medidor']} />.
          </Def>
        </Defs>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fórmulas
// ---------------------------------------------------------------------------
function Formulas() {
  return (
    <>
      <Bloque id="formulas-datos" titulo="Codificación y normalización">
        <Formula lectura="Fuzzificación Min-Max: 0 es el mínimo observado y 1 el máximo.">x′ = (x − mín) / (máx − mín)</Formula>
        <Formula lectura="Ordinal: posición en el orden definido y luego Min-Max.">«Bajo», «Medio», «Alto» → 0, 1, 2 → 0; 0,5; 1</Formula>
        <Formula lectura="Nominal con media del objetivo: n_c registros de la categoría, media_c su media del objetivo normalizado y media_global la de todos.">
          x = (n_c · media_c + 10 · media_global) / (n_c + 10)
        </Formula>
        <Formula lectura="One-hot: un concepto 0/1 por categoría.">Topic = IT → [IT: 1, Math: 0, …]</Formula>
      </Bloque>

      <Bloque id="formulas-inferencia" titulo="Inferencia del FCM">
        <Formula lectura="Regla de Kosko modificada: solo los conceptos dinámicos se actualizan; los demás quedan fijos. k1 = k2 = 1.">
          A_i(t+1) = f( k2·A_i(t) + k1·Σ_j w_ji·A_j(t) )
        </Formula>
        <Formula lectura="Sigmoide con pendiente λ.">f(x) = 1 / (1 + e^(−λx))</Formula>
        <Formula lectura="Convergencia: se detiene cuando ningún cambio supera 0,00001, o a las 100 iteraciones.">máx_i |A_i(t+1) − A_i(t)| {'<'} 0,00001</Formula>
        <Formula lectura="Nivel predicho: el nivel cuyo valor normalizado está más cerca de la activación final.">nivel = argmin_nivel |A*_T − valor(nivel)|</Formula>
        <Formula lectura="Cuenta de «Inferencia paso a paso»: la entrada del objetivo en cada iteración se separa en memoria, influencia de las acciones (constante, porque las acciones quedan fijas) e influencia del resto de conceptos.">
          x_T(t) = k2·A_T(t−1) + k1·Σ_acciones w·a + k1·Σ_resto w·A(t−1),   A_T(t) = f(x_T(t))
        </Formula>
      </Bloque>

      <Bloque id="formulas-pesos" titulo="Aprendizaje de W">
        <Formula lectura="BPTT: error cuadrático ponderado del objetivo tras 30 iteraciones más la penalización L2; L-BFGS-B mantiene cada peso en [−1, 1].">
          L(W) = media_r [ v_r · (A_T,r − y_r)² ] + α · Σ w²
        </Formula>
        <Formula lectura="Ridge y Lasso: z es lo que debe sumar la influencia para que el valor observado y sea un punto fijo de la regla; y se recorta antes a [0,05; 0,95].">
          z = ( logit(y)/λ − k2·y ) / k1 ≈ Σ_j w_ji·x_j
        </Formula>
        <Formula lectura="Penalizaciones: Ridge (L2) y Lasso (L1), sin intercepto; n es el número de registros.">
          Ridge: ‖z − X·w‖² + α·n·‖w‖²     Lasso: ‖z − X·w‖² / (2n) + α·‖w‖₁
        </Formula>
        <Formula lectura="Truncamiento de los coeficientes de la regresión al rango de un peso.">w_ji = tanh(β_j) ∈ (−1, 1)</Formula>
        <Formula lectura="Correlación parcial: P es la inversa de la matriz de covarianzas, con contracción de Ledoit-Wolf.">w_ji = −P_ji / √(P_jj · P_ii)</Formula>
        <Formula lectura="Pesos de los registros al equilibrar los niveles: n registros, k niveles y n_nivel registros del nivel del registro.">
          v_r = n / (k · n_nivel), con media 1
        </Formula>
      </Bloque>

      <Bloque id="formulas-prescripcion" titulo="Prescripción">
        <Formula lectura="Costo que minimiza el AG: distancia a la meta más β por el cambio medio de las acciones, en la escala [0, 1].">
          costo(a) = |A*_T(a) − D_T| + β · media_k |a_k − a_k,actual|
        </Formula>
        <Formula lectura="Tolerancia de éxito: la mitad del salto entre el mejor nivel y el anterior (0,25 con tres niveles).">
          tolerancia = (1 − valor del nivel anterior al mejor) / 2
        </Formula>
        <Formula lectura="Éxito de un estudiante: la activación final queda dentro de la tolerancia de la meta.">éxito ⇔ |A*_T − D_T| ≤ tolerancia</Formula>
        <Formula lectura="Aporte de un concepto a la entrada del objetivo.">aporte_j = k1 · w_jT · A_j</Formula>
        <Formula lectura="Cambio de una acción como porcentaje de su rango observado.">del rango = (recomendada − actual) / (máximo − mínimo)</Formula>
      </Bloque>

      <Bloque id="formulas-metricas" titulo="Métricas">
        <Formula lectura="Errores respecto a la meta, entre los N estudiantes prescritos.">
          MAE = media |A*_T − D_T|     MSE = media (A*_T − D_T)²     RMSE = √MSE
        </Formula>
        <Formula lectura="Tasa de éxito prescriptivo.">PSR = 100 · (estudiantes con éxito) / N</Formula>
        <Formula lectura="Exactitud: niveles acertados sobre registros de prueba.">exactitud = aciertos / registros</Formula>
        <Formula lectura="Precisión y recall de un nivel.">
          precisión = aciertos del nivel / predichos en el nivel     recall = aciertos del nivel / reales del nivel
        </Formula>
        <Formula lectura="F1 de un nivel; F1 macro es su promedio entre niveles.">F1 = 2 · precisión · recall / (precisión + recall)</Formula>
        <Formula lectura="Exactitud equilibrada.">exactitud equilibrada = media del recall de cada nivel</Formula>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Problemas frecuentes
// ---------------------------------------------------------------------------
function Problemas() {
  return (
    <>
      <Bloque id="problemas-servicios" titulo="Servicios">
        <Defs>
          <Def t="«Ollama sin conexión»">
            Abra Ollama o ejecute <Codigo>ollama serve</Codigo>. Mientras tanto, todo funciona salvo el asistente, «Sugerir con IA» y las redacciones.
          </Def>
          <Def t="«Falta qwen2.5:7b»">
            Ejecute <Codigo>ollama pull qwen2.5:7b</Codigo> y espere a que termine la descarga.
          </Def>
          <Def t="«Motor Python detenido»">
            Compruebe que existe <Codigo>.venv</Codigo> con las dependencias de <Codigo>requirements.txt</Codigo> (o defina <Codigo>PYTHON</Codigo>) y
            reinicie el servidor.
          </Def>
          <Def t="«Servidor sin conexión» o la página no abre">
            Ejecute <Codigo>npm run app</Codigo> en la carpeta <Codigo>app</Codigo>. Si el puerto 3001 está ocupado, cierre el otro proceso o use otro
            puerto con <Codigo>PORT</Codigo>.
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="problemas-datos" titulo="Archivos y esquema">
        <Defs>
          <Def t="El archivo no se lee bien">
            Revise que la primera fila tenga los nombres de las columnas y que el separador sea coma o punto y coma. En Excel, deje los datos en la
            primera hoja.
          </Def>
          <Def t="Un paso tiene candado">Complete el anterior: guarde el esquema para el paso 3 y entrene un modelo para los pasos 4 y 5.</Def>
          <Def t="No puedo guardar el esquema">
            Lea los errores de la barra superior; la mayoría se explican en <Ir a="paso-2-errores">Errores y avisos frecuentes</Ir>.
          </Def>
          <Def t="«No se encontró el dataset»">El dataset se eliminó. Vuelva a «Datos» y elija otro.</Def>
        </Defs>
      </Bloque>

      <Bloque id="problemas-modelo" titulo="Entrenamiento y calidad">
        <Defs>
          <Def t="El entrenamiento tarda mucho">
            Use la validación «Rápida» o un método de regresión (Ridge o Lasso). La completa con BPTT tarda uno o dos minutos con 4800 registros, y más
            con datasets grandes.
          </Def>
          <Def t="El modelo casi siempre predice el nivel frecuente">
            Marque «Equilibrar los niveles del objetivo» y mire la exactitud equilibrada y el recall del nivel de riesgo.
          </Def>
          <Def t="La exactitud apenas supera a la clase mayoritaria">
            Revise el esquema: quizá faltan variables informativas o hay columnas mal codificadas. Pruebe BPTT y no quite inmutables con la máscara.
          </Def>
          <Def t="Un entrenamiento quedó «Interrumpido»">El servidor se detuvo mientras entrenaba. Vuelva a entrenar.</Def>
          <Def t="«Este modelo se entrenó antes de que existieran las figuras del informe»">Vuelva a entrenar en el paso 3 para generar las figuras.</Def>
        </Defs>
      </Bloque>

      <Bloque id="problemas-prescripcion" titulo="Prescripciones">
        <Defs>
          <Def t="El AG lleva todas las acciones al máximo">
            β es bajo. Súbalo (0,4 da planes moderados) o fije un cambio máximo por acción.
          </Def>
          <Def t="«El algoritmo genético no encontró un cambio en las acciones»">
            Las acciones pesan poco en el mapa (revise sus pesos), β es alto o el estudiante ya está en la meta. Pruebe una meta intermedia, baje β o
            permita reducciones. Las variables que casi determinan el objetivo, como notas parciales, restan peso a las acciones.
          </Def>
          <Def t="No alcanza la meta">
            El reporte lo indica («sin alcanzar la meta»): es el mayor avance que el modelo encuentra. Revise los factores que frenan y pruebe una meta
            intermedia.
          </Def>
          <Def t="«Este modelo no guardó su esquema»">El perfil de riesgo necesita un modelo más reciente: vuelva a entrenar.</Def>
          <Def t="«No existe el registro N»">
            Al cargar un estudiante en el perfil de riesgo, use una fila con datos completos (las filas con vacíos se descartan).
          </Def>
        </Defs>
      </Bloque>

      <Bloque id="problemas-asistente" titulo="Asistente y redacciones">
        <Defs>
          <Def t="Responde «Solo puedo ayudarte con rendimiento académico, deserción escolar…»">
            La guardia consideró la pregunta fuera de tema. Reformúlela mencionando a los estudiantes, el rendimiento, la deserción o el modelo.
          </Def>
          <Def t="Tarda mucho o se corta">
            qwen2.5 ocupa unos 5 GB de memoria: cierre otros programas. Use «Detener» y vuelva a preguntar.
          </Def>
          <Def t="Desapareció el historial">
            Se guarda en el navegador, por dataset. Otro navegador o una ventana privada no lo tienen y «Nueva conversación» lo borra.
          </Def>
          <Def t="«No hay un modelo PRV-FCM entrenado para este dataset»">Entrene un modelo en el paso 3; sin él, el asistente solo describe los datos.</Def>
        </Defs>
      </Bloque>
    </>
  );
}

// ---------------------------------------------------------------------------
// Buenas prácticas
// ---------------------------------------------------------------------------
function Consejos() {
  return (
    <>
      <Bloque id="consejos-antes" titulo="Antes de entrenar">
        <Lista>
          <li>Lea el reporte inicial: vacíos, duplicados y columnas con un solo valor dicen mucho de la calidad del archivo.</li>
          <li>Excluya identificadores y toda columna que se conozca después del resultado.</li>
          <li>Marque como acciones solo lo que de verdad se puede cambiar; el AG las moverá.</li>
          <li>Prefiera la división agrupada, sobre todo si hay registros sintéticos o repetidos.</li>
        </Lista>
      </Bloque>
      <Bloque id="consejos-leer" titulo="Al leer los resultados">
        <Lista>
          <li>Compare siempre la exactitud con la clase mayoritaria y con el bosque aleatorio.</li>
          <li>Con niveles desbalanceados, mire la exactitud equilibrada y el recall del nivel de riesgo.</li>
          <li>Use la cifra del bosque aleatorio como estimación prudente del éxito.</li>
          <li>Lea los pesos como asociaciones; los de los inmutables, además, compensan la falta de sesgo.</li>
        </Lista>
      </Bloque>
      <Bloque id="consejos-recomendar" titulo="Al recomendar">
        <Lista>
          <li>Prefiera planes moderados (β cercano a 0,4) o un cambio máximo por acción: son más realistas.</li>
          <li>Si el cambio necesario es grande, fije una meta intermedia.</li>
          <li>Revise y adapte las redacciones con IA antes de compartirlas.</li>
          <li>Acompañe cada plan con seguimiento: el modelo estima asociaciones, no efectos comprobados.</li>
        </Lista>
      </Bloque>
    </>
  );
}

export const CAPITULOS: CapituloGuia[] = [
  { id: 'introduccion', titulo: 'Qué hace Pizarra', Contenido: Introduccion },
  { id: 'antes', titulo: 'Antes de empezar', Contenido: AntesDeEmpezar },
  { id: 'navegacion', titulo: 'Barra lateral y barra de pasos', Contenido: Navegacion },
  { id: 'paso-1', titulo: 'Paso 1: ingesta y exploración', Contenido: Paso1 },
  { id: 'paso-2', titulo: 'Paso 2: clasificación de nodos', Contenido: Paso2 },
  { id: 'relaciones', titulo: 'Relaciones entre variables y registros', Contenido: Relaciones },
  { id: 'paso-3', titulo: 'Paso 3: entrenamiento del FCM', Contenido: Paso3 },
  { id: 'paso-4', titulo: 'Paso 4: motor prescriptivo', Contenido: Paso4 },
  { id: 'paso-5', titulo: 'Paso 5: visualización y recomendaciones', Contenido: Paso5 },
  { id: 'resumen', titulo: 'Resumen', Contenido: Resumen },
  { id: 'asistente', titulo: 'Asistente', Contenido: Asistente },
  { id: 'graficas', titulo: 'Cómo leer las gráficas', Contenido: Graficas },
  { id: 'formulas', titulo: 'Fórmulas', Contenido: Formulas },
  { id: 'problemas', titulo: 'Problemas frecuentes', Contenido: Problemas },
  { id: 'consejos', titulo: 'Buenas prácticas', Contenido: Consejos },
];
