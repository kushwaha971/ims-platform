#!/usr/bin/env node
/**
 * Render the YourKhata brand artwork (CR-2026-09-29-BRAND-C: K-c "Bandhan",
 * the tied bahi cover, replacing BRAND-A's open khata).
 *
 *   node scripts/render-brand.mjs            # icons into public/icons + preview sheets
 *   node scripts/render-brand.mjs --preview  # preview sheets only
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

async function main() {
  mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
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
