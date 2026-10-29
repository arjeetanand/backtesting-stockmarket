# Backtrack engineering handover

Last reviewed: 2026-10-29

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
- Compact Research inputs, completed/failed run counts, elapsed time, and a result reference in `backtrack:research-session` localStorage. Full custom-backtest chart and trade arrays stay in SQLite; Research reopens them by artifact key (or legacy run ID) rather than synchronously serializing them into browser storage.
- Replay session ID in `backtrack:replay-session` localStorage.

Persistence is local single-user SQLite. There is no authentication, multi-user isolation, job queue, backup policy, or distributed locking.

## 5. Frontend page ownership

| Page | File | Responsibility |
| --- | --- | --- |
| Home | `frontend/src/app/page.tsx` | Stock/date selection and clear entry points into testing, YouTube import, and replay |
| Research | `frontend/src/app/research/page.tsx` | Hypothesis prompt, Ollama proposal, NSE data preparation, daily OHLCV/volume chart, backtest handoff, signals/trades/equity/drawdown, saved-session restore |
| Stock Research | `frontend/src/app/stock-research/page.tsx` | Single-symbol indicator explanations, conditional price levels, fixed-rule OOS results, and attempt ledger |
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
| Market Scanner | `frontend/src/app/market-scanner/page.tsx` | Morning plans, formula and historical scans, breakout results, daily structure zones, and local coverage states |
| FII / DII Insights | `frontend/src/app/insights/fii-dii/page.tsx` | Separate Tapetide history and NSE latest-snapshot views, each backed by its own SQLite rows |
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
- `GET /research/artifacts/{kind}/{artifact_key}`
- `GET /research/artifacts/custom_backtest/by-run-id/{run_id}`
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

`GET /market-data` returns validated local bars for the selected symbol, date range, and timeframe. The custom backtest response keeps its existing result fields and adds chart-ready candle `volume`, stable signal `id` and `trade_id` metadata, and `_artifact_key` for lightweight session recovery. Invalid strategy parameters and insufficient history return actionable `422` errors rather than an opaque server error.

`POST /scenario-simulator/run` reads only locally cached `1day` candles. It re-samples 10,000 repeatable daily OHLC bars with replacement from the lookback window, applies a fixed percentage stop and R-multiple target, and compares them with rolling historical outcomes whose full holding window ends no later than the latest cached candle. It does not select historical entries for similarity. When one daily candle reaches both levels it counts the stop first. The endpoint never fetches data, predicts prices, or submits orders; it returns `422` with the required history count when the cache is too short.

`GET /insights/fii-dii` returns rows from the explicitly selected source. `source=nse` reads official latest-session rows; `source=tapetide` reads the locally saved history. Each response includes daily/weekly/monthly summaries, chart points, available official Nifty 50 closes, and source coverage. `POST /insights/fii-dii/import` and `GET /insights/fii-dii/import/{job_id}` retain the NSE snapshot workflow. Official rows and third-party history remain separate in `fii_dii_rows` and `fii_dii_history_rows`. NSE's public FII/DII endpoint is latest-session only; date-range selections do not create historical rows.

