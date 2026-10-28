# Single-stock research checklist

- [x] Add local-symbol lookup and a one-stock daily-history analysis page.
- [x] Show the saved-data date and range, SMA20/50/200, RSI14, MACD, ATR, prior 20-session range, volume ratio, and historical price returns with plain-language explanations.
- [x] Give conditional long-only entry, stop, 1R/2R targets, and exit rules; make clear that no live quote or order is produced.
- [x] Backtest a fixed rule on chronological 70/30 training and held-out periods, include modeled costs, trade-level outcomes, and reasons when the requested screen is not met.
- [x] Require at least five years, 30 closed out-of-sample trades, 70% win rate, positive net expectancy and compounded return, and cash-based profit factor above 1 before passing the historical screen.
- [x] Persist each completed, insufficient-data, and failed analysis as a unique local SQLite run; show recent records and separate all-time completed, failed, insufficient-data, passed, failed-gate, and not-evaluable counts.
- [x] Add focused service/API tests for Wilder-seeded RSI/ATR, prior-range lookahead, next-session entry and stop-first ambiguity, whole-share sizing, cash-based profit factor, the compounded-return gate, repeated insufficient-data logs, optional catalogue failure, and invalid-candle failure logs.
- [x] Verify the final rule on a read-only sample copied from the main local NSE cache: 12 symbols, 985 daily bars each, 2022-10-28–2026-10-27. Results had 0–5 held-out trades per symbol; none met the evidence gate. Five UI runs (two in the initial pass and three during final review) were recorded in the isolated preview DB, for 29 attempts total.
- [x] Browser-check symbol search and full TCS and RELIANCE results: 4.0 years of bars, 0/1 out-of-sample trades, “not enough evidence,” price/indicator explanations, conditional levels, cash P&L, and persisted attempt counts.
- [x] Report historical price returns only. The local OHLCV cache has no fundamentals or analyst earnings estimates, so it cannot support a factual future-business-growth forecast.
- [x] Run the full backend suite, Ruff, frontend Vitest (19 tests), ESLint, and webpack production build. `mypy src` retains 13 errors in four pre-existing, unchanged source files.
- [x] Source-check responsive navigation: Stock Research is available under the mobile **More → Explore markets** menu; wide tables use horizontal scrolling. Exact mobile-width rendering was unavailable because the browser connection exposes no viewport override.
- [x] Record delivery: implementation branch `codex/single-stock-analysis-20261028`, source commit `d47adb3`, PR [#15](https://github.com/arjeetanand/backtesting-stockmarket/pull/15), squash-merged into `main` as `a64a87a329a3e9c1c436a8f00ac856e350407c05`; GitHub reported the repository check passing.

## Evidence and delivery

- Main local cache was queried read-only; the isolated test database contains only sampled OHLCV and 29 test run artifacts.
- Gate results from the 12-symbol sample: RELIANCE 1 trade (1 win); TCS 0; INFY 1 (0 wins); HDFCBANK 0; ICICIBANK 1 (1 win); SBIN 3 (0 wins); ITC 0; LT 5 (0 wins); AXISBANK 3 (1 win); BEL 4 (0 wins); MARUTI 2 (1 win); SUNPHARMA 3 (1 win). These samples are too small for validation regardless of apparent win rate.
- Modeled fees exclude brokerage, exchange charges, GST, dividends, and corporate-action adjustments. Raw history is not adjusted for splits or bonus issues. See the page for source links and assumptions.
- The production `npm run build` defaults to Turbopack, which rejects this worktree's existing `frontend/node_modules` symlink outside the sandbox; the webpack production build completed successfully.
- Full backend pytest suite and Ruff passed. Frontend Vitest passed (19 tests), ESLint passed, and `next build --webpack` passed. `mypy src` reports 13 existing errors across four unchanged files (`repositories/market_cache.py`, `pattern_finder.py`, `services/breakout_scanner.py`, `services/ml_research.py`).
- Final local run ledger: 29 completed; 0 failed attempts; 0 passed; 0 failed gates; 29 not evaluable because the supplied four-year histories and small OOS trade counts do not satisfy the minimum screen.
- The merged implementation is on `origin/main` at `a64a87a`; PR #15 was squash-merged after its required check passed.

## Beginner-first morning scan follow-up

- [x] Add a bounded NIFTY 50 scan using the same per-symbol fixed rule and historical evidence gate as individual research; each analysis remains in the append-only SQLite ledger.
- [x] Return a candidate only when its latest completed daily bar triggers the rule and its own held-out screen passes all requirements, including at least 70% wins, 30 closed trades, five years, positive expectancy/compounded return, and profit factor above one.
- [x] Count raw qualifying signal bars separately from closed simulated trades; show scanned symbols, data coverage, analysis errors, incomplete history, passed/failed gates, and non-evaluable tests.
- [x] Refresh the shared NIFTY 50 symbol basket from the official NSE Indices constituent CSV updated 2026-10-28, including exchange symbol codes; keep the snapshot date visible.
- [x] Keep price targets conditional and explain that daily bars cannot confirm pre-open gaps, fills, or an exact intraday sell time. Future business growth remains unavailable from OHLCV; link to the symbol's NSE financial-results filings.
- [x] Explain that coverage counts can overlap gate outcomes, each symbol attempt is persisted individually, and the combined scan summary is view-only.
- [x] Disclose that the current constituent list is applied across each symbol's full history; former members and ticker continuity are not modeled, so this is not a survivorship-free index test.
- [x] Add regression coverage for scan qualification, signal occurrence counts, symbol membership, and the scan API schema.
- [x] Run the full backend pytest suite, Ruff, frontend Vitest (19 tests), ESLint, and webpack production build. `mypy src` retains the same 13 errors in four pre-existing files.
- [x] Run a real scan against an isolated copy of local NSE history: 50/50 symbols had some data, but all had fewer than the 221 bars needed to complete analysis; 50 were insufficient-history and not evaluable, with 0 analysis errors, 0 missing-data symbols, 0 passed/failed gates, 0 fresh triggers, and 0 candidates. Latest saved data was 2026-10-27. The cache cannot support an acceptable 70%+ result yet.
- [x] Inspect the page at the available narrow browser width (695 px); no visible horizontal overflow. The existing preview API returned 404 for the new scan route, so scan-result runtime rendering was not verified there; exact 390 px mobile rendering was unavailable. The production build and schema/API test passed.
