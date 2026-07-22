# Backtrack testing and release contract

Last reviewed: 2026-07-22

This document defines how each agent proves that a change is safe to hand over. A passing build alone is not enough: data correctness, execution assumptions, error behavior, risk language, and rendered UI must also be checked.

## 1. Test layers

```text
Unit tests
  ↓
Static checks and type checks
  ↓
API smoke tests
  ↓
Production frontend build
  ↓
Browser interaction and responsive checks
  ↓
Human release review
```

Run lower-cost checks first. A provider change must not proceed to browser QA if the provider adapter or data validation tests fail.

## 2. Backend setup

```bash
source venv/bin/activate
python -m pip install -e ".[dev]"
```

The test suite is configured by `pyproject.toml` with `tests/` as the test path and `src/` on the Python path.

## 3. Required automated commands

From the repository root:

```bash
venv/bin/pytest -q
venv/bin/ruff check src tests
venv/bin/mypy src
```

From `frontend/`:

```bash
npm install
npm run lint
npm run build -- --webpack
```

Expected current baseline:

- Python unit tests pass.
- Ruff reports no errors.
- mypy reports no issues in `src`.
- Next.js compiles, type-checks, prerenders static routes, and completes production build.
- Frontend lint exits successfully; it currently reports 14 pre-existing warnings in older placeholder/legacy routes. New warnings should be fixed before handoff and the warning count must not increase.

## 4. Test ownership by agent

| Agent | Minimum evidence |
| --- | --- |
| Product surfaces | Route renders, primary control works, desktop/mobile visual check, lint/build pass. |
| Market-data backend | Fake HTTP payload test, invalid/error payload test, provider selection test, no-secret response check. |
| Test/release steward | Full command suite, regression test, API smoke evidence, release checklist update. |
| Strategy import | Valid/invalid URL tests, transcript extraction fixture, low-confidence/no-transcript behavior, human-review copy check. |
| Education/risk UX | Formula/metric check, disclaimer/assumption visibility, payoff interaction, responsive check. |

## 5. Backend unit-test requirements

### Provider adapters

Use fake openers or fixtures. Unit tests must not call Yahoo Finance, YouTube, or Ollama over the network.

Verify:

- request path, method, headers, and payload shape;
- NSE symbol/ticker mapping;
- timeframe aliases and invalid timeframe rejection;
- timestamp normalization and chronological sorting;
- OHLCV numeric conversion;
- empty, malformed, timeout, HTTP-error, and provider-error responses;
- health/provider payloads state that historical data is keyless and broker-free.

### Market-data validation

Verify:

- start date is before end date;
- bars are sorted;
- duplicate timestamps and invalid OHLC relationships are detected;
- missing/invalid volume behavior is explicit;
- invalid provider data does not reach the backtest engine.

### Backtest engine

Verify:

- fast SMA is smaller than slow SMA;
- signals do not use future bars;
- fills occur on the next available bar according to the documented execution model;
- commission and slippage affect results;
- open/closed trades and equity points are internally consistent;
- no trades produces a safe metric representation;
- run IDs, strategy hashes, data hashes, warnings, and config are returned.

### YouTube extraction

Verify:

- YouTube URL validation;
- indicator detection from a supplied transcript;
- entry, exit, and risk rule extraction;
- no-transcript low-confidence behavior;
- assumptions explicitly mention human review;
- extraction never calls an order or backtest route automatically.

## 6. API smoke tests

Start the backend:

```bash
source venv/bin/activate
uvicorn quant_research.api.main:app --reload --port 8000
```

Health and provider configuration:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/providers
```

YouTube extraction with deterministic transcript input:

```bash
curl -fsS -X POST http://127.0.0.1:8000/api/v1/strategy/youtube \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=abc1234","transcript":"Buy when the 20 EMA crosses above the 50 EMA. Exit below the 20 EMA. Risk one percent with a stop loss."}'
```

Historical market data:

```bash
curl -fsS -G http://127.0.0.1:8000/api/v1/market-data \
  --data-urlencode 'symbol=RELIANCE' \
  --data-urlencode 'timeframe=1day' \
  --data-urlencode 'start=2023-01-01T00:00:00Z' \
  --data-urlencode 'end=2024-12-31T00:00:00Z'
```

SMA crossover backtest:

```bash
curl -fsS -X POST http://127.0.0.1:8000/api/v1/backtests/sma-crossover \
  -H 'content-type: application/json' \
  -d '{"symbol":"RELIANCE","start":"2023-01-01T00:00:00Z","end":"2024-12-31T00:00:00Z","timeframe":"1day","fast_window":20,"slow_window":50,"initial_capital":100000,"commission":0.001,"slippage":0.0005}'
```

No credentials are required. When the free historical-data source is unavailable, `/market-data` and `/backtests/sma-crossover` must return an explicit upstream error; the backend must never fabricate market history.

## 7. Browser acceptance matrix

Start the frontend after starting the backend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` and check:

