# Design System Notes

## Tokens
Design tokens live in `tokens.json` and are mirrored in `styles.css` under `:root`. The CSS custom properties are the source of truth for runtime styling, while the JSON file documents the scale for cross-platform use.

### Color roles
- **Background/surface**: `--color-bg`, `--color-surface`, `--color-surface-muted`
- **Text**: `--color-text`, `--color-text-muted`
- **Primary/accent**: `--color-primary`, `--color-primary-strong`, `--color-accent`, `--color-accent-soft`
- **Status**: `--color-warning`, `--color-danger`, `--color-success`
- **Focus**: `--color-focus`

### Typography
Mobile-first sizes are defined in `--font-size-h1`, `--font-size-h2`, `--font-size-body`, and `--font-size-small`. Body text defaults to 15px with a calm line height.

### Spacing
Spacing uses an 8pt grid (`--space-1` through `--space-6`). Use these values for padding, margins, and layout gaps.

### Radii + elevation
- Radii: `--radius-card`, `--radius-input`, `--radius-chip`, `--radius-soft`
- Elevation: `--shadow-sm`, `--shadow-md`, `--shadow-lg`

### Motion
Use `--motion-fast`, `--motion-base`, and `--motion-slow` with `--motion-ease`. The global `prefers-reduced-motion` rule disables transitions/animations.

## Component usage
- **Buttons**: `.primary`, `.ghost` share the same radius, focus ring, and shadow scale.
- **Inputs/Selects**: unified padding, border, and focus ring via base `input`, `select`, and `textarea` styles.
- **Cards/Alerts**: reduced borders and shadows for calmer hierarchy.
- **Progress header**: `.progress-header` with `.progress-summary` provides sticky guidance, dot indicators, and “Edit” affordances.
- **Product cards**: `.prod` uses a name/area/price hierarchy, chip-style validity metadata, and a visible selection icon.
- **Totals**: `.total-panel` wraps the estimated total with a subtle crossfade animation (`.total-amount`).
- **Chips/Badges**: `.badge`, `.step-pill`, `.stats li`, `.doc-links a` use the chip radius and muted backgrounds.

## Accessibility notes
- Focus rings use `--color-focus` and meet WCAG AA contrast on light surfaces.
- Body text color (`#0f1c1f`) on the light background meets AA contrast for normal text.
- Accent backgrounds (`--color-accent-soft`) are only used for helper text and never for body copy that needs high contrast.

If a new token introduces a contrast risk, prefer adjusting the color role (not the component) so the fix cascades consistently.
