import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfMonth, format, startOfMonth } from 'date-fns'
import type { Account, Category, Transaction } from '@aurora/shared'
import { sb } from './supabase'
import { useActiveHousehold } from './session'

/** Claves de caché en un solo sitio para no desincronizar invalidaciones. */
export const keys = {
  accounts: (h: string) => ['accounts', h] as const,
  categories: (h: string) => ['categories', h] as const,
  transactions: (h: string, from: string, to: string) => ['transactions', h, from, to] as const,
  monthSummary: (h: string, month: string) => ['month-summary', h, month] as const,
}

export function useAccounts() {
  const { membership } = useActiveHousehold()
  const h = membership?.household_id
  return useQuery({
    queryKey: keys.accounts(h ?? ''),
    enabled: Boolean(h),
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await sb()
        .from('accounts')
        .select('*')
        .eq('household_id', h!)
        .eq('archived', false)
        .order('position')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as Account[]
    },
  })
}

export interface HouseholdMember {
  user_id: string
  display_name: string
}

/** Miembros del hogar activo, para poder atribuir quién pagó algo. */
export function useHouseholdMembers() {
  const { membership } = useActiveHousehold()
  const h = membership?.household_id
  return useQuery({
    queryKey: ['members', h],
    enabled: Boolean(h),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<HouseholdMember[]> => {
      const { data, error } = await sb()
        .from('household_members')
        .select('user_id, profile:profiles(display_name)')
        .eq('household_id', h!)
      if (error) throw error
      return (data ?? []).map((m) => {
        // El join a uno se tipa como array por una rareza de Supabase; en
        // ejecución es un objeto. Se castea a través de unknown.
        const profile = m.profile as unknown as { display_name: string | null } | null
        return { user_id: m.user_id as string, display_name: profile?.display_name || 'Alguien' }
      })
    },
  })
}

export function useCategories() {
  const { membership } = useActiveHousehold()
  const h = membership?.household_id
  return useQuery({
    queryKey: keys.categories(h ?? ''),
    enabled: Boolean(h),
    // Las categorías del sistema casi nunca cambian: se cachean más tiempo.
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await sb()
        .from('categories')
        .select('*')
        .or(`household_id.is.null,household_id.eq.${h!}`)
        .eq('archived', false)
        .order('position')
      if (error) throw error
      return (data ?? []) as Category[]
    },
  })
}

export interface MonthRange {
  from: string
  to: string
}

export function monthRange(date: Date): MonthRange {
  return {
    from: format(startOfMonth(date), 'yyyy-MM-dd'),
    to: format(endOfMonth(date), 'yyyy-MM-dd'),
  }
}

export function useTransactions(range: MonthRange) {
  const { membership } = useActiveHousehold()
  const h = membership?.household_id
  return useQuery({
    queryKey: keys.transactions(h ?? '', range.from, range.to),
    enabled: Boolean(h),
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await sb()
        .from('transactions')
        .select('*')
        .eq('household_id', h!)
        .gte('booked_at', range.from)
        .lte('booked_at', range.to)
        // Los splits hijos no se listan: se ve el padre
        .is('split_parent_id', null)
        .order('booked_at', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Transaction[]
    },
  })
}

/** Invalida todo lo que depende del dinero de un hogar. */
function invalidateMoney(
  queryClient: ReturnType<typeof useQueryClient>,
  householdId: string,
): void {
  queryClient.invalidateQueries({ queryKey: ['transactions', householdId] })
  queryClient.invalidateQueries({ queryKey: ['accounts', householdId] })
  queryClient.invalidateQueries({ queryKey: ['month-summary', householdId] })
}

export interface NewTransaction {
  account_id: string
  booked_at: string
  /** Unidades mínimas, ya con signo: negativo = gasto. */
  amount: number
  clean_description: string
  category_id: string | null
  is_shared: boolean
  notes?: string | null
}

export function useCreateTransaction() {
  const { membership } = useActiveHousehold()
  const queryClient = useQueryClient()
  const h = membership?.household_id

  return useMutation({
    mutationFn: async (input: NewTransaction) => {
      const { data, error } = await sb()
        .from('transactions')
        .insert({
          household_id: h!,
          account_id: input.account_id,
          booked_at: input.booked_at,
          amount: input.amount,
          // Sin multidivisa todavía: la divisa base coincide con la de la cuenta.
          amount_base: input.amount,
          currency: membership?.household.base_currency ?? 'EUR',
          clean_description: input.clean_description,
          raw_description: input.clean_description,
          category_id: input.category_id,
          notes: input.notes ?? null,
          source: 'manual',
          reviewed: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as Transaction
    },
    onSuccess: () => {
      if (h) invalidateMoney(queryClient, h)
    },
  })
}

export function useDeleteTransaction() {
  const { membership } = useActiveHousehold()
  const queryClient = useQueryClient()
  const h = membership?.household_id

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb().from('transactions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (h) invalidateMoney(queryClient, h)
    },
  })
}

export interface NewAccount {
  name: string
  type: Account['type']
  /** Unidades mínimas, con el signo ya aplicado (negativo en pasivos). */
  current_balance: number
  institution?: string | null
  owner_id?: string | null
  include_in_net_worth?: boolean
}

export function useSaveAccount() {
  const { membership } = useActiveHousehold()
  const queryClient = useQueryClient()
  const h = membership?.household_id

  return useMutation({
    mutationFn: async ({ id, ...input }: NewAccount & { id?: string }) => {
      const payload = {
        name: input.name,
        type: input.type,
        current_balance: input.current_balance,
        owner_id: input.owner_id ?? null,
        include_in_net_worth: input.include_in_net_worth ?? true,
      }
      if (id) {
        const { error } = await sb().from('accounts').update(payload).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await sb()
        .from('accounts')
        .insert({ ...payload, household_id: h!, is_manual: true })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      if (h) invalidateMoney(queryClient, h)
    },
  })
}

export function useDeleteAccount() {
  const { membership } = useActiveHousehold()
  const queryClient = useQueryClient()
  const h = membership?.household_id

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb().from('accounts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      if (h) invalidateMoney(queryClient, h)
    },
  })
}
