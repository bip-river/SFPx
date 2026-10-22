# Accessibility verification

## Automated coverage

The browser suite tests semantic roles/names, native required states, keyboard navigation, locked/inert panels, inline error descriptions, confirmation focus, and a polite ready announcement. Axe scans run at four stages with WCAG 2 A/AA, 2.1 AA and 2.2 AA rules. The CI matrix covers Chromium, Firefox, WebKit, and actual installed Safari on macOS.

This work corrected an invalid `aria-required` on a fieldset, links distinguished only by color, and undersized location-document links. It also gives product radios concise names, separates document links from radio labels, adds step headings, and makes completed PDF generation announce itself and receive focus. Async PDF generation is announced as busy; errors preserve user entries. Browser-return/load handling clears purchaser fields, and address-state selects respond to native change events as well as input.

Automated accessibility-tree and DOM checks are not a listening test with VoiceOver, NVDA, or JAWS. Human screen-reader testing has not been completed by this automation.

## Human listening checklist

Use fictional purchaser data. Test VoiceOver with Safari on a Mac and NVDA with Firefox on Windows. With default settings and the screen reader running:

1. Navigate by headings: find the page title, three named steps, and help. Use the skip link to reach the main content.
2. Select a collection type and state. In the office combobox, use arrow keys, Enter, and Escape. Confirm the active option and expanded/collapsed state are spoken; focus stays in the input until selection/navigation.
3. Reach product radios. Confirm each name is concise and its validity/availability can be read. Expand maps/rules and follow their links without changing the selected radio.
4. Enter an invalid quantity and Tab away. Confirm the error is associated with the quantity, navigation is not trapped, and Step 3 stays unavailable. Correct it and confirm the step can be reached.
5. Read and accept agreements. Confirm required purchaser fields have understandable names and required states. Navigate into and out of all fields and details controls with the keyboard.
6. Generate a no-fee demo permit. Confirm busy status is understandable, completion focuses the named confirmation, and Download is reachable. Edit the name and confirm the old download is unavailable. Reset and confirm old purchaser data is cleared.
7. Reload a saved selection. Confirm products restore while purchaser information must be reentered. No hidden, disabled, or inert field should be reachable.

Record OS/browser/screen-reader versions, whether browse or focus mode was used, unexpected speech/focus behavior, and the exact action that caused it. Screen-reader verification of the downloaded PDF is a separate task: the PDF has an embedded font and extractable text but is not certified PDF/UA.
