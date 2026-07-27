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
            : msg.includes('signups are disabled')
              ? 'Los registros están desactivados en Supabase (Authentication → Sign In / Providers → "Allow new users to sign up").'
              : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="text-5xl font-bold tracking-tight">Hogar</h1>
          <p className="text-dim mt-2">Vuestro dinero, vuestra casa, vuestros hábitos.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-raised rounded-2xl p-1 mb-6">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError('')
              }}
              className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                mode === m ? 'bg-bright text-void' : 'text-dim'
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

          {error && <p className="text-sm text-down leading-relaxed">{error}</p>}
          {info && <p className="text-sm text-up">{info}</p>}

          <button className="btn-primary w-full !py-4" disabled={busy}>
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}
