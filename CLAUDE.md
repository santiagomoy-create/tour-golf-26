# Torneo Golf 26 — Contexto del proyecto

App de gestión de un torneo de golf anual entre amigos. 12 jugadores titulares,
6 fechas de mayo a octubre 2026 en canchas rotativas, más una Ryder Cup en noviembre.

**Estado (sep 2026):** cinco fechas jugadas — F1 Club Náutico San Isidro, F2 Estancias,
F3 Highland, F4 La Orquídea, F5 Pingüinos. Queda la F6 en Hurlingham, con puntos dobles.
Como ya hay jugadores con cinco rondas, la regla de "mejores 4" está activa.

## Arquitectura

| Archivo | Qué es |
|---|---|
| `index.html` | Toda la app: HTML, CSS y JS en un solo archivo (~6.300 líneas). Sin build step ni frameworks. |
| `apps_script.js` | Backend en Google Apps Script. Se pega en Extensiones → Apps Script de la planilla. |
| `sw.js` | Service worker de la PWA. Estrategia Network-First. |

**Datos:** Google Sheets es la única base de datos. La app la lee vía Apps Script
(`getSpreadsheetData`). Al abrir muestra al instante la última descarga guardada
(`golf_data_cache`) y actualiza en segundo plano; si nunca hubo descarga, usa los datos
embebidos y muestra un aviso. (El fallback CSV se eliminó: nunca funcionó, los GIDs eran de ejemplo.)

**Deploy:** el frontend va a Vercel. El backend requiere pegar el código en Apps Script
**y publicar una versión nueva** del deployment — guardar no alcanza, la URL sigue
sirviendo el código viejo.

**Pestañas de la planilla:** `jugadores`, `canchas`, `calendario`, `salidas`,
`resultados`, `coordinacion`, `invitados`, `tesoreria`, `fourball`, `plumas`.

---

## Reglas de negocio

Estas reglas se definieron a lo largo del torneo y **corrigen** versiones anteriores
del reglamento escrito. Ante la duda, mandan estas.

### Stableford

Se calcula sobre el score **neto por hoyo** (gross del hoyo menos la ventaja que le
corresponde según el HDI del hoyo):

| Resultado neto | Puntos |
|---|---|
| Eagle o mejor (−2) | 4 |
| Birdie (−1) | 3 |
| Par (0) | 2 |
| Bogey (+1) | 1 |
| Doble o peor (≥+2) | 0 |

La ventaja se reparte hoyo por hoyo según el orden de dificultad (`hdi`) de la cancha.

### Los cuatro rankings anuales

| Ranking | Cómo acumula | Orden |
|---|---|---|
| **Stableford** | Suma directa del score STB real de cada fecha | Mayor gana |
| **Medal** | **Promedio** del score neto por fecha | Menor gana |
| **Laguneada** | Suma de puntos por línea | Mayor gana |
| **Mixto** | Stableford + Laguneada + bonus/penalizaciones | Mayor gana |

**Stableford NO reparte puntos por posición.** Si un jugador hizo 36 puntos STB en una
fecha, al ranking anual le suman 36, no los 12 del primer puesto. Esto fue un error que
ya se corrigió una vez; no reintroducirlo.

**Medal promedia, no suma.** Con suma, quien juega menos fechas acumula menos y queda
primero automáticamente. El promedio neutraliza eso.

### Regla "mejores 4 de N"

Desde que un jugador lleva **5 fechas jugadas**, solo cuentan sus **4 mejores**. Se
descartan las peores. Aplica a los cuatro rankings. Configurable en:

```javascript
const BEST_N          = 4;
const BEST_MIN_FECHAS = 5;
```

El descarte se evalúa **por jugador**, no por torneo: quien jugó 3 de 5 fechas cuenta
las 3.

### Laguneada

Best ball neto por línea: en cada hoyo cuenta el mejor score neto de la línea. Gana la
línea con menor total. Puntos **a cada jugador** de la línea:

