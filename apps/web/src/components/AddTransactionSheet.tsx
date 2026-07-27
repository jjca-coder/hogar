import { useEffect, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import { parseAmountToMinor, type Category } from '@aurora/shared'
import { humanError } from '@/lib/supabase'
import { useAccounts, useCategories, useCreateTransaction } from '@/lib/queries'
import { Button, Segmented, Sheet, Switch } from '@/design-system/primitives'

const LAST_USED_KEY = 'aurora.lastTransactionDefaults'

interface Defaults {
  accountId?: string
  isShared?: boolean
}

function readDefaults(): Defaults {
  try {
    const raw = localStorage.getItem(LAST_USED_KEY)
    return raw ? (JSON.parse(raw) as Defaults) : {}
  } catch {
    return {}
  }
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

/**
 * Alta rápida. El objetivo es que el caso normal (gasto de hoy, cuenta de
 * siempre) se resuelva en tres toques: importe, categoría, guardar.
 */
export default function AddTransactionSheet({ open, onClose, onSaved }: Props) {
  const { data: accounts } = useAccounts()
  const { data: categories } = useCategories()
  const create = useCreateTransaction()

  const [kind, setKind] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string>('')
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [isShared, setIsShared] = useState(true)
  const [error, setError] = useState('')
  const amountRef = useRef<HTMLInputElement>(null)

  // Categorías hoja (las que tienen padre) del tipo elegido: son las que se asignan
  const pickable = useMemo(() => {
    const all = categories ?? []
    const wanted = kind === 'expense' ? 'expense' : 'income'
    return all.filter((c) => c.kind === wanted && c.parent_id !== null)
  }, [categories, kind])

  useEffect(() => {
    if (!open) return
    const d = readDefaults()
    const list = accounts ?? []
    setAccountId(
      d.accountId && list.some((a) => a.id === d.accountId) ? d.accountId : (list[0]?.id ?? ''),
    )
    setIsShared(d.isShared ?? true)
    setError('')
    setAmount('')
    setDescription('')
    setDate(format(new Date(), 'yyyy-MM-dd'))
    // El teclado numérico debe salir solo: es el primer gesto del usuario
    setTimeout(() => amountRef.current?.focus(), 260)
  }, [open, accounts])

  useEffect(() => {
    setCategoryId(null)
  }, [kind])

  const submit = async () => {
    const minor = parseAmountToMinor(amount)
    if (minor === null || minor === 0) {
      setError('Escribe un importe, por ejemplo 12,50')
      return
    }
    if (!accountId) {
      setError('Necesitas crear una cuenta antes de anotar movimientos.')
      return
    }
    setError('')
    try {
      await create.mutateAsync({
        account_id: accountId,
        booked_at: date,
        // El signo lo pone el tipo, no el usuario: menos errores.
        amount: kind === 'expense' ? -Math.abs(minor) : Math.abs(minor),
        clean_description: description.trim(),
        category_id: categoryId,
        is_shared: isShared,
      })
      localStorage.setItem(LAST_USED_KEY, JSON.stringify({ accountId, isShared }))
      onSaved?.()
      onClose()
    } catch (e) {
      setError(humanError(e))
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--bg-inset)',
    borderColor: 'transparent',
  }

  return (
    <Sheet open={open} onClose={onClose} title="Nuevo movimiento">
      <div className="space-y-5">
        <Segmented
          ariaLabel="Tipo de movimiento"
          value={kind}
          onChange={(v) => setKind(v)}
          options={[
            { value: 'expense', label: 'Gasto' },
            { value: 'income', label: 'Ingreso' },
          ]}
        />

        <div className="relative">
          <input
            ref={amountRef}
            className="w-full px-4 py-5 rounded-[16px] num font-bold outline-none border text-center"
            style={{ ...inputStyle, fontSize: '38px' }}
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Importe"
          />
          <span
            className="absolute right-5 top-1/2 -translate-y-1/2 t-title-2 font-bold"
            style={{ color: 'var(--text-quaternary)' }}
          >
            €
          </span>
        </div>

        <input
          className="w-full px-4 py-3.5 rounded-[14px] t-body outline-none border"
          style={inputStyle}
          placeholder="¿En qué? (opcional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Descripción"
        />

        <div>
          <p className="t-subhead font-medium mb-2">Categoría</p>
          <div className="flex flex-wrap gap-2 max-h-[168px] overflow-y-auto">
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tx-date" className="t-subhead font-medium block mb-2">
              Fecha
            </label>
            <input
              id="tx-date"
              type="date"
              className="w-full px-3 py-2.5 rounded-[12px] t-subhead outline-none border"
              style={inputStyle}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="tx-account" className="t-subhead font-medium block mb-2">
              Cuenta
            </label>
            <select
              id="tx-account"
              className="w-full px-3 py-2.5 rounded-[12px] t-subhead outline-none border"
              style={inputStyle}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {kind === 'expense' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="t-body">Gasto compartido</p>
              <p className="t-footnote text-[var(--text-tertiary)]">Se reparte a medias</p>
            </div>
            <Switch checked={isShared} onChange={setIsShared} label="Gasto compartido" />
          </div>
        )}

        {error && (
          <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
            {error}
          </p>
        )}

        <Button size="lg" fullWidth loading={create.isPending} onClick={submit}>
          Guardar
        </Button>
      </div>
    </Sheet>
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
