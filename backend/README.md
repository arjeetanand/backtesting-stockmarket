# Backtrack backend

The backend is a FastAPI application in `src/quant_research`. It owns the local NSE data lifecycle, SQLite persistence, strategy calculations, research services, and replay sessions.

The backend is intentionally free and research-only. It has no broker execution, Dhan dependency, paid market-data API, or live-order endpoint.

## Run locally

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e "[dev]"
cp .env.example .env
./scripts/dev-backend.sh 8001
```

API documentation: `http://localhost:8001/docs`
Health check: `http://localhost:8001/api/v1/health`

Pass any available port to `./scripts/dev-backend.sh`, for example `8001` or
`8002`, when running another local backend instance. Pair it with the same port
in `./scripts/dev-frontend.sh`, such as `./scripts/dev-frontend.sh 3001 8001`.

The backend script validates the selected port and prefers the repository's
`.venv/bin/uvicorn`. Check a running instance with
`curl http://127.0.0.1:<port>/api/v1/health` or open its `/docs` page. Restart
the process after route or settings changes when reload is not observing the
change; a stale process can expose an older API contract.

## Configuration

The backend reads `.env` through `src/quant_research/api/config.py`.

```dotenv
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
MARKET_CACHE_PATH=data/market_cache.sqlite3
NSE_ARCHIVE_PATH=data/nse_archives
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_TIMEOUT_SECONDS=25
```

No environment secret is required for the local NSE workflow.

## Historical NSE importer

`NseBhavcopyImporter` works at archive-day level:

1. Normalize the requested date range.
2. Check the SQLite archive-day marker and local ZIP path.
3. Reuse a saved ZIP when available.
4. Otherwise download one official NSE archive for that trading day.
5. Save the original ZIP under `data/nse_archives/<year>/`.
6. Parse every raw CSV row and retain it in `nse_bhavcopy_rows`.
7. Normalize supported EQ, BE, and ETF rows into `ohlcv_bars`.
8. Save archive metadata, raw rows, candles, and coverage atomically.
9. Mark the day complete only after the transaction succeeds.

One archive contains the exchange-wide daily file. The importer therefore bulk-loads all supported stocks from each archive; it does not download one file per symbol. Repeating a request reuses existing ZIPs and conflict-safe candle upserts.

The current UI supports all history from 2000, the last four years, the last year, a calendar year, or custom start/end dates. The API job runs in the background and can be polled with its job ID.

Dates before 2024 use the legacy NSE historical equity format. Later dates use current Common Bhavcopy/UDiFF aliases. Raw rows are retained even when a field is not yet modeled by the backtest engine.

## SQLite storage

The default database is `data/market_cache.sqlite3`.

| Table | Responsibility |
| --- | --- |
| `ohlcv_bars` | Normalized candles keyed by symbol, timeframe, and timestamp |
| `instruments` | Searchable official NSE catalogue metadata |
| `nse_import_coverage` | Symbol/timeframe/trading-day coverage markers |
| `nse_archive_days` | Archive-day status, ZIP path, source, and row count |
| `nse_bhavcopy_rows` | Every imported raw row as JSON |
| `backtest_runs` | Persisted backtest results and cache keys |
| `research_artifacts` | Hypotheses, custom results, robustness, YouTube, imports, and replay artifacts |

SQLite, archives, and generated runtime data are ignored by Git. They must not be committed.

## API groups

All routes are prefixed with `/api/v1`.

### Data

- `GET /data/cache` — cache summary.
- `GET /data/instruments?query=...` — catalogue search.
- `GET /data/inventory?query=...` — catalogue search with saved candle period/count.
- `POST /data/instruments/refresh` — refresh official NSE catalogue.
- `POST /data/nse-import/preview` — preview missing/overlapping dates.
- `POST /data/nse-import` — queue a bulk incremental import.
- `GET /data/nse-import/{job_id}` — read import progress.
- `GET /market-data` — return validated local bars.

### Research and backtesting