- 1ra línea: +6
- 2da línea: +3
- 3ra línea: 0

Se registra qué jugador aportó cada hoyo ganado, pero **como estadística, no como
puntos** — premiar eso distorsionaría el ranking según qué línea te tocó.

### Fourball

Match play entre dos equipos de 2. En cada hoyo, el mejor neto de cada equipo. Gana el
equipo que gana más hoyos.

### Plumas (Skins)

Se activa por línea, desde "Anotar en Vivo", y la activa un jugador con su PIN.
Queda registrada en la pestaña `plumas`.

Cada hoyo vale una pluma. La gana el menor score neto del hoyo. **Si hay empate, la
pluma se acumula al hoyo siguiente.** Gana quien más plumas junte en los 18.

El tab de Plumas solo aparece en una fecha si se activó en al menos una línea.

### Penalizaciones y bonus

Suman **solo al ranking Mixto** (decisión del organizador, sep 2026). Los valores viven en la
constante `BONUS` de `index.html`, y el texto del ranking se genera desde ahí.

| Evento | Fechas 1–5 | Fecha 6 (doble) |
|---|---|---|
| No presenta tarjeta | −2 | −4 |
| Abandono | −3 | −6 |
| No se presenta | −4 | −8 |
| No carga score en la app | −1 | −2 |
| Hoyo 19 | +1 | +2 |
| Mejor approach | +2 | +6 |
| Hoyo en uno | +12 | +24 |

### Jugadores

12 titulares. Los **invitados** (`isInvitado`) juegan y aparecen en las tarjetas, pero
**no suman a los rankings** — se filtran con `isReplace`. La excepción es la Laguneada,
donde sí se muestran porque integran una línea.

El hándicap que se usa es el **índex al 100%**, no el 85% que aplican algunos clubes.

---

## Decisiones técnicas que no conviene revertir

**Los POST van con `Content-Type: 'text/plain'`.** No es un descuido. Con
`application/json` el navegador manda un preflight OPTIONS que Apps Script no maneja
y la petición se bloquea. Con `text/plain` cuenta como "simple request" y no hay
preflight. El cuerpo sigue siendo JSON válido. Cambiar esto rompe toda la app.

**`localStorage` es caché, nunca fuente de verdad.** Al sincronizar, la API siempre
sobreescribe; no se fusiona nada. En una versión anterior se usó al revés y quedaron
datos corruptos en `FOURBALL` que no había forma de limpiar. Si hay red, manda la API.

**Sin frameworks y sin build step.** El deploy es empujar un archivo a GitHub y que
Vercel lo publique. Agregar una dependencia rompe esa cadena.

## Trampas conocidas de los datos

Estas ya rompieron la app al menos una vez. Todas tienen fix; no revertirlos.

**El HCP índex puede ser 0 o negativo.** D'Elía es scratch y ha tenido −0.2. Nunca
filtrar lecturas con `hcp_index > 0` — eso lo borra del mapa. La única condición válida
para descartar una lectura es que no exista. Usar `parseHcpIndex()`.

**Repartir un hándicap negativo.** `sph()` debe usar `Math.trunc`, nunca `Math.floor`.
Con hándicap −1, `Math.floor(-1/18)` da −1 y deja las 18 casillas en −1, repartiendo
−18 golpes en vez de −1. A D'Elía, que juega plus, le hundía el Stableford de 25 a 11.
Cuando el resto es negativo hay que **restar** el golpe en los hoyos más difíciles.
La suma del array devuelto tiene que dar siempre exactamente el hándicap recibido.

**Coma decimal.** Si una celda quedó como texto, Sheets devuelve `"-0,2"` y
`Number("-0,2")` da `NaN`. `parseHcpIndex()` lo normaliza.

**`#ERROR!` en celdas.** Aparece en la planilla (visto en el whatsapp de un invitado).
Tratarlo como valor ausente, no convertirlo.

