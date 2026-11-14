import type { DpopReplayReservations } from 'better-auth/oauth2'
import {
  createDpopReplayStore,
  enforceDpopBinding,
  parseAccessTokenAuthorization,
  verifyJwsAccessToken,
} from 'better-auth/oauth2'
import { isOwnerEmail } from '@/lib/auth/owner'
import type { getAuth } from '@/lib/auth/server'
import { createTools } from '@/lib/mcp/tools'

type McpAuth = {
  $context: Promise<{ internalAdapter: DpopReplayReservations }>
} & { api: Pick<ReturnType<typeof getAuth>['api'], 'getJwks'> }

export function protectedMcp(
  auth: McpAuth,
  db: D1Database,
  ownerEmail: string,
  baseURL: string,
  bucket?: Pick<R2Bucket, 'put' | 'delete'>,
) {
  const resource = new URL('/mcp', baseURL).href
  const challenge = `Bearer resource_metadata="${new URL('/.well-known/oauth-protected-resource/mcp', baseURL).href}", scope="mcp:read mcp:write"`
  return async (request: Request) => {
    let claims: Awaited<ReturnType<typeof verifyJwsAccessToken>>
    try {
      const authorization = parseAccessTokenAuthorization(
        request.headers.get('authorization'),
      )
      if (!authorization?.token || authorization.scheme === 'Unknown') {
        throw new Error('Missing access token')
      }
      claims = await verifyJwsAccessToken(authorization.token, {
        jwksCacheKey: auth,
        jwksFetch: () => auth.api.getJwks(),
        verifyOptions: {
          audience: resource,
          issuer: new URL('/api/auth', baseURL).href,
          requiredClaims: ['exp', 'sub', 'azp'],
        },
      })
      await enforceDpopBinding({
        authorization,
        method: request.method,
        payload: claims,
        proofJwt: request.headers.get('dpop'),
        replayStore: createDpopReplayStore(
          (await auth.$context).internalAdapter,
        ),
        url: request.url,
      })
    } catch {
      return Response.json(
        {
          error: {
            code: -32_000,
            message: 'A valid owner access token is required.',
          },
          id: null,
          jsonrpc: '2.0',
        },
        { headers: { 'WWW-Authenticate': challenge }, status: 401 },
      )
    }
    const scopes = new Set(
      typeof claims.scope === 'string' ? claims.scope.split(' ') : [],
    )
    if (!scopes.has('mcp:read')) {
      return Response.json(
        { error: 'Read scope required.' },
        {
          headers: {
            'WWW-Authenticate':
              'Bearer error="insufficient_scope", scope="mcp:read"',
          },
          status: 403,
        },
      )
    }
    const user = await db
      .prepare('SELECT email FROM user WHERE id = ?')
      .bind(claims.sub)
      .first<{ email: string }>()
    if (!isOwnerEmail(user?.email, ownerEmail)) {
      return Response.json({ error: 'Owner access required.' }, { status: 403 })
    }
    if (request.method !== 'POST') {
      return new Response(null, { headers: { Allow: 'POST' }, status: 405 })
    }
    return createTools(
      db,
      baseURL,
      scopes.has('mcp:write') && bucket ? { bucket, db } : undefined,
    ).fetch(request)
  }
}
