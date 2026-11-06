# Demo tools

Facilitators and developers can fill fields, jump between screens and break things on purpose from a "Demo tools" drawer. The tools are off by default, so usability participants never see them.

## Turning them on

- **Turn on:** select **Demo tools** in the footer of the permit service or Pay.ure. The tools stay on in that browser tab, across pages and the round trip to Pay.ure, until you select it again or close the tab.
- **Close:** folds the drawer to a "Demo tools" tab in the corner without turning the tools off.
- **On a phone:** the drawer is a sheet over the lower part of the screen.

The drawer lists only what applies to the screen on view.

## Break on purpose

Each switch breaks one part until it is switched off. A switch is listed where it matters, and always while it is on, so it can be turned off from anywhere.

| Switch | Where it is listed | What happens |
| --- | --- | --- |
| Permit catalog fails to load (server error, bad data, or no answer for 15 seconds) | Start page to Choose a permit | The catalog load error on every screen, with Try again. Switching, or choosing how it fails, reloads the page: choices are kept, typed details are not. |
| PDF engine doesn't download | Check and pay | "We couldn't create your permit because part of this page didn't download…" on every try. |
| Browser storage blocked | Check and pay, for a paid permit | Pay stays here with "We couldn't take you to Pay.ure because your browser is blocking this site from saving data…" |
| Pay.ure is down for every payment | Check and pay for a paid permit, and Pay.ure | Any card or account gets Pay.ure's "isn't working right now" page. |
| Pay.ure reports the wrong amount | Check and pay for a paid permit, and Pay.ure | Any approving card or account pays, but the permit service's check on return refuses it. |
| Checkout lost on the return from Pay.ure | Check and pay for a paid permit, and Pay.ure | The return can't find the checkout: "We couldn't find the permit you were paying for…" |

**While any switch is on,** a striped "Broken on purpose" banner names it at the top of every page, even with the tools off. Its **Fix all** button turns every switch off. A load-time switch reloads the page.

**The switches are hooks in the app itself.** `demoBreak()` in `demo/state.js` is called where each failure happens. With no switch on, it returns `null` and nothing changes. Failures that stop the page itself (app.js missing, JavaScript off) can't be switched from the page; `tests/browser-errors.mjs` covers them.

## Fill this screen

Fills act the way a visitor does: they type a value and leave the field, click an option, or press Continue. So every message is the app's own. Red buttons fill something that shows an error.

**Permit service:**

| Screen | Fills |
| --- | --- |
| What are you collecting? | Each collection type, and Continue with nothing chosen |
| Where will you collect? | Alaska, a state with no areas online, no state, and no area |
| Choose a permit | A paid, free or subsistence permit. Quantity minimum, maximum, empty, zero, too many, and not a whole number. Certifying or not. Continue with none chosen |
| Your details | All valid, or all empty then Continue. Every field has valid values and each error it can show: empty, too short, too long, characters the permit can't print. Confirm email matching, empty or different |
| Check and pay | Agree, or press Pay without agreeing. When an earlier payment can be got again: its permit number, its tracking ID, empty, or wrong |

**Pay.ure:**

| Step | Fills |
| --- | --- |
| Step 1 | A complete card or bank account that approves, and each method. Card fields appear once "Debit or credit card" is chosen: every test card by outcome, a real-looking number, letters, and expiry dates valid, this month, expired, month 13 and not a date. Bank fields appear once "Bank account" is chosen: account type, routing numbers valid, one wrong digit, a real bank's and too short, every test account, and matching or different confirmation |
| Step 2 | Authorize, or press Pay without authorizing |

## Go to, stored data and reset

- **Go to** answers every earlier screen with valid entries and stops on the one chosen: any question, Check and pay for a paid, free or subsistence permit (Anchorage, Alaska, where all three are on sale), or a finished free permit. On Pay.ure it goes to step 2 with an approving card, or cancels back to the permit service.
- **Stored in this tab** shows what the tab's sessionStorage holds: saved choices, a checkout waiting for Pay.ure, Pay.ure's collections, paid permits and the tools' own state.
- **Reset demo state** clears all of it and every switch, then opens the permit service's start page. The tools stay on.

## Pay.ure's test numbers for participants

Participants still pay with Pay.ure's "Demo test numbers" panel. It appears on step 1 once a payment method is chosen, and lists only that method's numbers. Pay.ure's demo note says the numbers appear once you choose how to pay.

## Files

| File | Responsibility |
| --- | --- |
| `demo/boot.js` | Loaded on every page: the footer toggle, the banner, and loading the drawer when the tools are on |
| `demo/state.js` | The tools' state in sessionStorage, the switch definitions, and `demoBreak()` for the app's hooks |
| `demo/drawer.js`, `demo/demo.css` | The drawer, loaded only when the tools are on |
| `demo/bwl.js`, `demo/payure.js` | What each site's screens offer: fills, jumps and which switches matter |
| `demo/navigate.js` | Reloads and navigation, so the DOM tests can follow them |
