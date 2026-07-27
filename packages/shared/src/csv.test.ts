import { describe, expect, it } from 'vitest'
import {
  detectDelimiter,
  guessMapping,
  mapRows,
  parseAmountCell,
  parseDate,
  parseStatement,
  rowFingerprint,
  splitLine,
} from './csv'

/* Extractos con la forma real de los bancos españoles. */

const BBVA = `Fecha;Concepto;Movimiento;Importe;Divisa;Saldo
05/07/2026;COMPRA TARJ. 4471 MERCADONA;Pago con tarjeta;-64,30;EUR;1.180,20
04/07/2026;RECIBO NETFLIX;Recibo;-17,99;EUR;1.244,50
01/07/2026;NOMINA JULIO;Transferencia;1.650,00;EUR;1.262,49`

const SANTANDER_DEBE_HABER = `FECHA OPERACION,CONCEPTO,DEBE,HABER,SALDO
05/07/2026,PAGO EN GASOLINERA,60.00,,1180.20
01/07/2026,NOMINA,,1650.00,1240.20`

const CON_METADATOS = `Titular:;JESUS CARBALLO
IBAN:;ES91 2100 0418 4502 0005 1332
Periodo:;01/07/2026 - 31/07/2026

Fecha;Concepto;Importe;Saldo
05/07/2026;MERCADONA;-64,30;1.180,20
04/07/2026;FARMACIA;-12,40;1.244,50`

const REVOLUT_EN = `Type,Started Date,Description,Amount,Currency,Balance
CARD_PAYMENT,2026-07-05,Mercadona,-64.30,EUR,1180.20
TOPUP,2026-07-01,Payment from Jesus,1650.00,EUR,1244.50`

describe('detectDelimiter', () => {
  it('reconoce punto y coma, coma y tabulador', () => {
    expect(detectDelimiter(BBVA)).toBe(';')
    expect(detectDelimiter(SANTANDER_DEBE_HABER)).toBe(',')
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t')
  })
})

describe('splitLine', () => {
  it('respeta las comas dentro de comillas', () => {
    expect(splitLine('2026-07-05,"Compra, con coma",-64.30', ',')).toEqual([
      '2026-07-05',
      'Compra, con coma',
      '-64.30',
    ])
  })

  it('maneja comillas escapadas', () => {
    expect(splitLine('a,"di ""hola""",b', ',')).toEqual(['a', 'di "hola"', 'b'])
  })
})

describe('parseDate', () => {
  it('acepta los formatos habituales', () => {
    expect(parseDate('05/07/2026')).toBe('2026-07-05')
    expect(parseDate('5-7-2026')).toBe('2026-07-05')
    expect(parseDate('2026-07-05')).toBe('2026-07-05')
    expect(parseDate('05.07.2026')).toBe('2026-07-05')
  })

  it('resuelve los años de dos cifras', () => {
    expect(parseDate('05/07/26')).toBe('2026-07-05')
    expect(parseDate('05/07/98')).toBe('1998-07-05')
  })

  it('rechaza lo que no es una fecha', () => {
    expect(parseDate('')).toBeNull()
    expect(parseDate('concepto')).toBeNull()
    expect(parseDate('45/13/2026')).toBeNull()
  })
})

describe('parseAmountCell', () => {
  it('entiende el formato español', () => {
    expect(parseAmountCell('1.234,56')).toBe(123456)
    expect(parseAmountCell('-64,30')).toBe(-6430)
  })

  it('entiende el formato anglosajón', () => {
    expect(parseAmountCell('1,234.56')).toBe(123456)
    expect(parseAmountCell('-64.30')).toBe(-6430)
  })

  it('quita símbolos de moneda', () => {
    expect(parseAmountCell('64,30 €')).toBe(6430)
    expect(parseAmountCell('€ 1.000,00')).toBe(100000)
  })

  it('trata los paréntesis como negativo', () => {
    expect(parseAmountCell('(64,30)')).toBe(-6430)
  })

  it('devuelve null con celdas vacías o basura', () => {
    expect(parseAmountCell('')).toBeNull()
    expect(parseAmountCell('  ')).toBeNull()
    expect(parseAmountCell('N/A')).toBeNull()
  })
})

