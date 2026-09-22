/** Formateo de fechas y texto de búsqueda. */

/** '2026-03-14T10:00:00.000Z' → '14/03/2026'. Recorta la hora si viene un timestamp. */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return '—'
  const d = String(f.getDate()).padStart(2, '0')
  const m = String(f.getMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${f.getFullYear()}`
}

export function formatFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const f = new Date(iso)
  if (Number.isNaN(f.getTime())) return '—'
  return `${formatFecha(iso)} ${String(f.getHours()).padStart(2, '0')}:${String(f.getMinutes()).padStart(2, '0')}`
}

/** Normaliza texto para buscar sin tildes ni mayusculas. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

/** Recorta un texto a `n` caracteres, con "…" si se pasó. */
export function recortar(texto: string | null | undefined, n: number): string {
  const t = String(texto || '')
  return t.length > n ? t.slice(0, n) + '…' : t
}
