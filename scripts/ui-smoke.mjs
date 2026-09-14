// Isolated visual and contract checks. All /api calls go to a local fixture server.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
import { dishes, plan, cart } from "../test/ui-fixtures.mjs";

const base = process.env.UI_TEST_URL || "http://localhost:3100";
const pending = new Map();
const requests = [];
let signedIn = false;
let pendingSignIn;
const send = (response, type, message, data, t = 0) =>
  response.write(`data: ${JSON.stringify({ type, message, data, t })}\r\n\r\n`);
const fixture = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader("Access-Control-Allow-Methods", "*");
  if (request.method === "OPTIONS") {
    response.end();
    return;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  requests.push({ path: request.url, body, method: request.method });
  const json = (value) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(value));
  };
  if (request.url === "/api/pantry/signin" && request.method === "GET") {
    json({ signedIn, connected: signedIn });
    return;
  }
  if (request.url === "/api/pantry/signin" && body.otp) {
    signedIn = true;
    json({ accepted: true });
    send(
      pendingSignIn,
      "done",
      "Signed in",
      { signedIn: true, connected: true },
      8,
    );
    pendingSignIn.end();
    return;
  }
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.flushHeaders();
  if (request.url === "/api/find") {
    if (body.craving === "test error") {
      send(
        response,
        "error",
        "Recipe search is temporarily unavailable. Please try again.",
      );
      response.end();
      return;
    }
    if (body.craving === "test empty") {
      send(response, "dishes", "No usable recipes", { dishes: [], seconds: 2 });
      response.end();
      return;
    }
    send(
      response,
      "budget",
      "Keeping dinner around ₹200",
      { budget: 200, mode: "around" },
      0.1,
    );
    send(
      response,
      "search",
      "Searching for different ways to cook paneer",
      null,
      0.2,
    );
    send(
      response,
      "read",
      "Reading cookwithmanali.com and checking recipe ingredients",
      null,
      1.8,
    );
    pending.set("find", () => {
      send(
        response,
        "budget",
        "Three dishes fit your budget",
        { budget: 200, mode: "around", within: 3 },
        2.1,
      );
      send(
        response,
        "dishes",
        "Five recipes shortlisted",
        { dishes, seconds: 2.4 },
        2.4,
      );
      response.end();
    });
  } else if (request.url === "/api/cook") {
    send(response, "read", "Reading the selected recipe", null, 0.1);
    send(
      response,
      "think",
      "Checking fresh tomato against the concentrated puree the recipe needs",
      null,
      2.4,
    );
    pending.set("cook", () => {
      send(response, "covered", "Onion — you already have it", null, 5.2);
      send(
        response,
        "plan",
        "Kitchen checked",
        { ...plan, serves: body.serves },
        5.7,
      );
      response.end();
    });
  } else if (request.url === "/api/basket") {
    send(
      response,
      "cart",
      "Cart currently holds 0 items",
      { cart: { items: [], total: 0 } },
      0.3,
    );
    send(
      response,
      "item",
      "Looking for paneer",
      { name: "paneer", state: "working" },
      0.8,
    );
    pending.set("basket", () => {
      for (const [index, item] of plan.buy.entries()) {
        const product = cart.items[index];
        send(
          response,
          "item",
          product ? `${item.name} added` : "Coriander leaves unavailable",
          product
            ? {
                name: item.name,
                state: "added",
                product: product.name,
                pack: product.pack,
                price: product.price,
                substituted: index === 2,
              }
            : {
                name: item.name,
                state: "failed",
                why: "Fresh coriander is out of stock at this location.",
              },
          index + 2,
        );
      }
      send(
        response,
        "check",
        "Cart readback found a minimum order quantity of 2 for garam masala",
        null,
        9,
      );
      send(
        response,
        "done",
        "Cart readback complete",
        { cart, added: 5, asked: 6 },
        10,
      );
      response.end();
    });
  } else if (request.url === "/api/pantry/signin") {
    send(
      response,
      "search",
      "Finding the selected cupboard staples",
      null,
      0.2,
    );
    send(response, "otp", "Verification code sent", null, 1);
    pendingSignIn = response;
  } else if (request.url === "/api/pantry") {
    send(
      response,
      "item",
      "Checking ghee",
      { name: "ghee", state: "working" },
      0.5,
    );
    pending.set("pantry", () => {
      send(
        response,
        "item",
        "Ghee added",
        {
          name: "ghee",
          state: "added",
          product: "Amul Pure Ghee",
          price: 0,
          priceUnknown: true,
        },
        3,
      );
      send(
        response,
        "item",
        "Garam masala unavailable",
        {
          name: "garam masala",
          state: "failed",
          why: "No suitable pack was in stock.",
        },
        4,
      );
      send(
        response,
        "done",
        "Cart verified",
        {
          added: 1,
          asked: 2,
          cart: {
            marketplace: "flipkart.com",
            items: [{ name: "Amul Pure Ghee", price: 325 }],
          },
        },
        5,
      );
      response.end();
    });
  } else {
    response.statusCode = 404;
    response.end();
  }
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const fixtureBase = `http://127.0.0.1:${fixture.address().port}`;
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: "light",
});
const errors = [];
context.on("page", (page) =>
  page.on("pageerror", (error) => errors.push(error.message)),
);
await context.route("**/api/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/api/photo") {
    await route.fulfill({ status: 404, body: "" });
    return;
  }
  await route.continue({ url: `${fixtureBase}${path}` });
});
await mkdir("cache/ui-review", { recursive: true });
const page = await context.newPage();
const snapshot = async (name) => {
  await page.waitForTimeout(240);
  await page.screenshot({ path: `cache/ui-review/${name}.png` });
  console.log(`Screenshot ${name}`);
};
const release = (name) => {
  assert.ok(pending.has(name), `Pending ${name} request`);
  pending.get(name)();
  pending.delete(name);
};
const noOverflow = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "No horizontal document overflow",
  );
