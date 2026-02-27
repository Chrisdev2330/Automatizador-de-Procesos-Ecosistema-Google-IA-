// Configuración global del proyecto
const CONFIG = {
  HR_CALENDAR_ID: 'HR_EMAIL', // Email del calendario de RR.HH. donde se crean los eventos
  HR_EMAIL:       'HR_EMAIL', // Correo de RR.HH. que recibe la invitación de Calendar
  GEMINI_API_KEY: '', // API Key de Gemini se encuntra en apikey.txt (los evaluadores pueden usar esta o crear la suya en aistudio.google.com) 
  GEMINI_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
  TIMEZONE: 'America/Caracas', // Ajustar según el país: America/Bogota, Europe/Paris, etc.
  MEETING_DURATION_MINUTES: 60,
  SLOTS_DAYS_AHEAD: 7,
  WORKING_HOURS: { start: 8, end: 18 },
  SLOT_INTERVAL_MINUTES: 60,
};


// Punto de entrada de la Web App
function doGet() {
  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Agendador Técnico · EADIC')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// Incluye archivos HTML externos dentro de Index.html
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


// ── CALENDARIO ────────────────────────────────────────────────

// Devuelve los slots libres del calendario de RR.HH. para los próximos N días
function getAvailableSlots() {
  try {
    const calendar = CalendarApp.getCalendarById(CONFIG.HR_CALENDAR_ID);
    const now      = new Date();
    const endDate  = new Date(now);
    endDate.setDate(endDate.getDate() + CONFIG.SLOTS_DAYS_AHEAD);

    const existingEvents = calendar.getEvents(now, endDate);
    const busyRanges = existingEvents.map(e => ({
      start: e.getStartTime().getTime(),
      end:   e.getEndTime().getTime(),
    }));

    const slots  = [];
    const cursor = new Date(now);
    cursor.setMinutes(0, 0, 0);

    if (cursor.getHours() < CONFIG.WORKING_HOURS.start) {
      cursor.setHours(CONFIG.WORKING_HOURS.start, 0, 0, 0);
    } else {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
    }

    while (cursor < endDate) {
      const h          = cursor.getHours();
      const isWeekend  = cursor.getDay() === 0 || cursor.getDay() === 6;
      const isWorkHour = h >= CONFIG.WORKING_HOURS.start && h < CONFIG.WORKING_HOURS.end;

      if (!isWeekend && isWorkHour) {
        const slotStart = cursor.getTime();
        const slotEnd   = slotStart + CONFIG.MEETING_DURATION_MINUTES * 60 * 1000;
        const isBusy    = busyRanges.some(r => slotStart < r.end && slotEnd > r.start);

        if (!isBusy) {
          slots.push({
            label:     Utilities.formatDate(cursor, CONFIG.TIMEZONE, "EEE dd MMM · HH:mm"),
            iso:       cursor.toISOString(),
            timestamp: slotStart,
          });
        }
      }

      cursor.setMinutes(cursor.getMinutes() + CONFIG.SLOT_INTERVAL_MINUTES);
    }

    return slots;

  } catch (err) {
    Logger.log('getAvailableSlots error: ' + err.message);
    throw new Error('No se pudo leer el calendario. Verifica los permisos: ' + err.message);
  }
}


// ── GEMINI AI ─────────────────────────────────────────────────

// Genera el cuerpo del correo usando Gemini. Si falla, usa el fallback.
function generateEmailWithAI(roleName, candidateName, dateLabel, interviewerName) {
  const prompt = `
Eres el asistente de comunicaciones de EADIC, empresa líder en formación e ingeniería.
Redacta un correo de invitación de entrevista técnica con estas características:

- Tono: profesional, cálido y motivador.
- Idioma: español neutro (sin regionalismos).
- Estructura: saludo, contexto, detalles de la entrevista, cierre motivador, firma.
- Sin asunto (se envía aparte). Máximo 200 palabras. Sin etiquetas HTML.
- NO uses emojis ni caracteres especiales decorativos de ningún tipo.

Datos:
- Candidato: ${candidateName}
- Rol: ${roleName}
- Entrevistador: ${interviewerName}
- Fecha y hora: ${dateLabel}
- Empresa: EADIC

Devuelve únicamente el cuerpo del correo, sin texto adicional.
  `.trim();

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 512 },
  };

  const response = UrlFetchApp.fetch(
    CONFIG.GEMINI_ENDPOINT + '?key=' + CONFIG.GEMINI_API_KEY,
    { method: 'POST', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true }
  );

  const data = JSON.parse(response.getContentText());

  if (data.error) {
    Logger.log('Gemini API error: ' + JSON.stringify(data.error));
    return _fallbackEmail(candidateName, roleName, dateLabel, interviewerName);
  }

  return data?.candidates?.[0]?.content?.parts?.[0]?.text
    || _fallbackEmail(candidateName, roleName, dateLabel, interviewerName);
}

// Email de respaldo si Gemini no responde
function _fallbackEmail(candidateName, roleName, dateLabel, interviewerName) {
  return 'Estimado/a ' + candidateName + ',\n\n' +
    'Es un placer contactarle en nombre del equipo de EADIC.\n\n' +
    'Tras revisar su perfil, nos complace invitarle a una entrevista técnica para el rol de ' + roleName + '. ' +
    'Es una excelente oportunidad para conocerse mutuamente y explorar cómo su talento puede contribuir a nuestro equipo.\n\n' +
    'Fecha y hora: ' + dateLabel + '\n' +
    'Entrevistador: ' + interviewerName + '\n\n' +
    'La invitación de Google Calendar ha sido enviada a su correo. Le pedimos confirmar su asistencia a través del evento.\n\n' +
    'Estamos seguros de que esta conversación será el inicio de una gran colaboración.\n\n' +
    'Un saludo cordial,\n' +
    'Equipo de Recursos Humanos - EADIC';
}


