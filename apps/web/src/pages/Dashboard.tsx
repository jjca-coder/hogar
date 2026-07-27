import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronRight, Eye, EyeOff, Settings, Wallet } from 'lucide-react'
import { money, sum, upperFirst, type Category } from '@aurora/shared'
import { monthRange, useAccounts, useCategories, useTransactions } from '@/lib/queries'
import { useActiveHousehold, useProfile, usePermissions } from '@/lib/session'
import { useTheme } from '@/design-system/theme'
import { Amount, Card, EmptyState, Skeleton } from '@/design-system/primitives'

export default function Dashboard() {
  const { data: profile } = useProfile()
  const { membership } = useActiveHousehold()
  const { canReadFinances } = usePermissions()
  const { hideAmounts, toggleHideAmounts } = useTheme()

  const range = useMemo(() => monthRange(new Date()), [])
  const { data: accounts, isPending: loadingAccounts } = useAccounts()
  const { data: transactions, isPending: loadingTx } = useTransactions(range)
  const { data: categories } = useCategories()

  const catById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])

  const counted = (accounts ?? []).filter((a) => a.include_in_net_worth)
  const netWorth = sum(counted.map((a) => money(a.current_balance)))

  const txs = useMemo(() => transactions ?? [], [transactions])
  const spent = sum(txs.filter((t) => t.amount < 0).map((t) => money(-t.amount)))
  const earned = sum(txs.filter((t) => t.amount > 0).map((t) => money(t.amount)))

  /** Gasto agrupado por categoría, de mayor a menor. */
  const byCategory = useMemo(() => {
    const sums = new Map<string, number>()
    for (const t of txs) {
      if (t.amount >= 0) continue
      const key = t.category_id ?? 'sin'
      sums.set(key, (sums.get(key) ?? 0) + -t.amount)
    }
    const rows = [...sums.entries()]
      .map(([id, total]) => ({
        id,
        category: id === 'sin' ? undefined : catById.get(id),
        total,
      }))
      .sort((a, b) => b.total - a.total)
    const max = rows[0]?.total ?? 1
    return { rows: rows.slice(0, 6), max }
  }, [txs, catById])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 6) return 'Buenas noches'
    if (h < 14) return 'Buenos días'
    if (h < 21) return 'Buenas tardes'
    return 'Buenas noches'
  })()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <header className="flex items-start justify-between">
        <div>
          <p className="t-subhead text-[var(--text-tertiary)]">
            {upperFirst(format(new Date(), "EEEE d 'de' LLLL", { locale: es }))}
          </p>
          <h1 className="t-title-1 mt-0.5">
            {greeting}
            {profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {canReadFinances && (
            <button
              onClick={toggleHideAmounts}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              aria-label={hideAmounts ? 'Mostrar importes' : 'Ocultar importes'}
            >
              {hideAmounts ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
          <Link
            to="/ajustes/hogar"
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
            aria-label="Ajustes"
          >
            <Settings size={18} />
          </Link>
        </div>
      </header>

      {!canReadFinances ? (
        <Card padded={false}>
          <EmptyState
            title="Tus tareas y hábitos"
            description="Tu perfil no tiene acceso a las finanzas del hogar. Usa las pestañas de abajo."
          />
        </Card>
      ) : (
        <>
          <Link to="/finanzas/cuentas" className="block">
            <Card className="active:scale-[0.99] transition-transform">
              <div className="flex items-center justify-between">
                <p className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">
                  Patrimonio neto
                </p>
                <ChevronRight size={16} className="text-[var(--text-quaternary)]" />
              </div>
              {loadingAccounts ? (
                <Skeleton className="h-9 w-40 mt-2" />
              ) : (
                <p className="t-large-title num mt-1.5">
                  {counted.length === 0 ? '—' : <Amount value={netWorth} compact />}
                </p>
              )}
              {!loadingAccounts && counted.length === 0 && (
                <p className="t-subhead text-[var(--text-tertiary)] mt-1">
                  Añade tus cuentas para verlo
                </p>
              )}
            </Card>
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="t-footnote text-[var(--text-tertiary)]">Gastado este mes</p>
              {loadingTx ? (
                <Skeleton className="h-6 w-24 mt-2" />
              ) : (
                <p className="t-title-3 num mt-1" style={{ color: 'var(--expense)' }}>
                  <Amount value={spent} />
                </p>
              )}
            </Card>
            <Card>
              <p className="t-footnote text-[var(--text-tertiary)]">Ingresado</p>
              {loadingTx ? (
                <Skeleton className="h-6 w-24 mt-2" />
              ) : (
                <p className="t-title-3 num mt-1" style={{ color: 'var(--income)' }}>
                  <Amount value={earned} />
                </p>
              )}
            </Card>
          </div>

          {byCategory.rows.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">
                  En qué se va
                </h2>
                <Link to="/finanzas" className="t-footnote font-semibold text-[var(--accent)]">
                  Ver todo
                </Link>
              </div>
              <div className="space-y-3.5">
                {byCategory.rows.map((row) => (
                  <CategoryBar
                    key={row.id}
                    category={row.category}
                    total={row.total}
                    max={byCategory.max}
                    share={spent.amount > 0 ? row.total / spent.amount : 0}
                  />
                ))}
              </div>
            </Card>
          )}

          {!loadingTx && txs.length === 0 && counted.length > 0 && (
            <Card padded={false}>
              <EmptyState
                icon={<Wallet size={28} />}
                title="Ningún movimiento todavía"
                description="Toca el botón + de abajo para anotar tu primer gasto. Se tarda menos de cinco segundos."
              />
            </Card>
          )}
        </>
      )}

      {membership && (
        <p className="t-caption text-center text-[var(--text-quaternary)] pt-2">
          {membership.household.name}
        </p>
      )}
    </div>
  )
}

function CategoryBar({
  category,
  total,
  max,
  share,
}: {
  category: Category | undefined
  total: number
  max: number
  share: number
}) {
  const color = category?.color ?? 'var(--text-quaternary)'
  return (
    <div>
      <div className="flex items-baseline gap-2.5 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="t-subhead flex-1 truncate">{category?.name ?? 'Sin categoría'}</span>
        <span className="t-subhead font-semibold num">
          <Amount value={money(total)} />
        </span>
        <span className="t-caption text-[var(--text-tertiary)] num w-9 text-right">
          {Math.round(share * 100)}%
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-inset)' }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.max((total / max) * 100, 3)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}
