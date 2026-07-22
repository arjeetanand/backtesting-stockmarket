# Backtrack: page-by-page guide and real-data migration

Backtrack is a research-only Indian-market backtesting application. It does not connect to a broker, place orders, or claim a live execution result. Its first real-data source is the local cache populated from official NSE daily Common Bhavcopy archives.

## Recommended workflow

1. Open **Data & Providers** and check coverage for the symbols and dates you need.
2. Import only the missing official NSE daily data. A full overlap is blocked, and an exact archive/symbol day already processed is skipped.
3. Open **Research** or **Strategy Lab** to define a hypothesis or rules.
4. Run the backtest on the imported date range.
5. Inspect the result, then validate it in **Robustness Suite**, **Risk Engine**, and **Chart Replay** before trusting it.

## Pages

| Page | What it is for | How to use it today | Data status |
| --- | --- | --- | --- |
| Dashboard | At-a-glance research workspace | Use it to navigate to a task. | Presentation/seeded metrics; scheduled for API migration. |
| Chart Replay | Step through historic candles without seeing future bars | Select an imported NSE symbol and date range, then move the replay forward and simulate research orders. | Real backend flow; now local-cache only. |
| Research | Turn a written trading idea into a structured hypothesis | Enter your idea, symbol, and timeframe; review the extracted assumptions before continuing. | API-backed hypothesis extraction; visual examples still need data migration. |
| Strategy Lab | Configure a rule-based strategy | Choose instruments, indicators, entries, exits, position size, and costs. | Builder UI; next to wire directly to stored strategies and imported-symbol picker. |
| Backtest Runs | Find and compare completed backtests | Filter runs, open one, and inspect return, drawdown, trades, and bias checks. | Current list/detail screens still use demo records; next migration target. |
| Experiment Matrix | Compare several strategies or parameter variants | Select runs and compare metrics side by side. | Demo presentation; waits for durable backtest-run storage. |
| Robustness Suite | Check parameter sensitivity and stress results | Run sensitivity, Monte Carlo, and walk-forward checks after a base result. | Backend analysis endpoint exists; UI data wiring remains. |
| Risk Engine | Review bias and validity risks | Use it after a backtest to identify look-ahead, overfitting, and data-quality risks. | Backend audit endpoint exists; UI data wiring remains. |
| YouTube Import | Convert a video/transcript into a reviewable strategy draft | Paste a public YouTube URL and transcript, then review every extracted rule manually. | API-backed extraction; it never runs a strategy automatically. |
| Options Lab | Learn option payoff and loss limits | Adjust the educational contract inputs and read the payoff illustration. | Calculator/education only; no options-chain import or execution. |
| Data & Providers | Manage local daily NSE history | Choose starter universe or **My NSE symbols**, set dates, click **Check availability**, then **Import missing data** only when required. | Real SQLite cache + official NSE archive import. |
| Settings | View research configuration | Confirm local-data-only mode and local AI settings. | Configuration display; no paid market-data credential required. |

## Current local data

At the time this guide was created, `data/market_cache.sqlite3` contains 27,997 daily official-NSE OHLCV bars for 47 instruments from 2024-01-01 through 2026-06-30. The starter set contains Sensex constituents, major banks, and sector ETFs. Some newer listings naturally have shorter histories.

## Five ownership tracks

1. **Data foundation** — official NSE import, cache coverage, duplicate prevention, custom symbols, cache-only reads. This is implemented first.
2. **Backtest runs** — replace demo list/detail results with saved API runs and stored equity/trade series.
3. **Strategy and research** — use the cache symbol catalogue in Research and Strategy Lab; save reviewed strategies.
4. **Validation tools** — connect robustness, bias, comparison, and analytics pages to the same saved run IDs.
5. **UX and QA** — empty/loading/error states, all buttons wired, page-level tests, and user-facing help.

## Data rules

- Only exchange-traded NSE equities and ETFs are imported in the first implementation; mutual-fund NAVs and intraday bars are outside this source.
- Custom NSE symbols are supported. Enter symbols such as `RELIANCE`, `TCS`, or `HDFCBANK`; they are validated against the downloaded official archive.
- The cache key is `(symbol, timeframe, timestamp)`, so a candle cannot be duplicated.
- A cache coverage preview blocks a full date-range overlap before it creates an import job.
- The importer records successfully processed archive/symbol days, so retrying the same request skips them even when the archive had no bar (for example, a holiday or pre-listing day).
- If a requested local range has no data, backtesting stops with a clear instruction to import the missing range. It never silently falls back to Yahoo Finance.
