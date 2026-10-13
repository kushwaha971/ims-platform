#!/usr/bin/env node
/** B43: the full three-decimal quantity must fit beside its unit, including the table layout. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { addParty, must, newUser, uniq } from "./lib/fixtures.mjs";
import { inputFit } from "./lib/input-fit.mjs";

const before = process.argv.includes("--before");
const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const out = process.env.SHOTS ?? "/tmp/quantity-look";
mkdirSync(out, { recursive: true });
const owner = await newUser({ name: "Quantity Owner" });
const tenant = await must(
  "POST",
  "/tenants",
  {
    name: `Quantity ${uniq()}`,
    business_type: "retail",
    state_code: "27",
    apps: ["shop"],
  },
  owner.token,
);
owner.token = tenant.access_token ?? owner.token;
for (const step of [2, 3, 4])
  await must(
    "PATCH",
    "/tenants/current",
    { onboarding_step: step },
    owner.token,
  );
const party = await addParty(owner.token, { name: "Decimal Customer" });
const units = await must("GET", "/units", null, owner.token);
const item = await must(
  "POST",
  "/items",
  {
    name: "Decimal Goods",
    unit_id: units.find((unit) => unit.code === "KGS").id,
    selling_price: "1.00",
    tax_code: "GST0",
    opening_stock: { qty: "2000", unit_cost: "0.50" },
  },
  owner.token,
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/chromium",
});
try {
  let clipped = 0;
  for (const width of [1280, 360, 1536]) {
    const invoice = await must(
      "POST",
      "/sales/invoices",
      { party_id: party.id, lines: [{ item_id: item.id, qty: "1250.750" }] },
      owner.token,
    );
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator("input[type=email]").fill(owner.email);
    await page.locator("input[type=password]").fill(owner.password);
    await page.locator("button[type=submit]").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto(`${frontend}/sales/invoices/${invoice.id}/edit`, {
      waitUntil: "networkidle",
    });
    const quantity = page.getByRole("textbox", { name: /Qty.*line 1/i });
    await quantity.waitFor();
    await quantity.fill("1,250.750");
    assert.equal(
      await quantity.inputValue(),
      "1250.750",
      "all three decimals survive sanitization",
    );
    const measured = await inputFit(quantity, "1,250.750");
    const fit = {
      available: measured.available,
      actual: measured.widths[0],
      grouped: measured.widths[1],
    };
    await quantity.blur();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      0,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `${out}/${width}-${before ? "before" : "quantity"}.png`,
      fullPage: true,
    });
    if (before) {
      if (fit.actual > fit.available || fit.grouped > fit.available) clipped++;
      console.log(
        `BEFORE ${width}: available ${fit.available.toFixed(1)}px, full quantity ${fit.actual.toFixed(1)}px, grouped ${fit.grouped.toFixed(1)}px`,
      );
    } else {
      assert.ok(
        fit.actual <= fit.available,
        `full quantity clipped: ${JSON.stringify(fit)}`,
      );
      assert.ok(
        fit.grouped <= fit.available,
        `grouped quantity would be clipped: ${JSON.stringify(fit)}`,
      );
      console.log(
        `PASS ${width}: full three-decimal quantity and unit fit; no overflow or browser errors`,
      );
    }
    await context.close();
  }
  if (before)
    assert.ok(
      clipped > 0,
      "B43 must still reproduce before changing the layout",
    );
} finally {
  await browser.close();
}
