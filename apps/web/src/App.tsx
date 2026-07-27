import { Navigate, Route, Routes } from 'react-router-dom'
import { CheckCircle2, Flame } from 'lucide-react'
import { isConfigured } from '@/lib/supabase'
import { useActiveHousehold, useSession } from '@/lib/session'
import AppLayout from '@/components/AppLayout'
import DesignSystem from '@/pages/DesignSystem'
import SignIn from '@/pages/SignIn'
import Onboarding from '@/pages/Onboarding'
import HouseholdSettings from '@/pages/HouseholdSettings'
import Dashboard from '@/pages/Dashboard'
import Accounts from '@/pages/Accounts'
import Transactions from '@/pages/Transactions'
import ImportStatement from '@/pages/ImportStatement'
import Budgets from '@/pages/Budgets'
import Subscriptions from '@/pages/Subscriptions'
import { Card, EmptyState } from '@/design-system/primitives'

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

/** Módulos que llegan en la Fase 5; la pestaña ya existe para no mover el suelo después. */
function ComingSoon({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="t-title-1 mb-5">{title}</h1>
      <Card padded={false}>
        <EmptyState
          icon={icon}
          title="Todavía no está listo"
          description="Este módulo llega en la siguiente fase. Las finanzas ya funcionan."
        />
      </Card>
    </div>
  )
}

export default function App() {
  const { session, ready } = useSession()
  const { membership, loading } = useActiveHousehold()

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
        <Route path="/finanzas/importar" element={<ImportStatement />} />
        <Route path="/finanzas/presupuesto" element={<Budgets />} />
        <Route path="/finanzas/suscripciones" element={<Subscriptions />} />
        <Route
          path="/tareas"
          element={<ComingSoon title="Tareas" icon={<CheckCircle2 size={30} />} />}
        />
        <Route
          path="/habitos"
          element={<ComingSoon title="Hábitos" icon={<Flame size={30} />} />}
        />
        <Route path="/ajustes/hogar" element={<HouseholdSettings />} />
      </Route>
      <Route path="/design-system" element={<DesignSystem />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
