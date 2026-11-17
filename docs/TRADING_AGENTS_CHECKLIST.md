# TradingAgents integration checklist

- [x] Separate task branch/worktree; preserve other checkouts and data.
- [x] Real upstream bull/bear/manager agents; optional pinned dependency.
- [x] Before every review, sync the latest published official NSE daily archive and rebuild the selected stock analysis.
- [x] Block AI review on hard sync failure; record partial sync status and the actual data date when NSE has not published all requested archives.
- [x] Persist each review attempt, sync outcome, analysis run, data fingerprint, model, result/cache status, and error in local SQLite; expose per-symbol saved history and reopenable analyses.
- [x] Reuse an existing AI result only when model, data fingerprint, and data age match; process-local lock prevents concurrent duplicate charges.
- [x] Saved NSE summary only, server key, sanitized failures, bounded calls, and explicit OpenAI billing disclosure.
- [x] Focused API regressions for fresh-bar evidence, partial/hard sync failures, provider failures, cached review reuse, and history cleanup.
- [x] Full backend suite: 216 tests passed; Ruff passed. Pandas 3.1.1 emitted 81 existing inplace-deprecation warnings.
- [x] Frontend: 24 tests, lint, and TypeScript check passed.
- [x] Webpack production build passed and generated all 24 routes.
- [x] Targeted mypy passed for changed API/service/repository modules. Full-source mypy retains 13 existing errors in four unrelated files.
- [x] Installed upstream v0.7.1 (c4544913) in isolated `.venv`; upstream factories/client checked offline with a fake LLM.
- [x] Browser showed the refreshed workflow explanation, Review with AI control, and empty saved-history state after a local stock analysis.
- [x] Narrow layout reviewed; requested 390px override reported actual 542px, so exact phone/device check remains unverified.
- [x] Live NSE sync on the isolated task cache: 10 archive days saved through 2026-11-16; 1 weekday archive was unavailable. YESBANK's latest cached bar is 2026-11-16.
- [ ] Live OpenAI review: not run; no API key configured and no billed request made.
- [x] Implementation branch `codex/tradingagents-codex-20261117`, pushed to the approved PR #26 targeting `main`; PR remains open and unmerged.

Run with `./run.sh` (UI port 4003, API port 8001). Set `OPENAI_API_KEY` in the backend `.env` privately and click **Review with AI** to perform a live review. Keep the existing full-source mypy baseline under review; its 13 errors are outside this change.
