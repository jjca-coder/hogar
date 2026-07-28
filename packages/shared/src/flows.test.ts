import { describe, expect, it } from 'vitest'
import { flowTotals, spentByCategory, type Flowable } from './flows'

function tx(partial: Partial<Flowable> & { amount: number }): Flowable {
  return { is_transfer: false, is_refund: false, ...partial }
}

describe('flowTotals', () => {
  it('separa gasto e ingreso', () => {
    const r = flowTotals([tx({ amount: -1000 }), tx({ amount: 2500 }), tx({ amount: -500 })])
    expect(r.spent).toBe(1500)
    expect(r.earned).toBe(2500)
  })

  it('ignora los traspasos por completo', () => {
    const r = flowTotals([tx({ amount: -1000, is_transfer: true }), tx({ amount: 1000, is_transfer: true })])
    expect(r.spent).toBe(0)
    expect(r.earned).toBe(0)
  })

  it('un reembolso no es ingreso y descuenta del gasto', () => {
    // Gasté 100 y me devolvieron 30: gasto neto 70, ingreso 0.
    const r = flowTotals([tx({ amount: -10000 }), tx({ amount: 3000, is_refund: true })])
    expect(r.spent).toBe(7000)
    expect(r.earned).toBe(0)
  })

  it('no muestra gasto negativo si los reembolsos superan al gasto', () => {
    const r = flowTotals([tx({ amount: -1000 }), tx({ amount: 5000, is_refund: true })])
    expect(r.spent).toBe(0)
  })
})

describe('spentByCategory', () => {
  it('resta el reembolso de su categoría', () => {
    const m = spentByCategory([
      { amount: -10000, is_transfer: false, is_refund: false, category_id: 'ropa' },
      { amount: 3000, is_transfer: false, is_refund: true, category_id: 'ropa' },
    ])
    expect(m.get('ropa')).toBe(7000)
  })

  it('quita una categoría que queda a cero tras el reembolso', () => {
    const m = spentByCategory([
      { amount: -3000, is_transfer: false, is_refund: false, category_id: 'ropa' },
      { amount: 3000, is_transfer: false, is_refund: true, category_id: 'ropa' },
    ])
    expect(m.has('ropa')).toBe(false)
  })
})
