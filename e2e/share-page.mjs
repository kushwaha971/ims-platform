/**
 * share-page.mjs — SAL-03 FR-5, the customer's share page, end to end.
 *
 * The launch blocker it guards: `/d/<token>` was a stub that rendered "This
 * link has expired" for EVERY token and never called the API, so every bill a
 * merchant shared on WhatsApp opened as expired — and nothing failed, because
 * no harness ever opened a shared link the way a customer does.
 *
 * So this one does: a fresh owner issues a part-paid invoice over the API,
 * mints a share link, and the link is opened in a FRESH browser context with
 * no cookies at all, at a 360 px phone. It asserts what the customer gets —
 * the shop's letterhead, the amount still due, a `upi://pay` link for exactly
 * that amount, the A4 sheet, no app chrome and no link into the app, no
 * horizontal overflow, the share headers, the Hindi page for a Hindi phone,
 * the QR at desktop width — then revokes the link and asserts the neutral
 * unavailable screen, identical to an unknown token's.
 *
 * Screenshots (phone 360 / desktop 1280, en + hi, and the revoked state) go to
 * $E2E_SHOTS/share-page.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

import { addParty, must, newOwner, api, uniqMobile } from "./lib/fixtures.mjs";

const FRONTEND = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const SHOT_DIR = `${process.env.E2E_SHOTS ?? "/tmp/e2e-shots"}/share-page`;
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const record = (check, ok, detail = "") => {
  results.push({ check, ok });
  console.log(
    `${ok ? "ok  " : "FAIL"}  ${check}${detail ? `\n        ${detail}` : ""}`,
  );
};

const B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const gstinFor = (seed, st = "27") => {
  const letters = String(seed)
    .slice(-5)
    .split("")
    .map((d) => B36[10 + Number(d)])
    .join("");
  const body = `${st}${letters}${String(seed).slice(-4)}F1Z`;
  let sum = 0;
  [...body].forEach((ch, i) => {
    const p = B36.indexOf(ch) * (i % 2 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  });
  return body + B36[(36 - (sum % 36)) % 36];
};
const inr = (value) =>
  `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const UNAVAILABLE = "This link is not available";

async function seed() {
  const shop = "Sharma Kirana Store";
  const owner = await newOwner({
    shop,
    name: "Suresh Sharma",
    prefix: "e2e-share",
  });
  await must(
    "PATCH",
    "/tenants/current",
    {
      gst_type: "regular",
      gstin: gstinFor(Date.now()),
      upi_vpa: "sharmakirana@okhdfc",
      phone: "9876501234",
      address: {
        line1: "14 Mahatma Phule Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411002",
        state_code: "27",
      },
    },
    owner.token,
  );
  const units = await must("GET", "/units", null, owner.token);
  const nos = units.find((u) => u.code === "NOS") ?? units[0];
  const rice = await must(
    "POST",
    "/items",
    {
      name: "Basmati Rice 5kg",
      unit_id: nos.id,
      selling_price: "450.00",
      tax_code: "GST5",
      hsn_sac: "1006",
      opening_stock: { qty: "40", unit_cost: "380.00" },
    },
    owner.token,
  );
  const party = await addParty(owner.token, {
    name: "Ramesh Traders",
    state_code: "27",
    mobile: `+91${uniqMobile()}`,
  });
  const draft = await must(
    "POST",
    "/sales/invoices",
    {
      party_id: party.id,
      lines: [{ item_id: rice.id, qty: "2" }],
    },
    owner.token,
  );
  const issued = await must(
    "POST",
    `/sales/invoices/${draft.id}/issue`,
    {
      version: draft.version,
      payment: { mode_breakup: [{ mode: "cash", amount: "200.00" }] },
    },
    owner.token,
  );
  const link = await must(
    "POST",
    `/sales/invoices/${issued.id}/share-links`,
    {},
    owner.token,
  );
  const token = link.url.split("/d/")[1];
  return { owner, shop, invoice: issued, token };
}

/** A context with NOTHING in it: no cookies, no storage — a customer's phone. */
async function freshPage(
  browser,
  { width = 360, height = 780, locale = "en-IN" } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale,
  });
  await context.addInitScript(() => {
    window.print = () => {
      window.__printed = (window.__printed || 0) + 1;
    };
  });
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (error) => page.errors.push(error.message));
  return { context, page };
}

const shot = (page, name) =>
  page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });

