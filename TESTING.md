# Backtrack testing and release contract

Last reviewed: 2026-07-22

This document defines the evidence required before handing a Backtrack change to another agent or user. A passing build is not enough: data correctness, persistence, API behavior, trader-facing wording, and rendered UI must also be considered.

## 1. Test layers

```text
Focused unit/regression test
        ↓
Ruff + Mypy
        ↓
Full backend pytest suite
        ↓
Frontend production build
        ↓
Manual/browser UI smoke check when available
        ↓
Release review
```

## 2. Required commands

From the repository root:

```bash
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run ruff check src tests
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run mypy src
env UV_CACHE_DIR=/tmp/backtrack-uv-cache uv run pytest -q
git diff --check
npm --prefix frontend run build -- --webpack
```

The tests use fake providers, fake Ollama payloads, and local temporary SQLite files. They must not require NSE, Yahoo, YouTube, or Ollama network access.

## 3. Backend setup

```bash
python3.12 -m venv venv
source venv/bin/activate
python -m pip install -e ".[dev]"
```

Run the API for manual smoke tests:

```bash
uvicorn quant_research.api.main:app --reload --port 8000
```

## 4. Market-data and archive tests

Every change to the importer or market cache must cover:

- legacy and current NSE Bhavcopy column names;
- valid OHLCV conversion and invalid-row skipping;
- one ZIP download per weekday;
- original ZIP saved under `NSE_ARCHIVE_PATH`;
- a saved ZIP loaded locally without another network call;
- every raw archive row persisted to `nse_bhavcopy_rows`;
- supported EQ/BE/ETF rows persisted to `ohlcv_bars`;
- archive-day coverage reused for a different stock request;
- symbol/timeframe/timestamp upsert behavior;
- exact weekday coverage preview;
- complete-overlap import rejected with HTTP `409`;
- holidays/404 archive dates reported as skipped;
- missing local history produces an actionable import message;
- no fallback to fabricated or live-looking data.

The key regression is in `tests/unit/test_nse_import.py`: it creates a local ZIP, prevents `_download_day` from running, and verifies full-row/candle persistence and archive reuse.

## 5. Backtest and calculation tests

Verify:

- start date precedes end date;
- fast SMA is smaller than slow SMA;
- signals do not use future bars;
- entries and exits follow the documented next-bar execution convention;
- commission and slippage affect results;
- equity, trades, return, drawdown, and win rate agree;
- no-trade results are safe and not presented as a misleading success claim;
- custom rule and DSL parameters are validated;
- deterministic cache keys return saved identical results;
- robustness and validity reports are based on the same local bars.

## 6. Persistence tests

Verify that data survives service-object recreation using a temporary SQLite path:

- backtest results can be saved and read by run ID;
- identical backtests can reuse deterministic cached results;
- hypotheses, custom results, robustness reports, YouTube results, and import jobs are stored as artifacts;
- replay sessions, orders, events, cursor, and revealed bars reload after recreation;
- research localStorage restores the active session;
- replay localStorage restores the saved session ID;
- no secrets or broker credentials are persisted.

## 7. Research, Ollama, and YouTube tests

### Ollama

- fake JSON response is parsed into a constrained hypothesis;
- Markdown-wrapped JSON is accepted;
- invalid JSON is rejected clearly;
- empty response, timeout, HTTP error, and unavailable server are explicit errors;
- model name and base URL come from environment settings;
- model output is labeled reviewable and never treated as an order.

### YouTube strategy import

- valid YouTube URLs are accepted;
- non-YouTube URLs are rejected;
- pasted transcripts deterministically identify indicators and rule sentences;
- caption metadata can be parsed when available;
- no transcript produces low confidence and an instruction to paste notes/install `yt-dlp`;
- missing entry, exit, or risk rules remain visible as review gaps;
- extraction never automatically runs a backtest or order.

## 8. API smoke tests

