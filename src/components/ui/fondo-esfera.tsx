import { useEffect, useRef } from 'react'

type V3 = [number, number, number]

const CONFIG = {
  nodos: 34,
  tamanoNodos: 2.5,
  grosorLineas: 4,
  radio: 0.62, // fracción del lado menor de la pantalla
  posX: 0.84,
  posY: 0.5,
  inclinacion: -0.35, // radianes
  velocidad: 0.04, // radianes por segundo
}

const COLOR_CLARO = '#d3dcee'
const COLOR_OSCURO = '#2c3a63'

function repartir(n: number): V3[] {
  const pts: V3[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const th = golden * i
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r])
  }
  // los nodos se repelen entre sí para un reparto parejo
  const spacing = Math.sqrt((4 * Math.PI) / n)
  const its = 90
  for (let it = 0; it < its; it++) {
    const F: V3[] = []
    let maxF = 1e-12
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      let fx = 0
      let fy = 0
      let fz = 0
      for (let j = 0; j < n; j++) {
        if (j === i) continue
        const b = pts[j]
        const dx = a[0] - b[0]
        const dy = a[1] - b[1]
        const dz = a[2] - b[2]
        const d2 = dx * dx + dy * dy + dz * dz + 1e-9
        const inv = 1 / (d2 * Math.sqrt(d2))
        fx += dx * inv
        fy += dy * inv
        fz += dz * inv
      }
      const dp = fx * a[0] + fy * a[1] + fz * a[2]
      fx -= dp * a[0]
      fy -= dp * a[1]
      fz -= dp * a[2]
      F.push([fx, fy, fz])
      maxF = Math.max(maxF, Math.hypot(fx, fy, fz))
    }
    const step = spacing * (0.3 * (1 - it / its) + 0.03)
    for (let i = 0; i < n; i++) {
      const a = pts[i]
      const x = a[0] + (F[i][0] * step) / maxF
      const y = a[1] + (F[i][1] * step) / maxF
      const z = a[2] + (F[i][2] * step) / maxF
      const l = Math.hypot(x, y, z) || 1
      a[0] = x / l
      a[1] = y / l
      a[2] = z / l
    }
  }
  return pts
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

function normalDe(P: V3[], a: number, b: number, c: number): V3 {
  const n = cross(sub(P[b], P[a]), sub(P[c], P[a]))
  const l = Math.hypot(n[0], n[1], n[2]) || 1
  return [n[0] / l, n[1] / l, n[2] / l]
}

/** Envolvente convexa 3D (incremental): de ahí salen las líneas. Devuelve triángulos de índices. */
function envolvente(P: V3[]): [number, number, number][] {
  const n = P.length
  const i0 = 0
  let i1 = -1
  let i2 = -1
  let i3 = -1
  for (let i = 1; i < n; i++) {
    if (Math.hypot(...sub(P[i], P[i0])) > 1e-6) {
      i1 = i
      break
    }
  }
  if (i1 < 0) return []
  for (let i = 1; i < n; i++) {
    if (i !== i1 && Math.hypot(...cross(sub(P[i1], P[i0]), sub(P[i], P[i0]))) > 1e-6) {
      i2 = i
      break
    }
  }
  if (i2 < 0) return []
  for (let i = 1; i < n; i++) {
    if (i === i1 || i === i2) continue
    if (Math.abs(dot(cross(sub(P[i1], P[i0]), sub(P[i2], P[i0])), sub(P[i], P[i0]))) > 1e-6) {
      i3 = i
      break
    }
  }
  if (i3 < 0) return []

  const cen = [0, 1, 2].map((k) => (P[i0][k] + P[i1][k] + P[i2][k] + P[i3][k]) / 4) as V3
  type Cara = { a: number; b: number; c: number; n: V3 }
  let F: Cara[] = []
  const agregar = (a: number, b: number, c: number) => {
    let nrm = normalDe(P, a, b, c)
    if (dot(nrm, sub(cen, P[a])) > 0) {
      const t = b
      b = c
      c = t
      nrm = [-nrm[0], -nrm[1], -nrm[2]]
    }
    F.push({ a, b, c, n: nrm })
  }
  agregar(i0, i1, i2)
  agregar(i0, i1, i3)
  agregar(i0, i2, i3)
  agregar(i1, i2, i3)

  const usados = new Set([i0, i1, i2, i3])
  for (let p = 0; p < n; p++) {
    if (usados.has(p)) continue
    const visibles: Cara[] = []
    const resto: Cara[] = []
    for (const f of F) (dot(f.n, sub(P[p], P[f.a])) > 1e-9 ? visibles : resto).push(f)
    if (!visibles.length) continue
    const dirigidas = new Set<number>()
    for (const f of visibles) {
      dirigidas.add(f.a * n + f.b)
      dirigidas.add(f.b * n + f.c)
      dirigidas.add(f.c * n + f.a)
    }
    const nuevas: Cara[] = []
    for (const f of visibles) {
      for (const [u, v] of [
        [f.a, f.b],
        [f.b, f.c],
        [f.c, f.a],
      ]) {
        if (!dirigidas.has(v * n + u)) nuevas.push({ a: u, b: v, c: p, n: normalDe(P, u, v, p) })
      }
    }
    F = resto.concat(nuevas)
  }
  return F.map((f) => [f.a, f.b, f.c])
}

