import { describe, expect, it } from 'vitest'
import {
  confirmRedirectUrl,
  isNetworkError,
  parseConfirmLink,
  passwordUpdateErrorMessage,
  validateNewPassword,
} from './authFlow'

describe('parseConfirmLink', () => {
  it('lee token_hash y type de invitación o recuperación', () => {
    expect(parseConfirmLink('?token_hash=abc123&type=invite')).toEqual({ tokenHash: 'abc123', type: 'invite' })
    expect(parseConfirmLink('token_hash=xyz&type=recovery')).toEqual({ tokenHash: 'xyz', type: 'recovery' })
  })

  it('rechaza enlaces incompletos o con un tipo no soportado', () => {
    expect(parseConfirmLink('')).toBeNull()
    expect(parseConfirmLink('?type=invite')).toBeNull()
    expect(parseConfirmLink('?token_hash=abc&type=magiclink')).toBeNull()
    expect(parseConfirmLink('?token_hash=%20%20&type=invite')).toBeNull()
  })
})

describe('confirmRedirectUrl', () => {
  it('conserva el subdirectorio de GitHub Pages y usa la ruta con hash', () => {
    expect(confirmRedirectUrl({ origin: 'https://feliperoma04.github.io', pathname: '/LabRepSys/' }))
      .toBe('https://feliperoma04.github.io/LabRepSys/#/auth/confirm')
    expect(confirmRedirectUrl({ origin: 'https://feliperoma04.github.io', pathname: '/LabRepSys/index.html' }))
      .toBe('https://feliperoma04.github.io/LabRepSys/#/auth/confirm')
    expect(confirmRedirectUrl({ origin: 'http://localhost:5173', pathname: '/' }))
      .toBe('http://localhost:5173/#/auth/confirm')
  })
})

describe('validateNewPassword', () => {
  it('acepta una contraseña válida y confirmada', () => {
    expect(validateNewPassword('frase larga segura', 'frase larga segura')).toBeNull()
  })

  it('explica cada problema', () => {
    expect(validateNewPassword('corta', 'corta')).toMatch(/al menos 8/)
    expect(validateNewPassword('a'.repeat(73), 'a'.repeat(73))).toMatch(/72 bytes/)
    expect(validateNewPassword(' con espacios ', ' con espacios ')).toMatch(/espacios/)
    expect(validateNewPassword('contraseña1', 'contraseña2')).toMatch(/no coinciden/)
  })

  it('cuenta bytes, no caracteres (tildes y ñ ocupan más)', () => {
    const value = 'ñ'.repeat(37) // 74 bytes en UTF-8
    expect(validateNewPassword(value, value)).toMatch(/72 bytes/)
  })
})

describe('mensajes de error', () => {
  it('distingue fallos de red', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('Invalid login credentials'))).toBe(false)
  })

  it('traduce códigos de Supabase sin filtrar detalles internos', () => {
    expect(passwordUpdateErrorMessage({ code: 'weak_password', message: 'x' })).toMatch(/política/)
    expect(passwordUpdateErrorMessage({ code: 'same_password' })).toMatch(/distinta/)
    expect(passwordUpdateErrorMessage({ code: 'session_not_found' })).toMatch(/no es válido o ya venció/)
    expect(passwordUpdateErrorMessage(new Error('pg: internal detail'))).not.toMatch(/internal/)
  })
})
