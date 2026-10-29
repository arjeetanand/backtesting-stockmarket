# Volume and momentum study checklist

## Scope

- [x] Analyze one symbol from locally cached NSE daily bars.
- [x] Calculate relative volume from the preceding 20 sessions only.
- [x] Group same-day momentum and next-session close returns using explicit ±0.5% direction cutoffs.
- [x] Report counts, up/down share, average return, and median return by volume band and momentum direction.
- [x] Show the study in Research with sample-size and historical-data limits.
- [x] Expand comparison rows into dated trades with simulated fills, P&L, return, and holding time.
- [x] Include entry and exit commission in newly calculated vector-engine trade P&L and trade return.

## Verification

- [x] `uv run ruff check src tests`.
- [x] Focused volume-study, custom-backtest API, and vector-engine tests; full `uv run pytest -q` also passed.
- [x] Focused `mypy` passes for the changed modules; full `uv run mypy src` reports 13 existing errors in `market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`.
- [x] Frontend ESLint and isolated webpack production build.
- [x] Rendered Research results and Comparison summary/trade details in the browser; narrow and mobile views use labeled cards, including at the 1600 CSS-pixel desktop viewport where the table would not fit.
- [x] Verified the preview through the running local frontend and API without restarting the existing NSE runtime.
- [ ] No-sample UI state.
- [ ] Review staged diff and ensure SQLite, archive, cache, and generated files are excluded.
- [ ] Create task commit and PR to `main`; record push/merge status.

## Interpretation limits

- A volume band is a descriptive comparison with the stock's own prior 20 sessions, not a universal threshold.
- An observation requires both the signal date and its next available session to fall inside the requested dates.
- Close-to-close prices are not adjusted for corporate actions.
- OHLCV volume cannot distinguish buyers from sellers or identify institutional order flow.
- Samples below 30 are labeled exploratory; the study does not make forecasts or recommendations.
