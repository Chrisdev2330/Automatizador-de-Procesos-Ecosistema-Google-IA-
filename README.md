# Agendador Técnico Inteligente · EADIC

Herramienta Micro-SaaS interna que automatiza el agendamiento de entrevistas técnicas entre RR.HH., Entrevistadores Técnicos y Candidatos — eliminando los correos de coordinación.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Runtime | Google Apps Script (V8) |
| Frontend | HTML5 + CSS3 puro · Dark theme · Responsive |
| IA | Gemini 1.5 Flash via `UrlFetchApp` |
| Calendario | `CalendarApp` — nativo de Google Apps Script |
| Email | `GmailApp` — nativo de Google Apps Script |

---

## Arquitectura de archivos

```
Backend.gs       → Servidor: lógica de Calendar, Gemini AI, Gmail y validación
Index.html       → Estructura HTML del Split View y modales
Estilos.html     → Sistema de diseño con la paleta corporativa de EADIC
Funciones.html   → JavaScript del cliente: estado, renderizado y validación
appsscript.json  → Permisos OAuth y configuración del runtime
```

**`Backend.gs`** organiza la lógica en tres módulos:

- **CalendarService** — lee el freebusy del calendario de RR.HH. en tiempo real y genera los slots disponibles filtrando los horarios ocupados
- **GeminiService** — conecta con la API de Gemini vía `UrlFetchApp` y genera el cuerpo del correo de forma dinámica según el rol evaluado. Incluye fallback automático si la API no responde
- **SchedulerService** — orquesta el flujo completo: valida los datos del formulario, crea el evento en Calendar con los 3 invitados y envía el correo HTML personalizado al candidato

---

## Flujo de automatización

```
RR.HH. comparte el enlace /exec
  → Entrevistador ve la disponibilidad del calendario en tiempo real
  → Selecciona un slot libre + llena los datos del candidato y el rol
  → Gemini AI genera el cuerpo del correo personalizado
  → Se crea el evento en Google Calendar
  → Google Calendar envía la invitación nativa a: RR.HH. + Entrevistador + Candidato
  → El sistema envía además un correo HTML personalizado al Candidato
```

---

## Configuración

En `Backend.gs`, edita el objeto `CONFIG` al inicio del archivo:

```javascript
const CONFIG = {
  HR_CALENDAR_ID: 'HR_MAIL', // Correo del calendario donde se crean los eventos
  HR_EMAIL:       'HR_MAIL', // Correo de RR.HH. que recibe la invitación de Calendar
  GEMINI_API_KEY: '', // API Key de Gemini para pruebas poner la que esta en apikey.txt
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  TIMEZONE: 'America/Caracas', // Ver tabla de zonas horarias abajo
};
```

### Zonas horarias más comunes

| País / Ciudad | Valor para TIMEZONE |
|--------------|-------------------|
| Venezuela | `America/Caracas` |
| Colombia | `America/Bogota` |
| México (Ciudad de México) | `America/Mexico_City` |
| Argentina | `America/Argentina/Buenos_Aires` |
| España (Madrid) | `Europe/Madrid` |
| Francia (París) | `Europe/Paris` |
| Estados Unidos (Nueva York) | `America/New_York` |

> Si el evaluador quiere usar su propia API Key de Gemini, puede crearla gratis en [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) y reemplazar el valor de `GEMINI_API_KEY`.

---

## Despliegue

1. Crea un proyecto en [script.google.com](https://script.google.com)
2. Crea los 5 archivos con los nombres exactos indicados arriba
3. En `appsscript.json`, ajusta `timeZone` al país correspondiente
4. Configura `Backend.gs` con el email de RR.HH. y la API Key
5. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: `Yo`
   - Acceso: `Cualquier persona`
6. Copia la URL `/exec` — esa es la app en producción

> Si al abrir la URL aparece "No se puede abrir el archivo", ábrela en una ventana de incógnito (`Ctrl + Shift + N`) e inicia sesión con una cuenta de Google. Esto ocurre cuando hay múltiples cuentas activas en el navegador.

---

## Identidad visual

La interfaz usa la paleta corporativa exacta de EADIC definida en `Estilos.html`:

```css
--primary:   #040025;  /* Azul oscuro — fondos y header */
--secondary: #8ABC43;  /* Verde corporativo — acentos y logo */
--accent:    #2885FF;  /* Azul eléctrico — botones y links */
```

---

*Google Apps Script · Gemini AI · Google Calendar · Gmail*