# Backtrack — Complete Knowledge-Transfer Guide

Last reviewed: 2026-07-25

This handbook is a practical map of the current Backtrack system. It combines the existing product, backend, frontend, handover, testing, UX, and QA documentation without replacing them. Use the linked documents for deeper detail:

- [README.md](README.md) — setup, product boundary, primary workflows, and limitations.
- [PROJECT_GUIDE.md](PROJECT_GUIDE.md) — page-by-page user behavior.
- [backend/README.md](backend/README.md) — FastAPI, importer, SQLite, and API details.
- [frontend/README.md](frontend/README.md) — Next.js routes, chart contracts, and frontend structure.
- [handover.md](handover.md) — engineering source of truth for persistence and domain behavior.
- [TESTING.md](TESTING.md) — test and release contract.
- [UX_AUDIT.md](UX_AUDIT.md) — UX findings and prioritized follow-up work.
- [QA_ERROR_LOG.md](QA_ERROR_LOG.md) — end-to-end QA issues and environment notes.
- [AI_ML_INTERVIEW_GUIDE.md](AI_ML_INTERVIEW_GUIDE.md) — interview preparation, ML concepts, examples, and project stories.

When these documents disagree, prefer the running code and API schemas, then `handover.md`, then the focused backend/frontend guides, then this summary.

## 1. Product boundary

Backtrack answers a historical question: what would a defined strategy have produced for a selected stock, timeframe, capital, and date range?

- It is local, free, and research-only for the Indian market.
- It uses official NSE daily archive data stored locally.
- Backtests, replay orders, breakout setups, and watchlist tracking are simulations.
- There is no broker execution, Dhan/Zerodha/Upstox order API, live quote stream, paid data provider, or real-order side effect.
- Missing data must produce an import or unavailable state. Never fabricate prices, candles, volume, or trade outcomes.
- YouTube and Ollama output is reviewable assistance, not an automatic trading instruction.

## 2. Repository ownership and architecture

```text
Next.js browser UI: frontend/src/
        │ JSON HTTP /api/v1
        ▼
FastAPI application: src/quant_research/api/
        │
        ▼
Services and domain: src/quant_research/services/, domain/, data_providers/
        │
        ▼
SQLite + official NSE ZIPs: data/market_cache.sqlite3, data/nse_archives/<year>/
```

Backend ownership:

- `src/quant_research/api/` — FastAPI app, settings, schemas, routes, CORS, dependency wiring.
- `src/quant_research/data_providers/` — local NSE provider and compatibility adapters.
- `src/quant_research/domain/` — indicators, strategy DSL, vector engine, analytics, and validity checks.
- `src/quant_research/services/` — imports, research, YouTube, replay, ML, scanner, watchlist, and strategy workflows.
- `src/quant_research/repositories/` — SQLite persistence for market data, backtests, artifacts, and watchlist items.

Frontend ownership:

- `frontend/src/app/` — App Router pages.
- `frontend/src/components/` — shared shell, controls, charts, and learning components.
- `frontend/src/lib/api.ts` — timeout-aware API helpers.
- `frontend/src/lib/chart-data.ts` — API-independent financial chart contracts.
- `frontend/src/lib/research-chart.ts` — market/backtest payload adapters.
- `frontend/src/lib/strategy-library.ts` — shared strategy catalogue.
- `frontend/src/lib/agents/` — deterministic local research workflow modules; they do not place orders.
- `frontend/src/app/globals.css` — shared Backtrack/Stitch visual tokens and responsive page styles.

### Unified strategy catalogue

`frontend/src/lib/strategy-library.ts` is the frontend strategy source of truth. `STRATEGY_LIBRARY` exposes one canonical template per executable `strategyId`; `getUnifiedTemplates()` feeds Strategy Lab, `getUnifiedComparisonList()` feeds Comparison and the Market Scanner, and `UNIFIED_STRATEGIES` feeds Research and Strategy Import. Golden Cross remains in the source catalogue as an educational variant but resolves to the canonical 20/50 SMA crossover template so the same engine ID cannot silently mean different rules on different pages. The backend scanner validates the same IDs against `SUPPORTED_STRATEGY_IDS` and routes every scanner run through `run_rule_backtest`, the shared vector engine used by the rest of the application.

