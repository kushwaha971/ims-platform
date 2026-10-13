#!/usr/bin/env node
/** B41: old dates need three choices in the calendar, without repeated month arrows. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { addParty, must, newUser, uniq, uniqMobile } from "./lib/fixtures.mjs";

const before = process.argv.includes("--before");
const out = process.env.SHOTS ?? "/tmp/date-picker-look";
const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());
const year = Number(today.slice(0, 4));
const target = `${year - 2}-05-15`;
mkdirSync(out, { recursive: true });
const owner = await newUser({ name: "Calendar Owner" });
const tenant = await must(
  "POST",
  "/tenants",
  {
    name: `Date Picker ${uniq()}`,
    business_type: "retail",
    state_code: "27",
    apps: ["shop", "library", "lending"],
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
  name: "Calendar Student Customer",
});
const plan = await must(
  "POST",
  "/library/membership-types",
  { name: "Calendar plan", validity_months: 1, fee_amount: "100.00" },
  owner.token,
);
const member = await must(
  "POST",
  "/library/members",
  { membership_type_id: plan.id, party_id: party.id },
  owner.token,
);
const loan = await must(
  "POST",
  "/lending/loans",
  {
    plan_type: "fixed_daily",
    principal: "1200.00",
    frequency: "daily",
    instalment_count: 10,
    per_instalment_amount: "120.00",
    collection_weekdays: 127,
    disbursed_on: today,
    first_due_on: new Date(Date.parse(`${today}T12:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10),
    party: { name: "Calendar Borrower", mobile: uniqMobile() },
  },
  owner.token,
);
const units = await must("GET", "/units", null, owner.token);
const item = await must(
  "POST",
  "/items",
  {
    name: "Calendar Goods",
    unit_id: units.find((unit) => unit.code === "NOS").id,
    selling_price: "100",
    tax_code: "GST0",
    opening_stock: { qty: "20", unit_cost: "50" },
  },
  owner.token,
);
const receiptInvoice = await must(
  "POST",
  "/sales/invoices",
  { party_id: party.id, lines: [{ item_id: item.id, qty: "1" }] },
  owner.token,
);
await must(
  "POST",
  `/sales/invoices/${receiptInvoice.id}/issue`,
  { version: receiptInvoice.version },
  owner.token,
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/chromium",
});
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      timezoneId: "Asia/Kolkata",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator("input[type=email]").fill(owner.email);
    await page.locator("input[type=password]").fill(owner.password);
    await page.locator("button[type=submit]").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto(`${frontend}/library/members/${member.membership_id}`, {
      waitUntil: "networkidle",
    });
    await page.getByTestId("library-more").click();
    await page.getByTestId("library-action-edit").click();
    await page.getByTestId("library-member-edit-save").waitFor();
    const joined = page.locator("button[name=startsOn]");
    await joined.click();
    await page.getByRole("grid").waitFor();
    if (before) {
      assert.equal(await page.getByRole("combobox").count(), 0);
      for (let taps = 0; taps < 24; taps++)
        await page
          .getByRole("button", { name: "Previous month", exact: true })
          .click();
      assert.ok(
        (await page.getByRole("grid").getAttribute("aria-label")).includes(
          String(year - 2),
        ),
      );
      await page.screenshot({
        path: `${out}/${width}-before.png`,
        fullPage: true,
      });
      console.log(
        `REPRODUCED ${width}: no month/year controls; two years required 24 arrow taps`,
      );
      await context.close();
      continue;
    }
    const pick = async (trigger, name, iso = target, alreadyOpen = false) => {
      if (!alreadyOpen) await trigger.click();
      await page.getByRole("grid").waitFor();
      let documentLoads = 0;
      const count = (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        )
          documentLoads++;
      };
      page.on("request", count);
      await page
        .getByRole("combobox", { name: "Year", exact: true })
        .selectOption(iso.slice(0, 4));
      await page
        .getByRole("combobox", { name: "Month", exact: true })
        .selectOption(String(Number(iso.slice(5, 7)) - 1));
      await page.screenshot({
        path: `${out}/${width}-${name}-calendar.png`,
        fullPage: true,
      });
      const date = new Date(`${iso}T12:00:00Z`);
      const month = date.toLocaleString("en-US", {
        month: "long",
        timeZone: "UTC",
      });
      await page
        .getByRole("button", {
          name: new RegExp(
            `${month} ${date.getUTCDate()}(?:st|nd|rd|th)?, ${date.getUTCFullYear()}`,
          ),
        })
        .first()
        .click();
      assert.ok(
        (await trigger.innerText()).includes(iso.slice(0, 4)),
        `${name}: field updates immediately`,
      );
      assert.equal(documentLoads, 0);
      page.off("request", count);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
      );
      console.log(
        `PASS ${width} ${name}: year, month, day in three choices; immediate render; no document reload`,
      );
    };
    await pick(joined, "joined", `${year - 5}-05-15`, true);
    await pick(page.locator("button[name=validUntil]"), "plan-till");
    await page.goto(`${frontend}/lending/loans/${loan.id}`, {
      waitUntil: "networkidle",
    });
    await page.getByTestId("lending-loan-collect").click();
    await pick(page.locator("button[name=collectedOn]"), "loan-collection");
    await page.goto(`${frontend}/sales/invoices/${receiptInvoice.id}`, {
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
    await pick(page.locator("button[name=paymentDate]"), "payment");
    const draft = await must(
      "POST",
      "/sales/invoices",
      { party_id: party.id, lines: [{ item_id: item.id, qty: "1" }] },
      owner.token,
    );
    await page.goto(`${frontend}/sales/invoices/${draft.id}/edit`, {
      waitUntil: "networkidle",
    });
    if (width === 360)
      await page.getByRole("button", { name: /^More details/ }).click();
    await pick(
      page.getByRole("button", { name: "Date", exact: true }),
      "invoice",
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
