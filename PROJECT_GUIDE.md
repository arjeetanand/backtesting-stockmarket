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
| New research | Turn an idea into historical evidence | Compare daily relative volume and next-session outcomes, review a draft rule, confirm the assumptions, ensure local NSE history, then explicitly run the simulation |
| Stock research | Scan NIFTY 50 setups or understand one stock's recent fall | Run the morning scan, or start with YESBANK, choose IRFC/search the local NSE catalogue, inspect 20-session price and volume facts, enter optional holding details and a stop you chose, then review conditional re-entry levels and size a hypothetical entry from your own loss and allocation limits |
| My portfolio | Import holdings and review local exposure | Preview an XLSX, PDF, or image statement, correct the detected symbol/quantity/average cost, confirm a local snapshot, then review daily-close value, exposure share, rule priorities, indicators, and each symbol's data date |
| Build rules | Create a rule strategy | Configure indicators, entries, exits, risk, fees, and slippage |
| Use a YouTube strategy | Bring in an online idea | Extract a reviewable draft from a URL, captions, or pasted transcript; human review is required |
| NSE data | Download and search history | Bulk NSE archive import with quick/custom date windows and local catalogue search; a completed import links to research |
| Market Insights | Review the selected index or stock | See the latest cached session day, sync official NSE archives through today, inspect 1D/1W/1M/3M breadth and heatmaps, then click a stock for recent volume and a saveable prior-high/low 2R paper plan |
| Market Scanner | Review local market scans | Run formula and historical scans, review morning-plan levels, and inspect daily structure-zone and pressure-proxy views |
| My tests | Reopen prior tests | Read persisted backtest results and details from SQLite |
| Compare tests | Compare alternatives | Compare account change, return vs variation, largest fall, and trades with a profit; expand each result to inspect dated trade fills and P&L |
| Check reliability | Challenge stability | Run parameter sensitivity, Monte Carlo, walk-forward, and stress checks |
| Risk Engine | Check validity | Review look-ahead, data quality, overfitting, and risk diagnostics |
| ML Lab | Explore predictive features | Run chronological, past-only, cost-aware research experiments |
| Pattern Finder | Explore recurring setups | Search historical local bars for configurable price patterns and review occurrences |
| Replay a chart | Learn candle by candle | Reveal historical candles progressively and place simulated orders/journal entries |
| Time Machine | Compare a plan with sampled scenarios | Sample 10,000 seeded daily-bar paths from local NSE history and compare with fixed-rule historical outcomes |
| Learn | Understand options basics | Calculate educational call/put payoff, max loss, and breakeven |
| Analytics | Inspect performance | Review trade quality and available run analytics |
| FII / DII Insights | Inspect institutional activity | View saved Tapetide history from SQLite or the separate official NSE latest-session report, with daily/weekly/monthly flows and actual date coverage |
| Settings | Inspect local configuration | View API, local cache, Ollama, and provider status |

### Stock drawdown and re-entry guide

On **Stock research**, choose **Analyze stock** to read the saved daily history through its displayed date. The guide shows the latest-session move, worst session in the last 20 sessions, pullback from that window's highest close, latest-day volume versus the prior 20-session average, and total volume across the last five sessions. It cannot identify a news cause; check official company filings separately.

For an existing position, average cost and whole shares produce a paper unrealized P/L at the latest saved close. An optional stop price checks whether the latest daily low reached it; this does not confirm an order fill. These inputs are not saved. For a fresh hypothetical setup, enter a maximum rupee loss and an allocation cap. The calculator floors whole shares to fit both. The re-entry trigger, 2×ATR stop, 1R/2R targets, and exits follow the existing fixed long-only breakout rule. A non-triggered or stale status means the rule has not provided a fresh entry condition. None of these calculations is a personal buy, hold, or sell instruction.

### Daily structure zones

In **Market Scanner → Daily structure zones**, choose a configured universe and run the scan explicitly. It reads locally saved daily NSE bars and shows the latest recent bullish or bearish zone per direction when the rule finds one. Each result includes the source candle range, confirmation date, prior 20-session boundary, impulse relative to the preceding 14-session true range, later touch sessions, invalidation edge, and the symbol’s latest-bar date. Coverage lists missing symbols and symbols without enough history.

In **Market Scanner → Liquidity flow**, scan all locally catalogued NSE stocks, NIFTY 500, or NIFTY 50. Backtrack ranks up to 20 positive and 20 negative pressure estimates from the latest 20 saved daily bars, then highlights the top three on each branch. Choose a ranked symbol or search any NSE symbol to inspect its candidate daily demand/supply zones. The estimate weights each candle’s close location in its high-low range by traded value; daily OHLCV cannot identify actual buyers/sellers or show bid/ask depth. All dates come from the local cache, and unavailable history stays excluded.