## 3. Local setup and runtime pairing

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e "[dev]"
cp .env.example .env
npm --prefix frontend install
```

Start the backend and frontend as a matched pair:

```bash
./scripts/dev-backend.sh 8000
./scripts/dev-frontend.sh 3000 8000
```

The frontend API base is normally `http://127.0.0.1:8000/api/v1`. For another pair, use matching ports, for example `./scripts/dev-backend.sh 8001` and `./scripts/dev-frontend.sh 3001 8001`. An explicitly set `NEXT_PUBLIC_API_BASE_URL` takes precedence.

The named frontend development scripts isolate their Next output under `.next-port-<port>` and enable `WATCHPACK_POLLING=true` by default. This reduces stale route discovery and macOS watcher exhaustion when multiple local instances or large NSE trees are open. Set `WATCHPACK_POLLING=false` only when the environment has sufficient file-watcher capacity.

Useful checks:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/data/cache
```

Ollama is optional. If it is unavailable, Research must label the deterministic fallback instead of implying that a model ran.

## 4. Backend data and persistence contract

### NSE import lifecycle

`NseBhavcopyImporter` works per trading-day archive, not per stock:

1. Normalize the requested date range.
2. Check SQLite coverage and the local archive folder.
3. Reuse a saved ZIP where possible; otherwise download one official NSE archive.
4. Save the exact ZIP under `data/nse_archives/<year>/`.
5. Retain every raw CSV row in `nse_bhavcopy_rows`.
6. Normalize supported `EQ`, `BE`, and `ETF` rows into `ohlcv_bars`.
7. Persist raw rows, candles, archive metadata, and coverage atomically.
8. Mark an archive day complete only after the transaction succeeds.

Dates before 2024 use the legacy historical-equity format. Later dates use Common Bhavcopy/UDiFF aliases. A single archive contains the exchange-wide daily file, so there is no per-symbol download step.

### SQLite tables

| Table | Responsibility |
| --- | --- |
| `ohlcv_bars` | Normalized candles keyed by `(symbol, timeframe, timestamp)` |
| `instruments` | Searchable official NSE catalogue metadata |
| `nse_import_coverage` | Symbol/timeframe/trading-day coverage markers |
| `nse_archive_days` | Archive status, source, ZIP path, and row count |
| `nse_bhavcopy_rows` | Retained raw archive rows as JSON |
| `backtest_runs` | Saved backtests and cache keys |
| `research_artifacts` | Hypotheses, custom results, robustness, YouTube, imports, and replay artifacts |
| `watchlist_items` | Simulated scanner setup bookmarks and status; status evaluation uses bars on/after the setup entry date |

The market cache uses the candle primary key and an indexed symbol/timeframe/timestamp lookup. Its in-memory cache is invalidated by writes. SQLite connections use a 30-second timeout and `PRAGMA busy_timeout = 30000` to tolerate concurrent local reads and artifact writes.

## 5. Backend API map

All routes are prefixed with `/api/v1`.

| Area | Important routes | Purpose |
| --- | --- | --- |
| System | `GET /health`, `GET /providers` | Service and provider status |
| Data | `GET /data/cache`, `/data/availability`, `/data/instruments`, `/data/inventory` | Local cache and catalogue state |
| Import | `POST /data/nse-import/preview`, `POST /data/nse-import`, `GET /data/nse-import/{job_id}` | Preview, queue, and poll bulk NSE imports |
| Sync | `POST /data/sync-today` | Import missing current archive data when available |
| Research | `POST /research/ensure-data`, `/research/hypothesis`, `POST /strategy/youtube` | Prepare data and produce reviewable research drafts |
| Backtests | `POST /backtests/sma-crossover`, `/backtests/custom`, `GET/DELETE /backtests`, `GET/DELETE /backtests/{run_id}` | Run, persist, list, and remove historical tests |
| Chart | `GET /market-data` | Return validated local bars, indicators, volume, and signal metadata |
| Diagnostics | `POST /robustness/analyze`, `POST /bias-validity/audit`, `POST /pattern-finder/test` | Reliability, bias, and historical pattern analysis |
| ML | `POST /ml/experiments`, `GET /ml/experiments` | Chronological, past-only, cost-aware experiments |
| Scanner | `POST /market-scanner/run` | Multi-stock strategy results and sector aggregates |
| Breakout | `POST /breakout-scanner/scan` | Local historical 52-week, VCP, SMA, and RSI setup detection |
| Watchlist | `POST /watchlist/add`, `GET /watchlist`, `DELETE /watchlist/{item_id}` | Persist and track simulated setup bookmarks |
| Replay | `/replay/sessions` and its step/order/close/finish routes | Candle replay and simulated orders |

The scanner request is normally `{ "universe": "nifty500", "strategy_type": "sma_crossover" }`. Breakout scanning accepts a conviction threshold and limit. Neither endpoint may invent a price when the local cache is empty.

### Strategy execution contract

The vector backtest engine calculates a signal after candle close `T` and fills it at the next candle open `T+1`. Fees, slippage, position sizing, stop loss, and take profit remain shared controls. Current deterministic strategy IDs include SMA/EMA crossover, RSI/EMA, RSI mean reversion, Bollinger mean reversion, MACD crossover, Donchian breakout, momentum, and the seven Backtrack price-action interpretations:

- support/resistance breakout;
- market-structure break;
- Fibonacci retracement;
- price-action reversal;
- supply/demand zones;
- ICT-style liquidity/FVG daily approximation;
- multi-timeframe trend confirmation.

The seven are configurable Backtrack interpretations, not exact YouTube transcriptions. ICT-style logic is only a daily approximation because the current official data path is daily rather than intraday.

### Error contract

- `422` — invalid request, unsupported parameter, or insufficient history; show a correction/import action.
- `404` — unknown run, artifact, job, or replay session.
- `409` — requested import range is already fully available.
- `502` — upstream NSE, YouTube, or Ollama failure.
- `503` — required local service/provider is unavailable.

Backend errors should stay explicit. Frontend catch blocks must not replace them with fake prices or successful-looking data.

## 6. Frontend route map and workflows

| Route | Role |
| --- | --- |
| `/` | Workflow chooser only; no duplicate stock/date state |
| `/data` | Bulk NSE import and local catalogue search |
| `/research` | Hypothesis review, data preparation, strategy test, charts, and results |
| `/strategy` | Indicator/rule strategy builder |
| `/strategy-import` | Reviewable YouTube strategy extraction |
| `/backtests`, `/backtests/[id]` | Saved tests and persisted detail |
| `/replay` | Historical candle replay with paper orders |
| `/comparison` | Compare saved tests |
| `/robustness` | Sensitivity, Monte Carlo, walk-forward, and stress checks |
| `/bias-validity` | Look-ahead, data-quality, and overfitting checks |
| `/market-scanner` | Multi-stock strategy scan and breakout setup recognition |
| `/watchlist` | Simulated setup tracking with active/target/stop states |
| `/ml-lab` | Chronological ML experiments and diagnostics |
| `/pattern-finder` | Historical pattern detection and review |
| `/options` | Educational payoff and breakeven calculator |
| `/analytics` | Performance and trade-quality views |
| `/settings` | Local cache, API, Ollama, and provider status |

### Stitch-aligned visual work

The recent route-specific visual reference is Stitch project `8571994091810308125`. The implementation preserves the existing Backtrack shell and API behavior while applying the reference composition:

- Market Scanner: a narrow technical-criteria rail, four KPI cards, and two-column data-backed stock cards with strategy versus buy-and-hold return bars and risk metrics.
- Market Scanner sector heatmap: a real treemap-style sector surface where tile area represents the number of scanned stocks and color can be switched between strategy return, strategy alpha versus buy-and-hold, and win rate. Selecting a tile loads the sector's top stocks ranked by an explainable research score using return, alpha, win rate, and drawdown, with a direct Research handoff. This follows the interaction pattern used by [TradingView heatmaps](https://www.tradingview.com/support/solutions/43000766446-tradingview-heatmaps-from-global-trends-to-details/) and [Finviz market maps](https://finviz.com/map?preset_order=true&t=sec_all), without claiming market-cap sizing that is not present in the local cache.
- ML Lab: a narrow model-configuration rail, a wide Training Diagnostics surface, a readiness state, and result diagnostics only after an experiment returns.
- Both routes collapse cleanly at approximately `390 × 844` without horizontal overflow.
- Scanner cards and KPIs use real API values. Empty/error states link to local data preparation or tell the user to restart the local API. No seeded prices or fake time series are used.
- The old scanner heatmap/table markup is retained only for traceability and is hidden from the primary composition; future changes should update the reference layout first.

### Operational workflows

1. **Prepare data:** open `/data`, choose a quick or custom window, start one bulk import, and wait for the job to complete.
2. **Run a strategy:** use `/research` or `/strategy`, select a locally covered symbol, confirm dates, run the simulation, then inspect chart, trades, equity, and drawdown.
3. **Scan the universe:** open `/market-scanner`, choose a universe and strategy, run the scan, and use the real leaderboard or breakout candidate results.
4. **Track a setup:** bookmark a scanner candidate, then review `/watchlist`; statuses are simulation-derived from subsequent local daily bars.
5. **Run ML research:** open `/ml-lab`, choose symbol, dates, horizon, and candidate models. The output is chronological and past-only; diagnostics remain empty until a real experiment completes.
6. **Challenge a result:** use comparison, robustness, bias-validity, replay, and saved-test detail before treating a historical result as useful evidence.

## 7. Frontend data and chart rules

The research chart boundary is API-independent. `chart-data.ts` defines normalized contracts, `research-chart.ts` adapts market/backtest payloads, and `FinancialChart.tsx` owns rendering, volume, overlays, indicator panes, markers, crosshair, and loading/empty/error states.

Keep these rules when changing the UI:

- Sort and de-duplicate timestamps.
- Drop invalid OHLC points and preserve missing volume as unavailable.
- Preserve stable signal and trade IDs.
- Keep loading, empty, error, no-trade, and completed-result states distinct.
- Use official local NSE data only; never use mock prices as a failed-request fallback.
- For rendered changes, validate desktop and approximately `390 × 844` mobile states.

## 8. Verification contract and current status

Required repository checks:

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
git diff --check
npm --prefix frontend run build
npm --prefix frontend run lint
```

