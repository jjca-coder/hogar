import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Palette, Settings } from 'lucide-react'
import { isConfigured } from '@/lib/supabase'
import { useActiveHousehold, useSession } from '@/lib/session'
import DesignSystem from '@/pages/DesignSystem'
import SignIn from '@/pages/SignIn'
import Onboarding from '@/pages/Onboarding'
import HouseholdSettings from '@/pages/HouseholdSettings'
import { Button, Card, EmptyState } from '@/design-system/primitives'

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

/** Provisional de la Fase 1: el dashboard real llega en la Fase 2. */
function Home() {
  const { membership } = useActiveHousehold()
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">
            {membership?.household.name}
          </p>
          <h1 className="t-large-title mt-1">Aurora</h1>
        </div>
        <Link
          to="/ajustes/hogar"
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          aria-label="Ajustes del hogar"
        >
          <Settings size={18} />
        </Link>
      </div>

      <Card padded={false}>
        <EmptyState
          icon={<Palette size={30} />}
          title="Fase 1 lista"
          description="Ya hay cuentas de usuario, hogares, invitaciones y roles. Las finanzas llegan en la Fase 2."
          action={
            <Link to="/design-system">
              <Button variant="tinted">Ver el sistema de diseño</Button>
            </Link>
          }
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
      <Route path="/" element={<Home />} />
      <Route path="/ajustes/hogar" element={<HouseholdSettings />} />
      <Route path="/design-system" element={<DesignSystem />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
