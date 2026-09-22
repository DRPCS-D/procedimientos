import type { Rol } from './tipos'

const CLAVE = 'procedimientos:sesion'

export interface Sesion {
  usuario: string
  password: string
  rol: Rol
}

/** Devuelve la sesión guardada, o null si no hay o está corrupta. */
export function leerSesion(): Sesion | null {
  try {
    const cruda = localStorage.getItem(CLAVE)
    if (!cruda) return null
    const s = JSON.parse(cruda) as Partial<Sesion>
    if (s && s.usuario && s.password && s.rol) return s as Sesion
  } catch {
    // sesión corrupta: se ignora
  }
  return null
}

export function guardarSesion(sesion: Sesion): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(sesion))
  } catch {
    // Sin persistencia la sesión dura lo que la pestaña: peor, pero no roto.
  }
}

export function borrarSesion(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // no-op
  }
}
