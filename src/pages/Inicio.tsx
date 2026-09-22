import { BookText, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

interface Modulo {
  to: string
  titulo: string
  descripcion: string
  icono: ComponentType<{ className?: string }>
}

export default function Inicio() {
  const { usuario, esAdmin } = useAuth()

  const modulos: Modulo[] = [
    {
      to: '/manuales',
      titulo: 'Manuales',
      descripcion: 'Procedimientos de la empresa, cada uno con su documento.',
      icono: BookText,
    },
    ...(esAdmin
      ? [
          {
            to: '/usuarios',
            titulo: 'Usuarios',
            descripcion: 'Altas, roles y contraseñas de quienes usan el sistema.',
            icono: Users,
          },
        ]
      : []),
  ]

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-foreground">Hola{usuario ? `, ${usuario}` : ''}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {esAdmin ? 'Admin' : 'Usuario'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modulos.map(({ to, titulo, descripcion, icono: Icono }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-lg border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="mb-3 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Icono className="size-4.5" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{descripcion}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
