# Template for .dev.vars. Render with `envsync` from the repo root.
# Values live in 1Password: vault `taste`, item `taste`, read by this
# project's own service account. Local development only:
# the Google OAuth client here is a separate testing client, also used by
# trusted Previews. Production secrets live in Cloudflare, never in 1Password.
OWNER_EMAIL={{ op://taste/taste/OWNER_EMAIL }}
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET={{ op://taste/taste/BETTER_AUTH_SECRET }}
GOOGLE_CLIENT_ID={{ op://taste/taste/GOOGLE_CLIENT_ID }}
GOOGLE_CLIENT_SECRET={{ op://taste/taste/GOOGLE_CLIENT_SECRET }}
# Test login for automated verification (local dev and CI only; see #93).
TEST_LOGIN_PASSWORD={{ op://taste/taste/TEST_LOGIN_PASSWORD }}
