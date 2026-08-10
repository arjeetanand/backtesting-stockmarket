# Backtrack — Stitch UI Design Brief

Design and prototype a polished desktop-first web application called **Backtrack**.

Backtrack is a local, free, research-only Indian-market backtesting workspace. It helps a user import official NSE daily historical data, define a strategy, run a historical simulation, inspect trades on the actual price chart, and challenge the result with risk and robustness checks.

This is a product interface, not a marketing landing page. The primary experience should feel like a calm, trustworthy research workstation: clear data provenance, readable charts, explicit assumptions, and no hype.

## Non-negotiable product rules

- Historical simulations only. Never show live prices or live order controls.
- Never imply broker execution, Dhan integration, or real-money trading.
- Use official NSE daily archive data as the primary source.
- If data is missing, show an actionable import/unavailable state. Never fabricate prices, candles, or results.
- YouTube strategy extraction is a reviewable draft, never an automatic trading instruction.
- Every backtest should clearly show fees, slippage, execution convention, date range, symbol, timeframe, and data source.
- Use Indian-market examples such as PNB, RELIANCE, TCS, INFY, HDFCBANK, and CANBK.
- Use Indian rupee formatting, for example `₹1,00,000`.

## Core design direction

Create a quiet quant workspace with a bright, precise visual language:

- True white main canvas with very light cool-gray secondary surfaces.
- Deep ink navy for headings and primary text.
- Indigo as the main action/accent color.
- Emerald for positive results and successful simulated trades.
- Rose/red for losses, drawdown, and failed signals.
- Amber for warnings, incomplete data, and review-required states.
- Blue-gray borders and restrained shadows.
- Avoid neon trading-terminal styling, black backgrounds, glassmorphism, excessive gradients, crypto language, and decorative candlestick wallpaper.
- Use whitespace to separate research stages. Do not put every section inside a rounded card.

The interface should feel credible to a careful analyst and approachable to a beginner.

## Design tokens

Use these tokens consistently:

```text
--canvas: #ffffff
--surface: #f8fafc
--surface-subtle: #f1f5f9
--surface-indigo: #eef2ff
--ink: #172033
--ink-strong: #0f172a
--muted: #64748b
--muted-light: #94a3b8
--border: #e2e8f0
--border-strong: #cbd5e1
--indigo: #4f46e5
--indigo-dark: #3730a3
--indigo-soft: #c7d2fe
--positive: #047857
--positive-soft: #ecfdf5
--negative: #e11d48
--negative-soft: #fff1f2
--warning: #b45309
--warning-soft: #fffbeb
```

Typography:

- Headings: Space Grotesk, system fallback; strong but not oversized.
- Body and controls: Inter, system fallback.
- Dates, symbols, prices, IDs, and technical values: JetBrains Mono, monospace fallback.
- Main page heading: 32–40px desktop, 28px mobile.
- Section heading: 18–22px.
- Body: 13–15px with generous line-height.
- Utility labels: 10–11px uppercase with subtle letter spacing.

Geometry:

- App shell sidebar: 248px desktop, collapsible or bottom navigation on mobile.
- Main content max width: 1440px with 28–40px desktop gutters.
- Panel radius: 10–14px. Avoid large pill-shaped containers.
- Button radius: 7–9px.
- Border-first hierarchy; shadows should be soft and rare.
- Use an 8px spacing rhythm.

## App shell

Build a persistent application shell:

### Left sidebar

At the top:

- Indigo square mark with a simple upward chart glyph.
- `backtrack`
- Small subtitle: `Test ideas with history`

Primary navigation:

- Home
- Pattern Finder
- Test a strategy
- My tests
- Compare tests
- ML Lab
- Learn

Secondary navigation:

- Build rules
- Strategy library
- Replay a chart
- Manage stock data
- Check reliability
- Settings

Bottom status area:

- `Data connection`
- Green dot and `READY`, or amber/red connection state.

### Top bar

- Current page title on the left.
- Optional short subtitle.
- On the right: compact data-source status and a restrained `Start a new test` button.
- Do not add a global search bar unless it is needed for the current page.

### Main canvas

Use a consistent content container. Every page should have a clear first action and a visible explanation of what the page does.

## Home page

Purpose: help the user choose a starting workflow. Do not put stock/date selectors on the home page.

First viewport:

