# Design system notes

Runtime tokens live under `:root` in `styles.css`; `tokens.json` documents the same palette and scale for reference. Keep both synchronized when changing token values.

- Colors distinguish surfaces, body/helper text, primary actions, status messages, and focus indicators.
- Typography uses the system font stack and the existing heading/body/small text tokens.
- Spacing tokens define an 8px scale; component-specific spacing also appears in the stylesheet.
- Shared classes cover buttons, fields, product cards, alerts, document links, totals, and form grids. Generated payloads use `.payload-content`; repeated summary lines use `.summary-line`.
- Form sections use `.flow-step`, `.step-toggle`, and `.step-body`. Obsolete stepper and progress-header styles are removed.
- Selected cards use both `:has()` styles and the existing JavaScript `.is-selected` fallback.

Product radios have concise names with price, validity, and availability descriptions, with document links outside their labels. In-text links are underlined, area attachment links meet a 24px minimum target height, and step sections have heading semantics. Required purchaser fields have native `required` attributes. Step buttons identify their panels through `aria-controls`; unavailable/collapsed panels are inert. Purchaser field errors appear once a field is left and then update while typing until fixed; errors are attached to their fields. Continue stays enabled: pressing it with problems shows the shared error summary, which takes focus and links each error to its field. The office selector supports arrow keys, Enter, and Escape.

Motion respects `prefers-reduced-motion`. Real screen-reader and contrast audits remain part of manual accessibility verification; these notes do not claim a completed accessibility certification.
