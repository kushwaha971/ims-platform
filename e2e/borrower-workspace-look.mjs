#!/usr/bin/env node
/** UX16: choose a loan and record yesterday's collection on the borrower. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { must, newUser, uniq, uniqMobile } from "./lib/fixtures.mjs";

const before = process.argv.includes("--before");
const inlineBefore = process.argv.includes("--inline-before");
const out = process.env.SHOTS ?? "/tmp/borrower-workspace-look";
const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
}).format(new Date());
const ago = (days) =>
  new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400000)
    .toISOString()
    .slice(0, 10);
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
        name: `Borrower Workspace ${uniq()}`,
        state_code: "27",
        apps: ["lending"],
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
    const terms = {
      plan_type: "fixed_daily",
      frequency: "daily",
      instalment_count: 10,
      collection_weekdays: 127,
      disbursed_on: ago(7),
      first_due_on: ago(6),
    };
    const first = await must(
      "POST",
      "/lending/loans",
      {
        ...terms,
        principal: "1200.00",
        per_instalment_amount: "120.00",
        party: { name: "Workspace Borrower", mobile: uniqMobile() },
      },
      owner.token,
    );
    const second = await must(
      "POST",
      "/lending/loans",
      {
        ...terms,
        principal: "2400.00",
        per_instalment_amount: "240.00",
        borrower_id: first.borrower.id,
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
    await page.goto(`${frontend}/lending/loans?borrower=${first.borrower.id}`, {
      waitUntil: "domcontentloaded",
    });
    const workspace = page.url();
    let documents = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documents++;
    });
    await page.getByTestId("lending-collect-from").click();
    await page.getByTestId("lending-collect-from-save").waitFor();
    if (before || inlineBefore) {
      assert.equal(
        await page.getByRole("combobox", { name: "Choose loan" }).count(),
        inlineBefore ? 1 : 0,
      );
      await page.screenshot({
        path: `${out}/${width}-${inlineBefore ? "inline-before" : "before"}.png`,
        fullPage: true,
      });
      console.log(
        `REPRODUCED ${width}: borrower collection only offers automatic splitting, without choosing a loan`,
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close", exact: true })
        .click();
      await page.getByText(second.number, { exact: true }).click();
      await page.waitForURL(
        (url) => url.pathname === `/lending/loans/${second.id}`,
      );
      console.log(
        `REPRODUCED ${width}: schedule/history requires a separate loan page`,
      );
    } else {
      await page.getByRole("combobox", { name: "Choose loan" }).click();
      await page
        .getByRole("option", { name: new RegExp(second.number) })
        .click();
      await page.getByTestId("lending-collect-save").waitFor();
      await page
        .getByRole("textbox", { name: "Amount received", exact: true })
        .fill("120");
      await page.locator("button[name=collectedOn]").click();
      const yesterday = ago(1).split("-");
      await page
        .locator(
          `button[data-day="${yesterday[1]}/${yesterday[2]}/${yesterday[0]}"]`,
        )
        .click();
      await page.screenshot({
        path: `${out}/${width}-collection.png`,
        fullPage: true,
      });
      const reads = [];
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (
          request.method() === "GET" &&
          url.pathname.startsWith("/api/v1/lending/")
        )
          reads.push(url.pathname);
      });
      const saved = page.waitForResponse(
        (reply) =>
          reply.request().method() === "POST" &&
          new URL(reply.url()).pathname ===
            `/api/v1/lending/loans/${second.id}/collections`,
      );
      await page.getByTestId("lending-collect-save").click();
      const reply = await saved;
      assert.equal(reply.status(), 201);
      assert.equal(reply.request().postDataJSON().amount, "120.00");
      const collection = (await reply.json()).data;
      assert.equal(reply.request().postDataJSON().collected_on, ago(1));
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(page.url(), workspace);
      const firstNow = await must(
        "GET",
        `/lending/loans/${first.id}`,
        null,
        owner.token,
      );
      const secondNow = await must(
        "GET",
        `/lending/loans/${second.id}`,
        null,
        owner.token,
      );
      assert.equal(firstNow.remaining, "1200.00");
      assert.equal(secondNow.remaining, "2280.00");
      assert.equal(secondNow.schedule[0].settled, "120.00");
      const panel = page.getByTestId("lending-borrower-loan-workspace");
      await panel
        .getByRole("heading", { level: 2, name: second.number, exact: true })
        .waitFor();
      await panel.getByTestId("lending-loan-schedule").waitFor();
      await panel.getByRole('button', { name: 'UPI QR', exact: true }).waitFor();
      const history = panel.getByTestId("lending-loan-collections");
      await history.getByText(new RegExp(collection.receipt_number)).waitFor();
      assert.ok(
        (await history.innerText()).includes(
          ago(1).split("-").reverse().join("/"),
        ),
      );
      assert.equal(page.url(), workspace);
      assert.equal(await page.getByRole("heading", { level: 1 }).count(), 1);
      assert.equal(
        reads.filter((path) => path === "/api/v1/lending/loans").length,
        1,
        "one loan-list refresh",
      );
      assert.equal(
        reads.filter(
          (path) => path === `/api/v1/lending/borrowers/${first.borrower.id}`,
        ).length,
        1,
        "one borrower refresh",
      );
      assert.equal(
        reads.filter((path) => path === `/api/v1/lending/loans/${second.id}`)
          .length,
        1,
        "one selected-loan read",
      );
      const dismiss = page.getByRole("button", {
        name: "Dismiss",
        exact: true,
      });
      if (await dismiss.count()) await dismiss.click();
      await page.screenshot({
        path: `${out}/${width}-collected.png`,
        fullPage: true,
      });
      console.log(
        `PASS ${width}: yesterday's ₹120 went only to ${second.number}, on the borrower page`,
      );
      if (width === 1280 && process.argv.includes("--print")) {
        await page.evaluate(() => {
          window.print = () => {};
        });
        await history
          .getByRole("button", { name: "Print receipt", exact: true })
          .click();
        const paper = page.getByTestId("loan-paper-receipt");
        await paper.waitFor({ state: "attached" });
        await page.emulateMedia({ media: "print" });
        assert.ok(await paper.isVisible());
        assert.equal(
          await page.getByTestId("lending-borrower-summary").isVisible(),
          false,
          "receipt excludes the borrower workspace",
        );
        await page.screenshot({
          path: `${out}/${width}-receipt.png`,
          fullPage: true,
        });
        await page.emulateMedia({ media: "screen" });
      }
    }
    assert.equal(documents, 0);
    assert.deepEqual(errors, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      0,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
