import { useMemo } from 'react'
import type { Account } from '@aurora/shared'
import { Segmented } from '@/design-system/primitives'
import { SCOPE_LABELS, useScope, type FinanceScope } from '@/lib/scope'

/**
 * Selector Todo / Mío / Conjunto. Solo tiene sentido cuando hay a la vez
 * cuentas personales y conjuntas: si todas son del mismo tipo no se muestra,
 * para no meter ruido en la pantalla.
 */
export default function ScopeSwitcher({ accounts }: { accounts: Account[] | undefined }) {
  const { scope, setScope } = useScope()

  const worthShowing = useMemo(() => {
    const accs = accounts ?? []
    const hasJoint = accs.some((a) => a.owner_id === null)
    const hasPersonal = accs.some((a) => a.owner_id !== null)
    return hasJoint && hasPersonal
  }, [accounts])

  if (!worthShowing) return null

  const options: { value: FinanceScope; label: string }[] = [
    { value: 'all', label: SCOPE_LABELS.all },
    { value: 'mine', label: SCOPE_LABELS.mine },
    { value: 'joint', label: SCOPE_LABELS.joint },
  ]

  return <Segmented ariaLabel="Ámbito del dinero" value={scope} onChange={setScope} options={options} />
}
