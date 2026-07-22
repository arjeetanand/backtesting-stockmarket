# Backtrack

Backtrack is a free, local, research-only Indian-market backtesting workspace. It imports official NSE daily archives, stores them locally, lets traders test rule-based strategies, replay candles, and inspect performance, risk, and reliability.

It does not place real orders, connect to a broker, provide live quotes, or require Dhan credentials, a paid API, or a subscription.

## What the application does

- Downloads official NSE daily archive files on demand.
- Saves original ZIP archives under `data/nse_archives/<year>/`.
- Bulk-loads every supported equity, BE, and ETF row from each archive into SQLite.
- Keeps raw archive rows for future research and normalized OHLCV candles for fast tests.
- Tests SMA, RSI/EMA, configurable rule, strategy-library, and imported YouTube ideas.
- Replays historical candles with simulated orders only.
- Persists backtests, research artifacts, import jobs, and replay sessions locally.

## First-time setup

Requirements: Python 3.12+, Node.js, and npm. Ollama is optional and is used only for local hypothesis assistance.

From the repository root:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -e "[dev]"
cp .env.example .env
npm --prefix frontend install
```

Start the API in one terminal:

```bash
source .venv/bin/activate
uvicorn quant_research.api.main:app --reload --port 8000
```

Start the UI in another terminal:

```bash
npm --prefix frontend run dev
```

Open `http://localhost:3000`. API documentation is available at `http://localhost:8000/docs`.

## Download historical NSE data

Open **Manage stock data** at `http://localhost:3000/data`.

Choose one of the supported windows:

- **All history · 2000 to today**
- **Last 4 years · one click**
- **Last 1 year · one click**
- Any calendar year
- **Custom start and end dates**

Click the matching download button once and leave the API running. The job checks SQLite and the local archive folder first, reuses saved ZIPs, downloads only missing archive days, and bulk-loads all supported stocks from each day. There is no per-stock import step.

After the job completes, search a symbol or company name in **Find a stock** to see its saved period, candle count, and local status. All research pages use the same SQLite cache.

The full 2000-to-today download can take a long time. It runs as a background API job and is safe to repeat. Existing archive days and candles are reused or upserted without creating duplicates.

## Repository documentation

- [PROJECT_GUIDE.md](PROJECT_GUIDE.md) — user-facing page-by-page guide and workflows.
- [backend/README.md](backend/README.md) — FastAPI, SQLite, NSE importer, API, and backend development.
- [frontend/README.md](frontend/README.md) — Next.js UI, routes, local agents, styling, and frontend development.
- [handover.md](handover.md) — engineering ownership, persistence contract, architecture, and handoff notes.
- [TESTING.md](TESTING.md) — automated tests, UI smoke checks, data checks, and release checklist.
- [AGENTS.md](AGENTS.md) — instructions for coding agents working in the repository.

## Main pages

| Route | Purpose |
| --- | --- |
| `/` | Simple starting point for a stock, date range, strategy test, YouTube import, or replay |
| `/data` | Bulk NSE history download and local stock search |
| `/research` | Describe an idea, review a proposal, prepare data, and run a backtest |
| `/strategy` | Build indicator and rule-based strategies |
| `/strategy-import` | Extract reviewable rules from a YouTube URL or transcript |
| `/backtests` | Reopen saved historical tests |
| `/replay` | Step through historical candles with simulated orders |
| `/comparison` | Compare saved tests |
| `/robustness` | Sensitivity, Monte Carlo, walk-forward, and stress checks |
| `/bias-validity` | Look-ahead, data-quality, and overfitting checks |
| `/ml-lab` | Chronological, cost-aware ML research experiments |
| `/pattern-finder` | Detect repeatable historical price patterns and test them locally |
| `/options` | Educational options payoff and breakeven calculator |
| `/analytics` | Performance and trade-quality views |
| `/settings` | Local data, Ollama, and application status |

See [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the complete user guide.

## Runtime data and Git

SQLite databases, NSE ZIP archives, `.env` files, caches, and generated runtime artifacts are ignored by Git. A fresh clone intentionally has no market data. The first data import creates:

```text
data/market_cache.sqlite3
data/nse_archives/<year>/nse_bhavcopy_YYYY-MM-DD.csv.zip
```

Do not commit market data or credentials. The repository is kept lightweight by storing only source code, tests, lockfiles, and documentation.

## Optional Ollama setup

Ollama is not required for market-data import or backtesting. To enable local natural-language research assistance:

```bash
ollama serve
ollama pull qwen3:4b
```

Configure `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, and `OLLAMA_TIMEOUT_SECONDS` in `.env`. If Ollama is unavailable, Research returns an explicitly labelled deterministic fallback proposal; it never pretends that a model ran.

## Verification

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
git diff --check
npm --prefix frontend run build
```

## Important limitations

- NSE data is daily historical archive data, not a real-time feed.
- Replay and backtesting are simulations, not trading execution.
- Normalized backtest bars currently cover supported EQ/BE/ETF rows; raw rows are retained for future work.
- Options calculations are educational and do not model the complete derivatives lifecycle.
- YouTube extraction is a reviewable draft and never executes automatically.
- The application is designed for local single-user research, not production multi-user deployment.
