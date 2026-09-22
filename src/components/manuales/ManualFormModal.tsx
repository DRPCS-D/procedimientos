import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input, Textarea } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import type { DatosManual } from '@/hooks/useManuales'
import type { Manual } from '@/lib/tipos'

export function ManualFormModal({
  abierto,
  manual,
  areas,
  onCerrar,
  onGuardado,
  crear,
  editar,
}: {
  abierto: boolean
  /** null = crear, con valor = editar */
  manual: Manual | null
  areas: string[]
  onCerrar: () => void
  onGuardado: () => void
  crear: (datos: DatosManual) => Promise<{ error: string | null }>
  editar: (id: string, datos: DatosManual) => Promise<{ error: string | null }>
}) {
  const [titulo, setTitulo] = useState('')
  const [area, setArea] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setTitulo(manual?.titulo ?? '')
    setArea(manual?.area ?? '')
    setDescripcion(manual?.descripcion ?? '')
    setError(null)
  }, [abierto, manual])

  async function onGuardar() {
    const t = titulo.trim()
    if (!t) {
      setError('El título es obligatorio.')
      return
    }
    setGuardando(true)
    setError(null)
    const datos: DatosManual = { titulo: t, area: area.trim(), descripcion: descripcion.trim() }
    const { error: err } = manual ? await editar(manual.id, datos) : await crear(datos)
    setGuardando(false)
    if (err) {
      setError(err)
      return
    }
    toast.success(manual ? 'Manual actualizado.' : 'Manual creado con su documento.')
    onGuardado()
  }

  return (
    <Modal
      abierto={abierto}
      titulo={manual ? 'Editar manual' : 'Nuevo manual'}
      descripcion={manual ? undefined : 'Se crea también el Google Doc del contenido.'}
      onCerrar={onCerrar}
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando ? (manual ? 'Guardando…' : 'Creando documento…') : manual ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título *" hint="Máximo 20 caracteres.">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={20} autoFocus />
        </Field>
        <Field label="Área" hint="Máximo 20 caracteres.">
          <Input value={area} onChange={(e) => setArea(e.target.value)} maxLength={20} list="areas-existentes" />
          <datalist id="areas-existentes">
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="Descripción">
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
