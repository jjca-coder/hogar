/**
 * Importador de extractos bancarios.
 *
 * Cada banco español exporta a su manera: separador distinto, filas de
 * cabecera antes de la tabla, fechas en varios formatos y el importe a veces
 * en una columna y a veces partido en debe/haber. Esto lo normaliza todo.
 */

export interface ParsedRow {
  date: string // YYYY-MM-DD
  description: string
  /** Unidades mínimas, negativo = gasto. */
  amount: number
  balance: number | null
  /** Fila original, por si hay que revisarla a mano. */
  raw: string[]
}

export interface ColumnMapping {
  date: number
  description: number
  /** Columna con el importe con signo. */
  amount?: number
  /** O bien dos columnas separadas (débito y crédito). */
  debit?: number
  credit?: number
  balance?: number
}

export interface ParseResult {
  headers: string[]
  rows: string[][]
  mapping: ColumnMapping | null
  delimiter: string
  /** Filas descartadas antes de la cabecera (metadatos del banco). */
  skippedLines: number
}

const DELIMITERS = [';', ',', '\t', '|'] as const

/** El separador correcto es el que produce más columnas de forma consistente. */
export function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 12)
  let best = ';'
  let bestScore = 0

  for (const d of DELIMITERS) {
    const counts = lines.map((l) => splitLine(l, d).length)
    const max = Math.max(...counts, 0)
    if (max < 2) continue
    // Consistencia: cuántas líneas tienen el número de columnas más frecuente
    const consistent = counts.filter((c) => c === max).length
    const score = consistent * max
    if (score > bestScore) {
      bestScore = score
      best = d
    }
  }
  return best
}

/** Divide respetando comillas: "Compra, con coma" no debe partirse. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current.trim())
  return out
}

const HEADER_HINTS = {
  date: ['fecha', 'f. valor', 'fecha operacion', 'fecha operación', 'date', 'f.operacion', 'dia'],
  description: [
    'concepto',
    'descripcion',
    'descripción',
    'detalle',
    'movimiento',
    'description',
    'beneficiario',
    'referencia',
  ],
  amount: ['importe', 'amount', 'cantidad', 'valor', 'importe (€)', 'importe eur'],
  debit: ['debe', 'cargo', 'debito', 'débito', 'salida', 'gasto'],
  credit: ['haber', 'abono', 'credito', 'crédito', 'entrada', 'ingreso'],
  balance: ['saldo', 'balance', 'saldo (€)'],
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s().€]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchColumn(headers: string[], hints: readonly string[]): number | undefined {
  const normalized = headers.map(normalizeHeader)
  // Primero coincidencia exacta, luego "empieza por", luego "contiene"
  for (const hint of hints) {
    const exact = normalized.indexOf(normalizeHeader(hint))
    if (exact >= 0) return exact
  }
  for (const hint of hints) {
    const h = normalizeHeader(hint)
    const idx = normalized.findIndex((n) => n.startsWith(h))
    if (idx >= 0) return idx
  }
  for (const hint of hints) {
    const h = normalizeHeader(hint)
    const idx = normalized.findIndex((n) => n.includes(h))
    if (idx >= 0) return idx
  }
  return undefined
}

export function guessMapping(headers: string[]): ColumnMapping | null {
  const date = matchColumn(headers, HEADER_HINTS.date)
  const description = matchColumn(headers, HEADER_HINTS.description)
  if (date === undefined || description === undefined) return null

  const amount = matchColumn(headers, HEADER_HINTS.amount)
  const debit = matchColumn(headers, HEADER_HINTS.debit)
  const credit = matchColumn(headers, HEADER_HINTS.credit)
  const balance = matchColumn(headers, HEADER_HINTS.balance)

  if (amount === undefined && debit === undefined && credit === undefined) return null

  return {
    date,
    description,
    ...(amount !== undefined ? { amount } : {}),
    ...(debit !== undefined ? { debit } : {}),
    ...(credit !== undefined ? { credit } : {}),
    ...(balance !== undefined ? { balance } : {}),
  }
}

/**
 * Muchos bancos ponen metadatos arriba (titular, IBAN, periodo...). La
 * cabecera real es la primera fila que se parece a una tabla de movimientos.
 */