Recorded results for the current work:

- `npm --prefix frontend run build` passes; TypeScript and all 20 generated Next routes pass.
- `git diff --check` passes for the current changes.
- `uv run ruff check src tests` passes.
- `uv run pytest -q` passes for the full repository suite.
- `uv run mypy src` remains non-zero with 17 repository-wide findings (untyped pattern helper, existing pandas/TA typing gaps, and an importer contract mismatch); the timeout/watchlist changes introduced no new mypy errors.
- Direct backend health and scanner smoke checks passed. A local scanner response returned real data (`195` instruments and `11` sectors in that cache snapshot).
- Browser QA passed for Scanner and ML Lab desktop and mobile layouts: the reference grids were visible, no horizontal overflow appeared, and the saved scanner preset changed its controlled inputs.
- The in-app browser could not reach the local backend in one validation session even though direct `curl` did; the UI now renders an actionable `Local Backtrack API is unavailable...` state rather than a bare `Failed to fetch` message.
- `npm --prefix frontend run lint` still fails with 16 errors and 16 warnings from existing repository-wide findings. See the error register below; this is separate from the passing production build.
- The browser pass exercised the non-destructive controls across Replay, Scanner, Robustness, ML Lab, Comparison, Options, Settings, Analytics entry points, saved tests, Watchlist, Data, Strategy, Research, Strategy Import, and Pattern Finder. The destructive “Clear testing history” action was not clicked because it would delete persisted user data.

