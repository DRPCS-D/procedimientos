import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { callApi } from '@/lib/appsScript'
import { borrarSesion, guardarSesion, leerSesion, type Sesion } from '@/lib/sesion'
import type { Rol } from '@/lib/tipos'

interface AuthState {
  usuario: string | null
  rol: Rol | null
  esAdmin: boolean
  /**
   * Siempre false tras el arranque: a diferencia de una sesión con JWT, acá
   * no hay nada async que esperar al montar (la sesión vive entera en
   * localStorage). Se mantiene por si el shape necesita ampliarse más
   * adelante (por ejemplo, para validar la sesión contra el servidor al
   * abrir la app).
   */
  loading: boolean
  signIn: (usuario: string, password: string) => Promise<{ error: string | null }>
  signOut: () => void
  /**
   * Actualiza el nombre de la sesión actual sin volver a autenticar (misma
   * contraseña). Se usa cuando un Admin se renombra a sí mismo desde
   * Usuarios: sin esto, el próximo request con el nombre viejo fallaría.
   */
  actualizarNombreSesion: (nuevoUsuario: string) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion())

  const signIn = useCallback(async (usuario: string, password: string) => {
    try {
      const data = await callApi<{ usuario: string; rol: Rol }>('login', { usuario, password })
      const nueva: Sesion = { usuario: data.usuario || usuario, password, rol: data.rol }
      guardarSesion(nueva)
      setSesion(nueva)
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo iniciar sesión.' }
    }
  }, [])

  const signOut = useCallback(() => {
    borrarSesion()
    setSesion(null)
  }, [])

  const actualizarNombreSesion = useCallback((nuevoUsuario: string) => {
    setSesion((s) => {
      if (!s) return s
      const nueva = { ...s, usuario: nuevoUsuario }
      guardarSesion(nueva)
      return nueva
    })
  }, [])

  const valor = useMemo<AuthState>(
    () => ({
      usuario: sesion?.usuario ?? null,
      rol: sesion?.rol ?? null,
      esAdmin: sesion?.rol === 'admin',
      loading: false,
      signIn,
      signOut,
      actualizarNombreSesion,
    }),
    [sesion, signIn, signOut, actualizarNombreSesion],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>')
  return ctx
}
