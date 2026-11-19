# Issue tracker: GitHub

Issues live in this repo's GitHub Issues. Use the `gh` CLI; it infers the repo from `git remote -v`.

- **Create**: `gh issue create --title "..." --body-file <file>`. New issues start in `needs-triage`.
- **Read**: `gh issue view <n> --json number,title,body,labels,comments`.
- **List**: `gh issue list --state open --label <label> --json number,title,labels`.
- **Comment**: `gh issue comment <n> --body-file <file>`.
- **Labels**: `gh issue edit <n> --add-label "..." --remove-label "..."`. One category and one state at a time.
- **Sub-issue**: `gh issue edit <parent> --add-sub-issue <child>`.
- **Blocking**: GitHub's native dependencies: `gh issue edit <child> --add-blocked-by <blocker>`. Open blockers: `gh api repos/{owner}/{repo}/issues/<n> --jq .issue_dependencies_summary.blocked_by` (0 means startable).
- **Close**: comment the reason first, then `gh issue close <n>`.

GitHub shares one number space between issues and PRs: resolve a bare `#42` with `gh pr view 42`, then `gh issue view 42`.

## Progress

The agent holding an issue keeps one progress comment on it, edited after each finished step: steps done, the next step, decisions so far. Resuming starts from that comment.
