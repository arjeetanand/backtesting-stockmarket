# Backtrack engineering handover

Last reviewed: 2026-07-23

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

### SQLite tables

`SqliteMarketCache` creates and owns:

| Table | Purpose |
| --- | --- |
| `ohlcv_bars` | Normalized candles; primary key is `(symbol, timeframe, timestamp)` |
| `instruments` | Official NSE catalogue metadata and searchable company/industry fields |
| `nse_import_coverage` | Symbol/timeframe/day coverage markers and backward-compatible import tracking |
| `nse_archive_days` | One row per complete processed archive day, including ZIP path/source/row count |
| `nse_bhavcopy_rows` | Every imported raw CSV row as JSON, including fields not yet used by the backtest engine |

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
| Research | `frontend/src/app/research/page.tsx` | Hypothesis prompt, Ollama proposal, NSE data preparation, backtest handoff, saved-session restore |
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
| Options Learn | `frontend/src/app/options/page.tsx` | Educational payoff and breakeven calculator |
| Analytics | `frontend/src/app/analytics/page.tsx` | Performance and trade-quality analysis |
| Settings | `frontend/src/app/settings/page.tsx` | Local configuration and provider status |

Shared frontend infrastructure:

- `frontend/src/components/layout/`: sidebar and top navigation.
- `frontend/src/components/charts/`: chart primitives.
- `frontend/src/components/ui/`: buttons, cards, and badges.
- `frontend/src/lib/backtest-api.ts`: backtest API client.
- `frontend/src/lib/market-data.ts`: market-data client.
- `frontend/src/lib/replay/`: replay API client and types.
- `frontend/src/lib/robustness-api.ts`: robustness API client.
- `frontend/src/lib/agents/`: five in-process TypeScript swarm modules.
- `frontend/src/lib/strategy-library.ts`: known strategy definitions used by strategy selection and education.
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
