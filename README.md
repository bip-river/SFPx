# Online Forest Product Permits — Prototype

This repo is a static, front-end-only prototype for buying a forest product permit. It demonstrates a three-step flow where a user selects what they are collecting, chooses a state and office, picks a permit and quantity, and then provides acknowledgements and purchaser details before reviewing a summary.

## What it does
- Loads demo catalog data from `products.json` (states, offices, products, limits, attachments, and eligibility rules).
- Provides a typeahead office selector, product cards, quantity validation, and a review panel.
- Shows a demo Pay.gov handoff payload for paid permits.
- For no-fee permits, generates a demo permit PDF for download and shows a demo issuance payload.
- Saves non-PII selections and acknowledgements in `sessionStorage` so the flow can be resumed.

## What it does not do
- No backend, payments, or real permit issuance.
- No real Pay.gov integration.
- Demo content only (copy, logos, and data are placeholders).

## Project layout
- `index.html` — markup and content
- `styles.css` — UI styles
- `app.js` — client-side behavior
- `products.json` — demo catalog data

## Run locally
Because the catalog is loaded with `fetch()` from `products.json`, serve the folder with a local static server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.
