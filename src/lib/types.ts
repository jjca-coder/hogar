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
  description: string
  amount_cents: number
  kind: Kind
  paid_by: string
  is_shared: boolean
  date: string // YYYY-MM-DD
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

export interface Habit {
  id: string
  owner: string
  name: string
  emoji: string
}

export interface HabitCheck {
  habit_id: string
  date: string // YYYY-MM-DD
}
