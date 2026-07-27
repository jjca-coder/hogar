import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { Check } from 'lucide-react'
import { formatMoney, type Money } from '@aurora/shared'

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ============================================================
// Botón
// ============================================================

type ButtonVariant = 'filled' | 'tinted' | 'plain' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
}

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 t-footnote rounded-[10px]',
  md: 'px-4 py-2.5 t-callout rounded-xl',
  lg: 'px-5 py-3.5 t-headline rounded-[14px]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'filled', size = 'md', fullWidth, loading, className, children, disabled, ...rest },
  ref,
) {
  const styles: Record<ButtonVariant, string> = {
    filled: 'text-[var(--text-on-accent)]',
    tinted: 'text-[var(--accent)]',
    plain: 'text-[var(--accent)]',
    destructive: 'text-[var(--expense)]',
  }
  const backgrounds: Record<ButtonVariant, string | undefined> = {
    filled: 'var(--accent)',
    tinted: 'var(--accent-soft)',
    plain: undefined,
    destructive: 'color-mix(in srgb, var(--expense) 12%, transparent)',
  }

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold',
        'transition-[transform,opacity,background-color] duration-150',
        'active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none',
        BUTTON_SIZES[size],
        styles[variant],
        fullWidth && 'w-full',
        className,
      )}
      style={backgrounds[variant] ? { backgroundColor: backgrounds[variant] } : undefined}
      {...rest}
    >
      {loading && (
        <span
          className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  )
})

// ============================================================
// Superficies
// ============================================================

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean
}

export function Card({ padded = true, className, children, ...rest }: CardProps) {
  return (
    <div className={cx('surface', padded && 'p-4', className)} {...rest}>
      {children}
    </div>
  )
}

export function InsetList({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('inset-list', className)} {...rest}>
      {children}
    </div>
  )
}

interface RowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
}

export function Row({ leading, title, subtitle, trailing, className, ...rest }: RowProps) {
  return (
    <div className={cx('inset-row', className)} {...rest}>
      {leading}
      <div className="flex-1 min-w-0">
        <div className="t-body truncate">{title}</div>
        {subtitle && (
          <div className="t-footnote text-[var(--text-tertiary)] truncate mt-0.5">{subtitle}</div>
        )}
      </div>
      {trailing}
    </div>
  )
}

// ============================================================
// Controles
// ============================================================

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>
  value: T
  onChange: (v: T) => void
  ariaLabel?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="relative flex gap-0.5 p-0.5 rounded-[10px] surface-inset"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className="relative flex-1 px-3 py-1.5 t-subhead font-medium rounded-lg transition-colors"
            style={{ color: active ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
          >
            {active && (
              <motion.span
                layoutId={`segmented-${ariaLabel ?? 'default'}`}
                className="absolute inset-0 rounded-lg"
                style={{ backgroundColor: 'var(--bg-elevated)', boxShadow: 'var(--shadow-sm)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative w-[51px] h-[31px] rounded-full transition-colors duration-200 disabled:opacity-40 shrink-0"
      style={{ backgroundColor: checked ? 'var(--accent)' : 'var(--bg-inset)' }}
    >
      <motion.span
        className="absolute top-[2px] w-[27px] h-[27px] rounded-full bg-white"
        style={{ boxShadow: '0 2px 6px rgb(0 0 0 / 0.2)' }}
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: 'spring', stiffness: 600, damping: 34 }}
      />
    </button>
  )
}

interface CheckboxProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}

export function Checkbox({ checked, onChange, label }: CheckboxProps) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center shrink-0 transition-all active:scale-90"
      style={{
        borderColor: checked ? 'var(--accent)' : 'var(--separator-opaque)',
        backgroundColor: checked ? 'var(--accent)' : 'transparent',
      }}
    >
      {checked && <Check size={13} strokeWidth={3.5} className="text-white" />}
    </button>
  )
}

// ============================================================
// Presentación de datos
// ============================================================

interface AmountProps {
  value: Money
  /** Colorea según signo: verde ingreso, rojo gasto. */
  colored?: boolean
  signed?: boolean
  compact?: boolean
  className?: string
}

export function Amount({ value, colored, signed, compact, className }: AmountProps) {
  const color = !colored
    ? undefined
    : value.amount > 0
      ? 'var(--income)'
      : value.amount < 0
        ? 'var(--expense)'
        : 'var(--text-tertiary)'

  return (
    <span className={cx('num sensitive', className)} style={color ? { color } : undefined}>
      {formatMoney(value, { signed: signed ?? false, compact: compact ?? false })}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'income' | 'expense' | 'warning'
}) {
  const colors = {
    neutral: 'var(--text-tertiary)',
    accent: 'var(--accent)',
    income: 'var(--income)',
    expense: 'var(--expense)',
    warning: 'var(--warning)',
  } as const
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full t-caption-2 font-semibold"
      style={{
        color: colors[tone],
        backgroundColor: `color-mix(in srgb, ${colors[tone]} 14%, transparent)`,
      }}
    >
      {children}
    </span>
  )
}

// ============================================================
// Estados
// ============================================================

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx('rounded-lg animate-pulse', className)}
      style={{ backgroundColor: 'var(--bg-inset)' }}
      aria-hidden
    />
  )
}

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      {icon && <div className="mb-4 text-[var(--text-quaternary)]">{icon}</div>}
      <p className="t-headline">{title}</p>
      {description && (
        <p className="t-subhead text-[var(--text-tertiary)] mt-1.5 max-w-[38ch]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ============================================================
// Hoja modal (sheet)
// ============================================================

interface SheetProps extends Omit<HTMLMotionProps<'div'>, 'title'> {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

export function Sheet({ open, onClose, title, children }: SheetProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <motion.div
        className="absolute inset-0 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        className="relative z-10 w-full max-w-lg max-h-[92dvh] overflow-y-auto p-5 safe-bottom
                   rounded-t-[28px] sm:rounded-[28px]"
        style={{ backgroundColor: 'var(--bg-elevated)' }}
        initial={{ y: '100%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
        // Sin esto, un clic dentro de la hoja podía llegar al overlay y cerrarla.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[var(--separator-opaque)] sm:hidden" />
        {title && <h2 className="t-title-3 mb-4">{title}</h2>}
        {children}
      </motion.div>
    </div>
  )
}
