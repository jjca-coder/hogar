import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, Repeat, Trash2, Users } from 'lucide-react'
import { parseAmountToMinor, type Category, type Transaction } from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { useAccounts, useCategories, useHouseholdMembers } from '@/lib/queries'
import { Button, Segmented, Sheet, Switch } from '@/design-system/primitives'

/**
 * Editar un movimiento ya existente: reclasificarlo, corregir el importe o
 * marcarlo como traspaso entre cuentas propias.
 *
 * Un traspaso NO es un gasto ni un ingreso: mover dinero de la cuenta al
 * ahorro no empobrece ni enriquece. Marcarlo lo saca de los totales y de
 * los presupuestos, pero deja el saldo de cada cuenta intacto.
 */
export default function EditTransactionSheet({
  transaction,
  onClose,
}: {
  transaction: Transaction
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { data: categories } = useCategories()
  const { data: accounts } = useAccounts()
  const { data: members } = useHouseholdMembers()

  const [description, setDescription] = useState(
    transaction.clean_description || transaction.raw_description,
  )
  const [categoryId, setCategoryId] = useState<string | null>(transaction.category_id)
  const [amount, setAmount] = useState(
    (Math.abs(transaction.amount) / 100).toFixed(2).replace('.', ','),
  )
  const [kind, setKind] = useState<'expense' | 'income'>(
    transaction.amount < 0 ? 'expense' : 'income',
  )
  const [isTransfer, setIsTransfer] = useState(transaction.is_transfer)
  const [excluded, setExcluded] = useState(transaction.excluded_from_budget)
  const [paidBy, setPaidBy] = useState<string | null>(transaction.paid_by)
  const [isSubscription, setIsSubscription] = useState(transaction.is_subscription)
  const [error, setError] = useState('')

  const pickable = useMemo(() => {
    const wanted = kind === 'expense' ? 'expense' : 'income'
    return (categories ?? []).filter((c) => c.kind === wanted && c.parent_id !== null)
  }, [categories, kind])

  const account = useMemo(
    () => (accounts ?? []).find((a) => a.id === transaction.account_id),
    [accounts, transaction.account_id],
  )
  const accountName = account?.name ?? ''
  // "¿Quién pagó?" solo tiene sentido en cuentas conjuntas y con más de una
  // persona: en una cuenta personal siempre pagas tú.
  const isJoint = account?.owner_id === null
  const showPaidBy = isJoint && (members?.length ?? 0) > 1 && !isTransfer

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['account-transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['month-summary'] }),
    ])
  }

  const save = useMutation({
    mutationFn: async () => {
      const minor = parseAmountToMinor(amount)
      if (minor === null || minor === 0) throw new Error('Pon un importe válido')

      const signed = kind === 'expense' ? -Math.abs(minor) : Math.abs(minor)
      const { error } = await sb()
        .from('transactions')
        .update({
          clean_description: description.trim(),
          category_id: isTransfer ? null : categoryId,
          amount: signed,
          amount_base: signed,
          is_transfer: isTransfer,
          // Un traspaso nunca debe contar en el presupuesto
          excluded_from_budget: isTransfer || excluded,
          // Quién pagó solo aplica en conjuntas; en el resto se limpia.
          paid_by: showPaidBy ? paidBy : null,
          // Suscripción solo tiene sentido en un gasto que no sea traspaso.
          is_subscription: !isTransfer && kind === 'expense' ? isSubscription : false,
          reviewed: true,
        })
        .eq('id', transaction.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await refresh()
      onClose()
    },
    onError: (e) => setError(humanError(e)),
  })

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await sb().from('transactions').delete().eq('id', transaction.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await refresh()
      onClose()
    },
    onError: (e) => setError(humanError(e)),
  })

  const inputStyle = { backgroundColor: 'var(--bg-inset)', borderColor: 'transparent' }

  return (
    <Sheet open onClose={onClose} title="Editar movimiento">
      <div className="space-y-5">
        <p className="t-footnote text-[var(--text-tertiary)]">
          {accountName} · {transaction.booked_at}
          {transaction.source === 'bank' && ' · del banco'}
        </p>

        <input
          className="w-full px-4 py-3.5 rounded-[14px] t-body outline-none border"
          style={inputStyle}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción"
          aria-label="Descripción"
        />

        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <ArrowLeftRight size={17} />
          </div>
          <div className="flex-1">
            <p className="t-body">Es un traspaso</p>
            <p className="t-footnote text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
              Movimiento entre cuentas tuyas. No cuenta como gasto ni como ingreso.
            </p>
          </div>
          <Switch checked={isTransfer} onChange={setIsTransfer} label="Es un traspaso" />
        </div>

        {!isTransfer && (
          <>
            <Segmented
              ariaLabel="Tipo"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: 'Gasto' },
                { value: 'income', label: 'Ingreso' },
              ]}
            />

            <div>
              <label htmlFor="edit-amount" className="t-subhead font-medium block mb-2">
                Importe
              </label>
              <input
                id="edit-amount"
                className="w-full px-4 py-3.5 rounded-[14px] num font-bold outline-none border"
                style={{ ...inputStyle, fontSize: '22px' }}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div>
              <p className="t-subhead font-medium mb-2">Categoría</p>
              <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto">
                {pickable.map((c) => (
                  <CategoryChip
                    key={c.id}
                    category={c}
                    selected={categoryId === c.id}
                    onSelect={() => setCategoryId(categoryId === c.id ? null : c.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="t-body">Fuera del presupuesto</p>
                <p className="t-footnote text-[var(--text-tertiary)]">
                  No cuenta para los topes mensuales
                </p>
              </div>
              <Switch checked={excluded} onChange={setExcluded} label="Fuera del presupuesto" />
            </div>

            {kind === 'expense' && (
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                >
                  <Repeat size={17} />
                </div>
                <div className="flex-1">
                  <p className="t-body">Es una suscripción</p>
                  <p className="t-footnote text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                    Aparecerá en Suscripciones aunque todavía no se repita.
                  </p>
                </div>
                <Switch
                  checked={isSubscription}
                  onChange={setIsSubscription}
                  label="Es una suscripción"
                />
              </div>
            )}
          </>
        )}

        {showPaidBy && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users size={15} className="text-[var(--text-tertiary)]" />
              <p className="t-subhead font-medium">¿Quién pagó?</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PayerChip label="Sin indicar" selected={paidBy === null} onSelect={() => setPaidBy(null)} />
              {(members ?? []).map((m) => (
                <PayerChip
                  key={m.user_id}
                  label={m.display_name}
                  selected={paidBy === m.user_id}
                  onSelect={() => setPaidBy(m.user_id)}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
            {error}
          </p>
        )}

        <Button size="lg" fullWidth loading={save.isPending} onClick={() => save.mutate()}>
          Guardar
        </Button>

        <Button
          variant="destructive"
          fullWidth
          loading={remove.isPending}
          onClick={() => {
            if (confirm('¿Borrar este movimiento?')) remove.mutate()
          }}
        >
          <Trash2 size={16} /> Borrar
        </Button>
      </div>
    </Sheet>
  )
}

function PayerChip({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className="px-3.5 py-2 rounded-full t-footnote font-medium border transition-all active:scale-95"
      style={{
        borderColor: selected ? 'var(--accent)' : 'var(--separator-opaque)',
        backgroundColor: selected ? 'var(--accent-soft)' : 'transparent',
        color: selected ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  )
}

function CategoryChip({
  category,
  selected,
  onSelect,
}: {
  category: Category
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className="px-3 py-2 rounded-full t-footnote font-medium border transition-all active:scale-95 flex items-center gap-1.5"
      style={{
        borderColor: selected ? category.color : 'var(--separator-opaque)',
        backgroundColor: selected
          ? `color-mix(in srgb, ${category.color} 16%, transparent)`
          : 'transparent',
        color: selected ? category.color : 'var(--text-secondary)',
      }}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
      {category.name}
    </button>
  )
}
