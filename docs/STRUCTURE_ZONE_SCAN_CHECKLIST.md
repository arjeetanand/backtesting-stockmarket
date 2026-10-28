# Daily structure-zone scan checklist

## Public product review

- [x] Reviewed public OrderBlock home, about, updates, and disclaimer material; its marketing describes a stock-ranking board, market context, and chart zones, while the member workflow is behind sign-in.
- [x] Read [OrderBlock's terms](https://order-block.com/terms), which prohibit automated scraping and reverse engineering/building a competing product from its service. No sign-in, private app, or endpoint inspection was used for this implementation.
- [x] Kept the Backtrack implementation independent: local daily NSE OHLCV only, separate visual language, transparent rules, and no claim of institutional-flow detection.

## Implementation

- [x] Add the read-only `POST /api/v1/structure-zones/scan` endpoint and typed response schemas.
- [x] Add deterministic bullish/bearish daily zone detection with confirmation, touch, distance, and invalidation state.
- [x] Add the explicit **Daily structure zones** Market Scanner tab with universe, loading, empty, error, result, and coverage states.
- [x] Update README, user guide, frontend/backend docs, and engineering handoff.
- [x] Add focused service and API contract regression checks.
- [x] Full Ruff and pytest passed; frontend ESLint and isolated webpack production build passed. Full `mypy src` still reports 13 errors in four unchanged files; it reports none in this feature's route, schema, or service.
- [x] Desktop browser review confirmed initial, loading, results, partial coverage, corrected confirmation-day state, and clearing results when changing universes. The live NIFTY 50 cache returned 29 zones from 49 of 50 symbols (latest bar 2026-10-27; one symbol had insufficient history).
- [ ] Mobile viewport and forced API-error UI were not checked because the available browser session exposes a fixed desktop viewport.
- [ ] Commit verified task changes locally; do not push or merge without authorization.

## Rule and limits

The scanner requires a close beyond the preceding 20-session range, a directional body at least 1.25× the preceding 14-session average true range, and a close in the outer quarter of the candle. It uses the full range of the latest opposite candle in the previous three bars. A later daily close through the far edge invalidates the zone; confirmations older than 60 bars are omitted. It reads only saved `1day` candles and does not update automatically.
