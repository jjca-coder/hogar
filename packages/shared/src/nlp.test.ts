import { describe, expect, it } from 'vitest'
import { nextOccurrence, parseTaskInput, rruleToWeekdays, weekdaysToRrule } from './nlp'

/** Lunes 27 de julio de 2026, para que las pruebas no dependan del reloj. */
const MONDAY = new Date(2026, 6, 27)

describe('parseTaskInput', () => {
  it('deja el texto tal cual si no hay nada que interpretar', () => {
    const r = parseTaskInput('Llamar al fontanero', MONDAY)
    expect(r.title).toBe('Llamar al fontanero')
    expect(r.dueDate).toBeNull()
    expect(r.priority).toBe('none')
  })

  it('entiende hoy, mañana y pasado mañana', () => {
    expect(parseTaskInput('Sacar la basura hoy', MONDAY).dueDate).toBe('2026-07-27')
    expect(parseTaskInput('Comprar pan mañana', MONDAY).dueDate).toBe('2026-07-28')
    expect(parseTaskInput('Cita pasado mañana', MONDAY).dueDate).toBe('2026-07-29')
  })

  it('quita la fecha del título', () => {
    expect(parseTaskInput('Comprar pan mañana', MONDAY).title).toBe('Comprar pan')
  })

  it('entiende el próximo día de la semana', () => {
    // Del lunes 27, el viernes siguiente es el 31
    const r = parseTaskInput('Pagar el IBI el viernes', MONDAY)
    expect(r.dueDate).toBe('2026-07-31')
    expect(r.title).toBe('Pagar el IBI')
  })

  it('entiende fechas escritas con el mes en letra', () => {
    const r = parseTaskInput('Renovar seguro el 15 de agosto', MONDAY)
    expect(r.dueDate).toBe('2026-08-15')
    expect(r.title).toBe('Renovar seguro')
  })

  it('pasa al año siguiente si la fecha ya quedó atrás', () => {
    expect(parseTaskInput('Felicitar el 3 de enero', MONDAY).dueDate).toBe('2027-01-03')
  })

  it('entiende fechas numéricas', () => {
    expect(parseTaskInput('Revisión 15/09', MONDAY).dueDate).toBe('2026-09-15')
    expect(parseTaskInput('Revisión 15/09/2027', MONDAY).dueDate).toBe('2027-09-15')
  })

  it('entiende la hora', () => {
    const r = parseTaskInput('Dentista mañana a las 10:30', MONDAY)
    expect(r.dueTime).toBe('10:30')
    expect(r.dueDate).toBe('2026-07-28')
    expect(r.title).toBe('Dentista')
  })

  it('no confunde un número del título con una hora', () => {
    const r = parseTaskInput('Comprar 6 huevos', MONDAY)
    expect(r.dueTime).toBeNull()
    expect(r.title).toBe('Comprar 6 huevos')
  })

  it('entiende la prioridad', () => {
    expect(parseTaskInput('Llamar al banco !alta', MONDAY).priority).toBe('high')
    expect(parseTaskInput('Regar !baja', MONDAY).priority).toBe('low')
    expect(parseTaskInput('Llamar al banco !alta', MONDAY).title).toBe('Llamar al banco')
  })

  it('entiende las etiquetas', () => {
    const r = parseTaskInput('Cambiar bombilla #casa #urgente', MONDAY)
    expect(r.tags).toEqual(['casa', 'urgente'])
    expect(r.title).toBe('Cambiar bombilla')
  })

  it('entiende las recurrencias', () => {
    expect(parseTaskInput('Regar plantas cada semana', MONDAY).rrule).toBe('FREQ=WEEKLY')
    expect(parseTaskInput('Sacar basura cada día', MONDAY).rrule).toBe('FREQ=DAILY')
    expect(parseTaskInput('Cambiar sábanas cada 2 semanas', MONDAY).rrule).toBe(
      'FREQ=WEEKLY;INTERVAL=2',
    )
    expect(parseTaskInput('Pagar cuota cada mes', MONDAY).rrule).toBe('FREQ=MONTHLY')
  })

  it('procesa una frase con todo a la vez', () => {
    const r = parseTaskInput('Pagar el IBI el viernes a las 10 !alta #casa', MONDAY)
    expect(r.title).toBe('Pagar el IBI')
    expect(r.dueDate).toBe('2026-07-31')
    expect(r.dueTime).toBe('10:00')
    expect(r.priority).toBe('high')
    expect(r.tags).toEqual(['casa'])
  })

  it('nunca deja el título vacío', () => {
    expect(parseTaskInput('mañana', MONDAY).title.length).toBeGreaterThan(0)
  })

  it('tolera acentos escritos o no', () => {
    expect(parseTaskInput('Reunión el miercoles', MONDAY).dueDate).toBe('2026-07-29')
    expect(parseTaskInput('Reunión el miércoles', MONDAY).dueDate).toBe('2026-07-29')
  })
})

describe('nextOccurrence', () => {
  it('avanza según la frecuencia', () => {
    expect(nextOccurrence('FREQ=DAILY', '2026-07-27')).toBe('2026-07-28')
    expect(nextOccurrence('FREQ=WEEKLY', '2026-07-27')).toBe('2026-08-03')
    expect(nextOccurrence('FREQ=MONTHLY', '2026-07-27')).toBe('2026-08-27')
    expect(nextOccurrence('FREQ=YEARLY', '2026-07-27')).toBe('2027-07-27')
  })

  it('respeta el intervalo', () => {
    expect(nextOccurrence('FREQ=WEEKLY;INTERVAL=2', '2026-07-27')).toBe('2026-08-10')
  })

  it('no se descuadra al cruzar fin de mes', () => {
    expect(nextOccurrence('FREQ=DAILY', '2026-07-31')).toBe('2026-08-01')
  })
})

describe('recurrencia por días concretos', () => {
  it('convierte días ISO a RRULE y vuelta', () => {
    expect(weekdaysToRrule([1, 3, 5])).toBe('FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(rruleToWeekdays('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual([1, 3, 5])
  })

  it('sin días no genera regla', () => {
    expect(weekdaysToRrule([])).toBeNull()
    expect(rruleToWeekdays('FREQ=WEEKLY')).toEqual([])
  })

  it('salta al siguiente día marcado, no una semana entera', () => {
    // Lunes 27 con L-X-V: la siguiente es el miércoles 29
    expect(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-07-27')).toBe('2026-07-29')
    // Viernes 31 con L-X-V: salta al lunes 3 de agosto
    expect(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-07-31')).toBe('2026-08-03')
  })

  it('de lunes a viernes salta el fin de semana', () => {
    expect(nextOccurrence('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '2026-07-31')).toBe('2026-08-03')
  })
})
