# Backtrack Frontend Architecture & Webpage Reference Handover

**Last Updated**: 2026-07-22  
**Framework**: Next.js 16.2.10 (App Router, Turbopack)  
**Styling**: TailwindCSS 4 + Custom Design Tokens in `globals.css`  
**Icons**: Lucide React  

---

## 1. Directory Structure Overview

```text
frontend/
├── src/
│   ├── app/                                 # Next.js App Router Page Routes
│   │   ├── layout.tsx                       # Root Layout (Sidebar + Main Viewport)
│   │   ├── globals.css                      # Global Design Tokens & Theme System
│   │   ├── page.tsx                         # 00 / Dashboard (Main Workspace & Swarm Demo)
│   │   ├── replay/
│   │   │   └── page.tsx                     # 04 / Chart Replay Workspace
│   │   ├── research/
│   │   │   └── page.tsx                     # 01 / Research Workspace (Hypothesis to DSL)
│   │   ├── strategy/
│   │   │   └── page.tsx                     # 02 / Strategy Lab (Visual AST Builder)
│   │   ├── backtests/
│   │   │   ├── page.tsx                     # 04 / Backtest History (Run Blotter)
│   │   │   └── [id]/
│   │   │       └── page.tsx                 # Backtest Detail View (Equity/Drawdown/Trades)
│   │   ├── comparison/
│   │   │   └── page.tsx                     # 03 / Experiment Matrix (Cross-sectional Analysis)
│   │   ├── robustness/
│   │   │   └── page.tsx                     # 05 / Robustness Suite (Monte Carlo & Heatmap)
│   │   ├── bias-validity/
│   │   │   └── page.tsx                     # 08 / Risk Engine (Validity Auditor)
│   │   ├── strategy-import/
│   │   │   └── page.tsx                     # 06 / YouTube Strategy Import & AI Extractor
│   │   ├── options/
│   │   │   └── page.tsx                     # 07 / Options Lab (Payoff Visualizer)
│   │   ├── data/
│   │   │   └── page.tsx                     # 04 / Data & Providers (Watchlist & WS Health)
│   │   └── settings/
│   │       └── page.tsx                     # 09 / Settings (Execution & Credentials)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx                  # Navigation Sidebar (Title Case, Active Pills)
│   │   │   └── TopBar.tsx                   # Sticky Header (Dynamic Breadcrumbs, Search, Actions)
│   │   ├── ui/
│   │   │   ├── Button.tsx                   # Centralized Button Component (5 Variants, 4 Sizes)
│   │   │   ├── Cards.tsx                    # Standardized Metric & Surface Cards
│   │   │   └── Badges.tsx                   # Semantic Status & Risk Badges
│   │   └── charts/
│   │       └── Charts.tsx                   # SVG Equity & Drawdown Area Charts
│   └── lib/
│       ├── utils.ts                         # Formatting Helpers (INR, %, className merger)
│       ├── mock-data.ts                     # Fallback Datasets & Benchmarks
│       ├── agents/                          # 5-Agent Local Swarm Orchestrator
│       │   ├── orchestrator.ts
│       │   ├── market-data-agent.ts
│       │   ├── signal-engine-agent.ts
│       │   ├── backtest-runner-agent.ts
│       │   ├── risk-analyst-agent.ts
│       │   └── ux-narrator-agent.ts
│       └── replay/                          # Replay Engine Client
│           ├── api.ts                       # Fetch client for /api/v1/replay
│           └── types.ts                     # TypeScript definitions for Replay
```

---

## 2. Canonical Layout Design System

Every webpage implements the **Google Light Theme Design System**:
- **Canvas Background**: `#FAFAFA`
- **Surface Cards**: `#FFFFFF` with slate border `#E2E8F0`, subtle shadow (`shadow-xs`), and rounded corners (`rounded-xl`).
- **Primary Color**: `#4F46E5` (Indigo-600) for main CTAs and active states.
- **Semantic Colors**: Emerald (`#059669` gain), Rose (`#E11D48` loss), Amber (`#D97706` warning), Sky (`#0284C7` info).

### Standard Outer Page Shell Pattern
```tsx
<div className="backtrack-page">
  <TopBar />
  <div className="backtrack-content space-y-6">
    <section className="bt-heading-row">
      <div>
        <div className="bt-kicker"><span className="live-dot" /> [SECTION INDEX / CATEGORY]</div>
        <h1>[Main Page Title]</h1>
        <p>[Subtext Description]</p>
      </div>
      <div className="bt-heading-actions">
        <span className="data-source"><Icon size={14} /> [Status Badge]</span>
        [CTA Button]
      </div>
    </section>

    {/* Content Grid */}
  </div>
</div>
```

---

## 3. Webpage-by-Webpage Code & Functionality Breakdown

