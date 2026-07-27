import { Navigate, Route, Routes } from 'react-router-dom'
import { isConfigured, enterDemo } from './lib/supabase'
import { useApp } from './context/AppContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Onboarding from './pages/Onboarding'
import Dashboard from './pages/Dashboard'
import Finance from './pages/Finance'
import Tasks from './pages/Tasks'
import Habits from './pages/Habits'

function Splash({ text }: { text: string }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 text-stone-400">
      <span className="text-5xl">🏡</span>
      <p>{text}</p>
    </div>
  )
}

function Setup() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-6 space-y-4">
        <div className="text-4xl">🏡</div>
        <h1 className="text-xl font-extrabold tracking-tight">Falta conectar Supabase</h1>
        <p className="text-stone-600 text-sm leading-relaxed">
          Copia <code className="bg-stone-100 px-1 rounded">.env.example</code> a{' '}
          <code className="bg-stone-100 px-1 rounded">.env</code> y rellena{' '}
          <code className="bg-stone-100 px-1 rounded">VITE_SUPABASE_URL</code> y{' '}
          <code className="bg-stone-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> con los datos de
          tu proyecto (Dashboard → Project Settings → API). Después reinicia el servidor.
        </p>
        <div className="border-t border-stone-100 pt-4">
          <p className="text-sm text-stone-500 mb-3">
            Mientras tanto puedes ver la app con datos de ejemplo:
          </p>
          <button className="btn-primary w-full" onClick={enterDemo}>
            👀 Probar en modo demo
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { session, household, loading } = useApp()

  if (!isConfigured) return <Setup />
  if (loading) return <Splash text="Cargando…" />
  if (!session) return <Login />
  if (!household) return <Onboarding />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/finanzas" element={<Finance />} />
        <Route path="/tareas" element={<Tasks />} />
        <Route path="/habitos" element={<Habits />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