try {
  await page.goto(base);
  await page.locator(".welcome-art img").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await snapshot("desktop-home");
  await noOverflow();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await snapshot("desktop-home-dark");
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.getByRole("button", { name: "My kitchen" }).click();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByRole("button", { name: "More servings" }).click();
  await page.getByLabel("Add another ingredient").fill("lemon");
  await page
    .getByRole("button", { name: "Add ingredient", exact: true })
    .click();
  await snapshot("desktop-kitchen");
  await page.getByRole("button", { name: "Back to dinner" }).click();
  await page
    .getByLabel("What do you feel like cooking?")
    .fill("something with paneer around ₹200");
  await page.getByRole("button", { name: "Find dinner" }).click();
  await page
    .getByRole("heading", { name: "Searching the recipe shelves" })
    .waitFor();
  await page.locator(".budget-setting").filter({ hasText: "₹200" }).waitFor();
  await snapshot("desktop-searching");
  release("find");
  await page
    .getByRole("heading", { name: "Your shortlist", exact: true })
    .waitFor();
  assert.equal(await page.locator(".dish-card").count(), 5);
  await page.locator(".dish-card .photo-fallback").waitFor();
  await snapshot("desktop-results");
  const findRequest = requests.find((request) => request.path === "/api/find");
  assert.deepEqual(findRequest.body, {
    craving: "something with paneer around ₹200",
    pantry: ["onion", "tomato", "oil", "salt", "lemon"],
    pages: 16,
    want: 5,
    budget: 0,
    budgetMode: "around",
  });
  await page
    .getByRole("button", { name: "Plan Paneer Butter Masala", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Checking Paneer Butter Masala",
      exact: true,
    })
    .waitFor();
  release("cook");
  await page
    .getByRole("heading", { name: "The little shopping list" })
    .waitFor();
  assert.equal(
    requests.find((request) => request.path === "/api/cook").body.serves,
    4,
  );
  assert.equal(
    await page.locator(".dish-card").count(),
    0,
    "Unselected grid collapses after selection",
  );
  assert.match(
    await page.locator(".buy-list").innerText(),
    /Fresh tomato does not cover tomato puree/,
  );
  await snapshot("desktop-plan");
  await page
    .locator(".workspace-scroll")
    .evaluate((element) => (element.scrollTop = element.scrollHeight));
  await snapshot("desktop-plan-details");
  await page.getByRole("button", { name: "Add 6 to Flipkart Minutes" }).click();
  await page.locator(".buy-row.is-working").waitFor();
  await snapshot("desktop-filling");
  release("basket");
  await page
    .getByRole("link", { name: "Review your cart", exact: true })
    .waitFor();
  assert.match(
    await page.locator(".buy-list").innerText(),
    /Alternative added: Aachi Garam Masala/,
  );
  assert.match(
    await page.locator(".buy-list").innerText(),
    /Unavailable: Fresh coriander/,
  );
  assert.match(
    await page.locator(".workspace-aside .basket-items").innerText(),
    /qty 2/,
  );
  assert.equal(
    await page.locator(".method-steps").count(),
    1,
    "Cooking steps open after filling",
  );
  await snapshot("desktop-complete");
  await page.setViewportSize({ width: 400, height: 860 });
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  assert.equal(
    await page.locator("html").getAttribute("data-theme"),
    "dark",
    "Mobile theme control stays synchronized after desktop toggle",
  );
  await snapshot("mobile-plan-dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await noOverflow();
  await page
    .locator(".workspace-scroll")
    .evaluate((element) => (element.scrollTop = 0));
  await snapshot("mobile-plan");
  await page.getByRole("button", { name: "Basket", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await snapshot("mobile-basket");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await snapshot("mobile-activity");
  await page.keyboard.press("Escape");
  await page.goto(base);
  await page
    .getByRole("heading", { name: "What sounds good tonight?" })
    .waitFor();
  await snapshot("mobile-home");
  await noOverflow();
  await page.getByRole("button", { name: "My kitchen" }).click();
  await snapshot("mobile-kitchen");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 900, height: 1000 });
  await snapshot("tablet-home");
  await noOverflow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await snapshot("desktop-1080p");
  await noOverflow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel("What do you feel like cooking?").fill("test error");
  await page.getByRole("button", { name: "Find dinner" }).click();
  await page.locator(".error-notice").waitFor();
  await snapshot("desktop-error");
  await page.getByLabel("What do you feel like cooking?").fill("test empty");
  await page.getByRole("button", { name: "Find dinner" }).click();
  await page
    .getByRole("heading", { name: "No usable recipes this time." })
    .waitFor();
  await page.goto(`${base}/pantry`);
  await page
    .getByRole("heading", { name: "A well-stocked kind of kitchen." })
    .waitFor();
  await snapshot("desktop-cupboard");
  await page.getByRole("button", { name: "ghee", exact: true }).click();
  await page.getByRole("button", { name: "garam masala", exact: true }).click();
  await page
    .locator(".workspace-aside")
    .getByLabel("Flipkart phone number")
    .fill("9999999999");
  await page
    .locator(".workspace-aside")
    .getByRole("button", { name: "Send verification code" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Flipkart verification code").waitFor();
  assert.equal(
    await dialog
      .getByLabel("Flipkart verification code")
      .evaluate((element) => element === document.activeElement),
    true,
    "OTP is focused when the live handover opens",
  );
  await snapshot("desktop-otp");
  await dialog.getByLabel("Flipkart verification code").fill("123456");
  await dialog.getByRole("button", { name: "Verify & continue" }).click();
  await page.locator(".pantry-item-results").waitFor();
  await snapshot("desktop-cupboard-running");
  release("pantry");
  await page
    .getByRole("heading", { name: "1 of 2 added to your cart." })
    .waitFor();
  await snapshot("desktop-cupboard-complete");
  assert.match(
    await page.locator(".pantry-item-results").innerText(),
    /Price not available/,
  );
  assert.match(
    await page.locator(".pantry-readback").innerText(),
    /Amul Pure Ghee/,
  );
  assert.deepEqual(
    requests.find((request) => request.path === "/api/pantry").body.items,
    ["ghee", "garam masala"],
  );
  await page.setViewportSize({ width: 400, height: 860 });
  await snapshot("mobile-cupboard");
  await noOverflow();
  await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow();
  assert.deepEqual(errors, [], "No browser runtime or hydration errors");
  console.log(
    "PASS: desktop/mobile layouts; theme persistence; recipe API contracts; chunked CRLF SSE; image fallback; budget event; recipe planning; cart states; OTP and automatic pantry continuation.",
  );
} finally {
  await browser.close();
  fixture.closeAllConnections();
  await new Promise((resolve) => fixture.close(resolve));
}