Market Scanner is the stock-and-sector discovery surface: choose the universe, strategy, and date range; compare sectors on the heatmap; select a sector to inspect its ranked stocks; search or sort the full leaderboard; export the matching rows; then open a stock in Research with the same strategy and dates. Breakout candidates provide the same Research handoff and can be bookmarked.

### Dhan-inspired, research-only parity

Backtrack intentionally borrows the useful analysis patterns associated with Dhan/TradingView/ScanX—chart-linked strategy tests, multiple indicators, screeners, saved templates, and bar replay—without broker connections, live quotes, webhooks, or order execution. Research results can now hand the exact stock, timeframe, and historical range into Replay for a candle-by-candle paper session. The backend remains the source of truth for candles, signals, fills, trades, equity, drawdown, and metrics.

## 9. Error register: found issues and resolutions

“Fixed” means code or runtime configuration was changed and the relevant check passed. “Environment” means the application was not the cause. “Open” means it remains known and should not be mistaken for a successful validation.

### Fixed application or runtime issues

| Area | Error found | How it was solved |
| --- | --- | --- |
| Home | Duplicate unused stock/date controls showed misleading default values even though selection belongs to Research and Replay. | Removed the controls, state, date picker, symbol combobox, and query-parameter wiring; updated the frontend guide. |
| Pattern API | `Path("data/market_cache.sqlite3")` was used without importing `Path`, risking `NameError` in the Pattern Finder fallback path. | Added the import; scoped Ruff and mypy passed. |
| Pattern service | Unused `datetime` import and ambiguous `l` low-price variable triggered static-analysis findings. | Removed the import and renamed the variable to `low`; scoped Ruff passed. |
| Backtest typing | Mypy inferred chart candle/indicator/signal dictionaries too broadly for `VectorBacktestResult`. | Added explicit chart result types and built signals through a typed list; scoped mypy passed. |
| Vector engine | Ruff found an unsorted standard-library import block. | Reordered imports; scoped Ruff passed. |
| Strategy coverage | Seven requested price-action concepts had no executable strategy IDs or UI discovery. | Added deterministic no-lookahead engine branches, indicators, templates, comparison/hypothesis labels, documentation, and parametrized tests; the full pytest suite and frontend build passed. |
| Watchlist route | `/watchlist` returned a Next 404 even though source and navigation existed. | Restarted the stale Next process so the current route was discovered; `/watchlist` returned 200 and rendered its empty state. |
| Watchlist/sync API | Running backend returned 404 for `/watchlist` and `/data/sync-today` because it predated the route additions. | Restarted the backend from current source; watchlist returned `200 []` and daily sync returned a valid up-to-date response. |
| DELETE CORS | Browser preflight rejected saved-test/watchlist deletion with `400 Disallowed CORS method`. | Added `DELETE` to FastAPI `allow_methods` and restarted the backend. |
| SQLite contention | Concurrent local backtests/artifact writes produced `database is locked` and a misleading UI service error. | Added a 30-second connection timeout and `busy_timeout` to market-cache, backtest, and artifact repositories; retry completed a real `1,237`-bar result. |
| Saved tests | Older custom artifacts rendered `SMA undefined/undefined`. | Added a frontend fallback to `SMA 20/50` without changing stored artifacts. |
| Data KPI | “Candles available” showed an unexplained `1851.0×` ratio. | Renamed it to “Average candles / stock” and display a rounded localized count. |
| Scanner lint/visual composition | Scanner had unused imports/timing state and its primary surface did not match the Stitch reference. | Removed unused code and added the criteria rail, KPI strip, result cards, responsive layout, functional saved presets, and explicit no-data/error states. |
| ML Lab composition | ML Lab did not make the Stitch setup-rail/diagnostics relationship clear. | Narrowed the configuration rail, widened diagnostics, stacked candidate models, and added data-driven readiness state without changing the ML API. |
| Scanner network error | Browser showed only `Failed to fetch` when the local API was unavailable. | Added an actionable local-backend message while preserving the unavailable state and API behavior. |
| Watchlist status | A saved setup could be marked target/stop hit by a price move that happened before the setup entry date. | Filtered evaluation bars to the entry date and later, and added a regression test using a pre-entry extreme; the setup now remains active until a post-entry bar reaches target/stop. |
| Sector heatmap | The visible scanner surface showed result cards while the actual sector heatmap lived in hidden legacy markup, so sectors were not clickable and could not load their top stocks. | Replaced the visible area with a data-backed treemap surface. Tile area uses sector stock count, color has three metric modes, and selecting a tile loads ranked stocks with a derived research score plus return, alpha, win rate, drawdown, and Research links. |
| Frontend route discovery | Multiple watchers caused stale route discovery and `EMFILE` pressure. | Restarted the frontend after route changes, isolated port-specific Next build directories (`.next-port-*`), and enabled opt-out Watchpack polling in the named dev scripts. |

