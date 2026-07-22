# Backtrack

Backtrack is a free, backtest-only workspace for Indian-market research. It loads historical OHLCV data, validates it, runs reproducible strategy simulations, supports manual chart replay with simulated trades, and explains risk. It does not connect to a broker, receive live trading data, or place real orders.

## What is free

- No account, Client ID, access token, paid API key, subscription, or broker connection.
- Keyless Yahoo Finance historical data for research backtests.
- A persistent local SQLite cache; repeated backtests read cached candles before making an external request.
- A one-time official NSE Common Bhavcopy importer for the Sensex/banking/sector-ETF starter universe.
- NSE mapping: `RELIANCE → RELIANCE.NS`, `TCS → TCS.NS`, `NIFTY 50 → ^NSEI`, and `BANKNIFTY → ^NSEBANK`.
- Historical strategy backtests, manual replay, simulated orders, trade journal, risk metrics, options education, and YouTube strategy drafts.

Free data is best-effort and not an exchange-grade feed. It can be delayed, incomplete, rate-limited, or limited for intraday history. Use it for learning and research; validate important conclusions before risking money.

## Bulk historical download

Open **Data & Providers**, choose a date range, and select **Download Selected Year**. The app queues a local import of NSE's daily Common Bhavcopy files for the built-in Sensex, major-bank, and sector-ETF universe. It stores daily candles in `data/market_cache.sqlite3`; future daily backtests for imported symbols read that cache first.

This is deliberately separate from mutual-fund NAVs: AMFI's official history download is limited to 90 days per request. The current bulk importer covers NSE-traded equities and ETFs, not every mutual-fund scheme or intraday data.

## Quick start

```bash
python3.12 -m venv venv
source venv/bin/activate
python -m pip install -e ".[dev]"

cd frontend
npm install
cd ..

cp .env.example .env
```

Run the backend:

```bash
source venv/bin/activate
uvicorn quant_research.api.main:app --reload --port 8000
```

Run the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

Open the UI at `http://localhost:3000` and API documentation at `http://localhost:8000/docs`.

## How backtesting works

```text
Choose symbol, timeframe, period, capital, fees, and slippage
        ↓
Fetch keyless historical OHLCV candles
        ↓
Validate timestamps, gaps, duplicates, and OHLC relationships
        ↓
Run reviewed strategy rules without look-ahead
        ↓
Apply documented simulated fills and costs
        ↓
Inspect trades, equity, drawdown, win rate, and caveats
```

Manual replay uses simulated orders inside the application only. They are never sent to a broker.

## Main API routes

| Route | Purpose |
| --- | --- |
| `GET /api/v1/health` | Service and keyless-provider status. |
| `GET /api/v1/providers` | Shows the free historical-data source. |
| `GET /api/v1/data/cache` | Shows the local historical-cache coverage. |
| `POST /api/v1/data/nse-import` | Queues a one-time official NSE daily-data import. |
| `GET /api/v1/data/nse-import/{job_id}` | Shows import progress/result. |
| `GET /api/v1/market-data` | Validated historical OHLCV bars. |
| `POST /api/v1/backtests/sma-crossover` | Long-only SMA crossover simulation. |
| `POST /api/v1/backtests/custom` | Vectorized multi-indicator demo simulation. |
| `POST /api/v1/robustness/analyze` | Parameter robustness analysis. |
| `POST /api/v1/bias-validity/audit` | Look-ahead/validity review. |
| `POST /api/v1/strategy/youtube` | Reviewable rules from a YouTube URL and optional transcript. |
| `POST /api/v1/replay/sessions` | Creates a simulated historical replay session. |
| `POST /api/v1/replay/sessions/{id}/step` | Reveals the next simulated candle(s). |
| `POST /api/v1/replay/sessions/{id}/orders` | Creates a simulated replay order only. |
| `POST /api/v1/replay/sessions/{id}/finish` | Finishes the simulated replay session. |

Example real historical request, with no key:

```bash
curl -G -fsS http://127.0.0.1:8000/api/v1/market-data \
  --data-urlencode 'symbol=RELIANCE' \
  --data-urlencode 'timeframe=1day' \
  --data-urlencode 'start=2023-01-01T00:00:00Z' \
  --data-urlencode 'end=2024-12-31T00:00:00Z'
```

## Current limits

- Historical data is fetched from a free external research source; availability and depth are not guaranteed.
- Intraday history is more restricted than daily history.
- Replay sessions and completed runs are in-memory and reset when FastAPI restarts.
- The replay engine is simulated; it does not use live prices or a broker.
- Options Lab is educational and does not model full IV, Greeks, margin, taxes, brokerage, or settlement.
- A backtest return is not a prediction or financial recommendation.

## Repository map

```text
frontend/                          # Next.js trader UI
src/quant_research/api/            # FastAPI routes and settings
src/quant_research/data_providers/ # Keyless Yahoo Finance adapter
src/quant_research/services/       # Research, backtest, replay, YouTube extraction
src/quant_research/domain/         # Validation, indicators, analytics, execution models
tests/                             # Unit and replay tests
```

For implementation ownership use [handover.md](handover.md). For release checks use [TESTING.md](TESTING.md). For chart replay architecture use [REPLAY_IMPLEMENTATION_PLAN.md](REPLAY_IMPLEMENTATION_PLAN.md).
