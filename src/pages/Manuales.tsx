import { FileText, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ManualDetalleModal } from '@/components/manuales/ManualDetalleModal'
import { ManualFormModal } from '@/components/manuales/ManualFormModal'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Input } from '@/components/ui/field'
import { ConfirmModal } from '@/components/ui/modal'
import { useAuth } from '@/hooks/useAuth'
import { useManuales } from '@/hooks/useManuales'
import { formatFecha, normalizar, recortar } from '@/lib/format'
import type { Manual } from '@/lib/tipos'

export default function Manuales() {
  const { esAdmin } = useAuth()
  const { data, loading, error, refetch, crear, editar, eliminar, marcarEdicion } = useManuales()
  const [busqueda, setBusqueda] = useState('')

  const [modalDetalle, setModalDetalle] = useState<Manual | null>(null)
  const [modalForm, setModalForm] = useState<'nuevo' | Manual | null>(null)
  const [modalBorrar, setModalBorrar] = useState<Manual | null>(null)
  const [borrando, setBorrando] = useState(false)

  const areas = useMemo(() => [...new Set(data.map((m) => m.area).filter(Boolean))].sort(), [data])

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda)
    if (!q) return data
    return data.filter((m) =>
      [m.codigo, m.titulo, m.area, m.descripcion].some((v) => normalizar(String(v ?? '')).includes(q)),
    )
  }, [data, busqueda])

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Manuales</h1>
          <p className="text-sm text-muted-foreground">Procedimientos de la empresa.</p>
        </div>
        {esAdmin && (
          <Button onClick={() => setModalForm('nuevo')}>
            <Plus /> Nuevo manual
          </Button>
        )}
      </div>

      {data.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por código, título, área…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      )}

      {loading ? (
        <Cargando />
      ) : error ? (
        <ErrorBox mensaje={error} />
      ) : data.length === 0 ? (
        <Vacio icono={FileText} titulo="Sin manuales todavía" />
      ) : filtrados.length === 0 ? (
        <Vacio icono={FileText} titulo="Sin resultados" descripcion="Probá con otra búsqueda." />
      ) : (
        <div className="w-full overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Código</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Título</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Área</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Creado</th>
                <th className="whitespace-nowrap px-4 py-2.5 font-medium">Modificado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setModalDetalle(m)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setModalDetalle(m)
                    }
                  }}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                >
                  <td className="tabular whitespace-nowrap px-4 py-2.5 font-medium text-foreground">#{m.codigo}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-foreground" title={m.titulo}>
                    {recortar(m.titulo, 20)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground" title={m.area}>
                    {recortar(m.area, 20) || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                    {formatFecha(m.fechaCreacion)}
                    {m.usuarioCreador && (
                      <span className="block text-[11px] text-muted-foreground/70">por {m.usuarioCreador.toUpperCase()}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                    {m.fechaModificacion ? (
                      <>
                        {formatFecha(m.fechaModificacion)}
                        {m.usuarioModificacion && (
                          <span className="block text-[11px] text-muted-foreground/70">
                            por {m.usuarioModificacion.toUpperCase()}
                          </span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ManualDetalleModal
        manual={modalDetalle}
        esAdmin={esAdmin}
        onCerrar={() => setModalDetalle(null)}
        onEditarDatos={() => {
          setModalForm(modalDetalle)
          setModalDetalle(null)
        }}
        onEditarContenido={() => {
          if (modalDetalle) marcarEdicion(modalDetalle.id)
        }}
        onBorrar={() => {
          setModalBorrar(modalDetalle)
          setModalDetalle(null)
        }}
      />

      <ManualFormModal
        abierto={modalForm !== null}
        manual={modalForm === 'nuevo' ? null : modalForm}
        areas={areas}
        onCerrar={() => setModalForm(null)}
        onGuardado={() => {
          setModalForm(null)
          refetch()
        }}
        crear={crear}
        editar={editar}
      />

      <ConfirmModal
        abierto={modalBorrar !== null}
        titulo="Borrar manual"
        textoConfirmar="Borrar"
        procesando={borrando}
        mensaje={
          <>
            ¿Borrar <strong>{modalBorrar?.titulo}</strong> (#{modalBorrar?.codigo})? El documento de Google Docs se
            moverá a la papelera de tu Drive.
          </>
        }
        onCancelar={() => setModalBorrar(null)}
        onConfirmar={async () => {
          if (!modalBorrar) return
          setBorrando(true)
          const { error: err } = await eliminar(modalBorrar.id)
          setBorrando(false)
          if (err) toast.error(err)
          else {
            toast.success('Manual borrado.')
            refetch()
          }
          setModalBorrar(null)
        }}
      />
    </div>
  )
}
