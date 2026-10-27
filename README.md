# Online Forest Product Permits — Prototype

A static, front-end-only prototype for buying a forest product permit. A start page says what the service is for, what to have ready, and that the site is a demo. "Start now" then asks one question per screen:

1. What are you collecting?
2. Where will you collect? (state and area)
3. Which permit, and how much?
4. Your details (name, mailing address, email entered twice)
5. Check and pay, with one agreement to the permit terms and privacy notice

A sixth screen shows the finished permit with a download button. Continue, the Back link and the browser's own Back and Forward buttons move between screens; a screen can only be reached once every earlier answer is complete.

- Paid permits skip payment in the demo, then show the finished permit with the Pay.gov handoff payload under "Demo checkout data".
- No-fee permits show the finished permit with the issuance payload.
- Both generate a downloadable permit package as one PDF: the permit to sign, its stipulations, haul tags when the permit uses them (each tag sheet followed by a blank back), maps, area notices, and a reference guide. The permit is valid only when printed and signed. No payments are processed, no email is sent, and no real permits are issued. Use fictional purchaser information.
- The sample documents in the package are also linked from the site as standalone PDFs in `documents/`.
- Agency names are fictional. The page does not link to real agency websites and asks search engines not to index it. Pay.gov and the cited U.S. laws are kept because they describe the system this prototype targets.
- Only selections are saved in `sessionStorage`. Purchaser details, agreements and transaction snapshots stay in memory, so a reload returns to the details screen at most. "Start over" clears everything.

## Run locally

Serve the repository with a static server, then open <http://localhost:8000>:

```bash
python -m http.server 8000
```

The application uses native JavaScript modules and fetches `products.json`, so opening `index.html` directly from the filesystem is unsupported. Deployment uses checked-in static files, including the self-hosted Atkinson Hyperlegible Next page font and a self-hosted PDF engine and font that load only when a PDF is requested. No production npm installation or build step is needed.

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
| `index.html`, `styles.css` | The six screens, styling, and design tokens |
| `app.js` | Screen navigation and history, form events, and application coordination |
| `js/catalog.js` | Product identity, catalog validation, sale windows, and validity dates |
| `js/validation.js` | Quantity increments and purchaser field rules |
| `js/eligibility.js` | Explicit eligibility-rule lookup and certification copy |
| `js/state.js` | Optional saved-selection storage |
| `js/checkout.js` | Checkout identity, permit numbers, and payloads |
| `js/permit-documents.js`, `js/permit-pdf.js` | Permit package and sample document content; PDF rendering in page order |
| `documents/` | Sample documents linked from the site, written by `npm run build:documents` |
| `js/ui.js`, `js/links.js` | Option cards, labels, and other rendering helpers; URL validation |
| `vendor/` | Self-hosted page font, PDF engine and PDF font; see [vendor notes](vendor/README.md) |
| `products.json` | Demo catalog; see [catalog maintenance](docs/catalog.md) |
| `tests/` | Logic, DOM, and PDF tests; Chromium, Firefox, and WebKit browser checks; and installed-Safari checks |

See the [testing notes](docs/testing.md), [design notes](docs/design-system-notes.md), [performance notes](docs/performance-notes.md), and [accessibility checks](docs/accessibility.md).
