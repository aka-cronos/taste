import { env } from 'cloudflare:workers'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { ownerFromHeaders } from '@/lib/auth/request'
import { contactUrl } from '@/lib/contact'
import { countInboxItems } from '@/lib/items/repository'

export const getBootstrap = createServerFn({ method: 'GET' }).handler(
  async () => {
    const owner = await ownerFromHeaders(getRequestHeaders())
    return {
      contactUrl: contactUrl(env.CONTACT_URL),
      inboxCount: owner ? await countInboxItems(env.DB) : 0,
      owner,
    }
  },
)
