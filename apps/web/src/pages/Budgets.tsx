import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { endOfMonth, format, getDate, getDaysInMonth, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, PiggyBank, Plus, Target } from 'lucide-react'
import { budgetProgress, parseAmountToMinor, upperFirst, type Category } from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { monthRange, useCategories, useTransactions } from '@/lib/queries'
import { useActiveHousehold, usePermissions } from '@/lib/session'
import { Amount, Button, Card, EmptyState, Sheet, Skeleton } from '@/design-system/primitives'

interface BudgetLine {
  id: string
  category_id: string
  planned_amount: number
}

export default function Budgets() {
  const { membership } = useActiveHousehold()
  const { canWriteFinances } = usePermissions()
  const queryClient = useQueryClient()
  const householdId = membership?.household_id

  const now = new Date()
  const range = useMemo(() => monthRange(now), []) // eslint-disable-line react-hooks/exhaustive-deps
  const periodStart = format(startOfMonth(now), 'yyyy-MM-dd')

  const { data: transactions } = useTransactions(range)
  const { data: categories } = useCategories()
  const [editing, setEditing] = useState<Category | null>(null)

  /** Presupuesto del hogar y sus líneas del mes en curso. */
  const { data: lines, isPending } = useQuery({
    queryKey: ['budget-lines', householdId, periodStart],
    enabled: Boolean(householdId),
    queryFn: async (): Promise<BudgetLine[]> => {
      const { data: budget } = await sb()
        .from('budgets')
        .select('id')
        .eq('household_id', householdId!)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      if (!budget) return []

      const { data: period } = await sb()
        .from('budget_periods')
        .select('id')
        .eq('budget_id', budget.id)
        .eq('starts_on', periodStart)
        .maybeSingle()
      if (!period) return []

      const { data, error } = await sb()
        .from('budget_lines')
        .select('id, category_id, planned_amount')
        .eq('period_id', period.id)
      if (error) throw error
      return (data ?? []) as BudgetLine[]
    },
  })

  /** Crea presupuesto y periodo si aún no existen, y guarda la línea. */
  const saveLine = useMutation({
    mutationFn: async ({ categoryId, amount }: { categoryId: string; amount: number }) => {
      let budgetId: string
      const { data: existing } = await sb()
        .from('budgets')
        .select('id')
        .eq('household_id', householdId!)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (existing) {
        budgetId = existing.id as string
      } else {
        const { data, error } = await sb()
          .from('budgets')
          .insert({ household_id: householdId!, name: 'Presupuesto mensual' })
          .select('id')
          .single()
        if (error) throw error
        budgetId = data.id as string
      }

      let periodId: string
      const { data: period } = await sb()
        .from('budget_periods')
        .select('id')
        .eq('budget_id', budgetId)
        .eq('starts_on', periodStart)
        .maybeSingle()

      if (period) {
        periodId = period.id as string
      } else {
        const { data, error } = await sb()
          .from('budget_periods')
          .insert({
            budget_id: budgetId,
            starts_on: periodStart,
            ends_on: format(endOfMonth(now), 'yyyy-MM-dd'),
          })
          .select('id')
          .single()
        if (error) throw error
        periodId = data.id as string
      }

      if (amount <= 0) {
        // Poner 0 equivale a quitar el presupuesto de esa categoría
        const { error } = await sb()
          .from('budget_lines')
          .delete()
          .eq('period_id', periodId)
          .eq('category_id', categoryId)
        if (error) throw error
        return
      }

      const { error } = await sb()
        .from('budget_lines')
        .upsert(
          { period_id: periodId, category_id: categoryId, planned_amount: amount },
          { onConflict: 'period_id,category_id' },
        )
      if (error) throw error
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['budget-lines', householdId, periodStart] }),
  })

  /** Gasto real por categoría en el mes. */
  const spentByCategory = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transactions ?? []) {
      if (t.amount >= 0 || t.excluded_from_budget || t.is_transfer || !t.category_id) continue
      map.set(t.category_id, (map.get(t.category_id) ?? 0) + -t.amount)
    }
    return map
  }, [transactions])

  const catById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])

  const dayOfMonth = getDate(now)
  const daysInMonth = getDaysInMonth(now)

  const rows = useMemo(() => {
    return (lines ?? [])
      .map((line) => {
        const category = catById.get(line.category_id)
        const spent = spentByCategory.get(line.category_id) ?? 0
        return {
          line,
          category,
          progress: budgetProgress(line.planned_amount, spent, dayOfMonth, daysInMonth),
        }
      })
      .filter((r) => r.category)
      .sort((a, b) => b.progress.ratio - a.progress.ratio)
  }, [lines, catById, spentByCategory, dayOfMonth, daysInMonth])

  const totals = useMemo(() => {
    const planned = rows.reduce((s, r) => s + r.progress.planned.amount, 0)
    const spent = rows.reduce((s, r) => s + r.progress.spent.amount, 0)
    return budgetProgress(planned, spent, dayOfMonth, daysInMonth)
  }, [rows, dayOfMonth, daysInMonth])

  /** Categorías hoja de gasto que aún no tienen presupuesto. */
  const available = useMemo(() => {
    const used = new Set((lines ?? []).map((l) => l.category_id))
    return (categories ?? []).filter(
      (c) => c.kind === 'expense' && c.parent_id !== null && !used.has(c.id),
    )
  }, [categories, lines])

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <Link
        to="/finanzas"
        className="flex items-center gap-1.5 t-subhead text-[var(--text-secondary)]"
      >
        <ArrowLeft size={16} /> Movimientos
      </Link>

      <div>
        <h1 className="t-title-1">Presupuesto</h1>
        <p className="t-subhead text-[var(--text-tertiary)] mt-1">
          {upperFirst(format(now, 'LLLL yyyy', { locale: es }))} · día {dayOfMonth} de {daysInMonth}
        </p>
      </div>

      {isPending ? (
        <Card className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </Card>
      ) : rows.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<PiggyBank size={30} />}
            title="Sin presupuesto todavía"
            description="Pon un tope a las categorías donde se te va el dinero. Te avisaré cuando te acerques y te diré cómo vas a acabar el mes."
            action={
              canWriteFinances && available[0] ? (
                <Button onClick={() => setEditing(available[0]!)}>
                  <Plus size={17} /> Poner el primero
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-baseline justify-between mb-2">
              <p className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">
                Total del mes
              </p>
              <p className="t-subhead num">
                <Amount value={totals.spent} />
                <span className="text-[var(--text-tertiary)]"> de </span>
                <Amount value={totals.planned} />
              </p>
            </div>
            <ProgressBar progress={totals} />
            <p className="t-footnote mt-2.5" style={{ color: projectionColor(totals.status) }}>
              {totals.willOverspend
                ? `A este ritmo acabarás el mes en ${fmt(totals.projected.amount)}`
                : `Vas bien: proyección de ${fmt(totals.projected.amount)}`}
            </p>
          </Card>

          <div className="space-y-3">
            {rows.map(({ line, category, progress }) => (
              <button
                key={line.id}
                onClick={() => canWriteFinances && category && setEditing(category)}
                className="w-full text-left"
                disabled={!canWriteFinances}
              >
                <Card className="active:scale-[0.99] transition-transform">
                  <div className="flex items-baseline gap-2.5 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: category!.color }}
                    />
                    <span className="t-body flex-1 truncate">{category!.name}</span>
                    <span className="t-subhead num font-semibold">
                      <Amount value={progress.spent} />
                    </span>
                    <span className="t-footnote text-[var(--text-tertiary)] num">
                      / <Amount value={progress.planned} />
                    </span>
                  </div>
                  <ProgressBar progress={progress} color={category!.color} />
                  <p className="t-caption mt-2" style={{ color: projectionColor(progress.status) }}>
                    {progress.status === 'over'
                      ? `Te has pasado ${fmt(-progress.remaining.amount)}`
                      : progress.willOverspend
                        ? `Acabarás en ${fmt(progress.projected.amount)}`
                        : `Te quedan ${fmt(progress.remaining.amount)}`}
                  </p>
                </Card>
              </button>
            ))}
          </div>

          {canWriteFinances && available.length > 0 && (
            <button
              onClick={() => setEditing(available[0]!)}
              className="w-full py-4 rounded-[16px] border border-dashed t-subhead font-semibold flex items-center justify-center gap-2"
              style={{ borderColor: 'var(--separator-opaque)', color: 'var(--text-tertiary)' }}
            >
              <Plus size={17} /> Añadir categoría al presupuesto
            </button>
          )}
        </>
      )}

      {editing && (
        <BudgetLineSheet
          category={editing}
          categories={available.length > 0 ? available : (categories ?? [])}
          current={(lines ?? []).find((l) => l.category_id === editing.id)?.planned_amount ?? 0}
          onClose={() => setEditing(null)}
          onSave={async (categoryId, amount) => {
            await saveLine.mutateAsync({ categoryId, amount })
            setEditing(null)
          }}
          saving={saveLine.isPending}
        />
      )}
    </div>
  )
}

