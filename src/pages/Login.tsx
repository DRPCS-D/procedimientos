import { Loader2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ErrorBox } from '@/components/ui/estado'
import { Field, Input } from '@/components/ui/field'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useAuth } from '@/hooks/useAuth'
import { appsScriptConfigurado } from '@/lib/appsScript'
import { APP_VERSION } from '@/lib/version'

export default function Login() {
  const { usuario, signIn } = useAuth()
  const navigate = useNavigate()

  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (usuario) navigate('/', { replace: true })
  }, [usuario, navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (enviando) return
    setError(null)
    setEnviando(true)
    const { error: err } = await signIn(nombre, password)
    setEnviando(false)
    if (err) setError(err)
    else navigate('/', { replace: true })
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="absolute right-3 top-3">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <img src="/logo.svg" alt="" className="mx-auto mb-3 size-12 rounded-xl" />
          <h1 className="text-lg font-semibold text-foreground">Procedimientos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ingresa con tu cuenta</p>
        </div>

        {!appsScriptConfigurado && (
          <div className="mb-4">
            <ErrorBox mensaje="Falta configurar VITE_APPS_SCRIPT_URL en el archivo .env" />
          </div>
        )}

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-xs"
        >
          <Field label="Usuario">
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </Field>

          <Field label="Contraseña">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>

          {error && <ErrorBox mensaje={error} />}

          <Button type="submit" className="w-full" disabled={enviando || !appsScriptConfigurado}>
            {enviando ? (
              <>
                <Loader2 className="animate-spin" /> Ingresando…
              </>
            ) : (
              'Ingresar'
            )}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Las cuentas las crea el administrador del sistema.
        </p>
        <p className="mt-2 text-center text-[11px] text-muted-foreground/70">v{APP_VERSION}</p>
      </div>
    </div>
  )
}