### Validation and environment errors

| Check | Error found | Resolution or status |
| --- | --- | --- |
| uv/Ruff/mypy startup | Sandbox could not access the existing uv cache under `/Users/arjeetanand/.cache/uv`. | Retried with approved escalation; focused checks and the recorded full pytest run completed. |
| Next production build | Turbopack initially failed with `Operation not permitted` while creating a worker/binding. | Retried with approved escalation; production build passed. |
| Next dev/start server | Sandbox initially returned `listen EPERM` on ports 3000/3001. | Used approved escalation for local preview; server started successfully. |
| Temporary preview | Port 3001 was not reachable after the first server attempt. | Restarted the preview against the rebuilt output before final Scanner/ML QA. |
| In-app browser API access | Browser fetch to `127.0.0.1:8000` failed while direct backend `curl` worked. | Treated it as local browser isolation; kept the explicit error/import state and improved its message. |
| `git diff --check` | A pre-existing blank line at EOF in `src/quant_research/api/schemas.py` was reported during earlier work. | Left it unchanged because it was outside the requested change and belonged to existing workspace edits. |
| YouTube source | Direct fetch hit a cache miss and YouTube captions were unavailable. | Kept the strategy as a reviewable Backtrack interpretation; did not claim exact transcription or invent rules. |

