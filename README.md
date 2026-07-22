# Backtrack

Backtrack is a free, research-only Indian-market backtesting workspace. It lets a trader import official NSE daily history, define or review a strategy, run a historical simulation, replay candles one at a time, and inspect risk and reliability.

It does not connect to a broker, place real orders, execute trades, or require a Dhan account, client ID, access token, paid API, or subscription.

## Current product status

| Capability | Current behavior |
| --- | --- |
| Historical market data | Official NSE Common Bhavcopy daily archives imported into a local SQLite database |
| Archive reuse | Original daily ZIP files are saved locally and reused for later stock requests; they are never committed to Git |
| Backtesting | SMA crossover and configurable indicator-rule backtests with fees/slippage |
| Research | Natural-language hypothesis review through local Ollama, when Ollama is installed |
| YouTube import | Extracts reviewable rules from a YouTube URL, captions, or pasted transcript |
| Chart replay | Historical candle-by-candle replay with simulated orders only |
| Risk/reliability | Validity audit, robustness analysis, drawdown, trade, and performance metrics |
| Options | Educational payoff calculator; not an options-chain or execution system |
| Live trading | Not implemented and intentionally out of scope |

## Recommended trader workflow

1. Open **Manage stock data**.
2. Choose **All history**, **Last 4 years**, **Last 1 year**, a calendar year, or **Custom start and end dates**.
3. Leave the backend running while the background import checks and loads the archives.
4. Search a symbol on the same page to confirm its saved period and candle count.
5. Open **Test a strategy**, **Replay a chart**, or another research page; they all use the same local database.

## Historical NSE data lifecycle

The importer works at the archive-day level, not once per stock:

```text
Select stocks and date range
        ↓
Check SQLite archive-day coverage
        ↓
Reuse data/nse_archives/YYYY-MM-DD ZIP when present
        ↓ otherwise
Download one official NSE Common Bhavcopy ZIP for that weekday
        ↓
Save the original ZIP locally
        ↓
Store every raw CSV row in SQLite
        ↓
Normalize all supported EQ/BE/ETF rows into OHLCV candles
        ↓
Mark the complete archive day as processed
        ↓
Backtests and replay read the local NSE cache
```

The original ZIP is stored in `data/nse_archives/<year>/` using an atomic file replacement. Existing flat ZIPs are organized into year folders when the importer starts. Dates before 2024 use NSE's legacy historical equity archive URL and columns; 2024 onward uses the current Common Bhavcopy archive. Every raw row is stored in the `nse_bhavcopy_rows` SQLite table, including fields that are not currently needed by the OHLCV engine. Supported exchange-traded equity, BE, and ETF rows are also written to `ohlcv_bars` for fast backtesting. Raw rows, normalized bars, archive metadata, and coverage are committed together per archive day, so an interrupted day is retried safely. This means a later request for another stock from the same date does not download the NSE archive again.

Mutual-fund NAVs, intraday data, derivatives execution, and live quotes are not provided by this importer.

## Quick start

Requirements:

- Python 3.12 or newer
- Node.js and npm
- Optional: Ollama for local natural-language strategy review

From the repository root:

```bash
python3.12 -m venv venv
source venv/bin/activate
python -m pip install -e ".[dev]"

cp .env.example .env

cd frontend
npm install
cd ..
```

Start the backend:

```bash
source venv/bin/activate
uvicorn quant_research.api.main:app --reload --port 8000
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

Open:

- UI: `http://localhost:3000`
- API documentation: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/v1/health`

### First-time historical data setup

You do not need a broker account, Dhan credentials, a paid API, or a separate data download script.

1. Open `http://localhost:3000/data`.
2. In **Download NSE history once**, choose **All history · 2000 to today** for the complete dataset, or choose **Last 4 years** for a smaller first download.
3. Click **Download all NSE history** once.
4. Leave the backend running while the progress message shows the archive days being checked and loaded.

That one action refreshes the official NSE equity list, checks the local SQLite database and archive folder, then queues the missing history in the background. Each NSE trading-day ZIP contains the full daily market file, so the importer downloads one archive per day and bulk-loads all supported equity/BE/ETF rows into SQLite. It also saves the original ZIP under `data/nse_archives/<year>/` for reuse.

The import is incremental and safe to repeat. Existing database coverage and local ZIPs are reused; duplicate candles are not inserted. After it finishes, **Test a strategy**, **Replay a chart**, and the other research pages read the same local NSE database.

To download only one year, choose that year in the same dropdown and click **Download YYYY**. To download an exact window, choose **Custom start and end dates**. The importer still checks existing data first and downloads only missing trading days. The full 2000-to-today import can take a long time because it covers many trading days and NSE equities; it is designed to run as a background job rather than blocking the browser.

If a fresh clone has no `data/` files, that is expected. The application creates the SQLite database and archive folders automatically when the first import starts.

## Market data is downloaded on demand

The SQLite database and NSE ZIP archives are intentionally excluded from Git. They can grow to several gigabytes and are local runtime data, not application source code.

