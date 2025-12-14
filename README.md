# BLM Forest Products Permits — Customer Flow Prototype (Static)

This repo contains a clean, customer-focused static prototype for **forestproducts.blm.gov** that demonstrates the flow **up to (and including) purchaser info + quantity collection** and outputs a **demo Pay.gov handoff payload**.

> Scope: This is a front-end prototype only. It does **not** process payments, store data, or generate permits.

## Contents

- `index.html` — Markup and page structure
- `styles.css` — Styling (single theme, responsive layout)
- `app.js` — Client-side logic (state → office → type → products, validations, step flow)
- No build system required

## Run locally

Option A — open directly:
- Double-click `index.html` to open in a browser.

Option B — serve locally (recommended for consistent behavior):
- Python:
  - `python -m http.server 8000`
  - Open `http://localhost:8000`
- Node:
  - `npx serve .`
  - Follow the printed URL

## What the prototype supports

1. Customer selects:
   - **State**
   - **BLM office / district** (typeahead combobox)
   - **Product type** (Fuelwood / Christmas trees / Mushrooms)
2. System displays **available products** for that office/type
3. Customer selects a product
4. Customer enters **quantity**
5. Customer reads/accepts:
   - **Privacy Act notification**
   - **Terms and Conditions**
6. Customer enters required purchaser information
7. Prototype prints a **demo “handoff payload”** that would be used to redirect to Pay.gov

## Data model

All data is embedded in `app.js` as a `DATA` constant:

```js
const DATA = {
  "AK": {
    name: "Alaska",
    offices: [
      {
        id: "AK-ANCH",
        name: "Anchorage Field Office",
        products: {
          fuelwood: [
            {
              name: "Fuelwood Permit — Anchorage North",
              unit: "cord",
              price: 10.00,
              availableUntil: "2026-12-31",
              maxQty: 10,
              description: "…",
              requiredDocs: [
                { label: "Map", url: "#" }
              ]
            }
          ],
          christmas: [ ... ],
          mushrooms: [ ... ]
        }
      }
    ]
  }
}
```

### Requirements satisfied in this prototype
- Includes **Alaska**
- Every office has **at least two products** for each product type
- Product cards are simplified (no SKU), with normal-sized radio selection
- “Contact” header button points to: `https://www.blm.gov/office/national-office`

## Key customization points

### 1) Replace demo data with production data
- Replace the `DATA` constant in `app.js` with your real state/office/product catalog.
- If your production system already has an API endpoint, you can:
  - Fetch data at runtime, then populate the state dropdown accordingly.
  - Keep the same UI + validation flow.

### 2) Replace Privacy Act + Terms
- In `index.html`, replace the text blocks in:
  - `Privacy Act Notification`
  - `Terms and Conditions`
- If you want those items to be links or PDFs instead, convert the `<details>` bodies to links.

### 3) Pay.gov handoff integration (future)
This prototype stops before payment. In production you typically:
- Create a transaction record (Sale ID) server-side
- Redirect to Pay.gov with transaction context
- On return, validate payment status server-side and allow permit download

The current prototype only prints a JSON payload to represent that handoff.

## Accessibility notes
- Includes a skip link
- Combobox supports keyboard navigation (↑/↓, Enter, Escape)
- Focus styles are visible

## License / disclaimer
This is an illustrative prototype for design and interaction review. Demo text and product data are placeholders and must be replaced with authoritative content for production use.
