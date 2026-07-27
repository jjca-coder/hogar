import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, FileUp, Upload } from 'lucide-react'
import {
  mapRows,
  money,
  parseStatement,
  rowFingerprint,
  type ColumnMapping,
  type ParsedRow,
  type RowError,
} from '@aurora/shared'
import { sb, humanError } from '@/lib/supabase'
import { useAccounts } from '@/lib/queries'
import { useActiveHousehold } from '@/lib/session'
import { Amount, Button, Card, EmptyState, InsetList } from '@/design-system/primitives'

type Step = 'pick' | 'review' | 'done'

export default function ImportStatement() {
  const navigate = useNavigate()
  const { membership } = useActiveHousehold()
  const { data: accounts } = useAccounts()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [accountId, setAccountId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [imported, setImported] = useState({ inserted: 0, skipped: 0 })

  const { parsed, errors } = useMemo<{ parsed: ParsedRow[]; errors: RowError[] }>(() => {
    if (!mapping) return { parsed: [], errors: [] }
    return mapRows(rawRows, mapping)
  }, [rawRows, mapping])

  const totals = useMemo(() => {
    const out = parsed.filter((r) => r.amount < 0).reduce((s, r) => s + -r.amount, 0)
    const inc = parsed.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0)
    return { out, inc }
  }, [parsed])

  const onFile = async (file: File) => {
    setError('')
    setFileName(file.name)
    let text = await file.text()
    // Los bancos españoles exportan a menudo en latin-1: se detecta por el
    // carácter de reemplazo y se vuelve a leer con la codificación correcta.
    if (text.includes('�')) {
      text = new TextDecoder('windows-1252').decode(await file.arrayBuffer())
    }

    const result = parseStatement(text)
    if (!result.mapping) {
      setError(
        'No he reconocido las columnas. Necesito al menos una de fecha, una de concepto y una de importe.',
      )
      return
    }
    setHeaders(result.headers)
    setRawRows(result.rows)
    setMapping(result.mapping)
    setAccountId((accounts ?? [])[0]?.id ?? '')
    setStep('review')
  }

  const doImport = async () => {
    if (!accountId) {
      setError('Elige a qué cuenta van estos movimientos.')
      return
    }
    setBusy(true)
    setError('')
    try {
      // Se comprueba qué huellas existen ya para no duplicar al reimportar
      const fingerprints = parsed.map((r) => rowFingerprint(accountId, r))
      const { data: existing, error: readError } = await sb()
        .from('transactions')
        .select('dedup_hash')
        .eq('account_id', accountId)
        .in('dedup_hash', fingerprints)
      if (readError) throw readError

      const already = new Set((existing ?? []).map((e) => e.dedup_hash as string))
      const toInsert = parsed
        .map((row, i) => ({ row, hash: fingerprints[i]! }))
        .filter(({ hash }) => !already.has(hash))

      if (toInsert.length > 0) {
        const { error: insertError } = await sb()
          .from('transactions')
          .insert(
            toInsert.map(({ row, hash }) => ({
              household_id: membership!.household_id,
              account_id: accountId,
              booked_at: row.date,
              amount: row.amount,
              amount_base: row.amount,
              raw_description: row.description,
              clean_description: row.description,
              source: 'imported',
              reviewed: false,
              dedup_hash: hash,
            })),
          )
        if (insertError) throw insertError
      }

      setImported({ inserted: toInsert.length, skipped: parsed.length - toInsert.length })
      setStep('done')
    } catch (e) {
      setError(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  const setColumn = (field: keyof ColumnMapping, value: number | undefined) => {
    setMapping((m) => (m ? { ...m, [field]: value } : m))
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
      <button
        onClick={() => navigate('/finanzas')}
        className="flex items-center gap-1.5 t-subhead text-[var(--text-secondary)]"
      >
        <ArrowLeft size={16} /> Movimientos
      </button>

      <h1 className="t-title-1">Importar extracto</h1>

      {step === 'pick' && (
        <>
          <Card padded={false}>
            <EmptyState
              icon={<FileUp size={30} />}
              title="Sube el archivo de tu banco"
              description="Entra en la web de tu banco, descarga los movimientos en CSV o Excel y súbelo aquí. Funciona con BBVA, Santander, CaixaBank, ING, Revolut y la mayoría."
              action={
                <Button onClick={() => fileRef.current?.click()}>
                  <Upload size={17} /> Elegir archivo
                </Button>
              }
            />
          </Card>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFile(f)
            }}
          />
          {error && (
            <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
              {error}
            </p>
          )}
        </>
      )}

      {step === 'review' && mapping && (
        <>
          <Card className="space-y-4">
            <div className="flex items-center gap-2 t-subhead">
              <CheckCircle2 size={16} style={{ color: 'var(--income)' }} />
              <span className="truncate">{fileName}</span>
            </div>

            <div>
              <label htmlFor="imp-account" className="t-subhead font-medium block mb-2">
                ¿A qué cuenta?
              </label>
              <select
                id="imp-account"
                className="w-full px-3 py-2.5 rounded-[12px] t-subhead outline-none border"
                style={{ backgroundColor: 'var(--bg-inset)', borderColor: 'transparent' }}
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

            <details>
              <summary className="t-subhead font-medium cursor-pointer">
                Columnas detectadas
              </summary>
              <div className="grid grid-cols-2 gap-3 mt-3">
                {(
                  [
                    ['date', 'Fecha'],
                    ['description', 'Concepto'],
                    ['amount', 'Importe'],
                    ['debit', 'Debe'],
                    ['credit', 'Haber'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className="t-caption text-[var(--text-tertiary)] block mb-1">
                      {label}
                    </label>
                    <select
                      className="w-full px-2 py-1.5 rounded-lg t-footnote outline-none border"
                      style={{ backgroundColor: 'var(--bg-inset)', borderColor: 'transparent' }}
                      value={mapping[field] ?? ''}
                      onChange={(e) =>
                        setColumn(field, e.target.value === '' ? undefined : Number(e.target.value))
                      }
                    >
                      <option value="">—</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Columna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </details>
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Card>
              <p className="t-caption text-[var(--text-tertiary)]">Movimientos</p>
              <p className="t-title-3 num mt-0.5">{parsed.length}</p>
            </Card>
            <Card>
              <p className="t-caption text-[var(--text-tertiary)]">Gastos</p>
              <p className="t-subhead num mt-1" style={{ color: 'var(--expense)' }}>
                <Amount value={money(totals.out)} />
              </p>
            </Card>
            <Card>
              <p className="t-caption text-[var(--text-tertiary)]">Ingresos</p>
              <p className="t-subhead num mt-1" style={{ color: 'var(--income)' }}>
                <Amount value={money(totals.inc)} />
              </p>
            </Card>
          </div>

          {errors.length > 0 && (
            <Card className="flex items-start gap-3">
              <AlertTriangle size={18} style={{ color: 'var(--warning)' }} className="shrink-0" />
              <div>
                <p className="t-subhead font-medium">
                  {errors.length} {errors.length === 1 ? 'fila' : 'filas'} sin importar
                </p>
                <p className="t-footnote text-[var(--text-tertiary)] mt-0.5">
                  Suelen ser líneas de totales o resúmenes del banco. El resto se importa igual.
                </p>
              </div>
            </Card>
          )}

          <div>
            <p className="t-footnote uppercase tracking-wider font-semibold text-[var(--text-tertiary)] px-1 mb-2">
              Vista previa
            </p>
            <InsetList>
              {parsed.slice(0, 8).map((row, i) => (
                <div key={i} className="inset-row">
                  <div className="flex-1 min-w-0">
                    <p className="t-subhead truncate">{row.description || 'Sin concepto'}</p>
                    <p className="t-caption text-[var(--text-tertiary)]">{row.date}</p>
                  </div>
                  <Amount value={money(row.amount)} colored signed />
                </div>
              ))}
            </InsetList>
            {parsed.length > 8 && (
              <p className="t-footnote text-[var(--text-tertiary)] text-center mt-2">
                y {parsed.length - 8} más
              </p>
            )}
          </div>

          {error && (
            <p className="t-subhead" style={{ color: 'var(--expense)' }} role="alert">
              {error}
            </p>
          )}

          <Button
            size="lg"
            fullWidth
            loading={busy}
            disabled={parsed.length === 0}
            onClick={doImport}
          >
            Importar {parsed.length} movimientos
          </Button>
          <Button variant="plain" fullWidth onClick={() => setStep('pick')}>
            Elegir otro archivo
          </Button>
        </>
      )}

      {step === 'done' && (
        <Card padded={false}>
          <EmptyState
            icon={<CheckCircle2 size={30} style={{ color: 'var(--income)' }} />}
            title={`${imported.inserted} movimientos importados`}
            description={
              imported.skipped > 0
                ? `Se saltaron ${imported.skipped} que ya estaban: puedes reimportar el mismo archivo sin miedo a duplicar.`
                : 'Ya están en tus movimientos, listos para categorizar.'
            }
            action={<Button onClick={() => navigate('/finanzas')}>Ver movimientos</Button>}
          />
        </Card>
      )}
    </div>
  )
}