This is an independent Backtrack heuristic: a qualifying daily close must break a prior 20-session range by at least 1.25 times the preceding 14-session average true range, and the zone is the full range of the latest opposite candle in the prior three sessions. A daily close through the far edge invalidates it. Confirmations older than 60 bars are excluded. The scan uses no intraday or live data, makes no claim about institutional activity, and does not produce a trade recommendation.

## FII/DII history

On **FII / DII Insights**, the **Tapetide history · saved locally** view reads `fii_dii_history_rows` from SQLite when the page opens. Choose **30D, 3M, 6M, 1Y, 5Y, 10Y, 20Y, or All**, then select **Sync** to fetch that period and keep it locally for the next visit. Viewing a range alone does not call the provider. Sync needs `TAPETIDE_API_TOKEN` in the backend `.env` and a backend restart. The provider documents daily cash-market history from **January 2014**; therefore a 20Y selection can only show available sessions since 2014. Progress reports pages and rows saved; incomplete participant rows are skipped rather than changed to zero. Official NSE latest-session rows remain separate in `fii_dii_rows`.

The global **Sync All Market Data** action also checks the latest official NSE FII/DII report and uses Tapetide only for official NSE archive sessions without a complete saved FII/DII pair. It does not download the full Tapetide history on every click. Dates with no Tapetide rows are recorded as checked, so they are not repeatedly requested; sessions with incomplete participant pairs remain eligible for retry. Each source reports its own success, partial, skipped, or failed status.

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

Use **Sync All Market Data** in the top bar to fetch the newest completed daily archive, check NSE's latest official FII/DII report, and fill missing Tapetide history sessions. Before 18:00 IST the daily-bar sync stops at the previous calendar day; after that it can request today's archive on trading days. If NSE has not published an archive yet, a later sync retries dates in the missing-day range and reports the last date actually saved. Single-stock reviews, the NIFTY 50 scan, and portfolio analysis also check and sync missing NSE sessions before calculating; they show the sync outcome beside the actual `data_as_of` date. If the refresh fails, the review remains available from saved bars and labels the failed freshness check. No screen presents a live quote.

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
6. Read the plain-language outcome, net profit/loss, trade count, win rate, and drawdown first; then inspect the OHLCV/volume chart, entry/exit markers, and dated trade ledger.
7. Challenge the result with comparison, reliability, validity, and replay tools. Each follow-up uses its own inputs.

The visible checkpoints describe the actual in-app sequence; they do not imply that independent AI agents ran. Hypothesis assistance uses local Ollama when configured. The clearly labelled deterministic catalogue fallback keeps the workflow usable when Ollama is unavailable. Review confirmation is not carried across a page reload.

The research chart is populated only from locally validated NSE bars or the returned backtest result. It sorts and de-duplicates timestamps, omits invalid numeric points, preserves missing volume as unavailable, and shows explicit loading, empty, and error states. Its visible readout starts on the latest session and follows the hovered candle, showing date, open, high, low, close, open-to-close change, and volume in shares. Candle bodies show open-to-close direction; wicks show that session's high and low; matching green/red bars show shares traded. The plain-language backtest summary appears before its detailed chart. The current main workflow is daily data; intraday or unsupported timeframes must be imported and normalized before they can be charted or tested.

Results are historical evidence, not predictions or financial advice.

### Volume vs. next-day move

In **New research**, choose the stock and dates, then run **Volume vs. next-day move**. The study compares each session's volume with the average of the preceding 20 daily sessions, excluding the session being measured. It groups same-day moves as up (above +0.5%), down (below −0.5%), or near-flat, and reports the next available session's close-to-close up/down share, average return, median return, and sample count for volume bands below 1×, 1–1.5×, 1.5–2×, 2–3×, and 3× or more.

Only pairs whose signal day and next available session both fall within the selected dates are counted. A cell with fewer than 30 observations is exploratory. The study describes saved daily history; it is not a forecast, trading recommendation, buyer/seller imbalance, or order-flow measure. Stored close prices are not adjusted for corporate actions.

### Compare tests and trade details

**Compare tests** runs each selected strategy with identical inputs. Account change is the percent change from starting capital; return vs. variation (Sharpe) compares average returns with daily movement; largest fall is the peak-to-trough account decline; and trades with a profit is the share of closed trades with positive P&L. Expand **Show N trade results** under a strategy to review open/close dates, simulated fill prices, rupee profit or loss, return, and holding time. Trade return is measured against the amount committed to that trade, while account change uses starting capital. Fresh runs include both entry and exit commissions in trade P&L; previously saved runs preserve the values recorded when they were created. On narrow screens, result and trade details use labeled cards instead of a wide table.

## Single-stock research

