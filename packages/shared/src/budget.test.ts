import { describe, expect, it } from 'vitest'
import { budgetProgress, fiftyThirtyTwenty } from './budget'

describe('budgetProgress', () => {
  it('calcula lo que queda y la proporción', () => {
    const p = budgetProgress(50_000, 20_000, 10, 30)
    expect(p.remaining.amount).toBe(30_000)
    expect(p.ratio).toBeCloseTo(0.4)
    expect(p.status).toBe('ok')
  })

  it('proyecta el gasto de fin de mes al ritmo actual', () => {
    // 200 € en 10 días de 30 -> 600 € proyectados
    const p = budgetProgress(50_000, 20_000, 10, 30)
    expect(p.projected.amount).toBe(60_000)
    expect(p.willOverspend).toBe(true)
  })

  it('avisa al llegar al 80 %', () => {
    expect(budgetProgress(10_000, 7_900, 15, 30).status).toBe('ok')
    expect(budgetProgress(10_000, 8_000, 15, 30).status).toBe('warning')
  })

  it('marca cuando ya te has pasado', () => {
    const p = budgetProgress(10_000, 12_500, 20, 30)
    expect(p.status).toBe('over')
    expect(p.remaining.amount).toBe(-2_500)
    expect(p.ratio).toBeCloseTo(1.25)
  })

  it('no se rompe el primer día del mes', () => {
    const p = budgetProgress(30_000, 1_000, 1, 30)
    expect(p.projected.amount).toBe(30_000)
    expect(Number.isFinite(p.ratio)).toBe(true)
  })

  it('no divide por cero si no hay presupuesto', () => {
    const p = budgetProgress(0, 5_000, 10, 30)
    expect(p.ratio).toBe(0)
    expect(p.willOverspend).toBe(false)
  })

  it('acota el día al tamaño del periodo', () => {
    const p = budgetProgress(10_000, 10_000, 45, 30)
    expect(p.projected.amount).toBe(10_000)
  })
})

describe('fiftyThirtyTwenty', () => {
  it('reparte sin perder ni un céntimo', () => {
    const r = fiftyThirtyTwenty(200_000)
    expect(r.needs.amount).toBe(100_000)
    expect(r.wants.amount).toBe(60_000)
    expect(r.savings.amount).toBe(40_000)
    expect(r.needs.amount + r.wants.amount + r.savings.amount).toBe(200_000)
  })

  it('cuadra con importes que no dividen exacto', () => {
    const income = 123_457
    const r = fiftyThirtyTwenty(income)
    expect(r.needs.amount + r.wants.amount + r.savings.amount).toBe(income)
  })
})
