import { Plus, Search, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorBox, Vacio } from '@/components/ui/estado'
import { Input } from '@/components/ui/field'
import { ConfirmModal } from '@/components/ui/modal'
import { EditarUsuarioModal, NuevoUsuarioModal } from '@/components/usuarios/UsuarioModales'
import { useAuth } from '@/hooks/useAuth'
import { useUsuarios } from '@/hooks/useUsuarios'
import { normalizar } from '@/lib/format'
import { ROL_LABEL } from '@/lib/tipos'

export default function Usuarios() {
  const { esAdmin, usuario: usuarioActual, actualizarNombreSesion } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!esAdmin) navigate('/', { replace: true })
  }, [esAdmin, navigate])

  const { data, loading, error, refetch, crear, editar, eliminar } = useUsuarios()
  const [busqueda, setBusqueda] = useState('')

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda)
    if (!q) return data
    return data.filter((u) => normalizar(u.usuario).includes(q))
  }, [data, busqueda])

  const [modalNuevo, setModalNuevo] = useState(false)
  const [modalEditar, setModalEditar] = useState<(typeof data)[number] | null>(null)
  const [modalBorrar, setModalBorrar] = useState<(typeof data)[number] | null>(null)
  const [borrando, setBorrando] = useState(false)

  if (!esAdmin) return null

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted-foreground">Quiénes tienen acceso al sistema.</p>
        </div>
        <Button onClick={() => setModalNuevo(true)}>
          <Plus /> Nuevo usuario
        </Button>
      </div>

      {data.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por usuario…"
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
        <Vacio icono={UserRound} titulo="Sin usuarios" />
      ) : filtrados.length === 0 ? (
        <Vacio icono={UserRound} titulo="Sin resultados" descripcion="Probá con otra búsqueda." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Usuario</th>
                <th className="px-4 py-2.5 font-medium">Rol</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((u) => (
                <tr
                  key={u.usuario}
                  onClick={() => setModalEditar(u)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {u.usuario}
                    {u.usuario.toUpperCase() === usuarioActual?.toUpperCase() && (
                      <span className="ml-2 text-xs text-muted-foreground">(vos)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{ROL_LABEL[u.rol]}</td>
                  <td className="px-4 py-2.5">
                    <Badge tono={u.activo ? 'success' : 'neutral'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NuevoUsuarioModal
        abierto={modalNuevo}
        onCerrar={() => setModalNuevo(false)}
        onCreado={() => {
          setModalNuevo(false)
          refetch()
        }}
        crear={crear}
      />

      <EditarUsuarioModal
        usuario={modalEditar}
        puedeBorrar={!!modalEditar && modalEditar.usuario.toUpperCase() !== usuarioActual?.toUpperCase()}
        onCerrar={() => setModalEditar(null)}
        onGuardado={(nombreFinal) => {
          // Si te renombraste a vos mismo, hay que actualizar la sesión local:
          // el backend ya no reconoce el nombre viejo en el próximo request.
          if (modalEditar && modalEditar.usuario.toUpperCase() === usuarioActual?.toUpperCase()) {
            actualizarNombreSesion(nombreFinal)
          }
          setModalEditar(null)
          refetch()
        }}
        onBorrar={() => {
          setModalBorrar(modalEditar)
          setModalEditar(null)
        }}
        editar={editar}
      />

      <ConfirmModal
        abierto={modalBorrar !== null}
        titulo="Borrar usuario"
        textoConfirmar="Borrar"
        procesando={borrando}
        mensaje={<>¿Borrar el usuario <strong>{modalBorrar?.usuario}</strong>? No podrá volver a iniciar sesión.</>}
        onCancelar={() => setModalBorrar(null)}
        onConfirmar={async () => {
          if (!modalBorrar) return
          setBorrando(true)
          const { error: err } = await eliminar(modalBorrar.usuario)
          setBorrando(false)
          if (err) toast.error(err)
          else {
            toast.success('Usuario borrado')
            refetch()
          }
          setModalBorrar(null)
        }}
      />
    </div>
  )
}
