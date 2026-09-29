/**
 * seo.mjs — what the site tells search engines and link previews, against the
 * LIVE stack (`./e2e/serve-api.sh && ./e2e/serve.sh`). CR-2026-09-29-PLATFORM-C.
 *
 * Why a harness and not only jest: every claim below is about BYTES ON THE
 * WIRE — the HTML the server sends before any script runs, the headers on a
 * poster, the PNG a WhatsApp preview fetches. jest reads the metadata objects;
 * this reads what Next actually rendered from them, which is where a
 * canonical of "/" instead of an absolute URL, or an FAQ answer that is not in
 * the HTML at all, shows up.
 *
 * Checks:
 *   - robots.txt and sitemap.xml are served, with the right rules and URLs;
 *   - `/`'s SSR HTML: title and description lengths, an absolute canonical at
 *     SITE_URL, Open Graph and Twitter tags, robots index, `lang`, exactly one
 *     h1, no skipped heading level, header/nav/main/footer, every FAQ answer
 *     present (inside closed disclosures), media labelled, link text
 *     descriptive, anchors crawlable;
 *   - og:image answers 200 image/png and is 1200 × 630 (read from the IHDR);
 *   - the JSON-LD parses, is the four expected nodes, carries no rating or
 *     review, carries NO offers while pricing is hidden (CR-2026-09-29-
 *     PLATFORM-D; the free plan only once it is shown but proposed), and its
 *     FAQ questions are exactly the ones the page renders;
 *   - the title and description reach all five modules, and name no coaching; the SSR HTML carries
 *     no status word, no #pricing while the flag is off, and the eight
 *     "Why YourKhata" points;
 *   - `/d/<token>` answers noindex in the meta AND the header, and carries no
 *     card and no canonical; the `(app)` shell and the auth flows say noindex;
 *   - Cache-Control on /media/landing/* and /brand/*;
 *   - Hindi: `lang="hi"` with the locale cookie;
 *   - a Lighthouse-equivalent SEO checklist in a real browser (Lighthouse
 *     itself needs the network to install and is not in this sandbox):
 *     legible font sizes, viewport meta, is-crawlable, and the rest above.
 */
import { chromium } from "playwright";

const FRONTEND = process.env.E2E_FRONTEND ?? "http://localhost:3000";
const SITE_URL = (process.env.E2E_SITE_URL ?? "https://yourkhata.com").replace(/\/+$/, "");
const ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

/**
 * `SHOW_PRICING` as the build has it, read from the source the build was made
 * from, so this harness checks whichever state is shipped rather than
 * assuming one.
 */
const PRICING_SOURCE = await (await import("node:fs/promises")).readFile(
  new URL("../frontend/src/modules/DigiKhaato/features/landing/config/pricing.ts", import.meta.url),
  "utf8",
);
const SHOW_PRICING = /export const SHOW_PRICING: boolean = true;/.test(PRICING_SOURCE);

