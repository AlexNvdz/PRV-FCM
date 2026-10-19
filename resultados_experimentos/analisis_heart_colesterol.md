# Heart: ¿por qué el perfil «articulo» recomienda subir el colesterol?

> Histórico. Los perfiles «articulo» y «mejorado», la aptitud de la Tabla 4 y la
> reconstrucción se retiraron en octubre de 2026 (README, «Historia»); el código
> que generó este archivo está en el commit `df57bfe`.

En la prueba de la aplicación, el modelo de heart con el perfil «articulo» recomendó
subir el colesterol de un paciente de 307 a 557 mg/dL. Aquí se reproduce el caso y
se separan sus causas. Todo con semilla 42, `data/heart.csv`, el esquema
`data/esquemas/heart.json` (supuesto: `target` 1 = sin enfermedad) y los 42
pacientes de prueba con `target` 0, que son los que reciben prescripción.
Las cifras salen de `analisis_heart.py` y `analisis_heart2.py`, en esta carpeta
(`python resultados_experimentos/analisis_heart.py`).

## Lo que dicen los datos

| | colesterol (`chol`) | presión en reposo (`trestbps`) |
|---|---|---|
| Media con `target` 0 | 251.1 | 134.4 |
| Media con `target` 1 | 242.2 | 129.3 |
| Correlación de Pearson con `target` | −0.085 | −0.145 |
| Rango en el dataset | 126 a 564 | 94 a 200 |

Con el supuesto 1 = sin enfermedad, las dos acciones deberían bajar para mejorar,
pero la señal del colesterol es muy débil (r = −0.085; −0.022 en el entrenamiento
normalizado): el aprendizaje de W puede darle cualquier signo.

## Causa 1: el PSO literal aprende el signo contrario

| Modelo | Peso chol → target | Peso trestbps → target | Pesos en la cota ±1 | Exactitud |
|---|---|---|---|---|
| «articulo» (PSO ec. 4 literal) | **+1.000** | −0.537 | 54 % | 81.1 % |
| «articulo» con PSO de Clerc | −1.000 | +0.156 | 46 % | 74.4 % |
| «articulo» con BPTT | −0.152 | −0.271 | 2 % | 86.7 % |
| «mejorado» (BPTT, con sesgo) | −0.285 | −0.933 | 69 % | 86.7 % |

En «articulo», el colesterol además tiene pesos ±1 hacia todos los mutables
dinámicos (frecuencia cardiaca −1, angina +0.94, depresión del ST −1, pendiente −1).
El efecto total de subir el colesterol 0.1 (escala [0, 1]) sobre el objetivo es
**+0.015**: para ese mapa, más colesterol es más salud. Con el PSO literal, la
mitad de los pesos queda pegada a la cota y los signos de las señales débiles son
ruido; el PSO de Clerc y BPTT dan el signo esperado para el colesterol.

## Causa 2: el protocolo prescriptivo del artículo deja las acciones sueltas

Aun con el signo correcto («articulo» con BPTT), el 50 % de los pacientes recibe
colesterol más alto. Tres piezas del perfil lo permiten:

* **β = 0 y sin siembra.** Si una acción casi no cambia la aptitud, cualquier valor
  vale lo mismo y el AG la deja donde caiga. Con el peso del colesterol en 0 (sin
  ningún efecto), el colesterol recomendado sale al azar: media 340, desviación 145,
  de 133 a 564 (el actual promedia 262).
* **Aptitud de la Tabla 4.** Pide que un paso de la regla sobre el estado final se
  parezca al del estado deseado de todo el sistema (incluidos los mutables dinámicos
  en su valor actual), no que el objetivo suba. Las acciones se mueven para cuadrar
  esos mutables.
* **Mutables dinámicos.** El colesterol llega al objetivo también a través de
  frecuencia cardiaca, angina, ST y pendiente, con pesos saturados.

Variantes de la prescripción sobre el mismo mapa «articulo» (PSO literal):

| Prescripción | Éxito | Colesterol sube | Colesterol ≥ 240 | Colesterol ≥ 300 | Máximo | Presión sube | Presión ≥ 140 |
|---|---|---|---|---|---|---|---|
| Del perfil (Tabla 4, β = 0, sin siembra) | 16.7 % | 59.5 % (Δ +100) | 64.3 % | 61.9 % | 564 | 54.8 % | 47.6 % |
| Aptitud = error | 57.1 % | 100 % (Δ +302) | 100 % | 100 % | 564 | 0 % | 0 % |
| Con siembra | 16.7 % | 59.5 % | 64.3 % | 61.9 % | 564 | 54.8 % | 47.6 % |
| β = 0.4 | 21.4 % | 35.7 % (Δ +47) | 69.0 % | 47.6 % | 564 | 21.4 % | 38.1 % |
| Siembra + β = 0.4 + aptitud error | 57.1 % | 54.8 % (Δ +146) | 83.3 % | 61.9 % | 564 | 0 % | 21.4 % |

