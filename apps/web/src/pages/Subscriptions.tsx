import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, parseISO, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowLeft, Repeat, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  CADENCE_LABELS,
  detectRecurring,
  money,
  upperFirst,
  type CandidateTransaction,
  type Transaction,
} from '@aurora/shared'
import { sb } from '@/lib/supabase'
import { useCategories } from '@/lib/queries'
import { useActiveHousehold } from '@/lib/session'
import { Amount, Card, EmptyState, InsetList, Skeleton } from '@/design-system/primitives'

/**
 * Las suscripciones no se guardan: se deducen de los movimientos cada vez.
 * Así aparecen y desaparecen solas según lo que realmente pagas, sin que
 * haya que mantener una lista a mano.
 */
export default function Subscriptions() {
  const { membership } = useActiveHousehold()
  const { data: categories } = useCategories()
  const householdId = membership?.household_id

  const { data: transactions, isPending } = useQuery({
    queryKey: ['recurring-source', householdId],
    enabled: Boolean(householdId),
    queryFn: async (): Promise<Transaction[]> => {
      // 18 meses: suficiente para detectar incluso cuotas anuales
      const since = format(subMonths(new Date(), 18), 'yyyy-MM-dd')
      const { data, error } = await sb()
        .from('transactions')
        .select('id, clean_description, raw_description, amount, booked_at, category_id')
        .eq('household_id', householdId!)
        .lt('amount', 0)
        .gte('booked_at', since)
        .limit(3000)
      if (error) throw error
      return (data ?? []) as Transaction[]
    },
  })

  const catById = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])

  const detected = useMemo(() => {
    const candidates: CandidateTransaction[] = (transactions ?? []).map((t) => ({
      id: t.id,
      description: t.clean_description || t.raw_description,
      amount: t.amount,
      date: t.booked_at,
      category_id: t.category_id,
    }))
    return detectRecurring(candidates)
  }, [transactions])

  const yearlyTotal = detected.reduce((s, d) => s + d.yearlyCost, 0)
  const monthlyEquivalent = Math.round(yearlyTotal / 12)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <Link
        to="/finanzas"
        className="flex items-center gap-1.5 t-subhead text-[var(--text-secondary)]"
      >
        <ArrowLeft size={16} /> Movimientos
      </Link>

      <div>
        <h1 className="t-title-1">Suscripciones</h1>
        <p className="t-subhead text-[var(--text-tertiary)] mt-1">
          Detectadas solas a partir de tus movimientos
        </p>
      </div>

      {isPending ? (
        <Card className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </Card>
      ) : detected.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<Repeat size={30} />}
            title="Todavía no veo pagos periódicos"
            description="Hacen falta al menos tres cargos del mismo comercio con importe parecido. Importa varios meses de extractos y aparecerán solas."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <p className="t-footnote text-[var(--text-tertiary)]">Al mes</p>
              <p className="t-title-3 num mt-1">
                <Amount value={money(monthlyEquivalent)} />
              </p>
            </Card>
            <Card>
              <p className="t-footnote text-[var(--text-tertiary)]">Al año</p>
              <p className="t-title-3 num mt-1" style={{ color: 'var(--expense)' }}>
                <Amount value={money(yearlyTotal)} compact />
              </p>
            </Card>
          </div>

          <InsetList>
            {detected.map((d) => {
              const cat = d.category_id ? catById.get(d.category_id) : undefined
              const color = cat?.color ?? 'var(--text-quaternary)'
              return (
                <div key={d.key} className="inset-row">
                  <span
                    className="w-10 h-10 rounded-[12px] flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` }}
                  >
                    <Repeat size={16} style={{ color }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="t-body truncate">{d.name}</p>
                    <p className="t-footnote text-[var(--text-tertiary)]">
                      {CADENCE_LABELS[d.cadence]} · próximo{' '}
                      {upperFirst(format(parseISO(d.nextExpected), "d 'de' LLL", { locale: es }))}
                    </p>
                  </div>
                  <div className="text-right">
                    <Amount value={money(d.averageAmount)} />
                    {d.priceIncreased && (
                      <p
                        className="t-caption-2 font-semibold flex items-center gap-0.5 justify-end mt-0.5"
                        style={{ color: 'var(--warning)' }}
                      >
                        <TrendingUp size={11} /> ha subido
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </InsetList>

          <p className="t-footnote text-[var(--text-tertiary)] text-center">
            Se consideran suscripciones los cargos del mismo sitio con importe estable y fecha
            regular.
          </p>
        </>
      )}
    </div>
  )
}
