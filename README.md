# Online Forest Product Permits — Prototype

A static, front-end-only prototype for buying a forest product permit, published at <https://bip-river.github.io/SFPx/>. A start page says what the service is for, what to have ready, and that the site is a demo. "Start now" then asks one question per screen:

1. What are you collecting?
2. Where will you collect? (state and area)
3. Which permit, and how much? A permit with eligibility rules asks for the certification here, inside the chosen permit.
4. Your details (first, optional middle and last name, mailing address, email entered twice), with the Privacy Act notice on the same screen and no checkbox
5. Check and pay, with one agreement to the permit terms that also certifies the purchaser is not a minor under the law of the permit area's state

A sixth screen shows the finished permit with a download button. Continue, the Back link and the browser's own Back and Forward buttons move between screens; a screen can only be reached once every earlier answer is complete.

- Paid permits go to [Pay.ure](docs/pay-ure.md), a fictional payment site in `pay-ure/` that accepts only listed test card and bank numbers, each with one outcome: approved, declined, insufficient funds, Pay.ure down, or a payment for the wrong amount that the permit service's check on return refuses. After paying, the visitor returns to the finished permit, with the checkout and payment details under "Demo checkout data". Cancelling on Pay.ure, or leaving it with the browser's Back button, returns to the check screen with every entry kept.
- No-fee permits show the finished permit with the issuance payload.
- Both generate a downloadable permit package as one PDF: the permit to sign, its stipulations, haul tags when the permit uses them (each tag sheet followed by a sheet of load records), maps, area notices, and a reference guide. The permit is valid only when printed and signed. No money is charged, no email is sent, and no real permits are issued. Use fictional purchaser information.
- The sample documents in the package are also linked from the site as standalone PDFs in `documents/`.
- Agency names are fictional. The page does not link to real agency websites and asks search engines not to index it. The cited U.S. laws are kept because they describe the system this prototype targets.
- Only selections are saved in `sessionStorage`. Purchaser details, agreements, eligibility certifications and transaction snapshots stay in memory, so a reload returns to the details screen at most, or to the permit screen when its permit needs a certification. The exception is a trip to Pay.ure: the checkout, purchaser details included, waits in `sessionStorage` while the visitor pays, standing in for the agency's server, and is removed as soon as they are back. Pay.ure keeps its collections there too, with only the last four digits of a card or account. Permits paid for in the tab are remembered by a one-way fingerprint of the checkout, without purchaser details, so they are never offered for payment twice. "Start over" clears everything.

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
| `js/validation.js`, `js/printable.js` | Quantity increments and purchaser field rules; characters the permit PDF can print, from the generated `js/pdf-font-coverage.js` |
| `js/eligibility.js` | Explicit eligibility-rule lookup and certification copy |
| `js/state.js` | Optional saved-selection storage |
| `js/checkout.js` | Checkout identity, permit numbers, and payloads |
| `js/payment-handoff.js`, `js/navigate.js` | The checkout kept while the visitor is on Pay.ure, and Pay.ure's return addresses; page navigation |
| `pay-ure/` | The Pay.ure payment site: its page and styles, the collection API both sites call (`js/collections.js`) and the test numbers (`js/test-instruments.js`); see [Pay.ure](docs/pay-ure.md) |
| `js/permit-documents.js`, `js/permit-pdf.js` | Permit package and sample document content; PDF rendering in page order |
| `documents/` | Sample documents linked from the site, written by `npm run build:documents` |
| `js/ui.js`, `js/links.js` | Option cards, labels, and other rendering helpers; URL validation |
| `js/startup-fallback.js` | A message in place of the start button when JavaScript or `app.js` cannot run |
| `vendor/` | Self-hosted page font, PDF engine and PDF font; see [vendor notes](vendor/README.md) |
| `products.json` | Demo catalog; see [catalog maintenance](docs/catalog.md) |
| `tests/` | Logic, DOM, and PDF tests for both sites; Chromium, Firefox, and WebKit browser and failure-path checks; and installed-Safari checks |

See the [testing notes](docs/testing.md), [design notes](docs/design-system-notes.md), [performance notes](docs/performance-notes.md), and [accessibility checks](docs/accessibility.md).
