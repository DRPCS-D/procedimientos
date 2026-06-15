import { callApi } from './api.js';

const STORAGE_KEY = 'procedimientos-sesion';

/** Devuelve la sesión guardada { usuario, password, rol } o null. */
export function getSession() {
  try {
    const sesion = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (sesion && sesion.usuario && sesion.password && sesion.rol) return sesion;
  } catch {
    // sesión corrupta: se ignora
  }
  return null;
}

/** Credenciales de la sesión actual para enviar en cada llamada al backend. */
export function getCredenciales() {
  const sesion = getSession();
  if (!sesion) throw new Error('La sesión ha expirado. Vuelve a iniciar sesión.');
  return { usuario: sesion.usuario, password: sesion.password };
}

export function esAdmin() {
  const sesion = getSession();
  return !!sesion && sesion.rol === 'admin';
}

/** Valida credenciales contra el servidor y guarda la sesión en el dispositivo. */
export async function login(usuario, password) {
  const data = await callApi('login', { usuario, password });
  const sesion = { usuario: data.usuario || usuario, password, rol: data.rol };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sesion));
  return sesion;
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
}
