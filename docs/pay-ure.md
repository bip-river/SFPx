# Pay.ure, the demo payment site

Pay.ure is the fictional payment site that the forest product permit service sends visitors to for a paid permit. It is run, in the fiction, by the Bureau of Fiscal Wherewithal of the Treasury of the United Regions. It lives in `pay-ure/` and is published next to the permit service, at `pay-ure/` under the same address.

Pay.ure is a demo too. It accepts only the test numbers it lists, charges nothing, and never stores a card or account number.

## Test numbers

Cards take any future expiry date (the current month counts) and any 3-digit security code.

| Card | Number | Outcome |
| --- | --- | --- |
| Visa | 4111 1111 1111 1111 | Approves |
| Mastercard | 5555 5555 5555 4444 | Approves |
| Discover | 6011 1111 1111 1117 | Approves |

| Bank account | Routing number | Account number | Outcome |
| --- | --- | --- | --- |
| Checking or savings | 551234561 | 1234567890 | Approves |

No bank can have the routing number 551234561: the first two digits of a routing number name a Federal Reserve district or a special use, and 55 is unassigned. It still passes the routing checksum, so a typo in it is caught as one.

Any other number is refused with a message that the demo takes only the listed numbers and that a real one must not be entered. Payment fields turn browser autofill off, so browsers do not offer saved real cards.

## How a payment works

```
BWL check screen ──Pay──▶ Pay.ure step 1 ──Continue──▶ Pay.ure step 2 ──Pay──▶ BWL (permit issued)
                         (method, details)            (check, authorize)
        ▲                       │ Cancel                     │ Cancel
        └───────────────────────┴────────────────────────────┘ check screen, entries kept
```

1. **The agency starts a collection.** On Pay, the permit service calls `startCollection` (in `pay-ure/js/collections.js`) with its agency ID, the amount, a description, its transaction reference and two return addresses. Pay.ure returns a token. In production this is a server-to-server call.
2. **The agency keeps the checkout.** The permit service saves the checkout (selections, purchaser details, agreement, reference and permit number) under `sfp-payment-handoff`, then sends the visitor to `pay-ure/?token=…`. In production the agency's server keeps this; the demo uses the tab's sessionStorage, which is why paying needs browser storage.
3. **The visitor pays on Pay.ure.** Step 1 asks how to pay and for the card or bank details; step 2 shows what will be paid, asks the visitor to authorize it, and pays. Pay.ure records the tracking ID (`PU-` and 10 characters without 0, O, 1 or I), the method, the card brand or account type, and the last four digits.
4. **Pay.ure returns the visitor.** It replaces its own page in the history with the agency's success or cancel address plus `token=…`, so Back does not reopen the payment step.
5. **The agency looks the payment up.** The permit service reads the token, calls `getCollection`, and issues the permit only if the collection was paid for the same reference and amount. It then removes the handoff from storage and cleans up the address bar. The payment appears in "Demo checkout data", on the finished-permit screen and in the PDF's fee line.

Both sites share an origin, so the demo's "server calls" are sessionStorage reads and writes in the same tab. `pay-ure/js/collections.js` is the boundary a real integration would replace with HTTP calls.

## Returns the permit service handles

| What happened | What the visitor sees |
| --- | --- |
| Paid | The finished permit, which replaces the return's history entry: browsers skip, on Back, an entry a page adds without a click, so a new entry would behave differently in each browser. Back goes to Pay.ure, which says the payment is complete. If the permit couldn't be prepared after paying (a download failure, say), the check screen offers "Get my permit", which retries without another payment. |
| Cancelled on Pay.ure | The check screen with every entry kept and "You cancelled your payment on Pay.ure, so nothing was charged." |
| Browser Back from Pay.ure | The check screen with every entry kept and "You left Pay.ure without paying, so nothing was charged." This works after a reload and from the back-forward cache. |
| Returned as paid, but Pay.ure has no payment for the token, or it does not match | The check screen and "We couldn't confirm your payment with Pay.ure, so we haven't issued your permit." No permit. |
| Returned as paid in a tab without the checkout | The start page and "We couldn't find the permit you were paying for…", pointing to a BWL office. |
| Browser storage blocked | Pay stays on the check screen and explains that the site can't save data. Free permits still work. |

Pay.ure itself shows "There's no payment in progress" for a missing or unknown token, and "You've already paid" or "This payment was cancelled" for a finished one, so a payment cannot be made twice.

## Not yet built

Declined cards, insufficient funds and a Pay.ure outage, with test numbers for each, come next, along with a visible verification step on return and fuller handling of a return that has lost its checkout.

Known gap: after Back to Pay.ure, the browser's Forward button reloads the permit service, and Chrome refills the purchaser fields from its own form memory. The check screen then offers to pay again. Recognizing a token that has already been paid for, without keeping purchaser details, is part of that next step.
