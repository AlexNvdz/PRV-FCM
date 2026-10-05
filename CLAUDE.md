# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

PRV-FCM (Hoyos, Aguilar y Toro, 2023: mapas cognitivos difusos prescriptivos + algoritmo genético) aplicado a rendimiento académico y deserción. Dos partes:

- `prvfcm/` + `main.py`: motor Python. Dataset por defecto `data/xAPI-Edu-Data-expanded-4800.csv` (`data/xAPI-Edu-Data.csv` es el original de 480 filas; `resultados_480/` guarda sus salidas antiguas).
- `app/`: aplicación web local "Pizarra" (Node.js + React) que usa el motor y un asistente con Ollama `qwen2.5:7b`. Sigue un flujo de cinco pasos: 1 ingesta y exploración, 2 clasificación de nodos (C_T objetivo, C_P acción, C_S sistema), 3 entrenamiento del FCM, 4 motor prescriptivo, 5 visualización y recomendaciones.

Todo en español: identificadores, comentarios, docstrings, interfaz y documentación. Windows (Git Bash o PowerShell). Repositorio git (rama `main`, remoto `origin` = https://github.com/AlexNvdz/PRV-FCM.git, respaldo del usuario); hacer commit o push solo si el usuario lo pide.

## Comandos

Python (el entorno es `.venv`, Python 3.14; `requirements.txt` incluye networkx, openpyxl y xlrd):

```bash
.venv/Scripts/python.exe main.py                  # pipeline completo, ~90 s (validación cruzada completa)
.venv/Scripts/python.exe main.py --sin-cv         # ~10 s; --metodo-pesos ridge|lasso|correlacion_parcial; --excluir ORIGEN DESTINO; --equilibrar-niveles; --help
.venv/Scripts/python.exe -m pytest -q             # 47 pruebas (~25 s)
.venv/Scripts/python.exe -m pytest tests/test_motor_app.py::test_worker_responde_una_linea_json_por_peticion -q
.venv/Scripts/python.exe -m prvfcm.servicio worker | entrenar --datos D --esquema E --opciones O --salida DIR | esquema-xapi
```

App (desde `app/`):

```bash
npm run app            # build + servidor en http://localhost:3001 (solo 127.0.0.1)
npm run dev            # Vite :5173 (proxy /api) + API :3001 con recarga
npm test               # node:test, 18 pruebas; una: node --test server/test/agente.test.js
npm run typecheck      # TypeScript 7 sobre web/
npm run build          # web/dist, que sirve Express
```

`main.py` con opciones por defecto debe producir los mismos `resultados/recomendaciones.csv`, `pesos_fcm.csv` y `seleccion_hiperparametros.csv` y el mismo `metricas.json` (que desde el flujo de cinco pasos incluye además `configuracion.fcm.metodo_pesos`, `configuracion.fcm.balancear_niveles` y `configuracion.aristas_excluidas`): compararlos antes y después de refactorizar `prvfcm/`.

## Arquitectura del motor (`prvfcm/`)

- `pipeline.ejecutar(datos, esquema, opciones, al_terminar_etapa, al_progresar)` es la única orquestación de las 4 etapas. `main.py` solo imprime cada etapa (dict `IMPRESORES`); las figuras PNG las genera `visualizacion.generar_figuras`, que usan `main.py` y el entrenamiento de la app. `servicio.py` usa la pipeline para la app y `api.py` para las consultas. No duplicar lógica en ellos.
- `configuracion.py`: `Concepto`, `Esquema`, `ESQUEMA_XAPI` (C1-C8 inmutables, C9-C12 acciones, C13-C15 mutables fijos, C16 `Class` dinámico) y dataclasses `Config*` (`ConfigFCM.metodo_pesos`). `Esquema.one_hot` mapea cada concepto indicador `"columna=categoría"` a su origen; usar `esquema.columnas_origen` (columnas del CSV) y no `esquema.columnas` (conceptos) para leer o validar el archivo.
- `preprocesamiento.py`: lee CSV o Excel (`leer_tabla`, `leer_excel` por bytes: la subida web no tiene extensión). Las columnas booleanas pasan a texto "True"/"False" al leer y en `como_texto`: pandas las cuenta como numéricas, pero no admiten restas (cuartiles, Min-Max) y se confundirían con 0/1. Todo guiado por `Esquema` (ordinal o label encoding, número en texto, nominal con media suavizada del objetivo ajustada solo en entrenamiento, one-hot, numérica; Min-Max). `dividir_entrenamiento_prueba` agrupa por perfil inmutable con `StratifiedGroupKFold` (20 partes).
- `fcm.py`: Kosko modificada `A(t+1) = f(k2·A + k1·A@W)`; `pesos[j, i] = w_ji`; los conceptos no dinámicos quedan fijos. Extracción de W (`entrenar_fcm`): `bptt` (BPTT exacto + L-BFGS-B en [-1, 1]), `ridge`/`lasso` (regresión sin intercepto sobre `z = (logit(y)/λ − k2·y)/k1`, y recortado a [0.05, 0.95], coeficientes por `tanh`) o `correlacion_parcial` (Ledoit-Wolf). `terminos(estado, fuentes)` da los sumandos memoria `k2·A` e influencia `k1·A@W` (opcionalmente solo de unas fuentes) para explicar la inferencia sin tocar el bucle de `inferir`. `aristas_excluidas` es la máscara causal (matriz booleana). `ConfigFCM.balancear_niveles` pondera cada registro con `pesos_equilibrados` (BPTT y regresiones) y hace que la validación cruzada elija por exactitud equilibrada (columna extra `exactitud_equilibrada`, solo en ese modo).
- `seleccion.py`: validación cruzada agrupada de λ × α; reajusta el preprocesador en cada pliegue; respeta método y máscara.
- `prescripcion.py` + `genetico.py`: AG por estudiante; costo = error ponderado al estado deseado + β·esfuerzo; las acciones actuales se siembran (nunca peor que no actuar). `ResultadoPrescripcion` guarda por generación el mejor costo, el costo medio y las mejores acciones (`historial_acciones`, de `ResultadoAG.historial_cromosoma`). `ejecutar(al_generar=...)` avisa al final de cada generación sin consumir números aleatorios.
- `evaluacion.py`: MAE/MSE/RMSE/PSR, precisión/recall/F1, bosque aleatorio externo y segmentos.
- `reporte.py`: reporte prescriptivo en lenguaje natural (plantillas deterministas, números es-CO): `reporte_individual` y `resumen_prescripciones` (sobre `recomendaciones.csv`).
- `pipeline.py`: si hay menos de 40 perfiles inmutables, la división agrupada se cambia por aleatoria (`ResultadoPipeline.division`, que es la que va a `metricas.json`).
- `esquema.py`: `columnas_que_determinan` señala columnas que solas aciertan el nivel del objetivo en el 99 % (fuga: su definición o un dato posterior); la sugerencia de `perfilado` las excluye y `validar_esquema` avisa. Esquema JSON de la app (roles inmutable/accion/mutable/objetivo/excluir; objetivo ordinal con orden peor→mejor o numérico con niveles Bajo/Medio/Alto e `invertir_objetivo`; `one_hot` con `categorias`, solo en conceptos del sistema). Valor 1 = mejor nivel; tolerancia de éxito = (1 − nivel anterior)/2. Los conceptos se reordenan por rol y se numeran C1..Cn (un concepto por categoría one-hot).
- `modelo.py`: `modelo.json` (esquema, preprocesador, pesos, config) → `ModeloPRVFCM`: describe el mapa, convierte unidades, `describir`/`describir_final` y estado de un perfil de riesgo (el objetivo parte de su media de entrenamiento; un registro del dataset, de su valor observado).
- `api.py`: `PredictorFCM` (`predecir`, `inferir`, `simular`; `paso_a_paso` da `series` t = 0..T de los conceptos dinámicos y `pasos` con memoria, influencia, `influencia_acciones`, entrada y activación del objetivo) y `PrescriptorAG` (`prescribir` con `DataFrame` o perfil `dict`, `nivel_meta`, `al_progresar` por generación; devuelve `historial` con `mejor`, `promedio`, `activacion` y `acciones` por generación, aportes `k1·w·A` al objetivo y `reporte`). No dependen de la interfaz; la simulación y la prescripción viven solo aquí.
- `perfilado.py`: reporte inicial (tipos, vacíos, cuartiles, moda), sugerencia de esquema por palabras clave; `normalizados`, `correlaciones` (Spearman, Pearson, parcial), `dispersion`, `perfil_base`, `estadisticas` (con `perfil_niveles`); `filas` con operadores en lista blanca (sin `eval`).
- `visualizacion.py`: PNG con matplotlib y `grafica_red_fcm` (NetworkX, disposición radial por rol).
- `servicio.py`: una petición/respuesta JSON por línea; stdout reservado al protocolo (los `print` se desvían a stderr); `limpiar()` convierte NaN a null. El entrenamiento guarda `figuras/*.png` y su lista en `graficas.json`; si fallan las figuras, el modelo se guarda igual.

## Arquitectura de la app (`app/`)

- `server/` (Express 5, JS ESM): `motor.js` mantiene un worker Python persistente (respuestas emparejadas por id, reinicio si se cuelga) y lanza un proceso por entrenamiento; `trabajos.js` reenvía el progreso por SSE; `almacen.js` guarda todo en `app/almacen/{datasets,modelos}/<id>/` (JSON, sin base de datos); `app.js` rechaza Host/Origin no locales. Un Excel subido se convierte a `datos.csv` (`convertir_excel`) antes de perfilarlo. La exploración (`/estadisticas`, `/normalizados`, `/correlaciones`, `/dispersion`) acepta un esquema válido aunque no esté confirmado; entrenar y `/estructura` exigen el esquema confirmado.
- Un modelo usa el esquema con el que se entrenó (`modelos/<id>/esquema.json`, también en `GET /api/modelos/:id`), no el actual del dataset. Modelo activo = el último `listo` del dataset. `/figuras/:nombre` solo sirve nombres que estén en `graficas.figuras`.
- Asistente: `agente.js` pasa primero por una guardia de tema (salida JSON) y luego hace un bucle de hasta 5 rondas con herramientas en streaming. El contexto del prompt separa los pesos de las acciones de las influencias no controlables y explica el signo. `herramientas.js` define 11 herramientas con Zod; sus resultados son compactos, llevan frases ya redactadas (`lectura`, `texto`, `reporte`: qwen2.5 confunde nombres y signos si solo recibe listas) y emiten gráficas y tarjetas a la interfaz. Los argumentos `null` se descartan antes de validar (z.coerce convertiría null en 0). Usan `id_estudiante` (acepta `id` como alias). El plan moderado usa β = 0.4 y el máximo el β del modelo. `redactarRecomendacion` (ruta `POST /api/modelos/:id/redactar`, SSE) redacta sin herramientas a partir de una prescripción o del resumen; no recibe activaciones sueltas (las expresa como porcentajes) y marca `cambio_grande` para pedir metas intermedias. Todas las llamadas a Ollama usan el mismo `num_ctx` para que no recargue el modelo.
- `web/`: React 19, Vite 8, Tailwind 4 (tokens claro/oscuro en `estilos.css`, `@theme inline`), react-router 8 (`createBrowserRouter`), TanStack Query, Recharts 3. `FlujoPasos.tsx` es la barra de cinco pasos; vistas por paso: `Datos`/`DatasetDetalle` (pestañas `?pestana=reporte|esquema|relaciones|registros`), `Modelo`, `Prescripciones` (+ `PerfilRiesgo`), `Informe`. `MapaFCM.tsx` y `relaciones.tsx` (mapa de calor, dispersión con punto más cercano, perfil por nivel) son SVG propios; `prescripcion.tsx` reúne el resultado de una prescripción individual, `evolucion.tsx` (`EvolucionAG`) reproduce el historial del AG con la curva del costo y las barras de acciones actuales y prescritas (sin `historial.acciones` cae a `GraficaConvergenciaIndividual`), `inferencia.tsx` (`TrayectoriaInferencia`) es la gráfica paso a paso del simulador y `RedaccionIA.tsx` la redacción con qwen2.5. `EditorEsquema.tsx` tiene el tablero de clasificación (arrastrar y soltar con HTML5, flechas del teclado) que llama a la misma `cambiarRol` que la tabla. Los colores de datos vienen de la paleta validada (serie-1 azul, serie-2 naranja, niveles con rampa azul ordinal, divergente rojo-gris-azul); cada gráfica tiene tooltip y vista de tabla. Las gráficas SVG a ancho completo necesitan viewBox de unos 900 de ancho para que el texto no escale de más. Para fijar el ancho de un control con `estiloControl` (que trae `w-full`) usar el modificador importante (`w-40!`): Tailwind 4 emite `.w-full` después de los demás anchos, incluso los arbitrarios. Texto de interfaz en español, en tipo oración, sin mayúsculas sostenidas ni separadores "·".
- Ayuda (`/ayuda`): `vistas/Ayuda.tsx` (buscador, índice lateral, glosario), `vistas/guia.tsx` (capítulos; cada `Bloque` es una unidad del buscador), `glosario.ts` (siglas, símbolos y términos; `<T a="id">` en la guía solo acepta claves que existen, lo comprueba el typecheck) y `componentes/ayuda.tsx`. Describe controles, valores por defecto y cifras de la interfaz y del motor: al cambiarlos, actualizar la guía y el glosario. Términos enlazados a mitad de frase en minúscula (`<T a="sesgo">sesgo</T>`); las remisiones usan `Vea <Entradas a={[...]} />`.
- Variables de entorno: `PORT`, `PYTHON`, `OLLAMA_URL`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`.

## Decisiones y hallazgos que no se ven en el código

- El dataset de 4800 filas son los 480 estudiantes originales más 4320 variantes sintéticas (cada clase exactamente ×10). Una división aleatoria filtra variantes entre particiones (bosque aleatorio 94 % frente a 83 % agrupada): usar siempre la división agrupada por perfil C1-C8.
- La validación cruzada elige λ = 1, α = 0.001. El λ = 10 del artículo colapsa (29 %: predice H para todos).
- C13-C15 se conservan observados: con ellos dinámicos, el FCM promete H a todos los estudiantes con más de 7 ausencias.
- La regla no tiene sesgo; los pesos grandes de inmutables (C2, C4, C5) lo sustituyen. Un concepto constante sube la exactitud de 73.4 % a 78.4 %, pero no se incluyó porque cambia el FCM definido. Por lo mismo, la máscara causal que quita inmutables baja la exactitud (Ridge sin C1 ni C2: 64.7 %).
- Métodos de W (semilla 42, sin CV): BPTT 72.1 %, Ridge 71.3 %, Lasso 71.0 %, correlación parcial 48.3 %. La regresión literal de y sobre los conceptos (sin la transformación logit del punto fijo) da 40-44 %, por debajo de la clase mayoritaria: no usarla. BPTT sigue por defecto.
- Con β = 0.05, C9-C11 van al máximo en todos los estudiantes y C12 no cambia (peso −0.09). β = 0.4 da prescripciones personalizadas sin bajar el PSR. El peso de C15 queda en la cota −1.
- El AG de un estudiante tarda unos 20 ms (30-60 generaciones con la paciencia de 25): un flujo SSE en vivo solo mostraría el final, por eso la interfaz reproduce el historial que devuelve `PrescriptorAG`. `al_progresar` queda para backends con AG más largos.
- Referencia (semilla 42): exactitud FCM 72.1 %, bosque 82.9 %, PSR 8.9 → 59.2 %, clasificados H por el bosque 8.1 → 40.5 %.
- Dataset de deserción del usuario (`student dropout.csv`, 649 filas, UCI con columnas renombradas): `Dropped_Out` es exactamente `Final_Grade < 10` (por eso se excluye la nota final) y 15 % deserta. Sin equilibrar, el FCM casi no detecta desertores (recall 30 %); con niveles equilibrados, 67 %. Con `Grade_1`/`Grade_2` como conceptos, las acciones pesan poco y el AG casi no cambia a nadie; sin ellas, el PSR del FCM pasa de 37 % a 60 %.
- El README documenta estos resultados: actualizarlo si cambia el pipeline.

## Entorno

- Ollama con `qwen2.5:7b` ocupa ~5 GB de RAM; Claude Code puede detener servidores en segundo plano si falta memoria. Una redacción tarda ~15 s y una respuesta del asistente con herramientas, 5-10 s.
- Para liberar el puerto 3001 en PowerShell: `Get-NetTCPConnection -LocalPort 3001 -State Listen` y `Stop-Process`.
- El historial del asistente, el dataset activo y el tema viven en `localStorage` del origen. Para probar la interfaz sin tocar los del usuario (en `localhost:3001`), abrir `http://127.0.0.1:3001`.
- El usuario suele tener su propio servidor en 3001. El worker Python es persistente: tras cambiar `prvfcm/` o `server/` hay que reiniciar el servidor. Para probar sin tocar su instancia ni sus datos: `PORT=3002 PIZARRA_ALMACEN=<carpeta temporal> node server/index.js`.
- En Git Bash, los heredoc con comillas simples dentro fallan en esta herramienta: escribir archivos con Write/Edit.
