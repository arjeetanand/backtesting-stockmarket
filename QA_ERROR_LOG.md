# Backtrack end-to-end QA error log

Test session: 2026-07-25 (Asia/Kolkata)

Environment tested:

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://127.0.0.1:8000`
- Browser validation: Chrome in-app browser workflow
- Local cache: 5,055 symbols and about 9.36 million OHLCV bars

## Issues found and resolved

### 1. Watchlist page returned a Next.js 404

- **Symptom:** Navigating to `/watchlist` returned `404 This page could not be found`, even though the watchlist page source and sidebar link existed.
- **Cause:** The running Next.js dev server had started before the current watchlist route was available. Its file watcher was also reporting `EMFILE` watcher errors, so it did not discover the route reliably.
- **Fix:** Restarted the frontend dev server using the current source/build directory.
- **Verification:** `/watchlist` now returns HTTP 200 and renders `Daily Watchlist & Setup Tracker` with the empty-state UI.

### 2. Backend watchlist and daily-sync routes were unavailable in the running process

- **Symptom:** `GET /api/v1/watchlist` and `POST /api/v1/data/sync-today` returned 404 from the old running backend process, despite the routes being present in source.
- **Cause:** The process had been started before the latest route additions were loaded.
- **Fix:** Restarted the backend on port 8000 from the current source.
- **Verification:**
  - `GET /api/v1/watchlist` returns `200 []`.
  - `POST /api/v1/data/sync-today` returns HTTP 200 and correctly reports that the cache is already up to date.

### 3. DELETE requests were blocked by CORS

- **Symptom:** Browser preflight for watchlist/test deletion returned `400 Disallowed CORS method`.
- **Cause:** FastAPI CORS configuration allowed only `GET` and `POST`, while the UI uses `DELETE` for saved tests and watchlist items.
- **Fix:** Added `DELETE` to `allow_methods` in `src/quant_research/api/main.py`.
- **Verification:** After restarting the backend, a browser-style DELETE preflight returns HTTP 200 with `access-control-allow-methods: GET, POST, DELETE`.

### 4. Concurrent backtests could fail with `database is locked`

- **Symptom:** Running multiple strategy previews/backtests at the same time produced a 500 error in the backend and left the UI showing a misleading local-service error.
- **Cause:** SQLite connections used the default immediate lock timeout. Multiple frontend instances and concurrent artifact writes contended for the same local database.
- **Fix:** Added a 30-second SQLite connection timeout and `PRAGMA busy_timeout = 30000` to the artifact, backtest, and market-cache repositories.
- **Verification:** Retrying the same strategy preview completed successfully and rendered the result (`1,237 bars`, result metrics, and run ID) without an error. Three concurrent identical custom backtest requests also returned HTTP 201 after the timeout fix.

### 5. Saved SMA tests displayed `SMA undefined/undefined`

- **Symptom:** The My Tests table displayed entries such as `SMA undefined/undefined` for older saved custom artifacts.
- **Cause:** Older custom artifacts do not include `fast_window` and `slow_window`, but the frontend interpolated those optional values directly.
- **Fix:** Added a safe display fallback of `SMA 20/50` in `frontend/src/app/backtests/page.tsx`.
- **Verification:** The label no longer renders `undefined`; existing artifacts remain readable without changing stored data.

### 6. Data page KPI displayed an unclear value (`1851.0×`)

- **Symptom:** The “Candles available” card displayed a ratio with a multiplication sign, which was not a meaningful candle count.
- **Cause:** The UI divided total bars by symbols and formatted the result as `×` without explaining it.
- **Fix:** Renamed the KPI to `Average candles / stock` and displays a rounded localized count (`1,851` for the current cache).
- **Verification:** The data page now presents the metric as an understandable average rather than an unexplained multiplier.

### 7. Frontend dev watcher reported `EMFILE: too many open files, watch`

- **Symptom:** Next.js printed repeated Watchpack `EMFILE` errors while serving the app.
- **Cause:** Multiple local dev servers/watchers were active at the same time. The server still served pages, but hot route discovery was unreliable.
- **Fix:** Restarted the frontend after route changes, isolated each configured frontend port in its own Next.js build directory (`.next-port-<port>`), and enabled `WATCHPACK_POLLING=true` in the launcher/npm port scripts. These directories are ignored by Git.
- **Verification:** A fresh frontend on port 3100 started without Watchpack EMFILE errors; the default port launcher now uses the same polling mode.

### 8. Newly bookmarked watchlist setups could be marked as already completed

- **Symptom:** A setup bookmarked from the automated breakout scanner showed `Target hit` immediately, even though its current price equalled the entry price.
- **Cause:** The watchlist service compared the target and stop against the symbol's entire cached history, including candles from before the setup's entry date.
- **Fix:** Filter OHLCV bars to `bar date >= entry_date` before evaluating target/stop status. If no post-entry bar exists, the setup remains active. Added a regression test covering pre-entry target and stop hits.
- **Verification:** Focused watchlist tests pass (`2 passed`); a new setup is no longer completed by unrelated historical highs/lows.

## Validation completed so far

- All 17 currently reachable application routes rendered meaningful content after restart, including `/watchlist`.
- Research flow completed a real local NSE backtest and rendered chart, markers, trades, metrics, drawdown, and helper response.
- Unsupported hourly timeframe produced an explicit unavailable/disabled state.
- Strategy Lab template search, template selection, indicator collapse, validation state, preview, and result rendering were exercised.
- YouTube strategy import accepted a transcript, extracted reviewable rules, and produced a working handoff link to Research.
- Data page loaded the real local cache, validated custom-date errors, and exposed stock search controls.
- Automated breakout scanning produced setups, bookmarking persisted an item, and watchlist tracking now evaluates only post-entry candles.
- Replay completed a candle step, placed and closed a simulated order, and finished with the final equity journal entry.
- Robustness analysis produced score, parameter-grid, out-of-sample, Monte Carlo, and stress-condition output from local history.
- ML Lab completed a chronological experiment, rendered diagnostics, and refreshed the saved-experiment list.
- Comparison ran three selected rules against identical inputs and rendered return, Sharpe, drawdown, win-rate, and trade-count results.
- Options education recalculated the payoff and break-even after changing the premium input.
- Saved-test detail opened from My Tests, and Settings save/reset persisted and restored a browser preference.

## Remaining known issues

- `npm --prefix frontend run lint` still reports 16 existing source-level React/Next errors and 16 warnings. They are static-analysis debt in effect/state patterns, unused imports, render-time mutation, and a font-placement warning; the production build and runtime flows pass. They are listed in `COMPLETE_PROJECT_GUIDE.md` and should be refactored separately.
- The non-destructive feature pass is complete for replay, scanner, robustness, ML Lab, comparison, options, settings, analytics entry points, saved tests, watchlist, data, strategy, research, and pattern analysis. Destructive history clearing was intentionally not clicked because it would delete user data; DELETE was validated with a disposable watchlist item and concurrent backtest requests.
