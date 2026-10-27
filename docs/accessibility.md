# Accessibility verification

## Automated coverage

The browser suite tests semantic roles and names, native required states, keyboard selection of options, focus moving to each new screen's heading, inline error descriptions, error summary focus and field links, the browser Back button, and focus on the finished permit. Axe scans run on every screen (what, where, permit with quantity, completed details, the error summary, the check screen and the finished permit) with WCAG 2 A/AA, 2.1 AA and 2.2 AA rules. The CI matrix covers Chromium, Firefox, WebKit, and actual installed Safari on macOS.

How the one-question-per-screen flow is built for assistive technology:

- Only the current screen is in the page; the others use `hidden`, so they are out of the tab order and the accessibility tree.
- Each screen is a form named by its `<h1>`. Moving to a screen focuses that heading and updates the page title ("Where will you collect? – Step 2 of 5 – …"). The first load leaves focus with the browser.
- The Back link, the browser's Back and Forward buttons, and the review screen's Change links all move between screens. A screen cannot be reached before the answers it depends on.
- Options are native radios in cards. Each radio is named by its short title and described by its price and limits. The quantity panel opens inside the chosen permit.
- The quantity stepper's buttons use `aria-disabled` at the limits rather than `disabled`, so focus is not dropped. A polite live region reads the new total ("Total for 3 cords $36.00").
- Errors sit above their field and are attached with `aria-describedby`; text fields also get `aria-invalid`. A group of radios is described by its error, because `aria-invalid` is not allowed on a group. Pressing Continue with problems shows a focused error summary whose links move to each field, or to the first option of a group.
- The Pay button announces busy status while the PDF is prepared and keeps focus. Failures keep every entry.
- Tap targets are at least 44px. Text fields are 52px tall, and body text is 17px in Atkinson Hyperlegible Next.

Automated accessibility-tree and DOM checks are not a listening test with VoiceOver, NVDA, or JAWS. Human screen-reader testing has not been completed by this automation.

## Human listening checklist

Use fictional purchaser data. Test VoiceOver with Safari on a Mac and NVDA with Firefox on Windows. With default settings and the screen reader running:

1. On load, navigate by headings: find the screen's question and "Need help?". Use the skip link to reach the main content.
2. Choose a collection type with the arrow keys and press Continue. Confirm the next question is spoken, and that "Step 2 of 5" is available from the page title.
3. Choose a state and an area. Confirm each area's permit count is read. Open "Area notices and maps" and follow a link.
4. Choose a permit. Confirm its name is short and its price and limits are read. Use the − and + buttons and confirm the total is announced; at a limit, confirm the button says it is unavailable and focus stays. Enter an invalid quantity and Tab away; confirm the error is read with the field and focus is not moved.
5. On "Your details", press Continue with fields empty. Confirm the error summary is announced and focused, and that a link moves to its field. Type an invalid email and leave the field: confirm the error is announced then, not while typing.
6. On "Check and pay", use each Change link and confirm Continue brings you back. Press Pay without agreeing and confirm the error links to the agreement.
7. Get a no-fee permit. Confirm busy status is understandable, "Your permit is ready" receives focus, and Download is reachable. Use the browser Back button, change your name, and confirm the old permit can no longer be reached.
8. Reload during the flow. Confirm selections restore, the screen returns to "Your details" at most, and purchaser information must be reentered.

Record OS/browser/screen-reader versions, whether browse or focus mode was used, unexpected speech/focus behavior, and the exact action that caused it. Screen-reader verification of the downloaded PDF is a separate task: the PDF has an embedded font and extractable text but is not certified PDF/UA.
