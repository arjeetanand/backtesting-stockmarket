# Backtrack UX audit

Date: 2026-07-25

## Executive summary

Backtrack already has the right research primitives: official local NSE data, deterministic historical simulation, chart-ready candles and volume, indicator series, trade markers, a trade ledger, equity, drawdown, and explicit unavailable states. The main friction is that the interface presents implementation detail before the user can answer the basic questions: what stock is selected, what rule is being tested, and did it make or lose money?

The highest-value change is to make `/research` a single answer-first workspace. The setup should read like a short recipe, the chart should explain its visual language, and the result should lead with absolute P&L and trade quality rather than internal pipeline terminology.

## Audit scope and method

- Read the repository product, architecture, and release guidance in `README.md`, `PROJECT_GUIDE.md`, `handover.md`, and `TESTING.md`.
- Inspected the main frontend routes, chart adapters, financial chart, strategy library, data page, replay page, saved-test list, and backtest detail route.
- Ran the FastAPI service and Next.js app locally on ports 8000 and 3000.
- Rendered and inspected `/research`, `/strategy`, `/replay`, `/backtests`, and `/data` in the in-app browser at desktop size.
- Exercised the primary research action against an empty local-data environment and checked browser console health.

## What is confusing now

### 1. The first screen leads with the wrong mental model

The research page opens with “Describe what you want to test” and a large Local AI hypothesis editor. The user’s first job is usually more concrete: select a stock, date range, and known strategy. “Local Ollama + NSE cache” is implementation language and competes with the research task.

Recommendation: position the screen as “Test a strategy”, make stock/date/strategy the visible recipe, and label the natural-language hypothesis as optional assistance.

### 2. The seven-step pipeline is developer-facing

“Parse hypothesis”, “Validate proposal”, “Compile strategy”, and “Check bias” describe internals rather than user progress. They make the process feel longer and more technical than it is.

Recommendation: show five user-facing steps: choose stock and dates, choose strategy, load local history, run simulation, read result.

### 3. The strategy library is too large for the first decision

The page shows a long grid of 16 strategy cards below an already functional strategy selector. The cards mix beginner-friendly names with source provenance and “Backtrack interpretation” language. This creates choice overload and pushes the primary action down the page.

Recommendation: keep the select control as the fast path; place the library behind an explicit “Browse strategy library” disclosure. Preserve provenance and review warnings once opened.

### 4. Indicator support exists but is not obvious enough

The chart adapter correctly separates overlays from oscillator panes, and the chart renders volume and reference lines. The result screen’s indicator toggles are compact buttons without a visual legend explaining which color belongs to which indicator or that RSI/MACD live in their own panes.

Recommendation: add a visible legend inside the chart frame, including Volume, indicator names, and Buy/Sell markers. Keep the existing show/hide controls, but give each control a color cue and plain-language placement.

### 5. The result leads with percentages, not the answer

The current result cards emphasize “Total return”, “Maximum fall from a peak”, “Win rate”, and “Closed trades”. A non-technical user still has to calculate how much money was made or lost from starting capital and total return.

Recommendation: lead with Net P&L in rupees, final equity, and a plain-language outcome (“Historically profitable”, “Historically unprofitable”, or “No completed trades”). Keep percentages as supporting context.

### 6. Trade selection does not complete the promised chart jump

Chart markers can be clicked and highlight a trade, but the trade list is visually presented as a list of result rows rather than an interactive selection surface. Older trades can also fall outside the default visible candle window, so selection is not a reliable “jump to trade” interaction.

Recommendation: make each trade row a button, select it from either direction, and automatically widen the chart window to include the selected entry and exit.

### 7. The proposal review is technically correct but overwhelming

The proposal card shows raw JSON, model provenance, repeated assumptions, fallback diagnostics, a full clarification transcript, and the actual decision a user needs to make. In fallback cases, the same explanation can appear several times in the chat history. This makes the user wonder whether they are expected to debug Ollama before running a historical test.

Recommendation: keep the review checkpoint, but lead with the rule, key settings, execution behavior, and two short caveats. Put technical details, model provenance, feedback, retry, and clarification behind opt-in disclosures. Give the review card its own run action so the user can complete the flow from the point where they understand the test.

## What is missing or hard to trust

- The result does not state absolute P&L prominently enough.
- Wins and losses are not summarized together; the user must scan the ledger.
- There is no concise consistency readout tying win count, trade count, and sample size together.
- The chart’s marker language is not explained near the chart. “E”, “X”, and “S” are not self-evident to a first-time user.
- The historical-only boundary is present, but it is diluted among several technical notes and badges.
- The research request can spend a long time waiting on the local model before the page communicates a clear next state. The eventual empty-data behavior is safe, but the progress model should remain visibly user-facing.

## Page-by-page findings

| Surface | Strength | Friction | Priority |
| --- | --- | --- | --- |
| Research / backtest | Complete end-to-end data and result contract | AI/proposal/pipeline hierarchy obscures the basic recipe | P0 |
| Financial chart | Real candles, volume, overlays, panes, markers, loading/empty/error states | Legend and marker semantics are too implicit; trade selection needs range focus | P0 |
| Strategy Lab | Good template coverage and final validation panel | Looks like a rule editor; indicator names use aliases and technical AST language | P1 |
| Replay | Clear simulation-only setup and step controls | Empty setup screen is visually isolated and does not connect back to strategy testing | P1 |
| My tests | Search, saved runs, delete, and clear history are present | Loading is visually sparse; result columns are technical and return is not paired with rupee P&L | P1 |
| Backtest detail | Dedicated persisted result route exists | Needs the same answer-first summary and chart legend as Research | P1 |
| Data | Correct bulk import model, progress, and local search | “Download all history” is a high-commitment first action without a short recommended path | P1 |
| Error/empty states | No fabricated prices; actionable import language exists | States should appear closer to the next action and use fewer internal terms | P0 |

## Prioritized improvement plan

### P0 — Make the main flow self-explanatory

1. Rename and simplify the research setup hierarchy around stock, date range, strategy, and one primary run action.
2. Replace internal pipeline labels with user-facing steps.
3. Collapse the long strategy library by default.
4. Add chart legend and plain-language Buy/Sell guidance.
5. Lead results with Net P&L, final equity, wins/losses, win rate, max drawdown, and a consistency explanation.
6. Make trade rows selectable and focus the selected trade in the chart.

### P1 — Align neighboring surfaces

1. Reuse the result summary and chart legend on saved backtest detail.
2. Improve My tests columns to include absolute P&L and a human-readable outcome.
3. Add a short “recommended first import” path to Data and preserve the full-history option.
4. Use plain-language indicator names and descriptions in Strategy Lab.

### P2 — Trust and learning improvements

1. Add a small “How to read this chart” help disclosure for RSI, MACD, and Bollinger Bands.
2. Expose sample-size caveats when trade count is low.
3. Add a consistent historical-simulation banner across replay, result detail, and comparison.
4. Add rendered regression coverage for the main success, no-data, error, and mobile states.

## Acceptance criteria

- A first-time user can identify the stock, date range, strategy, and primary action without reading implementation terms.
- The chart explains volume, enabled indicators, and Buy/Sell markers in the same frame.
- A completed result answers “Did I make money?” in rupees and plain language within the first result block.
- Clicking a trade row or marker highlights the same trade and brings its candles into view.
- No data, loading, API error, zero-trade, and completed-result states remain explicit and never show fabricated prices.
- Desktop and approximately 390px mobile layouts remain readable without horizontal overflow.
