import { useId, useMemo, useState, type PointerEvent } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { eur } from '../lib/format'

export interface Point {
  date: string // YYYY-MM-DD
  value: number // céntimos
}

const W = 320
const H = 108
const PAD_Y = 10

/**
 * Evolución del patrimonio: una sola serie, sin leyenda (el título la nombra).
 * El color sigue el signo del periodo, no el rango. Crosshair + tooltip al pasar
 * el dedo o el ratón.
 */
export default function NetWorthChart({ points }: { points: Point[] }) {
  const gradId = useId()
  const [hover, setHover] = useState<number | null>(null)

  const { path, area, coords, min, max } = useMemo(() => {
    if (points.length === 0) return { path: '', area: '', coords: [], min: 0, max: 0 }
    const values = points.map((p) => p.value)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const span = hi - lo || Math.abs(hi) || 1
    const stepX = points.length > 1 ? W / (points.length - 1) : 0
    const cs = points.map((p, i) => ({
      x: points.length > 1 ? i * stepX : W / 2,
      y: PAD_Y + (1 - (p.value - lo) / span) * (H - PAD_Y * 2),
      ...p,
    }))
    const d = cs.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
    return {
      path: d,
      area: `${d} L${W},${H} L0,${H} Z`,
      coords: cs,
      min: lo,
      max: hi,
    }
  }, [points])

  if (points.length < 2) {
    return (
      <div className="h-[108px] flex items-center justify-center text-faint text-sm">
        Aún no hay histórico suficiente para la gráfica
      </div>
    )
  }

  const rising = points[points.length - 1].value >= points[0].value
  const stroke = rising ? 'var(--color-up)' : 'var(--color-down)'
  const active = hover != null ? coords[hover] : null

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - rel)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setHover(best)
  }

  return (
    <div className="relative select-none">
      {active && (
        <div
          className="absolute -top-1 z-10 pointer-events-none -translate-x-1/2 whitespace-nowrap
                     rounded-xl bg-raised border border-hairline px-2.5 py-1.5 text-center"
          style={{
            left: `${Math.min(Math.max((active.x / W) * 100, 16), 84)}%`,
          }}
        >
          <p className="text-[13px] font-bold num leading-tight">{eur(active.value)}</p>
          <p className="text-[10px] text-dim leading-tight">
            {format(new Date(active.date + 'T12:00:00'), 'd LLL yyyy', { locale: es })}
          </p>
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[108px] overflow-visible touch-none"
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Evolución del patrimonio, de ${eur(min)} a ${eur(max)}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#${gradId})`} />
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {active && (
          <>
            <line
              x1={active.x}
              y1="0"
              x2={active.x}
              y2={H}
              stroke="var(--color-hairline)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r="4.5"
              fill={stroke}
              stroke="var(--color-surface)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    </div>
  )
}
