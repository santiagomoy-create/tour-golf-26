# Parche de seguridad para `apps_script.js`

El frontend ya no tiene el PIN de admin escrito en el código. Para cerrar los agujeros del
todo hacen falta estos cambios en el Apps Script. Se pueden aplicar de a uno; el frontend
funciona con o sin ellos.

Después de pegar el código: **Implementar → Administrar implementaciones → ✏️ → Nueva versión**
(guardar no alcanza).

---

## 1. Cambiar el PIN de admin y sacarlo del código (urgente)

`golf2026` quedó publicado en GitHub, en el historial del repo. Hay que cambiarlo.

1. En el editor de Apps Script: **⚙️ Configuración del proyecto → Propiedades de la secuencia de comandos → Agregar propiedad**
   - Propiedad: `ADMIN_PIN`
   - Valor: un PIN nuevo (ej. 8+ caracteres, no `golf2026`)
2. Reemplazar la constante al inicio de `apps_script.js`:

```javascript
// Antes:  const ADMIN_PIN = "golf2026";
const ADMIN_PIN = PropertiesService.getScriptProperties().getProperty('ADMIN_PIN');
```

## 2. Acciones de verificación (login instantáneo)

El frontend las llama al ingresar. Agregarlas al `switch`/`if` donde se despachan las acciones
en `doPost`:

```javascript
if (action === 'verifyAdmin') {
  return json({ success: data.pin === ADMIN_PIN, error: data.pin === ADMIN_PIN ? '' : 'PIN incorrecto' });
}

if (action === 'verifyPlayer') {
  const ok = checkPlayerPin(data.playerId, data.pinEntered);
  return json({ success: ok, error: ok ? '' : 'PIN incorrecto' });
}
```

(`json(...)` = la función que ya usen para devolver `ContentService.createTextOutput(JSON.stringify(...))`.)

## 3. Cerrar la "puerta trasera" de los jugadores sin PIN

Hoy, si el jugador no tiene PIN cargado, la validación se saltea. Los invitados 100–105 no
tienen PIN, así que cualquiera que mande `playerId: 102` pasa. Reemplazar el chequeo por:

```javascript
function checkPlayerPin(playerId, pin) {
  const row = findPlayerRow(playerId);          // la función que ya usen para buscar en "jugadores"
  if (!row) return false;
  const stored = String(row.pin ?? '').trim();
  if (!stored) return false;                    // antes: return true  ← la puerta trasera
  return stored === String(pin ?? '').trim();
}

// Para acciones que puede hacer un jugador O el admin:
function isPlayerOrAdmin(data) {
  if (data.adminPin && data.adminPin === ADMIN_PIN) return true;
  if (data.pin && data.pin === ADMIN_PIN) return true;
  return checkPlayerPin(data.scorerId ?? data.playerId, data.pinEntered ?? data.pin);
}
```

Las activaciones retroactivas de Plumas que se hacían con el jugador 102 ahora se hacen
mandando `adminPin`.

## 4. Exigir credencial en `saveFourball` y `saveLiveScore`

El frontend ya manda `scorerId` + `pinEntered` (si el jugador ingresó en Coordinación) y
`adminPin` (si es admin). Al principio de cada acción:

```javascript
if (action === 'saveFourball' || action === 'saveLiveScore') {
  if (!isPlayerOrAdmin(data)) return json({ success: false, error: 'Ingresá con tu PIN en Coordinación para anotar.' });
  // ...código existente...
}
```

> Antes de activar esto en `saveLiveScore`, asegurate de que todos los jugadores hayan
> ingresado con su PIN en la app (pestaña Coordinación). Si no, no van a poder anotar en la F6.
> Si no llegás a hacerlo antes del 1/10, dejá este punto para después de la F6.

## 5. No mandar datos privados a todos

En `getSpreadsheetData`, antes de devolver los datos:

```javascript
const isAdmin = data.pin === ADMIN_PIN;
payload.players = payload.players.map(p => { const { pin, ...rest } = p; return rest; }); // nunca mandar PINs
if (!isAdmin) {
  payload.tesoreria = [];
  payload.invitados = payload.invitados.map(i => ({ ...i, whatsapp: '', email: '' }));
}
```

Para verificar si hoy se están mandando los PINs: abrí la app en la compu → F12 → pestaña
**Network** → la llamada a `script.google.com` → **Response**. Si ves `"pin":1234`, cualquiera
puede ver los PINs de todos.

## 6. PINs débiles

En la planilla hay PINs repetidos (`1234` lo usan Garzón y Drago) y triviales (`1111`,
`2222`, `3333`). Conviene pedirles que los cambien.
