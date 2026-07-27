import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Landmark, Plus, RefreshCw, Trash2 } from 'lucide-react'
import {
  isLiability,
  money,
  parseAmountToMinor,
  sum,
  type Account,
  type AccountType,
} from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { useAccounts, useDeleteAccount, useSaveAccount } from '@/lib/queries'
import { useActiveHousehold, usePermissions } from '@/lib/session'
import {
  Amount,
  Button,
  Card,
  EmptyState,
  InsetList,
  Sheet,
  Skeleton,
  Switch,
} from '@/design-system/primitives'

const TYPE_META: Record<AccountType, { label: string; group: string; emoji: string }> = {
  checking: { label: 'Cuenta corriente', group: 'Cuentas', emoji: '🏦' },
  savings: { label: 'Ahorro', group: 'Ahorro', emoji: '🐷' },
  cash: { label: 'Efectivo', group: 'Efectivo', emoji: '💵' },
  investment: { label: 'Inversión', group: 'Inversiones', emoji: '📈' },
  property: { label: 'Propiedad', group: 'Propiedades', emoji: '🏡' },
  crypto: { label: 'Cripto', group: 'Inversiones', emoji: '₿' },
  debit_card: { label: 'Tarjeta de débito', group: 'Cuentas', emoji: '💳' },
  credit_card: { label: 'Tarjeta de crédito', group: 'Tarjetas', emoji: '💳' },
  loan: { label: 'Préstamo', group: 'Deudas', emoji: '📉' },
  mortgage: { label: 'Hipoteca', group: 'Deudas', emoji: '🏚️' },
  other: { label: 'Otro', group: 'Otros', emoji: '📦' },
}

const GROUP_ORDER = [
  'Cuentas',
  'Ahorro',
  'Efectivo',
  'Inversiones',
  'Propiedades',
  'Tarjetas',
  'Deudas',
  'Otros',
]

interface Connection {
  id: string
  last_synced_at: string | null
  last_error: string | null
  institution: { name: string } | null
}