// ── AGENDAMIENTO ──────────────────────────────────────────────

// Orquesta el flujo: valida datos, genera email con IA, crea evento en Calendar y envía correo al candidato
function scheduleInterview(formData) {
  try {
    _validateFormData(formData);

    const startTime = new Date(formData.slotIso);
    const endTime   = new Date(startTime.getTime() + CONFIG.MEETING_DURATION_MINUTES * 60 * 1000);
    const title     = 'Entrevista Tecnica - ' + formData.roleName + ' | ' + formData.candidateName;

    // Genera el cuerpo del correo personalizado con Gemini AI
    const emailBody = generateEmailWithAI(
      formData.roleName,
      formData.candidateName,
      formData.slotLabel,
      formData.interviewerName
    );

    // Crea el evento en Calendar — solo el entrevistador recibe la invitación nativa de Calendar
    // El candidato recibe únicamente el correo HTML personalizado
    const calendar = CalendarApp.getCalendarById(CONFIG.HR_CALENDAR_ID);
    const event    = calendar.createEvent(title, startTime, endTime, {
      description: emailBody,
      guests: [CONFIG.HR_EMAIL, formData.interviewerEmail].join(','),
      sendInvites: true,
    });

    // Construye el link al evento de Calendar (formato correcto para el botón del correo)
    const calendarLink = 'https://calendar.google.com/calendar/r/eventedit?' +
      'text=' + encodeURIComponent(title) +
      '&dates=' + _formatDateForCalendar(startTime) + '/' + _formatDateForCalendar(endTime);

    // Solo el candidato recibe el correo personalizado con diseño HTML
    // RR.HH. y el entrevistador ya reciben la invitación nativa de Google Calendar (sendInvites:true)
    _sendCandidateEmail({
      to:        formData.candidateEmail,
      subject:   'Invitacion a Entrevista Tecnica - ' + formData.roleName + ' | EADIC',
      body:      emailBody,
      eventLink: calendarLink,
      formData,
    });

    Logger.log('Evento creado: ' + event.getId());

    return {
      success: true,
      message: 'Entrevista agendada para el ' + formData.slotLabel + '. Las invitaciones han sido enviadas correctamente.',
      eventId: event.getId(),
    };

  } catch (err) {
    Logger.log('scheduleInterview error: ' + err.message);
    return {
      success: false,
      message: err.message || 'Ocurrio un error inesperado. Por favor, intentalo de nuevo.',
    };
  }
}

// Formatea una fecha al formato YYYYMMDDTHHMMSSZ que usa Google Calendar en URLs
function _formatDateForCalendar(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Valida que todos los campos requeridos estén presentes y tengan formato correcto
function _validateFormData(data) {
  const required = ['slotIso','slotLabel','candidateName','candidateEmail','roleName','interviewerName','interviewerEmail'];
  const missing  = required.filter(k => !data[k] || String(data[k]).trim() === '');

  if (missing.length > 0) throw new Error('Faltan campos requeridos: ' + missing.join(', '));

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(data.candidateEmail))   throw new Error('El correo del candidato no es valido.');
  if (!emailRe.test(data.interviewerEmail)) throw new Error('El correo del entrevistador no es valido.');
}

// Envía el correo HTML personalizado únicamente al candidato
function _sendCandidateEmail(opts) {
  const { to, subject, body, eventLink, formData } = opts;

  const htmlBody =
    '<!DOCTYPE html>' +
    '<html lang="es"><head><meta charset="UTF-8"></head>' +
    '<body style="font-family:\'Segoe UI\',Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px;">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);">' +
      '<tr>' +
        '<td style="background:#040025;padding:32px 40px;text-align:center;">' +
          '<h1 style="color:#8ABC43;font-size:26px;margin:0;letter-spacing:1px;">EADIC</h1>' +
          '<p style="color:#fff;margin:6px 0 0;font-size:13px;opacity:.8;letter-spacing:2px;text-transform:uppercase;">Formacion e Ingenieria</p>' +
        '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="padding:40px;color:#1a1a2e;font-size:15px;line-height:1.8;">' +
          '<p style="white-space:pre-line;margin:0 0 24px;">' + body + '</p>' +
          '<table width="100%" style="background:#f0f4ff;border-left:4px solid #8ABC43;border-radius:6px;padding:20px;margin-bottom:24px;">' +
            '<tr><td>' +
              '<p style="margin:4px 0;font-size:14px;"><strong>Rol:</strong> ' + formData.roleName + '</p>' +
              '<p style="margin:4px 0;font-size:14px;"><strong>Fecha:</strong> ' + formData.slotLabel + '</p>' +
              '<p style="margin:4px 0;font-size:14px;"><strong>Entrevistador:</strong> ' + formData.interviewerName + '</p>' +
            '</td></tr>' +
          '</table>' +
          '<p style="text-align:center;margin:28px 0 0;">' +
            '<a href="' + eventLink + '" style="background:#2885FF;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">' +
              'Ver evento en Google Calendar' +
            '</a>' +
          '</p>' +
        '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="background:#040025;padding:20px 40px;text-align:center;">' +
          '<p style="color:#8ABC43;font-size:12px;margin:0;">EADIC - Todos los derechos reservados</p>' +
        '</td>' +
      '</tr>' +
    '</table>' +
    '</body></html>';

  GmailApp.sendEmail(to, subject, body, {
    htmlBody: htmlBody,
    name: 'EADIC - Recursos Humanos',
  });
}