Open **Stock research** and either run **Scan NIFTY 50** or search a local NSE symbol. The scan runs the same fixed rule and historical gate for all 50 symbols in the built-in NSE Indices constituent snapshot (as of 2026-10-28). It records each symbol analysis and only lists a stock when its latest completed daily candle triggered the rule and its own held-out test passed. A scan may correctly return no stocks. Missing or short history is shown separately from backtests that fail the gate.

For one symbol, the page shows the saved date window, candle count, 52-week range, prior 20-session high/low, SMA20/50/200, RSI14, MACD(12/26/9), ATR14, volume versus the previous 20-session average, and historical price returns. Each value has a plain-language explanation. Signal occurrences count bars that satisfy the rule; closed simulated trades are counted separately. Future company growth is not available from local OHLCV. The page links to NSE corporate financial results for the symbol, but does not infer future growth from price history.

The technical panel also shows a 20-completed-month closing-price average, excluding the current partial month. After an eligible completed `watch` or `triggered` long setup, Backtrack saves a frozen research snapshot and tracks its price movement over the next 20 observed daily bars. Saved outcomes show the data date, return, favorable/adverse movement, and whether daily bars touched the reference stop or target; a candle touching both is marked ambiguous. These are rule observations, not actual fills, guaranteed forecasts, or automatic AI training data.

The conditional long-only scenario requires a daily close above the prior 20-session high, close above SMA50, SMA50 above SMA200, and volume above the prior 20-session average. It uses the next session open in the historical simulation, starts with ₹1,00,000 and buys whole shares using available equity, applies a 2×ATR14 stop, 1R/2R targets, a close below SMA50 or 20-session time exit, and stop-first handling when a daily candle touches both stop and target. Displayed levels are reference prices; a next-session gap changes the actual simulated entry and risk. No order is placed.

After the 200-session indicator warm-up, the rule is split chronologically into a 70% training window and 30% out-of-sample holdout. The fixed settings are not optimized. The result reports raw rule signals, closed trades, wins/losses, win rate, average net return per trade, cash-based profit factor, compounded return, drawdown, and dates for each window. The screen is only marked as passed with at least five years of data, 30 out-of-sample trades, at least 70% wins, positive net expectancy and compounded return, and profit factor above one; otherwise it is marked failed or not evaluable. A high percentage from a small number of trades is not accepted as evidence. Historical bars are not adjusted for splits or bonus issues, which can distort long-range indicators and tests.

Every completed, insufficient-data, or failed attempt is saved in the local SQLite research-artifact store with start/finish timestamps, data hash/date, status, failure reason, and test results when available. The ledger distinguishes failed attempts, failed validation gates, passing runs, and runs that do not have enough evidence. It is local to this single-user installation.

### Portfolio imports

Open **My portfolio** from the Markets navigation. Choose an XLSX, PDF, or image file, review the parsed rows, correct quantities or average costs, and explicitly save the snapshot. The source file is not retained or sent to AI. Confirmed normalized holdings stay in the local SQLite artifact store. PDF text parsing uses Poppler; image and scanned-PDF OCR uses Tesseract. When either tool is missing or a statement layout is not recognized, use manual entry or fix the preview before saving. Portfolio analysis uses local daily NSE bars and shows missing/stale prices, rule-based review priorities, conditional levels, and each priced holding's share of portfolio value. It does not optimize allocations or guarantee profit.

### Global market context

In **Stock research**, choose a topic and explicitly request a global-market brief. Backtrack sends that topic and optional NSE symbol to the OpenAI API web-search tool, then stores the completed dated brief and HTTPS source links locally. This optional feature requires a backend `OPENAI_API_KEY`; API and web-search usage may be billed separately. It is never called automatically during stock analysis and does not receive portfolio files, holdings, or local price history. A missing key or unsuccessful search produces an explicit error.

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

The backend persists market data, archive metadata, raw rows, backtests, research artifacts, import jobs, and replay sessions in `data/market_cache.sqlite3`. The research page stores compact inputs and a saved-result reference in browser storage; full candles, indicators, trades, and curves stay in SQLite and load asynchronously when reopening a result. Replay stores its server session ID so a refresh can recover the session.

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

## AI debate review

After a completed Stock research analysis, **Review with AI** optionally sends its
public NSE technical summary and historical metrics to OpenAI. Before every review,
Backtrack checks the latest official NSE daily archive and reruns the selected stock's
analysis. A sync failure blocks the AI call; partial archive availability is shown
with the actual data date. TradingAgents' bull, bear and research-manager agents
return a draft review; expand the saved history for details or reopen its analysis.
Sync outcomes, analysis runs, and successful or failed review attempts are retained
in the local SQLite store. Configuration/errors are explicit; deterministic research
remains usable without this optional integration. See README for setup, billing,
caching and limits.
