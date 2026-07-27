export interface Profile {
  id: string
  name: string
  color: string
}

export interface Household {
  id: string
  name: string
  invite_code: string
}

export type Kind = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  emoji: string
  kind: Kind
  sort: number
}

export interface Transaction {
  id: string
  household_id: string
  category_id: string | null
  account_id: string | null
  description: string
  amount_cents: number
  kind: Kind
  paid_by: string
  is_shared: boolean
  date: string // YYYY-MM-DD
}

export type AccountKind =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'investment'
  | 'property'
  | 'card'
  | 'loan'

export interface Account {
  id: string
  household_id: string
  name: string
  kind: AccountKind
  institution: string | null
  balance_cents: number
  owner: string | null
  include_in_net_worth: boolean
  archived: boolean
  sort: number
  provider: string | null
  last_synced_at: string | null
}

export interface BalanceSnapshot {
  account_id: string
  date: string // YYYY-MM-DD
  balance_cents: number
}

/** Metadatos de presentación por tipo de cuenta. `debt` = resta del patrimonio. */
export const ACCOUNT_KINDS: Record<
  AccountKind,
  { label: string; plural: string; emoji: string; color: string; debt: boolean }
> = {
  checking: { label: 'Cuenta corriente', plural: 'Cuentas', emoji: '🏦', color: 'var(--color-acc-bank)', debt: false },
  savings: { label: 'Ahorro', plural: 'Ahorro', emoji: '🐷', color: 'var(--color-acc-savings)', debt: false },
  cash: { label: 'Efectivo', plural: 'Efectivo', emoji: '💵', color: 'var(--color-acc-cash)', debt: false },
  investment: { label: 'Inversión', plural: 'Inversiones', emoji: '📈', color: 'var(--color-acc-invest)', debt: false },
  property: { label: 'Propiedad', plural: 'Propiedades', emoji: '🏡', color: 'var(--color-acc-invest)', debt: false },
  card: { label: 'Tarjeta de crédito', plural: 'Tarjetas', emoji: '💳', color: 'var(--color-acc-debt)', debt: true },
  loan: { label: 'Préstamo', plural: 'Préstamos', emoji: '📉', color: 'var(--color-acc-debt)', debt: true },
}

export type Recurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface Task {
  id: string
  title: string
  notes: string | null
  assigned_to: string | null
  due_date: string | null // YYYY-MM-DD
  recurrence: Recurrence
  done_at: string | null
}

export type Frequency = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface Habit {
  id: string
  owner: string
  name: string
  emoji: string
  frequency: Frequency
  /** Veces por periodo, solo para 'weekly' y 'monthly'. */
  target_count: number
  /** Días objetivo en ISO (1 = lunes … 7 = domingo), solo para 'weekdays'. */
  weekdays: number[]
}

export interface HabitCheck {
  habit_id: string
  date: string // YYYY-MM-DD
}
