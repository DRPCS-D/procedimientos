import { Paperclip, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import type { DatosManual } from '@/hooks/useManuales'
import { ADJUNTO_MAX_MB, type Manual } from '@/lib/tipos'

type Resultado = { error: string | null }

export function ManualFormModal({
  abierto,
  manual,
  areas,
  onCerrar,
  onGuardado,
  crear,
  editar,
  subirAdjunto,
  quitarAdjunto,
  crearDocumento,
}: {
  abierto: boolean
  /** null = crear, con valor = editar */
  manual: Manual | null
  areas: string[]
  onCerrar: () => void
  onGuardado: () => void
  crear: (datos: DatosManual) => Promise<Resultado & { id?: string }>
  editar: (id: string, datos: DatosManual) => Promise<Resultado>
  subirAdjunto: (id: string, archivo: File) => Promise<Resultado>
  quitarAdjunto: (id: string) => Promise<Resultado>
  crearDocumento: (id: string) => Promise<Resultado>
}) {
  const [titulo, setTitulo] = useState('')
  const [area, setArea] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [crearDoc, setCrearDoc] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [quitar, setQuitar] = useState(false)
  const [claveArchivo, setClaveArchivo] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setTitulo(manual?.titulo ?? '')
    setArea(manual?.area ?? '')
    setDescripcion(manual?.descripcion ?? '')
    setCrearDoc(false)
    setArchivo(null)
    setQuitar(false)
    setClaveArchivo((k) => k + 1)
    setError(null)
  }, [abierto, manual])

  function elegirArchivo(f: File | null) {
    if (f && f.size > ADJUNTO_MAX_MB * 1024 * 1024) {
      setError(`El archivo supera el máximo de ${ADJUNTO_MAX_MB} MB.`)
      setArchivo(null)
      setClaveArchivo((k) => k + 1)
      return
    }
    setError(null)
    setArchivo(f)
    if (f) setQuitar(false)
  }

  async function onGuardar() {
    const t = titulo.trim()
    if (!t) {
      setError('El título es obligatorio.')
      return
    }
    setGuardando(true)
    setError(null)
    const datos: DatosManual = { titulo: t, area: area.trim(), descripcion: descripcion.trim() }

    let id = manual?.id
    if (manual) {
      const r = await editar(manual.id, datos)
      if (r.error) {
        setGuardando(false)
        setError(r.error)
        return
      }
    } else {
      const r = await crear({ ...datos, crearDoc })
      if (r.error || !r.id) {
        setGuardando(false)
        setError(r.error ?? 'No se pudo crear el manual.')
        return
      }
      id = r.id
    }

    // El manual ya está guardado; si falla el adjunto se avisa pero no se pierde lo demás.
    let falloAdjunto: string | null = null
    if (id && archivo) {
      falloAdjunto = (await subirAdjunto(id, archivo)).error
    } else if (id && manual && quitar && manual.adjuntoId) {
      falloAdjunto = (await quitarAdjunto(id)).error
    }
    let falloDoc: string | null = null
    if (id && manual && !manual.docId && crearDoc) {
      falloDoc = (await crearDocumento(id)).error
    }
    setGuardando(false)

    if (falloDoc) {
      toast.warning(`Manual guardado, pero no se pudo crear el documento: ${falloDoc}`)
    } else if (falloAdjunto) {
      toast.warning(`Manual guardado, pero el archivo adjunto falló: ${falloAdjunto}`)
    } else {
      toast.success(manual ? 'Manual actualizado.' : crearDoc ? 'Manual creado con su documento.' : 'Manual creado.')
    }
    onGuardado()
  }

  const adjuntoActual = manual?.adjuntoId && !quitar ? manual.adjuntoNombre || 'Archivo adjunto' : null

  return (
    <Modal
      abierto={abierto}
      titulo={manual ? 'Editar manual' : 'Nuevo manual'}
      onCerrar={onCerrar}
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando
              ? archivo
                ? 'Subiendo…'
                : !manual && crearDoc
                  ? 'Creando documento…'
                  : 'Guardando…'
              : manual
                ? 'Guardar'
                : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título *" hint="Máximo 50 caracteres.">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={50} autoFocus />
        </Field>
        <Field label="Área" hint="Máximo 30 caracteres.">
          <Input value={area} onChange={(e) => setArea(e.target.value)} maxLength={30} list="areas-existentes" />
          <datalist id="areas-existentes">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="Descripción">
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
        </Field>

        <Field label="Archivo adjunto" hint={`Opcional. Un archivo, máximo ${ADJUNTO_MAX_MB} MB.`}>
          {archivo || adjuntoActual ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate" title={archivo?.name ?? adjuntoActual ?? ''}>
                {archivo?.name ?? adjuntoActual}
              </span>
              <button
                type="button"
                id={undefined}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Quitar archivo"
                aria-label="Quitar archivo"
                onClick={() => {
                  if (archivo) {
                    setArchivo(null)
                    setClaveArchivo((k) => k + 1)
                  } else setQuitar(true)
                }}
                disabled={guardando}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <Input
              key={claveArchivo}
              type="file"
              name="adjunto"
              className="h-auto cursor-pointer py-1.5 file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:font-medium"
              onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
              disabled={guardando}
            />
          )}
          {quitar && manual?.adjuntoId && (
            <p className="mt-1 text-xs text-muted-foreground">
              El archivo actual se quitará al guardar.{' '}
              <button type="button" className="underline" onClick={() => setQuitar(false)}>
                Deshacer
              </button>
            </p>
          )}
        </Field>

        {(!manual || !manual.docId) && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              name="crearDoc"
              className="mt-0.5 size-4 accent-primary"
              checked={crearDoc}
              onChange={(e) => setCrearDoc(e.target.checked)}
              disabled={guardando}
            />
            <span>
              Crear documento en Google Docs
              <span className="block text-xs text-muted-foreground">
                Si no lo marcas, podrás crearlo después.
              </span>
            </span>
          </label>
        )}

        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
