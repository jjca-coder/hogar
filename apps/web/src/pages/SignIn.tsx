import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { sb, humanError } from '@/lib/supabase'
import { Button } from '@/design-system/primitives'

type Mode = 'signin' | 'signup' | 'reset'

const COPY: Record<Mode, { title: string; cta: string; foot: string; alt: Mode }> = {
  signin: { title: 'Bienvenido', cta: 'Entrar', foot: 'Crear una cuenta', alt: 'signup' },
  signup: { title: 'Crea tu cuenta', cta: 'Crear cuenta', foot: 'Ya tengo cuenta', alt: 'signin' },
  reset: { title: 'Recuperar acceso', cta: 'Enviar enlace', foot: 'Volver', alt: 'signin' },
}

/** Logotipo de Google en SVG: no se puede cargar de fuera por la CSP. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)

  const copy = COPY[mode]

  const switchTo = (m: Mode) => {
    setMode(m)
    setError('')
    setNotice('')
  }

  const withGoogle = async () => {
    setError('')
    setGoogleBusy(true)
    const { error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (error) {
      setError(humanError(error))
      setGoogleBusy(false)
    }
    // Si va bien, el navegador se va a Google: no hace falta apagar el estado.
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await sb().auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() } },
        })
        if (error) throw error
        if (!data.session) {
          setNotice('Cuenta creada. Revisa tu correo para confirmarla.')
          setMode('signin')
        }
      } else if (mode === 'signin') {
        const { error } = await sb().auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await sb().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/nueva-contrasena`,
        })
        if (error) throw error
        setNotice('Si ese email tiene cuenta, te llegará un enlace en un minuto.')
      }
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 py-12">
      <motion.div
        className="w-full max-w-[380px]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-9">
          <div
            className="w-14 h-14 rounded-[18px] mb-5 flex items-center justify-center"
            style={{
              background: 'linear-gradient(160deg, var(--accent-indigo), var(--accent-purple))',
            }}
          >
            <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden>
              <path
                d="M112 340 Q256 132 400 340"
                fill="none"
                stroke="#fff"
                strokeWidth="34"
                strokeLinecap="round"
                opacity="0.55"
              />
              <path
                d="M112 392 Q256 184 400 392"
                fill="none"
                stroke="#fff"
                strokeWidth="34"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h1 className="t-large-title">{copy.title}</h1>
          <p className="t-body text-[var(--text-secondary)] mt-1.5">
            {mode === 'reset'
              ? 'Te mandamos un enlace para poner una contraseña nueva.'
              : 'Tus finanzas, tu casa y tus hábitos, en un solo sitio.'}
          </p>
        </div>

        {mode !== 'reset' && (
          <>
            <button
              onClick={withGoogle}
              disabled={googleBusy}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-[14px] t-headline font-semibold
                         border transition-transform active:scale-[0.98] disabled:opacity-40"
              style={{
                borderColor: 'var(--separator-opaque)',
                backgroundColor: 'var(--bg-elevated)',
              }}
            >
              <GoogleMark />
              {googleBusy ? 'Abriendo Google…' : 'Continuar con Google'}
            </button>

            <div className="flex items-center gap-3 my-6">
              <span className="flex-1 h-px bg-[var(--separator)]" />
              <span className="t-footnote text-[var(--text-tertiary)]">o con tu email</span>
              <span className="flex-1 h-px bg-[var(--separator)]" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <input
              className="w-full px-4 py-3.5 rounded-[14px] t-body outline-none transition-colors
                         border focus:border-[var(--accent)]"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--separator-opaque)',
              }}
              placeholder="Tu nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          )}

          <input
            className="w-full px-4 py-3.5 rounded-[14px] t-body outline-none transition-colors
                       border focus:border-[var(--accent)]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderColor: 'var(--separator-opaque)',
            }}
            type="email"
            inputMode="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          {mode !== 'reset' && (
            <input
              className="w-full px-4 py-3.5 rounded-[14px] t-body outline-none transition-colors
                         border focus:border-[var(--accent)]"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                borderColor: 'var(--separator-opaque)',
              }}
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          )}

          {error && (
            <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="t-subhead" style={{ color: 'var(--income)' }} role="status">
              {notice}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth loading={busy}>
            {mode === 'reset' && <Mail size={17} />}
            {copy.cta}
          </Button>
        </form>

        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => switchTo(copy.alt)}
            className="t-subhead font-medium"
            style={{ color: 'var(--accent)' }}
          >
            {copy.foot}
          </button>
          {mode === 'signin' && (
            <button
              onClick={() => switchTo('reset')}
              className="t-subhead text-[var(--text-tertiary)]"
            >
              He olvidado la contraseña
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
