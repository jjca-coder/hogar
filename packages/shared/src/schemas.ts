import { z } from 'zod'
import {
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  HABIT_FREQUENCIES,
  HABIT_UNITS,
  HOUSEHOLD_ROLES,
  TASK_PRIORITIES,
  TRANSACTION_SOURCES,
  TRANSACTION_STATUSES,
} from './types'
import { CURRENCIES } from './money'

/**
 * Validación compartida entre cliente y Edge Functions (regla de calidad nº1).
 * Los importes llegan SIEMPRE en unidades mínimas y como entero.
 */

export const currencySchema = z.enum(CURRENCIES)
export const uuidSchema = z.string().uuid('Identificador no válido')
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato AAAA-MM-DD')

export const minorAmountSchema = z
  .number()
  .int('El importe debe ser un entero en céntimos')
  .finite()

// ---------- Identidad ----------

export const householdRoleSchema = z.enum(HOUSEHOLD_ROLES)

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre al hogar').max(60),
  base_currency: currencySchema.default('EUR'),
})

export const inviteSchema = z.object({
  role: householdRoleSchema.default('adult'),
  email: z.string().email('Email no válido').optional(),
})

export const acceptInvitationSchema = z.object({
  code: z.string().trim().toUpperCase().length(8, 'El código tiene 8 caracteres'),
})

// ---------- Finanzas ----------

export const accountTypeSchema = z.enum(ACCOUNT_TYPES)

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre a la cuenta').max(60),
  type: accountTypeSchema,
  currency: currencySchema.default('EUR'),
  current_balance: minorAmountSchema.default(0),
  institution_id: uuidSchema.nullable().optional(),
  iban_last4: z
    .string()
    .regex(/^[0-9A-Z]{4}$/, 'Deben ser los 4 últimos caracteres')
    .nullable()
    .optional(),
  include_in_net_worth: z.boolean().default(true),
  owner_id: uuidSchema.nullable().optional(),
})

export const createTransactionSchema = z.object({
  account_id: uuidSchema,
  booked_at: isoDateSchema,
  value_date: isoDateSchema.nullable().optional(),
  amount: minorAmountSchema.refine((v) => v !== 0, 'El importe no puede ser cero'),
  currency: currencySchema.default('EUR'),
  raw_description: z.string().trim().max(300).default(''),
  clean_description: z.string().trim().max(120).nullable().optional(),
  category_id: uuidSchema.nullable().optional(),
  merchant_id: uuidSchema.nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  is_transfer: z.boolean().default(false),
  status: z.enum(TRANSACTION_STATUSES).default('booked'),
  source: z.enum(TRANSACTION_SOURCES).default('manual'),
  excluded_from_budget: z.boolean().default(false),
})

/** Un split debe repartir exactamente el importe del movimiento padre. */
export const splitTransactionSchema = z
  .object({
    parent_id: uuidSchema,
    parts: z
      .array(
        z.object({
          amount: minorAmountSchema,
          category_id: uuidSchema.nullable(),
          notes: z.string().max(500).optional(),
        }),
      )
      .min(2, 'Un reparto necesita al menos dos partes'),
    total: minorAmountSchema,
  })
  .refine(
    (v) => v.parts.reduce((sum, p) => sum + p.amount, 0) === v.total,
    'La suma de las partes debe coincidir exactamente con el importe original',
  )

export const categoryKindSchema = z.enum(CATEGORY_KINDS)

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  icon: z.string().default('circle'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color no válido'),
  kind: categoryKindSchema.default('expense'),
  parent_id: uuidSchema.nullable().optional(),
})

// ---------- Motor de reglas ----------

export const ruleConditionSchema = z.object({
  field: z.enum(['description', 'amount', 'account_id', 'merchant_id']),
  op: z.enum(['contains', 'equals', 'starts_with', 'gt', 'lt', 'between']),
  value: z.union([z.string(), z.number(), z.tuple([z.number(), z.number()])]),
})

export const ruleActionsSchema = z.object({
  set_category_id: uuidSchema.optional(),
  set_merchant_id: uuidSchema.optional(),
  rename_to: z.string().max(120).optional(),
  add_tags: z.array(z.string()).optional(),
  mark_transfer: z.boolean().optional(),
  exclude_from_budget: z.boolean().optional(),
})

export const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  conditions: z.array(ruleConditionSchema).min(1, 'Añade al menos una condición'),
  actions: ruleActionsSchema.refine((a) => Object.keys(a).length > 0, 'La regla debe hacer algo'),
  match_all: z.boolean().default(true),
  priority: z.number().int().min(0).max(1000).default(100),
})

// ---------- Hábitos ----------

export const createHabitSchema = z
  .object({
    name: z.string().trim().min(1, 'Ponle un nombre').max(60),
    icon: z.string().default('sparkles'),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    kind: z.enum(['do', 'avoid']).default('do'),
    unit: z.enum(HABIT_UNITS).default('times'),
    target_per_period: z.number().positive().default(1),
    frequency: z.enum(HABIT_FREQUENCIES).default('daily'),
    weekdays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6, 7]),
    target_count: z.number().int().min(1).max(31).default(1),
    interval_days: z.number().int().min(1).max(365).default(1),
    reminder_at: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'La hora debe ser HH:MM')
      .nullable()
      .optional(),
    is_shared: z.boolean().default(false),
  })
  .refine(
    (h) => h.frequency !== 'weekdays' || h.weekdays.length > 0,
    'Elige al menos un día de la semana',
  )

export const habitEntrySchema = z.object({
  habit_id: uuidSchema,
  entry_date: isoDateSchema,
  value: z.number().min(0).default(1),
  note: z.string().max(500).nullable().optional(),
})

// ---------- Tareas ----------

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Escribe algo').max(200),
  notes: z.string().max(10_000).nullable().optional(),
  project_id: uuidSchema.nullable().optional(),
  parent_task_id: uuidSchema.nullable().optional(),
  due_date: isoDateSchema.nullable().optional(),
  planned_date: isoDateSchema.nullable().optional(),
  due_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  priority: z.enum(TASK_PRIORITIES).default('none'),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  rrule: z.string().max(300).nullable().optional(),
  assigned_to: uuidSchema.nullable().optional(),
})

// ---------- Integración bancaria (Edge Functions) ----------

export const createConnectionSchema = z.object({
  institution_id: uuidSchema,
  redirect_url: z.string().url(),
})

export const syncConnectionSchema = z.object({
  connection_id: uuidSchema,
  /** Fuerza la sincronización saltándose la caché; sujeto a rate limit. */
  force: z.boolean().default(false),
})

export type CreateHousehold = z.infer<typeof createHouseholdSchema>
export type CreateAccount = z.infer<typeof createAccountSchema>
export type CreateTransaction = z.infer<typeof createTransactionSchema>
export type CreateRule = z.infer<typeof createRuleSchema>
export type CreateHabit = z.infer<typeof createHabitSchema>
export type CreateTask = z.infer<typeof createTaskSchema>
