import { describe, expect, it, vi } from 'vitest'
import { createSchemaGate } from '@/lib/auth/schema-gate'

describe('createSchemaGate', () => {
  it('stops migrating after the first successful run', async () => {
    const migrate = vi.fn(() => Promise.resolve())
    const ensure = createSchemaGate(migrate)
    await ensure()
    await ensure()
    expect(migrate).toHaveBeenCalledTimes(1)
  })

  it('does not make a caller wait on a run another caller started', async () => {
    const stuck = new Promise<void>(() => undefined)
    const migrate = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(stuck)
      .mockResolvedValue()
    const ensure = createSchemaGate(migrate)
    const first = ensure()
    await expect(ensure()).resolves.toBeUndefined()
    expect(first).toBeInstanceOf(Promise)
    expect(migrate).toHaveBeenCalledTimes(2)
  })

  it('retries once when a concurrent run created the table first', async () => {
    const migrate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('table already exists'))
      .mockResolvedValue()
    await createSchemaGate(migrate)()
    expect(migrate).toHaveBeenCalledTimes(2)
  })

  it('surfaces a failure that persists and tries again on the next call', async () => {
    const migrate = vi.fn(() => Promise.reject(new Error('D1 unavailable')))
    const ensure = createSchemaGate(migrate)
    await expect(ensure()).rejects.toThrow('D1 unavailable')
    await expect(ensure()).rejects.toThrow('D1 unavailable')
    expect(migrate).toHaveBeenCalledTimes(4)
  })
})
