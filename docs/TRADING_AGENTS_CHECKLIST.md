# TradingAgents integration checklist

- [x] Separate task branch/worktree; preserve other checkouts and data.
- [x] Real upstream bull/bear/manager agents; optional pinned dependency.
- [x] Saved NSE summary only, server key, sanitized failures, bounded calls.
- [x] Optional button with billing disclosure and explicit UI states.
- [x] Focused service/API regressions, duplicate-charge lock and cache.
- [x] Backend Ruff, frontend lint and 24 frontend tests.
- [x] Backend suite: 204 tests passed in original environment.
- [x] Installed upstream v0.7.1 (c4544913) in isolated .venv; real factories/client checked offline.
- [x] Production build; browser empty/error/cached-success/expanded-cases checks.
- [x] Narrow layout reviewed; requested 390px override reported actual 542px, so exact phone/device check remains unverified.
- [ ] Live OpenAI review: no backend API key configured; no billed request made.
- [ ] Local commit and final handoff.

Existing full-source mypy baseline: 13 errors in four unrelated files.
