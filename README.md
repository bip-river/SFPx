# Online Forest Product Permits — Prototype

A static, front-end-only prototype for selecting a forest product permit, reviewing its rules, entering purchaser information, and previewing checkout.

- Paid permits display a demo Pay.gov handoff payload.
- No-fee permits generate a downloadable demo PDF.
- No payments are processed, no email is sent, and no real permits are issued. Use fictional purchaser information.
- Agency names are fictional. The page does not link to real agency websites and asks search engines not to index it. Pay.gov and the cited U.S. laws are kept because they describe the system this prototype targets.
- Only selections and acknowledgements are saved in `sessionStorage`. Purchaser details and transaction snapshots stay in memory; Reset clears the entire form.

## Run locally

Serve the repository with a static server, then open <http://localhost:8000>:

```bash
python -m http.server 8000
```

The application uses native JavaScript modules and fetches `products.json`, so opening `index.html` directly from the filesystem is unsupported. Deployment uses checked-in static files, including a self-hosted PDF engine and font that load only when a PDF is requested. No production npm installation or build step is needed.

## Development checks

Use Node.js 22.13 or newer (CI uses Node.js 24):

```bash
npm ci
npm run check
npm test
npx playwright install chromium firefox webkit
npm run test:browser
BROWSER=firefox npm run test:browser
BROWSER=webkit npm run test:browser
```

The browser test starts its own temporary local server and includes automated accessibility checks. On a Mac, enable Safari WebDriver (`sudo safaridriver --enable`) and run `npm run test:safari` to test installed Safari itself. On Linux, Playwright may require `npx playwright install --with-deps chromium`. You can also open `tests/smoke.html` on the local server for eight structural checks.

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
| `tests/` | Logic, DOM, and PDF tests; Chromium, Firefox, and WebKit browser checks; and installed-Safari checks |

See the [testing notes](docs/testing.md), [design notes](docs/design-system-notes.md), [performance notes](docs/performance-notes.md), and [accessibility checks](docs/accessibility.md).
