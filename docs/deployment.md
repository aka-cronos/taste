# Cloudflare Workers Builds

The owner connects Cloudflare to GitHub in the dashboard. GitHub Actions only
verifies changes; it holds no Cloudflare API token.

## Connect the repository

1. In the Cloudflare dashboard, open **Workers & Pages** and select **taste**.
   If the Worker does not exist yet, select **Create application > GitHub** and
   select **aka-cronos/taste** instead.
2. For the existing Worker, select **Settings > Builds > Connect**. Authorize the
   Cloudflare GitHub App for this repository and select **aka-cronos/taste**.
3. Set the root directory to the repository root, the production branch to `main`,
   the build command to `pnpm run build`, and the deploy command to
   `pnpm exec wrangler deploy`. Keep the Worker name `taste` to match `wrangler.jsonc`.
   Set the build variable `NODE_VERSION` to `22` and use the pnpm version declared
   in `package.json`. Save the connection.
4. Under **Settings > Build > Branch control**, enable **Preview Builds** for all
   non-production branches. Use `pnpm exec wrangler preview` as the Preview command.
   Configure Preview bindings and variables in Cloudflare; Previews have their
   own settings. Enable the GitHub pull request comments integration when offered.
5. Confirm the production custom domain is `taste.akacronos.com`, matching
   `wrangler.jsonc`. After merging, check the production build and `/api/health`.
   Push a PR branch and check that Cloudflare posts a working Preview URL.

A preview does not deploy to the production custom domain. Review contributions
from forks before allowing them to build with account resources.

See Cloudflare's [Builds setup](https://developers.cloudflare.com/workers/ci-cd/builds/)
and [branch controls](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/).

## Activate branch protection

Manage `protect-main` directly in the repository's **Settings > Rules > Rulesets**
on GitHub. The repository does not store or synchronize a ruleset payload.

Before activating it, open a PR containing the CI workflow and wait until its
`verify` check has reported at least once. Select that check from GitHub Actions
as required. The `audit` job is informational and is not a required status check.

If the ruleset already exists, inspect and update it rather than creating a
duplicate. Confirm it is active with no bypass actors before merging.