const results = [];
const record = (check, ok, detail = "") => {
  results.push({ check, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${check}${detail && !ok ? `\n        ${detail}` : ""}`);
};

const get = (path, init = {}) => fetch(`${FRONTEND}${path}`, { redirect: "manual", ...init });
const attr = (tag, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const decode = (text) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const metaTags = (html) => [...html.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]);
const meta = (html, key, value) =>
  metaTags(html)
    .filter((tag) => attr(tag, key) === value)
    .map((tag) => decode(attr(tag, "content") ?? ""));
const head = (html) => html.slice(0, html.indexOf("</head>"));
const body = (html) => html.slice(html.indexOf("<body"));
const text = (fragment) => decode(fragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

// ── robots.txt ────────────────────────────────────────────────────────────────
{
  const res = await get("/robots.txt");
  const txt = await res.text();
  record("robots.txt is served as text/plain", res.status === 200 && /text\/plain/.test(res.headers.get("content-type") ?? ""), `${res.status} ${res.headers.get("content-type")}`);
  const lines = txt.split("\n").map((l) => l.trim()).filter(Boolean);
  const valid = lines.every((l) => /^(User-Agent|Allow|Disallow|Sitemap|Host|Crawl-delay):\s*\S*/i.test(l));
  record("robots.txt: every line is a known directive (Lighthouse robots-txt)", valid, txt);
  const disallow = lines.filter((l) => /^Disallow:/i.test(l)).map((l) => l.split(/:\s*/)[1]);
  const allow = lines.filter((l) => /^Allow:/i.test(l)).map((l) => l.split(/:\s*/)[1]);
  for (const path of ["/d/", "/dashboard", "/parties", "/admin", "/api/", "/onboarding", "/reset-password", "/accept-invite", "/settings"]) {
    record(`robots.txt disallows ${path}`, disallow.includes(path), disallow.join(" "));
  }
  record("robots.txt does not disallow /d (which would also catch /dashboard-like public paths)", !disallow.includes("/d"));
  for (const path of ["/", "/legal/", "/login", "/signup"]) record(`robots.txt allows ${path}`, allow.includes(path), allow.join(" "));
  record("robots.txt names the sitemap at SITE_URL", lines.includes(`Sitemap: ${SITE_URL}/sitemap.xml`), txt);
}

// ── sitemap.xml ───────────────────────────────────────────────────────────────
{
  const res = await get("/sitemap.xml");
  const xml = await res.text();
  record("sitemap.xml is served as XML", res.status === 200 && /xml/.test(res.headers.get("content-type") ?? ""), `${res.status} ${res.headers.get("content-type")}`);
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const expected = ["/", "/signup", "/login", "/legal/terms", "/legal/privacy"].map((p) => `${SITE_URL}${p}`);
  record("sitemap.xml lists exactly the five public pages", JSON.stringify(locs) === JSON.stringify(expected), locs.join(" "));
  for (const loc of locs) {
    const r = await get(new URL(loc).pathname);
    record(`sitemap entry ${new URL(loc).pathname} answers 200 signed out`, r.status === 200, String(r.status));
  }
}

// ── the landing page's server HTML ────────────────────────────────────────────
const landing = await get("/");
const html = await landing.text();
const h = head(html);
const b = body(html);
record("/ answers 200 (Lighthouse http-status-code)", landing.status === 200, String(landing.status));
{
  const title = text(/<title>([\s\S]*?)<\/title>/.exec(h)?.[1] ?? "");
  record(`<title> is present and under 60 chars (${title.length})`, title.length > 10 && title.length < 60, title);
  const description = meta(h, "name", "description")[0] ?? "";
  record(`meta description is present and under 160 chars (${description.length})`, description.length > 50 && description.length < 160, description);
  record("title and description carry no jargon", !/kirana|udhaa?r|\bkhata\b/i.test(`${title} ${description}`.replace(/YourKhata/g, "")));
  record(
    "title reaches all five modules (bills, fees, collections, bookings)",
    [/bills/, /fees/, /collections/, /bookings/].every((word) => word.test(title)),
    title,
  );
  const fiveInDescription = [/GST bills|stock/, /loan collections/, /library/, /gym/, /room bookings/];
  record("description names every module", fiveInDescription.every((word) => word.test(description)), description);
  record("title and description name no coaching (withdrawn 29 Sep)", !/coaching|tuition|student/i.test(`${title} ${description}`), `${title} ${description}`);
  record("title and description carry no status word", !/\blive\b|\bplanned\b|in development|\bsoon\b/i.test(`${title} ${description}`));
  const canonical = [...h.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/g)].map((m) => attr(m[0], "href"));
  // Next renders the root URL without its slash ("https://yourkhata.com");
  // for an origin that is the same URL as ".../" (RFC 3986 §6.2.3), so both
  // sides are compared as parsed URLs.
  const sameUrl = (a, b) => {
    try {
      return new URL(a).href === new URL(b).href;
    } catch {
      return false;
    }
  };
  record("exactly one canonical, absolute, at SITE_URL/", canonical.length === 1 && sameUrl(canonical[0], `${SITE_URL}/`), canonical.join(" "));
  const robotsMeta = meta(h, "name", "robots").join(",");
  record("robots meta says index, follow (Lighthouse is-crawlable)", /(^|,\s*)index/.test(robotsMeta) && !/noindex/.test(robotsMeta) && !/noindex/i.test(landing.headers.get("x-robots-tag") ?? ""), robotsMeta);
  for (const prop of ["og:title", "og:description", "og:url", "og:type", "og:site_name", "og:image", "og:image:width", "og:image:height", "og:image:alt"]) {
    record(`${prop} is present`, meta(h, "property", prop).length === 1 && meta(h, "property", prop)[0] !== "", meta(h, "property", prop).join(" | "));
  }
  record("og:url is the canonical", sameUrl(meta(h, "property", "og:url")[0], canonical[0]), meta(h, "property", "og:url")[0]);
  for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) {
    record(`${name} is present`, meta(h, "name", name).length >= 1, meta(h, "name", name).join(" | "));
  }
  record("twitter:card is summary_large_image", meta(h, "name", "twitter:card")[0] === "summary_large_image");
  record("viewport meta (Lighthouse viewport)", meta(h, "name", "viewport").some((v) => /width=device-width/.test(v)));

  // og:image — absolute at SITE_URL; fetched from the live server by path.
  const ogImage = meta(h, "property", "og:image")[0] ?? "";
  record("og:image is absolute at SITE_URL", ogImage.startsWith(`${SITE_URL}/`), ogImage);
  const img = await get(new URL(ogImage).pathname);
  const bytes = Buffer.from(await img.arrayBuffer());
  const png = bytes.subarray(1, 4).toString("latin1") === "PNG";
  const size = png ? [bytes.readUInt32BE(16), bytes.readUInt32BE(20)] : [];
  record("og:image answers 200 image/png", img.status === 200 && img.headers.get("content-type") === "image/png", `${img.status} ${img.headers.get("content-type")}`);
  record("og:image is 1200 × 630", size[0] === 1200 && size[1] === 630, size.join("×"));
  record(
    "og:image:width/height agree with the file",
    meta(h, "property", "og:image:width")[0] === "1200" && meta(h, "property", "og:image:height")[0] === "630"
  );

  // <html lang>
  record('<html lang="en"> with no locale cookie', /<html\b[^>]*\blang="en"/.test(html));

  // headings
  const headings = [...b.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({ level: Number(m[1]), text: text(m[2]) }));
  record("exactly one h1", headings.filter((x) => x.level === 1).length === 1, headings.filter((x) => x.level === 1).map((x) => x.text).join(" | "));
  const skips = headings.filter((x, i) => i > 0 && x.level > headings[i - 1].level + 1).map((x) => `h${x.level} "${x.text}"`);
  record("no heading skips a level", skips.length === 0 && headings[0]?.level === 1, skips.join(", "));
  record("every heading has text", headings.every((x) => x.text.length > 0));

  // landmarks
  for (const tag of ["header", "nav", "main", "footer"]) record(`landmark <${tag}> is present`, new RegExp(`<${tag}[\\s>]`).test(b));
  record("exactly one <main>", (b.match(/<main[\s>]/g) ?? []).length === 1);

  // FAQ answers in the SSR HTML, hidden
  const en = JSON.parse(
    await (await import("node:fs/promises")).readFile(new URL("../frontend/locales/catalogues/landing.en.json", import.meta.url), "utf8")
  );
  // The rendered FAQ: "What does it cost?" only while pricing is shown, and
  // the neutral "Do I need a card?" in its place while it is hidden.
  const faqIds = Object.keys(en)
    .filter((k) => /^landing\.faq\.\w+\.a$/.test(k))
    .filter((k) => k !== (SHOW_PRICING ? "landing.faq.card.a" : "landing.faq.cost.a"));
  const hiddenId = SHOW_PRICING ? "landing.faq.card.a" : "landing.faq.cost.a";
  const decodedBody = decode(b);
  const missing = faqIds.filter((k) => !decodedBody.includes(en[k]));
  record(`every FAQ answer (${faqIds.length}) is in the server HTML`, faqIds.length >= 10 && missing.length === 0, missing.join(", "));
  record(`the ${hiddenId.split(".")[2]} answer is not in the HTML`, !decodedBody.includes(en[hiddenId]));
  const hiddenPanels = (b.match(/role="region"[^>]*hidden=""/g) ?? []).length;
  record("the FAQ answers are hidden until opened, not absent", hiddenPanels >= faqIds.length, String(hiddenPanels));

  // media and links (Lighthouse image-alt, link-text, crawlable-anchors)
  const imgs = [...b.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  record(`every <img> (${imgs.length}) has an alt attribute`, imgs.every((t) => /\balt="/.test(t)));
  const unlabelledFigures = [...b.matchAll(/role="img"([^>]*)>/g)].filter((m) => !/aria-label="[^"]+"/.test(m[1]));
  record("every role=img figure has an aria-label", unlabelledFigures.length === 0);
  const videos = [...b.matchAll(/<video\b[^>]*>/g)].map((m) => m[0]);
  record(`every <video> (${videos.length}) is decorative (aria-hidden) inside a labelled figure`, videos.every((t) => /aria-hidden="true"/.test(t)));
  const anchors = [...b.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], text: text(m[2]), label: attr(m[1], "aria-label") }));
  const vague = anchors.filter((a) => /^(click here|here|more|read more|learn more|link|this)$/i.test((a.label ?? a.text).trim()));
  record(`link text is descriptive (${anchors.length} links)`, vague.length === 0, vague.map((a) => a.text).join(" | "));
  const nameless = anchors.filter((a) => !(a.label ?? a.text));
  record("every link has a name", nameless.length === 0, nameless.map((a) => a.attrs).join(" | "));
  const uncrawlable = anchors.filter((a) => !/\bhref="(\/|#|https?:)/.test(a.attrs));
  record("every link has a crawlable href", uncrawlable.length === 0, uncrawlable.map((a) => a.attrs).join(" | "));

  // JSON-LD
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  try {
    data = blocks.map((block) => JSON.parse(block));
  } catch (error) {
    record("JSON-LD parses", false, String(error));
  }
  if (data) {
    record("exactly one JSON-LD block, and it parses", data.length === 1);
    const graph = data[0]?.["@graph"] ?? [];
    record("JSON-LD is a schema.org graph", data[0]?.["@context"] === "https://schema.org");
    record(
      "JSON-LD nodes: Organization, WebSite, SoftwareApplication, FAQPage",
      JSON.stringify(graph.map((n) => n["@type"])) === JSON.stringify(["Organization", "WebSite", "SoftwareApplication", "FAQPage"])
    );
    const keys = [];
    const walk = (v) => {
      if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (keys.push(k), walk(x));
    };
    walk(data);
    const invented = keys.filter((k) => /^(aggregateRating|rating|ratingValue|ratingCount|bestRating|reviews?|reviewCount|interactionStatistic)$/i.test(k));
    record("JSON-LD carries no rating or review", invented.length === 0, invented.join(" "));
    const app = graph.find((n) => n["@type"] === "SoftwareApplication") ?? {};
    record("SoftwareApplication: BusinessApplication on Web", app.applicationCategory === "BusinessApplication" && app.operatingSystem === "Web");
    if (SHOW_PRICING) {
      const offers = app.offers ?? [];
      record(
        "offers: the free plan only, 0 INR (paid prices are proposed)",
        offers.length === 1 && offers[0].price === "0" && offers[0].priceCurrency === "INR",
        JSON.stringify(offers)
      );
    } else {
      record("no offers while pricing is hidden", !("offers" in app) && !/"Offer"|priceCurrency/.test(JSON.stringify(data)), JSON.stringify(app.offers));
    }
    const org = graph.find((n) => n["@type"] === "Organization") ?? {};
    record("Organization has name, url and logo at SITE_URL", org.name === "YourKhata" && org.url === `${SITE_URL}/` && org.logo?.url?.startsWith(SITE_URL));
    const logo = await get(new URL(org.logo?.url ?? `${SITE_URL}/x`).pathname);
    record("Organization.logo answers 200 image/png", logo.status === 200 && logo.headers.get("content-type") === "image/png");
    const faq = graph.find((n) => n["@type"] === "FAQPage")?.mainEntity ?? [];
    const offPage = faq.filter((q) => !decodedBody.includes(q.name) || !decodedBody.includes(q.acceptedAnswer?.text));
    record(`FAQPage (${faq.length} questions) quotes only what the page shows`, faq.length === faqIds.length && offPage.length === 0, offPage.map((q) => q.name).join(" | "));
    const rendered = faqIds.map((k) => en[k.replace(/\.a$/, ".q")]);
    // The catalogue is sorted by key, so compare as sets; the ORDER is held by
    // seo.test.tsx, which builds both from config/faq.ts.
    record(
      "FAQPage asks exactly the rendered questions",
      JSON.stringify(faq.map((q) => q.name).sort()) === JSON.stringify([...rendered].sort()),
      faq.map((q) => q.name).join(" | "),
    );
  }

  // CR-2026-09-29-PLATFORM-D, on the wire: no status word, pricing per the flag, Why in the HTML.
  const pageText = text(b.replace(/<script[\s\S]*?<\/script>/g, " "));
  const status = pageText.match(/\blive\b|\bplanned\b|in development|coming soon|not yet available|cannot be used yet/gi);
  record("the server HTML carries no status word", !status, (status ?? []).join(", "));
  record(
    SHOW_PRICING ? "#pricing is in the HTML (flag on)" : "no #pricing section and no link to it (flag off)",
    SHOW_PRICING ? /id="pricing"/.test(b) : !/id="pricing"|href="#pricing"/.test(b),
  );
  record('"Why YourKhata" (#why) is in the HTML with eight points', /id="why"/.test(b) && (b.match(/data-why-id="/g) ?? []).length === 8);
}

// ── noindex where it must be ─────────────────────────────────────────────────
{
  const res = await get("/d/e2e-not-a-real-token");
  const page = await res.text();
  const hh = head(page);
  record("/d/<token> answers X-Robots-Tag noindex", /noindex/.test(res.headers.get("x-robots-tag") ?? ""), res.headers.get("x-robots-tag") ?? "(none)");
  record("/d/<token> has a noindex robots meta", meta(hh, "name", "robots").some((v) => /noindex/.test(v)), meta(hh, "name", "robots").join(","));
  record("/d/<token> carries no og:image, no canonical and no product name in the head", !/og:image|rel="canonical"|yourkhata/i.test(hh));
}
for (const path of ["/reset-password", "/forgot-password", "/set-password"]) {
  const page = await (await get(path)).text();
  record(`${path} has a noindex robots meta`, meta(head(page), "name", "robots").some((v) => /noindex/.test(v)));
}
{
  // The proxy checks cookie PRESENCE only, so a placeholder session cookie gets
  // the (app) and (admin) layouts' server HTML — the head is rendered before
  // RequireSession decides anything on the client.
  const cookie = { headers: { cookie: "ub_access=e2e-placeholder" } };
  for (const path of ["/dashboard", "/admin", "/onboarding/step/1"]) {
    const res = await get(path, cookie);
    const page = await res.text();
    record(`${path} (${res.status}) has a noindex robots meta`, meta(head(page), "name", "robots").some((v) => /noindex/.test(v)), meta(head(page), "name", "robots").join(","));
  }
  for (const path of ["/login", "/signup", "/legal/terms"]) {
    const page = await (await get(path)).text();
    record(`${path} is indexable (no noindex)`, !meta(head(page), "name", "robots").some((v) => /noindex/.test(v)));
  }
}

// ── cache headers ────────────────────────────────────────────────────────────
for (const path of ["/media/landing/hero-desktop-poster.webp", "/media/landing/hero-mobile.webm", "/brand/yourkhata-og.png", "/brand/yourkhata-mark-16.svg"]) {
  const res = await get(path, { method: "HEAD" });
  record(`Cache-Control on ${path}`, res.status === 200 && res.headers.get("cache-control") === ASSET_CACHE, `${res.status} ${res.headers.get("cache-control")}`);
}

// ── Hindi ────────────────────────────────────────────────────────────────────
{
  const page = await (await get("/", { headers: { cookie: "ub_locale=hi" } })).text();
  record('<html lang="hi"> with the Hindi cookie', /<html\b[^>]*\blang="hi"/.test(page));
}

// ── in a browser: what Lighthouse's SEO category would measure ───────────────
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  // Lighthouse font-size: ≥ 60 % of visible text at ≥ 12 px on a phone viewport.
  const legibility = await page.evaluate(() => {
    let total = 0;
    let small = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      const len = node.textContent.trim().length;
      if (!el || !len || !el.getClientRects().length) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      total += len;
      if (parseFloat(style.fontSize) < 12) small += len;
    }
    return { total, small, share: total ? (total - small) / total : 0 };
  });
  record(`legible font sizes: ${(legibility.share * 100).toFixed(1)} % of text ≥ 12 px (Lighthouse needs ≥ 60 %)`, legibility.share >= 0.6);
  // Find-in-page reaches a closed FAQ answer where the browser supports it.
  // After hydration, which `networkidle` does not promise on a page whose loops
  // keep fetching: wait for it rather than sample once.
  const untilFound = await page
    .waitForFunction(() => document.querySelectorAll('[hidden="until-found"]').length >= 10, null, { timeout: 15000 })
    .then(() => page.evaluate(() => document.querySelectorAll('[hidden="until-found"]').length))
    .catch(() => page.evaluate(() => document.querySelectorAll('[hidden="until-found"]').length));
  record(`closed FAQ answers are hidden="until-found" after hydration (${untilFound})`, untilFound >= 10);
  // Opening a question shows its answer.
  const q = page.getByRole("button", { name: "Can I use it in Hindi?" });
  await q.click();
  record("opening an FAQ question shows its answer", await page.getByText("Every screen is in Hindi and English").isVisible());
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
