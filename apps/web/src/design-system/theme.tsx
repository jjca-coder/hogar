/* eslint-disable react-refresh/only-export-components -- el proveedor y sus
   hooks viven juntos a propósito; separarlos solo por HMR no compensa. */
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Density, Theme } from '@aurora/shared'

export const ACCENTS = [
  { id: 'blue', label: 'Azul', value: 'var(--accent-blue)' },
  { id: 'indigo', label: 'Índigo', value: 'var(--accent-indigo)' },
  { id: 'purple', label: 'Púrpura', value: 'var(--accent-purple)' },
  { id: 'pink', label: 'Rosa', value: 'var(--accent-pink)' },
  { id: 'orange', label: 'Naranja', value: 'var(--accent-orange)' },
  { id: 'green', label: 'Verde', value: 'var(--accent-green)' },
  { id: 'teal', label: 'Turquesa', value: 'var(--accent-teal)' },
  { id: 'graphite', label: 'Grafito', value: 'var(--accent-graphite)' },
] as const

export type AccentId = (typeof ACCENTS)[number]['id']

interface ThemeState {
  theme: Theme
  accent: AccentId
  density: Density
  fontScale: number
  hideAmounts: boolean
  setTheme: (t: Theme) => void
  setAccent: (a: AccentId) => void
  setDensity: (d: Density) => void
  setFontScale: (s: number) => void
  toggleHideAmounts: () => void
}

const STORAGE_KEY = 'aurora.appearance'

const DEFAULTS = {
  theme: 'auto' as Theme,
  accent: 'indigo' as AccentId,
  density: 'comfortable' as Density,
  fontScale: 1,
  hideAmounts: false,
}

const ThemeContext = createContext<ThemeState | null>(null)

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}

function readStored(): typeof DEFAULTS {
  if (typeof localStorage === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<typeof DEFAULTS>) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readStored)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const resolved = state.theme === 'auto' ? (media.matches ? 'dark' : 'light') : state.theme
      root.dataset['theme'] = resolved
      root.dataset['density'] = state.density
      root.style.setProperty('--accent', `var(--accent-${state.accent})`)
      root.style.setProperty('--font-scale', String(state.fontScale))
      root.classList.toggle('amounts-hidden', state.hideAmounts)

      // Tinta la barra de estado del móvil con el color real del fondo
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', resolved === 'dark' ? '#131316' : '#f2f1ee')
    }

    apply()
    if (state.theme === 'auto') {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
    return undefined
  }, [state])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const value = useMemo<ThemeState>(
    () => ({
      ...state,
      setTheme: (theme) => setState((s) => ({ ...s, theme })),
      setAccent: (accent) => setState((s) => ({ ...s, accent })),
      setDensity: (density) => setState((s) => ({ ...s, density })),
      setFontScale: (fontScale) => setState((s) => ({ ...s, fontScale })),
      toggleHideAmounts: () => setState((s) => ({ ...s, hideAmounts: !s.hideAmounts })),
    }),
    [state],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Hook aparte para no re-renderizar toda la app al leer solo el flag. */
export function useHideAmounts(): boolean {
  const { hideAmounts } = useTheme()
  return hideAmounts
}
