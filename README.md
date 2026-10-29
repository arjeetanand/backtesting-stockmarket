# Backtrack

Backtrack is a free, local, research-only Indian-market backtesting workspace. It imports official NSE daily archives, stores them locally, lets traders test rule-based strategies, replay candles, and inspect performance, risk, and reliability.

It does not place real orders, connect to a broker, provide live quotes, or require Dhan credentials, a paid API, or a subscription.

## What the application does

- Downloads official NSE daily archive files on demand.
- Saves original ZIP archives under `data/nse_archives/<year>/`.
- Bulk-loads every supported equity, BE, and ETF row from each archive into SQLite.
- Keeps raw archive rows for future research and normalized OHLCV candles for fast tests.
- Tests SMA, RSI/EMA, configurable rule, strategy-library, and imported YouTube ideas.
- Scans local daily NSE history for transparent bullish and bearish structure zones, their break level, retests, invalidation, and data coverage; ranks positive and negative 20-session close-pressure estimates in a selectable flow view.
- On `/research`, follows one stock → local data → chart → strategy → backtest → results workflow with OHLCV, volume, indicators, signals, trades, equity, drawdown, and metrics; its volume study groups next-session outcomes by prior-20-session relative volume and same-day move.
- On `/comparison`, compares historical results and expands each strategy into its dated trade fills and recorded profit/loss.
- On `/stock-research`, scans the built-in NIFTY 50 basket and shows only triggers whose next-session entry window is open and whose fixed-rule held-out test passes the evidence gate; search one stock for its indicators, conditional levels, candles, trade history, and local run log.
- Replays historical candles with simulated orders only.
- Runs a seeded daily-bar scenario sample and compares it with a fixed-rule historical sample.
- Builds a manual morning watchlist from the latest completed NSE daily candles, with conditional trigger, stop, and 2R target levels.
- Persists backtests, research artifacts, import jobs, and replay sessions locally.

## Run locally

Requirements: Python 3.12+, `uv`, Node.js, and npm. Ollama is optional; it is used only for local hypothesis assistance and is not required for importing data or running backtests.

From the repository root, create the environment and install dependencies once:

```bash
uv sync --extra dev
npm --prefix frontend ci
```

Start both services from the repository root:

```bash
./run.sh
```

Open the application at `http://localhost:4003`. API documentation is at `http://localhost:8001/docs`; confirm the backend with:

```bash
curl http://127.0.0.1:8001/api/v1/health
```

The launcher uses web port `4003` and API port `8001`; the matching UI test slots are `5003` and `6003`. Press `Ctrl+C` to stop both services. Running `./run.sh` again gracefully restarts only the Backtrack processes it started and fails closed if either port belongs to another app. The frontend shows explicit unavailable/error states when the backend is stopped; it does not use mock or fabricated prices.

For a temporary UI instance that shares the same API, run
`./scripts/dev-frontend.sh 5003 8001` or `./scripts/dev-frontend.sh 6003 8001` while that
test port is free. The frontend script sets `NEXT_PUBLIC_API_BASE_URL` from the backend
port; an explicitly set value still takes precedence. Local `localhost` and `127.0.0.1`
frontend ports are accepted by the backend CORS policy. No NSE download is needed to start
the app; use **Manage stock data** at `/data` to import the historical archive window
required for your research.

## Download historical NSE data

Open **Manage stock data** at `http://localhost:4003/data`.

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
- [DESIGN.md](DESIGN.md) — shared palette, typography, layout, and component guidance.
- [docs/UI_THEME_CHECKLIST.md](docs/UI_THEME_CHECKLIST.md) — theme implementation and delivery checklist.
- [handover.md](handover.md) — engineering ownership, persistence contract, architecture, and handoff notes.
- [TESTING.md](TESTING.md) — automated tests, UI smoke checks, data checks, and release checklist.
- [docs/STRUCTURE_ZONE_SCAN_CHECKLIST.md](docs/STRUCTURE_ZONE_SCAN_CHECKLIST.md) — scope and delivery checklist for the local daily structure-zone scan.
- [AGENTS.md](AGENTS.md) — instructions for coding agents working in the repository.
- [docs/](docs/) — planning, design, UX, QA, and knowledge-transfer reference documents.

## Main pages

