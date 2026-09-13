# Demo runbook — the remote path, start to finish

**Proven working 14 Sep 2026, 03:0x IST.** One item into the real flipkart.com cart,
signed in on a fresh number, nothing running on the local machine.

> **Read this first:** the browser does the add, not Wire. See [Who does what](#who-does-what).
> Saying "Wire added to cart" is the one claim an Anakin judge can disprove in ten seconds.

---

## The verified run

```
 0.1s  wire      fk_search_products × 1, in parallel
 0.0s  wire      opening an Anakin cloud browser (1 credit / 2 min)
 7.7s  wire      tunnel open (attempt 1)
 9.5s  warn      restored cookies are not accepted by Flipkart — a fresh sign-in is needed
15.5s  wire      entered 859****950
18.9s  otp       Flipkart has sent an OTP — enter it to continue
27.4s  option    garam masala — 10 returned · 8 are really garam masala
30.2s  think     garam masala: picked #4 — Plain garam masala; simplest direct
                 match over whole/sabut or super variants
30.2s  check     1 of 1 decided — the browser only has to click now
      ... OTP supplied ...
 8.9s  item      garam masala → EVEREST Garam Masala
  14s  done      1 of 1 in your flipkart.com cart
```

Readback from `flipkart.com/viewcart`, which is the only evidence that counts:

```
Account  More  1 Cart
EVEREST Garam Masala  100 g  4.5 • (902)
Qty: 2   2% off   ₹272 → ₹266
Delivery by Sep 21, Mon
Minimum Order Quantity: 2
```

---

## Who does what

| Step | Who | Sees a page? |
|---|---|---|
| Find the product, return `pid` | **Wire** `fk_search_products` (2 cr) | ❌ JSON only |
| Choose which of 10 is really the thing | **the model**, one batched call | ❌ |
| Open the PDP, find the button, click, confirm | **Anakin cloud browser** (1 cr / 2 min) | ✅ |
| Prove it landed | cart readback | ✅ |

`fk_add_to_cart` is **not used** — it needs a Wire identity built from a saved browser
session, and `save_session` never persists an authenticated cookie jar
(ANAKIN-BUG-REPORT §12–13). Confirmed again 14 Sep: still frozen at 14 cookies.

---

## Run it

Dev server on `localhost:3000`, then **http://localhost:3000/pantry**

1. Pick **4–5 items**. Not ten — see the budget below.
2. Phone number → **Sign in**
3. **Have the phone in your hand before you click.** The OTP box appears at ~19s and
   every second you take comes out of the add budget.
4. Enter the OTP → the browser is held open
5. **Stock up** → each item added, then the cart read back
6. Open Flipkart on your phone → the **Flipkart** tab

While the OTP is in flight the shelf is already being decided (`src/shelf.js`), so by
the time the code lands there is nothing left to think about — only clicks.

### Driving it headless (what we did)

```bash
# 1. start sign-in in the background; it streams and waits for the code
curl -sN -X POST localhost:3000/api/pantry/signin -H 'Content-Type: application/json' \
  -d '{"phone":"XXXXXXXXXX","items":["garam masala"]}' > cache/signin_live.log &

# 2. wait for awaitingOtp:true
curl -s localhost:3000/api/pantry/signin

# 3. hand over the code
curl -s -X POST localhost:3000/api/pantry/signin -H 'Content-Type: application/json' \
  -d '{"otp":"123456"}'

# 4. add
curl -sN -X POST localhost:3000/api/pantry -H 'Content-Type: application/json' \
  -d '{"items":["garam masala"]}'

# diagnostics / reset
curl -s        localhost:3000/api/pantry/peek      # what is the browser looking at
curl -s -X DELETE localhost:3000/api/pantry/signin # close and start clean
```

---

## The budget — this is the whole constraint

| | |
|---|---|
| Overhead before the OTP is requested | **~19s** (was 43s) |
| Observed session lifetime | **102–167s** |
| Human reading an SMS | ~30–45s |
| Per add | ~9–25s |

**So: 4–5 items, and move fast.** The 4-add run that took the cart from 2 → 6 is the
most that has ever fitted in one session.

### Credits

| | |
|---|---|
| `fk_search_products` | **2 × items** (`ANAKIN_API_KEY`) |
| The add itself | **0** — it's a browser click |
| Cloud browser | 1 / 2 min (`ANAKIN_SESSION_KEY`), **up to 3** — `openBrowser` races 3 tunnels |

A 5-item run ≈ **13 credits**. Credits are not the constraint; the session is.

---

## If it breaks

| Symptom | Cause | Do this |
|---|---|---|
| `connected:false` on waking | the held tunnel died overnight | normal — just sign in again |
| `Flipkart refused to send an OTP … "Maximum attempts reached"` | that number is throttled 24h | **use another number** |
| `tunnel would not open after 3 tries` | Anakin tunnels fail ~2 in 3 | retry; the race usually wins |
| `the page does not look signed in — trying anyway` | the flag disagrees with the page | let it run, the readback decides |
| Session dies mid-run | 102–167s ceiling | `DELETE /api/pantry/signin`, fewer items, retry |

**Every retry costs a fresh OTP.** Don't burn attempts debugging — use
`/api/pantry/peek` to see the page for free.

---

## What was fixed to make this work (14 Sep)

All in `src/cloudcart.js` unless noted.

1. **`signedIn` was hardcoded to the string `Ashutosh`** — any other account reported a
   successful login as a failure. Now reads the *absence* of "Login" plus the presence
   of "Account"/"Cart", so it is account-agnostic.
2. **Post-OTP poll 14 → 30.** ← *the actual killer.* Flipkart's redirect took longer than
   9.8s, so a genuinely authenticated browser was thrown away with
   *"OTP submitted but Flipkart still shows a login screen"*.
3. **Phone-field poll 7 → 20.** `settle()` returns once body text clears 600 chars, and
   Flipkart's footer alone does that while the login card is still hydrating. We gave up
   at 4.9s, fell back to the homepage modal and lost ~30s. **43.0s → 12.9s.**
4. **`recheck()` (new)** — re-reads the live page instead of trusting the cached flag,
   and **clears a dead tunnel** so `connected` stops lying. Both routes now gate on it.
5. **`ensurePincode` used `$eval`/`$`** instead of `$$eval`/`$$` — `findIndex` threw, the
   catch swallowed it, and it returned `-1` every time. The delivery-address gate it
   exists to clear was never cleared on an account without a saved address.
6. **`BLOCKED` regex** had `d+` instead of `\d+` (backslash-stripping damage).

`npm test` — 64/64 pass.

---

## The beat worth showing

> **Minimum Order Quantity: 2** — Qty came back as **2**, ₹266.

Nothing in the pipeline asked for 2. Flipkart enforced its own minimum and **the agent
knows**, because it read the cart back instead of believing its own click. That is
"a click is never evidence" paying off on camera, and it was not staged.
