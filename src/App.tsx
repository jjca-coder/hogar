import { Navigate, Route, Routes } from 'react-router-dom'
import { isConfigured, enterDemo } from './lib/supabase'
import { useApp } from './context/AppContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Wealth from './pages/Wealth'
import Finance from './pages/Finance'
import Tasks from './pages/Tasks'
import Habits from './pages/Habits'

function Splash() {
  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-hairline border-t-bright animate-spin" />
    </div>
  )
}

function Setup() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-6 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Falta conectar Supabase</h1>
        <p className="text-dim text-sm leading-relaxed">
          Copia <code className="bg-raised px-1.5 py-0.5 rounded">.env.example</code> a{' '}
          <code className="bg-raised px-1.5 py-0.5 rounded">.env</code> y rellena{' '}
          <code className="bg-raised px-1.5 py-0.5 rounded">VITE_SUPABASE_URL</code> y{' '}
          <code className="bg-raised px-1.5 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code>. Después
          reinicia el servidor.
        </p>
        <div className="border-t border-hairline pt-4">
          <p className="text-sm text-dim mb-3">Mientras tanto, míralo con datos de ejemplo:</p>
          <button className="btn-primary w-full" onClick={enterDemo}>
            Probar en modo demo
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { session, household, loading } = useApp()

  if (!isConfigured) return <Setup />
  if (loading) return <Splash />
  if (!session) return <Login />
  if (!household) return <Onboarding />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/patrimonio" element={<Wealth />} />
        <Route path="/finanzas" element={<Finance />} />
        <Route path="/tareas" element={<Tasks />} />
        <Route path="/habitos" element={<Habits />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
