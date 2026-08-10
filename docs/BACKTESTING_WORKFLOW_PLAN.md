# Backtesting workflow improvement plan

Status: implemented and verified  
Scope: the existing local, historical-only NSE research workflow

## Current architecture summary

- FastAPI owns local NSE archive imports, SQLite coverage, market-data responses, strategy calculations, and backtest persistence.
- `GET /api/v1/market-data` returns validated local OHLCV bars; `POST /api/v1/backtests/custom` returns candles, indicators, signals, trades, equity, drawdown, and metrics from the deterministic vector engine.
- The Next.js App Router frontend uses `/research` as the main strategy-testing handoff, `SymbolCombobox` for local NSE catalogue search, and `StrategyReplay` for candle-by-candle replay.
- Shared charts use Recharts for equity/drawdown and `lightweight-charts` for the reusable OHLCV financial chart. The typed, API-independent adapter keeps page-level fetching outside the chart.
- Existing five frontend swarm modules remain deterministic UI-auditable helpers; they are not remote workers and do not place orders.

## Swarm allocation

| Agent | Work area | Write scope | Deliverable |
| --- | --- | --- | --- |
| Repository/API | Backtest response contract | `src/quant_research/domain/backtesting/vector_engine.py`, focused backend tests | Preserve existing routes while enriching chart-ready candles/signals with real volume and metadata. |
| Charting | Reusable chart module | `frontend/src/components/charts/FinancialChart.tsx`, `frontend/src/lib/chart-data.ts`, chart package metadata if needed | Typed normalized chart data, candlestick/volume/indicator/marker rendering, empty/loading/error states, and documented props. |
| Workflow UX | Main research experience review | Read-only review of `frontend/src/app/research/page.tsx`, `globals.css`, strategy library, and API clients | Identify the smallest integration and usability changes needed for the stock → data → chart → backtest → results path. |
| QA/docs | Verification and handover review | Read-only inspection plus checklist recommendations | Map regression coverage, build risks, and documentation updates; no conflicting code edits. |

## Target product behavior

1. Search/select a local NSE symbol and show its saved daily coverage, latest close, and an actionable import-required state.
2. Choose supported date range/timeframe, capital, strategy, parameters, costs, and optional stop/target.
3. Load real local candles into a reusable chart with OHLC, volume, overlays, separate indicator panes, zoom/pan/reset, and clear empty/error states.
4. Run the existing deterministic backtest without look-ahead; display real signals, trades, equity, drawdown, and metrics.
5. Allow a trade row/marker selection to expose the matching trade details; keep all copy explicit that this is historical simulation only.

## Implementation milestones

- [x] Inspect repository guidance, routes, schemas, engine, frontend workflow, chart primitives, and tests.
- [x] Record the swarm plan and normalized chart-data boundary.
- [x] Add/verify backend chart payload fields without breaking existing clients.
- [x] Build and test the reusable financial chart module.
- [x] Integrate it into the main research/backtest workflow and improve result readability.
- [x] Add focused regression tests and run backend/frontend checks.
- [x] Update README, PROJECT_GUIDE, frontend README, and handover with the new chart flow and extension points.

## API and normalized chart contract

The backend remains the source of truth for backtest indicators and signals. The frontend adapter will normalize date strings, sort candles ascending, reject non-finite OHLC values, preserve missing volume as `null`, and map indicator series to a stable overlay/pane model. The chart component will only receive normalized props and will not call an API route.

Minimum normalized objects:

```ts
type ChartCandle = { time: string; open: number; high: number; low: number; close: number; volume: number | null };
type ChartIndicator = { id: string; label: string; pane: "price" | "indicator"; color?: string; values: Array<{ time: string; value: number | null }> };
type ChartMarker = { id: string; time: string; position: "aboveBar" | "belowBar"; color: string; shape: "arrowUp" | "arrowDown"; text: string; tradeId?: string | number };
```

## UI notes

- The main research page remains the single workflow surface; do not create a generic dashboard replacement.
- Keep stock/data readiness near the form, make the single primary run action obvious, and keep the historical/research-only notice visible.
- Prefer open chart/workspace regions and compact controls over nested card stacks.
- Loading, no local data, import in progress, backend failure, invalid parameters, zero trades, and successful result states must all be explicit.
- Preserve responsive behavior at desktop and approximately 390 × 844 mobile widths.

## Testing checklist

- Backend: volume preservation, candle ordering/validity, enriched signal/marker fields, custom backtest response compatibility, no-trade behavior, and existing full suite.
- Frontend: adapter sorting/timestamp conversion/invalid candle handling/missing volume/indicator mapping/trade-marker mapping; TypeScript build and lint.
- Rendered workflow: symbol search, availability, missing data, loaded candles, indicators, backtest signals, trade selection, equity/drawdown, API error, and mobile layout.

## Final handover notes

Document the reusable chart prop contract, backend-to-chart data flow, indicator extension path, strategy-field extension path, commands to run the app/tests, supported daily NSE limitations, and the simulation-only boundary after implementation is verified.
