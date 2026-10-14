#!/usr/bin/env node
/** UX16 Library: collect a partial fee and read its history without leaving the student. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { addParty, must, newUser, uniq, uniqMobile } from "./lib/fixtures.mjs";

const before = process.argv.includes("--before");
const identityBefore = process.argv.includes("--identity-before");
const overviewBefore = process.argv.includes("--overview-before");
const out = process.env.SHOTS ?? "/tmp/student-workspace-look";
const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/chromium",
});
try {
  for (const width of [1280, 360]) {
    const owner = await newUser({ name: "Student Workspace Owner" });
    const tenant = await must(
      "POST",
      "/tenants",
      {
        name: `Student Workspace ${uniq()}`,
        business_type: "retail",
        state_code: "27",
        apps: ["shop", "library"],
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
      name: "Workspace Student",
      mobile: uniqMobile(),
      opening_balance_amount: "777.00",
      opening_balance_direction: "debit",
      opening_balance_as_of: today,
    });
    const plan = await must(
      "POST",
      "/library/membership-types",
      { name: "Workspace plan", validity_months: 1, fee_amount: "900.00" },
      owner.token,
    );
    const member = await must(
      "POST",
      "/library/members",
      { membership_type_id: plan.id, party_id: party.id },
      owner.token,
    );
    await must(
      "POST",
      "/payments",
      {
        direction: "in",
        party_id: party.id,
        payment_date: today,
        context: "party",
        bucket: "shop",
        mode_breakup: [{ mode: "cash", amount: "333.00" }],
        allocations: [],
        note: "Shop-only advance",
      },
      owner.token,
    );
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
    const studentUrl = page.url();
    if (overviewBefore) {
      assert.equal(
        await page.getByTestId("library-member-fees-total").count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Collect fees", exact: true })
          .count(),
        0,
      );
      await page.screenshot({
        path: `${out}/${width}-overview-before.png`,
        fullPage: true,
      });
      console.log(
        `REPRODUCED ${width}: no fee totals or collection shortcut in the student overview`,
      );
      await context.close();
      continue;
    }
    if (identityBefore) {
      await page
        .getByRole("button", { name: "More actions", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit details", exact: true })
        .click();
      const link = page.getByRole("link", { name: "Change name or mobile" });
      await link.waitFor();
      assert.ok(
        (await link.getAttribute("href")).endsWith(`/parties/${party.id}`),
      );
      await page.screenshot({
        path: `${out}/${width}-identity-before.png`,
        fullPage: true,
      });
      console.log(
        `REPRODUCED ${width}: identity editing requires leaving the student`,
      );
      await context.close();
      continue;
    }
    let documentLoads = 0;
    const historyReads = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (request.method() === "GET" && url.pathname === "/api/v1/payments")
        historyReads.push(url.searchParams);

      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documentLoads++;
    });
    if (before) {
      await page
        .getByRole("button", { name: "Take ₹900.00", exact: true })
        .click();
    } else {
      await page.getByTestId("library-member-fees-total").waitFor();
      assert.ok(
        (
          await page.getByTestId("library-member-fees-total").innerText()
        ).includes("900.00"),
      );
      await page
        .getByRole("button", { name: "Collect fees", exact: true })
        .click();
    }
    await page.getByTestId("payment-save").waitFor();
    await page
      .getByRole("textbox", { name: "Amount", exact: true })
      .first()
      .fill("200.00");
    await page
      .getByRole("textbox", { name: /Note/i })
      .fill("Workspace partial fee");
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/payments") &&
        response.request().method() === "POST",
    );
    await page.getByTestId("payment-save").click();
    const response = await saved;
    assert.equal(response.status(), 201);
    assert.equal(response.request().postDataJSON().bucket, "library");
    if (!before)
      assert.equal(response.request().postDataJSON().allocations, "auto");
    const payment = (await response.json()).data;
    await page.getByTestId("payment-saved").waitFor();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    assert.equal(page.url(), studentUrl);
    const result = await must(
      "GET",
      `/library/members/${member.membership_id}`,
      null,
      owner.token,
    );
    assert.equal(result.dues_amount, "700.00");
    await page.getByText("Part paid", { exact: true }).first().waitFor();
    const books = await must("GET", `/parties/${party.id}`, null, owner.token);
    assert.equal(
      books.balance,
      "777.00",
      "the Udhaar book did not take the library payment",
    );
    assert.equal(
      books.shop_balance,
      "-333.00",
      "the Shop did not take the library payment",
    );
    if (before) {
      assert.equal(
        await page.getByTestId("library-payment-history").count(),
        0,
      );
      await page
        .getByRole("link", { name: "All payments", exact: true })
        .waitFor();
      console.log(
        `REPRODUCED ${width}: partial fee saves, but history requires leaving the student`,
      );
    } else {
      const history = page.getByTestId("library-payment-history");
      await page
        .getByTestId("library-member-fees-paid")
        .getByText("₹200.00", { exact: true })
        .first()
        .waitFor();
      assert.ok(
        (
          await page.getByTestId("library-member-fees-total").innerText()
        ).includes("900.00"),
      );
      await history.getByText(payment.number, { exact: true }).waitFor();
      assert.equal(
        response.request().postDataJSON().note,
        "Workspace partial fee",
      );
      assert.ok((await history.innerText()).includes("200.00"));
      assert.ok(!(await history.innerText()).includes("777.00"));
      assert.ok(!(await history.innerText()).includes("333.00"));
      assert.equal(
        await page
          .getByRole("link", { name: "All payments", exact: true })
          .count(),
        0,
      );
      console.log(
        `PASS ${width}: ₹200 partial fee, ₹700 due, authoritative receipt history on the same student page`,
      );
    }
    if (!before) {
      assert.equal(
        historyReads.length,
        1,
        "one affected history read after saving",
      );
      assert.equal(historyReads[0].get("party_id"), party.id);
      assert.equal(historyReads[0].get("bucket"), "library");
      const dismiss = page.getByRole("button", {
        name: "Dismiss",
        exact: true,
      });
      if (await dismiss.count()) await dismiss.click();
      await page
        .getByRole("button", { name: "More actions", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Change name or mobile", exact: true })
        .click();
      const identity = page.getByRole("dialog", {
        name: "Change name or mobile",
      });
      await identity
        .getByRole("button", { name: "Save changes", exact: true })
        .waitFor();
      await identity
        .getByRole("textbox", { name: "Name", exact: true })
        .fill("Workspace Student Updated");
      const newMobile = uniqMobile();
      await identity
        .getByRole("textbox", { name: "Mobile number" })
        .fill(newMobile);
      await page.screenshot({
        path: `${out}/${width}-identity.png`,
        fullPage: true,
      });
      const identitySaved = page.waitForResponse(
        (reply) =>
          reply.request().method() === "PATCH" &&
          new URL(reply.url()).pathname === `/api/v1/parties/${party.id}`,
      );
      await page.getByTestId("party-identity-save").click();
      const identityReply = await identitySaved;
      assert.equal(identityReply.status(), 200);
      assert.deepEqual(
        Object.keys(identityReply.request().postDataJSON()).sort(),
        ["mobile", "name"],
      );
      await page
        .getByRole("heading", {
          name: "Workspace Student Updated",
          exact: true,
        })
        .waitFor();
      await identity.waitFor({ state: "hidden" });
      assert.equal(page.url(), studentUrl);
      const updated = await must(
        "GET",
        `/parties/${party.id}`,
        null,
        owner.token,
      );
      assert.equal(updated.name, "Workspace Student Updated");
      assert.ok(updated.mobile.endsWith(newMobile));
      assert.equal(updated.is_customer, books.is_customer);
      assert.equal(updated.is_supplier, books.is_supplier);
      assert.equal(updated.balance, "777.00");
      assert.equal(updated.shop_balance, "-333.00");
      const updatedMember = await must(
        "GET",
        `/library/members/${member.membership_id}`,
        null,
        owner.token,
      );
      assert.equal(updatedMember.dues_amount, "700.00");
      console.log(
        `PASS ${width}: name/mobile saved on student, roles and all three books unchanged`,
      );
    }
    assert.equal(documentLoads, 0);
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      0,
    );
    const dismiss = page.getByRole("button", { name: "Dismiss", exact: true });
    if (await dismiss.count()) await dismiss.click();
    await page.screenshot({
      path: `${out}/${width}-${before ? "before" : "student"}.png`,
      fullPage: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
