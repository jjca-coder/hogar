import type { Transaction } from './types'

export type Flowable = Pick<Transaction, 'amount' | 'is_transfer' | 'is_refund'>

export interface FlowTotals {
  /** Gasto neto (gastos menos reembolsos), unidades mínimas, nunca negativo. */
  spent: number
  /** Ingresos de verdad, sin reembolsos, unidades mínimas. */
  earned: number
}

/**
 * Reglas de conteo del dinero, en un solo sitio para que todas las pantallas
 * cuenten igual:
 *
 *  - Un TRASPASO entre cuentas propias no es ni gasto ni ingreso: se ignora.
 *  - Un REEMBOLSO es dinero gastado que ha vuelto (una devolución): NO es un
 *    ingreso; descuenta del gasto. Contarlo como ingreso inflaría los ingresos
 *    y escondería el gasto real.
 *  - Lo demás: negativo = gasto, positivo = ingreso.
 *
 * Devuelve unidades mínimas. `spent` se limita a 0 para no mostrar un gasto
 * negativo si en un periodo los reembolsos superan a los gastos.
 */
export function flowTotals(transactions: readonly Flowable[]): FlowTotals {
  let spent = 0
  let earned = 0
  for (const t of transactions) {
    if (t.is_transfer) continue
    if (t.is_refund) {
      spent -= Math.abs(t.amount)
      continue
    }
    if (t.amount < 0) spent += -t.amount
    else earned += t.amount
  }
  return { spent: Math.max(spent, 0), earned }
}

/**
 * Cuánto pesa cada categoría en el gasto, ya con los reembolsos descontados.
 * Devuelve un mapa categoría -> gasto neto (unidades mínimas). Los movimientos
 * sin categoría van bajo `fallbackKey`. No incluye entradas que queden a cero
 * o en negativo.
 */
export function spentByCategory(
  transactions: readonly (Flowable & { amount: number; category_id: string | null })[],
  fallbackKey = 'sin',
): Map<string, number> {
  const sums = new Map<string, number>()
  for (const t of transactions) {
    if (t.is_transfer) continue
    const key = t.category_id ?? fallbackKey
    if (t.is_refund) {
      sums.set(key, (sums.get(key) ?? 0) - Math.abs(t.amount))
    } else if (t.amount < 0) {
      sums.set(key, (sums.get(key) ?? 0) + -t.amount)
    }
  }
  // Una categoría íntegramente reembolsada no debe aparecer en negativo.
  for (const [key, total] of sums) if (total <= 0) sums.delete(key)
  return sums
}
