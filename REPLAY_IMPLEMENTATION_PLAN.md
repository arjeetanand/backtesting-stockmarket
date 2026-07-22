# Backtrack live-feeling chart replay and strategy backtesting plan

Status: IMPLEMENTED & VERIFIED  
Owner: Replay Product Agent  
Last reviewed: 2026-07-22

## 1. Problem to solve

Backtrack currently explains a completed simulation well, but a trader cannot yet experience the strategy as it unfolds candle by candle. The product should answer two different questions:

1. **Manual replay:** “If I had seen only the candles available at that moment, would I have taken this trade?”
2. **Automated backtest:** “If these explicit rules had executed over the selected period, what would the result have been?”

These must share the same chart, price data, order model, costs, and trade journal. Otherwise a trader can see one result in automated mode and practice a different execution process in replay mode.

## 2. Inspiration and product lessons

| Product/reference | Useful idea for Backtrack | Adaptation for Indian markets |
| --- | --- | --- |
| [Traders Casa](https://traderscasa.com/) and the supplied [backtesting guide](https://traderscasa.com/blog/how-to-backtest-a-trading-strategy) | Chart-led backtesting, trade placement while testing, journaling, analytics, rewind/go-to, and screenshots. | Make the chart the primary workspace and connect every simulated trade to the same journal and metrics. |
| [FX Replay](https://fxreplay.com/backtest) | Historical market replay that feels like live execution, direct chart trade controls, risk sizing, and pause/rewind/replay. | Add bar-by-bar NIFTY, BANKNIFTY, NSE equity, and later options replay with explicit costs and session rules. |
| [Backticks](https://backticks.io/) | Visual strategy graph, tick/bar replay, explanation of why an order fired, and promotion to paper trading. | Use Backtrack’s reviewable strategy draft/DSL and show the exact condition/event behind each marker. |
| [TradingView Lightweight Charts](https://tradingview.github.io/lightweight-charts/docs/) | Performant candlesticks, price lines, and series markers for entry/exit annotations. | Use the open-source chart library for the first implementation instead of copying proprietary chart code. |

The goal is to take the interaction model, not copy branding, proprietary code, or claims. Traders Casa’s public product pages emphasize backtesting, journaling, analytics, live trade journaling, and TradingView-powered charting; the plan below combines those ideas with Backtrack’s existing provider validation and risk checks. [Product reference](https://traderscasa.com/)

## 3. Product decision: two explicit modes

### Mode A — Manual Replay: “I trade the chart”

The user selects a symbol, timeframe, historical period, starting point, capital, risk rules, and replay speed. Only candles up to the current replay cursor are visible. The trader can place a simulated long or short from the chart, define stop-loss and target, scale out, move a stop, and close the position.

This mode supports any discretionary strategy: price action, support/resistance, order blocks, candlestick patterns, discretionary options setups, or a YouTube strategy that cannot yet be expressed as code.

### Mode B — Automated Backtest: “The rules trade the chart”

The user selects a reviewed strategy definition. The engine processes the same bars and order model without exposing future candles to signal generation. Every trade marker includes the rule conditions that fired, the fill assumptions, and the data-quality warnings.

### Shared result

Both modes write the same normalized trade journal and produce the same core metrics:

- net P&L and return;
- win rate and number of closed trades;
- average win/loss and profit factor;
- maximum drawdown and recovery time;
- largest winning/losing streak;
- exposure and holding time;
- fees, slippage, and estimated taxes where configured;
- benchmark comparison;
- data and strategy hashes.

## 4. Target user journey

```text
Dashboard → New replay
  ↓
Instrument: NIFTY 50 / BANKNIFTY / NSE equity
Timeframe: 1D / 1H / 15m / 5m
Period: from / to
Replay start: random date or selected date
Capital, risk per trade, commission, slippage, timezone
  ↓
Choose Manual Replay or Automated Backtest
  ↓
Chart opens with only the visible history before the replay cursor
  ↓
Step one candle, play at 0.5×/1×/2×/5×, pause, rewind, or go to a date
  ↓
Place/manage simulated trades directly on the chart
  ↓
Review live session P&L, open risk, rule adherence, and trade notes
  ↓
Finish session
  ↓
Trade journal + equity curve + analytics + replay timeline + mistakes/caveats
  ↓
Save as a backtest run or promote to paper-trading watchlist
```

## 5. Proposed replay workspace

### Header

- session name and status: `REPLAYING`, `PAUSED`, `FINISHED`;
- symbol, exchange segment, timeframe, timezone;
- visible replay date and total period;
- data status and provider label;
- `Manual` / `Automated` mode badge.

### Main chart

- candlesticks and volume;
- crosshair with timestamp, OHLC, and volume;
- visible range only up to the replay cursor;
- optional indicators: EMA, SMA, RSI, MACD, Bollinger Bands, VWAP, ATR;
- entry/exit markers;
- stop, target, breakeven, and position-size price lines;
- chart drawing tools: horizontal line, trend line, rectangle, support/resistance tag;
- click marker opens the trade/event explanation.

### Replay toolbar

- `Play/Pause`;
- `Step forward` one bar;
- `Step back` only before an order is committed, or create an explicit correction event;
- `Restart`;
- `Go to date`;
- speed: 0.25×, 0.5×, 1×, 2×, 5×;
- `Hide future data` locked on for manual replay;
- optional auto-pause on signal, stop, target, or session close.

### Order ticket

- `Long`, `Short`, `Close`, and `Flatten`;
- market/limit/stop entry;
- quantity or risk-based sizing;
- entry price, stop-loss, target, trailing stop;
- estimated rupee risk and percentage of capital;
- commission, slippage, and product type;
- partial close and add-to-position controls;
- a note and setup tag before submit.

### Live session panel

- available balance;
- equity and unrealized P&L;
- current position, average price, stop, target, quantity;
- risk-at-stop and exposure;
- candles remaining in the selected period;
- current streak and rule-adherence score;
- event log: “EMA crossed”, “entry placed”, “stop moved”, “target hit”, etc.

### Finish panel

- summary sentence in plain language;
- P&L and return;
- chart with all markers;
- trade table and notes;
- mistake review: early entry, missed trade, moved stop, oversized position;
- strategy-vs-manual comparison when both modes were run on the same period;
- save/share/export JSON and CSV.

## 6. Data and anti-hindsight design

The biggest correctness requirement is not visual. The browser must not receive hidden future candles during manual replay. If the entire dataset is sent to the browser, a technically curious user can inspect it and the product cannot honestly claim anti-hindsight replay.

### Server-authoritative MVP

1. Create a replay session on the backend.
2. Load the full historical dataset server-side.
3. Store a `reveal_index` or `cursor_timestamp` server-side.
4. Return only bars through the current cursor.
5. On `step`, advance the cursor and return the next bar plus any fills/events.
6. On `place-order`, validate the order against the current visible bar and current portfolio state.
7. Never accept a client-supplied future timestamp as the execution clock.

### Local demo mode

The frontend may have a seeded replay for fast demos, but it must be labeled `Demo / not provider-backed`. It should not be described as secure anti-hindsight replay.

## 7. Backend integration plan

Create a new bounded context rather than putting replay state into `ResearchService`.

### New modules

```text
src/quant_research/replay/
├── models.py       # ReplaySession, ReplayCursor, ReplayOrder, ReplayPosition, ReplayEvent
├── service.py      # create, step, play command validation, order matching
├── repository.py   # in-memory first; database repository later
├── matcher.py      # market/limit/stop fills and next-bar semantics
└── metrics.py      # session metrics using the shared analytics calculations
```

### New API routes

```text
POST /api/v1/replay/sessions
GET  /api/v1/replay/sessions/{session_id}
POST /api/v1/replay/sessions/{session_id}/step
POST /api/v1/replay/sessions/{session_id}/orders
POST /api/v1/replay/sessions/{session_id}/orders/{order_id}/close
POST /api/v1/replay/sessions/{session_id}/orders/{order_id}/modify
POST /api/v1/replay/sessions/{session_id}/finish
GET  /api/v1/replay/sessions/{session_id}/journal
```

Later, add:

```text
WS /api/v1/replay/sessions/{session_id}/stream
```

Use step commands and browser timers for the live-feeling historical session; the server remains authoritative and no live-feed connection is introduced.

### Suggested models

```python
ReplaySession:
    session_id
    mode: manual | automated
    symbol
    exchange_segment
    timeframe
    start
    end
    cursor_timestamp
    cursor_index
    initial_capital
    cash
    equity
    risk_per_trade
    commission
    slippage
    timezone
    data_hash
    strategy_hash: str | None
    status

ReplayOrder:
    order_id
    side: buy | sell
    order_type: market | limit | stop
    quantity
    requested_price
    stop_loss
    take_profit
    created_at
    filled_at
    fill_price
    status

ReplayEvent:
    event_id
    session_id
    cursor_timestamp
    event_type
    payload
```

Reuse the existing `Trade`, `EquityPoint`, `BacktestResult`, and analytics models where semantics match. Do not duplicate metric formulas in the frontend.

## 8. Frontend integration plan

### New files

```text
frontend/src/app/replay/page.tsx
frontend/src/components/replay/ReplayWorkspace.tsx
frontend/src/components/replay/ReplayToolbar.tsx
frontend/src/components/replay/OrderTicket.tsx
frontend/src/components/replay/SessionPanel.tsx
frontend/src/components/replay/TradeJournal.tsx
frontend/src/components/charts/MarketReplayChart.tsx
frontend/src/lib/replay/api.ts
frontend/src/lib/replay/types.ts
```

### Chart implementation

Add `lightweight-charts` to the frontend. The chart should be a client component because it owns a canvas and user interaction. Use:

- candlestick series for OHLC;
- histogram series for volume;
- line series for indicators;
- price lines for stop/target/entry;
- series markers for buy/sell/stop/target events;
- a controlled visible dataset that is replaced after each server step.

TradingView’s current Lightweight Charts API exposes candlestick series and a marker plugin for event annotations; follow the installed version’s API rather than older `series.setMarkers` examples. [Markers API](https://tradingview.github.io/lightweight-charts/docs/api/functions/createSeriesMarkers)

### Existing Backtrack pages to reuse

- Dashboard setup controls become the entry point to create a replay session.
- Strategy Import remains the review step before automated mode.
- Options Lab becomes the educational model for later options replay.
- Analytics and Backtest Runs consume normalized replay results.
- Data & Providers owns provider freshness and symbol mapping.
- Settings owns default capital, commission, slippage, timezone, and risk preferences.

## 9. Automated strategy integration

Do not make “any strategy” mean “send arbitrary text directly into code execution.” Use a reviewable intermediate representation:

```text
YouTube/transcript/plain language
        ↓
Strategy draft: indicators, conditions, entries, exits, risk
        ↓ human approval
Strategy DSL / compiled rule graph
        ↓
Automated backtest engine
        ↓
Trade events + explanation markers
```

Initial supported rule nodes:

- indicator value and crossover;
- price above/below level;
- candle pattern;
- time/session filter;
- entry/exit;
- stop/target/trailing stop;
- fixed or risk-based position size;
- maximum daily loss and maximum open positions.

Unsupported or ambiguous rules must be marked `needs review`; they must not silently become code.

## 10. Scope boundary: historical replay only

“Live-feeling chart” means historical replay that reveals old candles at a controlled pace. Backtrack does not include a live market feed, broker connection, paper-trading feed, or order execution. Keep the replay clock and every order simulated.

## 11. Implementation phases

### Phase 0 — Product contract

- [ ] Finalize manual vs automated mode wording.
- [ ] Finalize instrument/timeframe/date/capital/risk form.
- [ ] Define fill assumptions for market, limit, stop, gaps, and session close.
- [ ] Define what the user sees before/after each step.
- [ ] Add replay acceptance criteria to `TESTING.md`.

### Phase 1 — Chart foundation

- [ ] Add `lightweight-charts`.
- [ ] Build reusable candlestick/volume chart component.
- [ ] Add crosshair, resize handling, theme, and accessible side panel.
- [ ] Add markers and price lines with a local fixture.

### Phase 2 — Manual replay MVP

- [ ] Add `ReplaySession` domain models and in-memory repository.
- [ ] Add create/session/step/order/finish routes.
- [ ] Send only revealed bars.
- [ ] Add manual order ticket and chart markers.
- [ ] Add session panel and trade journal.
- [ ] Add deterministic fake-data tests and browser interaction tests.

### Phase 3 — Automated replay

- [ ] Connect approved compiled strategy to the replay cursor.
- [ ] Emit signal explanation events.
- [ ] Compare manual and automated results over the same period.
- [ ] Add no-lookahead and same-data regression fixtures.

### Phase 4 — Analytics and education

- [ ] Reuse shared metrics in replay finish view.
- [ ] Add rule-adherence and mistake tags.
- [ ] Add export/shareable replay report.
- [ ] Add options replay only after spot/equity replay is stable.

### Phase 5 — Historical replay hardening

- [ ] Add cached free historical candles with expiry and data-source caveats.
- [ ] Add explicit source-unavailable and intraday-window error states.
- [ ] Add simulated-session persistence without a broker connection.
- [ ] Keep all broker, WebSocket, live-feed, and real-order work out of scope.

## 12. Acceptance criteria for the MVP

- A trader can select a specified Indian instrument, timeframe, start date, end date, capital, commission, slippage, and risk-per-trade.
- A replay session opens with a candlestick chart and only the revealed historical bars.
- Play, pause, step, restart, speed, and go-to-date work.
- A trader can place, modify, partially close, and close a simulated position from the chart.
- Stop-loss and target events fill according to documented OHLC rules.
- The current balance, equity, open risk, P&L, and journal update after every event.
- The finish screen shows the same core metrics used by automated backtests.
- Every event is timestamped and explainable.
- Refreshing or tampering with client payloads cannot advance the server cursor.
- No live order is sent to a broker.
- Desktop and mobile layouts remain usable.

## 13. Recommended first implementation slice

Build one complete vertical slice before adding every indicator:

```text
NIFTY 50 · 15m · Manual Replay
  + market order
  + fixed quantity
  + stop-loss and target
  + step one candle
  + entry/exit markers
  + P&L/journal
  + finish metrics
```

Once this is trustworthy, add risk-based sizing, limit/stop entries, automated EMA strategy, other Indian symbols, and then paper mode. This sequence produces a usable trader workflow early and prevents a visually impressive chart from hiding an unverified execution engine.