### 1. Dashboard (`frontend/src/app/page.tsx`)
- **Purpose**: Main quantitative research workspace and 5-agent swarm orchestrator demo.
- **Key Features**:
  - **Setup Controls**: Instrument select (NIFTY 50, BANKNIFTY, RELIANCE, TCS, INFY), strategy select, timeframe select, date range, initial capital, quick-start preset buttons.
  - **Swarm Execution Panel**: Real-time status list of 5 specialized agents (Market Data Adapter, Signal Engine, Backtest Runner, Risk Analyst, UX Narrator).
  - **Metric Tiles**: Net Return (`+21.6%`), Win Rate (`62.4%`), Max Drawdown (`-11.7%`), vs. Buy & Hold (`+7.4%`).
  - **Equity Curve SVG Chart**: Dual-line strategy vs. benchmark comparison chart.
  - **Trade Blotter Table**: Recent trade log with entry/exit timestamps, side, and P&L.
  - **AI Insight Callout**: Summary explanation generated by the UX Narrator agent.

---

### 2. Chart Replay Workspace (`frontend/src/app/replay/page.tsx`)
- **Purpose**: Bar-by-bar historical market execution replay with an anti-hindsight server cursor.
- **Key Features**:
  - **Playback Toolbar**: `Play`/`Pause` automated timer loop, `Step +1 Candle`, speed selectors (`0.5x`, `1x`, `2x`, `5x`), `Finish Session` CTA, and current candle cursor counter.
  - **Interactive Candlestick SVG Chart**: Renders revealed OHLC bars with volume, grid lines, and entry/exit trade markers.
  - **Order Ticket**: Long / Short toggle, Quantity input, Stop Loss (SL) and Take Profit (TP) fields, Place Market Order CTA.
  - **Live Session Metrics Bar**: Equity, Cash, Realized P&L, Unrealized P&L, Win Rate.
  - **Execution Journal & Open Positions Blotter**: Live event log and position list with one-click market close controls.

---

### 3. Research Workspace (`frontend/src/app/research/page.tsx`)
- **Purpose**: Translates natural language trading hypotheses into deterministic, compiled strategy DSL code.
- **Key Features**:
  - **Hypothesis Prompt Box**: Textarea for free-form hypothesis descriptions, quick-select example hypothesis pills, Parse CTA.
  - **Swarm Pipeline Grid**: 8-stage progress tracker showing agent status (`complete`, `running`, `pending`).
  - **Extracted Strategy DSL**: Syntax-highlighted JSON code block presenting the extracted indicators, entry/exit rules, and position sizing parameters.
  - **Agent Clarification Chat**: Interactive AI chat box for parameter adjustments and final handoff to the backtest runner.

---

### 4. Strategy Lab (`frontend/src/app/strategy/page.tsx`)
- **Purpose**: Visual Abstract Syntax Tree (AST) strategy builder and rule compiler.
- **Key Features**:
  - **Template Library**: Pre-built strategy templates (RSI Momentum, MACD Crossover, Bollinger Reversion, ATR Breakout) with Sharpe scores.
  - **Strategy Configurator**: Inputs for Strategy Name, Universe, Timeframe, Date Range, Capital, and Trade Direction.
  - **Indicator Accordion**: Manage indicator instances (RSI, EMA, SMA, MACD) with parameter inputs and delete controls.
  - **AST Condition Editor**: Visual AST node chips (`operator`, `indicator`, `comparison`, `literal`) for entry and exit logic.
  - **Validation & Execution Guarantee Panel**: Real-time validation checks (`PASS`), estimated data points, and Compile & Run CTA.

---

### 5. Backtest History (`frontend/src/app/backtests/page.tsx`)
- **Purpose**: Filterable blotter of all historical backtest execution runs.
- **Key Features**:
  - **Search & Filter Bar**: Search by Run ID or Strategy Name, status tabs (`All`, `COMPLETED`, `RUNNING`, `FAILED`), sort dropdown (Date, Sharpe, CAGR, Max DD).
  - **Runs Table**: Columns for Checkbox select, Run ID, Strategy Name, Symbol, Period, Net Return, Sharpe Ratio, Max Drawdown, Win Rate, Status Badge, and View Detail action links.

---

### 6. Backtest Detail View (`frontend/src/app/backtests/[id]/page.tsx`)
- **Purpose**: In-depth diagnostic report for a specific backtest execution run.
- **Key Features**:
  - **Run Summary Header**: Run ID, strategy parameters, execution timing guarantee tag, export report CTA.
  - **KPI Cards**: Net Return, Sharpe Ratio, Max Drawdown, Win Rate, Profit Factor, Total Trades.
  - **Tabbed Views**:
    1. *Equity Curve*: Full-resolution interactive SVG equity chart vs. benchmark.
    2. *Drawdown*: Peak-to-trough drawdown depth area chart.
    3. *Trades*: Filterable trade blotter with entry/exit prices, holding period, and P&L.
    4. *Bias Detection*: Audit checks for lookahead leakage, data quality, and slippage assumptions.

---

### 7. Experiment Matrix (`frontend/src/app/comparison/page.tsx`)
- **Purpose**: Cross-sectional comparative matrix for multi-parameter strategy variants.
- **Key Features**:
  - **Baseline Selector**: Choose baseline run (`EXP-9900`).
  - **Aggregate Highlight Tiles**: Highest Return (`24.2% CAGR`), Best Sharpe (`2.14`), Lowest Drawdown (`-8.4%`), Valid Runs count (`32`).
  - **Comparison Matrix Table**: Side-by-side metric table showing variance deltas against baseline (e.g. `+5.7%` CAGR, `+0.17` Sharpe).

