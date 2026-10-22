# Design system notes

Runtime tokens live under `:root` in `styles.css`; `tokens.json` documents the same palette and scale for reference. Keep both synchronized when changing token values.

- Colors distinguish surfaces, body/helper text, primary actions, status messages, and focus indicators.
- Typography uses the system font stack and the existing heading/body/small text tokens.
- Spacing tokens define an 8px scale; component-specific spacing also appears in the stylesheet.
- Shared classes cover buttons, fields, product cards, alerts, document links, totals, and form grids. Generated payloads use `.payload-content`; repeated summary lines use `.summary-line`.
- Form sections use `.flow-step`, `.step-toggle`, and `.step-body`. Obsolete stepper and progress-header styles are removed.
- Selected cards use both `:has()` styles and the existing JavaScript `.is-selected` fallback.

Required purchaser fields have native `required` attributes. Step buttons identify their panels through `aria-controls`; unavailable/collapsed panels are inert. Inline validation attaches error descriptions to fields, and the shared error summary receives focus when shown. The office selector supports arrow keys, Enter, and Escape.

Motion respects `prefers-reduced-motion`. Real screen-reader and contrast audits remain part of manual accessibility verification; these notes do not claim a completed accessibility certification.
