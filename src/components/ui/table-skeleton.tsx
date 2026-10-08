import { useLayoutEffect, useRef, useState } from 'react'
import { Skeleton } from './skeleton'

const MARGEN_INFERIOR = 32
const FILAS_MINIMAS = 3

/**
 * Filas de tabla placeholder, con el mismo `border`/`padding` que las tablas
 * reales de Manuales y Usuarios, para que no haya salto de layout cuando
 * llegan los datos. `columnas` da el ancho relativo de cada columna (en %).
 *
 * La cantidad de filas se calcula midiendo el alto libre hasta el borde
 * inferior de la ventana, así llena la pantalla sin generar scroll.
 */
export function TableSkeleton({ columnas }: { columnas: number[] }) {
  const contenedor = useRef<HTMLDivElement>(null)
  const [filas, setFilas] = useState(FILAS_MINIMAS)

  useLayoutEffect(() => {
    function calcular() {
      const el = contenedor.current
      const fila = el?.querySelector('tbody tr')
      const cabecera = el?.querySelector('thead')
      if (!el || !fila || !cabecera) return
      const libre =
        window.innerHeight - el.getBoundingClientRect().top - cabecera.getBoundingClientRect().height - MARGEN_INFERIOR
      setFilas(Math.max(FILAS_MINIMAS, Math.floor(libre / fila.getBoundingClientRect().height)))
    }
    calcular()
    window.addEventListener('resize', calcular)
    return () => window.removeEventListener('resize', calcular)
  }, [])

  return (
    <div ref={contenedor} className="w-full overflow-hidden rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columnas.map((ancho, col) => (
              <th key={col} className="px-4 py-2.5">
                <Skeleton className="h-3" style={{ width: `${Math.min(ancho, 40)}%` }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: filas }).map((_, fila) => (
            <tr key={fila} className="border-b border-border last:border-0">
              {columnas.map((ancho, col) => (
                <td key={col} className="px-4 py-2.5">
                  <Skeleton className="h-4" style={{ width: `${ancho}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