- `POST /research/ensure-data`
- `POST /research/hypothesis`
- `POST /backtests/sma-crossover`
- `POST /backtests/custom`
- `GET /backtests`
- `GET /backtests/{run_id}`
- `POST /strategy/youtube`
- `POST /robustness/analyze`
- `POST /bias-validity/audit`
- `POST /ml/experiments`
- `GET /ml/experiments`
- `POST /pattern-finder/test`
- `DELETE /backtests`
- `DELETE /backtests/{run_id}`
- `DELETE /testing-history`
- `DELETE /research/artifacts/{kind}/{artifact_key}`

### Scanning, ML, and watchlist

- `POST /market-scanner/run` — run a vectorized multi-stock strategy scan from the local NSE cache.
- `POST /breakout-scanner/scan` — find local historical breakout setups by conviction threshold.
- `POST /ml/experiments` and `GET /ml/experiments` — run and list chronological, past-only ML research experiments.
- `POST /data/sync-today` — import the current missing NSE archive day when available.
- `POST /watchlist/add`, `GET /watchlist`, and `DELETE /watchlist/{item_id}` — persist, evaluate, and remove simulated setup bookmarks.

Watchlist status is evaluated only against local daily bars on or after the setup's
entry date. A pre-entry high or low must not mark a newly saved setup as completed.

`GET /market-data` is the chart-read path for a selected symbol, timeframe, and datetime range. The custom backtest response includes the existing candles, indicators, trades, equity, drawdown, and metrics plus real candle `volume` and stable signal `id`/`trade_id` fields. `422` responses are used for insufficient history and unsupported strategy parameters so the frontend can show an actionable correction.

### Strategy engine additions

`run_rule_backtest()` supports the original indicator strategies plus these deterministic price-action interpretations:

- `support_resistance_breakout`
- `market_structure_break`
- `fibonacci_retracement`
- `price_action_reversal`
- `supply_demand_zones`
- `ict_liquidity_fvg`
- `multi_timeframe_trend`

Signals are computed after candle close `T` and filled at the next candle open `T+1`. The new price-action rules are daily-bar, long-only interpretations and are explicitly not exact YouTube transcriptions. `ict_liquidity_fvg` is an educational daily approximation, not full intraday ICT logic.

When adding a strategy, add its engine logic, chart indicators, frontend catalogue entry, comparison/hypothesis label, and a parametrized test. Keep the shared cost/risk controls and no-lookahead execution contract unchanged.

### Replay

- `POST /replay/sessions`
- `GET /replay/sessions/{session_id}`
- `POST /replay/sessions/{session_id}/step`
- `POST /replay/sessions/{session_id}/orders`
- `POST /replay/sessions/{session_id}/orders/{order_id}/close`
- `POST /replay/sessions/{session_id}/finish`

### Watchlist tracking

- `POST /watchlist/add` — save a scanner setup as a forward paper-tracking item.
- `GET /watchlist` — return current price, P&L, and status.
- `DELETE /watchlist/{item_id}` — remove one saved setup.

Target/stop status is evaluated only against candles on or after the item's
entry date. Historical highs and lows from before a setup was bookmarked must
not complete a new setup.

### Local SQLite concurrency

Repository connections use a 30-second busy timeout. This prevents concurrent
local frontend instances from failing immediately with `database is locked`,
but SQLite remains a single-user local store rather than a distributed job
database.

## Backend source map

```text
src/quant_research/
├── api/              # FastAPI app, settings, schemas, routes, dependency wiring
├── data_providers/   # Local NSE provider and compatibility adapters
├── domain/           # Data models, indicators, DSL, engine, analytics, validity
├── llm/              # Ollama client and response handling
├── repositories/     # SQLite market, run, and artifact persistence
└── services/         # Import, research, YouTube, replay, ML, scanner, watchlist, and strategy workflows
```

## Backend tests

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
uv run pytest -q tests/unit/test_data_inventory_api.py tests/unit/test_nse_import.py
```

Tests use temporary SQLite databases and fake providers. They do not download market data.
