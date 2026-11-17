# TradingAgents integration checklist

- [x] Separate task branch/worktree; preserve other checkouts and data.
- [x] Real upstream bull/bear/manager agents; optional pinned dependency.
- [x] Saved NSE summary only, server key, sanitized failures, bounded calls.
- [x] Optional button with billing disclosure and explicit UI states.
- [x] Focused service/API regressions, duplicate-charge lock and cache.
- [x] Backend Ruff, frontend lint and 24 frontend tests.
- [x] Backend suite: 208 tests passed in isolated optional-dependency environment (81 upstream pandas deprecation warnings).
- [x] Installed upstream v0.7.1 (c4544913) in isolated .venv; real factories/client checked offline.
- [x] Production build; browser empty/error/cached-success/expanded-cases checks.
- [x] Narrow layout reviewed; requested 390px override reported actual 542px, so exact phone/device check remains unverified.
- [ ] Live OpenAI review: no backend API key configured; no billed request made.
- [x] Implementation committed as e0a37bd; consolidated branch dcd8e6a pushed and PR #26 opened to main.
- [ ] Run the full project checks on the combined branch; only the PR's GitGuardian check has passed so far.

Existing full-source mypy baseline: 13 errors in four unrelated files.
