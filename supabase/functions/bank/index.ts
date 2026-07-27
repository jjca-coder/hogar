/**
 * Puente con el agregador bancario (Enable Banking, PSD2).
 *
 * Todo pasa por aquí y nunca por el navegador: la clave privada que firma
 * las llamadas vive solo en el entorno de esta función. El cliente solo
 * pide acciones y recibe datos ya normalizados.
 *
 * Acciones:
 *   institutions  lista los bancos de un país
 *   connect       inicia la autorización y devuelve la URL del banco
 *   callback      cierra la autorización y descubre las cuentas
 *   sync          trae saldos y movimientos nuevos
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const API = 'https://api.enablebanking.com'
const APP_ID = Deno.env.get('ENABLE_BANKING_APP_ID') ?? ''
const PRIVATE_KEY_PEM = Deno.env.get('ENABLE_BANKING_PRIVATE_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---------- Firma del JWT ----------

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

const b64url = (data: ArrayBuffer | string): string => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cachedKey: CryptoKey | null = null

async function signingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  if (!PRIVATE_KEY_PEM) throw new Error('Falta la clave privada del agregador bancario')
  cachedKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(PRIVATE_KEY_PEM),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return cachedKey
}

/** JWT RS256 con el Application ID como `kid`, tal y como pide la API. */
async function buildJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: APP_ID }))
  const payload = b64url(
    JSON.stringify({
      iss: 'enablebanking.com',
      aud: 'api.enablebanking.com',
      iat: now,
      exp: now + 3600, // 1 h basta; el máximo permitido son 24
    }),
  )
  const data = `${header}.${payload}`
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await signingKey(),
    new TextEncoder().encode(data),
  )
  return `${data}.${b64url(signature)}`
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await buildJwt()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) {
    // El detalle técnico va al log; al usuario le llega un mensaje legible
    console.error(`Enable Banking ${res.status} en ${path}: ${text}`)
    throw new ApiError(res.status, text)
  }
  return text ? (JSON.parse(text) as T) : ({} as T)
}

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`Error del agregador (${status})`)
  }
}

/** Traduce los fallos del agregador a algo que una persona entienda. */
function humanMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Las credenciales del agregador no son válidas.'
    if (err.status === 403)
      return 'La aplicación del agregador no está activa o no tiene permiso para esto.'
    if (err.status === 404) return 'No he encontrado eso en el banco.'
    if (err.status === 429)
      return 'El banco ha recibido demasiadas peticiones hoy. Prueba dentro de un rato.'
    if (err.status >= 500) return 'El banco no responde ahora mismo. Inténtalo más tarde.'
    return 'El banco ha rechazado la petición.'
  }
  return err instanceof Error ? err.message : 'Algo ha ido mal.'
}

/**
 * Detalle técnico que acompaña al mensaje humano. Se muestra en la app para
 * poder diagnosticar sin tener que ir a buscar los logs del servidor; no
 * contiene secretos, solo la respuesta del agregador.
 */
function technicalDetail(err: unknown): string | null {
  if (err instanceof ApiError) return `${err.status}: ${err.detail.slice(0, 400)}`
  if (err instanceof Error && err.stack) return err.message
  return null
}

// ---------- Tipos del agregador (solo lo que se usa) ----------

interface Aspsp {
  name: string
  country: string
  logo?: string
  psu_types?: string[]
  maximum_consent_validity?: number
}

interface AuthResponse {
  url: string
  authorization_id: string
}

interface SessionAccount {
  uid: string
  account_id?: { iban?: string; other?: { identification?: string } }
  name?: string
  product?: string
  currency?: string
  cash_account_type?: string
}

interface SessionResponse {
  session_id: string
  accounts: SessionAccount[]
  access?: { valid_until?: string }
}

interface Balance {
  balance_amount: { amount: string; currency: string }
  balance_type?: string
}

interface EbTransaction {
  entry_reference?: string
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator: 'CRDT' | 'DBIT'
  booking_date?: string
  value_date?: string
  transaction_date?: string
  remittance_information?: string[]
  creditor?: { name?: string }
  debtor?: { name?: string }
  status?: string
}