export default function Accounts() {
  const { data: accounts, isPending } = useAccounts()
  const { canWriteFinances } = usePermissions()
  const { membership } = useActiveHousehold()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Account | null>(null)
  const [creating, setCreating] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncError, setSyncError] = useState('')

  const { data: connectionsData } = useQuery({
    queryKey: ['connections', membership?.household_id],
    enabled: Boolean(membership?.household_id),
    queryFn: async (): Promise<Connection[]> => {
      const { data, error } = await sb()
        .from('connections')
        .select('id, last_synced_at, last_error, institution:institutions(name)')
        .eq('household_id', membership!.household_id)
        .eq('status', 'active')
      if (error) throw error
      return (data ?? []) as unknown as Connection[]
    },
  })
  const connections = connectionsData ?? []

  const sync = async (connectionId: string) => {
    setSyncing(connectionId)
    setSyncError('')
    try {
      const { data, error } = await sb().functions.invoke('bank', {
        body: { action: 'sync', connectionId },
      })
      if (error) {
        const context = (error as { context?: Response }).context
        if (context?.json) {
          const body = (await context.json()) as { error?: string }
          throw new Error(body.error ?? error.message)
        }
        throw error
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
      await queryClient.invalidateQueries({ queryKey: ['connections'] })
    } catch (e) {
      setSyncError(humanError(e))
    } finally {
      setSyncing(null)
    }
  }

  // Memoizado: `accounts ?? []` crearía un array nuevo en cada render y
  // anularía la caché de los useMemo que dependen de él.
  const list = useMemo(() => accounts ?? [], [accounts])
  const counted = list.filter((a) => a.include_in_net_worth)
  const netWorth = sum(counted.map((a) => money(a.current_balance)))
  const assets = sum(
    counted.filter((a) => a.current_balance > 0).map((a) => money(a.current_balance)),
  )
  const debts = sum(
    counted.filter((a) => a.current_balance < 0).map((a) => money(a.current_balance)),
  )

  const grouped = useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const a of list) {
      const g = TYPE_META[a.type].group
      map.set(g, [...(map.get(g) ?? []), a])
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }))
  }, [list])

  if (isPending) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header>
        <p className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">
          Patrimonio neto
        </p>
        <h1 className="t-large-title num mt-1 sensitive">
          <Amount value={netWorth} compact />
        </h1>
      </header>

      {list.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="t-footnote text-[var(--text-tertiary)]">Activos</p>
            <p className="t-title-3 num mt-1" style={{ color: 'var(--income)' }}>
              <Amount value={assets} compact />
            </p>
          </Card>
          <Card>
            <p className="t-footnote text-[var(--text-tertiary)]">Deudas</p>
            <p className="t-title-3 num mt-1" style={{ color: 'var(--expense)' }}>
              <Amount value={debts} compact />
            </p>
          </Card>
        </div>
      )}

      {list.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Landmark size={30} />}
            title="Aún no hay cuentas"
            description="Añade tus cuentas, ahorros y tarjetas para ver el patrimonio real y poder anotar gastos."
            action={
              canWriteFinances ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus size={17} /> Añadir la primera
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        grouped.map(({ group, items }) => {
          const subtotal = sum(items.map((a) => money(a.current_balance)))
          return (
            <section key={group}>
              <div className="flex items-baseline justify-between px-1 mb-2">
                <h2 className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">
                  {group}
                </h2>
                <span className="t-footnote font-semibold text-[var(--text-tertiary)]">
                  <Amount value={subtotal} />
                </span>
              </div>
              <InsetList>
                {items.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => canWriteFinances && setEditing(a)}
                    className="inset-row w-full text-left"
                    disabled={!canWriteFinances}
                  >
                    <span
                      className="w-10 h-10 rounded-[12px] flex items-center justify-center text-lg shrink-0"
                      style={{ backgroundColor: 'var(--bg-inset)' }}
                    >
                      {TYPE_META[a.type].emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="t-body truncate">{a.name}</p>
                      <p className="t-footnote text-[var(--text-tertiary)]">
                        {TYPE_META[a.type].label}
                        {a.owner_id ? ' · personal' : ' · conjunta'}
                        {!a.include_in_net_worth && ' · fuera del patrimonio'}
                      </p>
                    </div>
                    <Amount
                      value={money(a.current_balance)}
                      className={a.current_balance < 0 ? 'text-[var(--expense)]' : ''}
                    />
                  </button>
                ))}
              </InsetList>
            </section>
          )
        })
      )}

      {canWriteFinances && connections.length > 0 && (
        <Card className="space-y-3">
          {connections.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="t-subhead font-medium truncate">
                  {c.institution?.name ?? 'Banco conectado'}
                </p>
                <p className="t-caption text-[var(--text-tertiary)]">
                  {c.last_error
                    ? c.last_error
                    : c.last_synced_at
                      ? `Actualizado ${formatDistanceToNow(new Date(c.last_synced_at), { locale: es, addSuffix: true })}`
                      : 'Sin sincronizar todavía'}
                </p>
              </div>
              <Button
                size="sm"
                variant="tinted"
                loading={syncing === c.id}
                onClick={() => sync(c.id)}
              >
                <RefreshCw size={14} /> Actualizar
              </Button>
            </div>
          ))}
          {syncError && (
            <p className="t-footnote" style={{ color: 'var(--expense)' }} role="alert">
              {syncError}
            </p>
          )}
        </Card>
      )}

      {canWriteFinances && (
        <div className="space-y-3">
          <Link to="/finanzas/cuentas/conectar" className="block">
            <Card className="flex items-center gap-3 active:scale-[0.99] transition-transform">
              <span
                className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                <Landmark size={18} />
              </span>
              <div className="flex-1">
                <p className="t-body font-medium">Conectar mi banco</p>
                <p className="t-footnote text-[var(--text-tertiary)]">
                  Los movimientos entran solos
                </p>
              </div>
            </Card>
          </Link>

          {list.length > 0 && (
            <button
              onClick={() => setCreating(true)}
              className="w-full py-4 rounded-[16px] border border-dashed t-subhead font-semibold flex items-center justify-center gap-2 transition-transform active:scale-[0.99]"
              style={{ borderColor: 'var(--separator-opaque)', color: 'var(--text-tertiary)' }}
            >
              <Plus size={17} /> Añadir cuenta a mano
            </button>
          )}
        </div>
      )}

      {(creating || editing) && (
        <AccountSheet
          account={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function AccountSheet({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const save = useSaveAccount()
  const remove = useDeleteAccount()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking')
  const [balance, setBalance] = useState(
    account ? (Math.abs(account.current_balance) / 100).toFixed(2).replace('.', ',') : '',
  )
  const [shared, setShared] = useState(account ? account.owner_id === null : true)
  const [inNetWorth, setInNetWorth] = useState(account?.include_in_net_worth ?? true)
  const [error, setError] = useState('')

  const liability = isLiability(type)

  const submit = async () => {
    const minor = parseAmountToMinor(balance || '0')
    if (minor === null) {
      setError('Escribe un saldo válido, por ejemplo 1.250,40')
      return
    }
    if (!name.trim()) {
      setError('Ponle un nombre a la cuenta')
      return
    }
    try {
      await save.mutateAsync({
        ...(account ? { id: account.id } : {}),
        name: name.trim(),
        type,
        // Las deudas se escriben en positivo y se guardan en negativo
        current_balance: liability ? -Math.abs(minor) : minor,
        owner_id: null,
        include_in_net_worth: inNetWorth,
      })
      onClose()
    } catch (e) {
      setError(humanError(e))
    }
  }

  const del = async () => {
    if (!account) return
    if (!confirm(`¿Borrar "${account.name}"? También se borrarán sus movimientos.`)) return
    try {
      await remove.mutateAsync(account.id)
      onClose()
    } catch (e) {
      setError(humanError(e))
    }
  }

  const inputStyle = { backgroundColor: 'var(--bg-inset)', borderColor: 'transparent' }

  return (
    <Sheet open onClose={onClose} title={account ? 'Editar cuenta' : 'Nueva cuenta'}>
      <div className="space-y-5">
        <div>
          <p className="t-subhead font-medium mb-2">Tipo</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TYPE_META) as AccountType[])
              .filter((t) => t !== 'debit_card' && t !== 'other' && t !== 'crypto')
              .map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-[12px] border t-footnote font-medium transition-colors"
                  style={{
                    borderColor: type === t ? 'var(--accent)' : 'var(--separator-opaque)',
                    backgroundColor: type === t ? 'var(--accent-soft)' : 'transparent',
                    color: type === t ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  <span className="text-base">{TYPE_META[t].emoji}</span>
                  <span className="truncate">{TYPE_META[t].label}</span>
                </button>
              ))}
          </div>
        </div>

        <div>
          <label htmlFor="acc-name" className="t-subhead font-medium block mb-2">
            Nombre
          </label>
          <input
            id="acc-name"
            className="w-full px-4 py-3.5 rounded-[14px] t-body outline-none border"
            style={inputStyle}
            placeholder={liability ? 'Visa Santander' : 'Cuenta nómina'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus={!account}
          />
        </div>

        <div>
          <label htmlFor="acc-balance" className="t-subhead font-medium block mb-2">
            {liability ? 'Cuánto debes ahora' : 'Saldo actual'}
          </label>
          <input
            id="acc-balance"
            className="w-full px-4 py-4 rounded-[14px] num font-bold outline-none border"
            style={{ ...inputStyle, fontSize: '26px' }}
            inputMode="decimal"
            placeholder="0,00"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
          {liability && (
            <p className="t-footnote text-[var(--text-tertiary)] mt-2">
              Escríbelo en positivo: se resta del patrimonio automáticamente.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="t-body">Cuenta conjunta</p>
            <p className="t-footnote text-[var(--text-tertiary)]">
              {shared ? 'De los dos' : 'Solo tuya'}
            </p>
          </div>
          <Switch checked={shared} onChange={setShared} label="Cuenta conjunta" />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="t-body">Contar en el patrimonio</p>
            <p className="t-footnote text-[var(--text-tertiary)]">Suma al total</p>
          </div>
          <Switch checked={inNetWorth} onChange={setInNetWorth} label="Contar en el patrimonio" />
        </div>

        {error && (
          <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
            {error}
          </p>
        )}

        <Button size="lg" fullWidth loading={save.isPending} onClick={submit}>
          {account ? 'Guardar cambios' : 'Añadir cuenta'}
        </Button>

        {account && (
          <Button variant="destructive" fullWidth onClick={del} loading={remove.isPending}>
            <Trash2 size={16} /> Borrar cuenta
          </Button>
        )}
      </div>
    </Sheet>
  )
}
