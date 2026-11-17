# Backtrack consolidation and workflow handoff

Updated: 2026-11-17 after market close

## Consolidation and saved data

- [x] Closed PR #26 after retaining its source branch and integrating its code locally.
- [x] Preserved the main checkout's SQLite cache, `.env`, official NSE ZIP archive tree, and saved research artifacts.
- [x] Kept the original uncommitted FII/DII edits recoverable in `stash@{0}`; the committed long-range branch is integrated.
- [x] Removed the approved redundant worktrees. `/Users/arjeetanand/projects/stock/backtrack` is the only Backtrack worktree.
- [x] Copied and verified the ten missing CM-UDiFF archives through 2026-11-16; Nov 10 was unavailable at source.
- [x] Synced the 2026-11-17 official NSE archive after close. The root cache now has 5,342 symbols, 9,574,300 daily bars, and a latest session of 2026-11-17.
- [x] Sync All Market Data saved the official NSE FII/DII report through 2026-11-17 (2 rows new or changed). Tapetide returned an unexpected history response; its saved history has not been refreshed.
- [x] Uploaded the post-close archive addendum and checksum sidecar to the user's Drive folder: `Backtrack_NSE_Archives_PostClose_2026-11-17.tar.gz` and `.sha256`. Package SHA-256: `f1b0d2b8d79921092679090de45567648f11192f61de564bc6144be7b1360441`. The existing full bundle and earlier addendum remain untouched.

## End-to-end research workflow

- [x] Stock research reports 20/50/200-session averages, the 20-completed-month average, RSI, MACD, ATR, recent range, relative volume, returns, and the actual cached data date.
- [x] The fixed rule explains why a setup qualifies or fails. Entry, stop, and 1R/2R targets are conditional references; the page does not invent fair value or promise an ideal price.
- [x] The historical evidence gate shows pass, fail, or insufficient evidence with the reasons. A completed analysis does not guarantee future performance.
- [x] Completed eligible watch/triggered long setups are saved as immutable, dated snapshots and compared with up to 20 later cached daily sessions. Same-day stop/target touches are marked ambiguous. These are price observations, not actual fills or AI training labels.
- [x] Re-ran YESBANK after the 2026-11-17 sync. Latest close is ₹17.85; the rule found no long setup, and the historical gate is not evaluable (16 held-out trades, 37.5% wins). No forward prediction was recorded because no eligible setup existed.
- [x] `/portfolio` previews XLSX, PDF, and image holdings locally, allows edits before confirmation, saves only normalized confirmed positions, and values them using cached NSE daily closes. Missing/stale prices and insufficient indicator history stay visible.
- [x] A user-triggered global-market brief uses OpenAI web search, stores dated citations locally, and keeps portfolio files, positions, and cached prices out of the request.
- [x] Stock research and portfolio are linked in the Markets navigation; the existing backtesting and research routes remain available.

## Verification and current limits

- [x] Full backend pytest suite passed. The two optional TradingAgents package tests were skipped in the root `.venv` because `tradingagents` is not installed there.
- [x] Full Ruff passed. Targeted mypy passed on the ten changed backend files; the repository-wide run still reports 13 existing typing/stub issues in other modules.
- [x] Frontend ESLint, Vitest (24 tests), TypeScript, and webpack production build passed. Default Turbopack build could not bind its internal port in the restricted environment.
- [x] Browser showed the portfolio empty state and successfully parsed a synthetic XLSX into an editable preview. The synthetic row was not saved to the user's database.
- [x] App is running from the one root project on UI `http://localhost:4003` and API `http://localhost:8001`.
- [ ] Run a real paid OpenAI review or global brief after the owner privately configures `OPENAI_API_KEY`; no non-empty key was found and this task made no paid request.
- [ ] Tapetide latest-history sync needs a retry after its unexpected-response error.

NSE history is official end-of-day data, not live prices. Backtrack does not connect to a broker, place trades, guarantee returns, adjust for every corporate action, or evaluate a recommendation as a filled trade. The built-in broad scan is NIFTY 50; other NSE symbols can be searched individually. Portfolio parsing is heuristic and every detected row must be reviewed.

The task branch is `codex/backtrack-unification-20261117`. PR #26 is closed and this task branch has not been pushed or merged into remote `main`.
