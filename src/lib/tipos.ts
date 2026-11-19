/**
 * Tipos del dominio. Se escriben a mano (no hay esquema que generar: el
 * backend es Apps Script sobre Google Sheets, no una base tipada).
 */

/** Coincide con lo que devuelve `normalizarRol_` en apps-script/Code.gs. */
export type Rol = 'admin' | 'user'

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Admin',
  user: 'Usuario',
}

export interface Manual {
  id: string
  codigo: string
  titulo: string
  descripcion: string
  area: string
  fechaCreacion: string
  fechaModificacion: string
  usuarioCreador: string
  usuarioModificacion: string
  docId: string
  docUrl: string
  adjuntoId: string
  adjuntoNombre: string
}

/** Tamaño máximo del archivo adjunto (coincide con ADJUNTO_MAX_BYTES de Code.gs). */
export const ADJUNTO_MAX_MB = 10

export interface UsuarioApp {
  usuario: string
  rol: Rol
  activo: boolean
}
