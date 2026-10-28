# Backtrack engineering handover

Last reviewed: 2026-10-28

## 2026-10-28 research notebook mascot

- Added an original notebook researcher illustration to the overview hero. The local WebP is
  36 KB; it uses responsive two-column and three-column layouts, then stacks on smaller screens.
  No research logic, backend, or market data changed.
- Verification: frontend lint and production build pass. Browser inspection at 390px, 767px,
  and 1440px confirmed the image loads and the document stays within the viewport.
- Branch: `codex/backtrack-mascot-illustrations-20261028`, based on `origin/main` at `cd7ff7b`.
  Implementation commit: `b93be62`. [PR #7](https://github.com/arjeetanand/backtesting-stockmarket/pull/7)
  tracks delivery to `main`; see it for live check and merge status.
- Run locally from the repository root with `./run.sh`: UI `http://localhost:4003`, API
  `http://localhost:8001`; UI test ports are `5003` and `6003`.

## 2026-10-28 editorial light-indigo theme

- Restyled shared application surfaces around a light-indigo frame, white work canvas,
  navy headings, restrained lavender/indigo emphasis, and pale periwinkle primary actions.
  Common colors now use the shared tokens; explanatory labels and compact status text are
  readable at phone widths. Research behavior and the local NSE-only boundary are intact.
- Added the shared top-bar title for `/time-machine`. Design guidance and task checks are
  in `DESIGN.md` and `docs/UI_THEME_CHECKLIST.md`; the root and frontend READMEs link to them.
- Verification: `npm --prefix frontend run lint` and `npm --prefix frontend run build`
  pass. Browser inspection covered all 21 routes at 390px, 767px, and 1440px with no
  horizontal overflow or route errors. Desktop overview and phone Research were reviewed
  in the browser; the local development screenshot includes Next.js's dev-only badge.
- Branch and source commit: `codex/intelligence-daily-ui-theme-20261028`, `a01e9c5`.
  [PR #6](https://github.com/arjeetanand/backtesting-stockmarket/pull/6) is the live
  record of review and merge status.
- Run locally from the repository root with `./run.sh`: UI `http://localhost:4003`, API
  `http://localhost:8001`; matching UI test ports are `5003` and `6003`.
- No backend behavior, broker integration, live market feed, or local market data changed.

## 2026-10-28 light-indigo research UI

- Confirmed scope: personal, local NSE research. The refresh keeps the light-indigo
  framed-sheet design, simplifies navigation, and presents the existing analysis,
  rule review, local-history check, simulation, and follow-up tools as one workflow.
- The research page now requires an explicit review confirmation before checking or
  running the test. Changing the hypothesis, symbol, rule, timeframe, date range, or risk
  settings clears that confirmation; it is not restored from local storage.
- Taste and Impeccable are installed as Codex skills. Their design notes are in
  `PRODUCT.md`, `DESIGN.md`, `.taste-skill/direction.json`, and `.impeccable/design.json`.
  `awesome-design-skills` is a catalog, while `img2threejs` is unrelated to this 2D stock
  research UI; neither was installed as an app dependency.
- Verification for this task: frontend tests (19), lint, and production build passed;
  backend `ruff` and the full `pytest` suite passed. The group-leader shutdown regression
  passes. `mypy src` still has 13 issues in four unchanged files. CUA browser inspection
  covered the desktop and compact UI; the standalone Taste inspector could not launch
  Chrome.
- The pre-existing `./run.sh` instance waited for its active NSE import to finish and
  then shut down gracefully. A clean restart is now serving `http://127.0.0.1:4003/`
  (HTTP 200) and `http://127.0.0.1:8001/api/v1/health` (`status: ok`, provider
  `local_nse_cache`). The live research page is open in the in-app browser.
- Branch: `codex/skill-guided-ui-20261028`; implementation commit `a1cf1ae`. The user
  authorized the PR workflow. [PR #1](https://github.com/arjeetanand/backtesting-stockmarket/pull/1)
  was merged to `main` as `147619b`. See `docs/CONSOLIDATION_CHECKLIST.md` for verification.

## 2026-10-28 workspace consolidation

- Backtrack remains the active stock-research repository. The landing page now presents
  one workflow across NSE data import, strategy tests, scanning, robustness, ML, insights,
  and chart replay; recent test rows come from the local backtest API.
- The interface labels the data as historical NSE daily archives and marks replay orders
  as simulated. It does not add live quotes, broker access, or trade execution.
- `./run.sh` manages the local stack on UI port `4003` and API port `8001`; UI test ports
  are `5003` and `6003`. It records its own runner PID under ignored `data/.runtime/`,
  checks ownership before restart, and stops only process groups it created.
- Audit outcome: keep public `backtesting-stockmarket`; archive private `StockML`,
  `stockpulse`, `stock-news-sentiment-analysis`, and
  [`Financial_news_analysis`](https://github.com/arjeetanand/Financial_news_analysis),
  the current account name for the listed stock-news analysis project. These are
  recoverable archives, not deletions. Older news and generated model artifacts were not
  copied. Backtrack ML Lab already evaluates chronologically on local NSE data.
- Codex's Strategy Research Pipeline is the recommended thinking workflow: generate a
  candidate, turn it into a testable hint, run a Backtrack historical test, then review
  risk/robustness metrics. `strategy-researcher` does not run the backtest itself; the
  Backtrack UI remains the execution surface for simulations.
- The original consolidation branch is `codex/stock-workspace-unification-20261028`.
  The follow-up UI work is on `codex/skill-guided-ui-20261028`. The original local UI was
  available at `http://127.0.0.1:4003/`; API
  health is `http://127.0.0.1:8001/api/v1/health`. See `docs/CONSOLIDATION_CHECKLIST.md`
  for verification details. The implementation is committed locally as `bf44580`.
- Original consolidation verification: `ruff`, the full `pytest` suite, the frontend
  production build, desktop/mobile browser review, and API health passed. Repeat-launch
  was not completed because the in-flight import held the API open during graceful
  shutdown. `mypy src` still reports 13 errors in four unchanged files; npm install
  reported 14 dependency advisories (2 moderate, 9 high, 3 critical).

This is the current engineering source of truth for the Backtrack repository. Read it before changing data imports, provider behavior, backtesting, persistence, replay, research, or trader-facing claims.

## 1. Product boundary

Backtrack answers:

> If a defined strategy had been applied to this stock, timeframe, capital, and date range, what would the historical simulation have produced?

The application is research-only. It has no broker order endpoint, account sync, live quote stream, Dhan execution, paid data dependency, or real-order side effect. Replay orders are simulated inside the application.

## 2. Current runtime architecture

```text
Next.js browser UI
  ├─ Home and trader navigation
  ├─ Research / Strategy Lab / YouTube strategy draft
  ├─ Bulk archive import and local stock search
  ├─ Persisted backtest history and detail reports
  ├─ Comparison, robustness, validity, analytics, and options education
  └─ Historical chart replay with simulated orders
          │ HTTP JSON /api/v1
          ▼
FastAPI application
  ├─ Settings and dependency container
  ├─ Market data and NSE import routes
  ├─ Research, YouTube, and artifact routes
  ├─ Backtest, robustness, and validity routes
  └─ Replay session/order routes
          │
          ▼
Application services and domain
  ├─ NseBhavcopyImporter
  ├─ Nifty500CatalogueImporter (catalogue compatibility service)
  ├─ LocalNseCacheProvider
  ├─ ResearchService and SMA service
  ├─ HypothesisService + OllamaClient
  ├─ YouTube strategy extraction
  ├─ Replay engine
  ├─ Vector backtest engine and DSL compiler
  ├─ Data validator and analytics/metrics
  └─ Robustness and validity diagnostics
          │
          ▼
SQLite and local archive files
  ├─ data/market_cache.sqlite3
  └─ data/nse_archives/<year>/*.csv.zip
```

The default container wires `LocalNseCacheProvider` as the research provider. `yahoo_finance.py` remains an adapter/test surface, but it is not the configured provider for the current local NSE workflow.

## 3. Historical data contract

### Import lifecycle

`NseBhavcopyImporter` operates once per weekday archive:

1. Normalize requested symbols and date range.
2. Check archive-day coverage in SQLite.
3. If the original ZIP already exists in `NSE_ARCHIVE_PATH`, load it locally.
4. Otherwise download one official NSE Common Bhavcopy ZIP.
5. Save the exact ZIP as `<NSE_ARCHIVE_PATH>/<year>/nse_bhavcopy_YYYY-MM-DD.csv.zip`.
6. Parse every CSV row before saving the archive.
7. Atomically persist every raw CSV row in `nse_bhavcopy_rows`, supported `EQ`, `BE`, and `ETF` rows in `ohlcv_bars`, archive metadata, and requested-symbol coverage in one SQLite transaction.
8. Only after that transaction succeeds is the archive day marked complete.
9. Report downloaded days, reused local archives, raw rows, stored candles, skipped days, and already-covered days.

The importer does not download or commit one file per stock. Each weekday is one bulk batch containing all rows in that NSE archive; SQLite uses bulk `executemany` writes inside one day-level transaction. A subsequent request for another symbol on an already imported day sees the complete archive-day marker and does not call NSE again.

Dates before 2024 use NSE's legacy historical equity archive path (`content/historical/EQUITIES/<year>/<MONTH>/cmDDMMMYYYYbhav.csv.zip`) and legacy fields such as `OPEN_PRICE`, `CLOSE_PRICE`, and `TTL_TRD_QNTY`. Dates from 2024 onward use the current Common Bhavcopy path and UDiFF/modern field aliases. All raw columns are retained in JSON while compatible equity/BE/ETF price fields are normalized for backtesting.

### SQLite tables & Performance Architecture

`SqliteMarketCache` creates and owns:

| Table | Purpose |
| --- | --- |
| `ohlcv_bars` | Normalized candles; primary key is `(symbol, timeframe, timestamp)` with covering index `idx_ohlcv_symbol_tf_ts` |
| `instruments` | Official NSE catalogue metadata and searchable company/industry fields |
| `nse_import_coverage` | Symbol/timeframe/day coverage markers and backward-compatible import tracking |
| `nse_archive_days` | One row per complete processed archive day, including ZIP path/source/row count |
| `nse_bhavcopy_rows` | Every imported raw CSV row as JSON, including fields not yet used by the backtest engine |

#### High-Performance Read Architecture:
1. **SQLite Indexing**: Optimized composite indexes (`idx_ohlcv_symbol_tf_ts`, `idx_ohlcv_time_symbol_timestamp`) enable range queries across 10+ years of daily bars in < 10ms.
2. **In-Memory LRU Cache**: `SqliteMarketCache` incorporates an in-memory Bounded LRU Cache (max 256 active symbol-range matrices). Repeated backtests and ML feature extraction calls execute in sub-millisecond time directly from RAM. Cache is automatically invalidated upon new batch writes (`put`).
3. **On-Demand Feature Engineering**: Technical indicators (RSI, Volatility, ATR, Moving Average Spreads, RVOL) are calculated on-the-fly in memory using vectorized NumPy/Pandas ops to prevent disk bloat, allow dynamic parameter tweaking, and enforce strict leakage prevention.

`data/` is runtime state and is ignored by Git. Original ZIPs are stored under `data/nse_archives/<year>/`; older flat ZIPs are moved there when the importer starts. Existing historical data remains usable; when a future request needs a stock/day without a complete archive marker, the importer downloads the day once and upgrades the local cache with the full archive.

### Coverage and duplicate rules

- The preview endpoint calculates weekday coverage and missing days before queuing work.
- A complete overlap for all selected symbols returns HTTP `409` and does not create a job.
- Archive-day coverage is global because one complete NSE archive contains the exchange universe.
- Candle writes use SQLite conflict-safe upserts keyed by symbol/timeframe/timestamp.
- A saved ZIP is parsed locally and never downloaded again for the same date.
- A 404 archive (holiday, unavailable date, or pre-archive period) is skipped and reported.
- The API background task is process-local, not a durable worker. If the server restarts, repeat the same import; committed days and saved ZIPs are reused safely.

## 4. Dependency and persistence wiring

`src/quant_research/api/container.py` creates:

- `SqliteMarketCache(settings.market_cache_path)`
- `SqliteBacktestRepository(settings.market_cache_path)`
- `SqliteArtifactStore(settings.market_cache_path)`
- `LocalNseCacheProvider(market_cache)`
- `NseBhavcopyImporter(market_cache, archive_path=settings.nse_archive_path)`
- `Nifty500CatalogueImporter(market_cache)`
- `HypothesisService(OllamaClient(...))`

Persisted state includes:

- Completed backtest results and deterministic cache keys.
- Cached hypothesis, custom backtest, robustness, YouTube, import-job, and replay artifacts.
- Replay sessions, orders, events, cursor, and revealed bars.
- Research page state in `backtrack:research-session` localStorage.
- Replay session ID in `backtrack:replay-session` localStorage.

Persistence is local single-user SQLite. There is no authentication, multi-user isolation, job queue, backup policy, or distributed locking.

## 5. Frontend page ownership

| Page | File | Responsibility |
| --- | --- | --- |
| Home | `frontend/src/app/page.tsx` | Stock/date selection and clear entry points into testing, YouTube import, and replay |
| Research | `frontend/src/app/research/page.tsx` | Hypothesis prompt, Ollama proposal, NSE data preparation, daily OHLCV/volume chart, backtest handoff, signals/trades/equity/drawdown, saved-session restore |
| Strategy Lab | `frontend/src/app/strategy/page.tsx` | Rule/indicator strategy configuration |
| YouTube Import | `frontend/src/app/strategy-import/page.tsx` | URL/transcript extraction and human-review draft |
| Manage Stock Data | `frontend/src/app/data/page.tsx` | Bulk quick/custom date-range import, local catalogue search, saved period/candle count, progress, and cache status |
| My Tests | `frontend/src/app/backtests/page.tsx` | Saved run list and filters |
| Backtest Detail | `frontend/src/app/backtests/[id]/page.tsx` | Metrics, curves, trades, bias/validity details |
| Compare Tests | `frontend/src/app/comparison/page.tsx` | Compare selected strategy configurations/results |
| Robustness | `frontend/src/app/robustness/page.tsx` | Sensitivity, Monte Carlo, walk-forward, and stress views |
| Risk Engine | `frontend/src/app/bias-validity/page.tsx` | Validity and bias diagnostics |
| ML Lab | `frontend/src/app/ml-lab/page.tsx` | Chronological ML research experiments |
| Pattern Finder | `frontend/src/app/pattern-finder/page.tsx` | Historical pattern detection and occurrence review |
| Chart Replay | `frontend/src/app/replay/page.tsx` | Candle replay, simulated ticket, positions, journal, and session persistence |
| Time Machine | `frontend/src/app/time-machine/page.tsx` | Seeded daily-bar scenarios and past-only fixed-rule outcomes |
| Options Learn | `frontend/src/app/options/page.tsx` | Educational payoff and breakeven calculator |
| Analytics | `frontend/src/app/analytics/page.tsx` | Performance and trade-quality analysis |
| Market Insights | `frontend/src/app/insights/page.tsx` and `frontend/src/components/insights/InsightsDashboard.tsx` | Index-aware daily breadth, stock/sector heatmaps, period selectors, coverage metadata, and top movers |
| Market Scanner | `frontend/src/app/market-scanner/page.tsx` | Manual morning plans from local NSE daily bars, explicit formula scans, saved presets, recent runs, and historical research |
| FII / DII Insights | `frontend/src/app/insights/fii-dii/page.tsx` | Official NSE institutional-flow cards, combo chart, filters, and ledger |
| Settings | `frontend/src/app/settings/page.tsx` | Local configuration and provider status |

Shared frontend infrastructure:

- `frontend/src/components/layout/`: sidebar and top navigation.
- `frontend/src/components/charts/`: chart primitives.
- `frontend/src/components/charts/FinancialChart.tsx`: reusable `lightweight-charts` candlestick, volume, indicator-pane, and trade-marker chart.
- `frontend/src/components/ui/`: buttons, cards, and badges.
- `frontend/src/lib/backtest-api.ts`: backtest API client.
- `frontend/src/lib/market-data.ts`: market-data client.
- `frontend/src/lib/chart-data.ts`: API-independent normalized financial-chart contracts and validation.
- `frontend/src/lib/research-chart.ts`: market/backtest payload adapters, indicator placement, and signal/trade mapping.
- `frontend/src/lib/replay/`: replay API client and types.
- `frontend/src/lib/time-machine.ts`: typed daily-bar scenario API contract and client.
- `frontend/src/lib/robustness-api.ts`: robustness API client.
- `frontend/src/lib/agents/`: five in-process TypeScript swarm modules.
- `frontend/src/lib/strategy-library.ts`: known strategy definitions used by strategy selection and education. Price-action and ICT-style entries are explicitly labelled as configurable Backtrack interpretations.
- `frontend/src/lib/market-data.ts`: local market-data and availability client.
- `frontend/src/app/globals.css`: shared design tokens, layout, responsive rules, and page-specific styles.

## 6. Five-agent local swarm

The swarm is an in-process TypeScript orchestration model, not five remote workers or paid LLM agents.

| Module | Responsibility |
| --- | --- |
| `market-data-agent.ts` | Prepare/validate the market-data input state |
| `signal-engine-agent.ts` | Interpret configured signal/rule state |
| `backtest-runner-agent.ts` | Coordinate the simulation result state |
| `risk-analyst-agent.ts` | Explain drawdown, validity, and risk checks |
| `ux-narrator-agent.ts` | Turn technical results into trader-readable status/copy |
| `orchestrator.ts` | Execute the sequence and expose agent progress |

Keep the modules deterministic and UI-auditable. A future production job system may split them into workers, but that requires a separate persistence/queue/security design.

## 7. API source of truth

API schemas live in `src/quant_research/api/schemas.py`; route behavior lives in `src/quant_research/api/routes/api.py`.

### Market data

- `GET /health`
- `GET /providers`
- `GET /data/cache`
- `GET /data/availability`
- `GET /data/instruments`
- `GET /data/inventory`
- `GET /data/instruments/export`
- `POST /data/instruments/refresh`
- `POST /data/nifty500/refresh` (deprecated compatibility alias)
- `POST /data/nse-import/preview`
- `POST /data/nse-import`
- `GET /data/nse-import/{job_id}`
- `GET /market-data`
- `POST /scenario-simulator/run`

### Research and runs

- `POST /research/ensure-data`
- `POST /research/hypothesis`
- `GET /research/artifacts/{kind}`
- `POST /strategy/youtube`
- `POST /backtests/sma-crossover`
- `POST /backtests/custom`
- `GET /backtests`
- `GET /backtests/{run_id}`
- `POST /robustness/analyze`
- `POST /bias-validity/audit`
- `POST /ml/experiments`
- `GET /ml/experiments`
- `POST /pattern-finder/test`
- `DELETE /backtests`
- `DELETE /backtests/{run_id}`
- `DELETE /testing-history`
- `DELETE /research/artifacts/{kind}/{artifact_key}`

`GET /market-data` returns validated local bars for the selected symbol, date range, and timeframe. The custom backtest response keeps its existing result fields and adds chart-ready candle `volume` plus stable signal `id` and `trade_id` metadata. Invalid strategy parameters and insufficient history return actionable `422` errors rather than an opaque server error.

`POST /scenario-simulator/run` reads only locally cached `1day` candles. It re-samples 10,000 repeatable daily OHLC bars with replacement from the lookback window, applies a fixed percentage stop and R-multiple target, and compares them with rolling historical outcomes whose full holding window ends no later than the latest cached candle. It does not select historical entries for similarity. When one daily candle reaches both levels it counts the stop first. The endpoint never fetches data, predicts prices, or submits orders; it returns `422` with the required history count when the cache is too short.

`GET /insights/fii-dii` returns locally normalized official NSE FII/FPI-DII rows, daily/weekly/monthly summaries, chart points, available Nifty 50 index closes, and a coverage note when the requested range is not locally complete. `POST /insights/fii-dii/import` and `GET /insights/fii-dii/import/{job_id}` manage the background report snapshot import. Raw snapshots are kept under `data/nse_archives/fii_dii/`; the SQLite cache owns normalized `fii_dii_rows`, `fii_dii_snapshots`, and `nifty50_closes` tables. The current public NSE FII/DII endpoint is latest-session only; historical sessions are not invented from date query parameters.

`GET /screeners/catalog` and `GET /screeners/universes` expose the checked-in JSON formula and index-membership catalogues. `POST /screeners/run` performs an explicit current-snapshot formula evaluation, and `GET /insights/{universe}?period=1d|1w|1m|3m` returns local daily breadth, selected-index constituents, sector aggregates, top movers, data freshness, and coverage/missing-symbol metadata. Formula definitions live in `src/quant_research/config/scanner_catalog.json`; index membership lives in `src/quant_research/config/index_universes.json`. Scanner presets and recent-run metadata are browser-local and do not require a SQLite migration.

### Replay

- `POST /replay/sessions`
- `GET /replay/sessions/{session_id}`
- `POST /replay/sessions/{session_id}/step`
- `POST /replay/sessions/{session_id}/orders`
- `POST /replay/sessions/{session_id}/orders/{order_id}/close`
- `POST /replay/sessions/{session_id}/finish`

Error conventions:

- `422`: invalid request, date range, symbol, or strategy parameters.
- `404`: missing run/session/job.
- `409`: requested NSE range is already fully available.
- `502`: upstream NSE/archive, YouTube, or Ollama failure.
- `503`: required local service/provider is unavailable.

## 8. Codebase map

```text
backtrack/
├── README.md
├── handover.md
├── TESTING.md
├── PROJECT_GUIDE.md
├── AGENTS.md
├── backend/README.md
├── frontend/README.md
├── pyproject.toml
├── .env.example
├── src/quant_research/
│   ├── api/                 # App factory, settings, schemas, HTTP routes
│   ├── data_providers/     # Local NSE, cache wrapper, Yahoo adapter/test surface
│   ├── domain/             # Data, indicators, DSL, engine, analytics, robustness, validity
│   ├── llm/                # Ollama HTTP client and JSON handling
│   ├── repositories/       # SQLite market/run/artifact stores
│   └── services/           # NSE/catalogue import, research, replay, YouTube, SMA
├── frontend/
│   ├── src/app/             # App Router pages
│   ├── src/components/     # Shared layout, charts, and UI primitives
│   └── src/lib/            # API clients, replay types, helpers, swarm modules
├── data/                   # Runtime state, ignored by Git
│   ├── market_cache.sqlite3
│   └── nse_archives/<year>/*.csv.zip
└── tests/                  # Unit, persistence, import, API, replay, and engine tests
```

## 9. Environment handoff

Copy `.env.example` to `.env`:

```dotenv
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
MARKET_CACHE_PATH=data/market_cache.sqlite3
NSE_ARCHIVE_PATH=data/nse_archives
```

Do not commit `.env`, SQLite files, raw NSE ZIPs, tokens, account data, or provider payloads containing private information.

## 10. Required release checks

From the repository root:

```bash
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run ruff check src tests
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run mypy src
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run pytest -q
git diff --check
npm --prefix frontend run build
```

For a frontend change, also manually check:

- the intended route loads with meaningful content;
- no framework error overlay appears;
- the primary control changes visible state;
- loading, empty, error, and completed states are understandable;
- desktop and approximately 390px mobile layouts do not overflow;
- API failures do not appear as successful data;
- no paid provider or broker credential is requested.

The repository test suite uses fake openers/providers and does not require NSE, YouTube, or Ollama network access. The archive regression test verifies local ZIP reuse, complete raw-row persistence, and full eligible OHLCV ingestion.

## 11. Known limitations and next work

- No real-time market feed or live order execution.
- Daily NSE archive ingestion only; intraday and derivatives are not normalized for backtesting.
- Time Machine uses daily bars only and omits fees/slippage; its sample frequencies are not calibrated probabilities.
- Raw derivative/other archive rows are retained, but the current strategy engine uses normalized EQ/BE/ETF OHLCV bars.
- YouTube extraction remains a reviewable draft and has no speech-to-text guarantee.
- Ollama is optional and must be running locally for research hypothesis generation.
- Options Lab does not fully model IV, Greeks, margin, taxes, brokerage, spreads, or settlement.
- Multi-user auth, job queues, distributed locking, monitoring, backup, and production deployment controls are not implemented.
- Results are historical simulations, not forecasts or financial advice.

## 12. Handoff record template

Append this to a change request when handing work to another agent:

```text
Date:
Owner/agent:
Changed files:
User-visible behavior:
API/schema changes:
Persistence/data migration:
Commands run:
Test evidence:
Known limitations:
Next owner/action:
```

## 13. Day-Trader Time Machine integration handoff

- Date: 2026-10-28.
- Branch: `codex/day-trader-time-machine-20261028`.
- Implementation commit: `a87e591` (`Add local daily-bar Time Machine simulator`).
- PR: [#4](https://github.com/arjeetanand/backtesting-stockmarket/pull/4), targeting `main`.
- PR #4 was squash-merged on 2026-10-28 as `06d64be`.
- Installed the reviewed day-trader-skill repository's 11 skill folders globally for Codex at commit `3d0f4ef6986f4984b7c6bd46f7ff4f87744c3abd`.
- Added `/time-machine`, its typed API client, sidebar entry, bounded request/response schemas, and a local-cache-only seeded daily-bar simulator. The endpoint validates cached OHLC before sampling and does not mutate persistence.
- Updated `README.md`, `PROJECT_GUIDE.md`, `TESTING.md`, `backend/README.md`, `frontend/README.md`, and `docs/TIME_MACHINE_CHECKLIST.md`.
- Run with `./run.sh`; the active local app uses UI port `4003` and API port `8001`. Open `http://127.0.0.1:4003/time-machine`.
- Verification: full Ruff and pytest pass; targeted mypy for the new route, schema, and service passes; frontend lint and production build pass. Full `mypy src` still reports 13 errors in existing `market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`.
- Browser check: real cached RELIANCE scenario result rendered; no visible horizontal overflow at `695 × 730`. The browser tool could not emulate the exact `390 × 844` viewport.
- Limits: daily candles only, fees/slippage excluded, sample counts are not probabilities, and no broker orders or live data. Same-day stop and target touches count as stop first.
- Next action: open `http://127.0.0.1:4003/time-machine`; import more local history if the selected lookback and holding period require it.

## 14. Shared mascot and icon motion

- Date: 2026-10-28.
- Branch: `codex/backtrack-site-mascot-motion-20261028`.
- Implementation commit: `5f2dae7` (`Add shared thinking mascot and icon motion`).
- PR: [#8](https://github.com/arjeetanand/backtesting-stockmarket/pull/8), targeting `main`.
- Updated shared TopBar headers and the custom Insights heading with a small crop of the local notebook mascot; added reduced-motion-aware thought motion and a restrained sidebar icon response. Reused the mascot in the Home recent-tests empty state.
- Updated `DESIGN.md`, `README.md`, and `docs/UI_THEME_CHECKLIST.md`; no API, database, or market-data behavior changed.
- Verification: frontend lint passed; `NEXT_DIST_DIR=.next-port-validation npm run build -- --webpack` passed. Browser check found the mascot on all 21 routes at 390px; Home, Data, and Insights at 1440px; and Data at 767px, with no horizontal overflow or browser console errors.
- The default Turbopack production build failed when sandbox permissions blocked a child-process startup for CSS processing; the isolated webpack production build passed. Reduced-motion handling was source-checked but not emulated in the browser. GitGuardian passed; GitHub Copilot review was unavailable because the account had no remaining review quota.
- Run with `./run.sh`; UI port `4003`, API port `8001`. Current preview: `http://127.0.0.1:4003/`.
- Next action: review the completed changes in the running app at `http://127.0.0.1:4003/`.

## 15. Full-resolution illustrations across research routes

- Date: 2026-10-28.
- Branch: `codex/backtrack-illustration-system-20261028`.
- Implementation commit: `be76018` (`Use full-resolution illustrations across research routes`).
- PR: [#9](https://github.com/arjeetanand/backtesting-stockmarket/pull/9), squash-merged into `main` on 2026-10-28 as `1e7f303`.
- Replace the reused cropped WebP with six transparent 1536×1024 PNG scenes for overview/research, markets, strategy, evidence review, replay, and local data. The shared header selects the scene by route; the custom Insights heading uses the market scene, and Home uses the overview scene.
- Replace the small raster crop with an inline SVG notebook mark. Render each scene at its natural aspect ratio without Next image optimization, and eagerly load the visible header/hero illustration.
- Update `DESIGN.md`, `README.md`, and `docs/UI_THEME_CHECKLIST.md`. No API, database, or market-data behavior changed.
- Verification: frontend ESLint and the webpack production build pass; `git diff --check` passes. Live-browser sweep covered all 21 routes at 1185px: every route loaded a 1536px artwork source and had no document-width overflow. Home, Research, and Insights were visually inspected; no new console warnings appeared after eager loading was added.
- Responsive media rules were source-checked, but the available browser control could not emulate 390px or 767px viewports. The checklist leaves those runtime checks pending.
- Run with `./run.sh`; UI port `4003`, API port `8001`. Preview: `http://127.0.0.1:4003/`.

## 16. Guided first-use workflow and contextual illustrations

- Date: 2026-10-28.
- Branch: `codex/backtrack-guided-workflow-20261028`.
- Implementation commit: `7bed083` (`Guide users through the Backtrack workflow`).
- PR: [#11](https://github.com/arjeetanand/backtesting-stockmarket/pull/11), targeting `main`.
- Guide first use from local NSE history through rule review and simulation, saved results, and comparison. Make the specialist market and research tools secondary in navigation.
- Place the full-resolution static PNG scenes beside the Home workflow and the relevant data, rule, empty-results, replay, or missing-data state. Keep route headers compact and avoid animation that implies the pictures show a moving workflow.
- Update `README.md`, `PROJECT_GUIDE.md`, `frontend/README.md`, `DESIGN.md`, and `docs/UI_THEME_CHECKLIST.md`. No API or persistence behavior changed.
- Verification: frontend lint and the webpack production build pass. Live-browser review covered the six key workflow pages and all 20 static routes at 1185px with no horizontal overflow; loaded illustrations retained their natural 1536×1024 source dimensions. The mobile More menu stays closed on direct specialist-route load and highlights its section.
- Mobile viewport limitation: exact 390px and 767px rendering and menu operation could not be checked because the available browser session is fixed at desktop width.
- Run with `./run.sh`; UI port `4003`, API port `8001`. Preview: `http://127.0.0.1:4003/`.
- Next action: review the local preview; check the menu at 390px and 767px once viewport emulation is available.


## 17. NSE morning plan and conditional watchlist

- Date: 2026-10-28.
- Branch: `codex/nse-morning-watchlist-20261028`.
- Build a manual morning plan from each candidate's latest completed NSE daily bar: prior high as the reference entry trigger, prior low as invalidation, and a target at 2R. Show the candle date and label levels as conditional.
- The scan is not scheduled and has no pre-open auction, news, or intraday feed. Run it manually around the regular NSE pre-open and confirm price/volume after the regular session opens.
- Saving a plan sends the explicit levels to the local watchlist. It waits for a daily high to reach the trigger, then evaluates only subsequent daily candles. The trigger candle is unresolved because daily OHLC cannot establish level order; ambiguous later candles resolve stop-first.
- No position sizing is shown because the user has not set an account risk budget. No broker execution was added.
- Checklist: `docs/NSE_MORNING_PLAN_CHECKLIST.md`.
