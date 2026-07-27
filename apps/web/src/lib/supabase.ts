import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env['VITE_SUPABASE_URL']
const key = import.meta.env['VITE_SUPABASE_ANON_KEY']

export const isConfigured =
  typeof url === 'string' && typeof key === 'string' && !url.includes('TU-PROYECTO')

/**
 * Cliente único. Solo lleva la clave pública: cualquier operación con secretos
 * (agregador bancario) va por Edge Functions. Ver docs/banking.md.
 */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/** Usar solo donde la app ya garantiza que está configurado. */
export function sb(): SupabaseClient {
  if (!supabase) throw new Error('Supabase no está configurado: revisa el archivo .env')
  return supabase
}

/**
 * Traduce los errores de Supabase a algo que una persona entienda.
 * Regla de calidad nº6: nunca una traza técnica en pantalla.
 */
export function humanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const map: Array<[RegExp, string]> = [
    [/Invalid login credentials/i, 'El email o la contraseña no son correctos.'],
    [/Email not confirmed/i, 'Falta confirmar tu correo. Revisa tu bandeja de entrada.'],
    [/already registered|already been registered/i, 'Ese email ya tiene cuenta. Prueba a entrar.'],
    [/signups? (are |is )?disabled/i, 'Los registros están desactivados ahora mismo.'],
    [/Password should be at least/i, 'La contraseña debe tener al menos 6 caracteres.'],
    [/rate limit|too many requests/i, 'Demasiados intentos. Espera un momento y vuelve a probar.'],
    [/invitation_invalid/i, 'Ese código no vale o ha caducado.'],
    [/violates row-level security/i, 'No tienes permiso para hacer esto.'],
    [/duplicate key|already exists/i, 'Eso ya existe.'],
    [/Failed to fetch|NetworkError/i, 'Sin conexión. Comprueba tu internet.'],
  ]
  for (const [pattern, message] of map) {
    if (pattern.test(raw)) return message
  }
  return raw || 'Algo ha ido mal. Inténtalo de nuevo.'
}