After a fresh clone:

1. Start the backend and frontend using the commands above.
2. Open **Manage stock data**.
3. Leave **All history · 2000 to today** selected, choose a quick range, or enter custom dates.
4. Click the matching download button.
5. Search for a symbol to confirm that its local history is available.

The importer creates `data/market_cache.sqlite3` and `data/nse_archives/<year>/` locally. It checks the SQLite coverage and local archive folder first, downloads only missing official NSE archive days, saves each original ZIP locally, and bulk-loads the archive rows into SQLite. Repeating the same request reuses the local archive/database coverage instead of downloading the day again.

No market data is downloaded by `git clone`, Python installation, or `npm install`. If you already have archives from another machine, copy them into `data/nse_archives/<year>/` before importing and the importer will check them first.

## Environment configuration

`.env.example` is the safe template. No secret is required for the local NSE workflow.

```dotenv
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
OLLAMA_TIMEOUT_SECONDS=25
MARKET_CACHE_PATH=data/market_cache.sqlite3
NSE_ARCHIVE_PATH=data/nse_archives
```

Optional frontend override in `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

### Ollama

Ollama is optional. It is used by **Research** to turn a natural-language idea into a constrained, reviewable strategy proposal. It does not place orders. The API waits up to `OLLAMA_TIMEOUT_SECONDS` (25 seconds by default); if the local service is stopped, the model is missing, or inference times out, Research returns an explicitly labelled deterministic catalogue proposal instead of pretending it came from an LLM. The proposal can still be tested against the real cached NSE history, and a later retry can use Ollama once it is healthy.

Example setup:

```bash
ollama serve
ollama pull qwen3:4b
```

The configured model can be changed with `OLLAMA_MODEL`.

## Pages and how to use them

| Route | User-facing purpose | Current data behavior |
| --- | --- | --- |
| `/` | Home | Choose a stock/date range and start a strategy test, YouTube import, or replay |
| `/research` | Test a strategy | Ollama hypothesis review, automatic NSE history preparation, cached session restore, SMA backtest handoff |
| `/strategy` | Build rules | Visual strategy/rule configuration and backtest setup |
| `/strategy-import` | Use a YouTube strategy | URL/transcript extraction into reviewable entry, exit, risk, and assumption sections |
| `/data` | Manage stock data | One-click quick/custom date-range import, local stock search, saved period/candle count, and progress |
| `/backtests` | My tests | List saved local backtest runs and open details |
| `/backtests/[id]` | Backtest detail | Metrics, equity/drawdown/trade views, risk and validity information |
| `/comparison` | Compare tests | Compare configured strategy runs using the local cache |
| `/robustness` | Check reliability | Parameter sensitivity, Monte Carlo, walk-forward, and stress analysis |
| `/bias-validity` | Risk Engine | Look-ahead, data quality, overfitting, and validity checks |
| `/ml-lab` | ML Lab | Compare return-prediction models on local NSE history with chronological validation and walk-forward diagnostics |
| `/replay` | Replay a chart | Step through historical NSE candles and place simulated orders |
| `/options` | Learn | Educational call/put payoff and breakeven calculator |
| `/analytics` | Analytics | Performance and trade-quality views for available local run data |
| `/settings` | Settings | Shows local data, Ollama, and application configuration state |

## Backend API

All routes are prefixed with `/api/v1`.

### System and market data

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Provider, Ollama, and configuration status |
| GET | `/providers` | Shows the local NSE provider capability and no-paid-account behavior |
| GET | `/data/cache` | Total cached symbols, candles, earliest date, and latest date |
| GET | `/data/availability` | Cached availability for one symbol |
| GET | `/data/instruments` | Search the saved official NSE catalogue |
| GET | `/data/inventory` | Search catalogue/stored symbols and show exact date coverage |
| GET | `/data/instruments/export` | Download the saved stock catalogue as CSV/Excel-compatible data |
| POST | `/data/instruments/refresh` | Download and save the official NSE equity catalogue |
| POST | `/data/nse-import/preview` | Calculate cached, missing, and overlapping archive days |
| POST | `/data/nse-import` | Queue an incremental NSE archive import |
| GET | `/data/nse-import/{job_id}` | Poll import progress and final archive/candle counts |
| GET | `/market-data` | Return validated local daily/weekly/monthly historical bars |

### Research and backtesting

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/research/ensure-data` | Prepare one year of warm-up data through today for a symbol |
| POST | `/research/hypothesis` | Generate a constrained, reviewable Ollama hypothesis proposal |
| GET | `/research/artifacts/{kind}` | List saved hypothesis, custom-backtest, or robustness artifacts |
| POST | `/strategy/youtube` | Extract a reviewable strategy draft from a URL/transcript |
| POST | `/backtests/sma-crossover` | Run/persist a long-only SMA crossover test |
| POST | `/backtests/custom` | Run/cache a configurable RSI/EMA/rule backtest |
| GET | `/backtests` | List persisted backtest results |
| GET | `/backtests/{run_id}` | Read one persisted result |
| POST | `/robustness/analyze` | Run/cache parameter, Monte Carlo, and stress analysis |
| POST | `/bias-validity/audit` | Audit look-ahead, data, and strategy validity |
| POST | `/ml/experiments` | Run/cache a chronological ML return-prediction experiment |
| GET | `/ml/experiments` | List saved ML experiment reports |

