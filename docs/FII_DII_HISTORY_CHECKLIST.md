# FII/DII saved history checklist

## Range refresh delivery · 2026-10-29

- [x] Add 30D/3M/6M/1Y/5Y/10Y/20Y/All selectors and an explicit selected-range sync action.
- [x] Add Tapetide cursor pagination, date-bound validation, numeric validation, incomplete-row reporting, and atomic SQLite upserts.
- [x] Keep Tapetide history in `fii_dii_history_rows`, separate from NSE latest-session snapshots.
- [x] Explain Tapetide's documented January 2014 start; 20Y and All never claim data before that date.
- [x] Add a backend-only `TAPETIDE_API_TOKEN` setting and setup guidance; do not expose the token to the browser.
- [x] Add regression coverage for pagination, 2014 clamping, incomplete rows, source separation, repeated-cursor failure, missing token, background-job status, and SQLite write failures.
- [x] Ruff, full pytest, frontend lint, 20 Vitest tests, webpack production build, changed-module mypy, and `git diff --check` pass.

Remaining verification limits: no Tapetide token is configured for a live provider request, and the sandbox denied the isolated browser preview's 6003/8002 loopback binds with `EPERM`.

- [x] Read previously saved Tapetide rows from the local SQLite cache on page load.
- [x] Keep Tapetide history separate from official NSE latest-session rows.
- [x] Filter 30D/3M/6M/1Y views to saved dates and report the actual cached coverage.
- [x] Add a regression check that the one-year response shows saved rows without mixing the NSE series.
- [x] Confirm the configured cache is `data/market_cache.sqlite3`; it contains 61 sessions from 2026-07-31 through 2026-10-28.
- [x] Pass Ruff, full pytest, frontend lint, 20 frontend tests, webpack production build, and `git diff --check`.
- [ ] Exact 390px mobile viewport: browser returned 487px when 390px was requested. The document had no horizontal overflow at 487px; the wide ledger scrolls inside its table container.
