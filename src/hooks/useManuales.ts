import { useCallback, useEffect, useState } from 'react'
import { callApi, conCredenciales } from '@/lib/appsScript'
import type { Manual } from '@/lib/tipos'

interface Estado {
  data: Manual[]
  loading: boolean
  error: string | null
}

export interface DatosManual {
  titulo: string
  area: string
  descripcion: string
}

export function useManuales() {
  const [estado, setEstado] = useState<Estado>({ data: [], loading: true, error: null })

  const refetch = useCallback(async () => {
    setEstado((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await callApi<{ manuales: Manual[] }>('listManuales', conCredenciales())
      setEstado({ data: data.manuales || [], loading: false, error: null })
    } catch (e) {
      setEstado({
        data: [],
        loading: false,
        error: e instanceof Error ? e.message : 'No se pudieron cargar los manuales.',
      })
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  async function crear(datos: DatosManual) {
    try {
      await callApi('createManual', conCredenciales({ ...datos }))
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo crear el manual.' }
    }
  }

  async function editar(id: string, datos: DatosManual) {
    try {
      await callApi('updateManual', conCredenciales({ id, ...datos } as Record<string, unknown>))
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo guardar el manual.' }
    }
  }

  async function eliminar(id: string) {
    try {
      await callApi('deleteManual', conCredenciales({ id }))
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo borrar el manual.' }
    }
  }

  /** Registra quién va a editar el contenido (al pulsar "Editar contenido"). Best-effort. */
  async function marcarEdicion(id: string) {
    try {
      await callApi('marcarEdicion', conCredenciales({ id }))
    } catch {
      // best-effort: no bloquea la apertura del Doc
    }
  }

  return { ...estado, refetch, crear, editar, eliminar, marcarEdicion }
}
