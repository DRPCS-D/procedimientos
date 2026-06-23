import { CHAT_API_URL } from './config.js';
import { getCredenciales } from './auth.js';
import { esc } from './ui.js';

const TIMEOUT_MS = 45000;

/** Llama a la Edge Function del chat. Devuelve { respuesta, fuentes }. */
async function preguntar(pregunta) {
  if (!CHAT_API_URL || CHAT_API_URL.startsWith('PEGA')) {
    throw new Error('El asistente aún no está configurado (falta CHAT_API_URL en js/config.js).');
  }
  const creds = getCredenciales();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, pregunta }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('El asistente tardó demasiado en responder. Inténtalo de nuevo.');
    throw new Error('No se pudo conectar con el asistente.');
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!data || data.ok !== true) throw new Error((data && data.error) || 'Error del asistente.');
  return data;
}

/** Crea una burbuja de mensaje y la añade al hilo. Devuelve el elemento. */
function añadirBurbuja(quien, html) {
  const cont = document.getElementById('chat-mensajes');
  const bienvenida = cont.querySelector('.chat-bienvenida');
  if (bienvenida) bienvenida.remove();
  const div = document.createElement('div');
  div.className = `chat-msg chat-${quien}`;
  div.innerHTML = html;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  return div;
}

/**
 * Convierte el texto de la respuesta en HTML seguro: escapa, respeta saltos de
 * línea y transforma las citas [n] en enlaces a la fuente correspondiente.
 */
function formatearRespuesta(texto, fuentes) {
  const porN = new Map(fuentes.map((f) => [f.n, f]));
  return esc(texto)
    .replace(/\n/g, '<br>')
    .replace(/\[(\d+)\]/g, (m, n) => {
      const f = porN.get(Number(n));
      if (f && f.doc_url) {
        return `<a class="chat-cita" href="${esc(f.doc_url)}" target="_blank" rel="noopener" title="${esc(f.titulo || '')}">[${esc(n)}]</a>`;
      }
      return `<span class="chat-cita">[${esc(n)}]</span>`;
    });
}

/** Lista de fuentes bajo la respuesta. */
function fuentesHTML(fuentes) {
  if (!fuentes || !fuentes.length) return '';
  const items = fuentes.map((f) => {
    const etiqueta = [f.codigo ? `#${f.codigo}` : '', f.titulo || '(sin título)'].filter(Boolean).join(' ');
    const cuerpo = f.doc_url
      ? `<a href="${esc(f.doc_url)}" target="_blank" rel="noopener">${esc(etiqueta)}</a>`
      : esc(etiqueta);
    return `<li><span class="chat-fuente-n">[${esc(f.n)}]</span> ${cuerpo}</li>`;
  }).join('');
  return `<div class="chat-fuentes"><span class="chat-fuentes-tit">Fuentes</span><ul>${items}</ul></div>`;
}

async function enviar(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const btn = document.getElementById('chat-enviar');
  const pregunta = input.value.trim();
  if (!pregunta) return;

  añadirBurbuja('user', esc(pregunta));
  input.value = '';
  input.disabled = true;
  btn.disabled = true;

  const pensando = añadirBurbuja('bot', '<span class="chat-puntos"><span></span><span></span><span></span></span>');

  try {
    const { respuesta, fuentes } = await preguntar(pregunta);
    pensando.innerHTML = formatearRespuesta(respuesta, fuentes || []) + fuentesHTML(fuentes || []);
  } catch (err) {
    pensando.classList.add('chat-error');
    pensando.textContent = err.message;
  } finally {
    input.disabled = false;
    btn.disabled = false;
    input.focus();
    document.getElementById('chat-mensajes').scrollTop = document.getElementById('chat-mensajes').scrollHeight;
  }
}

export function initChat() {
  document.getElementById('chat-form').addEventListener('submit', enviar);
}
