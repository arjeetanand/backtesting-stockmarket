# Backtrack testing and release contract

Last reviewed: 2026-07-23

This project has three verification layers: backend correctness, frontend build correctness, and rendered workflow checks. Market data is never downloaded by automated tests.

## Required commands

From the repository root:

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
git diff --check
npm --prefix frontend run build
```

Focused checks:

```bash
uv run pytest -q tests/unit/test_data_inventory_api.py tests/unit/test_nse_import.py
```

The frontend package may also expose `npm --prefix frontend run lint`; run it when configured in `package.json`.

## Test boundaries

Automated tests use fake providers, fake Ollama responses, and temporary SQLite databases. They must not require NSE, Yahoo, YouTube, Ollama, broker credentials, or a network connection.

## Backend and data tests

Importer and cache changes must cover:

- legacy and current NSE Bhavcopy column aliases;
- valid OHLCV conversion and invalid-row skipping;
- one archive download per trading day;
- ZIP reuse without another network call;
- raw rows retained in `nse_bhavcopy_rows`;
- supported EQ/BE/ETF rows stored in `ohlcv_bars`;
- archive-day reuse for another stock request;
- conflict-safe candle upserts;
- date-range preview and complete-overlap `409` behavior;
- holiday/unavailable archive handling;
- actionable missing-data errors;
- no fabricated or live-looking fallback prices.

The key regression tests are in `tests/unit/test_nse_import.py` and `tests/unit/test_data_inventory_api.py`.

## Backtest and persistence tests

Verify:

- valid date and strategy parameters;
- no future-bar/look-ahead use;
- documented next-bar execution behavior;
- fees and slippage affect results;
- return, trade count, win rate, equity, and drawdown are consistent;
- no-trade output is safe and clearly explained;
- deterministic cache keys reuse saved results;
- backtests, hypotheses, robustness reports, YouTube drafts, import jobs, and replay sessions survive SQLite object recreation;
- replay orders remain simulated and no credentials are persisted.

## Research and YouTube tests

Ollama tests cover valid JSON, Markdown-wrapped JSON, invalid output, timeout, HTTP failure, unavailable server, configured model, and deterministic fallback labeling.

YouTube tests cover valid URLs, rejected non-YouTube URLs, pasted transcripts, missing rules, low confidence, captions, and the requirement for human review. Extraction must never automatically place an order or silently invent rules.

## API smoke checks

Start the API first:

```bash
source .venv/bin/activate
uvicorn quant_research.api.main:app --reload --port 8000
```

Then run:

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health
curl -fsS http://127.0.0.1:8000/api/v1/providers
curl -fsS http://127.0.0.1:8000/api/v1/data/cache
curl -fsS 'http://127.0.0.1:8000/api/v1/data/instruments?query=RELIANCE'
curl -fsS 'http://127.0.0.1:8000/api/v1/data/inventory?query=RELIANCE&limit=50'
```

Preview an import without starting it:

```bash
curl -fsS -X POST http://127.0.0.1:8000/api/v1/data/nse-import/preview \
  -H 'content-type: application/json' \
  -d '{"start":"2025-01-01","end":"2025-12-31","preset":"custom","symbols":["RELIANCE"]}'
```

## Frontend smoke matrix

Start the UI after the API:

```bash
npm --prefix frontend run dev
```

| Flow | Expected result |
| --- | --- |
| Home → Test a strategy | Symbol and dates carry into Research |
| Home → Replay a chart | Symbol and dates carry into Replay |
| Data → choose all/quick/custom range | Correct date window and button label appear |
| Data → bulk import | One background job starts and shows progress |
| Data → repeat an existing range | Existing data is reused; duplicate import is rejected or skipped clearly |
| Data → type a stock/company name | Search results update without scanning full coverage on every keystroke |
| Data → backend unavailable | Clear error appears; no fake stock or price data appears |
| Research → hypothesis | Proposal is reviewable and no order is placed |
| Research → missing history | Local NSE preparation/import guidance appears |
| Strategy Import → transcript | Rules, confidence, assumptions, and review gaps appear |
| My tests → open result | Persisted detail and charts render |
| Replay → step/order/finish | Candles reveal progressively and orders remain simulated |
| Options → edit inputs | Payoff, loss, and breakeven update locally |

For rendered changes, check a desktop viewport and approximately `390 × 844` mobile. Look for clipping, horizontal overflow, unreadable tables, stale loading, broken focus, and duplicate calls-to-action.

## API error contract

- `422` — invalid date, symbol, timeframe, or strategy request.
- `404` — unknown run, job, or replay session.
- `409` — requested range is already fully available.
- `502` — upstream NSE, YouTube, or Ollama failure.
- `503` — required local service/provider is unavailable.

Errors must be actionable and must not be replaced with fabricated market data.

## Release checklist

- [ ] Focused regression test added for each backend/import/calculation bug.
- [ ] Ruff passes.
- [ ] Mypy passes.
- [ ] Full pytest passes.
- [ ] `git diff --check` passes.
- [ ] Frontend production build passes.
- [ ] Data import/reuse/duplicate behavior is checked.
- [ ] Search, loading, empty, error, and success states are checked.
- [ ] Desktop/mobile layout has no obvious overflow.
- [ ] No live-order or paid-provider language was introduced.
- [ ] README, PROJECT_GUIDE, handover, and the relevant backend/frontend guide are current.
