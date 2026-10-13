#!/usr/bin/env node
/** QA B37: an earlier-dated payment requires explicit merchant confirmation. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { addParty, must, newUser, uniq } from "./lib/fixtures.mjs";
const owner = await newUser();
const business = await must(
  "POST",
  "/tenants",
  {
    name: `Payment Date ${uniq()}`,
    business_type: "retail",
    state_code: "27",
    apps: ["shop"],
  },
  owner.token,
);
owner.token = business.access_token ?? owner.token;
for (const step of [2, 3, 4])
  await must(
    "PATCH",
    "/tenants/current",
    { onboarding_step: step },
    owner.token,
  );
const party = await addParty(owner.token, { name: "Payment Date Customer" });
const units = await must("GET", "/units", null, owner.token);
const item = await must(
  "POST",
  "/items",
  {
    name: "Date Goods",
    unit_id: units.find((u) => u.code === "NOS").id,
    selling_price: "100",
    tax_code: "GST0",
    opening_stock: { qty: "20", unit_cost: "50" },
  },
  owner.token,
);

const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const out = process.argv[2] ?? "/tmp/payment-date-look";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/chromium",
});
let failed = false;
try {
  for (const width of [1280, 360]) {
    const invoice = await must(
      "POST",
      "/sales/invoices",
      { party_id: party.id, lines: [{ item_id: item.id, qty: "1" }] },
      owner.token,
    );
    await must(
      "POST",
      `/sales/invoices/${invoice.id}/issue`,
      { version: invoice.version },
      owner.token,
    );
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    let writes = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/v1\/payments$/.test(r.url()))
        writes++;
    });
    await page.goto(`${frontend}/login/email`);
    await page.locator("input[type=email]").fill(owner.email);
    await page.locator("input[type=password]").fill(owner.password);
    await page.locator("button[type=submit]").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto(`${frontend}/sales/invoices/${invoice.id}`, {
      waitUntil: "networkidle",
    });
    if (width === 360)
      await page
        .getByRole("button", { name: "More actions", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .click();
    await page.getByTestId("payment-save").waitFor();
    await page.getByRole("button", { name: "Yesterday", exact: true }).click();
    await page.getByTestId("payment-save").click();
    const dialog = page.getByRole("dialog", {
      name: "Payment dated before the bill",
      exact: true,
    });
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `${out}/${width}-confirmation.png`,
      fullPage: true,
    });
    if (!(await dialog.isVisible())) {
      failed = true;
      console.log(
        `FAIL ${width}: earlier payment has no explicit confirmation`,
      );
    } else {
      assert.equal(writes, 0, "opening confirmation never creates a receipt");
      await dialog
        .getByRole("button", { name: "Keep editing", exact: true })
        .click();
      assert.equal(writes, 0, "cancelling writes nothing");
      await page.getByTestId("payment-save").click();
      await dialog
        .getByRole("button", { name: "Allocate this payment", exact: true })
        .click();
      await page.getByTestId("payment-saved").waitFor();
      assert.equal(writes, 1, "confirm creates exactly one receipt");
      const current = await must(
        "GET",
        `/sales/invoices/${invoice.id}`,
        null,
        owner.token,
      );
      assert.equal(current.amount_due, "0.00");
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
      );
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `${out}/${width}-saved.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Done", exact: true }).click();
      assert.equal(
        new URL(page.url()).pathname,
        `/sales/invoices/${invoice.id}`,
      );
      await page.getByTestId("invoice-payments").waitFor();
      assert.ok(
        (await page.getByTestId("invoice-payments").innerText()).includes(
          "RCT/",
        ),
      );
      await page.screenshot({
        path: `${out}/${width}-updated.png`,
        fullPage: true,
      });
      console.log(
        `PASS ${width}: confirmation, cancel, one confirmed receipt, settled bill, fits, no errors`,
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (failed) process.exitCode = 1;
