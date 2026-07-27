import { useState } from 'react'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import type { Household } from '../lib/types'

export default function Onboarding() {
  const { profile, reload } = useApp()
  const [mode, setMode] = useState<'pick' | 'create' | 'join'>('pick')
  const [name, setName] = useState('Nuestro hogar')
  const [code, setCode] = useState('')
  const [created, setCreated] = useState<Household | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const createHousehold = async () => {
    setBusy(true)
    setError('')
    const { data, error } = await sb().from('households').insert({ name }).select().single()
    setBusy(false)
    if (error) setError(error.message)
    else setCreated(data as Household)
  }

  const join = async () => {
    setBusy(true)
    setError('')
    const { error } = await sb().rpc('join_household_with_code', { p_code: code })
    setBusy(false)
    if (error)
      setError(error.message.includes('not_found') ? 'Código no válido. Revísalo.' : error.message)
    else await reload()
  }

  const copyCode = async () => {
    if (!created) return
    await navigator.clipboard.writeText(created.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (created) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Hogar creado</h1>
            <p className="text-dim mt-2">
              Pásale este código a tu pareja para que se una desde su cuenta.
            </p>
          </div>
          <button
            onClick={copyCode}
            className="w-full flex items-center justify-center gap-3 bg-surface border border-hairline rounded-2xl py-6 text-3xl font-bold tracking-[0.3em] num"
          >
            {created.invite_code}
            {copied ? (
              <Check size={20} className="text-up" />
            ) : (
              <Copy size={20} className="text-faint" />
            )}
          </button>
          <button className="btn-primary w-full !py-4" onClick={() => reload()}>
            Empezar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hola, {profile?.name}</h1>
          <p className="text-dim mt-2">Último paso: vuestro hogar compartido.</p>
        </div>

        {mode === 'pick' && (
          <div className="space-y-3">
            <button
              className="card w-full p-5 text-left flex items-center gap-3 active:scale-[0.99] transition-transform"
              onClick={() => setMode('create')}
            >
              <div className="flex-1">
                <p className="font-semibold">Crear nuestro hogar</p>
                <p className="text-sm text-dim mt-0.5">Soy el primero en llegar</p>
              </div>
              <ChevronRight size={18} className="text-faint" />
            </button>
            <button
              className="card w-full p-5 text-left flex items-center gap-3 active:scale-[0.99] transition-transform"
              onClick={() => setMode('join')}
            >
              <div className="flex-1">
                <p className="font-semibold">Unirme con un código</p>
                <p className="text-sm text-dim mt-0.5">Mi pareja ya lo ha creado</p>
              </div>
              <ChevronRight size={18} className="text-faint" />
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="label">Nombre del hogar</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            {error && <p className="text-sm text-down">{error}</p>}
            <button
              className="btn-primary w-full !py-4"
              onClick={createHousehold}
              disabled={busy || !name.trim()}
            >
              {busy ? 'Creando…' : 'Crear hogar'}
            </button>
            <button className="btn-ghost w-full" onClick={() => setMode('pick')}>
              Volver
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="space-y-4">
            <div>
              <label className="label">Código de invitación</label>
              <input
                className="input text-center text-2xl font-bold tracking-[0.3em] num uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A1B2C3"
                maxLength={6}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-down">{error}</p>}
            <button
              className="btn-primary w-full !py-4"
              onClick={join}
              disabled={busy || code.length < 6}
            >
              {busy ? 'Uniéndome…' : 'Unirme'}
            </button>
            <button className="btn-ghost w-full" onClick={() => setMode('pick')}>
              Volver
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
