# Design system notes

Runtime tokens live under `:root` in `styles.css`; `tokens.json` documents the same palette and scale for reference. Keep both synchronized when changing token values.

A start page leads into a flow that asks one question per screen, all in a single 600px column, so a phone shows most screens without scrolling and desktop keeps a comfortable line length. The header and footer keep their content; the red prototype banner is gone, and a small "Demo" note on the start page, the details screen's lede and the payment notes carry the same warning.

- **Type:** Atkinson Hyperlegible Next, self-hosted, designed for low-vision readers. Its slashed zero tells 0 from O, which matters in ZIP codes and permit references. Body text is 17px, headings 30px (36px on wide screens).
- **Color:** a white page with one forest green (`--color-primary`) reserved for actions, selections and links. Muted text, hairlines and tints are shades of the same green-grey. Errors use `--color-danger` with a tinted summary.
- **Shape:** thin dividers and single borders instead of boxes inside boxes. Option cards have a 12px radius; the review summary and permit card 14px.
- **Controls:** text fields are 52px tall and primary buttons 56px; every tap target is at least 44px. Labels sit above fields, and only optional fields are marked.

Shared classes:

- `.screen`, `.screen-top`, `.back-link`, `.progress`: the screen frame.
- `.field`, `.field-input`, `.field-error`, `.field-pair`, `.field-group`: fields. Errors are inserted before `.field-input` and a `.has-error` field gets a red rule.
- `.option`, `.option-label`, `.option-input`, `.option-title`, `.option-sub`, `.option-aside`: radio cards. Checked cards use `:has()` with an `.is-selected` fallback.
- `.qty-panel`, `.stepper`: the quantity panel inside the chosen permit.
- `.disclosure`: every `<details>`, including help, notices, terms and the demo payload.
- `.start-button`, `.start-section`, `.check-list`, `.dot-list`: the start page. `.check-list` also draws the check screen's "Before you go" rules.
- `.summary-list`, `.summary-row`, `.rules`, `.checkbox`: the check screen.
- `.permit-card`, `.next-steps`, `.payload-content`: the finished-permit screen.
- `.production-label`: marks production-only promises such as email delivery.

Motion is limited to color and progress-bar transitions and respects `prefers-reduced-motion`. Real screen-reader and contrast audits remain part of manual accessibility verification; these notes do not claim a completed accessibility certification.
