import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, LogOut, UserPlus } from 'lucide-react'
import { initials, ROLE_CAPABILITIES, type HouseholdRole } from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { useActiveHousehold, usePermissions, useUserId } from '@/lib/session'
import { Button, Card, EmptyState, InsetList, Sheet, Skeleton } from '@/design-system/primitives'

interface MemberRow {
  user_id: string
  role: HouseholdRole
  profile: { display_name: string; avatar_url: string | null } | null
}

const ROLE_LABELS: Record<HouseholdRole, { name: string; help: string }> = {
  owner: { name: 'Administrador', help: 'Todo, incluido gestionar miembros' },
  adult: { name: 'Adulto', help: 'Ve y edita finanzas, tareas y hábitos' },
  viewer: { name: 'Invitado', help: 'Solo puede mirar, no editar' },
  child: { name: 'Peque', help: 'Tareas y hábitos. No ve las finanzas' },
}

/** Color estable por persona, derivado del id: mismo avatar siempre. */
function avatarColor(id: string): string {
  const palette = ['#0A84FF', '#5E5CE6', '#BF5AF2', '#FF375F', '#FF9F0A', '#30D158', '#40C8E0']
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return palette[hash % palette.length] ?? '#8E8E93'
}

export default function HouseholdSettings() {
  const { membership } = useActiveHousehold()
  const { canManageMembers } = usePermissions()
  const myId = useUserId()
  const queryClient = useQueryClient()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<HouseholdRole>('adult')
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const householdId = membership?.household_id

  const { data: members, isPending } = useQuery({
    queryKey: ['members', householdId],
    enabled: Boolean(householdId),
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await sb()
        .from('household_members')
        .select('user_id, role, profile:profiles(display_name, avatar_url)')
        .eq('household_id', householdId!)
      if (error) throw error
      return (data ?? []) as unknown as MemberRow[]
    },
  })

  const createInvite = useMutation({
    mutationFn: async (role: HouseholdRole) => {
      const { data, error } = await sb()
        .from('invitations')
        .insert({ household_id: householdId!, role })
        .select('code')
        .single()
      if (error) throw error
      return data.code as string
    },
    onSuccess: (code) => {
      setInviteCode(code)
      setError('')
    },
    onError: (e) => setError(humanError(e)),
  })

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: HouseholdRole }) => {
      const { error } = await sb()
        .from('household_members')
        .update({ role })
        .eq('household_id', householdId!)
        .eq('user_id', userId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', householdId] }),
    onError: (e) => setError(humanError(e)),
  })

  const copyCode = async () => {
    if (!inviteCode) return
    await navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  if (!membership) return null

  const owners = members?.filter((m) => m.role === 'owner').length ?? 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8 pb-24">
      <header>
        <p className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)]">
          Hogar
        </p>
        <h1 className="t-large-title mt-1">{membership.household.name}</h1>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="t-title-3">Miembros</h2>
          {canManageMembers && (
            <Button
              size="sm"
              variant="tinted"
              onClick={() => {
                setInviteOpen(true)
                setInviteCode(null)
              }}
            >
              <UserPlus size={15} /> Invitar
            </Button>
          )}
        </div>

        {isPending ? (
          <Card className="space-y-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </Card>
        ) : (
          <InsetList>
            {(members ?? []).map((m) => {
              const isMe = m.user_id === myId
              const name = m.profile?.display_name || 'Sin nombre'
              // No se permite quedarse sin ningún administrador
              const canEdit = canManageMembers && !(m.role === 'owner' && owners <= 1)
              return (
                <div key={m.user_id} className="inset-row">
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center t-subhead font-semibold text-white shrink-0"
                    style={{ backgroundColor: avatarColor(m.user_id) }}
                  >
                    {initials(name)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="t-body truncate">
                      {name}
                      {isMe && <span className="text-[var(--text-tertiary)]"> · tú</span>}
                    </p>
                    <p className="t-footnote text-[var(--text-tertiary)]">
                      {ROLE_CAPABILITIES[m.role].finances === 'none'
                        ? 'Sin acceso a finanzas'
                        : ROLE_LABELS[m.role].help}
                    </p>
                  </div>
                  {canEdit ? (
                    <select
                      className="t-footnote font-medium rounded-lg px-2 py-1.5 outline-none border"
                      style={{
                        backgroundColor: 'var(--bg-inset)',
                        borderColor: 'var(--separator-opaque)',
                        color: 'var(--text-secondary)',
                      }}
                      value={m.role}
                      onChange={(e) =>
                        changeRole.mutate({
                          userId: m.user_id,
                          role: e.target.value as HouseholdRole,
                        })
                      }
                      aria-label={`Rol de ${name}`}
                    >
                      {(Object.keys(ROLE_LABELS) as HouseholdRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r].name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="t-footnote text-[var(--text-tertiary)]">
                      {ROLE_LABELS[m.role].name}
                    </span>
                  )}
                </div>
              )
            })}
          </InsetList>
        )}

        {error && (
          <p className="t-subhead px-1" style={{ color: 'var(--expense)' }} role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="t-title-3 px-1">Sesión</h2>
        <Card padded={false}>
          <button
            onClick={() => sb().auth.signOut()}
            className="w-full inset-row justify-center"
            style={{ color: 'var(--expense)' }}
          >
            <LogOut size={17} />
            <span className="t-body font-medium">Cerrar sesión</span>
          </button>
        </Card>
      </section>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invitar a alguien">
        {inviteCode ? (
          <div className="space-y-5">
            <p className="t-body text-[var(--text-secondary)]">
              Pásale este código. Caduca en 14 días y solo sirve una vez.
            </p>
            <button
              onClick={copyCode}
              className="w-full py-6 rounded-[18px] num font-bold flex items-center justify-center gap-3"
              style={{
                backgroundColor: 'var(--bg-inset)',
                fontSize: '30px',
                letterSpacing: '0.2em',
              }}
            >
              {inviteCode}
              {copied ? (
                <Check size={20} style={{ color: 'var(--income)' }} />
              ) : (
                <Copy size={20} className="text-[var(--text-tertiary)]" />
              )}
            </button>
            <Button fullWidth onClick={() => setInviteOpen(false)}>
              Listo
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="t-subhead font-medium mb-2">¿Con qué permisos?</p>
              <div className="space-y-2">
                {(Object.keys(ROLE_LABELS) as HouseholdRole[])
                  .filter((r) => r !== 'owner')
                  .map((r) => (
                    <button
                      key={r}
                      onClick={() => setInviteRole(r)}
                      className="w-full p-3.5 rounded-[14px] border text-left transition-colors"
                      style={{
                        borderColor: inviteRole === r ? 'var(--accent)' : 'var(--separator-opaque)',
                        backgroundColor: inviteRole === r ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      <p className="t-headline">{ROLE_LABELS[r].name}</p>
                      <p className="t-footnote text-[var(--text-tertiary)] mt-0.5">
                        {ROLE_LABELS[r].help}
                      </p>
                    </button>
                  ))}
              </div>
            </div>
            <Button
              fullWidth
              size="lg"
              loading={createInvite.isPending}
              onClick={() => createInvite.mutate(inviteRole)}
            >
              Generar código
            </Button>
          </div>
        )}
      </Sheet>

      {members?.length === 1 && !inviteOpen && canManageMembers && (
        <Card padded={false}>
          <EmptyState
            icon={<UserPlus size={28} />}
            title="Estás solo por aquí"
            description="Invita a tu pareja o a quien comparta gastos contigo para llevarlo todo junto."
            action={
              <Button variant="tinted" onClick={() => setInviteOpen(true)}>
                Invitar a alguien
              </Button>
            }
          />
        </Card>
      )}
    </div>
  )
}