Health and provider state:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/providers
curl -fsS http://127.0.0.1:8000/api/v1/data/cache
```

Search local catalogue/inventory:

```bash
curl -fsS 'http://127.0.0.1:8000/api/v1/data/instruments?query=RELIANCE'
curl -fsS 'http://127.0.0.1:8000/api/v1/data/inventory?query=RELIANCE&start=2025-01-01&end=2025-12-31'
```

Preview an import:

```bash
curl -fsS -X POST http://127.0.0.1:8000/api/v1/data/nse-import/preview \
  -H 'content-type: application/json' \
  -d '{"start":"2025-01-01","end":"2025-12-31","preset":"custom","symbols":["RELIANCE"]}'
```

YouTube extraction with deterministic transcript input:

```bash
curl -fsS -X POST http://127.0.0.1:8000/api/v1/strategy/youtube \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=abc1234","transcript":"Buy when the 20 EMA crosses above the 50 EMA. Exit below the 20 EMA. Risk one percent with a stop loss."}'
```

## 9. Frontend smoke matrix

Start the frontend after starting the API:

```bash
cd frontend
npm run dev
```

| Flow | Expected result |
| --- | --- |
| Home → Test a strategy | Selected symbol and dates are carried to Research |
| Home → Replay a chart | Selected symbol and dates are carried to Replay |
| Data → Refresh stock list | Official catalogue is saved and searchable |
| Data → Check database | Cached days, missing days, stored bars, and import plan appear |
| Data → Import this stock | One job starts; progress shows archive/candle/raw-row counts |
| Data → repeat same range | Clear already-available/overlap message; no duplicate job |
| Research → Parse hypothesis | Ollama result is reviewable; no order is placed |
| Research → missing history | NSE preparation job runs and returns to backtest readiness |
| Strategy Import → transcript | Entry, exit, risk, confidence, assumptions, and review gaps appear |
| My tests → open result | Persisted backtest details render from SQLite-backed API |
| Replay → Start/Step/order/finish | Historical candles reveal progressively and orders remain simulated |
| Options → change inputs | Payoff, max loss, and breakeven update locally |
| Backend unavailable | UI shows a clear error, not fake success or fake prices |

For visual changes, check the first viewport on desktop and around `390 × 844` mobile. Look for clipping, horizontal overflow, unclear loading states, broken focus, and text that implies real-time data.

## 10. API error contract

- `422`: invalid date, symbol, timeframe, or strategy parameters.
- `404`: unknown run, job, or replay session.
- `409`: requested NSE range is already fully available.
- `502`: upstream NSE, YouTube, or Ollama failure.
- `503`: required local provider/service is unavailable.

Errors must be actionable and must not be replaced with fabricated market data.

## 11. Safety and data-quality gates

- Historical bars are chronologically sorted and validated.
- OHLC relationships and duplicate timestamps are checked.
- Raw NSE fields are retained without claiming they are all modeled by the engine.
- Look-ahead bias is not introduced.
- Fill timing, capital, commission, and slippage are visible in the run contract.
- Drawdown is represented as a negative peak-to-trough value.
- YouTube rules remain drafts until human review.
- Options content is labeled educational.
- Replay has no broker route.
- `.env`, SQLite files, archive ZIPs, account data, and tokens are not committed.

## 12. Release checklist

- [ ] Focused regression test added for every provider/import/calculation bug.
- [ ] Ruff passes.
- [ ] Mypy passes.
- [ ] Full pytest suite passes.
- [ ] `git diff --check` passes.
- [ ] Frontend production build passes.
- [ ] API health/providers state is accurate.
- [ ] NSE inventory/preview/import/duplicate behavior is checked.
- [ ] Loading, empty, error, and success UI states are present.
- [ ] Desktop/mobile layout has no obvious overflow.
- [ ] No live-order or paid-provider language was introduced.
- [ ] Known limitations are documented in `README.md` and `handover.md`.
