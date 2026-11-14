const ISSUER_PATH = '/api/auth'
const OAUTH = '/.well-known/oauth-authorization-server'
const OIDC = '/.well-known/openid-configuration'

/**
 * Discovery URLs some MCP clients probe at the origin root instead of the
 * issuer path, mapped to the ones Better Auth serves for the `/api/auth`
 * issuer.
 */
const ROOT_ALIASES = new Map([
  [OAUTH, `${OAUTH}${ISSUER_PATH}`],
  [OIDC, `${ISSUER_PATH}${OIDC}`],
  [`${OIDC}${ISSUER_PATH}`, `${ISSUER_PATH}${OIDC}`],
])

/** Rewrites a root discovery request to the issuer document it stands for. */
export function toIssuerDiscovery(request: Request) {
  const url = new URL(request.url)
  const target = ROOT_ALIASES.get(url.pathname)
  if (!target) {
    return request
  }
  url.pathname = target
  return new Request(url, request)
}
