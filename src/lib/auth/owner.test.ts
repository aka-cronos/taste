import { describe, expect, it } from 'vitest'
import { isOwnerEmail, ownerFromSession } from '@/lib/auth/owner'

describe('isOwnerEmail', () => {
  it('matches the owner regardless of case and surrounding spaces', () => {
    expect(isOwnerEmail('Owner@Example.com', ' owner@example.com ')).toBe(true)
  })

  it('rejects other addresses', () => {
    expect(isOwnerEmail('someone@example.com', 'owner@example.com')).toBe(false)
  })

  it('matches nobody when the owner address is missing or blank', () => {
    expect(isOwnerEmail('owner@example.com', undefined)).toBe(false)
    expect(isOwnerEmail('owner@example.com', '  ')).toBe(false)
    expect(isOwnerEmail('', '')).toBe(false)
  })
})

describe('ownerFromSession', () => {
  const user = { email: 'owner@example.com', name: 'Owner' }

  it('returns null for anonymous visitors', () => {
    expect(ownerFromSession(null, 'owner@example.com')).toBeNull()
  })

  it('returns null when the session belongs to someone else', () => {
    expect(ownerFromSession({ user }, 'new-owner@example.com')).toBeNull()
  })

  it('returns the owner for the owner session', () => {
    expect(ownerFromSession({ user }, 'owner@example.com')).toEqual({
      email: 'owner@example.com',
      image: null,
      name: 'Owner',
    })
  })
})