**Los equipos de Fourball se corrompen.** `team_a = "5,1"` Sheets lo interpreta como el
número decimal `5.1`. Al guardar se fuerza formato texto con `setNumberFormat("@")`, y
al leer `parseTeamIds()` recupera los IDs aunque lleguen como decimal.

**Claves numéricas que vuelven como string.** `FOURBALL` y `PLUMAS` se guardan en
`localStorage` como JSON, y al deserializar las claves numéricas quedan como strings:
`FOURBALL[2]` no encuentra nada porque la clave es `"2"`. Todas las búsquedas usan
doble lookup:
```javascript
const fbMap = FOURBALL[fn] || FOURBALL[String(fn)] || {};
```

**`flight_num` vacío en fechas viejas.** `Number(null)` da 0 y todas las líneas quedan
con `num = 0`, así que no matchean contra `fourball`. El fallback usa el índice:
```javascript
num: (Number(f.flight_num) || Number(f.line_num) || (idx + 1))
```

**El jugador 102 (Mac Donough) no tiene PIN a propósito.** `activatePlumas` deja pasar
a los jugadores sin PIN guardado, y esa es la vía para activaciones retroactivas por
script. No "arreglar" esa validación sin reemplazar el mecanismo.

**Campos que llegan como número, no string.** `matricula`, `whatsapp` y otros vienen
como number desde Sheets. Envolver en `String()` antes de llamar `.replace()`.

---

## Marcador en vivo: cola offline

Cada golpe se guarda al instante en `golf_live_pending` (localStorage) y se envía con
reintentos (`flushLiveQueue`, también al volver la red o reabrir la app). Una entrada se borra
solo cuando el servidor confirma y nadie la modificó mientras viajaba. No contradice la regla
de "localStorage es caché": es una cola de salida, y tras cada descarga se reaplica encima de FD.

**Nunca leer `liveHoles` dentro de un `setTimeout`.** `triggerLiveSync` arma la entrada en el
momento de la llamada. Leerlos después guardaba los golpes de un jugador con el ID de otro
(quedó en la planilla: putts idénticos en F3 línea 3).

## Qué entra en los rankings

`fechasJugadas()` excluye la F99 de simulación y las fechas cuya cancha no tiene par/HDI
completos (`courseProblems()`). `cuentaParaRanking(sc)` excluye rondas en vivo a medio jugar.
La Laguneada de una fecha no suma hasta que terminan todas sus líneas.

## Regla de oro: no perder datos de la planilla

La planilla es lo único que persiste. Un valor ausente en un payload significa
**"no lo toques"**, nunca **"borralo"**.

En `apps_script.js` están `esVacio()` y `safeSetValue()`. Toda escritura de un campo que
pueda venir vacío tiene que pasar por ahí.

Cuidado especial con el patrón **borrar y reescribir** (las salidas se borran y se
insertan de nuevo). Si el payload llega vacío, borra todo y no inserta nada. Siempre
validar **antes** de borrar:

```javascript
if (!flights || !flights.length) {
  return { success: false, error: "No se recibieron salidas. Las existentes se mantienen." };
}
```

