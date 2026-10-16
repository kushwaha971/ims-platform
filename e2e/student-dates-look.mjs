#!/usr/bin/env node
/** B40: copying an expired student's dates must not require leaving their page. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { addParty, must, newUser, uniq } from "./lib/fixtures.mjs";

const before = process.argv.includes("--before");
const out = process.env.SHOTS ?? "/tmp/student-dates-look";
const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());
const ago = (days) =>
  new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400000)
    .toISOString()
    .slice(0, 10);
const till = ago(7);
const joined = ago(14);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/chromium",
});
try {
  for (const width of [1280, 360]) {
    const owner = await newUser({ name: "Student Dates Owner" });
    const tenant = await must(
      "POST",
      "/tenants",
      {
        name: `Student Dates ${uniq()}`,
        business_type: "retail",
        state_code: "27",
        apps: ["library"],
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
      name: "Already Expired Student",
    });
    const plan = await must(
      "POST",
      "/library/membership-types",
      { name: "Study plan", validity_months: 1, fee_amount: "900.00" },
      owner.token,
    );
    let member = await must(
      "POST",
      "/library/members",
      { membership_type_id: plan.id, party_id: party.id },
      owner.token,
    );
    member = await must(
      "PATCH",
      `/library/members/${member.membership_id}`,
      { valid_until: today, version: member.version },
      owner.token,
    );
    const id = member.membership_id;
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
    await page.goto(`${frontend}/library/members/${id}`, {
      waitUntil: "networkidle",
    });
    await page.getByTestId("library-more").first().click(); // the header ⋯; charge rows have their own (15 Oct)
    await page.getByTestId("library-action-edit").click();
    await page.getByTestId("library-member-edit-save").waitFor();
    let documentLoads = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documentLoads++;
    });
    const dayButton = (iso) => {
      const date = new Date(`${iso}T12:00:00Z`);
      const month = date.toLocaleString("en-US", {
        month: "long",
        timeZone: "UTC",
      });
      return page
        .getByRole("button", {
          name: new RegExp(
            `${month} ${date.getUTCDate()}(?:st|nd|rd|th)?, ${date.getUTCFullYear()}`,
          ),
        })
        .first();
    };
    const choose = async (field, iso) => {
      await page.locator(`button[name=${field}]`).click();
      await page.getByRole("grid").waitFor();
      for (
        let attempts = 0;
        attempts < 3 && !(await dayButton(iso).count());
        attempts++
      )
        await page.getByRole("button", { name: /previous month/i }).click();
      await dayButton(iso).click();
    };
    if (before) {
      assert.equal(
        await page.locator("button[name=startsOn]").count(),
        0,
        "Joined is missing",
      );
      await page.locator("button[name=validUntil]").click();
      await page.getByRole("grid").waitFor();
      for (
        let attempts = 0;
        attempts < 3 && !(await dayButton(till).count());
        attempts++
      )
        await page.getByRole("button", { name: /previous month/i }).click();
      assert.equal(
        await dayButton(till).isDisabled(),
        true,
        "an expired end date is disabled",
      );
      await page.screenshot({
        path: `${out}/${width}-before.png`,
        fullPage: true,
      });
      console.log(
        `REPRODUCED ${width}: Joined missing and past Plan till disabled`,
      );
    } else {
      await choose("startsOn", joined);
      await choose("validUntil", till);
      await page.screenshot({
        path: `${out}/${width}-edit.png`,
        fullPage: true,
      });
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/library/members/${id}`) &&
          response.request().method() === "PATCH",
      );
      await page.getByTestId("library-member-edit-save").click();
      const response = await saved;
      assert.equal(response.status(), 200);
      const body = response.request().postDataJSON();
      assert.equal(body.starts_on, joined);
      assert.equal(body.valid_until, till);
      await page
        .getByTestId("library-member-edit-save")
        .waitFor({ state: "hidden" });
      await page.getByText("Fee overdue by 7 days", { exact: true }).waitFor();
      await page.getByText("Overdue", { exact: true }).first().waitFor();
      const result = await must(
        "GET",
        `/library/members/${id}`,
        null,
        owner.token,
      );
      assert.equal(result.starts_on, joined);
      assert.equal(result.valid_until, till);
      assert.equal(result.fee_state, "overdue");
      assert.equal(
        result.dues_amount,
        "900.00",
        "editing dates must not charge another fee",
      );
      assert.equal(documentLoads, 0);
      assert.deepEqual(errors, []);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
      );
      await page.screenshot({
        path: `${out}/${width}-expired.png`,
        fullPage: true,
      });
      console.log(
        `PASS ${width}: dates saved, seven days expired, overdue fee unchanged, no page reload`,
      );
    }
    await context.close();
  }
} finally {
  await browser.close();
}
