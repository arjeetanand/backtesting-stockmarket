# Backtrack product and page guide

Backtrack is a local, research-only Indian-market backtesting application. It uses official NSE daily archive data saved in the local SQLite cache. It does not place real orders or provide live quotes.

## Simple first-use flow

1. Start the backend and frontend using [README.md](README.md).
2. Open **Manage stock data**.
3. Choose all history, last four years, last year, a calendar year, or custom dates.
4. Start the one bulk import and leave the backend running.
5. Search a symbol or company name to confirm its saved period and candle count.
6. Open **Test a strategy**, **Build rules**, **Use a YouTube strategy**, or **Replay a chart**.
7. Review assumptions, fees, slippage, data availability, and validity before trusting a result.

## Pages

| Page | User task | Current behavior |
| --- | --- | --- |
| Home | Choose where to begin | Enter strategy testing, YouTube import, or replay |
| Test a strategy | Test a trading idea | Review a proposal, ensure local history, configure capital/risk, and run a saved backtest |
| Build rules | Create a rule strategy | Configure indicators, entries, exits, risk, fees, and slippage |
| Use a YouTube strategy | Bring in an online idea | Extract a reviewable draft from a URL, captions, or pasted transcript; human review is required |
| Manage stock data | Download and search history | Bulk NSE archive import with quick/custom date windows and local catalogue search |
| My tests | Reopen prior tests | Read persisted backtest results and details from SQLite |
| Compare tests | Compare alternatives | Compare saved configurations and performance metrics |
| Check reliability | Challenge stability | Run parameter sensitivity, Monte Carlo, walk-forward, and stress checks |
| Risk Engine | Check validity | Review look-ahead, data quality, overfitting, and risk diagnostics |
| ML Lab | Explore predictive features | Run chronological, past-only, cost-aware research experiments |
| Pattern Finder | Explore recurring setups | Search historical local bars for configurable price patterns and review occurrences |
| Replay a chart | Learn candle by candle | Reveal historical candles progressively and place simulated orders/journal entries |
| Learn | Understand options basics | Calculate educational call/put payoff, max loss, and breakeven |
| Analytics | Inspect performance | Review trade quality and available run analytics |
| Settings | Inspect local configuration | View API, local cache, Ollama, and provider status |

## Manage stock data

The page has two jobs only: import bulk history and search local stocks.

### Download history

The date selector supports:

- **All history · 2000 to today**
- **Last 4 years · one click**
- **Last 1 year · one click**
- Any calendar year
- **Custom start and end dates**

The importer checks the SQLite database and `data/nse_archives/<year>/` before downloading. A single NSE trading-day archive contains the daily file for all supported stocks, so a successful day is loaded in bulk. There is no starter universe, custom-symbol import mode, or per-stock download button.

### Search local data

Type a symbol or company name into **Find a stock**. Search begins after text is entered and returns a small result set from the official NSE catalogue and stored symbols. Each result shows:

- symbol and company/industry;
- earliest and latest locally saved candle;
- total saved candles;
- `Saved locally` or `Stock list only`.

If no results appear, confirm that the backend is running and refresh the official NSE catalogue by starting an import. The UI must show an error rather than fake data when the API is unavailable.

## Strategy testing

The normal path is:

1. Select a stock and date range.
2. Choose a known strategy or describe rules.
3. Confirm that local history covers the requested period.
4. Review capital, position sizing, risk limit, fees, slippage, and execution convention.
5. Run the backtest.
6. Inspect return, win rate, trade count, drawdown, equity curve, and trade ledger.
7. Save the result and challenge it with comparison, robustness, replay, and validity tools.

Results are historical evidence, not predictions or financial advice.

## Indicators and strategies

The learning and strategy surfaces explain common indicators such as SMA/EMA, RSI, MACD, Bollinger Bands, ATR, and volume. Parameters are displayed with plain-language explanations. For example, RSI 14 means the momentum calculation uses the most recent 14 bars; 30/70 are commonly used reference zones, not automatic buy or sell instructions.

Known strategies are available through the strategy library and include moving-average crossover, RSI mean reversion, RSI plus EMA confirmation, Bollinger mean reversion, MACD trend following, breakout, momentum, and price-action interpretations for support/resistance, market-structure breaks, Fibonacci retracement, candle reversals, supply/demand zones, ICT-style liquidity/FVG, and multi-timeframe confirmation. The price-action and ICT entries are deterministic Backtrack interpretations, not claims about any video's exact rules. Every strategy remains configurable and must be tested on the selected local history.

## YouTube strategy import

Users can paste a YouTube URL, captions, or a transcript. The importer extracts possible entry, exit, indicator, risk, and timeframe rules and labels confidence/review gaps. It does not claim that a video was fully understood, does not invent missing rules, and does not automatically run or execute the strategy.

## Replay

Replay uses the same local daily bars as backtesting. The user selects a symbol, date range, and starting balance, then reveals candles using a step/speed control. The screen should show the current candle timestamp, OHLC values, progress, simulated positions, realized/unrealized P&L, trade attempts, and execution journal. Orders are always paper simulations.

## Persistence and caching

The backend persists market data, archive metadata, raw rows, backtests, research artifacts, import jobs, and replay sessions in `data/market_cache.sqlite3`. The research page stores its active session key in browser storage, and replay stores its server session ID so a refresh can recover the session.

The importer is incremental. Existing ZIPs and complete archive days are reused; candle upserts prevent duplicate `(symbol, timeframe, timestamp)` rows. The background job is process-local, so a server restart may require starting the same import again, but committed data remains safe.

## Managing saved tests

**My tests** stores completed runs locally so they can be reopened later. A user can delete an individual test or clear testing history from the history controls. This removes saved result artifacts, not the historical NSE market-data cache or original archive ZIPs.

## Source locations

```text
src/quant_research/api/routes/api.py       # HTTP routes
src/quant_research/api/schemas.py          # API contracts
src/quant_research/api/container.py        # dependency wiring
src/quant_research/services/               # workflows
src/quant_research/repositories/           # SQLite persistence
src/quant_research/domain/                 # indicators, DSL, engine, analytics, validity
frontend/src/app/                          # pages/routes
frontend/src/components/                  # shared UI and charts
frontend/src/lib/                         # API clients and local agents
tests/                                     # automated tests
```

For engineering details, see [handover.md](handover.md). For setup, see [README.md](README.md). For backend/frontend details, see [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).
