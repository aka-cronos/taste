# Domain docs

## Before exploring, read these

- `GLOSSARY.md` at the root.
- `docs/adr/`: the ADRs that touch the area you are about to change.

When they do not exist yet, go on: the `domain-modeling` skill creates them when a term or a decision gets settled.

## Use the glossary's words

Name domain concepts as `GLOSSARY.md` defines them, in issue titles, test names and code. A concept missing from the glossary is either language the project does not use (reconsider) or a gap (note it for `domain-modeling`).

## Flag ADR conflicts

When your change contradicts an ADR, say so in the PR and why it is worth reopening; never override it silently.
