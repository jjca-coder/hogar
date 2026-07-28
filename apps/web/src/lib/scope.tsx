/* eslint-disable react-refresh/only-export-components -- proveedor y hooks juntos a propósito */
import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, Transaction } from '@aurora/shared'
import { useUserId } from './session'

/**
 * Ámbito del dinero que se está mirando.
 *
 * Una cuenta conjunta y una personal no deben sumarse a ciegas: mezclar "mi
 * dinero" con "el nuestro" hace que los totales no signifiquen nada. Este
 * selector deja elegir qué se cuenta, y todas las pantallas de finanzas lo
 * respetan a la vez.
 *
 *   all    todo el hogar (personales + conjuntas)
 *   mine   solo mis cuentas personales
 *   joint  solo las cuentas conjuntas
 */
export type FinanceScope = 'all' | 'mine' | 'joint'

export const SCOPE_LABELS: Record<FinanceScope, string> = {
  all: 'Todo',
  mine: 'Mío',
  joint: 'Conjunto',
}

const STORAGE_KEY = 'aurora.financeScope'

interface ScopeState {
  scope: FinanceScope
  setScope: (s: FinanceScope) => void
}

const ScopeContext = createContext<ScopeState>({ scope: 'all', setScope: () => {} })

export function FinanceScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<FinanceScope>(() => {
    if (typeof localStorage === 'undefined') return 'all'
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'mine' || saved === 'joint' ? saved : 'all'
  })

  const setScope = (s: FinanceScope) => {
    setScopeState(s)
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, s)
  }

  return <ScopeContext.Provider value={{ scope, setScope }}>{children}</ScopeContext.Provider>
}

export function useScope(): ScopeState {
  return useContext(ScopeContext)
}

/** ¿Encaja esta cuenta en el ámbito elegido? `mine` compara con mi id. */
export function accountInScope(
  account: Pick<Account, 'owner_id'>,
  scope: FinanceScope,
  userId: string | null,
): boolean {
  if (scope === 'all') return true
  if (scope === 'joint') return account.owner_id === null
  // 'mine': personales cuyo dueño soy yo. Sin id todavía, no filtro de más.
  return userId ? account.owner_id === userId : account.owner_id !== null
}

/**
 * Aplica el ámbito activo a una lista de cuentas y a una de movimientos.
 * Los movimientos se filtran por la cuenta a la que pertenecen, así que hace
 * falta el conjunto de cuentas visibles primero.
 */
export function useScopedFinances(
  accounts: Account[] | undefined,
  transactions?: Transaction[] | undefined,
) {
  const { scope } = useScope()
  const userId = useUserId()

  return useMemo(() => {
    const accs = accounts ?? []
    const visibleAccounts = accs.filter((a) => accountInScope(a, scope, userId))
    const visibleIds = new Set(visibleAccounts.map((a) => a.id))
    const txs = transactions ?? []
    const visibleTransactions =
      scope === 'all' ? txs : txs.filter((t) => visibleIds.has(t.account_id))
    return { scope, visibleAccounts, visibleTransactions, visibleIds }
  }, [accounts, transactions, scope, userId])
}
