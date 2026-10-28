# Daily pressure-flow checklist

- [x] Keep the source limited to the local NSE daily OHLCV cache; no broker, live feed, or order-book claim.
- [x] Rank up to 20 positive and 20 negative 20-session close-location × traded-value estimates for all local NSE symbols, NIFTY 500, or NIFTY 50.
- [x] Highlight the top three on each side in a keyboard-selectable flow diagram; keep both complete ranked lists available.
- [x] Let the user search any NSE catalogue symbol and inspect its latest valid daily demand/supply candidates.
- [x] Report data dates and incomplete history; exclude symbols without 20 usable sessions.
- [x] Add focused service, cache-query, and API coverage tests.
- [x] Run the full backend pytest suite and Ruff; frontend Vitest, ESLint, and webpack production build also pass. Full `mypy src` still reports 13 existing issues in four files.
- [x] Verify the all-stocks flow, top-three selection, a candidate zone, and typed symbol lookup in the local desktop browser. The fixed browser viewport prevented an exact mobile-width run; the responsive breakpoints were reviewed in CSS.
- [x] Record the implementation commits and [PR #14](https://github.com/arjeetanand/backtesting-stockmarket/pull/14) in this checklist and `handover.md`.
