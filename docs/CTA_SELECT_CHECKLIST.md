# CTA and choice-control clarity

## Scope

- [x] Audit the frontend's primary button/link handlers and the Daily Watchlist save flow.
- [x] Clarify the working save action with **Add to Daily Watchlist**, progress text, and a **Saved to Daily Watchlist** state. Existing saved setups are detected on page load.
- [x] Describe Watchlist entries as historical setups evaluated against imported daily bars; rename “Active Trades” to “Active setups” and explain target/stop status.
- [x] Give Watchlist removal an accessible, named button and show request errors in the page.
- [x] Replace 18 native select popups across eight routes with the shared styled `SelectMenu`; replace the Indicator School datalist popup with `SymbolCombobox`.
- [x] Show fixed one-option settings as read-only values rather than interactive-looking menus.
- [x] Select the first supported compatibility rule on initial render and keep **Run scan** unavailable until the scanner catalogue has resolved to a valid option.
- [x] Confirm there are no native `<select>` or `<datalist>` controls under `frontend/src`.

## Verification

- [x] Frontend lint (`npm --prefix frontend run lint`).
- [x] Webpack production build (`npm --prefix frontend run build -- --webpack`; all 23 pages generated).
- [x] Desktop browser: custom menu appearance, selected value, arrow-key movement, Enter selection, and Watchlist wording/accessibility label.
- [x] Reproduced the scanner's mismatched empty selection on the existing preview and fixed the initial rule in code.
- [ ] Post-fix scanner preview and narrow mobile review. Starting an isolated UI on test port `6003` failed with `listen EPERM`; viewport emulation was not available in the browser session.
- [x] No add/remove/import action was submitted during the browser review.

## Delivery

- Branch: `codex/cta-select-clarity-20261029`.
- Implementation commit: pending final scoped review.
- Preview: existing shared-checkout UI is available on port `4003`; the isolated branch build passed, but its preview could not bind port `6003` under the sandbox.
- Next: review the scanner default and 390px/767px layout in a browser that can open this branch's local preview.