async function main() {
  const { owner, shop, invoice, token } = await seed();
  const due = invoice.amount_due;
  record(
    "seed: the invoice is part paid with money due",
    Number(due) > 0 && invoice.status === "partially_paid",
    `${invoice.number} ${invoice.status} due ${due}`,
  );
  const url = `${FRONTEND}/d/${token}`;
  const browser = await chromium.launch();

  // ── 1. A customer's phone opens the link ────────────────────────────────
  {
    const { context, page } = await freshPage(browser);
    record(
      "the customer context starts with no cookies",
      (await context.cookies()).length === 0,
    );
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    const pay = page.getByTestId("public-pay");
    await pay.waitFor({ timeout: 45000 }).catch(() => undefined);
    // The root layout's session fetch 401s for a customer and its refresh 401s
    // a moment later; that is when main used to bounce them to /login.
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(1500);

    record(
      "the page stays on /d/<token> (no redirect to login)",
      new URL(page.url()).pathname === `/d/${token}`,
      page.url(),
    );
    const headers = response?.headers() ?? {};
    record(
      "the page is sent noindex and no-referrer",
      /noindex/.test(headers["x-robots-tag"] ?? "") &&
        headers["referrer-policy"] === "no-referrer",
      JSON.stringify({
        robots: headers["x-robots-tag"],
        ref: headers["referrer-policy"],
      }),
    );
    const metaRobots = await page
      .locator('meta[name="robots"]')
      .getAttribute("content")
      .catch(() => null);
    record(
      'the document carries <meta name="robots" content="noindex">',
      /noindex/.test(metaRobots ?? ""),
      metaRobots ?? "missing",
    );

    const h1 = await page
      .getByRole("heading", { level: 1 })
      .first()
      .innerText()
      .catch(() => "");
    record("the shop's name is the page heading", h1.trim() === shop, h1);
    const shopBlock = await page
      .getByTestId("public-shop")
      .innerText()
      .catch(() => "");
    record(
      "the letterhead carries the address and GSTIN",
      /Mahatma Phule Road/.test(shopBlock) && /GSTIN 27/.test(shopBlock),
      shopBlock.replace(/\n/g, " | "),
    );
    const title = await page
      .getByTestId("public-title")
      .innerText()
      .catch(() => "");
    record(
      "the document is titled with its number",
      title.includes(invoice.number) && /Tax Invoice/.test(title),
      title,
    );
    const amount = await page
      .getByTestId("public-amount")
      .innerText()
      .catch(() => "");
    record(
      "the headline figure is the amount DUE, not the total",
      amount.trim() === inr(due),
      `${amount} vs ${inr(due)}`,
    );
    const status = await page
      .getByTestId("public-status")
      .innerText()
      .catch(() => "");
    record("the status reads Partly paid", /Partly paid/.test(status), status);

    const href = (await pay.getAttribute("href").catch(() => null)) ?? "";
    record(
      "Pay is a upi://pay link for exactly the amount due",
      href.startsWith("upi://pay?") &&
        href.includes(`am=${due}`) &&
        href.includes("pa=sharmakirana@okhdfc"),
      href,
    );
    record(
      "the Pay label names the amount",
      (await pay.innerText().catch(() => "")).includes(inr(due)),
    );
    record(
      "the A4 sheet is on the page",
      await page
        .getByTestId("print-a4")
        .isVisible()
        .catch(() => false),
    );
    const grand = await page
      .getByTestId("print-grand-total")
      .innerText()
      .catch(() => "");
    record(
      "the sheet prints the grand total",
      grand.trim() === inr(invoice.grand_total),
      grand,
    );

    const chrome = await page.evaluate(() => ({
      nav: document.querySelectorAll("nav, aside, header[data-app-header]")
        .length,
      links: [...document.querySelectorAll("a[href]")].map((a) =>
        a.getAttribute("href"),
      ),
    }));
    record(
      "no app chrome: no nav, no sidebar, no app header",
      chrome.nav === 0,
      JSON.stringify(chrome),
    );
    record(
      "no link into the app: every anchor is the UPI link",
      chrome.links.every((h) => h.startsWith("upi:")),
      chrome.links.join(", "),
    );
    const html = await page.content();
    record(
      "no internal id reaches the page",
      !html.includes(invoice.id) && !html.includes(owner.tenantId),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    record(
      "no horizontal overflow at 360 px",
      overflow <= 1,
      `overflow ${overflow}px`,
    );
    record(
      "the footer says Powered by DigiKhaato",
      /Powered by DigiKhaato/.test(
        await page
          .getByTestId("public-powered-by")
          .innerText()
          .catch(() => ""),
      ),
    );

    await page.getByTestId("public-print").click();
    await page.waitForTimeout(500);
    record(
      "Print / Save as PDF calls window.print",
      (await page.evaluate(() => window.__printed || 0)) === 1,
    );
    record(
      "the page threw no errors",
      page.errors.length === 0,
      page.errors.join(" | "),
    );
    await shot(page, "01-phone-360-en");
    await page.emulateMedia({ media: "print" });
    await shot(page, "02-phone-360-print");
    await context.close();
  }

  // ── 2. Desktop: the QR is for the customer who opened it on a laptop ────
  {
    const { context, page } = await freshPage(browser, {
      width: 1280,
      height: 900,
    });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page
      .getByTestId("public-pay")
      .waitFor({ timeout: 45000 })
      .catch(() => undefined);
    const qr = page.getByTestId("public-pay-block").getByTestId("upi-qr");
    record(
      "desktop: the UPI QR is shown beside Pay",
      await qr.isVisible().catch(() => false),
    );
    await shot(page, "03-desktop-1280-en");
    await context.close();
  }

  // ── 3. A Hindi phone gets the Hindi page ────────────────────────────────
  {
    const { context, page } = await freshPage(browser, { locale: "hi-IN" });
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page
      .getByTestId("public-pay")
      .waitFor({ timeout: 45000 })
      .catch(() => undefined);
    await page
      .waitForFunction(
        () => document.body.innerText.includes("बकाया राशि"),
        null,
        { timeout: 15000 },
      )
      .catch(() => undefined);
    const text = await page.locator("body").innerText();
    record(
      "Hindi: an Accept-Language hi phone reads the page in Hindi",
      text.includes("बकाया राशि") && text.includes("का भुगतान करें"),
      text.slice(0, 200).replace(/\n/g, " | "),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    record(
      "Hindi: no horizontal overflow at 360 px",
      overflow <= 1,
      `overflow ${overflow}px`,
    );
    await shot(page, "04-phone-360-hi");
    await context.close();
  }

  // ── 4. Voided after sharing (EC-6): watermark, Cancelled, no pay ────────
  {
    const voided = await api(
      "POST",
      `/sales/invoices/${invoice.id}/void`,
      { reason: "Duplicate bill" },
      owner.token,
    );
    record(
      "the owner voids the shared invoice",
      voided.status === 200,
      `${voided.status}`,
    );
    const { context, page } = await freshPage(browser);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page
      .getByTestId("public-status")
      .waitFor({ timeout: 45000 })
      .catch(() => undefined);
    record(
      "void: the status reads Cancelled",
      /Cancelled/.test(
        await page
          .getByTestId("public-status")
          .innerText()
          .catch(() => ""),
      ),
    );
    record(
      "void: the sheet is watermarked VOID",
      /VOID/.test(
        await page
          .getByTestId("print-watermark")
          .innerText()
          .catch(() => ""),
      ),
    );
    record(
      "void: no Pay link and no QR",
      (await page.getByTestId("public-pay").count()) === 0 &&
        (await page.getByTestId("upi-qr").count()) === 0,
    );
    await shot(page, "05-phone-360-void");
    await context.close();
  }

  // ── 5. Revoked: the neutral screen, the same as a token that never was ──
  const revoked = await api(
    "POST",
    `/sales/invoices/${invoice.id}/share-links/revoke`,
    {},
    owner.token,
  );
  record(
    "the owner revokes the link",
    revoked.status === 200 && revoked.body?.data?.revoked === true,
    JSON.stringify(revoked.body).slice(0, 200),
  );
  const neutral = async (target, name) => {
    const { context, page } = await freshPage(browser);
    await page.goto(target, { waitUntil: "domcontentloaded" });
    await page
      .getByText(UNAVAILABLE)
      .waitFor({ timeout: 45000 })
      .catch(() => undefined);
    const text = await page.locator("body").innerText();
    await shot(page, name);
    await context.close();
    return text;
  };
  const afterRevoke = await neutral(url, "06-phone-360-revoked");
  record(
    "revoked: the page shows the neutral unavailable message",
    afterRevoke.includes(UNAVAILABLE),
    afterRevoke.slice(0, 200),
  );
  record(
    "revoked: nothing of the bill is left on the page",
    !afterRevoke.includes(invoice.number) && !afterRevoke.includes(shop),
  );
  const unknown = await neutral(
    `${FRONTEND}/d/${"x".repeat(43)}`,
    "07-phone-360-unknown",
  );
  const body = (text) => text.replace(/\s+/g, " ").trim();
  record(
    "revoked and unknown links read identically (no oracle)",
    body(afterRevoke) === body(unknown),
    `${body(afterRevoke)} ‖ ${body(unknown)}`,
  );

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(
    `\n${passed}/${results.length} checks passed · shots in ${SHOT_DIR}`,
  );
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