| Repository mypy run | `uv run mypy src` reports 17 existing findings in pattern discovery, pandas/TA integrations, and the daily-sync importer contract. | Recorded as open static-analysis debt; Ruff, the full pytest suite, and the production frontend build pass, and the changes in this QA session did not add a new mypy category. |

| Frontend lint run | ESLint reports 16 errors and 16 warnings, mostly React effect/state guidance plus existing unused imports and a render-time mutation. | Recorded as open refactoring work; runtime/browser QA and the optimized Next build pass. |

### Open static-analysis findings

These are known findings from repository-wide static analysis, not runtime proof that the application is broken:

- Backend: mypy reports 17 findings in `pattern_finder.py`, `market_cache.py`, `daily_sync.py`, `market_scanner.py`, and the untyped `ta` integrations. Ruff is clean.
- Frontend: ESLint reports 16 errors and 16 warnings: effect/state-pattern findings in `market-scanner`, `ml-lab`, `comparison`, `replay`, `research`, `strategy`, `watchlist`, and `backtests/[id]`; existing unused imports in `pattern-finder`/`watchlist`; a render-time `peak` reassignment; unescaped quote text; and the custom-font placement warning in `layout.tsx`.
- The frontend production build passes despite these lint findings. Do not claim a clean lint release until these are separately refactored.

## 10. Important engineering lessons

1. Vectorize bulk scans with NumPy arrays; avoid constructing millions of Pydantic/Pandas dictionaries.
2. Use timezone-aware UTC datetimes when generating SQLite timestamps.
3. Load hidden-tab data on demand rather than firing every scanner request on page mount.
4. Avoid CSS class names beginning with digits; Turbopack can parse them as dimension tokens.
5. Use temporary SQLite databases in tests; never clear the real local market cache.
6. Restart stale Next/FastAPI processes after route changes; a correct source tree can still be hidden by an old process.
7. Preserve API behavior while changing layout: data-backed UI and actionable unavailable states are part of the research trust contract.

## 11. Scope limitations

- The official data path is daily NSE history, not real-time or intraday data.
- Replay and backtests are paper simulations only.
- ICT-style logic is a daily educational approximation.
- Options are educational payoff calculations, not a complete derivatives lifecycle.
- The app is designed for local single-user research, not production multi-user deployment.
- Multi-user auth, job queues, distributed locking, monitoring, backups, and production deployment controls are not implemented.
