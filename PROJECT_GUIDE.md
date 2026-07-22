# Backtrack page-by-page guide

Backtrack is a local, research-only Indian-market backtesting application. The current market-data path is the official NSE daily archive imported into SQLite. No page places real orders.

## First-use workflow

1. **Manage stock data**: search the NSE catalogue, choose dates, check coverage, and import missing archives.
2. **Test a strategy**: write a hypothesis, review the local Ollama proposal, and run the historical test.
3. **My tests**: reopen saved results and inspect performance.
4. **Check reliability / Risk Engine**: inspect robustness and validity before trusting a result.
5. **Run an ML experiment**: compare return-prediction models using chronological splits and walk-forward checks.
6. **Replay a chart**: step through the same local history with simulated orders.

## Pages

| Page | User task | Current implementation |
| --- | --- | --- |
| Home | Choose a stock/date range and start a workflow | Local stock selector, date controls, links to Research, YouTube Import, and Replay |
| Test a strategy | Turn an idea into a test | Local Ollama proposal, reviewable assumptions, automatic NSE history preparation, saved session restore |
| Build rules | Configure indicators and entry/exit rules | Strategy Lab form and rule configuration |
| Use a YouTube strategy | Bring in a strategy found online | URL/caption/transcript extraction into a draft requiring human review |
| Manage stock data | Import and inspect history | Official catalogue, database inventory, coverage preview, duplicate protection, one-click stock import, progress, archive reuse |
| My tests | Find completed backtests | Persisted SQLite backtest runs and detail links |
| Compare tests | Compare runs/configurations | Local-data comparison workflow |
| Check reliability | Challenge parameter stability | Robustness API and report views |
| Risk Engine | Review validity and bias | Look-ahead, data quality, and overfitting audit views |
| ML Lab | Explore machine-learning signals | Past-only technical features, chronological model comparison, cost-aware forecast backtest, and walk-forward diagnostics |
| Replay a chart | Learn what happened candle by candle | Persisted historical replay sessions and simulated orders/journal |
| Learn | Understand options concepts | Educational call/put payoff and breakeven calculator |
| Analytics | Inspect performance and trade quality | Analytics views over available local run data |
| Settings | Inspect configuration | Local NSE/Ollama/application status; no paid credential flow |

## Data behavior in the UI

The Data page shows three separate concepts:

- **Stock database**: saved candles and exact archive-day coverage for searchable symbols.
- **Import configuration**: date range, stock universe, and custom symbol selection.
- **Import plan**: cached days, missing days, estimated rows, and the no-duplicate decision before a job starts.

When importing:

- `Downloading missing NSE archives` means a weekday ZIP was not found locally and is being fetched from NSE.
- `Loading saved NSE archive` means the original ZIP already exists locally and is being reused.
- `Saving complete NSE archive to SQLite` stores every raw row and all supported equity/ETF OHLCV rows.
- A second stock request for an already saved archive day does not download the archive again.

## Where to change a page

```text
frontend/src/app/<route>/page.tsx        # page behavior and API calls
frontend/src/app/globals.css             # shared layout and visual system
frontend/src/components/layout/         # sidebar/topbar
frontend/src/components/charts/          # chart rendering
frontend/src/components/ui/              # buttons/cards/badges
frontend/src/lib/                        # typed API clients and local swarm
```

## Where to change backend behavior

```text
src/quant_research/api/routes/api.py    # HTTP route behavior
src/quant_research/api/schemas.py       # request/response contracts
src/quant_research/api/container.py     # dependency wiring
src/quant_research/services/            # workflows and orchestration
src/quant_research/repositories/        # SQLite persistence
src/quant_research/domain/              # calculations, validation, DSL, metrics
```

## Data rules

- One official NSE Common Bhavcopy ZIP is downloaded per weekday at most.
- Original ZIPs are stored in `data/nse_archives/` and excluded from Git.
- Every raw archive row is retained in SQLite for future fields/research.
- Supported EQ/BE/ETF rows are normalized into `ohlcv_bars`.
- Full overlaps are rejected before import with a clear UI message.
- OHLCV upserts use `(symbol, timeframe, timestamp)` and do not create duplicate candles.
- Missing history stops a backtest with an import instruction; it is not silently replaced with fabricated data.
- Replay orders are simulated only.

## Persistence

The default SQLite file is `data/market_cache.sqlite3`. It stores market data, catalogue metadata, archive coverage, raw archive rows, backtest runs, research artifacts, import jobs, and replay sessions. The browser also keeps the active Research session and Replay session ID in localStorage.

## Handoff references

- [README.md](README.md): setup, product behavior, routes, repository map, and limitations.
- [handover.md](handover.md): engineering ownership, persistence contract, API source of truth, and release checks.
- [TESTING.md](TESTING.md): automated commands and QA expectations.
- [REPLAY_IMPLEMENTATION_PLAN.md](REPLAY_IMPLEMENTATION_PLAN.md): replay design notes.
