# Stock workspace consolidation checklist

## Audit and organization

- [x] Keep `backtesting-stockmarket` as the single active stock-research repository.
- [x] Archive `StockML`; its chronological ML research capability is covered by Backtrack ML Lab on local NSE data.
- [x] Archive `stockpulse`; its older BSE lookup prototype is outside the unified NSE research path.
- [x] Archive `stock-news-sentiment-analysis` and `stock-news-analysis`; they are overlapping older scraper/FinBERT prototypes with generated artifacts.
- [x] Preserve every archived GitHub repository; none were deleted and no legacy artifacts were copied.

## Unified local workspace

- [x] Refresh the home page around shared NSE data, strategy testing, scanning, validation, ML, insights, replay, and saved tests.
- [x] Replace misleading live/online labels with historical-data and simulation labels.
- [x] Add a restart-safe launcher for the existing API and frontend on UI `4003` / API `8001`.
- [x] Document matching UI test slots `5003` and `6003`.
- [x] Keep missing backend/data states explicit; do not introduce mock or fabricated market data.
- [x] Add a regression check for malformed launcher state.
- [x] Apply the Codex Strategy Research Pipeline to the workflow: candidate → testable hint → Backtrack backtest → risk/robustness review.

## Verification and handoff

- [x] Run backend lint and test suite; `ruff` and `pytest` pass. `mypy src` reports 13 existing errors in four unchanged files (`market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`).
- [x] Run the frontend production build.
- [x] Verify repeat-launch ownership behavior and the rendered desktop/mobile UI; confirm API health at `/api/v1/health`.
- [x] Record local implementation commit `bf44580` and runtime URL `http://127.0.0.1:4003/` in this checklist and `handover.md`.
- [x] Keep changes on `codex/stock-workspace-unification-20261028`; do not push or merge without authorization.

The npm install reported 14 dependency advisories (2 moderate, 9 high, 3 critical); the lockfile was not changed to apply automatic upgrades.
