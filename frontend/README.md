# Backtrack frontend

The frontend is a Next.js App Router application in `frontend/src`. It provides the trader-facing workspace and calls the FastAPI backend at `/api/v1`.

## Run locally

From the repository root:

```bash
npm --prefix frontend ci
./run.sh
```

Open `http://localhost:4003`. `run.sh` starts the Next.js frontend on port `4003` and the local FastAPI backend on `8001`. Without the backend, the UI keeps explicit unavailable/error states and does not substitute mock prices.

For UI checks, use `./scripts/dev-frontend.sh 5003 8001` or
`./scripts/dev-frontend.sh 6003 8001` while that test port is free. The script passes
the backend port through `NEXT_PUBLIC_API_BASE_URL` and isolates Next output per port.
It enables `WATCHPACK_POLLING=true` by default to reduce `EMFILE` watcher pressure; set
`WATCHPACK_POLLING=false` when the machine has enough file-watcher capacity.

If a newly added route still returns a Next 404, stop and restart the relevant dev
server; a stale watcher may not have discovered the route.

Optional `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001/api/v1
```

The home page guides the local-data → research → saved-results → comparison workflow. Stock and date controls belong on Research, Strategy Lab, Pattern Finder, or Replay; do not reintroduce stock/date state into the home page unless the product flow changes deliberately.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Home and simple workflow entry points |
| `/data` | Bulk NSE history download and local stock search |
| `/research` | Hypothesis review, volume/momentum study, data preparation, and backtest handoff |
| `/stock-research` | One-stock indicators, conditional levels, fixed-rule holdout, and persistent run log |
| `/strategy` | Build indicator/rule strategies |
| `/strategy-import` | Import and review YouTube strategy rules |
| `/backtests` | Saved test history |
| `/backtests/[id]` | Detailed metrics and charts |
| `/replay` | Historical candle replay with simulated orders |
| `/time-machine` | Seeded daily-bar scenario sample from local NSE history |
| `/comparison` | Compare saved tests and inspect dated trade-level outcomes |
| `/robustness` | Robustness and walk-forward analysis |
| `/bias-validity` | Bias and validity checks |
| `/market-scanner` | Multi-stock formula, historical strategy, breakout, and daily structure-zone scanning |
| `/insights` | Local NSE index breadth, stock/sector heatmaps, and top movers |
| `/insights/fii-dii` | Saved Tapetide FII/DII history from SQLite, with a separate official NSE latest-session view |
| `/watchlist` | Persisted simulated setup tracking |
| `/ml-lab` | Chronological ML experiments |
| `/pattern-finder` | Historical pattern detection and review |
| `/options` | Educational options payoff calculator |
| `/analytics` | Performance analytics |
| `/settings` | Local configuration status |

## Data page behavior

The Data page intentionally has one simple bulk workflow:

- Select all history, last four years, last year, a calendar year, or custom dates.
- Start one background import for the selected window.
- Search the local NSE catalogue by symbol or company name.
- See the saved date period, candle count, and whether prices exist locally.

The search starts only after text is entered and asks the backend for a small result set. It does not scan full date coverage on every keystroke. Each NSE archive is bulk-loaded for all supported stocks, so there is no per-stock import button.

## Market Insights and Market Scanner workflow

Market Insights is an index-aware daily view. It uses only locally cached official NSE candles, supports NIFTY 50, Sensex, Bank Nifty, and NIFTY 500, and offers 1D, 1W, 1M, and 3M periods. The Stock/Sector heatmap colors equal-sized tiles by local price return, while the breadth cards show advancing, declining, unchanged, and unavailable coverage. Missing candles stay unavailable and are never replaced with synthetic prices.

Market Scanner keeps formulas, saved scans, historical research, and the morning plan separate. Opening the page or changing a formula never starts a request; use **Build Morning Plan** or **Run scan** explicitly. Presets and recent-run metadata are stored in versioned browser-local storage keys.

The default **Morning Plan** tab ranks technical setups from the latest completed local NSE daily bars. Run it manually at 9:00 IST for the regular NSE pre-open. Each plan shows the data date, previous-session high as a conditional entry trigger, previous-session low as invalidation, and a 2R target. Scores rank setups only; they are not probabilities or a promise of the best-performing stock. The app does not load pre-open auction prices, news, or intraday confirmation and does not schedule itself.

