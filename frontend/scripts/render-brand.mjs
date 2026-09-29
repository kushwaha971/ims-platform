#!/usr/bin/env node
/**
 * Render the YourKhata brand artwork (CR-2026-09-29-BRAND-C: K-c "Bandhan",
 * the tied bahi cover, replacing BRAND-A's open khata).
 *
 *   node scripts/render-brand.mjs            # icons into public/icons + preview sheets
 *   node scripts/render-brand.mjs --preview  # preview sheets only
 *   node scripts/render-brand.mjs --og       # the 1200×630 link-preview card only
 *
 * The SVGs in `public/brand/` are the source; every PNG in `public/icons/` is
 * derived from them here, so a change to the mark is one SVG edit and one run
 * of this script, never a hand-exported PNG that drifts from the component.
 *
 * It drives the Playwright Chromium that the e2e harness already installs (no
 * new dependency, ADR-021). Where the bundled browser revision is not the one
 * installed, set CHROMIUM_PATH.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const shots = process.env.BRAND_SHOTS_DIR ?? '/tmp/e2e-shots/brand';
const previewOnly = process.argv.includes('--preview');
const ogOnly = process.argv.includes('--og');

const fallbackChrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync(fallbackChrome) ? fallbackChrome : undefined);

const svg = (rel) => readFileSync(join(pub, rel), 'utf8');
const dataUri = (text) => `data:image/svg+xml;base64,${Buffer.from(text).toString('base64')}`;
const font = readFileSync(join(root, 'src/fonts/dm-sans-latin-wght-normal.woff2')).toString(
  'base64'
);

const FONT_FACE = `@font-face{font-family:'DM Sans';font-weight:100 1000;src:url(data:font/woff2;base64,${font}) format('woff2');}`;

// [id, file under public/brand/, name, applied, its own 16 px cut]
const concepts = [
  ['K-c', 'yourkhata-mark.svg', 'Bandhan, the tied bahi cover', 'applied', 'yourkhata-mark-16.svg'],
  ['K-a', 'concepts3/k-a-mark.svg', 'Likhai, the written page', '', 'concepts3/k-a-mark-16.svg'],
  ['1', 'concepts2/concept-1-mark.svg', 'Signature K (round 2)', '', ''],
  ['A', 'concepts/concept-a.svg', 'Open khata, ticked (round 1)', '', 'concepts/concept-a-16.svg'],
];

/** Rasterise an SVG at `px` exactly, the way a browser tab would. */
async function raster(browser, text, px) {
  const p = await browser.newPage({ viewport: { width: px, height: px } });
  await p.setContent(
    `<!doctype html><html><body style="margin:0"><img src="${dataUri(text)}" width="${px}" height="${px}" style="display:block"></body></html>`
  );
  const png = await p.screenshot({ omitBackground: true });
  await p.close();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function conceptSheet(tiny) {
  const cards = concepts
    .map(([id, file, name, applied]) => {
      const uri = dataUri(svg(`brand/${file}`));
      const sizes = [16, 32, 48]
        .map(
          (s) =>
            `<figure><img src="${uri}" width="${s}" height="${s}"><figcaption>${s}px</figcaption></figure>`
        )
        .join('');
      return `<section class="card">
        <header><b>${id}</b> · ${name}${applied ? ' <em>applied</em>' : ''}</header>
        <div class="lockup"><img src="${uri}" width="72" height="72"><span class="word">YourKhata</span></div>
        <div class="sizes">${sizes}<figure><img class="zoom" src="${tiny[id]}" width="64" height="64"><figcaption>16px, pixels x4</figcaption></figure></div>
        <div class="dark"><img src="${uri}" width="40" height="40"><span class="word sm">YourKhata</span></div>
      </section>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_FACE}
    body{margin:0;background:#F6F7F9;font-family:'DM Sans',sans-serif;color:#0A090B}
    h1{font-weight:600;font-size:22px;margin:32px 40px 8px} p.sub{margin:0 40px 24px;color:#6B696F;font-size:14px}
    .row{display:flex;gap:24px;padding:0 40px}
    .card{flex:1;background:#fff;border:1px solid #E6E6E6;border-radius:12px;padding:24px;display:flex;flex-direction:column;gap:24px}
    header{font-size:14px} em{font-style:normal;background:#E1E0FC;color:#2E2B93;border-radius:999px;padding:2px 8px;font-size:12px;margin-left:4px}
    .lockup,.dark{display:flex;align-items:center;gap:14px}
    .word{font-weight:600;font-size:34px;letter-spacing:-0.01em;line-height:1}
    .word.sm{font-size:20px;color:#F4F6F8}
    .dark{background:#151340;border-radius:10px;padding:14px}
    .sizes{display:flex;align-items:flex-end;gap:24px}
    figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:6px}
    figcaption{font-size:11px;color:#6B696F}
    .zoom{image-rendering:pixelated}
  </style></head><body>
    <h1>YourKhata — logo concepts</h1>
    <p class="sub">K-c cover in primary-600 #3A36B8, knot bahi red #C8322B · wordmark DM Sans 600 · each shown at 72, 48, 32 and 16 px and on the dark rail</p>
    <div class="row">${cards}</div>
  </body></html>`;
}

/**
 * CR-2026-09-29-PLATFORM-C — the link-preview card, `public/brand/yourkhata-og.png`
 * (1200 × 630, the size every preview surface crops from). Built from the
 * K-c lockup and the hero's own headline, read from the landing catalogue so
 * the card and the page say the same sentence; indigo from the closing band's
 * primary-700 → primary-900. No screenshot and no demo data: a preview card is
 * a sign, and a screenshot shrunk to 600 px wide is a grey smear.
 *
 * `features/landing/config/seo.ts` (`OG_IMAGE`) is what points at it, and
 * `seo.test.ts` checks the file's PNG header says 1200 × 630.
 */
async function renderOg(browser) {
  const messages = JSON.parse(readFileSync(join(root, 'locales/catalogues/landing.en.json'), 'utf8'));
  const lead = messages['landing.hero.lead'];
  const line = messages['landing.hero.srLine'];
  const footer = 'Works in any browser · Hindi or English';
  if (!lead || !line) throw new Error('landing.hero.lead / landing.hero.srLine missing from the catalogue');
  const italic = readFileSync(join(root, 'src/fonts/fraunces-latin-wght-italic.woff2')).toString('base64');
  // The lockup's wordmark on a dark ground, by DESIGN-SYSTEM.md §7's table:
  // the letters white (the rail's `tone="inherit"`), the K and sweep
  // primary-300, the sweep's knot its dark step. The MARK is unchanged — it is
  // the same in every theme. Same outlines; only the wordmark group recoloured.
  const [markPart, wordPart] = svg('brand/yourkhata-lockup.svg').split('<!-- Wordmark');
  if (!wordPart) throw new Error('yourkhata-lockup.svg: no "<!-- Wordmark" marker to split on');
  const lockup =
    markPart +
    '<!-- Wordmark' +
    wordPart
      .replaceAll('fill="#0A090B"', 'fill="#FFFFFF"')
      .replaceAll('fill="#3A36B8"', 'fill="#9D9AF0"')
      .replaceAll('fill="#4A47D6"', 'fill="#9D9AF0"')
      .replaceAll('fill="#C8322B"', 'fill="#D9453D"');
  const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FONT_FACE}
    @font-face{font-family:'Fraunces';font-style:italic;font-weight:100 900;src:url(data:font/woff2;base64,${italic}) format('woff2');}
    html,body{margin:0;width:1200px;height:630px;overflow:hidden}
    body{position:relative;font-family:'DM Sans',sans-serif;color:#fff;
      background:linear-gradient(135deg,#2E2B93 0%,#211F69 58%,#151340 100%)}
    .glow{position:absolute;border-radius:50%;filter:blur(90px)}
    .g1{width:520px;height:520px;right:-140px;top:-180px;background:rgba(113,109,228,.45)}
    .g2{width:460px;height:460px;left:-160px;bottom:-220px;background:rgba(74,71,214,.40)}
    .wrap{position:relative;height:100%;box-sizing:border-box;padding:72px 80px 64px;display:flex;flex-direction:column}
    .lockup{height:72px;width:auto;display:block;align-self:flex-start}
    h1{margin:auto 0 0;font-family:'Fraunces',serif;font-style:italic;font-weight:600;font-size:78px;line-height:1.04;letter-spacing:-0.015em;max-width:1040px}
    .line{margin:22px 0 0;font-weight:600;font-size:38px;line-height:1.2;color:#E1E0FC;max-width:980px}
    .foot{margin-top:auto;padding-top:40px;display:flex;justify-content:space-between;align-items:center;font-size:26px;font-weight:500;color:#C7C6F7}
    .domain{color:#fff;font-weight:600}
    .knot{display:inline-block;width:12px;height:12px;border-radius:50%;background:#C8322B;margin-right:12px;vertical-align:2px}
  </style></head><body>
    <div class="glow g1"></div><div class="glow g2"></div>
    <div class="wrap">
      <img class="lockup" src="${dataUri(lockup)}" alt="">
      <h1>${esc(lead)}</h1>
      <p class="line">${esc(line)}</p>
      <div class="foot"><span>${esc(footer)}</span><span class="domain"><span class="knot"></span>yourkhata.com</span></div>
    </div>
  </body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const out = join(pub, 'brand/yourkhata-og.png');
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await page.close();
  console.log(`wrote public/brand/yourkhata-og.png`);
}

async function main() {
  mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    if (ogOnly) {
      await renderOg(browser);
      return;
    }
    const page = await browser.newPage({ viewport: { width: 1480, height: 540 } });
    const tiny = {};
    for (const [id, file, , , cut16] of concepts) {
      // A mark with its own 16 px cut is shown in it; the others as drawn.
      const art = svg(`brand/${cut16 || file}`);
      tiny[id] = await raster(browser, art, 16);
    }
    await page.setContent(conceptSheet(tiny));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(shots, 'concepts.png') });
    console.log(`wrote ${join(shots, 'concepts.png')}`);

    if (previewOnly) return;

    // [source svg, output png, px, transparent]
    const icons = [
      ['brand/yourkhata-mark-16.svg', 'icons/favicon-16.png', 16, true],
      ['brand/yourkhata-mark.svg', 'icons/favicon-32.png', 32, true],
      ['brand/yourkhata-mark.svg', 'icons/apple-touch-icon.png', 180, false],
      ['brand/yourkhata-mark.svg', 'icons/icon-192.png', 192, true],
      ['brand/yourkhata-mark.svg', 'icons/icon-512.png', 512, true],
      ['brand/yourkhata-maskable.svg', 'icons/maskable-512.png', 512, false],
    ];
    for (const [src, out, px, transparent] of icons) {
      const p = await browser.newPage({ viewport: { width: px, height: px } });
      // Apple fills a transparent corner with black, so its tile is full-bleed:
      // the full-bleed maskable art, which iOS rounds itself.
      const art = out.includes('apple') ? svg('brand/yourkhata-maskable.svg') : svg(src);
      await p.setContent(
        `<!doctype html><html><body style="margin:0;background:transparent"><img src="${dataUri(art)}" width="${px}" height="${px}" style="display:block"></body></html>`
      );
      await p.screenshot({ path: join(pub, out), omitBackground: transparent });
      await p.close();
      console.log(`wrote public/${out}`);
    }

    const sheet = await browser.newPage({ viewport: { width: 1200, height: 420 } });
    const tiles = icons
      .map(([, out, px]) => {
        const b64 = readFileSync(join(pub, out)).toString('base64');
        const shown = Math.min(px, 180);
        return `<figure><img src="data:image/png;base64,${b64}" width="${shown}" height="${shown}"><figcaption>${out} (${px})</figcaption></figure>`;
      })
      .join('');
    await sheet.setContent(
      `<!doctype html><html><head><style>${FONT_FACE}body{margin:0;padding:32px;background:#F6F7F9;font-family:'DM Sans';display:flex;gap:28px;align-items:flex-end;flex-wrap:wrap}figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:8px}figcaption{font-size:11px;color:#6B696F}</style></head><body>${tiles}</body></html>`
    );
    await sheet.screenshot({ path: join(shots, 'icons.png') });
    console.log(`wrote ${join(shots, 'icons.png')}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
