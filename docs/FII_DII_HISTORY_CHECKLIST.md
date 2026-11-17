# FII/DII saved history checklist

## Range refresh delivery · 2026-10-29

- [x] Add 30D/3M/6M/1Y/5Y/10Y/20Y/All selectors and an explicit selected-range sync action.
- [x] Add Tapetide cursor pagination, date-bound validation, numeric validation, incomplete-row reporting, and atomic SQLite upserts.
- [x] Keep Tapetide history in `fii_dii_history_rows`, separate from NSE latest-session snapshots.
- [x] Explain Tapetide's documented January 2014 start; 20Y and All never claim data before that date.
- [x] Add a backend-only `TAPETIDE_API_TOKEN` setting and setup guidance; do not expose the token to the browser.
- [x] Add regression coverage for pagination, 2014 clamping, incomplete rows, source separation, repeated-cursor failure, missing token, background-job status, and SQLite write failures.
- [x] Ruff, full pytest, frontend lint, 20 Vitest tests, webpack production build, changed-module mypy, and `git diff --check` pass.

Remaining verification limits at the range-refresh delivery: no Tapetide token was configured then, and the sandbox denied the isolated browser preview's 6003/8002 loopback binds with `EPERM`. A token value is now present in the local configuration, but its validity has not been checked against the provider.

## One-click all-source market sync · 2026-10-29

- [x] Change the global and Market Insights action to sync NSE daily archives, the latest official NSE FII/DII snapshot, and missing Tapetide history sessions.
- [x] Keep each source independent and return a separate status/message so an NSE or Tapetide failure does not suppress other completed sources.
- [x] Query only known available NSE sessions lacking a complete saved Tapetide FII/DII pair; persist successful empty checks so they are not requested on every click.
- [x] Avoid duplicate local NSE FII/DII snapshots when the latest report is unchanged while still recording corrected values.
- [x] Add regression checks for missing-date-only fetches, successful empty checks, NSE snapshot idempotency/corrections, and source failure isolation.
- [x] Focused FII/DII and daily-sync tests plus the full backend test suite pass; Ruff, frontend ESLint, all 24 Vitest tests, webpack production build, and `git diff --check` pass.
- [ ] Full mypy still reports 13 existing errors in `market_cache.py`, `pattern_finder.py`, `breakout_scanner.py`, and `ml_research.py`; no new errors remain in the changed route/importer files.
- [ ] Live NSE/Tapetide and browser checks remain unchecked; ports previously requested stopped were preserved and no external provider request was made.

- [x] Read previously saved Tapetide rows from the local SQLite cache on page load.
- [x] Keep Tapetide history separate from official NSE latest-session rows.
- [x] Filter 30D/3M/6M/1Y views to saved dates and report the actual cached coverage.
- [x] Add a regression check that the one-year response shows saved rows without mixing the NSE series.
- [x] Confirm the configured cache is `data/market_cache.sqlite3`; it contains 61 sessions from 2026-07-31 through 2026-10-28.
- [x] Pass Ruff, full pytest, frontend lint, 20 frontend tests, webpack production build, and `git diff --check`.
- [ ] Exact 390px mobile viewport: browser returned 487px when 390px was requested. The document had no horizontal overflow at 487px; the wide ledger scrolls inside its table container.
