import { money, type Money } from './money'

export interface BudgetProgress {
  planned: Money
  spent: Money
  remaining: Money
  /** 0–1+ (puede pasar de 1 si te has pasado). */
  ratio: number
  /** Gasto estimado a fin de periodo al ritmo actual. */
  projected: Money
  /** ¿La proyección se sale del presupuesto? */
  willOverspend: boolean
  status: 'ok' | 'warning' | 'over'
}

/**
 * Estado de una línea de presupuesto.
 *
 * La proyección es lineal sobre los días transcurridos: sencilla de explicar
 * ("a este ritmo terminarás en X") y suficiente. Los días se cuentan enteros
 * e incluyen el de hoy, porque el gasto de hoy ya cuenta.
 */
export function budgetProgress(
  plannedMinor: number,
  spentMinor: number,
  dayOfPeriod: number,
  daysInPeriod: number,
): BudgetProgress {
  const planned = money(Math.max(plannedMinor, 0))
  const spent = money(Math.max(spentMinor, 0))
  const remaining = money(planned.amount - spent.amount)
  const ratio = planned.amount > 0 ? spent.amount / planned.amount : 0

  const day = Math.min(Math.max(dayOfPeriod, 1), daysInPeriod)
  const projected = money(Math.round((spent.amount / day) * daysInPeriod))

  const status: BudgetProgress['status'] =
    ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warning' : 'ok'

  return {
    planned,
    spent,
    remaining,
    ratio,
    projected,
    willOverspend: planned.amount > 0 && projected.amount > planned.amount,
    status,
  }
}

/** Reparto 50/30/20 sobre unos ingresos, sin perder céntimos. */
export function fiftyThirtyTwenty(incomeMinor: number): {
  needs: Money
  wants: Money
  savings: Money
} {
  const needs = Math.round(incomeMinor * 0.5)
  const wants = Math.round(incomeMinor * 0.3)
  // El resto va a ahorro para que la suma cuadre exactamente
  return {
    needs: money(needs),
    wants: money(wants),
    savings: money(incomeMinor - needs - wants),
  }
}
