import { Loader2, Pencil, Printer, SquarePen, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatFecha } from '@/lib/format'
import type { Manual } from '@/lib/tipos'

/**
 * Ficha del manual + vista previa del Google Doc embebida.
 *
 * El overlay de carga tapa el iframe mientras cambia de manual: sin esto se
 * alcanza a ver el Doc ANTERIOR un instante antes de que cargue el nuevo
 * (el iframe conserva su contenido hasta que el `src` nuevo termina de
 * cargar). `cargandoDoc` se pone en `true` en cuanto cambia `manual.id`, y
 * solo se apaga con el `onLoad` del iframe correspondiente a ese id.
 */
export function ManualDetalleModal({
  manual,
  esAdmin,
  onCerrar,
  onEditarDatos,
  onBorrar,
  onEditarContenido,
}: {
  manual: Manual | null
  esAdmin: boolean
  onCerrar: () => void
  onEditarDatos: () => void
  onBorrar: () => void
  onEditarContenido: () => void
}) {
  const [cargandoDoc, setCargandoDoc] = useState(true)

  useEffect(() => {
    setCargandoDoc(true)
  }, [manual?.id])

  if (!manual) return null

  const urlPreview = manual.docId
    ? `https://docs.google.com/document/d/${encodeURIComponent(manual.docId)}/preview`
    : null
  const urlPdf = manual.docId
    ? `https://docs.google.com/document/d/${encodeURIComponent(manual.docId)}/export?format=pdf`
    : null
  const urlEditar =
    manual.docUrl || (manual.docId ? `https://docs.google.com/document/d/${encodeURIComponent(manual.docId)}/edit` : null)

  return (
    <Modal
      abierto={manual !== null}
      titulo={`#${manual.codigo} · ${manual.titulo}`}
      onCerrar={onCerrar}
      ancho="max-w-4xl"
      footer={
        <>
          {esAdmin && (
            <Button variant="outline" onClick={onBorrar}>
              <Trash2 className="text-destructive" /> Borrar
            </Button>
          )}
          {esAdmin && (
            <Button variant="outline" onClick={onEditarDatos}>
              <Pencil /> Editar datos
            </Button>
          )}
          {esAdmin && urlEditar && (
            <Button
              variant="outline"
              onClick={() => {
                window.open(urlEditar, '_blank') // abrir primero, dentro del gesto del usuario
                onEditarContenido()
              }}
            >
              <SquarePen /> Editar contenido
            </Button>
          )}
          {urlPdf && (
            <Button onClick={() => window.open(urlPdf, '_blank')}>
              <Printer /> Imprimir
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {manual.area && <Badge tono="primary">{manual.area}</Badge>}
          <span className="text-xs text-muted-foreground">
            Creado {formatFecha(manual.fechaCreacion)}
            {manual.usuarioCreador && ` por ${manual.usuarioCreador.toUpperCase()}`}
          </span>
          {manual.fechaModificacion && (
            <span className="text-xs text-muted-foreground">
              · Modificado {formatFecha(manual.fechaModificacion)}
              {manual.usuarioModificacion && ` por ${manual.usuarioModificacion.toUpperCase()}`}
            </span>
          )}
        </div>

        {manual.descripcion && <p className="text-sm text-muted-foreground">{manual.descripcion}</p>}

        <div className="relative h-[65vh] overflow-hidden rounded-md border border-border bg-secondary/30">
          {cargandoDoc && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {urlPreview ? (
            <iframe
              key={manual.id}
              src={urlPreview}
              title={manual.titulo}
              className="size-full"
              onLoad={() => setCargandoDoc(false)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Este manual no tiene documento.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