`GET /screeners/catalog` and `GET /screeners/universes` expose the checked-in JSON formula and index-membership catalogues. `POST /screeners/run` performs an explicit current-snapshot formula evaluation, `POST /structure-zones/scan` scans a selected configured universe using local daily bars, and `GET /insights/{universe}?period=1d|1w|1m|3m` returns local daily breadth, selected-index constituents, sector aggregates, top movers, data freshness, and coverage/missing-symbol metadata. Formula definitions live in `src/quant_research/config/scanner_catalog.json`; index membership lives in `src/quant_research/config/index_universes.json`. Scanner presets and recent-run metadata are browser-local and do not require a SQLite migration. The structure-zone scan is read-only and does not add a database table.

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
- Branch: `codex/nse-morning-watchlist-20261028`, based on `main` at `a96dc40`.
- Implementation commit: `0599a54` (`Add NSE morning plan and conditional watchlist`).
- PR: [#12](https://github.com/arjeetanand/backtesting-stockmarket/pull/12), squash-merged into `main` on 2026-10-28 as `e544d0b`.
- Build a manual morning plan from each candidate's latest completed NSE daily bar: prior high as the reference entry trigger, prior low as invalidation, and a target at 2R. Show the candle date and label levels as conditional.
- The scan is not scheduled and has no pre-open auction, news, or intraday feed. Run it manually around the regular NSE pre-open and confirm price/volume after the regular session opens.
- Saving a plan sends the explicit levels to the local watchlist. It waits for a daily high to reach the trigger, then evaluates only subsequent daily candles. The trigger candle is unresolved because daily OHLC cannot establish level order; ambiguous later candles resolve stop-first.
- Verification: full pytest, Ruff, frontend ESLint, and webpack production build pass. GitGuardian passed on PR #12. Copilot review was unavailable because the account had no remaining review quota. Full mypy reports 13 existing errors in `market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`.
- Browser preview used synthetic bars and covered desktop plus the available 487px narrow width; exact 390px emulation was unavailable. The original app on port 4003 was left untouched to preserve its existing local changes.
- Run from an up-to-date checkout with `./run.sh`; UI port `4003`, API port `8001`. After updating the local checkout, use **Build Morning Plan** manually around 9:00 IST when its NSE daily cache is current.
- No position sizing is shown because the user has not set an account risk budget. No broker execution was added. The scan is a heuristic and cannot promise the day's best-performing stock.
- Checklist: `docs/NSE_MORNING_PLAN_CHECKLIST.md`.

## 18. Independent daily structure-zone scanner

- Date: 2026-10-28.
- Branch: `codex/independent-structure-zones-20261028`.
- Add a read-only `POST /structure-zones/scan` route and a **Daily structure zones** tab in Market Scanner. It reads the selected configured universe from the local NSE daily cache and reports recent active bullish/bearish zones, source/confirmation dates, prior range boundary, ATR displacement, touch sessions, invalidation edge, per-symbol data date, and coverage.
- Rule: require a close beyond the preceding 20-session range, body at least 1.25 times the prior 14-session average true range, and close in the outer quarter of the candle. The zone is the full range of the latest opposite candle within the preceding three bars. Close through the far edge invalidates it; confirmations older than 60 bars are omitted.
- This is an independent transparent OHLCV heuristic. It uses no intraday/live feed, makes no claim about institutional activity, and does not place orders. The scan writes no data and adds no database migration.
- Verification: full Ruff and pytest passed; frontend ESLint and isolated webpack production build passed. Full `mypy src` still reports 13 existing errors in unchanged `market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`; it reports none in this feature's service, schema, or route.
- Browser check at `http://127.0.0.1:4003/market-scanner`: NIFTY 50 returned 29 active zones from 49 of 50 cached symbols, with the latest bar dated 2026-10-27 and one symbol lacking enough history. The initial, loading, partial-coverage, and result states rendered; changing universe cleared old results. A confirmation-day edge case was fixed and rechecked in the live scan.
- The available browser stayed at desktop width; mobile viewport and forced API-error rendering were not checked. The local NSE cache is partial for this universe.
- Structure-zone implementation was first verified on `codex/independent-structure-zones-20261028`; this workflow is now included with the order-flow board so the candidate zone and symbol ranking ship together.
- Run with `./run.sh`; UI port `4003`, API port `8001`. Open `http://127.0.0.1:4003/market-scanner`.

## 19. Daily pressure flow and selected-symbol zones

- Date: 2026-10-28.
- Branch: `codex/order-flow-liquidity-20261028`, based on `main` at `5feadf4`; it includes the structure-zone prerequisite commit `403e7e9` and the flow-board implementation commit `8d46b4d`.
- PR: [#14](https://github.com/arjeetanand/backtesting-stockmarket/pull/14), targeting `main`.
- Rank up to 20 positive and 20 negative estimates across all local NSE catalogue symbols, NIFTY 500, or NIFTY 50. Estimate signed pressure as each candle's close location in its high-low range multiplied by close × volume, summed over the latest 20 saved daily sessions. Display average traded value separately and select from the top three on either side.
- Search any NSE catalogue symbol to inspect the latest active daily demand/supply candidates using the existing structure-zone rule. These are candidate price ranges, not actual resting orders or proof of institutional activity.
- Verification: full Python test suite, Ruff, frontend Vitest (19 tests), ESLint, and webpack production build pass. The live desktop browser scanned all 2,585 cached catalogue symbols (2,407 ranked, 4 without bars, 174 with insufficient history), showed the top-three split, selected a demand candidate, and inspected a typed TCS symbol. The data snapshot's latest candle was 2026-10-27.
- `mypy src` reports the same 13 existing errors in `market_cache.py` (old `_lru_cache` typing), `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`; there are no new-feature errors.
- Mobile-width browser emulation was unavailable; responsive breakpoints were reviewed in CSS but not exercised in a mobile viewport. The feature preview uses an isolated copy of recent local NSE bars on UI port `5003` and API port `8002`; the existing application on `4003`/`8001` and its database were left untouched.
- Run the merged code with `./run.sh` on UI port `4003` and API port `8001`; then open **Market Scanner → Liquidity flow**.
- Next action for actual buyer/seller identities or resting-order blocks: integrate a licensed intraday market-depth source and keep its data provenance separate from these historical OHLCV estimates.
- Checklist: `docs/ORDER_FLOW_CHECKLIST.md`.

## 20. Single-stock research and validation

- `POST /api/v1/stock-research/run` reads the selected symbol's saved NSE daily candles and returns price ranges, SMA20/50/200, RSI14, MACD(12/26/9), ATR14, volume ratio, historical price returns, indicator reasons, and a conditional long-only plan. The UI lives at `/stock-research`; the typed client is `frontend/src/lib/stock-research.ts`.
- The fixed rule is a daily close above the prior 20-session high, close>SMA50>SMA200, and volume above the preceding 20-session mean. It enters at the next session open, starts each train/test period with ₹1,00,000, buys whole shares with available equity, uses a 2×ATR stop and 2R target, exits at target/stop/SMA50-close/20-session limit, and resolves a same-daily-bar stop/target touch as stop-first. Profit factor uses summed net cash P&L after position sizing; the screen also requires positive compounded out-of-sample return. The 70/30 chronological split applies to bars after the 200-session indicator warm-up; there is no parameter tuning.
- Fees model 0.1% slippage each side, delivery STT each side, buy-side stamp duty, and the SEBI turnover fee; brokerage, exchange transaction fees, GST, dividends, and corporate-action adjustments are excluded. Raw prices are not adjusted for splits or bonus issues, which can distort indicators, levels, and long-range results. Source links and assumptions are shown in the page. Daily OHLCV cannot establish future earnings growth; only historical price returns are reported.
- Every successful, insufficient-data, and failed attempt is saved as a uniquely keyed `stock_analysis_run` artifact with timestamps, data fingerprint, results, gate status, and failure reason. `SqliteArtifactStore.count_by_json_value` supplies all-time run/gate counts without loading every stored chart into memory. Existing Testing History clear/delete includes this artifact kind.
- The acceptance screen requires at least five years of history, 30 closed OOS trades, a 70%+ win rate, positive net expectancy, positive compounded return, and cash-based profit factor >1. Otherwise the result is `failed` if the sample can be evaluated or `not_evaluable` when history/trades are insufficient. This gate is a historical filter, not a performance guarantee.
- Delivery: branch `codex/single-stock-analysis-20261028`, source commit `d47adb3`, [PR #15](https://github.com/arjeetanand/backtesting-stockmarket/pull/15), squash-merged into `main` as `a64a87a329a3e9c1c436a8f00ac856e350407c05`; GitHub reported the repository check passing. Live data sample, local verification, and browser results are in `docs/STOCK_RESEARCH_CHECKLIST.md`.

## 21. Beginner-first NIFTY 50 stock guidance

- Date: 2026-10-29.
- Branch: `codex/simple-stock-guidance-20261029`, based on `main` at `c9b7acd`.
- Implementation commit: `c3eb56e` (`Add evidence-gated NIFTY 50 stock research`).
- PR: [#17](https://github.com/arjeetanand/backtesting-stockmarket/pull/17), squash-merged into `main` as `f84d4ba267754fc8f317d697f688d75b88a9a0c9` after GitGuardian passed on final source commit `2f632bb`.
- Add a manual NIFTY 50 scan. It runs the existing fixed rule on locally cached official NSE daily candles and only surfaces a stock when its latest completed candle has an open next-session entry window and its held-out history passes the five-year, 30-trade, 70%-win, positive-return/expectancy, profit-factor gate.
- Explain conditional entry/stop/1R/2R levels, SMA20/50/200, RSI14, MACD, ATR14, volume, historical price ranges, reasons, costs, raw signal occurrences, closed trades, and per-symbol run history in a beginner-first page. Link to official NSE financial results; do not infer future company growth from OHLCV.
- A real scan against an isolated copy of local history checked 50 symbols, all with some saved data but fewer than the 221 bars needed to complete analysis. It yielded 0 completed analyses, 50 insufficient-history/not-evaluable, 0 missing-data symbols, 0 errors, 0 passed/failed gates, 0 fresh triggers, and 0 candidates. Latest saved bar: 2026-10-27. No 70%+ result is available from this cache.
- Each symbol analysis is persisted in the SQLite research ledger. The aggregate scan summary is not persisted and clears after reload; coverage counts can overlap gate outcomes.
- Follow-up review fixes: expire a breakout at the next NSE session's 09:15 IST open, including weekend/holiday timing; fail closed for unsupported calendar years and the 2026 Muhurat session; report stale setups separately, include final-bar raw signals, and return every qualified candidate. The bundled 2026 equities holidays come from [NSE Market Timings & Holidays](https://www.nseindia.com/resources/exchange-communication-holidays) and must be refreshed before 2027 signals are supported.
- Limits: daily candles cannot establish pre-open gaps, live fills, or exact intraday sell times. Current NIFTY 50 members are applied across each symbol's full history (not survivorship-free); renamed tickers may have split history. Prices are not adjusted for splits/bonuses, and modeled fees omit brokerage, exchange fees, GST, and dividends.
- Verification: full backend pytest suite and Ruff passed after the review fixes; frontend Vitest (19 tests), ESLint, webpack production build, and schema/service regressions passed. `mypy src` still reports 13 errors in four unchanged files. The existing 5003 preview API returned 404 for the new scan route, so scan-result runtime rendering was not checked; available 695px narrow review had no visible horizontal overflow, but exact 390px mobile was unavailable.
- Run with `./run.sh`; UI port `4003`, API port `8001`. Open `/stock-research` and choose **Scan NIFTY 50** or analyze one NSE symbol.
- Next action: import at least 221 daily bars for symbols with short local histories, run the scan again, and refresh the NSE holiday calendar before supporting 2027 entry windows.

## 22. Volume/momentum study and comparison trade ledger

- Date: 2026-10-29.
- Branch: `codex/volume-momentum-results-ui-20261029`, rebased onto `origin/main` after PR #18.
- Implementation commit: `df4303d` (`Add volume momentum study and comparison trade details`).
- PR: [#19](https://github.com/arjeetanand/backtesting-stockmarket/pull/19), squash-merged into `main` as `fce2cccd96ca420c3476ece3e2cdfd92ab81c58b`; GitGuardian passed.
- Added `POST /research/volume-momentum`, which uses only the selected symbol's local NSE daily candles. Relative volume is today's volume divided by the preceding 20 sessions' average; momentum is same-day close-to-close change; outcome is the next available session's close-to-close return. Signal and outcome dates must both be inside the selected range.
- The Research UI shows sample counts, next-session up/down shares, average and median change, and descriptive volume bands. It labels small samples exploratory, presents readable cards when the results table will not fit, and states the corporate-action, forecasting, and order-flow limitations.
- Comparison explains the aggregate metrics in plain language and expands each result into trade dates, fill prices, rupee P&L, return, and holding time. Trade return is measured against the committed position amount; account change is measured against starting capital. New vector-engine trade P&L and return deduct entry and exit commission; fill prices include simulated slippage.
- Checklist: `docs/VOLUME_MOMENTUM_CHECKLIST.md`.
- Verification: full Ruff and pytest passed; focused mypy passed on all changed backend modules. Full mypy still reports 13 existing errors in `market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`. Frontend ESLint, webpack production build, and `git diff --check` passed. Browser rendered RELIANCE's 246-pair one-year study and comparison/trade cards. At a 1600 CSS-pixel desktop viewport, labeled cards fit the strategy results and trade details. The 20-year local range is available in the selected-symbol daily cache. No-sample rendering remains pending.
- The comparison was run for 3 RELIANCE strategies over the cached 2000-01-03 to 2026-10-27 range. The UI showed 83 SMA, 8 RSI/EMA, and 259 MACD closed trades, with dates, prices, P&L, return, and holding days. These are local saved simulation results, not recommendations or orders.
- Run with `./run.sh`; main UI port `4003`, API port `8001`; existing test UI ports `5003` and `6003`. Do not restart an active NSE import without checking process ownership.

## 23. Research run responsiveness and readable results

- Date: 2026-10-29.
- Branch: `codex/research-run-performance-clarity-20261029`, based on `main` at `d92c4d2`.
- Implementation commit: `7435d52` (`Keep research backtests responsive and readable`).
- PR: [#21](https://github.com/arjeetanand/backtesting-stockmarket/pull/21), squash-merged into `main` as `08948ff8ad28d2e70c7bd67416d67766003a5aae`; GitGuardian check passed. Local `main` is synced to `origin/main`.
- Keep the Research browser snapshot compact: full candle, indicator, signal, equity, and trade arrays stay in the local SQLite artifact store. The page stores a result key (or legacy run ID) and reloads that report asynchronously. The API exposes a single-artifact read route and a legacy custom-run lookup.
- Add a 60-second abort for historical runs and show elapsed time plus completed/failed counts. Present the plain-language outcome, net P&L, ending equity, trade count, win rate, drawdown, total return, and dated trade details before the chart. The chart shows the active session's OHLC, open-to-close move, and volume in shares, with an explanation of candle bodies, wicks, and volume bars.
- Browser verification on `/research?symbol=TATACONSUM&strategy=donchian_breakout`: one-year daily sample, 246 candles, one closed trade (2026-05-12 to 2026-05-14), net result −₹256 after modeled costs, ending equity ₹99,744, total return −0.26%, and maximum drawdown −0.29%. The latest displayed candle is 2026-10-27 with ₹969 open, ₹1,000 high, ₹957.45 low, ₹1,000 close, and 7.6 million shares. The result reopened after a page reload from the local artifact store. One trade is too small a sample to judge strategy quality; this is a historical simulation, not a recommendation.
- Verification: Ruff and the full `pytest -q` suite passed; all 20 frontend Vitest tests, ESLint, the webpack production build, and `git diff --check` passed. The default Turbopack build cannot bind its worker port in this sandbox, so production validation used `npm --prefix frontend run build -- --webpack`.
- Layout checked at a 1600 CSS-pixel desktop viewport and at the narrow responsive breakpoint. The browser returned 487 CSS px after a requested 390 px viewport, with no document-level horizontal overflow; exact 390 px device emulation could not be confirmed. Existing local UI/API processes on ports `4003`/`8001` were preserved; the test UI at `5003` stayed available.
- Next: if judging the strategy itself, widen the tested period after confirming local history; this one-year result contains only one closed trade and is not enough to evaluate the rule.
- Checklist: `docs/RESEARCH_RUN_CLARITY_CHECKLIST.md`.
## 24. FII/DII SQLite history visibility

- Date: 2026-10-29.
- Branch: `codex/fii-dii-sqlite-history-20261029`.
- Connect the FII/DII page to the Tapetide history already stored in SQLite, keep it separate from the official NSE snapshot, and show the actual local coverage for longer display ranges.
- Database inspection before the UI fix found 122 Tapetide rows across 61 sessions from 2026-07-31 to 2026-10-28. The active API page was using only `fii_dii_rows`, which contains four NSE rows over two sessions; that is why the previously loaded history was not visible.
- Page load and date-range changes read the saved rows only; they do not call Tapetide again. Selecting 6M/1Y displays the saved rows in that period and reports when local history does not cover the full range.
- Verification: the existing configured cache path resolves to `data/market_cache.sqlite3`. The live local page at `http://127.0.0.1:5003/insights/fii-dii` loaded 61 sessions in the 1Y view with the partial-coverage note; switching to 3M filtered the same saved rows and made no provider request. Ruff, full pytest, frontend ESLint, 20 Vitest tests, the webpack production build, and `git diff --check` passed. Full mypy reports 13 pre-existing issues across `market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`.
- Browser checks: desktop rendered the chart, summary cards, and ledger with no console errors. A requested 390px viewport was provided as 487px; the document had no horizontal overflow at 487px and the wide ledger scrolled inside its table container. The active 4003/5003 and 8001 processes were not restarted.
- No provider request was made during validation. The isolated 6003/8002 preview could not bind ports under the sandbox, so the existing 5003/8001 local app was used for browser validation.
- Implementation commit: `f9e8580` (`Show saved FII DII history from SQLite`). PR [#23](https://github.com/arjeetanand/backtesting-stockmarket/pull/23) was squash-merged into `main` as `cecb19313013a3369a35b97f0b217c2e7eb998c4`; GitGuardian passed.
- Run the existing app with `./run.sh` (UI port `4003`, API port `8001`); preserve any active import processes.
- Remaining limit: the local cache contains 61 sessions, not a complete year. The exact 390px mobile viewport was not available; the browser returned 487px with no page-level horizontal overflow.

## 25. FII/DII selectable historical refresh

- Date: 2026-10-29.
- Branch: `codex/fii-dii-long-range-sync-20261029`, based on `main` at `c0321ba`.
- Add explicit 30D/3M/6M/1Y/5Y/10Y/20Y/All range selection and on-demand Tapetide history refresh. Page loads and range changes remain local SQLite reads.
- Sync uses Tapetide's documented `/v1/market/institutional-flows` date-range API with cursor pagination. It validates returned rows, skips incomplete gross-value participant records instead of converting nulls to zero, gathers every page before a transactionally upsert into `fii_dii_history_rows`, and never writes Tapetide data into NSE's latest-snapshot table.
- Tapetide documents this daily cash-market series from 2014-01-01. Requests before then are clamped for sync; the 20Y selection explicitly reports that data can only be shown from 2014 onward. Provider quota applies. Configure `TAPETIDE_API_TOKEN` in the backend `.env` and restart Backtrack before using the sync button.
- Verification: full Ruff and pytest passed; the FII/DII unit tests passed; the changed route, service, config, schema, container, and app modules passed targeted mypy; frontend ESLint, all 20 Vitest tests, webpack production build, and `git diff --check` passed. Full mypy reports 13 existing issues in `market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`, unrelated to this change. The default `uv run` setup could not download missing dependencies under restricted network access; checks used the existing project's installed Python environment.
- Browser validation could not start the isolated preview because loopback binds on 6003/8002 returned `EPERM`; existing `4003`/`5003` and `8001` processes were preserved. No provider call was made; no Tapetide token is configured in this environment.
- Checklist: `docs/FII_DII_HISTORY_CHECKLIST.md`.
- Run with `./run.sh` (UI `4003`, API `8001`). The currently running checkout was not restarted.
- Remaining: after adding a Tapetide token to the backend `.env`, restart Backtrack and sync the chosen range; browser visual review is still pending because the sandbox denied the isolated preview ports.
