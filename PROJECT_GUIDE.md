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
| Stock research | Prepare a simple NIFTY 50 check or explain one stock | Scan the built-in NSE constituent snapshot, show only a fresh trigger with a passed held-out screen, or search a local symbol for ranges, indicators, levels, candles, trade counts, and the run log |
| Build rules | Create a rule strategy | Configure indicators, entries, exits, risk, fees, and slippage |
| Use a YouTube strategy | Bring in an online idea | Extract a reviewable draft from a URL, captions, or pasted transcript; human review is required |
| NSE data | Download and search history | Bulk NSE archive import with quick/custom date windows and local catalogue search; a completed import links to research |
| Market Insights | Review the selected index | Switch NIFTY 50, Sensex, Bank Nifty, or NIFTY 500; inspect 1D/1W/1M/3M breadth, stock/sector heatmaps, and top movers from local daily candles |
| Market Scanner | Review local market scans | Run formula and historical scans, review morning-plan levels, and inspect daily structure-zone and pressure-proxy views |
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

### Daily structure zones

In **Market Scanner → Daily structure zones**, choose a configured universe and run the scan explicitly. It reads locally saved daily NSE bars and shows the latest recent bullish or bearish zone per direction when the rule finds one. Each result includes the source candle range, confirmation date, prior 20-session boundary, impulse relative to the preceding 14-session true range, later touch sessions, invalidation edge, and the symbol’s latest-bar date. Coverage lists missing symbols and symbols without enough history.

In **Market Scanner → Liquidity flow**, scan all locally catalogued NSE stocks, NIFTY 500, or NIFTY 50. Backtrack ranks up to 20 positive and 20 negative pressure estimates from the latest 20 saved daily bars, then highlights the top three on each branch. Choose a ranked symbol or search any NSE symbol to inspect its candidate daily demand/supply zones. The estimate weights each candle’s close location in its high-low range by traded value; daily OHLCV cannot identify actual buyers/sellers or show bid/ask depth. All dates come from the local cache, and unavailable history stays excluded.

This is an independent Backtrack heuristic: a qualifying daily close must break a prior 20-session range by at least 1.25 times the preceding 14-session average true range, and the zone is the full range of the latest opposite candle in the prior three sessions. A daily close through the far edge invalidates it. Confirmations older than 60 bars are excluded. The scan uses no intraday or live data, makes no claim about institutional activity, and does not produce a trade recommendation.

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

## Single-stock research

Open **Stock research** and either run **Scan NIFTY 50** or search a local NSE symbol. The scan runs the same fixed rule and historical gate for all 50 symbols in the built-in NSE Indices constituent snapshot (as of 2026-10-28). It records each symbol analysis and only lists a stock when its latest completed daily candle triggered the rule and its own held-out test passed. A scan may correctly return no stocks. Missing or short history is shown separately from backtests that fail the gate.

For one symbol, the page shows the saved date window, candle count, 52-week range, prior 20-session high/low, SMA20/50/200, RSI14, MACD(12/26/9), ATR14, volume versus the previous 20-session average, and historical price returns. Each value has a plain-language explanation. Signal occurrences count bars that satisfy the rule; closed simulated trades are counted separately. Future company growth is not available from local OHLCV. The page links to NSE corporate financial results for the symbol, but does not infer future growth from price history.

The conditional long-only scenario requires a daily close above the prior 20-session high, close above SMA50, SMA50 above SMA200, and volume above the prior 20-session average. It uses the next session open in the historical simulation, starts with ₹1,00,000 and buys whole shares using available equity, applies a 2×ATR14 stop, 1R/2R targets, a close below SMA50 or 20-session time exit, and stop-first handling when a daily candle touches both stop and target. Displayed levels are reference prices; a next-session gap changes the actual simulated entry and risk. No order is placed.

After the 200-session indicator warm-up, the rule is split chronologically into a 70% training window and 30% out-of-sample holdout. The fixed settings are not optimized. The result reports raw rule signals, closed trades, wins/losses, win rate, average net return per trade, cash-based profit factor, compounded return, drawdown, and dates for each window. The screen is only marked as passed with at least five years of data, 30 out-of-sample trades, at least 70% wins, positive net expectancy and compounded return, and profit factor above one; otherwise it is marked failed or not evaluable. A high percentage from a small number of trades is not accepted as evidence. Historical bars are not adjusted for splits or bonus issues, which can distort long-range indicators and tests.

Every completed, insufficient-data, or failed attempt is saved in the local SQLite research-artifact store with start/finish timestamps, data hash/date, status, failure reason, and test results when available. The ledger distinguishes failed attempts, failed validation gates, passing runs, and runs that do not have enough evidence. It is local to this single-user installation.

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
