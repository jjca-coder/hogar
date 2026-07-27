import { useState } from 'react'
import { Landmark, Plus, ShoppingCart, Sparkles, Wallet } from 'lucide-react'
import { money } from '@aurora/shared'
import {
  Amount,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  InsetList,
  Row,
  Segmented,
  Sheet,
  Skeleton,
  Switch,
} from '@/design-system/primitives'
import { ACCENTS, useTheme, type AccentId } from '@/design-system/theme'
import type { Density, Theme } from '@aurora/shared'

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="t-title-3">{title}</h2>
        {subtitle && <p className="t-footnote text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

const TYPE_SCALE = [
  { cls: 't-large-title', name: 'Large Title', size: '34' },
  { cls: 't-title-1', name: 'Title 1', size: '28' },
  { cls: 't-title-2', name: 'Title 2', size: '22' },
  { cls: 't-title-3', name: 'Title 3', size: '20' },
  { cls: 't-headline', name: 'Headline', size: '17 semibold' },
  { cls: 't-body', name: 'Body', size: '17' },
  { cls: 't-callout', name: 'Callout', size: '16' },
  { cls: 't-subhead', name: 'Subhead', size: '15' },
  { cls: 't-footnote', name: 'Footnote', size: '13' },
  { cls: 't-caption', name: 'Caption', size: '12' },
] as const

const SEMANTIC_COLORS = [
  { name: 'Ingreso', varName: '--income' },
  { name: 'Gasto', varName: '--expense' },
  { name: 'Traspaso', varName: '--transfer' },
  { name: 'Aviso', varName: '--warning' },
  { name: 'Acento', varName: '--accent' },
] as const

export default function DesignSystem() {
  const {
    theme,
    setTheme,
    accent,
    setAccent,
    density,
    setDensity,
    fontScale,
    setFontScale,
    hideAmounts,
    toggleHideAmounts,
  } = useTheme()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [switchOn, setSwitchOn] = useState(true)
  const [checked, setChecked] = useState(false)
  const [tab, setTab] = useState<'todos' | 'gastos' | 'ingresos'>('todos')

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-10 pb-24">
      <header>
        <p className="t-footnote text-[var(--text-tertiary)] uppercase tracking-wider font-semibold">
          Aurora
        </p>
        <h1 className="t-large-title mt-1">Sistema de diseño</h1>
        <p className="t-body text-[var(--text-secondary)] mt-2">
          Tokens y componentes base. Todo lo que se construya en Aurora sale de aquí.
        </p>
      </header>

      <Section title="Apariencia" subtitle="Estos ajustes se guardan y afectan a toda la app">
        <Card className="space-y-5">
          <div>
            <p className="t-subhead font-medium mb-2">Tema</p>
            <Segmented
              ariaLabel="Tema"
              value={theme}
              onChange={(v) => setTheme(v as Theme)}
              options={[
                { value: 'light', label: 'Claro' },
                { value: 'dark', label: 'Oscuro' },
                { value: 'auto', label: 'Automático' },
              ]}
            />
          </div>

          <div>
            <p className="t-subhead font-medium mb-2">Color de acento</p>
            <div className="flex flex-wrap gap-2.5">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id as AccentId)}
                  aria-label={a.label}
                  aria-pressed={accent === a.id}
                  className="w-9 h-9 rounded-full transition-transform active:scale-90"
                  style={{
                    backgroundColor: a.value,
                    boxShadow:
                      accent === a.id
                        ? '0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--text-primary)'
                        : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="t-subhead font-medium mb-2">Densidad</p>
            <Segmented
              ariaLabel="Densidad"
              value={density}
              onChange={(v) => setDensity(v as Density)}
              options={[
                { value: 'comfortable', label: 'Cómoda' },
                { value: 'compact', label: 'Compacta' },
              ]}
            />
          </div>

          <div>
            <p className="t-subhead font-medium mb-2">
              Tamaño de texto{' '}
              <span className="text-[var(--text-tertiary)] num">×{fontScale.toFixed(2)}</span>
            </p>
            <input
              type="range"
              min={0.85}
              max={1.3}
              step={0.05}
              value={fontScale}
              onChange={(e) => setFontScale(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
              aria-label="Tamaño de texto"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="t-subhead font-medium">Ocultar importes</p>
              <p className="t-footnote text-[var(--text-tertiary)]">Modo privacidad</p>
            </div>
            <Switch checked={hideAmounts} onChange={toggleHideAmounts} label="Ocultar importes" />
          </div>
        </Card>
      </Section>

      <Section title="Tipografía" subtitle="Escala de Apple, escalable por el usuario">
        <Card className="space-y-3">
          {TYPE_SCALE.map((t) => (
            <div key={t.cls} className="flex items-baseline justify-between gap-4">
              <span className={t.cls}>{t.name}</span>
              <span className="t-caption text-[var(--text-quaternary)] num shrink-0">{t.size}</span>
            </div>
          ))}
        </Card>
      </Section>

      <Section title="Color semántico" subtitle="El color solo significa, nunca decora">
        <Card>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SEMANTIC_COLORS.map((c) => (
              <div key={c.name} className="space-y-1.5">
                <div className="h-12 rounded-xl" style={{ backgroundColor: `var(${c.varName})` }} />
                <p className="t-caption text-[var(--text-secondary)]">{c.name}</p>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="Importes" subtitle="Siempre en cifras tabulares y formato español">
        <Card className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="t-subhead text-[var(--text-secondary)]">Gasto</span>
            <Amount value={money(-124050)} colored className="t-title-3" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="t-subhead text-[var(--text-secondary)]">Ingreso</span>
            <Amount value={money(265000)} colored signed className="t-title-3" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="t-subhead text-[var(--text-secondary)]">Patrimonio (compacto)</span>
            <Amount value={money(3522145)} compact className="t-title-3" />
          </div>
        </Card>
      </Section>

      <Section title="Botones">
        <Card className="flex flex-wrap gap-3">
          <Button>Guardar</Button>
          <Button variant="tinted">Añadir</Button>
          <Button variant="plain">Cancelar</Button>
          <Button variant="destructive">Borrar</Button>
          <Button loading>Cargando</Button>
          <Button disabled>Deshabilitado</Button>
        </Card>
        <Card className="flex flex-wrap items-center gap-3">
          <Button size="sm">Pequeño</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
        </Card>
      </Section>

      <Section title="Controles">
        <Card className="space-y-5">
          <Segmented
            ariaLabel="Filtro"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'gastos', label: 'Gastos' },
              { value: 'ingresos', label: 'Ingresos' },
            ]}
          />
          <div className="flex items-center justify-between">
            <span className="t-body">Interruptor</span>
            <Switch checked={switchOn} onChange={setSwitchOn} label="Ejemplo" />
          </div>
          <div className="flex items-center gap-3">
            <Checkbox checked={checked} onChange={setChecked} label="Ejemplo" />
            <span className="t-body">Casilla de verificación</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Acento</Badge>
            <Badge tone="income">Ingreso</Badge>
            <Badge tone="expense">Atrasado</Badge>
            <Badge tone="warning">Aviso</Badge>
          </div>
        </Card>
      </Section>

      <Section title="Listas agrupadas" subtitle="Patrón de Ajustes de iOS">
        <InsetList>
          <Row
            leading={
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-[var(--bg-inset)]">
                <ShoppingCart size={17} className="text-[var(--text-secondary)]" />
              </div>
            }
            title="Mercadona"
            subtitle="Supermercado · hoy"
            trailing={<Amount value={money(-6430)} />}
          />
          <Row
            leading={
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-[var(--bg-inset)]">
                <Wallet size={17} className="text-[var(--text-secondary)]" />
              </div>
            }
            title="Nómina"
            subtitle="Ingresos · 1 jul"
            trailing={<Amount value={money(165000)} colored signed />}
          />
          <Row
            leading={
              <div className="w-9 h-9 rounded-[10px] flex items-center justify-center bg-[var(--bg-inset)]">
                <Landmark size={17} className="text-[var(--text-secondary)]" />
              </div>
            }
            title="Cuenta nómina"
            subtitle="BBVA ·  ···· 4471"
            trailing={<Amount value={money(324055)} />}
          />
        </InsetList>
      </Section>

      <Section title="Estados" subtitle="Cargando, vacío y hoja modal">
        <Card className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </Card>

        <Card padded={false}>
          <EmptyState
            icon={<Sparkles size={30} />}
            title="Aún no hay nada por aquí"
            description="Los estados vacíos enseñan a usar la app en vez de dejarte en blanco."
            action={<Button variant="tinted">Crear el primero</Button>}
          />
        </Card>

        <Button variant="tinted" onClick={() => setSheetOpen(true)}>
          <Plus size={16} /> Abrir hoja modal
        </Button>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Hoja modal">
          <p className="t-body text-[var(--text-secondary)]">
            Entra deslizando desde abajo con una animación de muelle. En móvil ocupa el ancho
            completo; en escritorio se centra.
          </p>
          <div className="flex gap-3 mt-6">
            <Button fullWidth onClick={() => setSheetOpen(false)}>
              Aceptar
            </Button>
            <Button variant="plain" fullWidth onClick={() => setSheetOpen(false)}>
              Cancelar
            </Button>
          </div>
        </Sheet>
      </Section>
    </div>
  )
}
