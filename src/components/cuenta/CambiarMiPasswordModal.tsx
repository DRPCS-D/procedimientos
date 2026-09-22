import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input } from '@/components/ui/field'
import { Modal } from '@/components/ui/modal'
import { callApi, conCredenciales } from '@/lib/appsScript'
import { guardarSesion, leerSesion } from '@/lib/sesion'

/** Cualquier usuario logueado cambia su propia contraseña (acción `cambiarMiPassword` en Code.gs). */
export function CambiarMiPasswordModal({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setPassword('')
      setConfirmacion('')
      setError(null)
    }
  }, [abierto])

  async function onGuardar() {
    if (password.length < 4) return setError('La contraseña es muy corta.')
    if (password !== confirmacion) return setError('Las contraseñas no coinciden.')

    setGuardando(true)
    setError(null)
    try {
      await callApi('cambiarMiPassword', conCredenciales({ nuevaPassword: password }))
      // La sesión guarda la contraseña para reenviarla en cada llamada: hay
      // que actualizarla también acá o el próximo request quedaría con la vieja.
      const sesion = leerSesion()
      if (sesion) guardarSesion({ ...sesion, password })
      toast.success('Contraseña actualizada')
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      abierto={abierto}
      titulo="Cambiar mi contraseña"
      onCerrar={onCerrar}
      ancho="max-w-sm"
      footer={
        <>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={onGuardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Cambiar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nueva contraseña">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field label="Repetir contraseña">
          <Input type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} />
        </Field>
        {error && <ErrorBox mensaje={error} />}
      </div>
    </Modal>
  )
}
