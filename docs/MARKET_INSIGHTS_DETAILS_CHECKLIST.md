# Market Insights stock details checklist

- [x] Show the weekday and date for the latest cached NSE session.
- [x] Add a one-click official NSE daily sync and refresh the selected index.
- [x] Selecting a stock loads its local daily bars and shows latest volume, last-five-session volume, prior-20-session average, relative volume, and recent closes/volume.
- [x] Reuse the existing prior-high trigger, prior-low stop, and 2R target as a conditional paper plan saved to Daily Watchlist.
- [x] Keep unavailable history and sync/save errors actionable; do not show live prices or broker actions.
- [x] Add regression coverage for volume summaries and conditional plan levels.
- [x] Frontend lint, 22 tests, webpack production build, and `git diff --check` pass.
- [ ] Browser check is blocked: the sandbox denied the local Next.js listener on port 6003 (`EPERM`), and the configured API could not be reached from the sandbox.
- [x] Record final branch, commit, verification, and remaining UI/runtime limits in `handover.md`.
