import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, sb } from '../lib/supabase'
import type { Household, Profile } from '../lib/types'

interface AppState {
  session: Session | null
  profile: Profile | null
  household: Household | null
  members: Profile[]
  partner: Profile | null
  loading: boolean
  reload: () => Promise<void>
}

const Ctx = createContext<AppState>({
  session: null,
  profile: null,
  household: null,
  members: [],
  partner: null,
  loading: true,
  reload: async () => {},
})

export const useApp = () => useContext(Ctx)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<Profile[]>([])
  const [dataReady, setDataReady] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadData = useCallback(async (userId: string) => {
    const [{ data: prof }, { data: membership }] = await Promise.all([
      sb().from('profiles').select('*').eq('id', userId).maybeSingle(),
      sb()
        .from('household_members')
        .select('household_id, households(id, name, invite_code)')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle(),
    ])
    setProfile((prof as Profile) ?? null)

    const hh = (membership as { households: Household } | null)?.households ?? null
    setHousehold(hh)

    if (hh) {
      const { data: mem } = await sb()
        .from('household_members')
        .select('profiles(id, name, color)')
        .eq('household_id', hh.id)
      setMembers(((mem ?? []) as unknown as { profiles: Profile }[]).map((m) => m.profiles))
    } else {
      setMembers([])
    }
    setDataReady(true)
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (!session) {
      setProfile(null)
      setHousehold(null)
      setMembers([])
      setDataReady(true)
      return
    }
    setDataReady(false)
    loadData(session.user.id)
  }, [authReady, session?.user.id, loadData]) // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(async () => {
    if (session) await loadData(session.user.id)
  }, [session, loadData])

  const partner = members.find((m) => m.id !== session?.user.id) ?? null

  return (
    <Ctx.Provider
      value={{
        session,
        profile,
        household,
        members,
        partner,
        loading: !authReady || !dataReady,
        reload,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
