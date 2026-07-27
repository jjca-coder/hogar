import { describe, expect, it } from 'vitest'
import {
  add,
  allocate,
  allocateByWeights,
  CurrencyMismatchError,
  fromDecimal,
  money,
  multiply,
  subtract,
  sum,
  toDecimal,
} from './money'

describe('money', () => {
  it('rechaza importes no enteros', () => {
    expect(() => money(12.5)).toThrow(TypeError)
  })

  it('convierte desde decimal redondeando al céntimo', () => {
    expect(fromDecimal(12.5).amount).toBe(1250)
    expect(fromDecimal(0.1 + 0.2).amount).toBe(30) // el clásico 0.30000000000000004
    expect(fromDecimal(-9.999).amount).toBe(-1000)
  })

  it('ida y vuelta sin pérdida', () => {
    expect(toDecimal(fromDecimal(1234.56))).toBeCloseTo(1234.56, 10)
  })

  it('no deja mezclar divisas', () => {
    expect(() => add(money(100, 'EUR'), money(100, 'USD'))).toThrow(CurrencyMismatchError)
  })

  it('suma y resta sin errores de coma flotante', () => {
    const total = sum([fromDecimal(0.1), fromDecimal(0.2), fromDecimal(0.3)])
    expect(total.amount).toBe(60)
    expect(subtract(money(1000), money(333)).amount).toBe(667)
  })
})

describe('allocate — reparto sin perder céntimos', () => {
  it('reparte exacto cuando es divisible', () => {
    const parts = allocate(money(1000), 4)
    expect(parts.map((p) => p.amount)).toEqual([250, 250, 250, 250])
  })

  it('distribuye el resto entre las primeras partes', () => {
    const parts = allocate(money(1000), 3)
    expect(parts.map((p) => p.amount)).toEqual([334, 333, 333])
    expect(sum(parts).amount).toBe(1000)
  })

  it('el céntimo suelto de 0,01 € entre 3 no se pierde', () => {
    const parts = allocate(money(1), 3)
    expect(sum(parts).amount).toBe(1)
  })

  it('funciona con importes negativos (gastos)', () => {
    const parts = allocate(money(-1000), 3)
    expect(sum(parts).amount).toBe(-1000)
    expect(parts.map((p) => p.amount)).toEqual([-334, -333, -333])
  })

  it('rechaza un número de partes inválido', () => {
    expect(() => allocate(money(100), 0)).toThrow(RangeError)
    expect(() => allocate(money(100), 1.5)).toThrow(RangeError)
  })
})

describe('allocateByWeights — repartos desiguales', () => {
  it('reparte 60/40 sin perder nada', () => {
    const parts = allocateByWeights(money(10_000), [60, 40])
    expect(parts.map((p) => p.amount)).toEqual([6000, 4000])
  })

  it('cuadra aunque los pesos no dividan exacto', () => {
    const parts = allocateByWeights(money(100), [1, 1, 1])
    expect(sum(parts).amount).toBe(100)
  })

  it('rechaza pesos que suman cero', () => {
    expect(() => allocateByWeights(money(100), [0, 0])).toThrow(RangeError)
  })
})

describe('multiply', () => {
  it('redondea al entero más cercano', () => {
    expect(multiply(money(1000), 0.215).amount).toBe(215)
    expect(multiply(money(333), 0.5).amount).toBe(167)
  })
})
