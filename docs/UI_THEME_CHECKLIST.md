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