| Route | Purpose |
| --- | --- |
| `/` | Guided path from local NSE data to research, saved results, and comparison |
| `/data` | Bulk NSE history download and local stock search |
| `/research` | Describe an idea, review a proposal, prepare data, and run a backtest |
| `/stock-research` | Run a gated NIFTY 50 morning scan or explain one symbol's indicators, conditional plan, historical test, candles, and persistent run ledger |
| `/strategy` | Build indicator and rule-based strategies |
| `/strategy-import` | Extract reviewable rules from a YouTube URL or transcript |
| `/backtests` | Reopen saved historical tests |
| `/replay` | Step through historical candles with simulated orders |
| `/time-machine` | Sample daily-bar scenarios from local NSE history |
| `/comparison` | Compare saved tests |
| `/robustness` | Sensitivity, Monte Carlo, walk-forward, and stress checks |
| `/bias-validity` | Look-ahead, data-quality, and overfitting checks |
| `/market-scanner` | Formula screening, sector analysis, morning plans, daily structure zones, and a local pressure-flow board |
| `/ml-lab` | Chronological, cost-aware ML research experiments |
| `/pattern-finder` | Detect repeatable historical price patterns and test them locally |
| `/options` | Educational options payoff and breakeven calculator |
| `/analytics` | Performance and trade-quality views |
| `/insights` | Local NSE index breadth, stock/sector heatmaps, and top movers |
| `/insights/fii-dii` | Saved Tapetide FII/DII history from SQLite, with a separate official NSE latest-session view |
| `/settings` | Local data, Ollama, and application status |

See [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the complete user guide.

## One stock research workspace

Backtrack is the single active stock-research repository and website. Its ML Lab already
covers chronological model evaluation using locally imported NSE data, while its scanner,
market insights, strategy tests, robustness checks, and replay share the same workspace.
Four older private stock prototypes were archived on GitHub after the audit; they remain
recoverable there. No legacy generated datasets or machine-specific paths were copied.

## Interface theme

The website uses a light-indigo frame, white research canvas, navy editorial headings, and
pale periwinkle primary actions across its routes. Shared UI tokens and responsive rules
are documented in [DESIGN.md](DESIGN.md); the theme keeps the existing local,
historical-only research boundary. Six original transparent PNG illustrations sit beside
the workflow or first-use state they explain. They keep their full aspect ratio and stay
static; route headers remain compact so the page title and task are easy to find.

## Research workflow

Start on **Home** and follow **NSE data → New research → Saved tests → Compare tests**. Import a larger history window first when the local cache does not cover your selected stock and dates; completed imports offer a direct link to research. In Research, describe a rule, choose the NSE symbol and date range, and let the optional local helper prepare a proposal. Review the rule, assumptions, and risks; explicitly confirm that review; then run the historical simulation. Backtrack shows real local OHLCV, trades, equity, drawdown, and metrics. Its plain-language result comes before the chart; the chart shows the selected session's open, high, low, close, and shares traded. Large result arrays stay in local SQLite instead of being synchronously copied into browser storage. Missing data stays unavailable rather than being replaced with synthetic prices. The visible checkpoints are one application workflow, not separate AI agents. If Ollama is unavailable, Backtrack labels the catalogue-based proposal as a fallback.

The chart boundary is intentionally API-independent: `frontend/src/lib/research-chart.ts` adapts market-data and backtest responses into the typed contracts in `frontend/src/lib/chart-data.ts`, while `frontend/src/components/charts/FinancialChart.tsx` owns rendering and interaction. The backend's custom result adds candle `volume` and signal `id`/`trade_id` fields without removing existing result fields.

**Time Machine** at `/time-machine` runs 10,000 seeded scenarios by re-sampling the symbol's cached NSE daily OHLC bars with replacement, then compares them with rolling historical outcomes for the same fixed rule. The output is a daily-bar scenario sample, not an intraday simulator, price forecast, or probability estimate. No broker orders are placed.

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
- Daily structure zones are an independent Backtrack OHLCV heuristic. They are confirmed range breaks with a nearby opposite candle, not evidence of institutional activity, and they do not use intraday data.
- Market flow ranks the close-location value of the latest 20 saved daily candles, weighted by traded value, and marks candidate daily price zones for a selected symbol. It cannot identify buyers or sellers, measure bid/ask depth, or provide live order blocks.
- The current research chart and strategy engine support the local `1day` NSE path; other timeframes remain explicit unavailable/configuration states until normalized data exists.
- FII/DII Insights reads previously saved Tapetide rows from SQLite without another provider request. It keeps them separate from the official NSE latest-session report, and the 30D/3M/6M/1Y controls filter only locally stored dates. NSE does not provide the historical date range shown by those controls.
- Replay and backtesting are simulations, not trading execution.
- Normalized backtest bars currently cover supported EQ/BE/ETF rows; raw rows are retained for future work.
- Options calculations are educational and do not model the complete derivatives lifecycle.
- YouTube extraction is a reviewable draft and never executes automatically.
- The application is designed for local single-user research, not production multi-user deployment.