export function parseStatement(text: string): ParseResult {
  const delimiter = detectDelimiter(text)
  const allLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)

  let headerIndex = 0
  let mapping: ColumnMapping | null = null

  for (let i = 0; i < Math.min(allLines.length, 25); i++) {
    const candidate = splitLine(allLines[i]!, delimiter)
    if (candidate.length < 3) continue
    const guess = guessMapping(candidate)
    if (guess) {
      headerIndex = i
      mapping = guess
      break
    }
  }

  const headers = splitLine(allLines[headerIndex] ?? '', delimiter)
  const rows = allLines
    .slice(headerIndex + 1)
    .map((l) => splitLine(l, delimiter))
    .filter((r) => r.some((c) => c.length > 0))

  return { headers, rows, mapping, delimiter, skippedLines: headerIndex }
}

/** Acepta dd/MM/yyyy, dd-MM-yyyy, yyyy-MM-dd y dd/MM/yy. */
export function parseDate(value: string): string | null {
  const v = value.trim()
  if (!v) return null

  const iso = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }

  const dmy = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (dmy) {
    const [, d, m, rawYear] = dmy
    let year = rawYear!
    if (year.length === 2) {
      // Ventana razonable: 70–99 es 19xx, el resto 20xx
      year = Number(year) > 70 ? `19${year}` : `20${year}`
    }
    const month = Number(m)
    const day = Number(d)
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return null
}

/**
 * Importe a unidades mínimas. Distingue el formato español (1.234,56) del
 * anglosajón (1,234.56) por cuál de los dos separadores va el último.
 */
export function parseAmountCell(value: string): number | null {
  let v = value.trim().replace(/[€$£\s]/g, '')
  if (!v) return null

  // Negativos entre paréntesis: (1.234,56)
  let negative = false
  if (/^\(.*\)$/.test(v)) {
    negative = true
    v = v.slice(1, -1)
  }
  if (v.startsWith('-')) {
    negative = true
    v = v.slice(1)
  } else if (v.startsWith('+')) {
    v = v.slice(1)
  }

  const lastComma = v.lastIndexOf(',')
  const lastDot = v.lastIndexOf('.')

  let normalized: string
  if (lastComma > lastDot) {
    // Español: los puntos son millares y la coma decimal
    normalized = v.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    normalized = v.replace(/,/g, '')
  } else {
    normalized = v
  }

  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '') return null
  const n = Number.parseFloat(normalized)
  if (!Number.isFinite(n)) return null

  const minor = Math.round(n * 100)
  return negative ? -minor : minor
}

export interface RowError {
  line: number
  reason: string
  raw: string[]
}

export function mapRows(
  rows: readonly string[][],
  mapping: ColumnMapping,
): { parsed: ParsedRow[]; errors: RowError[] } {
  const parsed: ParsedRow[] = []
  const errors: RowError[] = []

  rows.forEach((row, i) => {
    const date = parseDate(row[mapping.date] ?? '')
    if (!date) {
      errors.push({ line: i + 1, reason: 'Fecha no reconocida', raw: row })
      return
    }

    let amount: number | null = null
    if (mapping.amount !== undefined) {
      amount = parseAmountCell(row[mapping.amount] ?? '')
    } else {
      // Columnas separadas: el debe siempre resta aunque venga en positivo
      const debit = mapping.debit !== undefined ? parseAmountCell(row[mapping.debit] ?? '') : null
      const credit =
        mapping.credit !== undefined ? parseAmountCell(row[mapping.credit] ?? '') : null
      if (debit !== null && debit !== 0) amount = -Math.abs(debit)
      else if (credit !== null && credit !== 0) amount = Math.abs(credit)
    }

    if (amount === null || amount === 0) {
      errors.push({ line: i + 1, reason: 'Importe no reconocido', raw: row })
      return
    }

    parsed.push({
      date,
      description: (row[mapping.description] ?? '').replace(/\s+/g, ' ').trim(),
      amount,
      balance: mapping.balance !== undefined ? parseAmountCell(row[mapping.balance] ?? '') : null,
      raw: [...row],
    })
  })

  return { parsed, errors }
}

/**
 * Huella estable de un movimiento, para no duplicar al reimportar el mismo
 * extracto. Misma cuenta + fecha + importe + concepto normalizado = mismo.
 */
export function rowFingerprint(accountId: string, row: ParsedRow): string {
  const desc = row.description
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 40)
  return `${accountId}|${row.date}|${row.amount}|${desc}`
}
