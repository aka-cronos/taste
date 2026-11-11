# Contributing

Open an issue before starting a change so its scope can be agreed on. Use the bug
or feature request template. Report vulnerabilities through [private reporting](SECURITY.md).

## Local development

Use Node 22 (see `.nvmrc`) and the pnpm version in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

See [README.md](README.md) for local bindings and migrations.

## Pull requests

Work on a branch and open a PR against `main`. Use a concise, imperative title
with a conventional prefix such as `fix:`, `feat:`, or `chore:`. Link the agreed
issue with `Closes #<number>`, describe the behavior change, and record validation.
Keep examples synthetic; exclude real secrets and personal data.

Run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and `pnpm build`
before requesting review. The `verify` check must pass before squash merging.
