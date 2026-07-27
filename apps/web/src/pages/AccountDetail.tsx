import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, isToday, isYesterday, parseISO, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Pencil, RefreshCw, Wallet } from 'lucide-react'
import { money, sum, upperFirst, type Category, type Transaction } from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { useAccounts, useCategories } from '@/lib/queries'
import { usePermissions } from '@/lib/session'
import { Amount, Button, Card, EmptyState, InsetList, Skeleton } from '@/design-system/primitives'

function dayHeading(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return 'Hoy'
  if (isYesterday(d)) return 'Ayer'
  return upperFirst(format(d, "EEEE d 'de' LLLL", { locale: es }))
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWriteFinances } = usePermissions()
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  const account = useMemo(() => (accounts ?? []).find((a) => a.id === id), [accounts, id])

  const { data: transactions, isPending } = useQuery({
    queryKey: ['account-transactions', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Transaction[]> => {
      // Un año hacia atrás: suficiente para revisar sin traer de más
      const since = format(subMonths(new Date(), 12), 'yyyy-MM-dd')
      const { data, error } = await sb()
        .from('transactions')
        .select('*')
        .eq('account_id', id!)
        .gte('booked_at', since)
        .is('split_parent_id', null)
        .order('booked_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Transaction[]
    },
  })

  const catById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const list = useMemo(() => transactions ?? [], [transactions])

  const byDay = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of list) map.set(t.booked_at, [...(map.get(t.booked_at) ?? []), t])
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [list])

  const monthIn = sum(
    list
      .filter((t) => t.amount > 0 && t.booked_at >= format(new Date(), 'yyyy-MM-01'))
      .map((t) => money(t.amount)),
  )
  const monthOut = sum(
    list
      .filter((t) => t.amount < 0 && t.booked_at >= format(new Date(), 'yyyy-MM-01'))
      .map((t) => money(-t.amount)),
  )

  const syncNow = async () => {
    if (!account) return
    setSyncing(true)
    setError('')
    try {
      const { data: conn } = await sb()
        .from('accounts')
        .select('connection_id')
        .eq('id', account.id)
        .single()
      if (!conn?.connection_id) throw new Error('Esta cuenta no está conectada a ningún banco.')

      const { data, error: fnError } = await sb().functions.invoke('bank', {
        body: { action: 'sync', connectionId: conn.connection_id },
      })
      if (fnError) {
        const context = (fnError as { context?: Response }).context
        if (context?.json) {
          const body = (await context.json()) as { error?: string; detail?: string }
          throw new Error(
            body.detail ? `${body.error}\n${body.detail}` : (body.error ?? fnError.message),
          )
        }
        throw fnError
      }
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)

      await queryClient.invalidateQueries({ queryKey: ['account-transactions', id] })
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      await queryClient.invalidateQueries({ queryKey: ['transactions'] })
    } catch (e) {
      setError(humanError(e))
    } finally {
      setSyncing(false)
    }
  }

  if (!account) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Card padded={false}>
          <EmptyState
            title="Cuenta no encontrada"
            action={<Button onClick={() => navigate('/finanzas/cuentas')}>Volver a cuentas</Button>}
          />
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

      <header>
        <p className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">
          {account.name}
        </p>
        <h1 className="t-large-title num mt-1 sensitive">
          <Amount
            value={money(account.current_balance)}
            className={account.current_balance < 0 ? 'text-[var(--expense)]' : ''}
          />
        </h1>
      </header>

      <div className="flex gap-2">
        {!account.is_manual && (
          <Button variant="tinted" loading={syncing} onClick={syncNow}>
            <RefreshCw size={15} /> Actualizar
          </Button>
        )}
        {canWriteFinances && (
          <Link to={`/finanzas/cuentas?editar=${account.id}`}>
            <Button variant="tinted">
              <Pencil size={15} /> Editar
            </Button>
          </Link>
        )}
      </div>

      {error && (
        <p
          className="t-subhead whitespace-pre-line"
          style={{ color: 'var(--expense)' }}
          role="alert"
        >
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="t-footnote text-[var(--text-tertiary)]">Entradas del mes</p>
          <p className="t-title-3 num mt-1" style={{ color: 'var(--income)' }}>
            <Amount value={monthIn} />
          </p>
        </Card>
        <Card>
          <p className="t-footnote text-[var(--text-tertiary)]">Salidas del mes</p>
          <p className="t-title-3 num mt-1" style={{ color: 'var(--expense)' }}>
            <Amount value={monthOut} />
          </p>
        </Card>
      </div>

      {isPending ? (
        <Card className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      ) : byDay.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Wallet size={30} />}
            title="Sin movimientos"
            description={
              account.is_manual
                ? 'Añade movimientos con el botón + de abajo.'
                : 'Pulsa Actualizar para traer los de los últimos 90 días.'
            }
          />
        </Card>
      ) : (
        byDay.map(([day, items]) => (
          <section key={day}>
            <h2 className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)] px-1 mb-2">
              {dayHeading(day)}
            </h2>
            <InsetList>
              {items.map((t) => (
                <Row
                  key={t.id}
                  transaction={t}
                  category={t.category_id ? catById.get(t.category_id) : undefined}
                />
              ))}
            </InsetList>
          </section>
        ))
      )}
    </div>
  )
}

function Row({
  transaction,
  category,
}: {
  transaction: Transaction
  category: Category | undefined
}) {
  const color = category?.color ?? 'var(--text-quaternary)'
  return (
    <div className="inset-row">
      <span
        className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
        aria-hidden
      >
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="t-body truncate">
          {transaction.clean_description || transaction.raw_description || 'Movimiento'}
        </p>
        <p className="t-footnote text-[var(--text-tertiary)] truncate">
          {category?.name ?? 'Sin categoría'}
          {transaction.status === 'pending' && ' · pendiente'}
        </p>
      </div>
      <Amount value={money(transaction.amount)} colored signed />
    </div>
  )
}