describe('guessMapping', () => {
  it('reconoce cabeceras en español', () => {
    const m = guessMapping(['Fecha', 'Concepto', 'Importe', 'Saldo'])
    expect(m).toEqual({ date: 0, description: 1, amount: 2, balance: 3 })
  })

  it('reconoce debe y haber por separado', () => {
    const m = guessMapping(['FECHA OPERACION', 'CONCEPTO', 'DEBE', 'HABER', 'SALDO'])
    expect(m?.debit).toBe(2)
    expect(m?.credit).toBe(3)
    expect(m?.amount).toBeUndefined()
  })

  it('reconoce cabeceras en inglés', () => {
    const m = guessMapping(['Type', 'Started Date', 'Description', 'Amount', 'Currency', 'Balance'])
    expect(m?.description).toBe(2)
    expect(m?.amount).toBe(3)
  })

  it('devuelve null si no hay columnas suficientes', () => {
    expect(guessMapping(['columna1', 'columna2'])).toBeNull()
  })
})

describe('parseStatement', () => {
  it('lee un extracto de BBVA', () => {
    const r = parseStatement(BBVA)
    expect(r.mapping).not.toBeNull()
    expect(r.rows).toHaveLength(3)
    expect(r.skippedLines).toBe(0)
  })

  it('se salta los metadatos del banco antes de la tabla', () => {
    const r = parseStatement(CON_METADATOS)
    expect(r.skippedLines).toBeGreaterThan(0)
    expect(r.headers[0]).toBe('Fecha')
    expect(r.rows).toHaveLength(2)
  })
})

describe('mapRows', () => {
  it('convierte un extracto completo con signos correctos', () => {
    const r = parseStatement(BBVA)
    const { parsed, errors } = mapRows(r.rows, r.mapping!)
    expect(errors).toHaveLength(0)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toMatchObject({ date: '2026-07-05', amount: -6430 })
    expect(parsed[2]).toMatchObject({ date: '2026-07-01', amount: 165000 })
  })

  it('el debe resta y el haber suma aunque vengan en positivo', () => {
    const r = parseStatement(SANTANDER_DEBE_HABER)
    const { parsed } = mapRows(r.rows, r.mapping!)
    expect(parsed[0]?.amount).toBe(-6000)
    expect(parsed[1]?.amount).toBe(165000)
  })

  it('procesa un extracto de Revolut en inglés', () => {
    const r = parseStatement(REVOLUT_EN)
    const { parsed, errors } = mapRows(r.rows, r.mapping!)
    expect(errors).toHaveLength(0)
    expect(parsed[0]).toMatchObject({ description: 'Mercadona', amount: -6430 })
  })

  it('recoge las filas problemáticas en vez de tirarlas en silencio', () => {
    const conBasura = `Fecha;Concepto;Importe
05/07/2026;MERCADONA;-64,30
;FILA ROTA;
05/07/2026;SIN IMPORTE;`
    const r = parseStatement(conBasura)
    const { parsed, errors } = mapRows(r.rows, r.mapping!)
    expect(parsed).toHaveLength(1)
    expect(errors).toHaveLength(2)
    expect(errors[0]?.reason).toContain('Fecha')
  })
})

describe('rowFingerprint', () => {
  it('da la misma huella al reimportar el mismo extracto', () => {
    const r = parseStatement(BBVA)
    const a = mapRows(r.rows, r.mapping!).parsed
    const b = mapRows(parseStatement(BBVA).rows, r.mapping!).parsed
    expect(rowFingerprint('acc-1', a[0]!)).toBe(rowFingerprint('acc-1', b[0]!))
  })

  it('distingue movimientos distintos', () => {
    const r = parseStatement(BBVA)
    const p = mapRows(r.rows, r.mapping!).parsed
    expect(rowFingerprint('acc-1', p[0]!)).not.toBe(rowFingerprint('acc-1', p[1]!))
  })

  it('distingue la misma compra en cuentas distintas', () => {
    const r = parseStatement(BBVA)
    const p = mapRows(r.rows, r.mapping!).parsed
    expect(rowFingerprint('acc-1', p[0]!)).not.toBe(rowFingerprint('acc-2', p[0]!))
  })
})