The **Daily structure zones** tab is a separate explicit scan over the selected configured universe. It uses local 1-day NSE candles, reports per-symbol latest-bar dates and coverage, and returns only recent zones that have not closed through their invalidation edge. Its deterministic rule is documented in `PROJECT_GUIDE.md`; it is not a live or intraday feed.

The **Liquidity flow** tab ranks the latest 20 local daily candles by a close-location × traded-value estimate, shows the top 20 on each side and makes the top three selectable in a split flow graph. Search any local NSE catalogue symbol to inspect its candidate price-action zones. It does not expose actual buyer/seller identities, order-book depth, or live orders.

The historical scanner remains available as an explicit research action. It is distinct from current-snapshot formula screening and from Market Insights returns. Daily structure-zone scans are separate again: they identify recent price areas from local daily bars and never run automatically.

`/stock-research` is the single-symbol explanation and validation flow. It reads local NSE daily bars, gives reasons for SMA/RSI/MACD/ATR/volume context, and shows conditional levels from a fixed long-only breakout rule. Its final 30% holdout is not optimized; the simulation starts at ₹1,00,000, buys whole shares, and includes stated costs. A run only passes the screen with at least five years, 30 out-of-sample trades, at least 70% wins, positive net expectancy and compounded return, and cash-based profit factor above one. The route persists every valid analysis request that reaches the service to `stock_analysis_run` artifacts and shows all-time counts with a recent ledger. Historical price returns are not fundamental growth forecasts; raw prices are not adjusted for splits or bonus issues, and no live price or order is supplied.

## Historical Market Scanner workflow

Market Scanner supports date-scoped NIFTY 50/NIFTY 500/imported-universe scans through the shared strategy engine. Use the sector heatmap to compare strategy return, alpha versus buy-and-hold, or win rate; select a sector to rank its stocks by return, alpha, win rate, and drawdown. The leaderboard can be searched, ranked by a chosen metric, expanded beyond the top results, and exported as CSV. Every selected stock links into Research with the scanned strategy and dates; breakout candidates link to a historical test as well.

Pattern Finder's outcome visualization is a trigger-by-trigger bar chart, not a decorative line. Green bars reached the target during the holding window; red bars did not. The summary shows the filtered hit rate, best peak move, median exit return, and weakest peak move, while hovering a bar reveals its trigger date and peak/final outcomes.

The Dhan-inspired part of the product is deliberately historical: Research can hand the same symbol, timeframe, and date range to Replay for candle-by-candle paper analysis. There is no DhanHQ connection, live quote stream, webhook, or order path in Backtrack.

## Research chart workflow

`/research` is the main stock-to-results surface. Its volume study compares each signal day's volume with the preceding 20 daily sessions, then groups the next available NSE session's close return by relative-volume band and same-day move. `/comparison` includes an expandable trade ledger under each strategy result.

1. Search/select a local NSE symbol and inspect saved bars, date coverage, and latest close.
2. Choose the daily date range and load validated local OHLCV plus volume.
3. Configure the strategy, capital, position sizing, fees, slippage, stop, and target.
4. Run the deterministic backtest and inspect indicator overlays/panes, entry/exit markers, selectable trades, equity, drawdown, and metrics.

`src/lib/chart-data.ts` defines the API-independent normalized chart contracts. `src/lib/research-chart.ts` maps `GET /market-data` bars and custom backtest payloads into those contracts. `src/components/charts/FinancialChart.tsx` uses `lightweight-charts` to render candles, volume, overlays, indicator panes, markers, crosshair, pan/zoom controls, and loading/empty/error states. Add a new backend indicator by extending the response's `indicators` map; add placement/reference-line rules in `research-chart.ts` rather than coupling API details to the chart.

The supported path is local daily NSE data. The chart must never fabricate missing prices; import the required official NSE archive days or keep the unavailable state visible.

## Frontend structure

```text
frontend/src/
├── app/          # Next.js route pages
├── components/   # Layout, charts, shared UI, learning components
└── lib/          # API clients, types, helpers, and local swarm modules
```

Important files:

