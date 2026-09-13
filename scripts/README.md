# Dev scripts

Not part of the product. Tools used while building, kept because they're how the
agent gets inspected when something looks wrong.

Run them from the repo root:

```bash
node scripts/cartdump.js         # read the real Flipkart Minutes cart and print it
node scripts/probe.js            # what schema.org Recipe JSON-LD actually gives us
node scripts/testreason.js       # the reasoning layer on a fixed recipe, no network
node scripts/shot.js [url] [out] # screenshot the local UI through your own Chrome
node scripts/shotflow.js         # drive a real search + plan and capture both screens
```

The screenshot drivers need Chrome on a debug port:

```bash
chrome --remote-debugging-port=9222
```

`fklogin.js` drives a Flipkart OTP login inside **Anakin's cloud browser** and
saves the session. It belongs to an approach we abandoned — the agent now acts
inside your own local Chrome, so your login never leaves your machine. Kept only
as a record of the route that didn't work.
