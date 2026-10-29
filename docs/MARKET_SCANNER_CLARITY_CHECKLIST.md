# Market Scanner clarity checklist

- [x] Replace jargon-heavy heading text and the unsupported “entire NIFTY universe” claim.
- [x] Explain the rule screen, historical scan, breakout setups, and daily structure zones in plain language.
- [x] Clarify that result search filters the completed historical scan; wider coverage requires **All imported stocks** and locally available data.
- [x] Update the main README and user guide with the same search scope and historical-data boundary.
- [x] Frontend lint passed with 0 errors and one existing unused-function warning in `SelectMenu.tsx`; isolated webpack production build passed.
- [x] Desktop browser review confirmed the new copy and controls. The local API was unreachable, so successful scan results and the post-scan search state were not exercised.
- [ ] Mobile viewport review remains pending because viewport emulation is unavailable in the current browser surface.
- [ ] Record the verification, branch, and commit in `handover.md`.