/** Importes del agregador: string decimal -> unidades mínimas enteras. */
function toMinor(amount: string): number {
  const n = Number.parseFloat(amount)
  if (!Number.isFinite(n)) throw new Error(`Importe no válido: ${amount}`)
  return Math.round(n * 100)
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ---------- Acciones ----------

async function listInstitutions(country: string) {
  const data = await api<{ aspsps: Aspsp[] }>(`/aspsps?country=${encodeURIComponent(country)}`)
  return (data.aspsps ?? [])
    .map((a) => ({
      name: a.name,
      country: a.country,
      logo: a.logo ?? null,
      maxConsentDays: a.maximum_consent_validity
        ? Math.floor(a.maximum_consent_validity / 86400)
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

async function startConnection(
  bankName: string,
  country: string,
  redirectUrl: string,
  state: string,
) {
  // 90 días es lo que permiten casi todos los bancos sin re-autorizar
  const validUntil = new Date(Date.now() + 89 * 86400_000).toISOString()
  const auth = await api<AuthResponse>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: bankName, country },
      state,
      redirect_url: redirectUrl,
      psu_type: 'personal',
    }),
  })
  return { url: auth.url, authorizationId: auth.authorization_id }
}

async function finishConnection(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  code: string,
  bankName: string,
  country: string,
) {
  const session = await api<SessionResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ code }),
  })

  // La entidad se guarda para poder mostrarla y reconectar después.
  // Si no se puede registrar, se sigue igualmente: perder el logo del banco
  // no justifica tirar abajo una autorización que el usuario ya ha completado.
  let institutionId: string | null = null
  const { data: institution, error: instError } = await supabase
    .from('institutions')
    .upsert(
      { name: bankName, country, provider: 'enablebanking', provider_institution_id: bankName },
      { onConflict: 'provider,provider_institution_id' },
    )
    .select('id')
    .maybeSingle()

  if (instError) {
    console.error('No se pudo registrar la entidad:', instError)
  } else {
    institutionId = (institution?.id as string | undefined) ?? null
  }

  const { data: connection, error: connError } = await supabase
    .from('connections')
    .insert({
      household_id: householdId,
      institution_id: institutionId,
      provider: 'enablebanking',
      provider_ref: session.session_id,
      status: 'active',
      consent_expires_at: session.access?.valid_until ?? null,
      created_by: userId,
    })
    .select('id')
    .single()
  if (connError) throw connError

  const discovered = []
  for (const acc of session.accounts ?? []) {
    const iban = acc.account_id?.iban ?? acc.account_id?.other?.identification ?? ''
    discovered.push({
      household_id: householdId,
      connection_id: connection.id,
      institution_id: institutionId,
      name: acc.name || acc.product || 'Cuenta',
      type: acc.cash_account_type === 'CARD' ? 'credit_card' : 'checking',
      currency: acc.currency ?? 'EUR',
      // Del IBAN solo se guardan los 4 últimos: el completo nunca sale de aquí
      iban_last4: iban ? iban.slice(-4).toUpperCase() : null,
      provider_account_id: acc.uid,
      is_manual: false,
      current_balance: 0,
    })
  }

  if (discovered.length > 0) {
    const { error } = await supabase
      .from('accounts')
      .upsert(discovered, { onConflict: 'connection_id,provider_account_id' })
    if (error) throw error
  }

  return { connectionId: connection.id, accounts: discovered.length }
}

