import { API_URL } from './config.js';

const TIMEOUT_MS = 25000;

/**
 * Llama al backend de Apps Script. Usa POST con Content-Type text/plain
 * para evitar el preflight CORS (Apps Script no soporta OPTIONS).
 * Devuelve el objeto de respuesta si ok=true; si no, lanza Error con
 * mensaje en español listo para mostrar al usuario.
 */
export async function callApi(action, payload = {}) {
  if (!API_URL || API_URL.startsWith('PEGA')) {
    throw new Error('La aplicación no está configurada: falta la URL de la API en js/config.js');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('La conexión tardó demasiado. Revisa tu internet e intenta de nuevo.');
    }
    throw new Error('No se pudo conectar con el servidor.');
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('La respuesta del servidor no es válida.');
  }

  if (!data || data.ok !== true) {
    throw new Error((data && data.error) || 'Error desconocido del servidor.');
  }
  return data;
}
