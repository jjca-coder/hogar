import type { Currency } from './money'

// ---------- Identidad ----------

export const HOUSEHOLD_ROLES = ['owner', 'adult', 'viewer', 'child'] as const
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number]

/** Qué puede hacer cada rol. `child` nunca ve finanzas. */
export const ROLE_CAPABILITIES: Record<
  HouseholdRole,
  {
    finances: 'write' | 'read' | 'none'
    tasks: 'write' | 'read'
    members: boolean
    billing: boolean
  }
> = {
  owner: { finances: 'write', tasks: 'write', members: true, billing: true },
  adult: { finances: 'write', tasks: 'write', members: false, billing: false },
  viewer: { finances: 'read', tasks: 'read', members: false, billing: false },
  child: { finances: 'none', tasks: 'write', members: false, billing: false },
}

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  base_currency: Currency
  timezone: string
  locale: 'es' | 'en'
}

export interface Household {
  id: string
  name: string
  base_currency: Currency
  created_by: string
}

export interface HouseholdMember {
  household_id: string
  user_id: string
  role: HouseholdRole
}

// ---------- Finanzas ----------

export const ACCOUNT_TYPES = [
  'checking',
  'savings',
  'credit_card',
  'debit_card',
  'cash',
  'investment',
  'loan',
  'mortgage',
  'property',
  'crypto',
  'other',
] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/** Los pasivos restan del patrimonio neto y se guardan con saldo negativo. */
export const LIABILITY_TYPES: readonly AccountType[] = ['credit_card', 'loan', 'mortgage']

export const isLiability = (t: AccountType): boolean => LIABILITY_TYPES.includes(t)

export interface Account {
  id: string
  household_id: string
  institution_id: string | null
  name: string
  type: AccountType
  currency: Currency
  /** Unidades mínimas. Negativo en pasivos. */
  current_balance: number
  available_balance: number | null
  iban_last4: string | null
  include_in_net_worth: boolean
  owner_id: string | null
  is_manual: boolean
  archived: boolean
  position: number
}

export const TRANSACTION_SOURCES = ['bank', 'manual', 'imported'] as const
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number]

export const TRANSACTION_STATUSES = ['pending', 'booked'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

export interface Transaction {
  id: string
  household_id: string
  account_id: string
  booked_at: string
  value_date: string | null
  /** Unidades mínimas en la divisa de la cuenta. Negativo = gasto. */
  amount: number
  currency: Currency
  /** Mismo importe convertido a la divisa base del hogar. */
  amount_base: number
  raw_description: string
  clean_description: string | null
  merchant_id: string | null
  category_id: string | null
  notes: string | null
  tags: string[]
  is_transfer: boolean
  transfer_pair_id: string | null
  split_parent_id: string | null
  recurring_id: string | null
  status: TransactionStatus
  source: TransactionSource
  reviewed: boolean
  excluded_from_budget: boolean
  /** Nombre del cobrador u ordenante según el banco. */
  counterparty: string | null
  /** En cuentas conjuntas, qué miembro puso el dinero. */
  paid_by: string | null
}

export const CATEGORY_KINDS = ['expense', 'income', 'transfer'] as const
export type CategoryKind = (typeof CATEGORY_KINDS)[number]

export interface Category {
  id: string
  household_id: string | null
  parent_id: string | null
  name: string
  icon: string
  color: string
  kind: CategoryKind
  is_system: boolean
  position: number
}

// ---------- Hábitos ----------

export const HABIT_FREQUENCIES = ['daily', 'weekdays', 'times_per_week', 'every_n_days'] as const
export type HabitFrequency = (typeof HABIT_FREQUENCIES)[number]

export const HABIT_UNITS = ['times', 'minutes', 'pages', 'grams', 'litres', 'currency'] as const
export type HabitUnit = (typeof HABIT_UNITS)[number]

export interface Habit {
  id: string
  household_id: string
  owner_id: string
  name: string
  icon: string
  color: string
  /** `avoid` cuenta días sin hacerlo en lugar de repeticiones. */
  kind: 'do' | 'avoid'
  unit: HabitUnit
  target_per_period: number
  frequency: HabitFrequency
  /** ISO: 1 = lunes … 7 = domingo. Solo para `weekdays`. */
  weekdays: number[]
  interval_days: number
  reminder_at: string | null
  is_shared: boolean
  archived: boolean
}

// ---------- Tareas ----------

export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export interface Task {
  id: string
  household_id: string
  project_id: string | null
  parent_task_id: string | null
  title: string
  notes: string | null
  due_date: string | null
  planned_date: string | null
  due_time: string | null
  priority: TaskPriority
  tags: string[]
  /** Recurrencia en formato RRULE (RFC 5545). */
  rrule: string | null
  assigned_to: string | null
  completed_at: string | null
  position: number
}

// ---------- Transversal ----------

export const APP_MODULES = ['finances', 'habits', 'tasks'] as const
export type AppModule = (typeof APP_MODULES)[number]

export const THEMES = ['light', 'dark', 'auto'] as const
export type Theme = (typeof THEMES)[number]

export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

export interface UserSettings {
  user_id: string
  theme: Theme
  accent: string
  density: Density
  enabled_modules: AppModule[]
  week_starts_on: 1 | 7
  date_format: string
  hide_amounts: boolean
}
