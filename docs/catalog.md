# Catalog maintenance

`products.json` maps state codes to state names, descriptions, optional attachments, optional `haulTags` rules, and an `offices` array. Each office has an `id`, `name`, optional description/attachments/`haulTags` rules, and product arrays keyed by `fuelwood`, `christmas`, or `mushrooms`.

Office IDs must be the state code, a hyphen and 2–8 capital letters or digits (`AK-ANCH`), because they start each permit number (`AK-ANCH-26-048213`: office, two-digit year, six digits). The Carson City office's former ID `33` became `NV-CARS`; its product IDs did not change.

Visitors see offices as **areas** on the "Where will you collect?" screen, listed only when they have a permit of the chosen type on sale or opening within 15 days. State and office descriptions and attachments appear under "Area notices and maps" there, and again on the finished-permit screen. The `fuelwood` type is shown as "Firewood". Permit options drop the repeated prefix of the catalog name ("Fuelwood Permit — Anchorage North" is shown as "Anchorage North", and a trailing "(No fee)" is dropped beside the No fee price); the payload and the PDF keep the full catalog name.

Each product requires these fields:

| Field | Rule |
| --- | --- |
| `id` | Nonempty, globally unique permanent identifier. Keep it when renaming, repricing, or reordering a product. Never renumber existing IDs when inserting/removing products. |
| `name`, `unit` | Nonempty display labels. Labels do not determine eligibility. |
| `price` | Finite nonnegative number; zero means no fee. |
| `minQty`, `maxQty` | Finite positive minimum and maximum, with maximum at least minimum. |
| `quantityStep` | Positive increment measured from `minQty`. All current demo products use 1; fractional increments require an explicit catalog change. |
| `validForDays` | Positive integer, shortened when the sale ends sooner. The demo varies it by type: firewood 30, 60, 90 or 180 days, or 12 months (365 days) where the sale runs that long; Christmas trees 14 or 30; mushrooms 7, 14 or 30. |
| `saleStartDate`, `saleEndDate` | `today`, `today+N`, or `today-N` (whole days from the visitor's local date), or a fixed `YYYY-MM-DD` date. Start must be no later than end once resolved. Both dates are included in the sale window. |
| `eligibilityRule` | `null`, or `anilca-subsistence` to require the existing demo certification. |
| `requiredDocs` | Optional array of `{ "label": "…", "url": "…" }`. Every listing also links its type's stipulations, map and reference document, so a listing missing one still shows it. |
| `haulTags` | Optional `true` or `false` for a firewood or Christmas tree listing; overrides its office and state. Not allowed as `true` on mushrooms. |

The start page says permits typically last "from 7 days to 12 months". `npm test` checks the durations against that range; update the sentence in `index.html` if it changes.

## Haul tags

Firewood and Christmas tree permits can include haul tags; mushroom permits never do. The most specific rule wins: a listing's `haulTags`, then its office's `haulTags.<type>`, then its state's `haulTags.<type>`. Without any rule, tags are required. For example, `"haulTags": { "fuelwood": false }` on a state turns off firewood tags there, and `"haulTags": { "fuelwood": true }` on one of its offices turns them back on. The demo turns firewood tags off for all of Montana, back on for the Billings office (`MT-BILL`), and off for one Anchorage listing (Free Use).

A firewood tag covers half a cord and a Christmas tree tag one tree, so the package holds `quantity ÷ 0.5` or `quantity` tags, rounded up.

Each tag sheet is followed by a sheet with one load record per tag, placed so that, printed double-sided, a record lands behind every tag whether the printer turns the sheet on its long edge or its short edge. That fixes where tags can go: four fill a sheet, two sit on a diagonal, and one sits in the centre. No arrangement of three works for both turns, so a remainder of three prints as a diagonal pair and a centred tag. Firewood tags come in pairs, so this only affects Christmas trees.

## Sample documents

Document links in `requiredDocs` and attachments point to `documents/<id>.pdf`. `js/permit-documents.js` defines their content: a stipulations, map and reference document per collection type, and the six state and office notices and maps. `npm run build:documents` writes the files, `npm run check` fails if a linked file is missing, and `npm test` fails if a file no longer matches its content. A new attachment needs an entry in `AREA_DOCUMENTS` to be printed in the permit package; otherwise the package lists its link on the area notices page.

Run `npm run check` after editing. Invalid catalog data prevents catalog use and shows a load error; technical diagnostics go to the console. Links are restricted to HTTP(S), mail, telephone, and relative URLs. `#` remains a demo placeholder.

The shipped demo uses relative dates so the long-lived prototype never runs out of products. They are resolved once when the catalog loads, so an open tab still reaches a sale's end date. Fixed dates remain valid for tests or for reproducing a specific calendar, but `npm test` fails if any shipped product's sale would end for a visitor up to 2040. The current offsets were converted from the earlier fixed dates using 2026-10-21 as `today`, which is also the date the tests pin. Three Anchorage Aurora Outpost products start at `today+7` so the "Opening soon" list is visible on the live demo; keep at least one such product when editing the catalog.

Sale availability uses the visitor's local calendar date. This prototype does not enforce an office-specific time zone. Production integrations must establish their authoritative date/time policy and validate catalog rules, prices, quantities, eligibility, and payment status on the server.

Saved selections match active product IDs only. Old index-based selections or removed/expired products require a fresh choice. Purchaser data is never restored. Checkout rechecks availability, including when an open tab crosses the sale-end date.
