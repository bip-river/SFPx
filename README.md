# Online Forest Product Permits — Prototype

A static, front-end-only prototype for selecting a forest product permit, reviewing its rules, entering purchaser information, and previewing checkout.

- Paid permits display a demo Pay.gov handoff payload.
- No-fee permits generate a downloadable demo PDF.
- No payments are processed, email is sent, or real permits are issued. Use fictional purchaser information.
- Only selections and acknowledgements are saved in `sessionStorage`. Purchaser details and transaction snapshots stay in memory; Reset clears the entire form.

## Run locally

Serve the repository with a static server, then open <http://localhost:8000>:

```bash
python -m http.server 8000
```

The application uses native JavaScript modules and fetches `products.json`, so opening `index.html` directly from the filesystem is unsupported. There is no production build step or runtime package dependency.

## Development checks

Use Node.js 22 or newer (CI uses Node.js 24):

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

The browser test starts its own temporary local server. On Linux, Playwright may require `npx playwright install --with-deps chromium`. You can also open `tests/smoke.html` on the local server for eight structural checks.

## Project layout

| File | Responsibility |
| --- | --- |
| `index.html`, `styles.css` | Page structure, styling, and design tokens |
| `app.js` | Form events, step transitions, and application coordination |
| `js/catalog.js` | Product identity, catalog validation, sale windows, and validity dates |
| `js/validation.js` | Quantity increments and purchaser field rules |
| `js/eligibility.js` | Explicit eligibility-rule lookup and certification copy |
| `js/state.js` | Optional saved-selection storage |
| `js/checkout.js`, `js/permit-pdf.js` | Checkout identity, payloads, and demo PDF generation |
| `js/ui.js`, `js/links.js` | Reusable rendering helpers and URL validation |
| `products.json` | Demo catalog; see [catalog maintenance](docs/catalog.md) |
| `tests/` | Logic, DOM integration, and Chromium regression checks |

See [testing notes](docs/testing.md), [design notes](docs/design-system-notes.md), and [performance notes](docs/performance-notes.md).
