import { useState, type FormEvent } from 'react'
import { sb } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await sb().auth.signUp({
          email,
          password,
          options: { data: { name } },
        })
        if (error) throw error
        if (!data.session) {
          setInfo('Cuenta creada. Revisa tu correo para confirmarla y después entra.')
          setMode('login')
        }
      } else {
        const { error } = await sb().auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      const msg = (err as Error).message
      setError(
        msg.includes('Invalid login credentials')
          ? 'Email o contraseña incorrectos.'
          : msg.includes('already registered')
            ? 'Ese email ya tiene cuenta. Prueba a entrar.'
            : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🏡</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Hogar</h1>
          <p className="text-stone-500 mt-1">Finanzas, tareas y hábitos de casa</p>
        </div>

        <div className="card p-5">
          <div className="grid grid-cols-2 gap-1 bg-stone-100 rounded-xl p-1 mb-5">
            {(['login', 'signup'] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError('')
                }}
                className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                  mode === m ? 'bg-white shadow-sm text-ink' : 'text-stone-500'
                }`}
              >
                {m === 'login' ? 'Entrar' : 'Crear cuenta'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="label">Tu nombre</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jesús"
                  required
                />
              </div>
            )}
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
              />
            </div>
            <div>
              <label className="label">Contraseña</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                minLength={6}
                required
              />
            </div>

            {error && <p className="text-sm text-rose-600">{error}</p>}
            {info && <p className="text-sm text-emerald-700">{info}</p>}

            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