async function syncConnection(supabase: SupabaseClient, connectionId: string) {
  const { data: connection, error } = await supabase
    .from('connections')
    .select('id, provider_ref, household_id')
    .eq('id', connectionId)
    .single()
  if (error) throw error

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, provider_account_id, currency')
    .eq('connection_id', connectionId)
    .not('provider_account_id', 'is', null)

  let inserted = 0

  for (const account of accounts ?? []) {
    const uid = account.provider_account_id as string

    // 1. Saldo
    try {
      const { balances } = await api<{ balances: Balance[] }>(`/accounts/${uid}/balances`)
      const preferred =
        balances.find((b) => b.balance_type === 'CLBD') ??
        balances.find((b) => b.balance_type === 'XPCD') ??
        balances[0]
      if (preferred) {
        await supabase
          .from('accounts')
          .update({ current_balance: toMinor(preferred.balance_amount.amount) })
          .eq('id', account.id)
      }
    } catch (e) {
      console.error(`Saldo de ${uid}:`, e)
    }

    // 2. Movimientos de los últimos 90 días
    const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10)
    const { transactions } = await api<{ transactions: EbTransaction[] }>(
      `/accounts/${uid}/transactions?date_from=${since}`,
    )

    const rows = []
    for (const t of transactions ?? []) {
      const date = t.booking_date ?? t.value_date ?? t.transaction_date
      if (!date) continue

      const magnitude = toMinor(t.transaction_amount.amount)
      const amount =
        t.credit_debit_indicator === 'DBIT' ? -Math.abs(magnitude) : Math.abs(magnitude)
      const description =
        (t.remittance_information ?? []).join(' ').trim() ||
        t.creditor?.name ||
        t.debtor?.name ||
        'Movimiento'

      // Idempotencia: la referencia del banco si existe, si no una huella estable
      const hash = t.entry_reference
        ? `eb:${t.entry_reference}`
        : `eb:${await sha256Hex(`${uid}|${date}|${amount}|${description}`)}`

      rows.push({
        household_id: connection.household_id,
        account_id: account.id,
        booked_at: date,
        value_date: t.value_date ?? null,
        amount,
        amount_base: amount,
        currency: t.transaction_amount.currency ?? account.currency ?? 'EUR',
        raw_description: description,
        clean_description: description,
        status: t.status === 'PDNG' ? 'pending' : 'booked',
        source: 'bank',
        reviewed: false,
        dedup_hash: hash,
        provider_transaction_id: t.entry_reference ?? null,
      })
    }

    if (rows.length > 0) {
      // ignoreDuplicates: reejecutar la sincronización no duplica nada
      const { error: insertError, count } = await supabase.from('transactions').upsert(rows, {
        onConflict: 'account_id,dedup_hash',
        ignoreDuplicates: true,
        count: 'exact',
      })
      if (insertError) throw insertError
      inserted += count ?? 0
    }
  }

  await supabase
    .from('connections')
    .update({ last_synced_at: new Date().toISOString(), last_error: null })
    .eq('id', connectionId)

  return { inserted }
}

// ---------- Entrada ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  try {
    if (!APP_ID || !PRIVATE_KEY_PEM) {
      return json(
        { error: 'Falta configurar las credenciales del agregador bancario en el servidor.' },
        500,
      )
    }

    // La sesión del usuario se valida siempre: nada es anónimo
    const authHeader = req.headers.get('Authorization') ?? ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Necesitas iniciar sesión.' }, 401)

    const body = await req.json()
    const action = body.action as string

    switch (action) {
      case 'institutions':
        return json({ institutions: await listInstitutions(body.country ?? 'ES') })

      case 'connect': {
        const result = await startConnection(
          body.bankName,
          body.country ?? 'ES',
          body.redirectUrl,
          body.state ?? '',
        )
        return json(result)
      }

      case 'callback': {
        // RLS comprueba que el usuario pertenece de verdad a ese hogar
        const { data: membership } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('household_id', body.householdId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (!membership) return json({ error: 'No perteneces a ese hogar.' }, 403)

        return json(
          await finishConnection(
            supabase,
            body.householdId,
            user.id,
            body.code,
            body.bankName,
            body.country ?? 'ES',
          ),
        )
      }

      case 'sync':
        return json(await syncConnection(supabase, body.connectionId))

      default:
        return json({ error: `Acción desconocida: ${action}` }, 400)
    }
  } catch (err) {
    console.error(err)
    return json({ error: humanMessage(err) }, 502)
  }
})