Ojo: `0` es un valor válido (el hándicap de D'Elía). `esVacio()` chequea `null`,
`undefined` y string vacío — no falsedad.

---

## Seguridad del frontend

Todo texto que venga de la planilla o de un usuario pasa por `esc()` antes de ir a
`innerHTML`; las URLs por `safeUrl()`; los argumentos de texto en `onclick="..."` por `jsArg()`.

## Cómo verificar un cambio

Antes de dar por buena una modificación:

1. **Sintaxis.** Extraer el JS del HTML y correr `node -c`. El archivo es una sola
   etiqueta `<script>`.
2. **Los cálculos, con datos reales.** Simular en Node con tarjetas de fechas ya
   jugadas y comprobar el resultado a mano. Los bugs de este proyecto fueron casi todos
   de lógica, no de sintaxis — compilaban perfecto y daban mal.
3. **Casos borde.** Hándicap 0 y negativo, jugador con una sola fecha, empates,
   tarjetas incompletas, fechas sin cancha asignada.

---

## Deuda técnica conocida

- **777 estilos inline contra 91 clases CSS.** No afecta rendimiento, pero cambiar un
  color implica buscar y reemplazar en decenas de lugares. Es la deuda más grande.
- **Seguridad del backend pendiente.** El PIN de admin ya no está en `index.html`: el admin
  lo escribe, se verifica con `verifyAdmin` y queda en `golf_admin_pin` de su teléfono.
  Falta aplicar `docs/BACKEND-PARCHE.md` en el Apps Script (PIN en propiedades, cerrar la
  puerta de jugadores sin PIN, exigir credencial en `saveFourball`/`saveLiveScore`, no
  devolver PINs ni tesorería).
- **`GEMINI_API_KEY` está vacía en el Apps Script.** La carga de tarjetas por foto
  devuelve error y nunca llega a analizar nada. La clave es gratis en Google AI Studio.
- **`getTabValues` lee celda por celda.** Llama `getDisplayValue()` una vez por cada celda
  que Sheets interpreta como fecha. Se puede reemplazar por un `getDisplayValues()` de
  toda la hoja: una sola llamada de red en vez de N.
- **Los putts se capturan y no se usan.** El scoring en vivo los guarda hoyo por hoyo y
  llegan a la planilla, pero ninguna estadística los consume. Además casi siempre vienen
  en cero: hay que resolver la captura antes de construir la vista.
- **`HANDOFF.md` tiene la sección 3.3 desactualizada.** Dice que Medal reparte puntos
  por posición. Es falso desde hace varias versiones.
- **El desplegable de cancha.** Ya está arreglado con `cSyncFecha()`, pero el patrón a
  evitar es que un formulario no refleje el estado guardado: al guardar escribe encima
  con lo que muestra por defecto.

---

## Datos de canchas incompletos

El código tolera canchas sin datos, pero calcula mal con ellas:

- **Hurlingham (`HU`)**, la cancha de la F6, no tiene par, hdi, slope ni rating.
  `String(c.par || "").split(",").map(Number)` devuelve `[NaN]`, así que en cuanto se
  cargue esa fecha los cálculos van a salir mal. Hay que completarla antes de jugarla.
- **La Orquídea (`OR`)** no tiene rating. El código cae al default de 72, que es un
  número inventado, y con eso el diferencial de la F4 queda mal calculado.

Vale la pena que la app avise cuando una cancha está incompleta, en vez de seguir de
largo con valores por defecto.

## Deploy

**Frontend:** `git push` a `main` y Vercel republica en unos 30 segundos. Sin build.

**Backend:** es manual. Abrir el Sheets → Extensiones → Apps Script → borrar todo →
pegar `apps_script.js` → guardar → **Implementar → Administrar implementaciones →
editar (✏️) → Versión: "Nueva versión" → Implementar**.

Guardar no alcanza: sin publicar versión nueva, la URL sigue sirviendo el código viejo.

**Nunca crear una implementación desde cero.** Genera una URL distinta, y la actual
está hardcodeada en `index.html`. Permisos: ejecutar como el dueño del Sheets, acceso
para cualquier persona.

**Para invalidar el caché de la PWA** en todos los dispositivos, subir el número de
`CACHE_NAME` en `sw.js` y redesplegar.

## Convenciones

- Los comentarios y la UI van en **español**.
- Las constantes de scoring viven juntas, cerca de `PTS_L`. Si se agrega una regla
  configurable, que vaya ahí y que los textos de la interfaz se generen desde la
  constante — así no quedan desincronizados.
- No agregar dependencias externas. La app no tiene build step y conviene que siga así.
