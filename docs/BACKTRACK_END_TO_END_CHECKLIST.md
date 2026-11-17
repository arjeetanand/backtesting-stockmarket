# Backtrack consolidation and workflow handoff

Updated: 2026-11-17 after market close

## Consolidation and saved data

- [x] Closed PR #26 after retaining its source branch and integrating its code locally.
- [x] Preserved the main checkout's SQLite cache, `.env`, official NSE ZIP archive tree, and saved research artifacts.
- [x] Kept the original uncommitted FII/DII edits recoverable in `stash@{0}`; the committed long-range branch is integrated.
- [x] Removed the approved redundant worktrees. `/Users/arjeetanand/projects/stock/backtrack` is the only Backtrack worktree.
- [x] Copied and verified the ten missing CM-UDiFF archives through 2026-11-16; Nov 10 was unavailable at source.
- [x] Synced the 2026-11-17 official NSE archive after close. The root cache now has 5,342 symbols, 9,574,300 daily bars, and a latest session of 2026-11-17.
- [x] Sync All Market Data saved the official NSE FII/DII report through 2026-11-17 (2 rows new or changed). A final manual recheck on 2026-11-17 found the official report current with 0 new or changed rows. A current read-only audit confirmed 5 official NSE FII/DII dates through 2026-11-17. Tapetide history ends at 2026-10-30 with 28 known NSE sessions missing; its latest live retry could not reach the provider.
- [x] The user's Drive folder contains three archive bundles: `Backtrack_NSE_Archives_2026-11-17.tar.gz`, `Backtrack_NSE_Archives_Update_2026-11-17.tar.gz`, and `Backtrack_NSE_Archives_PostClose_2026-11-17.tar.gz`, each with a checksum sidecar. The post-close package SHA-256 is `f1b0d2b8d79921092679090de45567648f11192f61de564bc6144be7b1360441`. The 9 GB SQLite database may contain portfolio data and remains local; it was not uploaded.

## End-to-end research workflow

- [x] Stock research reports 20/50/200-session averages, the 20-completed-month average, RSI, MACD, ATR, recent range, relative volume, returns, and the actual cached data date.
- [x] The fixed rule explains why a setup qualifies or fails. Entry, stop, and 1R/2R targets are conditional references; the page does not invent fair value or promise an ideal price.
- [x] The historical evidence gate shows pass, fail, or insufficient evidence with the reasons. A completed analysis does not guarantee future performance.
- [x] Completed eligible watch/triggered long setups are saved as immutable, dated snapshots and compared with up to 20 later cached daily sessions. Same-day stop/target touches are marked ambiguous. These are price observations, not actual fills or AI training labels.
- [x] Forward tracking separately records whether the setup's entry reference was met on the signal close or touched in a later session, and shows a bounded price-path summary. Daily OHLCV cannot explain the cause of a move or reveal intraday event ordering.
- [x] Re-ran YESBANK after the 2026-11-17 sync. Latest close is ₹17.85; the rule found no long setup, and the historical gate is not evaluable (16 held-out trades, 37.5% wins). No forward prediction was recorded because no eligible setup existed.
- [x] `/portfolio` previews XLSX, PDF, and image holdings locally, allows edits before confirmation, saves only normalized confirmed positions, and values them using cached NSE daily closes. Missing/stale prices and insufficient indicator history stay visible.
- [x] Portfolio analysis applies the shared fixed long-only rule to each holding, shows its reasons and conditional entry/stop/1R/2R levels, and labels the historical validation gate as not evaluated. It does not rank holdings or calculate an optimal allocation.
- [x] A user-triggered global-market brief uses OpenAI web search, stores dated citations locally, and keeps portfolio files, positions, and cached prices out of the request.
- [x] Stock research and portfolio are linked in the Markets navigation; the existing backtesting and research routes remain available.

## Verification and current limits

- [x] Full backend pytest suite passed; two optional TradingAgents package tests were skipped because `tradingagents` is not installed in the root `.venv`.
- [x] Ruff and targeted mypy passed for the changed service/API modules. Repository-wide mypy still reports 13 existing typing/stub issues in other modules.
- [x] Frontend ESLint, Vitest (24 tests), TypeScript, and webpack production build passed. Default Turbopack build could not bind its internal port in the restricted environment.
- [x] Read-only database freshness recheck at 2026-11-17 19:23 IST confirmed 5,342 symbols, 9,574,300 daily bars, and latest NSE close date 2026-11-17; no later NSE session was available on this date.
- [x] Synthetic XLSX, PDF, and image holdings were shown in the browser as editable previews; PDF and image each recognized 2 rows with local Poppler/Tesseract. No preview was saved to the user's database.
- [ ] This session's browser and HTTP checks received connection refused. The safe launcher could not leave the app running because the sandbox denied process inspection and loopback binding (`EPERM`); it did not stop an unverified listener, and no Backtrack service process was visible afterward.
- [ ] Run a real paid OpenAI review or global brief after the owner privately configures `OPENAI_API_KEY`; no non-empty key was found and this task made no paid request.
- [ ] Retry the Tapetide history sync when this environment can reach the provider; the latest attempt failed with `Could not reach Tapetide`, and saved history ends at 2026-10-30 with 28 known sessions missing.

NSE history is official end-of-day data, not live prices. Backtrack does not connect to a broker, place trades, guarantee returns, adjust for every corporate action, or evaluate a recommendation as a filled trade. The built-in broad scan is NIFTY 50; other NSE symbols can be searched individually. Portfolio parsing is heuristic and every detected row must be reviewed.

The task branch is `codex/backtrack-unification-20261117`, with integration commit `d381612`, OCR/Tapetide fix `6f5ca37`, launcher fix `25422e7`, and portfolio/tracking follow-up `9bac392`. PR #26 is closed and this task branch has not been pushed or merged into remote `main`.