---

### 8. Robustness Suite (`frontend/src/app/robustness/page.tsx`)
- **Purpose**: Strategy stability diagnostics across parameter space and market stress conditions.
- **Key Features**:
  - **Aggregate Robustness Score Gauge**: Overall score (`78/100`) with breakdown into Parameter Stability, OOS Degradation, and Stress Resilience.
  - **Parameter Sensitivity Heatmap**: 10x4 grid showing Sharpe ratio variation across Lookback vs. Threshold parameter combinations.
  - **Stress Testing Table**: Evaluates performance under doubled transaction costs, increased slippage, and execution delays.

---

### 9. Risk & Validity Engine (`frontend/src/app/bias-validity/page.tsx`)
- **Purpose**: Automated audit for quantitative vulnerabilities, lookahead bias, and overfitting risks.
- **Key Features**:
  - **Health Score Gauge**: Overall validity score (`92/100`).
  - **Audit Check Cards**: Detailed cards for Lookahead Bias, Parameter Overfitting, Survivor Bias, and Transaction Cost Realism with PASS/WARN statuses.
  - **Trade Sample Health Distribution**: Histogram showing trade count sufficiency and statistical significance.

---

### 10. YouTube Strategy Import (`frontend/src/app/strategy-import/page.tsx`)
- **Purpose**: Extract reviewable strategy rules from YouTube trading video links or transcripts using AI.
- **Key Features**:
  - **Source Input Form**: Video URL input, optional transcript/notes textarea, Extract Strategy CTA.
  - **Extracted Draft Card**: Confidence score meter, extracted indicator chips, categorized Rule Blocks (Entry, Exit, Risk).
  - **Reviewable Assumptions Panel**: Highlights missing parameters or ambiguous rules requiring human review before backtesting.

---

### 11. Options Lab (`frontend/src/app/options/page.tsx`)
- **Purpose**: Educational options payoff visualizer and contract calculator tailored for Indian indices.
- **Key Features**:
  - **Strategy Selector**: Long Call vs. Long Put tabs.
  - **Position Setup Card**: Inputs for Spot Price, Strike Price, Premium, and Lot Size.
  - **Expiry Payoff SVG Chart**: Live updated profit/loss line across underlying prices.
  - **Option Metrics**: Max Profit, Max Loss, Breakeven price calculation.
  - **Educational Terms Grid**: Explanations of Strike, Premium, and Breakeven.

---

### 12. Data & Providers (`frontend/src/app/data/page.tsx`)
- **Purpose**: Real-time provider health status and market quote snapshot watchlist.
- **Key Features**:
  - **Historical Provider Panel**: Keyless Yahoo Finance historical-data status with no account or paid credential requirement.
  - **Free-data Caveats**: Clear timeframe and availability limits; no WebSocket, broker, or live-order controls.
  - **NSE Watchlist Table**: Live quote snapshot table showing last price, change %, and feed status (`LIVE` / `DELAYED`).

---

### 13. Settings (`frontend/src/app/settings/page.tsx`)
- **Purpose**: Application execution settings and backend credential status.
- **Key Features**:
  - **Research Defaults Panel**: Provider priority selector, Execution model selector (Next bar open vs Same bar close), Default commission input.
  - **Risk Guardrails Panel**: Max risk per trade %, Lookahead warning toggle, OOS split toggle.
  - **Backtest-only Status**: Confirms that no broker credential or paid market-data key is required.

---

## 4. Key Shared Components

1. **[`Sidebar.tsx`](file:///Users/arjeetanand/Library/CloudStorage/OneDrive-OracleCorporation/projects/backtrack/frontend/src/components/layout/Sidebar.tsx)**: Navigation sidebar featuring Title Case font-sans menu items, active indigo pill highlights (`bg-indigo-50 text-indigo-600 font-semibold`), brand header, and live backend connection badge.
2. **[`TopBar.tsx`](file:///Users/arjeetanand/Library/CloudStorage/OneDrive-OracleCorporation/projects/backtrack/frontend/src/components/layout/TopBar.tsx)**: Sticky header rendering dynamic breadcrumb page titles (e.g. `Overview / Dashboard`), global search bar, branch topology icon, notifications bell, and export CTA.
3. **[`Button.tsx`](file:///Users/arjeetanand/Library/CloudStorage/OneDrive-OracleCorporation/projects/backtrack/frontend/src/components/ui/Button.tsx)**: Centralized Google-style button component supporting 5 variants (`primary`, `secondary`, `ghost`, `danger`, `success`) and 4 sizes (`xs`, `sm`, `md`, `lg`) with loading spinner and icon slots.
4. **[`Cards.tsx`](file:///Users/arjeetanand/Library/CloudStorage/OneDrive-OracleCorporation/projects/backtrack/frontend/src/components/ui/Cards.tsx)**: Standardized metric cards (`MetricCard`) and container panels (`GlassCard`).