### Replay

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/replay/sessions` | Create a historical simulated replay session |
| GET | `/replay/sessions/{session_id}` | Read persisted replay state and revealed candles |
| POST | `/replay/sessions/{session_id}/step` | Reveal the next candle(s) |
| POST | `/replay/sessions/{session_id}/orders` | Place a simulated market/limit/stop order |
| POST | `/replay/sessions/{session_id}/orders/{order_id}/close` | Close a simulated order |
| POST | `/replay/sessions/{session_id}/finish` | Finish the replay and calculate results |

## Repository structure

```text
backtrack/
├── README.md                         # Public setup and product documentation
├── handover.md                       # Engineering ownership and release handoff
├── TESTING.md                        # Test/release contract and QA checklist
├── PROJECT_GUIDE.md                  # Page-by-page product guide
├── FRONTEND_CODEBASE_SUMMARY.md     # Frontend reference notes
├── REPLAY_IMPLEMENTATION_PLAN.md    # Replay design history/roadmap
├── pyproject.toml                    # Python package, lint, mypy, pytest config
├── .env.example                      # Safe local configuration template
├── src/quant_research/
│   ├── api/                          # FastAPI app, settings, schemas, routes
│   ├── data_providers/               # Local NSE cache and provider adapters
│   ├── domain/
│   │   ├── analytics/                # Metrics and report calculations
│   │   ├── backtesting/              # Result models and vector engine
│   │   ├── data/                     # OHLCV models and validation
│   │   ├── dsl/                      # Strategy rule models/compiler
│   │   ├── indicators/               # Indicator definitions/calculators
│   │   ├── robustness/               # Sensitivity/stress diagnostics
│   │   └── validity/                 # Bias and validity auditing
│   ├── llm/                          # Local Ollama client
│   ├── repositories/                 # SQLite market, run, and artifact stores
│   └── services/                     # Import, research, replay, strategy, and ML services
├── frontend/
│   ├── src/app/                      # Next.js route pages
│   ├── src/components/               # Shared layout, charts, UI primitives
│   └── src/lib/                      # API clients, replay types, local swarm modules
├── data/                             # Local runtime data; ignored by Git
│   ├── market_cache.sqlite3          # Created locally on first import
│   └── nse_archives/                 # Downloaded locally on demand, grouped by year
└── tests/                            # Backend unit, persistence, API, and engine tests
```

## Persistence model

The default `data/market_cache.sqlite3` contains:

- `ohlcv_bars`: normalized OHLCV candles keyed by symbol/timeframe/timestamp.
- `instruments`: saved NSE catalogue metadata.
- `nse_import_coverage`: processed symbol/timeframe/day markers.
- `nse_archive_days`: complete archive-day metadata and local ZIP path.
- `nse_bhavcopy_rows`: raw JSON payload for every imported NSE CSV row.
- `backtest_runs`: persisted backtest results and deterministic cache keys.
- `research_artifacts`: cached hypotheses, custom backtests, robustness reports, import jobs, YouTube results, and replay sessions.

The research page also restores its current client session from localStorage, and replay stores the current session ID locally so a reload can recover the server-persisted replay.

## Verification commands

From the repository root:

```bash
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run ruff check src tests
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run mypy src
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run pytest -q
git diff --check
```

Frontend:

```bash
npm --prefix frontend run build -- --webpack
```

The test suite uses fake providers/openers and does not require network access. The archive reuse regression test verifies that a saved ZIP is loaded without another download and that all eligible rows are persisted.

## Important limitations

- NSE data is daily archive data, not a real-time feed.
- The local free workflow does not require or support Dhan order execution.
- Holidays and dates without an official NSE archive are skipped.
- Normalized backtest bars currently cover supported EQ/BE/ETF rows; all other raw archive rows are retained for future work but are not yet modeled by the backtest engine.
- Options output is educational and does not model the complete Indian derivatives lifecycle, Greeks, IV, taxes, brokerage, margin, spreads, or settlement.
- YouTube extraction is a draft; it requires human review and does not automatically execute a strategy.
- Ollama is optional and must be installed/running locally for AI hypothesis generation.
- Free data can be incomplete or unavailable. The application should report that condition rather than fabricate prices.
- The application is intended for single-user local research. Multi-user authentication, authorization, job queues, observability, backups, and production market-data licensing are not implemented.

## Safety boundary

Every order in replay is simulated. A backtest result is historical analysis, not a prediction or financial recommendation. Validate data quality, look-ahead assumptions, fees, slippage, sample size, and out-of-sample behavior before using any conclusion.
