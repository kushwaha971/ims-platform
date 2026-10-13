#!/usr/bin/env node
/** QA B38: backdated sale stock policy and readable explanation at both widths. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { addParty, must, newUser, uniq } from "./lib/fixtures.mjs";
const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const out = process.argv[2] ?? "/tmp/stock-date-look";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/chromium",
});
try {
  for (const width of [1280, 360])
    for (const allowed of [false, true]) {
      const owner = await newUser();
      const tenant = await must(
        "POST",
        "/tenants",
        {
          name: `Stock Dates ${uniq()}`,
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
      const settings = await must(
        "GET",
        "/tenants/current/settings",
        null,
        owner.token,
      );
      await must(
        "PUT",
        "/tenants/current/settings",
        { values: { "inventory.allow_negative_stock": { value: allowed } } },
        owner.token,
        { "If-Match": settings.etag },
      );
      const party = await addParty(owner.token, {
        name: "Stock Date Customer",
      });
      const units = await must("GET", "/units", null, owner.token);
      const item = await must(
        "POST",
        "/items",
        {
          name: "Date Rice",
          unit_id: units.find((u) => u.code === "KGS").id,
          selling_price: "100",
          tax_code: "GST0",
          opening_stock: { qty: "20", unit_cost: "50", as_of: "2026-04-01" },
        },
        owner.token,
      );
      const invoice = await must(
        "POST",
        "/sales/invoices",
        {
          party_id: party.id,
          document_date: "2026-03-15",
          lines: [{ item_id: item.id, qty: "2.5" }],
        },
        owner.token,
      );
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      const errors = [];
      let documentLoads = 0;
      page.on("request", (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentLoads++;
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`${frontend}/login/email`);
      await page.locator("input[type=email]").fill(owner.email);
      await page.locator("input[type=password]").fill(owner.password);
      await page.locator("button[type=submit]").click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"));
      await page.goto(`${frontend}/sales/invoices/${invoice.id}/edit`, {
        waitUntil: "networkidle",
      });
      documentLoads = 0;
      await (width === 360 ? page.getByTestId("invoice-dock").getByRole("button", { name: "Issue", exact: true }) : page.getByTestId("invoice-issue")).click();
      const reply = page.waitForResponse(
        (r) =>
          r.url().includes(`/sales/invoices/${invoice.id}/issue`) &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Full credit", exact: true })
        .click();
      const response = await reply;
      assert.equal(response.status(), allowed ? 200 : 409);
      const expected =
        "Date Rice: no stock on 15/03/2026. Opening stock starts 01/04/2026.";
      const scope = allowed ? page.getByRole("dialog", { name: /issued$/ }) : page.locator("main");
      await scope.getByText(expected, { exact: true }).waitFor();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
      );
      assert.deepEqual(errors, []);
      const current = await must(
        "GET",
        `/sales/invoices/${invoice.id}`,
        null,
        owner.token,
      );
      assert.ok(allowed ? ["issued", "overdue"].includes(current.status) : current.status === "draft");
      assert.equal(documentLoads, 0, "issuing or refusing updates the editor without a full-page reload");
      const stock = await must("GET", `/items/${item.id}`, null, owner.token);
      assert.equal(stock.on_hand, allowed ? "17.500" : "20.000");
      await page.screenshot({
        path: `${out}/${width}-${allowed ? "warning" : "refusal"}.png`,
        fullPage: true,
      });
      console.log(
        `PASS ${width} ${allowed ? "allowed warning" : "refused"}: dates explained, correct stock/bill outcome, fits, no errors`,
      );
      await context.close();
    }
} finally {
  await browser.close();
}
