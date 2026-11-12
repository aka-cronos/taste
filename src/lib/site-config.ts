import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { contactUrl } from '@/lib/contact'

export const getContactUrl = createServerFn({ method: 'GET' }).handler(() =>
  contactUrl(env.CONTACT_URL),
)
