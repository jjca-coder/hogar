import { useMemo, useState } from 'react'
import { addMonths, format, isToday, isYesterday, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileUp, Receipt, Search, Trash2, X } from 'lucide-react'
import { money, sum, upperFirst, type Category, type Transaction } from '@aurora/shared'
import {
  monthRange,
  useAccounts,
  useCategories,
  useDeleteTransaction,
  useTransactions,
} from '@/lib/queries'
import { usePermissions } from '@/lib/session'
import { Amount, Card, EmptyState, InsetList, Skeleton } from '@/design-system/primitives'

function dayHeading(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return 'Hoy'
  if (isYesterday(d)) return 'Ayer'
  return upperFirst(format(d, "EEEE d 'de' LLLL", { locale: es }))
}

export default function Transactions() {
  const [month, setMonth] = useState(() => new Date())
  const [query, setQuery] = useState('')
  const range = useMemo(() => monthRange(month), [month])
  const { data: transactions, isPending } = useTransactions(range)
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()
  const { canWriteFinances } = usePermissions()
  const remove = useDeleteTransaction()

  const catById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const accById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts])

  const list = useMemo(() => transactions ?? [], [transactions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((t) => {
      const cat = t.category_id ? (catById.get(t.category_id)?.name ?? '') : ''
      return (
        (t.clean_description ?? '').toLowerCase().includes(q) ||
        t.raw_description.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q)
      )
    })
  }, [list, query, catById])

  const spent = sum(filtered.filter((t) => t.amount < 0).map((t) => money(-t.amount)))
  const earned = sum(filtered.filter((t) => t.amount > 0).map((t) => money(t.amount)))

  const byDay = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const t of filtered) {
      map.set(t.booked_at, [...(map.get(t.booked_at) ?? []), t])
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filtered])

  const del = async (t: Transaction) => {
    const label = t.clean_description || catById.get(t.category_id ?? '')?.name || 'este movimiento'
    if (!confirm(`¿Borrar ${label}?`)) return
    await remove.mutateAsync(t.id)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <header>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h1 className="t-title-1">Movimientos</h1>
            {canWriteFinances && (
              <Link
                to="/finanzas/importar"
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                aria-label="Importar extracto"
                title="Importar extracto del banco"
              >
                <FileUp size={15} />
              </Link>
            )}
          </div>
          <div
            className="flex items-center rounded-full border px-1"
            style={{ borderColor: 'var(--separator-opaque)' }}
          >
            <button
              className="p-1.5 text-[var(--text-tertiary)]"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label="Mes anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="t-footnote font-semibold w-[92px] text-center">
              {upperFirst(format(month, 'LLLL yyyy', { locale: es }))}
            </span>
            <button
              className="p-1.5 text-[var(--text-tertiary)]"
              onClick={() => setMonth(addMonths(month, 1))}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="t-footnote text-[var(--text-tertiary)]">Gastado</p>
            <p className="t-title-3 num mt-1" style={{ color: 'var(--expense)' }}>
              <Amount value={spent} />
            </p>
          </Card>
          <Card>
            <p className="t-footnote text-[var(--text-tertiary)]">Ingresado</p>
            <p className="t-title-3 num mt-1" style={{ color: 'var(--income)' }}>
              <Amount value={earned} />
            </p>
          </Card>
        </div>
      </header>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
        />
        <input
          className="w-full pl-10 pr-9 py-2.5 rounded-[12px] t-subhead outline-none border"
          style={{ backgroundColor: 'var(--bg-inset)', borderColor: 'transparent' }}
          placeholder="Buscar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar movimientos"
        />
        {query && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            onClick={() => setQuery('')}
            aria-label="Limpiar búsqueda"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {isPending ? (
        <Card className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </Card>
      ) : byDay.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Receipt size={30} />}
            title={query ? 'Nada coincide' : 'Sin movimientos este mes'}
            description={
              query
                ? 'Prueba con otra palabra.'
                : 'Usa el botón + de abajo para anotar un gasto en unos segundos.'
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
              {items.map((t) => {
                const cat = t.category_id ? catById.get(t.category_id) : undefined
                const acc = accById.get(t.account_id)
                return (
                  <div key={t.id} className="inset-row group">
                    <CategoryDot category={cat} />
                    <div className="flex-1 min-w-0">
                      <p className="t-body truncate">
                        {t.clean_description || cat?.name || 'Movimiento'}
                      </p>
                      <p className="t-footnote text-[var(--text-tertiary)] truncate">
                        {[cat?.name, acc?.name].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Amount value={money(t.amount)} colored signed />
                    {canWriteFinances && (
                      <button
                        onClick={() => del(t)}
                        className="p-1 text-[var(--text-quaternary)] hover:text-[var(--expense)] transition-colors"
                        aria-label="Borrar movimiento"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )
              })}
            </InsetList>
          </section>
        ))
      )}
    </div>
  )
}

function CategoryDot({ category }: { category: Category | undefined }) {
  const color = category?.color ?? 'var(--text-quaternary)'
  return (
    <span
      className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
      aria-hidden
    >
      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
    </span>
  )
}