/**
 * Fondo decorativo: esfera de nodos 3D girando lentamente, cortada por el borde
 * derecho. Solo dibuja la cara visible. Respeta prefers-reduced-motion (queda quieta).
 */
export function FondoEsfera() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const puntos = repartir(CONFIG.nodos)
    const caras = envolvente(puntos)
    const mapa = new Map<number, number>()
    const aristas: [number, number][] = []
    const aristasDeCara: number[][] = []
    for (const [a, b, c] of caras) {
      const fe: number[] = []
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ]) {
        const k = u < v ? u * puntos.length + v : v * puntos.length + u
        let idx = mapa.get(k)
        if (idx === undefined) {
          idx = aristas.length
          mapa.set(k, idx)
          aristas.push(u < v ? [u, v] : [v, u])
        }
        fe.push(idx)
      }
      aristasDeCara.push(fe)
    }

    const reducir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let rotY = 0.6
    let W = 0
    let H = 0
    let dpr = 1

    function ajustar() {
      if (!canvas) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth
      H = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(W * dpr))
      canvas.height = Math.max(1, Math.round(H * dpr))
    }

    function dibujar() {
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)

      const R = Math.min(W, H) * CONFIG.radio
      const cx = W * CONFIG.posX
      const cy = H * CONFIG.posY
      const cyw = Math.cos(rotY)
      const syw = Math.sin(rotY)
      const cxp = Math.cos(CONFIG.inclinacion)
      const sxp = Math.sin(CONFIG.inclinacion)

      const proj = puntos.map((p) => {
        const x = p[0] * cyw + p[2] * syw
        let z = -p[0] * syw + p[2] * cyw
        const y = p[1] * cxp - z * sxp
        z = p[1] * sxp + z * cxp
        const persp = 1 / (1 - z * 0.25)
        return { x: cx + x * R * persp, y: cy - y * R * persp, z, s: persp, rx: x, ry: y }
      })

      // una cara se ve si mira hacia la cámara (en z = 4)
      const aristaVisible = new Uint8Array(aristas.length)
      const nodoVisible = new Uint8Array(puntos.length)
      for (let fi = 0; fi < caras.length; fi++) {
        const f = caras[fi]
        const A = proj[f[0]]
        const B = proj[f[1]]
        const C = proj[f[2]]
        const ux = B.rx - A.rx
        const uy = B.ry - A.ry
        const uz = B.z - A.z
        const vx = C.rx - A.rx
        const vy = C.ry - A.ry
        const vz = C.z - A.z
        let nx = uy * vz - uz * vy
        let ny = uz * vx - ux * vz
        let nz = ux * vy - uy * vx
        const mx = (A.rx + B.rx + C.rx) / 3
        const my = (A.ry + B.ry + C.ry) / 3
        const mz = (A.z + B.z + C.z) / 3
        if (nx * mx + ny * my + nz * mz < 0) {
          nx = -nx
          ny = -ny
          nz = -nz
        }
        if (-nx * mx - ny * my + nz * (4 - mz) > 0) {
          for (const v of f) nodoVisible[v] = 1
          for (const e of aristasDeCara[fi]) aristaVisible[e] = 1
        }
      }

      const color = document.documentElement.classList.contains('dark') ? COLOR_OSCURO : COLOR_CLARO
      ctx.lineCap = 'round'
      ctx.strokeStyle = color
      ctx.lineWidth = R * 0.006 * CONFIG.grosorLineas
      ctx.beginPath()
      for (let i = 0; i < aristas.length; i++) {
        if (!aristaVisible[i]) continue
        const [a, b] = aristas[i]
        ctx.moveTo(proj[a].x, proj[a].y)
        ctx.lineTo(proj[b].x, proj[b].y)
      }
      ctx.stroke()

      ctx.fillStyle = color
      const base = R * 0.0215 * CONFIG.tamanoNodos
      for (let i = 0; i < proj.length; i++) {
        if (!nodoVisible[i]) continue
        const p = proj[i]
        const t = (p.z + 1) / 2
        ctx.beginPath()
        ctx.arc(p.x, p.y, base * p.s * (0.75 + 0.5 * t), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    let raf = 0
    let ultimo = performance.now()
    function cuadro(ahora: number) {
      const dt = Math.min(0.05, (ahora - ultimo) / 1000)
      ultimo = ahora
      rotY += dt * CONFIG.velocidad
      dibujar()
      raf = requestAnimationFrame(cuadro)
    }

    const alRedimensionar = () => {
      ajustar()
      if (reducir) dibujar()
    }
    window.addEventListener('resize', alRedimensionar)
    ajustar()
    if (reducir) dibujar()
    else raf = requestAnimationFrame(cuadro)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', alRedimensionar)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 size-full opacity-50" />
}