Antes de la prescripción, el 64.3 % ya tenía colesterol ≥ 240 y el 40.5 % presión
≥ 140. El caso de la aplicación es el paciente 213 (colesterol 307 → 564, el máximo
del dataset; presión 145 → 102). Con la aptitud de error el AG sigue al mapa y lleva
a todos al máximo de colesterol, porque el signo aprendido lo pide: **β, la siembra
y la aptitud cambian cuántos, pero el origen es el signo del mapa** (causa 1), y la
libertad del protocolo lo amplifica (causa 2).

## El supuesto del sentido de `target`

Con el orden invertido (`target` 0 = mejor), «articulo» sube el colesterol al
91.7 % de los pacientes (89.6 % queda ≥ 300) y «mejorado» no cambia a nadie. El
supuesto no explica el problema: el mapa del PSO literal sube el colesterol con
cualquiera de los dos sentidos. Con el sentido invertido, subir el colesterol
sería «coherente» con los datos (el grupo 0 tiene más colesterol), lo que refuerza
que 1 = sin enfermedad es el sentido correcto (el grupo 1 también tiene mayor
frecuencia cardiaca máxima y menos angina, ST y vasos afectados).

## Cuántas recomendaciones salen de rangos clínicos razonables

Criterios: subir colesterol o presión a un paciente con enfermedad cardiaca;
colesterol recomendado ≥ 240 mg/dL (alto, ATP III) o presión ≥ 140 mmHg
(hipertensión de grado 2).

| Perfil | Colesterol sube | Presión sube | Colesterol ≥ 240 | Presión ≥ 140 |
|---|---|---|---|---|
| «articulo» (perfil completo) | 25 de 42 (59.5 %) | 23 de 42 (54.8 %) | 27 (64.3 %) | 20 (47.6 %) |
| «mejorado» por defecto (solo subir, β = 0.4) | 0 | 0 | 27 (64.3 %, sin cambio) | 17 (40.5 %, sin cambio) |
| «mejorado», permite bajar, β = 0.4 | 0 | 0 | sin cambio | sin cambio |
| «mejorado», permite bajar, β ≤ 0.05 | 0 (baja al 90-100 %) | 0 (baja al 100 %, Δ −40.5) | 0-4.8 % | 0 % |

«mejorado» nunca sube ninguna de las dos, pero con β = 0.4 no recomienda nada (el
efecto de bajarlas es menor que el esfuerzo), y con β pequeño las baja hasta el
mínimo del dataset (presión 94): dirección correcta, magnitud irreal.

## Remedios, del más chico al más grande

1. **Usar «mejorado» con `permitir_reducciones` y `delta_max`** (sin código; ya
   existe). El signo es el esperado y ninguna acción sube; `delta_max` limita cuánto
   baja (por ejemplo 0.2 del rango: unos 21 mmHg y 88 mg/dL). No sirve si se exige
   el protocolo del artículo.
2. **Dirección y rango plausible por acción en el esquema** (pequeño: unas 50
   líneas en `configuracion`, `esquema` y `prescripcion.limites`, más su control en
   la app). Por ejemplo `{"direccion": "bajar", "rango": [120, 240]}` para el
   colesterol. Es una restricción del espacio de búsqueda, como los límites ll < v <
   lu de la ec. 13 de PRV-FCM, y vale en los dos perfiles: con el mapa del PSO
   literal, el AG dejaría el colesterol en su valor actual en vez de subirlo, y con
   β = 0 ya no podría sacarlo al azar fuera del rango. No corrige el signo del mapa.
3. **Signo fijado por conocimiento experto** (mediano: cotas por arista en BPTT y
   PSO, del tipo w ∈ [−1, 0] para colesterol → objetivo, más su lugar en el esquema
   o en la matriz de expertos y en la app). Usa el conocimiento experto como el
   artículo de 2025, pero solo para el signo de las aristas que el experto conoce, y
   deja que los datos estimen la magnitud. Corrige la causa 1.
4. **Máscara causal** (ya existe) no basta: solo puede quitar aristas. Sin las
   aristas del colesterol, su valor recomendado en «articulo» sale al azar (media
   340, de 133 a 564); en «mejorado» queda igual. Sirve combinada con el remedio 2.
5. **Matriz de expertos completa** (García et al., 2025; grande: requiere que
   clínicos den el peso de todas las aristas). Es lo que el artículo de 2025 hace
   para enfermedades con conocimiento médico, y evita aprender signos ruidosos de
   303 pacientes.

Recomendación: 2 (o 1 de inmediato) para que ninguna prescripción suba presión o
colesterol, y 3 si se quiere que el mapa del perfil «articulo» refleje la
dirección clínica. Nada de esto cambia el modelo ni los valores por defecto hasta
que se apruebe.
