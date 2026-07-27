import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { isConfigured } from '@/lib/supabase'
import { useActiveHousehold, useSession } from '@/lib/session'
import AppLayout from '@/components/AppLayout'
import DesignSystem from '@/pages/DesignSystem'
import SignIn from '@/pages/SignIn'
import Onboarding from '@/pages/Onboarding'
import HouseholdSettings from '@/pages/HouseholdSettings'
import Dashboard from '@/pages/Dashboard'
import Accounts from '@/pages/Accounts'
import AccountDetail from '@/pages/AccountDetail'
import Transactions from '@/pages/Transactions'
import ImportStatement from '@/pages/ImportStatement'
import Budgets from '@/pages/Budgets'
import Subscriptions from '@/pages/Subscriptions'
import { Privacy, Terms } from '@/pages/Legal'
import ConnectBank from '@/pages/ConnectBank'
import Tasks from '@/pages/Tasks'
import Habits from '@/pages/Habits'
import { Card } from '@/design-system/primitives'

function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div
        className="w-7 h-7 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--separator-opaque)', borderTopColor: 'var(--accent)' }}
        role="status"
        aria-label="Cargando"
      />
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <Card className="max-w-md w-full space-y-3">
        <h1 className="t-title-2">Falta conectar Supabase</h1>
        <p className="t-body text-[var(--text-secondary)]">
          Copia <code>apps/web/.env.example</code> a <code>apps/web/.env</code> y rellena las dos
          variables. Después reinicia el servidor.
        </p>
      </Card>
    </div>
  )
}

/** Rutas que deben verse sin sesión: el agregador bancario las revisa. */
const PUBLIC_PATHS = ['/privacidad', '/terminos'] as const

export default function App() {
  const { session, ready } = useSession()
  const { membership, loading } = useActiveHousehold()
  const { pathname } = useLocation()

  // Antes que nada: las legales no dependen de sesión ni de configuración.
  if (PUBLIC_PATHS.includes(pathname as (typeof PUBLIC_PATHS)[number])) {
    return (
      <Routes>
        <Route path="/privacidad" element={<Privacy />} />
        <Route path="/terminos" element={<Terms />} />
      </Routes>
    )
  }

  if (!isConfigured) return <NotConfigured />
  if (!ready) return <Loading />

  if (!session) {
    return (
      <Routes>
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="*" element={<SignIn />} />
      </Routes>
    )
  }

  if (loading) return <Loading />

  if (!membership) {
    return (
      <Routes>
        <Route path="/design-system" element={<DesignSystem />} />
        <Route path="*" element={<Onboarding />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/finanzas" element={<Transactions />} />
        <Route path="/finanzas/cuentas" element={<Accounts />} />
        <Route path="/finanzas/cuentas/:id" element={<AccountDetail />} />
        <Route path="/finanzas/importar" element={<ImportStatement />} />
        <Route path="/finanzas/cuentas/conectar" element={<ConnectBank />} />
        <Route path="/finanzas/cuentas/callback" element={<ConnectBank />} />
        <Route path="/finanzas/presupuesto" element={<Budgets />} />
        <Route path="/finanzas/suscripciones" element={<Subscriptions />} />
        <Route path="/tareas" element={<Tasks />} />
        <Route path="/habitos" element={<Habits />} />
        <Route path="/ajustes/hogar" element={<HouseholdSettings />} />
      </Route>
      <Route path="/design-system" element={<DesignSystem />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
