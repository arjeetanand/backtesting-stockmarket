# Backtrack coding-agent instructions

Backtrack is a local, free, research-only Indian-market backtesting application. Read [README.md](README.md), [PROJECT_GUIDE.md](PROJECT_GUIDE.md), and the relevant [handover.md](handover.md) section before making a cross-layer change.

## Product boundary

- Use official NSE daily archive data for the current market-data path.
- Do not add broker execution, Dhan order APIs, paid providers, or live-order behavior.
- Never fabricate prices when data is missing; show an actionable import or unavailable state.
- Replay orders and backtests are simulations only.

## Repository ownership

- `src/quant_research/` — FastAPI backend, domain logic, SQLite persistence, and services.
- `frontend/src/` — Next.js pages, shared UI, API clients, charts, and local swarm modules.
- `data/` — local SQLite and NSE ZIP runtime data; ignored by Git.
- `tests/` — unit, API, persistence, importer, and calculation tests.
- `README.md` — concise full-repository setup and product overview.
- `backend/README.md` — backend-specific setup and contracts.
- `frontend/README.md` — frontend-specific setup and routes.
- `PROJECT_GUIDE.md` — page-by-page user behavior.
- `handover.md` — engineering architecture and persistence source of truth.
- `TESTING.md` — verification and release contract.

## Data rules

- NSE imports operate per trading-day archive, not per stock.
- One archive is bulk-loaded for all supported rows.
- Reuse local ZIPs before downloading.
- Keep raw rows, archive metadata, coverage, and normalized candles consistent in SQLite.
- Preserve conflict-safe `(symbol, timeframe, timestamp)` candle upserts.
- Do not commit SQLite files, archive ZIPs, `.env` files, caches, or generated artifacts.

## Change workflow

1. Inspect the current implementation and API schema before editing.
2. Make the smallest change that completes the requested behavior.
3. Preserve unrelated user changes in the working tree.
4. Add or update a focused regression test for backend/data behavior.
5. Run the relevant checks:

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
git diff --check
npm --prefix frontend run build
```

6. For rendered UI changes, validate the running page for loading, empty, error, success, desktop, and mobile states when the Browser workflow is available.
7. Update the relevant documentation whenever routes, data behavior, setup, persistence, or limitations change.

## Safety

- Do not run destructive Git commands or delete user data without explicit authorization.
- Do not reset or truncate the local database as part of ordinary tests.
- Keep API errors explicit and actionable.
- Treat YouTube extraction and Ollama output as reviewable drafts, never as automatic trading instructions.