- `src/app/globals.css` — shared light-indigo theme and responsive styles; see the root `DESIGN.md` for its tokens and layout rules.
- `src/lib/api.ts` — timeout-aware API requests.
- `src/lib/backtest-api.ts` — backtest client and response types.
- `src/lib/market-data.ts` — local market-data client.
- `src/lib/time-machine.ts` — typed local scenario-simulator request/response client.
- `src/lib/chart-data.ts` — normalized financial-chart types and pure validation adapters.
- `src/lib/research-chart.ts` — market/backtest chart payload adapters.
- `src/lib/replay/` — replay API and state types.
- `src/lib/agents/` — deterministic five-agent in-process orchestration.
- `src/lib/strategy-library.ts` — known strategy definitions used by the UI.

The strategy catalogue is the single frontend source of truth. `STRATEGY_LIBRARY` exposes one canonical execution template per strategy ID; the Strategy Lab, Research, Strategy Import, Comparison, and Market Scanner all consume that same registry and its shared helpers. Golden Cross remains a source variant but resolves to the canonical 20/50 SMA crossover execution template. The catalogue includes the original indicator rules and seven price-action interpretation templates: support/resistance breakout, market-structure break, Fibonacci retracement, price-action reversal, supply/demand zones, ICT-style liquidity/FVG approximation, and multi-timeframe trend confirmation. Their cards and rules must say `Backtrack interpretation` or equivalent review-required language because the supplied video did not provide a usable transcript.

The Market Scanner uses the local scanner API and real leaderboard values only. Its sector heatmap is a treemap-style surface: tile area represents scanned-stock breadth, tile color can be switched between strategy return, strategy alpha versus buy-and-hold, and win rate, and clicking a sector opens its ranked stocks with a derived research score, return, alpha, win rate, drawdown, and a Research handoff. This follows the interaction model documented by [TradingView's heatmap guide](https://www.tradingview.com/support/solutions/43000766446-tradingview-heatmaps-from-global-trends-to-details/) while staying honest about the local data: market-cap sizing is not claimed because the cache does not provide market-cap fundamentals. The legacy detailed table remains available in source for traceability but is not the primary composition. ML Lab uses the same visual language with a narrow model-configuration rail and a wide diagnostics surface. Both routes keep explicit loading, unavailable, empty, and result states and must never show seeded prices or fabricated time series.

FII/DII Insights reads previously saved Tapetide history from SQLite on load. Its 30D/3M/6M/1Y controls filter saved rows and show the actual coverage; they do not request new data. Tapetide history stays separate from the official NSE latest-session series. The Nifty 50 line uses locally archived official index closes only.

Morning candidates follow one explicit handoff: **Save Plan** sends the displayed trigger, stop, and target to **Daily Watchlist**, while **Test history** opens Research with the scanner symbol, strategy, timeframe, and dates. The watchlist waits until a later daily bar reaches the trigger, then evaluates only subsequent bars; the trigger candle is left unresolved because daily OHLC cannot show which level traded first. Latest closes and paper returns are not live quotes or broker fills.

## Local swarm modules

The five frontend agents are deterministic TypeScript modules, not paid remote agents:

1. `market-data-agent.ts` — data readiness and input checks.
2. `signal-engine-agent.ts` — signal/rule interpretation.
3. `backtest-runner-agent.ts` — simulation coordination.
4. `risk-analyst-agent.ts` — risk and validity explanation.
5. `ux-narrator-agent.ts` — trader-readable status and guidance.

`orchestrator.ts` runs the sequence and exposes progress. Keep their output reviewable and do not imply that they place orders.

## Frontend checks

```bash
npm --prefix frontend run build
npm --prefix frontend run lint
npm --prefix frontend test
```

When changing a rendered page, verify loading, empty, error, success, desktop, and narrow mobile states. Never use mock market prices as a fallback for a failed API request.

## Runtime QA notes

- Keep the backend running on the port selected in `NEXT_PUBLIC_API_BASE_URL`;
  a healthy frontend can still show explicit unavailable states when that API
  is stopped.
- DELETE controls (saved tests and watchlist items) require the backend CORS
  policy to allow `DELETE` in addition to `GET` and `POST`.
- Missing history remains an actionable import/unavailable state; it must never
  be replaced with mock prices.
- Financial charts expose loading, error, unavailable timeframe, empty, and ready
  states with explicit next-step copy. Unsupported intraday timeframes remain
  unavailable for the official daily NSE path.
