# Performance Notes (Phase 3)

## What changed
- Added a subtle topographic background texture using an inline SVG data URI in `styles.css` to avoid extra network requests.
- Introduced a hero band container to keep the title area calm and readable without introducing large imagery.
- Animations use existing motion tokens and are disabled under `prefers-reduced-motion`.

## Quick checks
- Texture is embedded in CSS, so there are **no additional HTTP requests**.
- New transitions are opacity/transform only to avoid layout thrash.
- The sticky progress header uses `position: sticky` and does not trigger reflows during scroll.

## Manual verification (optional)
- Run a simple smoke check by opening `tests/smoke.html` in a browser.
- For deeper audit, run Lighthouse on `index.html` and focus on Performance + Accessibility scores.