- Heading: `What would you like to test?`
- Supporting copy: `Choose where to begin with historical NSE research.`
- Three strong action rows/cards, not a dense dashboard grid:
  1. `Start with a strategy` — choose a known rule or describe your own.
  2. `Use a YouTube strategy` — import a video/transcript into a reviewable draft.
  3. `Replay the chart` — step through historical candles with simulated orders.
- Each action has one clear arrow action and a small, meaningful icon.

Below:

- `Your recent tests` table with test name, stock, saved date, return, win rate, and maximum fall.
- Empty state: `No tests yet` plus a clear link to start a strategy test.
- A small educational callout linking to Learn.

## Research page

Purpose: prepare a hypothesis, review the selected rules, ensure local data exists, and run a backtest.

Layout:

- Main column: hypothesis prompt and strategy library.
- Secondary column: selected stock, timeframe, date range, capital, amount per trade, maximum loss, profit target.
- Use a visible step structure:
  1. Define the idea
  2. Review the rule
  3. Confirm local data
  4. Run the simulation

Strategy library cards should show:

- Strategy name
- Family
- One-sentence description
- `Review required` where the strategy is an interpretation
- Selected state with indigo border and pale indigo surface

Supported strategy families include:

- SMA/EMA crossover
- RSI and EMA pullback
- RSI mean reversion
- Bollinger reversion
- MACD crossover
- Donchian breakout
- Price momentum
- Support/resistance breakout
- Market-structure break
- Fibonacci retracement
- Price-action reversal
- Supply/demand zones
- ICT-style liquidity sweep + FVG approximation
- Multi-timeframe trend confirmation

## Strategy Lab / Build rules

Purpose: let the user choose a template, inspect its logic, edit parameters, and run a long-only historical simulation.

Desktop layout:

- Left rail: searchable strategy template list.
- Center: strategy identity, symbol, candle size, dates, capital, entry rule, exit rule, indicators.
- Right rail: final check, risk limits, run/preview actions.

Every selected strategy must show plain-language rules. Do not show only technical IDs.

Example selected strategy:

```text
Fibonacci Retracement

Entry:
Buy an uptrend pullback that reaches Fib 61.8% and recovers above Fib 50%.

Exit:
Sell below Fib 78.6% or above the prior range high.
```

Primary actions:

- `Run backtest`
- `Preview signals`

Always show the execution note:

`Signals use Close T. Fills use Open T+1, preventing lookahead bias.`

## Backtest result / actual trade chart

This is the most important experience. The user must be able to see where a strategy bought, where it sold, and how much profit or loss resulted.

Result header:

- `Backtest completed`
- Symbol, timeframe, date range, and `Real local NSE candles`
- Metric strip:
  - Total return
  - Maximum fall from a peak
  - Win rate
  - Closed trades

Main chart:

- Large interactive candlestick chart using the actual returned NSE candles.
- Price axis on the right.
- Time axis along the bottom.
- Entry markers: green upward arrow with `BUY` label.
- Exit markers: red downward arrow with `SELL` label.
- Green connector/highlight between a profitable entry and exit.
- Red connector/highlight between a losing entry and exit.
- Tooltip fields: date, OHLC, active indicator values, entry/exit state, realized P/L.
- Controls: zoom, reset view, show/hide indicators, show trade markers.
- Legend must explain that all markers are simulated historical trades.

Under the chart:

- Selected trade summary:
  - `Entry ₹125.40`
  - `Exit ₹151.20`
  - `+20.57%`
  - `₹2,057 realized P/L`
  - `15 trading days`
  - `Target reached` or `Holding window expired`
- Trade navigation: previous trade, next trade, focus on chart.
- Trade ledger table:
  - Trade number
  - Entry date/price
  - Exit date/price
  - Holding days
  - Realized P/L
  - Best open P/L
  - Worst open P/L
  - Outcome

If no trades occur, show an honest empty state: `No simulated trades matched these rules and dates.` Include suggestions to widen the date range, review parameters, or import more NSE history.

## Pattern Finder

Purpose: discover and inspect recurring volume-spike/breakout setups.

Keep the existing controls but improve hierarchy:

- Stock symbol
- Target gain
- RVOL threshold
- 52-week distance
- Holding window
- Preset profiles

Result view:

- Summary metrics for triggers, winners, losers, hit rate, average win, and average loss.
- Historical signal table with filters: all, true positives, false positives.
- Add a `View on chart` action for every signal.
- Chart view must focus on the selected setup, show the trigger candle, the simulated exit, the holding window, and realized/final return.
- Make it explicit that a `true positive` currently means the target was reached within the defined window, not that a real order was executed.

