# FII/DII historical sync checklist

- [x] Keep the official NSE latest-session feed unchanged and separate.
- [x] Add a user-triggered Tapetide sync for 30 or 90 inclusive calendar days.
- [x] Store raw responses and normalized history rows locally with provider attribution.
- [x] Keep the personal API token on the backend; never send it to the browser.
- [x] Label the third-party series provisional and distinguish it from NSE data.
- [x] Add regression coverage for range bounds, provider-value validation, and source isolation.
- [x] Render the local page and confirm the source, empty, and missing-token states.
- [x] Pass Ruff, the full pytest suite, frontend lint, webpack production build, and `git diff --check`.
- [x] Try full mypy; only the 13 existing issues in `market_cache.py`, `pattern_finder.py`, `ml_research.py`, and `breakout_scanner.py` remain.
- [ ] Live provider sync: requires the user's own free Tapetide token and a reachable API.
- [ ] Exact mobile viewport review: not available in the current browser session.
