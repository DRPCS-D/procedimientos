import { Skeleton } from './skeleton'

/**
 * Filas de tabla placeholder, con el mismo `border`/`padding` que las tablas
 * reales de Manuales y Usuarios, para que no haya salto de layout cuando
 * llegan los datos. `anchos` da el ancho relativo de cada columna (en %),
 * para que cada skeleton se parezca a lo que va a mostrar esa columna
 * (código corto, título largo, fecha media, etc.).
 */
export function TableSkeleton({ columnas, filas = 5 }: { columnas: number[]; filas?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-card">
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
