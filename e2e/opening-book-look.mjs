#!/usr/bin/env node
/** QA B39 / DEC-019: opening dues are settled in Udhaar, independently of Shop bills. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { addParty, must, newUser, uniq } from "./lib/fixtures.mjs";
const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const out = process.argv[2] ?? "/tmp/opening-book-look";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/chromium",
});
try {
  for (const width of [1280, 360]) {
    const owner = await newUser();
    const tenant = await must(
      "POST",
      "/tenants",
      {
        name: `Opening Books ${uniq()}`,
        business_type: "retail",
        state_code: "27",
        apps: ["shop", "khata"],
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
    const party = await addParty(owner.token, {
      name: "Opening Balance Customer",
      opening_balance_amount: "2300.50",
      opening_balance_direction: "debit",
      opening_balance_as_of: "2025-04-01",
    });
    const units = await must("GET", "/units", null, owner.token);
    const item = await must(
      "POST",
      "/items",
      {
        name: "Separate Book Goods",
        unit_id: units.find((u) => u.code === "NOS").id,
        selling_price: "100",
        tax_code: "GST0",
        opening_stock: { qty: "20", unit_cost: "50" },
      },
      owner.token,
    );
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
    const open = await must(
      "GET",
      `/payments/open-documents?party_id=${party.id}&direction=in&bucket=shop`,
      null,
      owner.token,
    );
    assert.deepEqual(
      open.map((row) => row.document_id),
      [invoice.id],
      "Shop allocations contain only the Shop invoice",
    );
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    let documentLoads = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame())
        documentLoads++;
    });
    await page.goto(`${frontend}/login/email`);
    await page.locator("input[type=email]").fill(owner.email);
    await page.locator("input[type=password]").fill(owner.password);
    await page.locator("button[type=submit]").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto(`${frontend}/parties/${party.id}`, {
      waitUntil: "networkidle",
    });
    let text = await page.locator("main").innerText();
    assert.ok(text.includes("₹100.00") && !text.includes("2,300.50"));
    await page.screenshot({ path: `${out}/${width}-shop.png`, fullPage: true });
    await page
      .getByRole("button", { name: /Current business:/ })
      .first()
      .click();
    await page
      .getByRole("menuitem", { name: "Udhaar book", exact: true })
      .click();
    await page.waitForURL("**/khata");
    await page.waitForLoadState("networkidle");
    await page.goto(`${frontend}/parties/${party.id}`, {
      waitUntil: "networkidle",
    });
    text = await page.locator("main").innerText();
    assert.ok(text.includes("2,300.50") && !text.includes("₹100.00"));
    await page.screenshot({
      path: `${out}/${width}-udhaar-opening.png`,
      fullPage: true,
    });
    documentLoads = 0;
    await page
      .getByRole("button", { name: /You got/ })
      .first()
      .click();
    const drawer = page.getByRole("dialog");
    await drawer.waitFor();
    await drawer.getByLabel("Amount", { exact: true }).fill("2300.50");
    const saved = page.waitForResponse(
      (r) =>
        /\/ledger-entries$/.test(r.url()) && r.request().method() === "POST",
    );
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    assert.equal((await saved).status(), 201);
    await page.getByText("Settled", { exact: true }).first().waitFor();
    const current = await must(
      "GET",
      `/parties/${party.id}`,
      null,
      owner.token,
    );
    assert.equal(current.balance, "0.00");
    assert.equal(
      current.shop_balance,
      "100.00",
      "settling the opening changes no Shop dues",
    );
    assert.equal(documentLoads, 0);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      0,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: `${out}/${width}-udhaar-settled.png`,
      fullPage: true,
    });
    console.log(
      `PASS ${width}: Shop invoice only, opening in Udhaar, settled in place, Shop untouched, fits, no errors`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
