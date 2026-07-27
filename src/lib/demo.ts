// Modo demo: cliente Supabase falso con datos de ejemplo en memoria.
// Se activa desde la pantalla de configuración cuando no hay .env.
import { addDays, format, startOfMonth, subDays } from 'date-fns'

export const DEMO_FLAG = 'hogar-demo'

const iso = (d: Date) => format(d, 'yyyy-MM-dd')
const today = () => new Date()

const UID = 'u-jesus'
const PARTNER = 'u-ana'
const HH = 'h-demo'

type Row = Record<string, unknown>

function buildStore(): Record<string, Row[]> {
  const t = today()
  const monthStart = startOfMonth(t)

  const categories: Row[] = [
    ['c1', 'Supermercado', '🛒', 'expense', 1],
    ['c2', 'Restaurantes', '🍽️', 'expense', 2],
    ['c3', 'Casa', '🏠', 'expense', 3],
    ['c4', 'Suministros', '💡', 'expense', 4],
    ['c5', 'Transporte', '🚗', 'expense', 5],
    ['c6', 'Ocio', '🎬', 'expense', 6],
    ['c7', 'Salud', '⚕️', 'expense', 7],
    ['c8', 'Ropa', '👕', 'expense', 8],
    ['c9', 'Suscripciones', '📺', 'expense', 9],
    ['c10', 'Viajes', '✈️', 'expense', 10],
    ['c11', 'Regalos', '🎁', 'expense', 11],
    ['c12', 'Otros', '📦', 'expense', 12],
    ['c13', 'Nómina', '💼', 'income', 1],
    ['c14', 'Otros ingresos', '💶', 'income', 2],
  ].map(([id, name, emoji, kind, sort]) => ({ id, household_id: HH, name, emoji, kind, sort }))

  let n = 0
  const tx = (
    daysAgo: number,
    cat: string,
    desc: string,
    eur: number,
    paidBy: string,
    shared = true,
    kind = 'expense',
  ): Row => ({
    id: `t${n++}`,
    household_id: HH,
    category_id: cat,
    description: desc,
    amount_cents: Math.round(eur * 100),
    kind,
    paid_by: paidBy,
    is_shared: shared,
    date: iso(subDays(t, daysAgo)),
    created_by: paidBy,
    created_at: subDays(t, daysAgo).toISOString(),
  })

  const transactions: Row[] = [
    { ...tx(0, 'c1', 'Mercadona', 64.3, UID) },
    { ...tx(0, 'c6', 'Cine', 16.0, PARTNER) },
    { ...tx(1, 'c2', 'Cena italiano', 54.4, PARTNER) },
    { ...tx(2, 'c1', 'Frutería', 18.75, PARTNER) },
    { ...tx(3, 'c5', 'Gasolina', 60.0, UID, false) },
    { ...tx(4, 'c9', 'Netflix', 17.99, PARTNER) },
    { ...tx(5, 'c7', 'Farmacia', 12.4, UID) },
    { ...tx(6, 'c1', 'Lidl', 43.6, UID) },
    { ...tx(7, 'c8', 'Zara', 45.95, PARTNER, false) },
    { ...tx(8, 'c10', 'Vuelos agosto', 180.0, UID) },
    { ...tx(9, 'c6', 'Concierto', 70.0, UID) },
    { ...tx(11, 'c4', 'Luz', 62.1, PARTNER) },
    { ...tx(12, 'c12', 'Ikea', 76.5, PARTNER) },
    { ...tx(14, 'c2', 'Brunch', 32.0, UID) },
    { ...tx(2, 'c14', 'Venta Wallapop', 35.0, UID, false, 'income') },
  ]
  // Alquiler e ingresos a día 1 del mes
  transactions.push(
    { ...tx(0, 'c3', 'Alquiler', 950.0, UID), date: iso(monthStart) },
    { ...tx(0, 'c13', 'Nómina', 1650.0, UID, false, 'income'), date: iso(monthStart) },
    { ...tx(0, 'c13', 'Nómina', 1580.0, PARTNER, false, 'income'), date: iso(monthStart) },
  )

  const task = (
    id: string,
    title: string,
    due: string | null,
    assigned: string | null,
    recurrence = 'none',
    doneAt: string | null = null,
  ): Row => ({
    id,
    household_id: HH,
    title,
    notes: null,
    assigned_to: assigned,
    due_date: due,
    recurrence,
    done_at: doneAt,
    created_by: UID,
    created_at: subDays(t, 5).toISOString(),
  })

  const tasks: Row[] = [
    task('k1', 'Poner la lavadora', iso(t), PARTNER),
    task('k2', 'Comprar papel higiénico', iso(t), null),
    task('k3', 'Regar las plantas', iso(subDays(t, 1)), UID, 'weekly'),
    task('k4', 'Limpiar el baño', iso(addDays(t, 1)), UID, 'weekly'),
    task('k5', 'Cambiar sábanas', iso(addDays(t, 3)), PARTNER, 'biweekly'),
    task('k6', 'Llamar al casero por la persiana', null, null),
    task('k7', 'Sacar la basura', iso(subDays(t, 1)), UID, 'none', subDays(t, 1).toISOString()),
  ]

  const habits: Row[] = [
    { id: 'b1', household_id: HH, owner: UID, name: 'Gimnasio', emoji: '💪', archived: false, created_at: subDays(t, 30).toISOString() },
    { id: 'b2', household_id: HH, owner: UID, name: 'Leer 20 min', emoji: '📚', archived: false, created_at: subDays(t, 20).toISOString() },
    { id: 'b3', household_id: HH, owner: PARTNER, name: 'Yoga', emoji: '🧘', archived: false, created_at: subDays(t, 25).toISOString() },
    { id: 'b4', household_id: HH, owner: PARTNER, name: 'Beber 2L de agua', emoji: '💧', archived: false, created_at: subDays(t, 10).toISOString() },
  ]

  const habit_checks: Row[] = []
  const check = (habit: string, daysAgo: number) =>
    habit_checks.push({ habit_id: habit, date: iso(subDays(t, daysAgo)) })
  ;[0, 1, 2, 3, 5, 6, 8].forEach((d) => check('b1', d))
  ;[1, 2, 4, 7].forEach((d) => check('b2', d))
  ;[0, 1, 2, 3, 4, 5].forEach((d) => check('b3', d))
  ;[0, 2, 3].forEach((d) => check('b4', d))

  return {
    profiles: [
      { id: UID, name: 'Jesús', color: '#0f766e' },
      { id: PARTNER, name: 'Ana', color: '#e11d48' },
    ],
    households: [{ id: HH, name: 'Nuestro hogar', invite_code: 'DEMO01', created_by: UID }],
    household_members: [
      { household_id: HH, user_id: UID },
      { household_id: HH, user_id: PARTNER },
    ],
    categories,
    transactions,
    budgets: [],
    tasks,
    habits,
    habit_checks,
  }
}

