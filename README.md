# Backtrack

Backtrack is a free, local, research-only Indian-market backtesting workspace. It imports official NSE daily archives, stores them locally, lets traders test rule-based strategies, replay candles, and inspect performance, risk, and reliability.

It does not place real orders, connect to a broker, or provide live quotes. Local imports, indicators, portfolio valuation, and backtests need no paid API or subscription. Optional OpenAI reviews and web-searched market briefs require an API key and may be billed separately.

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
- Reviews a stock with dated 20/50/200-session and 20-completed-month averages, rule reasons, conditional entry/stop/target levels, and historical-screen blockers. Eligible completed setups are tracked against up to 20 later NSE sessions; this is price-path tracking, not filled trades or AI training.
- On `/portfolio`, previews XLSX, PDF, or image holdings for review, then saves only confirmed quantities and average costs. It values them from cached daily closes, shows each holding's share of priced value, and lists rule/data review priorities with per-position reasons and levels.
- On `/stock-research`, can create an optional, user-requested global-market news brief with web citations and a dated local history; only the selected topic and optional symbol are sent to the OpenAI API.
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

The launcher uses web port `4003` and API port `8001`; the matching UI test slots are `5003` and `6003`. Press `Ctrl+C` to stop both services. Running `./run.sh` again gracefully restarts only the Backtrack processes it started and fails closed if either port belongs to another app. Use **Sync All Market Data** to refresh the latest completed NSE daily archive, check the official latest-session FII/DII report, and fill known missing Tapetide history sessions. The result reports each source separately; cached NSE archives and complete Tapetide sessions are skipped. Historical Tapetide sync needs `TAPETIDE_API_TOKEN`; without it, the rest still runs and the result identifies that source as skipped. The frontend shows explicit unavailable/error states when the backend is stopped; it does not use mock or fabricated prices.

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
- [docs/MARKET_SCANNER_CLARITY_CHECKLIST.md](docs/MARKET_SCANNER_CLARITY_CHECKLIST.md) — scanner wording, search scope, and verification record.
- [docs/CTA_SELECT_CHECKLIST.md](docs/CTA_SELECT_CHECKLIST.md) — CTA state, custom choice menus, and UI verification record.
- [docs/BRANCH_MERGE_CHECKLIST.md](docs/BRANCH_MERGE_CHECKLIST.md) — branch audit, integration scope, and remaining remote checks.
- [docs/BACKTRACK_END_TO_END_CHECKLIST.md](docs/BACKTRACK_END_TO_END_CHECKLIST.md) — consolidation record, integrated workflow checks, data freshness, and remaining limits.
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
| `/stock-research` | Run a gated NIFTY 50 scan or review one stock's recent moves, volume, drawdown, holding risk, and conditional re-entry levels |
| `/portfolio` | Preview and confirm a local holdings import, then review cost basis, daily-close valuation, exposure share, and rule/data priorities |
| `/strategy` | Build indicator and rule-based strategies |
| `/strategy-import` | Extract reviewable rules from a YouTube URL or transcript |
| `/backtests` | Reopen saved historical tests |
| `/watchlist` | Track saved historical setups against the latest imported daily bars |
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
| `/insights` | Local NSE index breadth, stock/sector heatmaps, recent stock volumes, conditional paper plans, and top movers |
| `/insights/fii-dii` | Saved Tapetide FII/DII history with one-click 30D/3M/6M/1Y/5Y/10Y/20Y/All sync, plus a separate official NSE latest-session view |
| `/settings` | Local data, Ollama, and application status |

On **Market Scanner**, choose a stock group and rule before scanning. The search box filters a completed historical result list by ticker, company, or sector; choose **All imported stocks** before scanning for the widest locally available group. To search the local NSE catalogue and check whether a symbol has saved history, use **NSE data**. Neither search provides live exchange prices.

