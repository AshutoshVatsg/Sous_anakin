# Sous — cart handover (Chrome extension)

The web app decides **what** to buy. This does the last step: adding those items to
**your own** Flipkart Minutes cart, in **your own** signed-in session.

Your Flipkart login never leaves your machine, nothing is stored, and the extension
cannot pay — it stops at a filled cart, exactly like the agent does.

---

## Install (30 seconds, no build step)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder

## Use it

1. Be **signed in to Flipkart** in that browser, with a **Minutes delivery address** set
   (open `flipkart.com/search?q=paneer&marketplace=HYPERLOCAL` once and set your pincode)
2. Click the **Sous** toolbar icon
3. Paste your shopping list — one item per line, or the JSON the app gave you
4. **Add to my Flipkart cart**

It opens (or reuses) a Flipkart tab, adds each item, and reads the cart back after
every one. Progress appears live in the popup.

---

## Why it needs the `debugger` permission

Chrome shows a *"Sous is debugging this browser"* banner while a run is in progress.
That is unavoidable, and it is the honest reason:

**Flipkart's storefront is React Native Web.** It ignores `element.click()` and it
ignores a lone dispatched mouse event — which is all a normal content script can
produce. A content-script click silently does nothing and the cart badge never moves.

`chrome.debugger` can send `Input.dispatchMouseEvent`, which arrives as a **trusted**
event. A full `move → down → up` sequence is what the page actually believes. It is
the same mechanism the local agent used through Playwright.

The banner disappears the moment the run finishes — the extension detaches in a
`finally` block.

---

## What it does, and what it deliberately doesn't

**Does**
- Searches Flipkart Minutes for each item
- Picks the matching card by product identity, not by position
- Clicks Add with a real trusted mouse event
- **Reads the cart back after every add** — a click is never evidence
- Retries up to 3 times per item, because some Add buttons silently refuse
- Skips anything already in the cart

**Doesn't**
- Log in for you
- Store, send or see your credentials — it never touches the login page
- Pay, or reach checkout
- Talk to any server. Everything happens between your browser and Flipkart

---

## Two details ported from the local agent

Both cost real hours to find, and the extension would fail without them:

**Only the innermost `Add` elements count.** A Minutes results page carries ~120
elements whose text is "Add", and most are ancestors wrapping several cards. Matching
naively clicks a wrapper and lands on the wrong product — or on nothing.

**Never scroll before clicking.** The grid lazy-loads: a single scroll took the Add
count from 20 to 22, React replaced the card, and the element measured a moment
earlier no longer existed when the click arrived. So only cards already on screen are
considered, and their coordinates are taken in the same pass that chooses them.

---

## If something doesn't work

| What you see | Why |
|---|---|
| *nothing on screen matched* | Minutes has no result for that term at your pincode |
| *didn't reach the cart — trying another* | Normal. Flipkart renders an Add button for items it won't actually sell; the retry is the fix |
| cart reads empty while holding items | You're not signed in, or no Minutes delivery address is set |
| nothing happens at all | The Flipkart tab was closed mid-run — reopen it and retry |
