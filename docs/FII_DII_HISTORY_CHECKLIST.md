# FII/DII saved history checklist

- [x] Read previously saved Tapetide rows from the local SQLite cache on page load.
- [x] Keep Tapetide history separate from official NSE latest-session rows.
- [x] Filter 30D/3M/6M/1Y views to saved dates and report the actual cached coverage.
- [x] Add a regression check that the one-year response shows saved rows without mixing the NSE series.
- [x] Confirm the configured cache is `data/market_cache.sqlite3`; it contains 61 sessions from 2026-07-31 through 2026-10-28.
- [x] Pass Ruff, full pytest, frontend lint, 20 frontend tests, webpack production build, and `git diff --check`.
- [ ] Exact 390px mobile viewport: browser returned 487px when 390px was requested. The document had no horizontal overflow at 487px; the wide ledger scrolls inside its table container.
