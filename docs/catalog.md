# Catalog maintenance

`products.json` maps state codes to state names, descriptions, optional attachments, and an `offices` array. Each office has an `id`, `name`, optional description/attachments, and product arrays keyed by `fuelwood`, `christmas`, or `mushrooms`.

Each product requires these fields:

| Field | Rule |
| --- | --- |
| `id` | Nonempty, globally unique permanent identifier. Keep it when renaming, repricing, or reordering a product. Never renumber existing IDs when inserting/removing products. |
| `name`, `unit` | Nonempty display labels. Labels do not determine eligibility. |
| `price` | Finite nonnegative number; zero means no fee. |
| `minQty`, `maxQty` | Finite positive minimum and maximum, with maximum at least minimum. |
| `quantityStep` | Positive increment measured from `minQty`. All current demo products use 1; fractional increments require an explicit catalog change. |
| `validForDays` | Positive integer; the existing demo behavior uses 30 days, shortened when the sale ends sooner. |
| `saleStartDate`, `saleEndDate` | `today`, `today+N`, or `today-N` (whole days from the visitor's local date), or a fixed `YYYY-MM-DD` date. Start must be no later than end once resolved. Both dates are included in the sale window. |
| `eligibilityRule` | `null`, or `anilca-subsistence` to require the existing demo certification. |
| `requiredDocs` | Optional array of `{ "label": "…", "url": "…" }`. |

Run `npm run check` after editing. Invalid catalog data prevents catalog use and shows a load error; technical diagnostics go to the console. Links are restricted to HTTP(S), mail, telephone, and relative URLs. `#` remains a demo placeholder.

The shipped demo uses relative dates so the long-lived prototype never runs out of products. They are resolved once when the catalog loads, so an open tab still reaches a sale's end date. Fixed dates remain valid for tests or for reproducing a specific calendar, but `npm test` fails if any shipped product's sale would end for a visitor up to 2040. The current offsets were converted from the earlier fixed dates using 2026-10-21 as `today`, which is also the date the tests pin.

Sale availability uses the visitor's local calendar date. This prototype does not enforce an office-specific time zone. Production integrations must establish their authoritative date/time policy and validate catalog rules, prices, quantities, eligibility, and payment status on the server.

Saved selections match active product IDs only. Old index-based selections or removed/expired products require a fresh choice. Purchaser data is never restored. Checkout rechecks availability, including when an open tab crosses the sale-end date.
