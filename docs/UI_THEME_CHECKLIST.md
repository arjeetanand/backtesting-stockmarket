# Intelligence Daily inspired UI theme and mascot

## Implementation

- [x] Extend the light-indigo palette across shared route styles using the existing design tokens.
- [x] Apply navy headings, quieter navigation, pale periwinkle actions, and readable helper text.
- [x] Keep semantic result colors and the local historical-research product boundary.
- [x] Document the theme in `DESIGN.md` and the repository READMEs.
- [x] Add the `/time-machine` title to the shared top bar.
- [x] Replace the single lossy mascot image with six original, transparent 1536×1024 PNG illustrations for overview, research, markets, strategy, evidence review, replay, and local data.
- [x] Use full illustrations with `object-fit: contain` in shared route headers and the Home hero; keep them clear of charts, warnings, and trading decisions.
- [x] Replace the cropped bitmap avatar with a crisp inline SVG notebook mark and keep the restrained thinking motion.
- [x] Add responsive header and art sizing rules for phone, tablet, and desktop breakpoints.
- [x] Serve the full PNG source without lossy Next image optimization so edges stay crisp.
- [x] Confirm character motion is gated by `prefers-reduced-motion: no-preference` and the reduced-motion override is present.

## Verification and delivery

- [x] Frontend lint and the webpack production build pass; the default Turbopack build was blocked by sandbox process permissions.
- [x] Review all 21 rendered routes in the live browser at 1185px: each loads its full 1536px source, and the document has no horizontal overflow.
- [x] Inspect the Research page screenshot and check the browser console after setting visible artwork to eager loading.
- [ ] Re-run the artwork sweep at 390px and 767px in a viewport-emulating browser; the current browser session exposes only a fixed desktop viewport.
- The base theme shipped in [PR #6](https://github.com/arjeetanand/backtesting-stockmarket/pull/6), the overview mascot in [PR #7](https://github.com/arjeetanand/backtesting-stockmarket/pull/7), and shared mascot motion in [PR #8](https://github.com/arjeetanand/backtesting-stockmarket/pull/8).

## Guided workflow and contextual illustrations — 2026-10-28

This section records the current placement and supersedes the shared route-header artwork from the earlier illustration rollout.

- [x] Put the static overview scene beside the Home workflow steps; show data → research → saved results, with comparison as the next step.
- [x] Move the other scenes into the data source, rule review, first saved-test empty state, replay setup, and missing-market-data state they explain.
- [x] Remove thought-dot motion from the static illustrations and preserve their full aspect ratio and original PNGs.
- [x] Put NSE data in the primary workflow navigation and keep specialist routes reachable from the mobile navigation.
- [x] Link a completed bulk import directly to Research; label other Home tools as optional follow-ups.
- [x] Reduce shared page-header height and remove route-family art from the header.
- [x] Run frontend lint and the webpack production build.
- [x] Check Home, Data, Research, Saved tests, Replay, and Market Insights in the live browser at 1179px; all rendered without horizontal overflow.
- [x] Confirm Home links the data → research → saved-test path and comparison as its next step; verify the mobile More menu exposes the specialist route groups in source.
- [ ] Check 390px and 767px mobile layouts and operate the More menu in a viewport-emulating browser; the available browser session is fixed at desktop width.
