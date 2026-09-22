import { useCallback, useEffect, useState } from 'react'
import { callApi, conCredenciales } from '@/lib/appsScript'
import type { Rol, UsuarioApp } from '@/lib/tipos'

interface Estado {
  data: UsuarioApp[]
  loading: boolean
  error: string | null
}

/** Lista plana de usuarios del sistema: no hay `empresa_id`, es una sola compañía. */
export function useUsuarios() {
  const [estado, setEstado] = useState<Estado>({ data: [], loading: true, error: null })

  const refetch = useCallback(async () => {
    setEstado((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await callApi<{ usuarios: UsuarioApp[] }>('listUsuarios', conCredenciales())
      setEstado({ data: data.usuarios || [], loading: false, error: null })
    } catch (e) {
      setEstado({
        data: [],
        loading: false,
        error: e instanceof Error ? e.message : 'No se pudieron cargar los usuarios.',
      })
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function crear(payload: { usuario: string; password: string; rol: Rol; activo: boolean }) {
    try {
      await callApi(
        'createUsuario',
        conCredenciales({ nuevoUsuario: payload.usuario, nuevaPassword: payload.password, rol: payload.rol, activo: payload.activo }),
      )
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo crear el usuario.' }
    }
  }

  /** Actualiza rol/activo, y opcionalmente la contraseña (si se pasa no vacía). */
  async function editar(usuario: string, payload: { rol: Rol; activo: boolean; nuevaPassword?: string }) {
    try {
      await callApi(
        'updateUsuario',
        conCredenciales({
          targetUsuario: usuario,
          rol: payload.rol,
          activo: payload.activo,
          nuevaPassword: payload.nuevaPassword || '',
        }),
      )
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo guardar el usuario.' }
    }
  }

  async function eliminar(usuario: string) {
    try {
      await callApi('deleteUsuario', conCredenciales({ targetUsuario: usuario }))
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo borrar el usuario.' }
    }
  }

  return { ...estado, refetch, crear, editar, eliminar }
}
