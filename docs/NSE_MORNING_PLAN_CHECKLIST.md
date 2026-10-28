# NSE Morning Plan Checklist

- [x] Build conditional entry, stop, target, and risk levels from the latest completed local NSE daily bar.
- [x] Show candidate score, data date, manual pre-open timing, and live-data limitations in the scanner.
- [x] Save explicit plan levels and keep the watchlist waiting until the trigger is reached.
- [x] Document that the trigger candle is unresolved at daily granularity and ambiguous later candles resolve stop-first.
- [x] Run focused backend regression tests (8 passed), full backend tests, Ruff, frontend ESLint, and webpack production build.
- [x] Run full mypy; the same 13 existing issues remain in `market_cache.py`, `pattern_finder.py`, and untyped `ta` imports. No new task-specific type errors appeared.
- [x] Inspect the full diff, verify the task branch is based on `main` at `a96dc40`, and merge PR #12 as `e544d0b`.
- [x] Review the rendered scanner and watchlist at desktop and the available narrow width (487px); no document-wide horizontal overflow or browser console errors. The in-app browser did not honor an exact 390px width.

- Run from an up-to-date local checkout, then click **Build Morning Plan** manually around 9:00 IST after the daily cache is current.
