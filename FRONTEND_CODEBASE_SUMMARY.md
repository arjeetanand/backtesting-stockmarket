# Backtrack frontend codebase summary

Last reviewed: 2026-07-22

The frontend is a Next.js App Router application using React, TypeScript, Tailwind CSS 4, custom CSS tokens, and Lucide icons. It is a real-data research UI; the previous mock-data module has been removed.

## Structure

```text
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Sidebar shell and metadata
│   │   ├── globals.css                # Shared tokens, components, responsive CSS
│   │   ├── page.tsx                   # Home workflow launcher
│   │   ├── data/page.tsx              # NSE catalogue/import/inventory
│   │   ├── research/page.tsx          # Hypothesis, Ollama, data preparation
│   │   ├── strategy/page.tsx          # Strategy/rule builder
│   │   ├── strategy-import/page.tsx   # YouTube strategy draft
│   │   ├── backtests/page.tsx         # Saved run list
│   │   ├── backtests/[id]/page.tsx    # Saved run detail
│   │   ├── comparison/page.tsx        # Compare tests
│   │   ├── robustness/page.tsx       # Reliability analysis
│   │   ├── bias-validity/page.tsx     # Risk/validity audit
│   │   ├── replay/page.tsx            # Historical candle replay
│   │   ├── analytics/page.tsx         # Performance analytics
│   │   ├── options/page.tsx           # Educational payoff calculator
│   │   └── settings/page.tsx          # Local configuration display
│   ├── components/
│   │   ├── layout/                    # Sidebar and TopBar
│   │   ├── charts/                    # Shared chart components
│   │   ├── data/                      # Symbol search/combobox
│   │   └── ui/                        # Buttons, cards, badges
│   └── lib/
│       ├── api.ts                     # Shared API helpers
│       ├── backtest-api.ts            # Backtest client
│       ├── market-data.ts             # Market-data client
│       ├── replay/                    # Replay client and types
│       ├── robustness-api.ts          # Robustness client
│       └── agents/                    # In-process five-agent swarm
├── package.json
├── next.config.ts
└── tsconfig.json
```

## Page contracts

| Route | Primary API/data contract |
| --- | --- |
| `/` | Uses `/backtests` for recent saved tests and builds Research/Replay URLs from selected symbol/dates |
| `/data` | Uses `/data/cache`, `/data/inventory`, `/data/instruments`, `/data/instruments/refresh`, `/data/nse-import/preview`, `/data/nse-import`, and import status |
| `/research` | Uses `/research/hypothesis`, `/research/ensure-data`, `/backtests/sma-crossover`, and persisted artifact/session state |
| `/strategy` | Builds configurable rule requests for the custom backtest route |
| `/strategy-import` | Sends URL/transcript to `/strategy/youtube`; displays a reviewable draft |
| `/backtests` | Reads `/backtests` and links to `/backtests/[id]` |
| `/backtests/[id]` | Reads `/backtests/{run_id}` and renders metrics/trades/curves/audit context |
| `/comparison` | Uses local availability and comparison/backtest data; no fabricated result rows are presented |
| `/robustness` | Calls `/robustness/analyze` and renders saved/returned diagnostics |
| `/bias-validity` | Calls `/bias-validity/audit` and renders validity checks |
| `/replay` | Uses `/replay/sessions`, session read, step, orders, close, and finish |
| `/options` | Purely local educational calculator; no market-data or order endpoint |
| `/analytics` | Reads available run/analytics data and shows empty states when no runs exist |
| `/settings` | Displays local API/data/Ollama configuration; never asks for broker credentials |

## UI behavior standards

Every data-connected page should preserve:

- loading state while the API request is pending;
- explicit empty state when no local history/runs exist;
- actionable error state when the backend or free data source is unavailable;
- success/progress state for long-running imports;
- no claim of live data when the source is historical;
- responsive layout without horizontal overflow at approximately 390px width;
- accessible labels and visible focus state for interactive controls.

## Shared styling

`globals.css` owns the light design system:

- canvas: `#FAFAFA`;
- surface: `#FFFFFF`;
- primary: indigo `#4F46E5`;
- gain: emerald `#059669`;
- loss: rose `#E11D48`;
- warning: amber `#D97706`;
- typography: Inter, Space Grotesk, JetBrains Mono.

Use existing `bt-*` primitives before adding page-specific styles. Keep repeated cards, fields, tables, panels, buttons, and status states visually consistent.

## Persistence and browser state

- Research stores its active session under `backtrack:research-session`.
- Replay stores its server session ID under `backtrack:replay-session`.
- Computed backtests, artifacts, import jobs, and replay sessions are persisted by the backend SQLite artifact/run stores.
- The browser does not contain secrets and does not execute broker orders.

## Five-agent frontend swarm

The modules under `src/lib/agents/` are deterministic in-process collaborators:

1. `market-data-agent.ts` — data input/availability state.
2. `signal-engine-agent.ts` — signal/rule interpretation.
3. `backtest-runner-agent.ts` — simulation coordination.
4. `risk-analyst-agent.ts` — drawdown/validity explanation.
5. `ux-narrator-agent.ts` — trader-readable narrative/status.

`orchestrator.ts` exposes the sequence and progress. They are not remote workers or independent paid agents.

## Frontend validation

From the repository root:

```bash
npm --prefix frontend run build -- --webpack
```

For a rendered change, also verify the route, no framework overlay, no console error, primary interaction, loading/error/empty states, desktop layout, and a mobile-sized viewport. The in-app Browser may be unavailable in restricted environments; record that limitation instead of claiming screenshot validation.
