# Branch integration checklist

## Audit

- [x] Refresh Git refs and compare all local/remote branch heads with `origin/main`.
- [x] Confirm `origin/main` at `74e742e`; local `main` initially lagged by three commits.
- [x] Confirm earlier feature branches are already represented in the cached main tree or are superseded snapshots.
- [x] Preserve the staged and unstaged edits in the active FII/DII worktree; exclude them from this merge.

## Integration

- [x] Integrate the scanner clarity, selection-control, and saved-watchlist-state changes from `codex/cta-select-clarity-20261029`, preserving the newer morning-plan and pressure-flow behavior.
- [x] Integrate Market Insights stock details and the beginner drawdown/re-entry guide from `codex/drawdown-response-guide-20261029`.
- [x] Run combined frontend lint, webpack production build, and whitespace checks. The first build caught a duplicate scanner wrapper after merge; the duplicate was removed and the build passed on rerun.
- [ ] Move local `main` forward to the verified integration commit.
- [ ] Confirm GitHub PR and required-check state (blocked: `gh pr list` could not reach `api.github.com`).

## Current boundary

- The GitHub fetch worked, but `gh pr list` could not reach `api.github.com`; PR and CI status remain unverified.
- No test suite was run in this merge pass; frontend ESLint and the production build, including TypeScript validation, passed.
- No push was made. The existing `4003`, `5003`, and `6003` UI services remain stopped as requested.
