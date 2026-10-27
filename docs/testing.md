# Regression checks

`npm run check` parses the JavaScript files, resolves and validates the actual demo catalog, and confirms every CSS custom property used in `styles.css` is defined.

`npm test` runs Node's test runner with jsdom. The DOM tests load the real ES module graph using VM modules (Node prints an experimental VM-module warning). They exercise the real markup, events, catalog loader, validation, and checkout code. They cover:

- Paid and no-fee confirmation, repeat-click identity, and changed-order identity.
- PDF invalidation when purchaser details or acknowledgements change.
- Reset of purchaser fields, saved selections, old transaction references, and payloads.
- Active-ID restoration with expired products ahead of a selection; missing, expired, and index-only selections.
- Repeated locking/unlocking and office edits.
- Quantity bounds and increments, eligibility independent of display names, and open-tab sale expiry.
- Malformed catalog data, malformed saved state, blocked storage, and fetch failures.
- URL normalization and script-protocol rejection.
- Relative catalog dates (`today±N`), malformed relative dates failing closed, and no shipped product sale ending for future visitors through 2040.
- Confirm-email errors that follow delivery-email edits, checkout IDs without `crypto.randomUUID` (plain-HTTP device testing), prices in product radio descriptions, quantity guidance after restore, lock notes that are not rewritten with identical text, and validity day counts across a DST change.

`npm run test:browser` uses Chromium by default. Set `BROWSER=firefox` or `BROWSER=webkit` for the other Playwright engines. The tests cover keyboard and slow-pointer office selection, required-field semantics, invalid-quantity descriptions without focus stealing, both checkout paths, reload with purchaser reentry, Unicode PDF download, confirmation focus, Reset, and horizontal overflow at 1280px and 390px. Axe scans check WCAG 2 A/AA, 2.1 AA and 2.2 AA at initial load, product selection, completed purchaser fields, and PDF confirmation. All eight smoke-page checks must pass. `CHROMIUM_EXECUTABLE` can point to an existing Chromium executable.

`npm run test:safari` runs Selenium against installed Safari on macOS. Enable Safari automation first (`sudo safaridriver --enable`). This tests Safari itself; the separate WebKit job tests Playwright's WebKit build on Linux. Safari coverage includes keyboard office selection, both checkout paths, PDF generation, confirmation focus, reload, Reset, and the same automated accessibility rules. Actual PDF downloading is covered by the Playwright jobs.

GitHub Actions runs syntax/catalog checks, logic/DOM/PDF tests, Chromium/Firefox/WebKit jobs, and an installed-Safari job on macOS. A passing automated scan does not substitute for a person listening with a screen reader; see [the manual checks](accessibility.md).

## PDF checks

The PDF tests extract Unicode text and check text coordinates on every page. They cover accented Latin and Navajo characters, Greek and Cyrillic names, decomposed accents, long unbroken strings, multi-page content, page numbers, unsupported glyph errors, and complete document tails. DOM tests also cover Reset during asynchronous generation, correction/retry after an error, select change events without input events, and back-forward cache purchaser-field clearing, and unchanged blur/change events preserving checkout content and button text nodes. Quantity edits explicitly refresh final readiness. PDF development verification uses Poppler rendering and visual inspection in addition to text extraction.

The embedded DejaVu Sans font has finite character coverage. Latin, Greek, Cyrillic and the tested Navajo characters are supported; this is not a promise of every Unicode script or emoji. Missing glyphs cause an explicit error rather than silent replacement squares. The PDF remains a demo, and no PDF/UA or tagged-document accessibility certification is claimed.

## Checkout identity and demo limits

An unchanged checkout snapshot reuses its reference for retry clicks. Editing selections, quantities, purchaser values, or acknowledgements invalidates the displayed result. Generation is asynchronous: the confirm button announces busy status, failures retain entries for retry, and an outdated result cannot appear after Reset or edits. Transaction snapshots and purchaser information stay in memory; reload requires purchaser reentry and creates a new checkout identity.

These checks do not implement or validate real Pay.gov, CBS, permit issuance, email, or server-side idempotency.
