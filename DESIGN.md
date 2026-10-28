---
name: Backtrack
description: A calm local desk for reviewing ideas against historical NSE data.
colors:
  primary: "#4f46e5"
  frame: "#f0f1f8"
  canvas: "#ffffff"
  surface: "#f8f9fc"
  selected: "#e8eaf7"
  border: "#e3e5ed"
  ink: "#171a38"
  muted: "#606779"
  action: "#c3c9df"
  positive: "#047857"
  negative: "#be123c"
  warning: "#8a5200"
typography:
  display:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "clamp(30px, 3vw, 42px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "11px"
    fontWeight: 500
rounded:
  sm: "7px"
  md: "10px"
  sheet: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "38px"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "38px"
  input-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
  panel:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  navigation-current:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
  research-review:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
---

# Design System: Backtrack

## Overview

**Creative North Star: “The Local Research Desk”**

Backtrack is a personal workspace for turning a stock idea into a reviewed rule and historical evidence. Its visual language is quiet and precise: a light-indigo frame, a white working sheet, clear data labels, and restrained accents that keep attention on the user's assumptions and results.

The refreshed screens borrow the editorial reference's spacious white canvas, navy headings, and pale periwinkle actions, translated into Backtrack's indigo tokens. Layout and wording continue to present the existing local research tools; the reference adds no product behavior.

The interface keeps the primary journey in one place and tucks secondary market and analysis tools into grouped navigation. A visible checkpoint sequence describes the actual app flow; it must not imply that separate AI agents ran. Local model output and deterministic fallback rules remain clearly labelled drafts.

**Key Characteristics:**
- Light-indigo shell around a white work surface.
- Flat, hairline-separated panels with compact, readable data.
- A human review checkpoint before historical simulation.

## Colors

Use saturated indigo for links, focus, and selected states. Keep the frame cool and pale, the main action pale periwinkle, and semantic colors reserved for results and warnings.

### Primary
- **Working indigo** (`{colors.primary}`): Keyboard focus, selected navigation, and links.
- **Primary action wash** (`{colors.action}`): Pale periwinkle with navy text for the next action.

### Neutral
- **Cool frame** (`{colors.frame}`): App chrome around the white work sheet.
- **White canvas** (`{colors.canvas}`): Main page and panel background.
- **Quiet surface** (`{colors.surface}`): Inputs and supporting regions.
- **Selected wash** (`{colors.selected}`): Selected navigation and gentle indigo emphasis.
- **Hairline border** (`{colors.border}`): Panel edges and separators.
- **Ink** (`{colors.ink}`): Headings and primary text.
- **Muted slate** (`{colors.muted}`): Supporting text and utility labels.
- **Positive** (`{colors.positive}`): Positive historical results and completed states.
- **Negative** (`{colors.negative}`): Losses and errors.
- **Warning** (`{colors.warning}`): Incomplete data and review-required states.

### Named Rules
**The Provenance Rule.** Color never makes an unavailable or simulated value look live or certain; label data source and result state in text.

## Typography

**Display Font:** Space Grotesk (system fallback)

**Body Font:** Inter (system fallback)

**Label/Mono Font:** JetBrains Mono (monospace fallback)

**Character:** Compact, contemporary headings pair with neutral reading text. Reserve monospaced figures for dates, symbols, prices, identifiers, and other technical values.

### Hierarchy
- **Display** (600, `clamp(30px, 3vw, 42px)`, 1.08): Home-page lead only.
- **Headline** (600, 23–28px): Page titles.
- **Title** (600, 14–17px): Panel and section titles.
- **Body** (400, 13px, 1.55): Instructions and explanatory copy.
- **Label** (500–700, 11–12px): Controls, statuses, and supporting copy; dense chart ticks may use smaller type.

## Layout

On desktop, use a 240px left rail, a 48px top bar, and a white work sheet inset by 8px from the right and bottom edges. The sheet uses 24px content padding. Keep sections in one readable column unless a paired form or result view benefits from a two-column grid. At 900px and below, remove the desktop rail and use a four-item bottom navigation; keep the top bar and let content use the screen width. At 640px and below, collapse two-column research panels and keep form actions full width. Use an 8px spacing rhythm, with 12px and 24px group gaps where present.

## Elevation & Depth

The interface is flat by default. The frame tint, white sheet, quiet supporting surfaces, and hairline borders provide depth; ordinary panels do not cast shadows. Use a visible focus outline for keyboard interaction and no decorative glow.

**The Flat-By-Default Rule.** Do not add card shadows to create hierarchy; use spacing, surface tone, and borders.

## Shapes

Use 7px controls, 10px panels, and a 16px page sheet. Borders are thin and cool blue-gray. Avoid pill-shaped controls except for compact status tags already used by the application.

### Illustration

Use the original notebook researcher mascot as the overview illustration and as a small mark beside shared section headings, including the custom Insights heading. Its subtle thinking tilt and thought dots use CSS only when motion is allowed; the reduced-motion view stays still. Keep charts, warnings, and trading decisions free of decorative art. Do not imply forecasts or recommendations.

## Components

### Buttons
- **Shape:** 7px corners, at least 38px high.
- **Primary:** Pale periwinkle with navy text; use for the next meaningful action. Reserve saturated indigo for links, selected states, and focus.
- **Secondary:** White with a clear border; use for alternate actions.
- **Hover / Focus:** Darken indigo slightly on hover. Keep a 3px visible indigo focus outline with 2px offset.

### Cards / Containers
- **Corner Style:** 10px panels; 16px outer sheet.
- **Background:** White panels on the white sheet; use the quiet surface for grouped settings.
- **Shadow Strategy:** No resting shadow; separate regions with thin borders and spacing.
- **Internal Padding:** 16–24px, reduced to 16px on narrow screens.

### Inputs / Fields
- **Style:** White background, 1px blue-gray border, 7px corners.
- **Focus:** Indigo border and a subtle 3px indigo ring.
- **Error / Disabled:** Preserve the application's explicit error, unavailable, and disabled states; never suggest missing data is ready.

### Navigation
- **Desktop:** Quiet left rail with four primary workspace links and grouped market/tools links. Use a pale indigo fill and dark indigo text for the current route.
- **Mobile:** Four primary links in a fixed bottom bar; hide secondary groups from the bar without removing their routes.
- **Keyboard:** Keep all links and disclosure summaries visibly focusable; mark the current link with `aria-current="page"`.

### Research Review
The draft summary, assumptions, risks, and risk settings appear before the confirmation control. The primary button remains unavailable until the user confirms the review and local data is ready. Require a fresh confirmation after changing inputs and after reopening the page.

## Do's and Don'ts

- **Do** label the source and historical scope of market data.
- **Do** keep missing-data and fallback states explicit.
- **Do** describe checkpoints as one local workflow, not as separate agents.
- **Do** make the proposed rule and assumptions reviewable before a run.
- **Don't** add live quotes, broker connections, or real-money order controls.
- **Don't** present a historical result as a forecast or trading instruction.
- **Don't** fabricate candles, metrics, or successful states.
- **Don't** add decorative terminal grids, heavy shadows, or an unrelated dark theme.
