/* eslint-disable react-refresh/only-export-components -- proveedor y hooks juntos a propósito */
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { sb, supabase } from './supabase'
import type { HouseholdRole, Profile } from '@aurora/shared'

export interface Membership {
  household_id: string
  role: HouseholdRole
  household: { id: string; name: string; base_currency: string }
}

interface SessionState {
  session: Session | null
  /** null mientras carga la sesión inicial. */
  ready: boolean
}

const SessionContext = createContext<SessionState>({ session: null, ready: false })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, ready: false })
  const queryClient = useQueryClient()
  const lastUserId = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setState({ session: null, ready: true })
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      lastUserId.current = data.session?.user.id ?? null
      setState({ session: data.session, ready: true })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextId = session?.user.id ?? null
      // Solo se tira la caché si REALMENTE cambia de usuario. Antes se hacía en
      // cada SIGNED_IN, y Supabase lo emite también al refrescar el token: eso
      // desmontaba la pantalla y hacía perder lo que estuvieras haciendo.
      if (nextId !== lastUserId.current) {
        queryClient.clear()
        lastUserId.current = nextId
      }
      setState({ session, ready: true })
    })

    return () => sub.subscription.unsubscribe()
  }, [queryClient])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  return useContext(SessionContext)
}

export function useUserId(): string | null {
  return useSession().session?.user.id ?? null
}

/** Perfil del usuario actual. */
export function useProfile() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await sb()
        .from('profiles')
        .select('id, display_name, avatar_url, base_currency, timezone, locale')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })
}

/** Hogares a los que pertenece, con su rol en cada uno. */
export function useMemberships() {
  const userId = useUserId()
  return useQuery({
    queryKey: ['memberships', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Membership[]> => {
      const { data, error } = await sb()
        .from('household_members')
        .select('household_id, role, household:households(id, name, base_currency)')
        .eq('user_id', userId!)
      if (error) throw error
      return (data ?? []) as unknown as Membership[]
    },
  })
}

const ACTIVE_KEY = 'aurora.activeHousehold'

/**
 * Hogar activo. Si el usuario pertenece a varios, se recuerda el último;
 * si el guardado ya no es válido, cae al primero disponible.
 */
export function useActiveHousehold(): {
  membership: Membership | null
  loading: boolean
  setActive: (id: string) => void
  all: Membership[]
} {
  const { data: memberships, isPending } = useMemberships()
  const [storedId, setStoredId] = useState<string | null>(() =>
    typeof localStorage === 'undefined' ? null : localStorage.getItem(ACTIVE_KEY),
  )

  const all = memberships ?? []
  const membership = all.find((m) => m.household_id === storedId) ?? all[0] ?? null

  const setActive = (id: string) => {
    localStorage.setItem(ACTIVE_KEY, id)
    setStoredId(id)
  }

  return { membership, loading: isPending, setActive, all }
}

/** Permisos derivados del rol, para no repetir la lógica por la app. */
export function usePermissions() {
  const { membership } = useActiveHousehold()
  const role = membership?.role ?? null
  return {
    role,
    canReadFinances: role === 'owner' || role === 'adult' || role === 'viewer',
    canWriteFinances: role === 'owner' || role === 'adult',
    canWriteTasks: role === 'owner' || role === 'adult' || role === 'child',
    canManageMembers: role === 'owner',
    isChild: role === 'child',
  }
}
