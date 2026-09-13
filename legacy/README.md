# Superseded

Nothing here is imported. Kept for the one thing each of them proved.

## `cdp.js`

A minimal Chrome DevTools Protocol driver for a single page target, written
because **Playwright's `chromium.connectOverCDP()` attaches to every target in the
browser** — with 17 tabs open, one slow tab stalled the whole connection and every
run timed out.

It solved that. It also lost: Flipkart's UI is React Native Web, which ignores raw
CDP `Input.dispatchMouseEvent` entirely. Only Playwright's real
`mouse.move → down → up` sequence produces a click the page believes.

So the working answer turned out to be Playwright *with* a narrowed target, not a
hand-rolled CDP driver. Both halves of that are in `../ANAKIN-BUG-REPORT.md`.
