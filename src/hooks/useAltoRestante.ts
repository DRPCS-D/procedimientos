import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Estira el elemento hasta el borde inferior de la ventana (menos `margen`,
 * que debe cubrir el padding inferior del layout para no generar scroll).
 * Devuelve el ref a poner en el elemento; se recalcula en cada render y al
 * redimensionar, porque el elemento puede montarse tarde (tras cargar datos).
 */
export function useAltoRestante<T extends HTMLElement>(margen = 32) {
  const ref = useRef<T>(null)

  function ajustar() {
    const el = ref.current
    if (!el) return
    el.style.minHeight = `${Math.max(0, window.innerHeight - el.getBoundingClientRect().top - margen)}px`
  }

  useLayoutEffect(ajustar)

  useEffect(() => {
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  })

  return ref
}
