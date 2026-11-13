import { vi } from 'vitest'

vi.mock('@/lib/bootstrap', () => ({ getBootstrap: vi.fn() }))
