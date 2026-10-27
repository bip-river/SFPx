# Regression checks

`npm run check` parses the JavaScript files, resolves and validates the actual demo catalog, and confirms every CSS custom property used in `styles.css` is defined.

`npm test` runs Node's test runner with jsdom. The DOM tests load the real ES module graph using VM modules (Node prints an experimental VM-module warning). They exercise the real markup, events, catalog loader, validation, and checkout code. They cover:

- One screen at a time; Continue, the Back link and the browser Back button moving between screens; focus and page titles following the screen; later screens unreachable before their earlier answers, including through history.
- Paid and no-fee permits, repeat-Pay identity after going back, and changed-order identity.
- PDF invalidation when purchaser details, quantity or the agreement change, and the finished-permit screen becoming unreachable.
- Change links on the check screen, with Continue returning there once the changed answers are complete.
- Reset ("Start over" and "Start another permit") of purchaser fields, saved selections, old transaction references, and payloads.
- Active-ID restoration with expired products ahead of a selection, a reload returning to its screen, and purchaser details always reentered; missing, expired, and index-only selections.
- A new area clearing the permit choice.
- Quantity bounds and increments, the stepper staying within limits without dropping focus, eligibility independent of display names, and open-tab sale expiry.
- Malformed catalog data, malformed saved state, blocked storage, and fetch failures.
- URL normalization and script-protocol rejection.
- Relative catalog dates (`today±N`), malformed relative dates failing closed, and no shipped product sale ending for future visitors through 2040.
- Areas listed only when the chosen collection type has a permit on sale or coming soon, a message when a state has none, coming-soon products listed separately and not selectable, the validity shown on screen matching the demo PDF, eligibility certification carried for paid products with a rule, and production-only email promises labelled "In production:".
- Changing the collection type keeps the state, and keeps the area when it offers the new type.
- Confirm-email errors that follow delivery-email edits, checkout IDs without `crypto.randomUUID` (plain-HTTP device testing), short permit names described by price and limits, quantity guidance after restore, and validity day counts across a DST change.
- Field errors that appear once a field is left and clear while typing, Continue buttons that open a linked error summary (radio groups link to their first option), and blur-time errors held back while Continue is pressed.

`npm run test:browser` uses Chromium by default. Set `BROWSER=firefox` or `BROWSER=webkit` for the other Playwright engines. At 1280px and 390px, the tests choose a collection type with the keyboard, move through every screen, check that focus lands on each new question, enter an invalid quantity without focus being taken, follow an error-summary link, pay, use the browser Back button and pay again with the same reference, reload with purchaser reentry, get a no-fee permit, download both Unicode PDFs, start another permit, and check for horizontal overflow. Axe scans check WCAG 2 A/AA, 2.1 AA and 2.2 AA on every screen and on the error summary. All eight smoke-page checks must pass. `CHROMIUM_EXECUTABLE` can point to an existing Chromium executable.

`npm run test:safari` runs Selenium against installed Safari on macOS. Enable Safari automation first (`sudo safaridriver --enable`). This tests Safari itself; the separate WebKit job tests Playwright's WebKit build on Linux. Safari coverage includes every screen, Enter in the quantity field, both checkout paths, PDF generation, focus on each new screen and on the finished permit, the browser Back button, reload, starting another permit, and the same automated accessibility rules. Actual PDF downloading is covered by the Playwright jobs.

GitHub Actions runs syntax/catalog checks, logic/DOM/PDF tests, Chromium/Firefox/WebKit jobs, and an installed-Safari job on macOS. A passing automated scan does not substitute for a person listening with a screen reader; see [the manual checks](accessibility.md).

## PDF checks

The PDF tests extract Unicode text and check text coordinates on every page. They cover accented Latin and Navajo characters, Greek and Cyrillic names, decomposed accents, long unbroken strings, multi-page content, page numbers, unsupported glyph errors, and complete document tails. DOM tests also cover Reset during asynchronous generation, correction/retry after an error, select change events without input events, and back-forward cache purchaser-field clearing, and unchanged blur/change events preserving the prepared permit and button text nodes. Quantity edits discard the prepared permit. PDF development verification uses Poppler rendering and visual inspection in addition to text extraction.

The embedded DejaVu Sans font has finite character coverage. Latin, Greek, Cyrillic and the tested Navajo characters are supported; this is not a promise of every Unicode script or emoji. Missing glyphs cause an explicit error rather than silent replacement squares. The PDF remains a demo, and no PDF/UA or tagged-document accessibility certification is claimed.

## Checkout identity and demo limits

An unchanged checkout snapshot reuses its reference, including after going back from the finished permit and paying again. Editing selections, quantities, purchaser values, or the agreement invalidates the prepared permit, and the finished-permit screen can no longer be reached. Generation is asynchronous: the Pay button announces busy status, failures retain entries for retry, and an outdated result cannot appear after Reset or edits. Transaction snapshots and purchaser information stay in memory; reload requires purchaser reentry and creates a new checkout identity.

These checks do not implement or validate real Pay.gov, CBS, permit issuance, email, or server-side idempotency.
