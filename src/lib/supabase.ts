import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createDemoClient, DEMO_FLAG } from './demo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const realConfigured = Boolean(url && key && !url.includes('TU-PROYECTO'))

// El flag manda: permite mirar la demo aunque haya un Supabase configurado.
export const isDemo =
  typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_FLAG) === '1'

export const isConfigured = realConfigured || isDemo

export const supabase: SupabaseClient | null = isDemo
  ? (createDemoClient() as unknown as SupabaseClient)
  : realConfigured
    ? createClient(url!, key!)
    : null

/** Cliente ya verificado; usar solo cuando isConfigured es true (App lo garantiza). */
export const sb = () => supabase as SupabaseClient

export const enterDemo = () => {
  localStorage.setItem(DEMO_FLAG, '1')
  location.reload()
}