const fmt = (minor: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    useGrouping: 'always',
  }).format(minor / 100)

function projectionColor(status: 'ok' | 'warning' | 'over'): string {
  if (status === 'over') return 'var(--expense)'
  if (status === 'warning') return 'var(--warning)'
  return 'var(--text-tertiary)'
}

function ProgressBar({
  progress,
  color,
}: {
  progress: ReturnType<typeof budgetProgress>
  color?: string
}) {
  const fill =
    progress.status === 'over'
      ? 'var(--expense)'
      : progress.status === 'warning'
        ? 'var(--warning)'
        : (color ?? 'var(--accent)')

  return (
    <div
      className="relative h-2 rounded-full overflow-hidden"
      style={{ backgroundColor: 'var(--bg-inset)' }}
      role="progressbar"
      aria-valuenow={Math.round(progress.ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(progress.ratio * 100, 100)}%`, backgroundColor: fill }}
      />
    </div>
  )
}

function BudgetLineSheet({
  category,
  categories,
  current,
  onClose,
  onSave,
  saving,
}: {
  category: Category
  categories: Category[]
  current: number
  onClose: () => void
  onSave: (categoryId: string, amount: number) => Promise<void>
  saving: boolean
}) {
  const [categoryId, setCategoryId] = useState(category.id)
  const [amount, setAmount] = useState(
    current > 0 ? (current / 100).toFixed(2).replace('.', ',') : '',
  )
  const [error, setError] = useState('')

  const submit = async () => {
    const minor = parseAmountToMinor(amount || '0')
    if (minor === null) {
      setError('Escribe un importe válido')
      return
    }
    try {
      await onSave(categoryId, minor)
    } catch (e) {
      setError(humanError(e))
    }
  }

  const inputStyle = { backgroundColor: 'var(--bg-inset)', borderColor: 'transparent' }

  return (
    <Sheet open onClose={onClose} title="Tope mensual">
      <div className="space-y-5">
        <div>
          <label htmlFor="bud-cat" className="t-subhead font-medium block mb-2">
            Categoría
          </label>
          <select
            id="bud-cat"
            className="w-full px-3 py-3 rounded-[12px] t-body outline-none border"
            style={inputStyle}
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="bud-amount" className="t-subhead font-medium block mb-2">
            Cuánto como máximo al mes
          </label>
          <input
            id="bud-amount"
            className="w-full px-4 py-4 rounded-[14px] num font-bold outline-none border text-center"
            style={{ ...inputStyle, fontSize: '30px' }}
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
          <p className="t-footnote text-[var(--text-tertiary)] mt-2">
            Ponlo a 0 para quitar el tope de esta categoría.
          </p>
        </div>

        {error && (
          <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
            {error}
          </p>
        )}

        <Button size="lg" fullWidth loading={saving} onClick={submit}>
          <Target size={17} /> Guardar
        </Button>
      </div>
    </Sheet>
  )
}
