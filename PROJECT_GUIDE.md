# Backtrack product and page guide

Backtrack is a local, research-only Indian-market backtesting application. It uses official NSE daily archive data saved in the local SQLite cache. It does not place real orders or provide live quotes.

## Simple first-use flow

1. Start the backend and frontend using [README.md](README.md).
2. From **Home**, open **NSE data** and import a date range if the local cache does not already cover your stocks.
3. When the import finishes, choose **Continue to research** (or open **New research** from the workflow navigation).
4. Describe the idea, choose a listed symbol and date range, then review the proposed rule, assumptions, and risks.
5. Confirm the review and run the historical simulation on local NSE data.
6. Open **Saved tests** to inspect the result, then use **Compare tests**, reliability, validity, or replay to challenge it.

## Pages

| Page | User task | Current behavior |
| --- | --- | --- |
| Home | Start the unified research flow | Follow the linked NSE data → research → saved result steps, then open optional tools; recent tests come from the local API |
| New research | Turn an idea into historical evidence | Review a draft rule, confirm the assumptions, ensure local NSE history, then explicitly run the simulation |
| Build rules | Create a rule strategy | Configure indicators, entries, exits, risk, fees, and slippage |
| Use a YouTube strategy | Bring in an online idea | Extract a reviewable draft from a URL, captions, or pasted transcript; human review is required |
| NSE data | Download and search history | Bulk NSE archive import with quick/custom date windows and local catalogue search; a completed import links to research |
| Market Insights | Review the selected index | Switch NIFTY 50, Sensex, Bank Nifty, or NIFTY 500; inspect 1D/1W/1M/3M breadth, stock/sector heatmaps, and top movers from local daily candles |
| Market Scanner | Review ranked morning candidates | Manually build a plan from the latest completed local NSE candles; levels are conditional references, not live entries |
| My tests | Reopen prior tests | Read persisted backtest results and details from SQLite |
| Compare tests | Compare alternatives | Compare saved configurations and performance metrics |
| Check reliability | Challenge stability | Run parameter sensitivity, Monte Carlo, walk-forward, and stress checks |
| Risk Engine | Check validity | Review look-ahead, data quality, overfitting, and risk diagnostics |
| ML Lab | Explore predictive features | Run chronological, past-only, cost-aware research experiments |
| Pattern Finder | Explore recurring setups | Search historical local bars for configurable price patterns and review occurrences |
| Replay a chart | Learn candle by candle | Reveal historical candles progressively and place simulated orders/journal entries |
| Time Machine | Compare a plan with sampled scenarios | Sample 10,000 seeded daily-bar paths from local NSE history and compare with fixed-rule historical outcomes |
| Learn | Understand options basics | Calculate educational call/put payoff, max loss, and breakeven |
| Analytics | Inspect performance | Review trade quality and available run analytics |
| FII / DII Insights | Inspect institutional activity | Import official NSE FII/FPI-DII report snapshots, compare daily/weekly/monthly net cash flows, and review the local ledger |
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

1. Describe the idea, then select the stock and date range.
2. Review the proposed rule and its assumptions, risks, capital, position sizing, and risk settings.
3. Confirm the review. Backtrack does not start a historical simulation before this action.
4. Confirm the date range has local official NSE history; missing bars are prepared or reported unavailable.
5. Run the historical simulation.
6. Inspect the loaded OHLCV/volume chart, entry/exit markers, trade details, return, win rate, trade count, drawdown, equity curve, and trade ledger.
7. Challenge the result with comparison, reliability, validity, and replay tools. Each follow-up uses its own inputs.

The visible checkpoints describe the actual in-app sequence; they do not imply that independent AI agents ran. Hypothesis assistance uses local Ollama when configured. The clearly labelled deterministic catalogue fallback keeps the workflow usable when Ollama is unavailable. Review confirmation is not carried across a page reload.

The research chart is populated only from locally validated NSE bars or the returned backtest result. It sorts and de-duplicates timestamps, omits invalid numeric points, preserves missing volume as unavailable, and shows explicit loading, empty, and error states. The current main workflow is daily data; intraday or unsupported timeframes must be imported and normalized before they can be charted or tested.

Results are historical evidence, not predictions or financial advice.

## Indicators and strategies

The learning and strategy surfaces explain common indicators such as SMA/EMA, RSI, MACD, Bollinger Bands, ATR, and volume. Parameters are displayed with plain-language explanations. For example, RSI 14 means the momentum calculation uses the most recent 14 bars; 30/70 are commonly used reference zones, not automatic buy or sell instructions.

Known strategies are available through the strategy library and include moving-average crossover, RSI mean reversion, RSI plus EMA confirmation, Bollinger mean reversion, MACD trend following, breakout, momentum, and price-action interpretations for support/resistance, market-structure breaks, Fibonacci retracement, candle reversals, supply/demand zones, ICT-style liquidity/FVG, and multi-timeframe confirmation. The price-action and ICT entries are deterministic Backtrack interpretations, not claims about any video's exact rules. Every strategy remains configurable and must be tested on the selected local history.

## YouTube strategy import

Users can paste a YouTube URL, captions, or a transcript. The importer extracts possible entry, exit, indicator, risk, and timeframe rules and labels confidence/review gaps. It does not claim that a video was fully understood, does not invent missing rules, and does not automatically run or execute the strategy.

## Replay

Replay uses the same local daily bars as backtesting. The user selects a symbol, date range, and starting balance, then reveals candles using a step/speed control. The screen should show the current candle timestamp, OHLC values, progress, simulated positions, realized/unrealized P&L, trade attempts, and execution journal. Orders are always paper simulations.

## Time Machine

Choose a locally cached NSE symbol, risk distance, reward multiple, holding period, and historical lookback. Time Machine uses the latest saved daily close as the reference entry unless a different entry price is supplied. It re-samples past daily OHLC shapes with replacement 10,000 times using a repeatable seed, then shows the sampled stop/target/time-exit counts and price/R ranges beside the same fixed rule evaluated on rolling historical entries. It does not select historical periods for similarity. It uses no bars after the latest saved candle, never imports data automatically, and asks for more local history when the selected lookback cannot be supported.

This is daily-bar scenario analysis. It does not model intraday movement, fees, or slippage; a candle touching both stop and target is counted as a stop first. The sample frequencies are not probabilities or predictions, and the page does not submit broker orders.

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
