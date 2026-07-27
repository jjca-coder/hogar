import { describe, expect, it } from 'vitest'
import { formatMoney, formatMoneyAxis, initials, parseAmountToMinor } from './format'
import { money } from './money'

/** Intl separa el simbolo con espacio no separable; lo normalizamos por codigo. */
const norm = (s: string) => s.replace(/[\u00A0\u202F]/g, ' ')

describe('formatMoney (es-ES)', () => {
  it('usa coma decimal y símbolo pospuesto', () => {
    expect(norm(formatMoney(money(123456)))).toBe('1.234,56 €')
  })

  it('marca el signo cuando se pide', () => {
    expect(norm(formatMoney(money(5000), { signed: true }))).toBe('+50,00 €')
    expect(norm(formatMoney(money(-5000), { signed: true }))).toBe('-50,00 €')
  })

  it('en modo compacto quita los decimales', () => {
    expect(norm(formatMoney(money(3522145), { compact: true }))).toBe('35.221 €')
  })
})

describe('formatMoneyAxis', () => {
  it('abrevia miles y millones', () => {
    expect(formatMoneyAxis(money(1_240_000))).toBe('12,4 k€')
    expect(formatMoneyAxis(money(250_000_000))).toBe('2,5 M€')
    expect(formatMoneyAxis(money(45_000))).toBe('450 €')
  })
})

describe('parseAmountToMinor', () => {
  it('acepta formato español con separador de millares', () => {
    expect(parseAmountToMinor('1.234,56')).toBe(123456)
    expect(parseAmountToMinor('12,50')).toBe(1250)
  })

  it('acepta formato con punto decimal', () => {
    expect(parseAmountToMinor('1234.56')).toBe(123456)
  })

  it('acepta enteros y el símbolo de euro', () => {
    expect(parseAmountToMinor('1234')).toBe(123400)
    expect(parseAmountToMinor('12,50 €')).toBe(1250)
  })

  it('acepta negativos', () => {
    expect(parseAmountToMinor('-42,10')).toBe(-4210)
  })

  it('devuelve null con basura', () => {
    expect(parseAmountToMinor('')).toBeNull()
    expect(parseAmountToMinor('abc')).toBeNull()
    expect(parseAmountToMinor('12,3,4')).toBeNull()
  })
})

describe('initials', () => {
  it('coge la primera y la última palabra', () => {
    expect(initials('Jesús Carballo')).toBe('JC')
    expect(initials('Ana')).toBe('A')
    expect(initials('  ')).toBe('?')
  })
})
