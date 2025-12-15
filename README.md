# BLM Forest Products Permits — Customer Flow Prototype (Static)

This repository is a static, front-end-only prototype demonstrating a customer flow for selecting a forest products permit (by **collection type → state → BLM office/district → product → quantity**) and collecting purchaser information. It **does not** process payments or generate permits.

**Prototype behavior:** the “Continue to Pay.gov” action **prints a demo handoff payload** on-screen rather than redirecting to Pay.gov.

## What this is (and isn’t)

### This is
- A lightweight HTML/CSS/JS prototype for interaction and content review.
- A working step flow with validations, locking/unlocking, and a typeahead office selector.
- A demo “handoff payload” generator that simulates what would be sent to payment.

### This is not
- A production implementation.
- A payment integration (no Pay.gov redirect).
- A backend workflow (no transaction creation, storage, permit issuance, or downloads).

## Repository contents
- `index.html` — markup and content (includes demo Privacy Act + Terms blocks)
- `styles.css` — styling for the prototype UI
- `app.js` — all client-side behavior (stepper, validation, persistence, demo payload)
- `products.json` — demo catalog (states → offices → products)

No build system is required.

## Run locally (recommended)
Because the catalog is loaded via `fetch()` from `products.json`, run a local static server for consistent browser behavior.

### Python
```bash
python -m http.server 8000
```
Open: `http://localhost:8000`

### Node
```bash
npx serve .
```
Open the URL printed by the command.

## User flow overview

### Step 1 — Find available products
1. Choose **What are you collecting?** (Fuelwood / Christmas trees / Mushrooms)
2. Choose **State**
3. Choose **BLM office / district** (typeahead combobox)

### Step 2 — Select product and quantity
- Products display for the chosen office + type.
- If no products exist for that selection, the UI shows a “Nothing to select” message and prompts the user to try another office or collection type.

### Step 3 — Review, accept, and enter purchaser info
- The purchaser form remains locked until both acknowledgements are checked:
  - Privacy Act notification
  - Terms and Conditions
- When acknowledgements are complete and purchaser fields validate, “Continue to Pay.gov” becomes available.
- Clicking “Continue to Pay.gov” prints a demo payload.

## Demo Pay.gov handoff payload
Clicking “Continue to Pay.gov” prints a JSON object that includes:
- Selected state, office, product, quantity, and total
- Purchaser contact fields
- A generated transaction reference stored in `localStorage`

A **4096-byte payload size limit** is enforced to simulate real Pay.gov constraints.

## State persistence
In-progress form state is saved in `localStorage` so a refresh does not reset the session.

## Disclaimer
This is an illustrative prototype for design and interaction review only. Demo data and text must be replaced for production use.
