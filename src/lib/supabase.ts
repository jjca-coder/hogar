import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createDemoClient, DEMO_FLAG } from './demo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const realConfigured = Boolean(url && key && !url.includes('TU-PROYECTO'))

export const isDemo =
  !realConfigured && typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_FLAG) === '1'

export const isConfigured = realConfigured || isDemo

export const supabase: SupabaseClient | null = realConfigured
  ? createClient(url!, key!)
  : isDemo
    ? (createDemoClient() as unknown as SupabaseClient)
    : null

/** Cliente ya verificado; usar solo cuando isConfigured es true (App lo garantiza). */
export const sb = () => supabase as SupabaseClient

export const enterDemo = () => {
  localStorage.setItem(DEMO_FLAG, '1')
  location.reload()
}
