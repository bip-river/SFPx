# Pay.ure, the demo payment site

Pay.ure is the fictional payment site that the forest product permit service sends visitors to for a paid permit. It is run, in the fiction, by the Bureau of Fiscal Wherewithal of the Treasury of the United Regions. It lives in `pay-ure/` and is published next to the permit service, at `pay-ure/` under the same address.

Pay.ure is a demo too. It accepts only the test numbers it lists, charges nothing, and never stores a card or account number.

## Test numbers

Each number gives one outcome, so a facilitator can show every path on purpose. Cards take any future expiry date (the current month counts) and any 3-digit security code.

| Card | Number | Outcome |
| --- | --- | --- |
| Visa | 4111 1111 1111 1111 | Approves |
| Mastercard | 5555 5555 5555 4444 | Approves |
| Visa | 4000 0000 0000 0002 | Declined. Pay.ure goes back to step 1 with "Your card was declined, so nothing was charged." |
| Visa | 4000 0000 0000 9995 | Insufficient funds. Back to step 1 with "…isn't enough money or credit available…" |
| Visa | 4000 0000 0000 0119 | Pay.ure is down. "Pay.ure isn't working right now" page; nothing charged; Return goes back to the check screen |
| Visa | 4000 0000 0000 0259 | Reports the wrong amount. Pay.ure takes the payment but reports a tenth of the amount, so the permit service's check refuses it |

| Bank account | Routing number | Account number | Outcome |
| --- | --- | --- | --- |
| Checking or savings | 551234561 | 1234567890 | Approves |
| Checking or savings | 551234561 | 2222222222 | Declined |
| Checking or savings | 551234561 | 3333333333 | Insufficient funds |

A declined attempt is recorded on the collection (method, last 4 digits, reason), and the collection stays open so the visitor can choose another card or account.

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
3. **The visitor pays on Pay.ure.** Step 1 asks how to pay and for the card or bank details; step 2 shows what will be paid, asks the visitor to authorize it, and pays. Pay.ure records the tracking ID (`PU-` and 10 characters without 0, O, 1 or I), the amount paid, the method, the card brand or account type, and the last four digits.
4. **Pay.ure returns the visitor.** It replaces its own page in the history with the agency's success or cancel address plus `token=…`, so Back does not reopen the payment step.
5. **The agency looks the payment up and checks it.** The permit service reads the token, calls `getCollection`, and checks three things: the status is `success`, the reference is its own, and the amount paid is the checkout's total. It issues the permit only when all three pass. The checks appear under `payment.verification` in "Demo checkout data", each with what was expected and what was found. The handoff is removed from storage and the address bar cleaned up either way.
6. **The agency remembers the payment.** A verified payment is kept under `sfp-paid-permits` with its token, reference, permit number, amount, method, last four digits and checks, and a one-way fingerprint of the checkout instead of the purchaser's details. When the same permit and details are entered again in that tab, after a reload, the browser's Forward button (which can refill the form) or Pay.ure's Return link, the check screen offers "Get my permit" with the same permit number instead of a second payment. "Start over" and "Start another permit" forget these records, so the same details can buy a second permit. The fingerprint is a 53-bit hash: enough to recognize the same entries in one tab, not a cryptographic protection.

Both sites share an origin, so the demo's "server calls" are sessionStorage reads and writes in the same tab. `pay-ure/js/collections.js` is the boundary a real integration would replace with HTTP calls.

## Returns the permit service handles

| What happened | What the visitor sees |
| --- | --- |
| Paid, and the checks pass | The finished permit, which replaces the return's history entry: browsers skip, on Back, an entry a page adds without a click, so a new entry would behave differently in each browser. Back goes to Pay.ure, which says the payment is complete; its Return button comes back with the "already paid" notice below. If the permit couldn't be prepared after paying (a download failure, say), the check screen offers "Get my permit", which retries without another payment. |
| Paid, but for the wrong amount | The check screen and "Pay.ure reports a payment of $1.00, but this permit costs $10.00, so we haven't issued it. Don't pay again. Contact your local BWL office with your name, email address and Pay.ure tracking ID…". No permit, and the payment is not remembered as paid. |
| Pay.ure was down | The check screen with every entry kept and "Pay.ure couldn't take your payment, so nothing was charged. Wait a few minutes, then try again." |
| Cancelled on Pay.ure | The check screen with every entry kept and "You cancelled your payment on Pay.ure, so nothing was charged." |
| Browser Back from Pay.ure | The check screen with every entry kept and "You left Pay.ure without paying, so nothing was charged." This works after a reload and from the back-forward cache. |
| Returned as paid, but Pay.ure has no payment for the token, or it does not match | The check screen and "We couldn't confirm your payment with Pay.ure, so we haven't issued your permit." No permit. |
| Returned as paid for a permit this tab already issued | The furthest screen the saved choices allow (usually Your details) and "You've already paid $10.00 for permit … To download it again, choose the same permit and enter the same details as before. You won't be charged again." |
| Returned as paid in a tab without the checkout or a record of it | The start page and "We couldn't find the permit you were paying for…", pointing to a BWL office. |
| Browser storage blocked | Pay stays on the check screen and explains that the site can't save data. Free permits still work. |

Pay.ure itself shows "There's no payment in progress" for a missing or unknown token, and "You've already paid", "This payment was cancelled" or "This payment didn't go through" for a finished one, so a payment cannot be made twice.

## Limits

The permit service recognizes a paid permit only in the tab that paid for it, and only until "Start over". A visitor who paid in another tab, or cleared site data, is pointed to a BWL office. In production the agency's server would look the payment up instead.
