# Backtrack frontend

The frontend is a Next.js App Router application in `frontend/src`. It provides the trader-facing workspace and calls the FastAPI backend at `/api/v1`.

## Run locally

From the repository root:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open `http://localhost:3000`. Start the backend first on port `8000` for real data and backtests. Without it, the UI keeps explicit unavailable/error states and does not substitute mock prices.

Optional `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Home and simple workflow entry points |
| `/data` | Bulk NSE history download and local stock search |
| `/research` | Hypothesis review, data preparation, and backtest handoff |
| `/strategy` | Build indicator/rule strategies |
| `/strategy-import` | Import and review YouTube strategy rules |
| `/backtests` | Saved test history |
| `/backtests/[id]` | Detailed metrics and charts |
| `/replay` | Historical candle replay with simulated orders |
| `/comparison` | Compare saved tests |
| `/robustness` | Robustness and walk-forward analysis |
| `/bias-validity` | Bias and validity checks |
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

## Research chart workflow

`/research` is the main stock-to-results surface:

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

- `src/app/globals.css` — shared design system and responsive styles.
- `src/lib/api.ts` — timeout-aware API requests.
- `src/lib/backtest-api.ts` — backtest client and response types.
- `src/lib/market-data.ts` — local market-data client.
- `src/lib/chart-data.ts` — normalized financial-chart types and pure validation adapters.
- `src/lib/research-chart.ts` — market/backtest chart payload adapters.
- `src/lib/replay/` — replay API and state types.
- `src/lib/agents/` — deterministic five-agent in-process orchestration.
- `src/lib/strategy-library.ts` — known strategy definitions used by the UI.

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
```

When changing a rendered page, verify loading, empty, error, success, desktop, and narrow mobile states. Never use mock market prices as a fallback for a failed API request.