## Replay page

Purpose: reveal historical candles one at a time and place paper-only orders.

- Large chart area with current candle highlighted.
- Left or top control strip: symbol, dates, timeframe, starting balance, step, play/pause, speed.
- Simulated ticket clearly labelled `Paper simulation`.
- Position state: quantity, entry price, current price, unrealized P/L, realized P/L.
- Event journal below the chart.
- Use red/green carefully; never make the page feel like a live brokerage terminal.

## Manage stock data

Purpose: import and search the local official NSE archive cache.

- Make the page feel operational and trustworthy.
- Quick import choices: all history, last four years, last year, calendar year, custom dates.
- Show one bulk archive job, not per-stock download buttons.
- Progress state should show archive days completed, reused local archives, downloaded archives, rows stored, and candles available.
- Search results should show symbol, company, earliest saved candle, latest saved candle, candle count, and `Saved locally` or `Stock list only`.
- Error state should explain exactly what the user can do next.

## Compare tests

- Select multiple strategy cards.
- Keep the comparison fair with shared symbol, timeframe, dates, capital, fees, and position amount.
- Results should use a compact table plus a clear return/drawdown comparison chart.
- Highlight trade count and sample-size limitations instead of only highlighting the highest return.

## Check reliability

Use a diagnostic layout for:

- Parameter sensitivity
- Monte Carlo trade-order variation
- Walk-forward results
- Stress tests with higher costs
- Look-ahead/data-quality/overfitting warnings

Use amber and red as review signals, not alarmist decoration.

## Settings and Learn

Settings should show local API status, cache path/status, NSE data source, optional Ollama status, and clear limitations.

Learn should explain indicators, options payoff basics, backtesting versus live trading, and why historical results are not forecasts. Use diagrams and small examples, not financial promises.

## Component system

Create reusable components:

- AppShell, Sidebar, TopBar
- PageHeader
- PrimaryButton, SecondaryButton, QuietButton
- Field, DateRangeField, SymbolCombobox
- StrategyCard, MetricCard, StatusBanner
- EmptyState, ErrorState, LoadingState
- ChartFrame, ChartToolbar, TradeMarker, TradeTooltip
- TradeSummary, TradeLedger
- DataSourceBadge, ReviewRequiredNotice

States every major screen must support:

- Loading
- Empty/no local data
- API error
- Successful result
- Partial result/no trades
- Selected/hover/focus controls
- Desktop width around 1440px
- Tablet width around 1024px
- Mobile width around 390px

Accessibility:

- Use semantic headings and landmarks.
- Every control needs a visible or screen-reader label.
- Keyboard focus must be obvious.
- Never rely on color alone to distinguish profit/loss or status.
- Tables need column headers; charts need a text summary or trade ledger alternative.

## Responsive behavior

Desktop:

- Persistent sidebar.
- Multi-column Strategy Lab and Research layouts.
- Chart and ledger side-by-side only when there is enough width.

Tablet:

- Narrower sidebar or collapsible navigation.
- Collapse right-side inspectors below the main form/chart.

Mobile:

- Sidebar becomes a compact top bar or bottom navigation.
- Stack all form fields into one column.
- Chart remains horizontally usable without clipping.
- Trade summary becomes a vertical list.
- Ledger becomes horizontally scrollable or transforms into stacked trade rows.
- Keep primary actions sticky near the bottom only when it does not obscure content.

## Tone and copy

Use precise, calm language:

- Prefer `historical simulation`, `local NSE candles`, `simulated trade`, `review required`, and `data unavailable`.
- Avoid `guaranteed`, `winning strategy`, `profit machine`, `signals you can trust`, `live`, or `sure-shot`.
- Explain technical terms in one short sentence near the control that uses them.

## Stitch output request

Generate a coherent responsive web app prototype for the Backtrack shell and the following key screens:

1. Home
2. Strategy Lab with the Fibonacci Retracement template selected
3. Completed backtest result with an actual price chart, visible BUY/SELL markers, and a selected trade P/L summary
4. Pattern Finder with a selected historical signal focused on the chart
5. Manage Stock Data with an import progress state
6. Mobile version of the completed backtest result

Keep the same navigation, tokens, chart language, spacing system, and state semantics across every screen. Build the prototype as a serious research product, not a brokerage dashboard and not a marketing page.