See [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for the complete user guide.

## Portfolio and global context

At `/portfolio`, select an XLSX, PDF, or image statement. Backtrack parses it locally into an editable preview; check symbols, quantities, and average costs before saving. The original upload is discarded after preview. Only confirmed holdings are stored in the local SQLite database. PDF parsing uses Poppler command-line tools; image and scanned-PDF OCR uses local Tesseract. If these are unavailable, use XLSX or enter holdings manually.

Portfolio values use the latest saved NSE end-of-day close, not a live price. Missing and stale bars remain visible as such. Each holding gets the same fixed long-only rule review as Stock Research, with reasons and conditional entry, stop, and 1R/2R levels; its historical evidence gate is not evaluated in the portfolio view. Review priorities call out data gaps, rule status, and each holding's share of priced value. They do not optimize allocations, predict returns, or guarantee profit.

Eligible watch and triggered setups are saved with their rule inputs and checked against up to 20 later cached sessions. The ledger records whether the entry reference was touched and summarizes observable daily price levels; it does not infer the cause of a move, represent a filled trade, or provide model-training labels.

On `/stock-research`, the optional global-market brief runs only when requested. It uses OpenAI web search for dated, cited context; the API key stays in the backend `.env`, and only the selected public topic plus optional NSE symbol is sent. OpenAI API and web-search usage can be billed separately. Saved briefs are local; no automatic news fetch occurs during an analysis. See [OpenAI's web-search guide](https://platform.openai.com/docs/guides/tools-web-search) and [API pricing](https://platform.openai.com/pricing/).

To enable global briefs, set `OPENAI_API_KEY` in the repository-root `.env` and restart Backtrack. `GLOBAL_MARKET_MODEL` optionally selects the API model; it defaults to `gpt-6-luna`. Never put the key in a `NEXT_PUBLIC_*` variable or frontend config.

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
Editable choices use a shared keyboard-accessible menu, while settings with only one
available value appear as read-only information.

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
- FII/DII Insights reads previously saved Tapetide rows from SQLite and can sync a selected period on demand with `TAPETIDE_API_TOKEN`. Global sync checks only official NSE archive dates missing a complete Tapetide FII/DII pair and remembers successful empty checks. Tapetide documents this daily cash-market series from January 2014, so a 20Y selection can show at most that available history. Tapetide rows remain separate from the official NSE latest-session report; NSE does not provide historical date-range downloads.
- Replay and backtesting are simulations, not trading execution.
- Normalized backtest bars currently cover supported EQ/BE/ETF rows; raw rows are retained for future work.
- Options calculations are educational and do not model the complete derivatives lifecycle.
- YouTube extraction is a reviewable draft and never executes automatically.
- The application is designed for local single-user research, not production multi-user deployment.

## Optional TradingAgents review (OpenAI)

In **Stock research**, analyze a stock, then click **Review with AI**. This runs
TradingAgents v0.7.1's bullish researcher, bearish researcher, and research manager
against a newly refreshed NSE analysis. Every click checks the latest available
official NSE daily archive, downloads only missing archive days, reruns the selected
stock's analysis, and then requests the AI review. A sync failure stops the review;
if NSE has not published a requested archive yet, the attempt shows the actual saved
data date and partial-sync status. This uses the OpenAI API, not the Codex
application or a ChatGPT subscription; API usage is billed separately.

```bash
uv sync --extra dev --extra tradingagents
# Set OPENAI_API_KEY in the repository-root .env (never NEXT_PUBLIC_*).
# Optional: TRADINGAGENTS_MODEL=gpt-6-luna (requires access in your API account).
./run.sh
```

Open `http://localhost:4003/stock-research` (API `8001`; UI test slots `5003`,
`6003`). The existing launcher keeps these stable ports and restarts only its own
instance. Missing dependencies/key or provider failures appear as explicit errors.

The review uses the real upstream three-agent debate, not its full trading graph.
News, sentiment, fundamentals, broker execution and external price feeds are not
connected. No personal position inputs, charts or trade ledger are sent. AI output
can be wrong and does not change the deterministic backtest or its validation gate.
The saved data date remains visible; daily NSE bars are not live quotes. Sync results,
fresh analysis runs, successful and failed AI attempts, and review text are saved in
the local SQLite database. The latest 20 attempts for the selected symbol appear in
**Saved review history**, where a saved analysis can be reopened. Every click checks
data freshness; an identical market data hash/model/data age reuses the saved AI text
and records that reuse without another charge. Changed data may incur a new API
charge. Individual model calls time out after 30 seconds; the manager can fall back
from structured to plain text (up to four model calls).
