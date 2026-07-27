import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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
  const location = useLocation()

  // El rol "child" no ve finanzas: la pestaña desaparece de la barra.
  const tabs = TABS.filter((t) => !t.needsFinances || canReadFinances)

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          className="pb-28"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>

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
              className="relative flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
              style={({ isActive }) => ({
                color: isActive ? 'var(--accent)' : 'var(--text-tertiary)',
              })}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-indicator"
                      className="absolute top-0 h-[2px] w-8 rounded-full"
                      style={{ backgroundColor: 'var(--accent)' }}
                      transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                    />
                  )}
                  <motion.span
                    animate={{ scale: isActive ? 1.06 : 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                  >
                    <Icon size={22} strokeWidth={isActive ? 2.4 : 1.9} />
                  </motion.span>
                  <span className="t-caption-2 font-semibold">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {canWriteFinances && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 active:scale-90 transition-transform"
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
