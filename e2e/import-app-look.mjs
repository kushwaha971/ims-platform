#!/usr/bin/env node
/** B42: a Shop import deep link must recover Shop after another app was used. */
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { must, newUser, uniq } from "./lib/fixtures.mjs";

const before = process.argv.includes("--before");
const frontend = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const backend = process.env.E2E_BACKEND ?? "http://localhost:8000/api/v1";
const out = process.env.SHOTS ?? "/tmp/import-app-look";
mkdirSync(out, { recursive: true });
const owner = await newUser({ name: "Import App Owner" });
const tenant = await must(
  "POST",
  "/tenants",
  {
    name: `Import App ${uniq()}`,
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
const form = new FormData();
form.append("kind", "parties");
form.append(
  "file",
  new Blob(
    [
      "name,mobile,type,opening_balance,opening_type,opening_date,gstin,state,tags\nImport App Customer,,customer,,,,,,\n",
    ],
    { type: "text/csv" },
  ),
  "shop-customers.csv",
);
const uploaded = await fetch(`${backend}/imports`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${owner.token}`,
    "X-Client": "api",
    "Idempotency-Key": `import-app-${uniq()}`,
  },
  body: form,
});
assert.equal(uploaded.status, 201);
const job = (await uploaded.json()).data;
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? "/usr/bin/chromium",
});
try {
  for (const width of [1280, 360]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    let jobReads = 0;
    let switches = 0;
    let documentLoads = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        request.url().endsWith(`/api/v1/imports/${job.id}`)
      )
        jobReads++;
      if (
        request.method() === "POST" &&
        request.url().endsWith("/api/v1/auth/switch-app")
      )
        switches++;
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documentLoads++;
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${frontend}/login/email`);
    await page.locator("input[type=email]").fill(owner.email);
    await page.locator("input[type=password]").fill(owner.password);
    await page.locator("button[type=submit]").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.goto(`${frontend}/library`, { waitUntil: "networkidle" });
    const session = await must("GET", "/auth/me", null, owner.token);
    assert.equal(session.active_app, "library");
    jobReads = switches = documentLoads = 0;
    await page.goto(`${frontend}/imports/${job.id}`, {
      waitUntil: "networkidle",
    });
    await page.getByTestId("import-commit").waitFor();
    const check = async (label) => {
      await page
        .getByRole("button", { name: /Current business:/ })
        .first()
        .click();
      const expected = before ? "Library" : "Shop";
      assert.equal(
        await page
          .getByRole("menuitem", { name: expected, exact: true })
          .getAttribute("aria-current"),
        "true",
      );
      await page
        .getByRole("button", { name: /Current business:/ })
        .first()
        .click();
      await page.getByRole("menu").waitFor({ state: "hidden" });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        0,
      );
      assert.deepEqual(errors, []);
      assert.equal(jobReads, 1, "ownership reuses the one existing job read");
      assert.equal(
        switches,
        !before && label === "deep-link" ? 1 : 0,
        "one necessary switch, none on reload",
      );
      assert.equal(
        documentLoads,
        1,
        "only the requested navigation or reload, no extra document load",
      );
      await page.screenshot({
        path: `${out}/${width}-${before ? "before" : label}.png`,
        fullPage: true,
      });
      console.log(
        `${before ? "REPRODUCED" : "PASS"} ${width} ${label}: Shop import shown in ${expected} navigation`,
      );
    };
    await check("deep-link");
    jobReads = switches = documentLoads = 0;
    await page.reload({ waitUntil: "networkidle" });
    await page.getByTestId("import-commit").waitFor();
    await check("reload");
    await context.close();
  }
} finally {
  await browser.close();
}
