# Research run responsiveness and clarity

- [x] Keep full backtest chart arrays in the local artifact store; save only a result reference and small session fields in browser storage.
- [x] Add artifact-key and legacy run-ID retrieval for restoring a saved result.
- [x] Show run elapsed time, completed/failed counts, and cancel the browser request after 60 seconds.
- [x] Put the plain-language backtest result before the detailed chart.
- [x] Show a visible candle readout with date, open, high, low, close, direction, and share volume.
- [x] Explain candle bodies, wicks, volume bars, and Donchian breakout levels.
- [x] Add a regression test ensuring a 5,000-candle result is reduced to a compact browser-storage reference.
- [x] Test API artifact lookup by key and legacy run ID.
- [x] Verify the Research page and a TATACONSUM Donchian run in the browser at desktop and a narrow responsive width; the browser reported 487 CSS px when asked for 390 px, so exact phone-width emulation remains unavailable.
- [x] Run full backend/frontend checks: Ruff, pytest, Vitest, ESLint, webpack production build, and `git diff --check`.
- [x] Commit `7435d52` was delivered by [PR #21](https://github.com/arjeetanand/backtesting-stockmarket/pull/21) and squash-merged into `main` as `08948ff`; final delivery details are in `handover.md`.
