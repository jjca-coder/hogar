import { describe, expect, it } from 'vitest'
import { detectRecurring, normalizeMerchant, type CandidateTransaction } from './recurring'

/** Genera N cargos del mismo comercio separados por `gap` días. */
function series(
  description: string,
  amountEur: number,
  count: number,
  gap: number,
  startISO = '2026-01-05',
  jitter: readonly number[] = [],
): CandidateTransaction[] {
  const out: CandidateTransaction[] = []
  const start = new Date(startISO + 'T12:00:00')
  for (let i = 0; i < count; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + gap * i + (jitter[i] ?? 0))
    out.push({
      id: `${description}-${i}`,
      description,
      amount: -Math.round(amountEur * 100),
      date: d.toISOString().slice(0, 10),
      category_id: null,
    })
  }
  return out
}

describe('normalizeMerchant', () => {
  it('limpia el ruido de los literales del banco', () => {
    expect(normalizeMerchant('COMPRA TARJ. 1234 NETFLIX 12/03')).toBe('netflix')
    expect(normalizeMerchant('Recibo de SPOTIFY AB')).toBe('spotify ab')
  })

  it('agrupa variantes del mismo comercio', () => {
    const a = normalizeMerchant('PAGO EN MERCADONA 4471')
    const b = normalizeMerchant('COMPRA TARJETA MERCADONA')
    expect(a).toBe(b)
  })

  it('quita tildes para que no separen grupos', () => {
    expect(normalizeMerchant('Farmacia Almería')).toBe('farmacia almeria')
  })
})

describe('detectRecurring', () => {
  it('detecta una suscripción mensual', () => {
    const found = detectRecurring(series('NETFLIX', 17.99, 4, 30))
    expect(found).toHaveLength(1)
    expect(found[0]?.cadence).toBe('monthly')
    expect(found[0]?.averageAmount).toBe(1799)
    expect(found[0]?.yearlyCost).toBe(1799 * 12)
  })

  it('tolera unos días de desfase en la fecha de cargo', () => {
    const found = detectRecurring(series('SPOTIFY', 10.99, 4, 30, '2026-01-05', [0, 2, -1, 3]))
    expect(found).toHaveLength(1)
    expect(found[0]?.cadence).toBe('monthly')
  })

  it('ignora lo que solo aparece dos veces', () => {
    expect(detectRecurring(series('ZARA', 45.9, 2, 30))).toHaveLength(0)
  })

  it('ignora importes que varían mucho (no es una suscripción)', () => {
    const variable: CandidateTransaction[] = [
      { id: '1', description: 'MERCADONA', amount: -6430, date: '2026-01-05', category_id: null },
      { id: '2', description: 'MERCADONA', amount: -12080, date: '2026-02-04', category_id: null },
      { id: '3', description: 'MERCADONA', amount: -3150, date: '2026-03-06', category_id: null },
    ]
    expect(detectRecurring(variable)).toHaveLength(0)
  })

  it('ignora los ingresos', () => {
    const income = series('NOMINA', 1650, 4, 30).map((t) => ({ ...t, amount: -t.amount }))
    expect(detectRecurring(income)).toHaveLength(0)
  })

  it('distingue semanal, mensual y anual', () => {
    const all = [
      ...series('GIMNASIO', 9.9, 5, 7),
      ...series('NETFLIX', 17.99, 4, 30),
      ...series('DOMINIO WEB', 12, 3, 365, '2023-01-10'),
    ]
    const found = detectRecurring(all)
    const byName = Object.fromEntries(found.map((f) => [f.name, f.cadence]))
    expect(byName['GIMNASIO']).toBe('weekly')
    expect(byName['NETFLIX']).toBe('monthly')
    expect(byName['DOMINIO WEB']).toBe('yearly')
  })

  it('ordena por coste anual, de mayor a menor', () => {
    const found = detectRecurring([...series('BARATO', 2, 4, 30), ...series('CARO', 50, 4, 30)])
    expect(found[0]?.name).toBe('CARO')
  })

  it('avisa de una subida de precio', () => {
    const items = series('NETFLIX', 13.99, 3, 30)
    items.push({
      id: 'nuevo',
      description: 'NETFLIX',
      amount: -1499,
      date: '2026-04-05',
      category_id: null,
    })
    const found = detectRecurring(items)
    expect(found[0]?.priceIncreased).toBe(true)
  })

  it('calcula la próxima fecha esperada', () => {
    const found = detectRecurring(series('NETFLIX', 17.99, 4, 30, '2026-01-05'))
    expect(found[0]?.lastSeen).toBe('2026-04-05')
    expect(found[0]?.nextExpected).toBe('2026-05-05')
  })
})
