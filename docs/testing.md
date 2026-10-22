# Regression checks

`npm run check` parses the JavaScript files and validates the actual demo catalog.

`npm test` runs Node's test runner with jsdom. The DOM tests load the real ES module graph using VM modules (Node prints an experimental VM-module warning). They exercise the real markup, events, catalog loader, validation, and checkout code. They cover:

- Paid and no-fee confirmation, repeat-click identity, and changed-order identity.
- PDF invalidation when purchaser details or acknowledgements change.
- Reset of purchaser fields, saved selections, old transaction references, and payloads.
- Active-ID restoration with expired products ahead of a selection; missing, expired, and index-only selections.
- Repeated locking/unlocking and office edits.
- Quantity bounds and increments, eligibility independent of display names, and open-tab sale expiry.
- Malformed catalog data, malformed saved state, blocked storage, and fetch failures.
- URL normalization and script-protocol rejection.

`npm run test:browser` uses Playwright with Chromium and starts a temporary local HTTP server. It exercises keyboard office selection, both checkout paths, reload with purchaser reentry, a real PDF download, stale-confirmation invalidation, Reset, and horizontal overflow at 1280px and 390px. It also verifies all eight checks on `tests/smoke.html` pass. `CHROMIUM_EXECUTABLE` can point to an existing Chromium executable when the bundled browser is unavailable.

GitHub Actions runs syntax/catalog checks, the logic/DOM suite, and Chromium checks on pull requests and pushes to `main`.

## Checkout identity and demo limits

An unchanged checkout snapshot reuses its reference for retry clicks. Editing a selection, quantity, purchaser value, or acknowledgement invalidates the displayed result and its identity. Reset starts a new checkout. Transaction snapshots and their purchaser information stay in memory, so reloading requires purchaser reentry and creates a new checkout identity.

These checks do not implement or validate real Pay.gov, CBS, permit issuance, email, or server-side idempotency. The PDF remains a simple one-page demo with the existing built-in Helvetica font; Unicode shaping and long-line pagination are not covered. Production integrations require their own service tests and PDF implementation. Screen-reader testing and non-Chromium browser checks remain manual.
