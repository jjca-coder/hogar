import { useState } from 'react'
import { motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Home, Users } from 'lucide-react'
import { createHouseholdSchema } from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { useProfile } from '@/lib/session'
import { Button } from '@/design-system/primitives'

type Step = 'choose' | 'create' | 'join'

export default function Onboarding() {
  const { data: profile } = useProfile()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('choose')
  const [name, setName] = useState('Nuestro hogar')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['memberships'] })

  const createHousehold = async () => {
    const parsed = createHouseholdSchema.safeParse({ name, base_currency: 'EUR' })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa el nombre')
      return
    }
    setBusy(true)
    setError('')
    const { error } = await sb().from('households').insert(parsed.data).select().single()
    setBusy(false)
    if (error) setError(humanError(error))
    else await refresh()
  }

  const join = async () => {
    setBusy(true)
    setError('')
    const { error } = await sb().rpc('accept_invitation', { p_code: code.trim().toUpperCase() })
    setBusy(false)
    if (error) setError(humanError(error))
    else await refresh()
  }

  const inputStyle = {
    backgroundColor: 'var(--bg-elevated)',
    borderColor: 'var(--separator-opaque)',
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-6 py-12">
      <motion.div
        className="w-full max-w-[380px]"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="mb-8">
          <h1 className="t-large-title">Hola, {profile?.display_name || 'qué tal'}</h1>
          <p className="t-body text-[var(--text-secondary)] mt-1.5">
            {step === 'choose'
              ? 'Un hogar es el espacio donde compartís cuentas, gastos y tareas.'
              : step === 'create'
                ? 'Podrás invitar a quien quieras después.'
                : 'Pide el código a quien ya lo haya creado.'}
          </p>
        </div>

        {step === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setStep('create')}
              className="surface w-full p-5 flex items-center gap-4 text-left transition-transform active:scale-[0.99]"
            >
              <div
                className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <Home size={20} />
              </div>
              <div className="flex-1">
                <p className="t-headline">Crear un hogar</p>
                <p className="t-footnote text-[var(--text-tertiary)] mt-0.5">
                  Soy el primero en llegar
                </p>
              </div>
              <ChevronRight size={18} className="text-[var(--text-quaternary)]" />
            </button>

            <button
              onClick={() => setStep('join')}
              className="surface w-full p-5 flex items-center gap-4 text-left transition-transform active:scale-[0.99]"
            >
              <div
                className="w-11 h-11 rounded-[14px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--bg-inset)', color: 'var(--text-secondary)' }}
              >
                <Users size={20} />
              </div>
              <div className="flex-1">
                <p className="t-headline">Unirme a uno</p>
                <p className="t-footnote text-[var(--text-tertiary)] mt-0.5">Tengo un código</p>
              </div>
              <ChevronRight size={18} className="text-[var(--text-quaternary)]" />
            </button>
          </div>
        )}

        {step === 'create' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="hname" className="t-subhead font-medium block mb-2">
                Nombre del hogar
              </label>
              <input
                id="hname"
                className="w-full px-4 py-3.5 rounded-[14px] t-body outline-none border focus:border-[var(--accent)] transition-colors"
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                autoFocus
              />
            </div>
            {error && (
              <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
                {error}
              </p>
            )}
            <Button size="lg" fullWidth loading={busy} onClick={createHousehold}>
              Crear hogar
            </Button>
            <Button variant="plain" fullWidth onClick={() => setStep('choose')}>
              Volver
            </Button>
          </div>
        )}

        {step === 'join' && (
          <div className="space-y-4">
            <div>
              <label htmlFor="hcode" className="t-subhead font-medium block mb-2">
                Código de invitación
              </label>
              <input
                id="hcode"
                className="w-full px-4 py-4 rounded-[14px] text-center num uppercase outline-none border focus:border-[var(--accent)] transition-colors"
                style={{ ...inputStyle, fontSize: '24px', letterSpacing: '0.24em' }}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A1B2C3D4"
                maxLength={8}
                autoFocus
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>
            {error && (
              <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
                {error}
              </p>
            )}
            <Button size="lg" fullWidth loading={busy} disabled={code.length < 8} onClick={join}>
              Unirme
            </Button>
            <Button variant="plain" fullWidth onClick={() => setStep('choose')}>
              Volver
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  )
}
