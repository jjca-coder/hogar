import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
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
    const { data, error } = await sb()
      .from('households')
      .insert({ name })
      .select()
      .single()
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
      setError(
        error.message.includes('not_found') ? 'Código no válido. Revísalo.' : error.message,
      )
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
        <div className="card max-w-sm w-full p-6 text-center space-y-4">
          <div className="text-5xl">🎉</div>
          <h1 className="text-xl font-bold">¡Hogar creado!</h1>
          <p className="text-stone-600">
            Comparte este código con tu pareja para que se una desde su cuenta:
          </p>
          <button
            onClick={copyCode}
            className="w-full flex items-center justify-center gap-2 bg-stone-100 rounded-xl py-4 text-2xl font-mono font-bold tracking-[0.3em]"
          >
            {created.invite_code}
            {copied ? <Check size={20} className="text-emerald-600" /> : <Copy size={20} className="text-stone-400" />}
          </button>
          <button className="btn-primary w-full" onClick={() => reload()}>
            Empezar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center mb-2">
          <div className="text-5xl mb-2">👋</div>
          <h1 className="text-2xl font-bold">Hola, {profile?.name}</h1>
          <p className="text-stone-500">Último paso: vuestro hogar compartido</p>
        </div>

        {mode === 'pick' && (
          <div className="space-y-3">
            <button className="card w-full p-5 text-left hover:border-stone-400" onClick={() => setMode('create')}>
              <p className="font-bold">Crear nuestro hogar</p>
              <p className="text-sm text-stone-500">Soy el primero en llegar</p>
            </button>
            <button className="card w-full p-5 text-left hover:border-stone-400" onClick={() => setMode('join')}>
              <p className="font-bold">Unirme con un código</p>
              <p className="text-sm text-stone-500">Mi pareja ya lo ha creado</p>
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Nombre del hogar</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button className="btn-primary w-full" onClick={createHousehold} disabled={busy || !name.trim()}>
              {busy ? 'Creando…' : 'Crear hogar'}
            </button>
            <button className="btn-ghost w-full" onClick={() => setMode('pick')}>
              Volver
            </button>
          </div>
        )}

        {mode === 'join' && (
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Código de invitación</label>
              <input
                className="input font-mono tracking-widest uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="A1B2C3"
                maxLength={6}
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button className="btn-primary w-full" onClick={join} disabled={busy || code.length < 6}>
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
