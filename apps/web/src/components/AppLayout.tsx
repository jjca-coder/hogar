import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { CheckCircle2, Flame, Home, Plus, Wallet } from 'lucide-react'
import { usePermissions } from '@/lib/session'
import AddTransactionSheet from '@/components/AddTransactionSheet'

interface Tab {
  to: string
  label: string
  icon: typeof Home
  needsFinances?: boolean
}

const TABS: Tab[] = [
  { to: '/', label: 'Hoy', icon: Home },
  { to: '/finanzas', label: 'Dinero', icon: Wallet, needsFinances: true },
  { to: '/tareas', label: 'Tareas', icon: CheckCircle2 },
  { to: '/habitos', label: 'Hábitos', icon: Flame },
]

export default function AppLayout() {
  const { canReadFinances, canWriteFinances } = usePermissions()
  const [addOpen, setAddOpen] = useState(false)
  const navigate = useNavigate()

  // El rol "child" no ve finanzas: la pestaña desaparece de la barra.
  const tabs = TABS.filter((t) => !t.needsFinances || canReadFinances)

  return (
    <div className="min-h-dvh">
      <main className="pb-28">
        <Outlet />
      </main>

      <nav
        className="fixed bottom-0 inset-x-0 material-thick border-t safe-bottom z-30"
        style={{ borderColor: 'var(--separator)' }}
        aria-label="Navegación principal"
      >
        <div className="max-w-2xl mx-auto flex items-center">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
              style={({ isActive }) => ({
                color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 1.9} />
                  <span className="t-caption-2 font-semibold">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {canWriteFinances && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5"
              aria-label="Añadir movimiento"
            >
              <span
                className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
              >
                <Plus size={19} strokeWidth={2.6} />
              </span>
              <span className="t-caption-2 font-semibold text-[var(--text-tertiary)]">Añadir</span>
            </button>
          )}
        </div>
      </nav>

      <AddTransactionSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false)
          navigate('/finanzas')
        }}
      />
    </div>
  )
}