// ---------- mini query builder compatible con la API de supabase-js ----------

type Result = { data: unknown; error: null }

class DemoQuery implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = []
  private orders: { col: string; asc: boolean; nullsLast: boolean }[] = []
  private limitN?: number
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private wantSingle = false
  private returning = false
  private cols = '*'
  private payload?: Row | Row[]
  private patch?: Row

  constructor(
    private table: string,
    private store: Record<string, Row[]>,
  ) {}

  select(cols = '*') {
    if (this.mode === 'insert') this.returning = true
    else this.cols = cols
    return this
  }
  insert(p: Row | Row[]) {
    this.mode = 'insert'
    this.payload = p
    return this
  }
  update(p: Row) {
    this.mode = 'update'
    this.patch = p
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v)
    return this
  }
  gte(c: string, v: never) {
    this.filters.push((r) => (r[c] as never) >= v)
    return this
  }
  lte(c: string, v: never) {
    this.filters.push((r) => (r[c] as never) <= v)
    return this
  }
  lt(c: string, v: never) {
    this.filters.push((r) => (r[c] as never) < v)
    return this
  }
  is(c: string, v: unknown) {
    this.filters.push((r) => (v === null ? r[c] == null : r[c] === v))
    return this
  }
  not(c: string, op: string, v: unknown) {
    if (op === 'is' && v === null) this.filters.push((r) => r[c] != null)
    return this
  }
  in(c: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[c]))
    return this
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false, nullsLast: !opts?.nullsFirst })
    return this
  }
  limit(n: number) {
    this.limitN = n
    return this
  }
  maybeSingle() {
    this.wantSingle = true
    return this
  }
  single() {
    this.wantSingle = true
    this.returning = true
    return this
  }

  private embed(r: Row): Row {
    const out = { ...r }
    if (this.cols.includes('households(')) {
      out.households = this.store.households.find((h) => h.id === r.household_id) ?? null
    }
    if (this.cols.includes('profiles(')) {
      out.profiles = this.store.profiles.find((p) => p.id === r.user_id) ?? null
    }
    return out
  }

  private exec(): Result {
    const rows = this.store[this.table] ?? []
    const match = (r: Row) => this.filters.every((f) => f(r))

    if (this.mode === 'insert') {
      const arr = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((p) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...(this.table === 'households' ? { invite_code: 'DEMO01', created_by: UID } : {}),
        ...p,
      }))
      rows.push(...arr)
      return { data: this.returning ? (this.wantSingle ? arr[0] : arr) : null, error: null }
    }
    if (this.mode === 'update') {
      rows.filter(match).forEach((r) => Object.assign(r, this.patch))
      return { data: null, error: null }
    }
    if (this.mode === 'delete') {
      this.store[this.table] = rows.filter((r) => !match(r))
      return { data: null, error: null }
    }

    let out = rows.filter(match).map((r) => this.embed(r))
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const av = a[o.col] as never
        const bv = b[o.col] as never
        if (av == null && bv == null) return 0
        if (av == null) return o.nullsLast ? 1 : -1
        if (bv == null) return o.nullsLast ? -1 : 1
        if (av === bv) return 0
        return (av < bv ? -1 : 1) * (o.asc ? 1 : -1)
      })
    }
    if (this.limitN != null) out = out.slice(0, this.limitN)
    if (this.wantSingle) return { data: out[0] ?? null, error: null }
    return { data: out, error: null }
  }

  then<R1 = Result, R2 = never>(
    onfulfilled?: ((value: Result) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
  }
}

export function createDemoClient() {
  const store = buildStore()
  const session = { user: { id: UID, email: 'demo@hogar.app' } }
  return {
    from: (table: string) => new DemoQuery(table, store),
    rpc: async () => ({ data: null, error: { message: 'No disponible en modo demo' } }),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => {
        localStorage.removeItem(DEMO_FLAG)
        location.reload()
        return { error: null }
      },
      signUp: async () => ({ data: {}, error: { message: 'No disponible en modo demo' } }),
      signInWithPassword: async () => ({ data: {}, error: { message: 'No disponible en modo demo' } }),
    },
  }
}
