# Online Forest Product Permits — Prototype

This repo is a static, front-end-only prototype for an online forest products permit purchase flow. It lets a user choose a collection type, state, office, product, and quantity, then enter purchaser details and review a summary. Clicking “Continue to Pay.gov” shows a demo payload on the page instead of starting a real payment.

## What this includes
- Three-step purchase flow with validation and a typeahead office selector.
- Demo catalog data in `products.json` (states, offices, products, limits).
- Client-side persistence for non-PII selections using `sessionStorage`.

## What this does not include
- No backend, permit issuance, or file downloads.
- No real Pay.gov integration or payment processing.
- Demo content only (copy, logos, and product data are placeholders).

## Project layout
- `index.html` — markup and content
- `styles.css` — UI styles
- `app.js` — all client-side behavior
- `products.json` — demo catalog data

## Run locally
Because the catalog is loaded with `fetch()` from `products.json`, serve the folder with a local static server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
