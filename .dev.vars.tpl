# Template for .dev.vars. Render with `envsync` from the repo root.
# Values live in 1Password: vault `dev`, item `taste`. Local development only:
# the Google OAuth client here is a separate "Taste (local)" client that only
# allows localhost. Production secrets live in Cloudflare and never go in `dev`.
OWNER_EMAIL={{ op://dev/taste/OWNER_EMAIL }}
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET={{ op://dev/taste/BETTER_AUTH_SECRET }}
GOOGLE_CLIENT_ID={{ op://dev/taste/GOOGLE_CLIENT_ID }}
GOOGLE_CLIENT_SECRET={{ op://dev/taste/GOOGLE_CLIENT_SECRET }}
