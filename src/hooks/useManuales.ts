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
  /** Solo al crear: false = no crear el Google Doc. */
  crearDoc?: boolean
}

/** Lee un archivo y devuelve su contenido en base64 (sin el prefijo data:). */
function leerBase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    lector.readAsDataURL(archivo)
  })
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
      const r = await callApi<{ manual: Manual }>('createManual', conCredenciales({ ...datos }))
      return { error: null, id: r.manual?.id as string | undefined }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo crear el manual.', id: undefined }
    }
  }

  async function subirAdjunto(id: string, archivo: File) {
    try {
      const datos = await leerBase64(archivo)
      await callApi(
        'subirAdjunto',
        conCredenciales({ id, nombre: archivo.name, tipo: archivo.type || 'application/octet-stream', datos }),
        120000, // las subidas grandes tardan más que una consulta normal
      )
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo subir el archivo.' }
    }
  }

  async function quitarAdjunto(id: string) {
    try {
      await callApi('quitarAdjunto', conCredenciales({ id }))
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo quitar el archivo.' }
    }
  }

  async function crearDocumento(id: string) {
    try {
      await callApi('crearDocumento', conCredenciales({ id }))
      return { error: null }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'No se pudo crear el documento.' }
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

  return {
    ...estado,
    refetch,
    crear,
    editar,
    eliminar,
    marcarEdicion,
    subirAdjunto,
    quitarAdjunto,
    crearDocumento,
  }
}