| Flow | Steps | Expected proof |
| --- | --- | --- |
| Dashboard backtest | Change Instrument to `BANKNIFTY`, Strategy to `MACD momentum`, select `Run backtest`. | Result heading changes, metrics/equity/trades/swarm remain visible. |
| Strategy Lab | Open `/strategy`, inspect setup, follow its backtest action. | Setup remains understandable and routes to the intended review/backtest surface. |
| YouTube Import | Open `/strategy-import`, paste a valid URL and transcript, extract. | Confidence, indicators, entry/exit/risk rules, assumptions, and review link appear. |
| Invalid YouTube URL | Submit a non-YouTube URL. | Clear validation error; no result is presented as verified. |
| Options Lab | Open `/options`, switch `Long call` to `Long put`, change premium. | Payoff title, chart, max loss, and breakeven update. |
| Free Historical Data | Open `/data`, inspect symbol mapping and use connection check. | No paid provider or credential prompt appears; free-data limits are visible. |
| Analytics | Open `/analytics`. | KPI cards, monthly curve, regime breakdown, and trade-quality table render. |
| Settings | Open `/settings`, change a setting, save. | Saved-state feedback appears and no secret is displayed. |
| Error state | Stop backend and use a backend-connected control. | Loading/error state is clear; UI does not claim live data succeeded. |
| Responsive | Set viewport around `390 × 844`. | Main content remains readable and `scrollWidth` does not exceed the viewport. |

### Replay MVP acceptance (for the next implementation phase)

| Area | Acceptance test |
| --- | --- |
| Session setup | Select Indian symbol, timeframe, date range, replay start, capital, risk, commission, slippage, and timezone. |
| Anti-hindsight | Manual replay receives only bars through the server cursor; future bars are not present in the response or browser state. |
| Replay controls | Play, pause, step, restart, speed, and go-to-date advance the same server-authoritative cursor. |
| Manual execution | Place, modify, partially close, and close a simulated position from the chart. |
| Fills | Market, limit, stop, stop-loss, and target fills follow documented OHLC and gap rules. |
| Journal | Every order, fill, adjustment, note, and event has a timestamp and session ID. |
| Finish | Replay and automated modes use the same metrics and normalized trade model. |
| Safety | No replay route can call a broker order-placement API; live paper mode is visibly distinct. |

## 8. Render and console checks

For every non-trivial frontend change, verify:

- page title and URL are correct;
- first meaningful viewport is not blank;
- no Next.js/webpack error overlay is visible;
- no relevant browser console errors or warnings are introduced;
- no clipping, overlap, unreadable text, horizontal overflow, or broken focus state;
- the primary action changes observable UI state.

Capture one desktop and one mobile screenshot outside the repository when visual QA is needed. Redact symbols, account identifiers, tokens, or private data before sharing evidence.

## 9. Data-quality and trading-safety gates

- Historical bars are chronologically sorted.
- OHLC relationships and duplicate timestamps are validated.
- Look-ahead bias is not introduced.
- Execution convention is visible: current SMA engine fills on next-bar open.
- Commission, slippage, capital, and risk assumptions are visible or present in run config.
- Win rate is calculated from closed trades; an empty trade set is not reported as a misleading `0%` success claim.
- Drawdown is represented as a negative peak-to-trough value.
- Imported YouTube rules remain a draft until human review.
- Options output is labeled educational and does not imply a recommendation.
- No broker credential, order endpoint, or paid-provider prompt exists in the backtest workflow.

## 10. Failure triage

### Frontend cannot reach API

1. Confirm backend is running on port 8000.
2. Open `/api/v1/health` directly.
3. Confirm `CORS_ORIGINS` includes the frontend origin.
4. Confirm `frontend/.env.local` has the correct `NEXT_PUBLIC_API_BASE_URL` if overriding the default.
5. Restart Next.js after changing build-time environment variables.

### Free historical data is unavailable

1. Call `/api/v1/health` and `/api/v1/providers`.
2. Confirm the requested NSE symbol maps to a valid Yahoo ticker.
3. Retry later if the external free source is rate-limited or unavailable.
4. Never replace the response with fabricated market data.

### Provider returns malformed data

1. Save a redacted fixture locally.
2. Add a failing adapter test.
3. Update normalization only after confirming the provider’s current schema.
4. Re-run validator, backtest, and API tests.

### Backtest result looks implausibly good

Check:

- future values are not used in signal generation;
- entries/exits use the declared fill timing;
- adjusted/unadjusted prices are understood;
- corporate actions and survivorship assumptions are documented;
- commission, slippage, spread, and liquidity assumptions are not zeroed accidentally;
- strategy parameters were not optimized on the same period used for evaluation.

## 11. Release evidence template

```text
Date:
Branch/commit:
Agent/owner:
Changed files:
User-visible behavior:
Provider/API changes:
Commands run:
Automated results:
Browser routes checked:
Desktop/mobile evidence:
Known limitations:
Rollback or follow-up plan:
Reviewer:
```

## 12. Current baseline and remaining risk

The current baseline includes backend unit tests, provider parsing tests, YouTube extraction tests, Ruff, mypy, frontend lint/build, dashboard interaction QA, Options Lab interaction QA, YouTube import QA, console checks, and a 390px responsive overflow check. Frontend lint currently exits successfully with 14 documented legacy warnings; do not add to that count.

Remaining high-priority work before production or live-data scale:

- durable database-backed run storage;
- authentication and authorization;
- queued backtest jobs and persisted agent events;
- a resilient cache for free historical candles;
- complete options model for IV, Greeks, margin, taxes, brokerage, spreads, and expiry;
- strategy DSL compilation with explicit human approval;
- monitoring, rate limits, audit logs, secrets management, and backup/recovery.
