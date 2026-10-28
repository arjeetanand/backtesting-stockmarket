# Stock workspace consolidation checklist

## Audit and organization

- [x] Keep `backtesting-stockmarket` as the single active stock-research repository.
- [x] Archive `StockML`; its chronological ML research capability is covered by Backtrack ML Lab on local NSE data.
- [x] Archive `stockpulse`; its older BSE lookup prototype is outside the unified NSE research path.
- [x] Archive `stock-news-sentiment-analysis` and [`Financial_news_analysis`](https://github.com/arjeetanand/Financial_news_analysis), the current account name for the listed stock-news analysis project; they are overlapping older scraper/FinBERT prototypes with generated artifacts.
- [x] Preserve every archived GitHub repository; none were deleted and no legacy artifacts were copied.

## Unified local workspace

- [x] Refresh the home page around shared NSE data, strategy testing, scanning, validation, ML, insights, replay, and saved tests.
- [x] Replace misleading live/online labels with historical-data and simulation labels.
- [x] Add a restart-safe launcher for the existing API and frontend on UI `4003` / API `8001`.
- [x] Document matching UI test slots `5003` and `6003`.
- [x] Keep missing backend/data states explicit; do not introduce mock or fabricated market data.
- [x] Add a regression check for malformed launcher state.
- [x] Apply the Codex Strategy Research Pipeline to the workflow: candidate → testable hint → Backtrack backtest → risk/robustness review.
- [x] Install Taste and Impeccable in Codex and apply a light-indigo design system to the personal, local app.
- [x] Simplify navigation and add a human review gate before running an NSE historical simulation.
- [x] Add a regression test for the research gate and a launcher check for live descendants after a process-group leader exits.

## Verification and handoff

- [x] Backend lint and full tests pass; `mypy src` reports 13 existing errors in four unchanged files (`market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`).
- [x] Frontend tests, lint, and production build pass; the local review gate and launcher descendant checks pass.
- [x] Inspect the rendered UI in the browser at desktop and compact widths; a standalone Taste browser inspector could not launch Chrome.
- [x] Let the active NSE import finish, then restart `./run.sh`; UI `http://127.0.0.1:4003/` returns HTTP 200 and API `/api/v1/health` reports `status: ok` with `local_nse_cache`.
- [x] Consolidation commit `bf44580` is followed by redesign commit `a1cf1ae` on `codex/skill-guided-ui-20261028`.
- [x] Push the branch and merge [PR #1](https://github.com/arjeetanand/backtesting-stockmarket/pull/1) into `main` as `147619b`.

The npm install reported 14 dependency advisories (2 moderate, 9 high, 3 critical); the lockfile was not changed to apply automatic upgrades.
