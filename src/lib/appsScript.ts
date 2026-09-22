import { leerSesion } from './sesion'

const URL_APPS_SCRIPT = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined

export const appsScriptConfigurado = Boolean(URL_APPS_SCRIPT)

const TIMEOUT_MS = 25000

/**
 * A quién avisar cuando el backend rechaza las credenciales guardadas (te
 * desactivaron, te renombraron o te cambiaron la contraseña desde otro
 * dispositivo). Lo escucha AuthProvider para cerrar la sesión en vez de
 * dejar la app en un estado donde todo falla y no hay forma de salir.
 */
let alPerderSesion: (() => void) | null = null

export function onSesionInvalida(manejador: () => void): () => void {
  alPerderSesion = manejador
  return () => {
    if (alPerderSesion === manejador) alPerderSesion = null
  }
}

/**
 * ¿El error es "tus credenciales ya no sirven"? El backend manda
 * `codigo: 'SESION'`; el match por texto es el respaldo para una
 * implementación de Apps Script todavía sin actualizar.
 */
function esSesionInvalida(codigo: string | undefined, mensaje: string | undefined): boolean {
  if (codigo === 'SESION') return true
  return /sesi[oó]n no v[aá]lida/i.test(mensaje || '')
}

/**
 * Llama al backend de Apps Script. Usa POST con Content-Type text/plain
 * para evitar el preflight CORS (Apps Script no soporta OPTIONS). Devuelve
 * el objeto de respuesta si `ok:true`; si no, lanza Error con un mensaje en
 * español listo para mostrar al usuario.
 *
 * No hay JWT ni token de sesión: Apps Script valida usuario+contraseña en
 * cada llamada protegida, así que las acciones que lo necesitan reciben las
 * credenciales de la sesión guardada (ver `conCredenciales`).
 */
export async function callApi<T = Record<string, unknown>>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!URL_APPS_SCRIPT) {
    throw new Error('La aplicación no está configurada: falta VITE_APPS_SCRIPT_URL.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(URL_APPS_SCRIPT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('La conexión tardó demasiado. Revisa tu internet e intenta de nuevo.')
    }
    throw new Error('No se pudo conectar con el servidor.')
  } finally {
    clearTimeout(timer)
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new Error('La respuesta del servidor no es válida.')
  }

  const obj = data as { ok?: boolean; error?: string; codigo?: string } | null
  if (!obj || obj.ok !== true) {
    // En 'login' un rechazo es simplemente una contraseña mal escrita, no una
    // sesión caída: ahí no hay nada que cerrar.
    if (action !== 'login' && esSesionInvalida(obj?.codigo, obj?.error)) alPerderSesion?.()
    throw new Error(obj?.error || 'Error desconocido del servidor.')
  }
  return obj as T
}

/** Adjunta usuario/contraseña de la sesión actual a un payload de `callApi`. */
export function conCredenciales(payload: Record<string, unknown> = {}): Record<string, unknown> {
  const sesion = leerSesion()
  if (!sesion) throw new Error('La sesión ha expirado. Vuelve a iniciar sesión.')
  return { usuario: sesion.usuario, password: sesion.password, ...payload }
}
