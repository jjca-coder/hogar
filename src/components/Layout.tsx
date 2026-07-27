import { NavLink, Outlet } from 'react-router-dom'
import { Home, Wallet, ListChecks, Flame } from 'lucide-react'
import { isDemo } from '../lib/supabase'
import { DEMO_FLAG } from '../lib/demo'

const tabs = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/finanzas', label: 'Finanzas', icon: Wallet },
  { to: '/tareas', label: 'Tareas', icon: ListChecks },
  { to: '/habitos', label: 'Hábitos', icon: Flame },
]

export default function Layout() {
  return (
    <div className="min-h-dvh max-w-lg mx-auto flex flex-col">
      {isDemo && (
        <div className="bg-ink text-white text-xs text-center py-1.5 px-3">
          Modo demo con datos de ejemplo ·{' '}
          <button
            className="underline underline-offset-2"
            onClick={() => {
              localStorage.removeItem(DEMO_FLAG)
              location.reload()
            }}
          >
            Salir
          </button>
        </div>
      )}
      <main className="flex-1 px-4 pt-4 pb-28">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur border-t border-stone-200/80"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-lg mx-auto grid grid-cols-4">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors ${
                  isActive ? 'text-ink' : 'text-stone-400'
                }`
              }
            >
              <Icon size={22} strokeWidth={2.2} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
