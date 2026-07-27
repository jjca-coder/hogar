import { NavLink, Outlet } from 'react-router-dom'
import { Home, Wallet, ListChecks, Flame, TrendingUp } from 'lucide-react'
import { isDemo } from '../lib/supabase'
import { DEMO_FLAG } from '../lib/demo'

const tabs = [
  { to: '/', label: 'Inicio', icon: Home },
  { to: '/patrimonio', label: 'Patrimonio', icon: TrendingUp },
  { to: '/finanzas', label: 'Gastos', icon: Wallet },
  { to: '/tareas', label: 'Tareas', icon: ListChecks },
  { to: '/habitos', label: 'Hábitos', icon: Flame },
]

export default function Layout() {
  return (
    <div className="min-h-dvh max-w-lg mx-auto flex flex-col">
      {isDemo && (
        <div className="bg-raised text-dim text-[11px] text-center py-1.5 px-3">
          Modo demo con datos de ejemplo ·{' '}
          <button
            className="underline underline-offset-2 text-bright"
            onClick={() => {
              localStorage.removeItem(DEMO_FLAG)
              location.reload()
            }}
          >
            Salir
          </button>
        </div>
      )}

      <main className="flex-1 px-4 pb-32">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 bg-void/85 backdrop-blur-xl border-t border-hairline"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-lg mx-auto grid grid-cols-5">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                  isActive ? 'text-bright' : 'text-faint'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={21} strokeWidth={isActive ? 2.5 : 2} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
