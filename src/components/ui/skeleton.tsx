import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Placeholder animado con la forma del contenido real (rectángulo con
 * `animate-pulse`). Se usa mientras carga una lista, en vez del spinner
 * genérico de `<Cargando>`, para que la pantalla no "salte" cuando llegan
 * los datos: el layout final ya está ahí, solo cambia el contenido.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
}
