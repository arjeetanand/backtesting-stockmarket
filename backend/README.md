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
uvicorn quant_research.api.main:app --reload --port 8000
```

API documentation: `http://localhost:8000/docs`  
Health check: `http://localhost:8000/api/v1/health`

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

### Replay

- `POST /replay/sessions`
- `GET /replay/sessions/{session_id}`
- `POST /replay/sessions/{session_id}/step`
- `POST /replay/sessions/{session_id}/orders`
- `POST /replay/sessions/{session_id}/orders/{order_id}/close`
- `POST /replay/sessions/{session_id}/finish`

## Backend source map

```text
src/quant_research/
├── api/              # FastAPI app, settings, schemas, routes, dependency wiring
├── data_providers/   # Local NSE provider and compatibility adapters
├── domain/           # Data models, indicators, DSL, engine, analytics, validity
├── llm/              # Ollama client and response handling
├── repositories/     # SQLite market, run, and artifact persistence
└── services/         # Import, research, YouTube, replay, ML, and strategy workflows
```

## Backend tests

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
uv run pytest -q tests/unit/test_data_inventory_api.py tests/unit/test_nse_import.py
```

Tests use temporary SQLite databases and fake providers. They do not download market data.
