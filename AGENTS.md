# Agent instructions

Read [.agents/rules/core.md](.agents/rules/core.md) before working in this repository.

## Agent process

Issues move from triage to merge through the agent process; each stage follows its playbook.

- Issues: GitHub issues through `gh`. See `docs/agents/issue-tracker.md`.
- Labels: one category (`bug`, `feature`, `refactor`, `docs`, `chore`), one state (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, `in-progress`, `stuck`), a priority (`P1`–`P3`) and `v1` for the current scope. An issue with an open blocker never moves to `ready-for-agent`.
- Domain: single-context. See `docs/agents/domain.md`.
- Worktrees: one issue, one branch, one worktree from fresh `main`. See `docs/agents/worktree.md`.
- Verification: the `verify-taste` skill; evidence goes in `.evidence/<issue>/` and reaches the PR as attachments.
- Environments, deploy and rollback: `docs/agents/environments.md`.
- Project data for scripts (UI files, sensitive zones, e2e folder): `.agents/process.json`.
