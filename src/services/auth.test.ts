import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: { auth: mocks },
}))

import { requestPasswordReset, updatePassword, verifyEmailLink } from './auth'

beforeEach(() => vi.clearAllMocks())

describe('servicio de autenticación', () => {
  it('canjea el token del enlace con verifyOtp', async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null })
    await verifyEmailLink('hash', 'recovery')
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash', type: 'recovery' })
  })

  it('pide la recuperación con la URL de confirmación de la app', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null })
    await requestPasswordReset('  ana@ejemplo.co ')
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith('ana@ejemplo.co', {
      redirectTo: expect.stringMatching(/#\/auth\/confirm$/),
    })
  })

  it('no revela si el correo existe ni si se alcanzó el límite de envíos', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: Object.assign(new Error('User not found'), { code: 'user_not_found' }) })
    await expect(requestPasswordReset('nadie@ejemplo.co')).resolves.toBeUndefined()
    mocks.resetPasswordForEmail.mockResolvedValue({ error: Object.assign(new Error('Email rate limit exceeded'), { code: 'over_email_send_rate_limit' }) })
    await expect(requestPasswordReset('ana@ejemplo.co')).resolves.toBeUndefined()
  })

  it('sí propaga los fallos de red', async () => {
    mocks.resetPasswordForEmail.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(requestPasswordReset('ana@ejemplo.co')).rejects.toThrow('Failed to fetch')
  })

  it('propaga el error al actualizar la contraseña', async () => {
    mocks.updateUser.mockResolvedValue({ error: Object.assign(new Error('weak'), { code: 'weak_password' }) })
    await expect(updatePassword('x')).rejects.toMatchObject({ code: 'weak_password' })
  })
})
