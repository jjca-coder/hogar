import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Building2, Check, Search, ShieldCheck } from 'lucide-react'
import { sb, humanError } from '@/lib/supabase'
import { useActiveHousehold } from '@/lib/session'
import { Button, Card, EmptyState, InsetList, Skeleton } from '@/design-system/primitives'

interface Institution {
  name: string
  country: string
  logo: string | null
  maxConsentDays: number | null
}

/** Llama a la Edge Function; el navegador nunca habla con el banco. */
async function callBank<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke('bank', { body: payload })
  if (error) throw error
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

const PENDING_KEY = 'aurora.pendingBankConnection'

export default function ConnectBank() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { membership } = useActiveHousehold()
  const [params] = useSearchParams()
  const [query, setQuery] = useState('')
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [finishing, setFinishing] = useState(false)

  const code = params.get('code')

  // Vuelta desde el banco: se cierra la autorización y se descubren las cuentas
  useEffect(() => {
    if (!code || !membership) return
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '{}') as {
      bankName?: string
      country?: string
    }
    setFinishing(true)
    callBank<{ accounts: number }>({
      action: 'callback',
      code,
      householdId: membership.household_id,
      bankName: pending.bankName ?? '',
      country: pending.country ?? 'ES',
    })
      .then(async () => {
        localStorage.removeItem(PENDING_KEY)
        await queryClient.invalidateQueries({ queryKey: ['accounts'] })
        navigate('/finanzas/cuentas', { replace: true })
      })
      .catch((e) => {
        setError(humanError(e))
        setFinishing(false)
      })
  }, [code, membership, navigate, queryClient])

  const {
    data: institutions,
    isPending,
    error: loadError,
  } = useQuery({
    queryKey: ['institutions', 'ES'],
    enabled: !code,
    staleTime: 24 * 60 * 60_000,
    queryFn: () =>
      callBank<{ institutions: Institution[] }>({ action: 'institutions', country: 'ES' }),
  })

  const filtered = useMemo(() => {
    const list = institutions?.institutions ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((i) => i.name.toLowerCase().includes(q))
  }, [institutions, query])

  const connect = async (bank: Institution) => {
    setConnecting(bank.name)
    setError('')
    try {
      localStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ bankName: bank.name, country: bank.country }),
      )
      const { url } = await callBank<{ url: string }>({
        action: 'connect',
        bankName: bank.name,
        country: bank.country,
        redirectUrl: `${window.location.origin}/finanzas/cuentas/callback`,
        state: membership?.household_id ?? '',
      })
      // A partir de aquí el usuario se identifica en la web de su banco
      window.location.href = url
    } catch (e) {
      setError(humanError(e))
      setConnecting(null)
    }
  }

  if (code || finishing) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card padded={false}>
          {error ? (
            <EmptyState
              title="No se pudo completar la conexión"
              description={error}
              action={
                <Button onClick={() => navigate('/finanzas/cuentas/conectar', { replace: true })}>
                  Volver a intentarlo
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={
                <div
                  className="w-7 h-7 rounded-full border-2 animate-spin"
                  style={{
                    borderColor: 'var(--separator-opaque)',
                    borderTopColor: 'var(--accent)',
                  }}
                />
              }
              title="Conectando con tu banco"
              description="Estamos recogiendo tus cuentas. Un momento."
            />
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <Link
        to="/finanzas/cuentas"
        className="flex items-center gap-1.5 t-subhead text-[var(--text-secondary)]"
      >
        <ArrowLeft size={16} /> Cuentas
      </Link>

      <div>
        <h1 className="t-title-1">Conectar un banco</h1>
        <p className="t-subhead text-[var(--text-tertiary)] mt-1">
          Tus movimientos entrarán solos, sin copiar nada a mano.
        </p>
      </div>

      <Card className="flex items-start gap-3">
        <ShieldCheck size={20} style={{ color: 'var(--income)' }} className="shrink-0 mt-0.5" />
        <div>
          <p className="t-subhead font-medium">Tus claves no pasan por Aurora</p>
          <p className="t-footnote text-[var(--text-tertiary)] mt-1 leading-relaxed">
            Te identificarás en la web de tu propio banco. Aurora solo recibe permiso para{' '}
            <strong>leer</strong> saldos y movimientos: no puede mover dinero. Puedes retirar el
            permiso cuando quieras.
          </p>
        </div>
      </Card>

      {loadError ? (
        <Card padded={false}>
          <EmptyState
            icon={<Building2 size={30} />}
            title="No he podido pedir la lista de bancos"
            description={humanError(loadError)}
          />
        </Card>
      ) : (
        <>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
            <input
              className="w-full pl-10 pr-3 py-2.5 rounded-[12px] t-subhead outline-none border"
              style={{ backgroundColor: 'var(--bg-inset)', borderColor: 'transparent' }}
              placeholder="Busca tu banco"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar banco"
            />
          </div>

          {error && (
            <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
              {error}
            </p>
          )}

          {isPending ? (
            <Card className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </Card>
          ) : filtered.length === 0 ? (
            <Card padded={false}>
              <EmptyState
                icon={<Building2 size={30} />}
                title="Ningún banco coincide"
                description="Prueba con otro nombre. Si el tuyo no está, puedes importar su extracto en CSV."
              />
            </Card>
          ) : (
            <InsetList>
              {filtered.map((bank) => (
                <button
                  key={bank.name}
                  onClick={() => connect(bank)}
                  disabled={connecting !== null}
                  className="inset-row w-full text-left disabled:opacity-50"
                >
                  <span
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0 overflow-hidden"
                    style={{ backgroundColor: 'var(--bg-inset)' }}
                  >
                    {bank.logo ? (
                      <img src={bank.logo} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <Building2 size={18} className="text-[var(--text-tertiary)]" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="t-body truncate">{bank.name}</p>
                    {bank.maxConsentDays && (
                      <p className="t-footnote text-[var(--text-tertiary)]">
                        Permiso válido {bank.maxConsentDays} días
                      </p>
                    )}
                  </div>
                  {connecting === bank.name ? (
                    <span
                      className="w-4 h-4 rounded-full border-2 animate-spin"
                      style={{
                        borderColor: 'var(--separator-opaque)',
                        borderTopColor: 'var(--accent)',
                      }}
                    />
                  ) : (
                    <Check size={16} className="text-[var(--text-quaternary)]" />
                  )}
                </button>
              ))}
            </InsetList>
          )}

          <p className="t-footnote text-[var(--text-tertiary)] text-center">
            ¿No está tu banco?{' '}
            <Link to="/finanzas/importar" className="text-[var(--accent)]">
              Importa su extracto
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
