# Intelligence Daily inspired UI theme and mascot

## Implementation

- [x] Extend the light-indigo palette across shared route styles using the existing design tokens.
- [x] Apply navy headings, quieter navigation, pale periwinkle actions, and readable helper text.
- [x] Keep semantic result colors and the local historical-research product boundary.
- [x] Document the theme in `DESIGN.md` and the repository READMEs.
- [x] Add the `/time-machine` title to the shared top bar.
- [x] Add an original notebook-researcher illustration to the overview, served as a local WebP with descriptive alt text.
- [x] Reuse the local notebook character in shared section headings and the custom Insights heading.
- [x] Add restrained thinking motion to the character and a small hover response to sidebar icons.
- [x] Keep the research overview readable at phone, tablet, and desktop widths.
- [x] At 390px, 767px, and 1440px, confirm the image loads and document width stays within the viewport.
- [x] Verify the mascot across all 21 routes at 390px; review Home, Data, and Insights at 1440px and Data at 767px with no horizontal overflow.
- [x] Confirm motion is gated by `prefers-reduced-motion: no-preference`, the reduced-motion override is present, and the mobile Insights heading fits.

## Verification and delivery

- [x] Frontend lint and the webpack production build pass; the default Turbopack build was blocked by sandbox process permissions.
- [x] Review all 21 rendered routes at phone (390px), tablet (767px), and desktop (1440px) widths.
- [x] Check route navigation and horizontal overflow; no route errors or document overflow found.
- The base theme shipped in [PR #6](https://github.com/arjeetanand/backtesting-stockmarket/pull/6), the overview mascot in [PR #7](https://github.com/arjeetanand/backtesting-stockmarket/pull/7), and shared mascot motion in [PR #8](https://github.com/arjeetanand/backtesting-stockmarket/pull/8).
