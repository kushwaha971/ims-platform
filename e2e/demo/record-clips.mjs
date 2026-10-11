/**
 * e2e/demo/record-clips.mjs — every silent loop on the landing page, recorded
 * from the demo stack's real screens, for the desktop AND for the phone.
 *
 *   node e2e/demo/record-clips.mjs <out-dir> [desktop|mobile] [clip-id-prefix]
 *
 * The loops: `hero`, the six Shop & billing jobs (`feat-khata`, `feat-reminder`,
 * `feat-bill`, `feat-stock`, `feat-purchase`, `feat-reports`) and the two
 * module cards (`mod-library`, `mod-lending`) — each as `<id>-desktop` and
 * `<id>-mobile`. The phone ones are the phone LAYOUT (390 px, touch), not the
 * desktop picture shrunk.
 *
 * Writes <out-dir>/<id>.raw.webm and <out-dir>/clips.json (how much to trim
 * from the front of each, and how long it runs); `encode-clips.mjs` cuts,
 * encodes and makes the posters and the manifest.
 *
 * The clips CHANGE the demo book, so re-seed first. A step that cannot be
 * performed is logged as MISSED and the run exits non-zero.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DESKTOP, PHONE, lending, library, makeStage, shop } from './flows.mjs';
import { CURSOR_SCRIPT, STATE, signIn, useBusiness } from './lib.mjs';

const [out, onlyDevice, onlyClip] = process.argv.slice(2);
if (!out) throw new Error('usage: node e2e/demo/record-clips.mjs <out-dir> [desktop|mobile] [clip-id-prefix]');
mkdirSync(out, { recursive: true });

const SHOP = 'Sharma General Store';
const CLIPS = [
  {
    id: 'hero', business: SHOP,
    ready: (st) => st.go('/dashboard'),
    run: async (st) => {
      await st.pause(1600);
      await shop.openKhata(st);
      await shop.entry(st, 'gave', '1200', 'Rice and dal');
      await shop.bill(st, 'Anita General Store', [['Basm', 'Basmati Rice 5kg', 2]]);
    },
  },
  {
    id: 'feat-khata', business: SHOP,
    ready: (st) => st.go('/customers'),
    run: async (st) => {
      await st.pause(900);
      await shop.openKhata(st, 'Ramesh Traders');
      await shop.entry(st, 'gave', '1200', 'Sugar and oil');
      await st.pause(900);
    },
  },
  {
    id: 'feat-reminder', business: SHOP,
    ready: (st) => st.go(`/parties/${STATE.shop.ramesh}`),
    run: async (st) => { await st.pause(1200); await shop.reminder(st); await st.pause(900); },
  },
  {
    id: 'feat-bill', business: SHOP,
    ready: (st) => st.go('/sales/invoices'),
    run: async (st) => { await st.pause(600); await shop.bill(st, 'Ramesh Traders', [['Basm', 'Basmati Rice 5kg', 2], ['Must', 'Mustard Oil 1L', 3]]); await st.pause(600); },
  },
  {
    id: 'feat-stock', business: SHOP,
    ready: (st) => st.go('/items'),
    run: async (st) => { await st.pause(900); await shop.stock(st); await st.pause(900); },
  },
  {
    id: 'feat-purchase', business: SHOP,
    ready: (st) => st.go('/purchases/bills'),
    run: async (st) => { await st.pause(700); await shop.purchase(st); await st.pause(600); },
  },
  {
    id: 'feat-reports', business: SHOP,
    ready: (st) => st.go('/reports'),
    run: async (st) => { await st.pause(600); await shop.reports(st); await st.pause(500); },
  },
  {
    id: 'mod-library', business: 'Vidya Reading Room',
    ready: (st) => st.go('/library'),
    run: async (st) => {
      await st.pause(1700);
      await library.catalogue(st);
      await library.issue(st, 'M-0004', STATE.library.freeCopy);
      await st.pause(900);
    },
  },
  {
    id: 'mod-lending', business: 'Verma Finance',
    ready: (st) => lending.today(st, 300),
    run: async (st) => { await st.pause(1500); await lending.collect(st); await lending.loans(st); await st.pause(900); },
  },
];

const index = existsSync(path.join(out, 'clips.json')) ? JSON.parse(readFileSync(path.join(out, 'clips.json'), 'utf8')) : {};
const allMissed = [];

for (const device of [DESKTOP, PHONE]) {
  if (onlyDevice && onlyDevice !== 'all' && onlyDevice !== device.name) continue;
  const browser = await chromium.launch(device.launch);
  // Sign in once per device, outside any recording, and keep one session per business.
  const states = {};
  const base = await browser.newContext(device.context);
  const basePage = await base.newPage();
  await signIn(basePage);
  for (const business of [...new Set(CLIPS.map((c) => c.business))]) { await useBusiness(basePage, business); states[business] = await base.storageState(); }
  await base.close();

  for (const clip of CLIPS) {
    if (onlyClip && !clip.id.startsWith(onlyClip)) continue;
    const id = `${clip.id}-${device.name}`;
    const size = device.mobile ? { width: 780, height: 1688 } : { width: 1280, height: 800 };
    const ctx = await browser.newContext({ ...device.context, storageState: states[clip.business], recordVideo: { dir: out, size }, locale: 'en-IN' });
    await ctx.addInitScript(CURSOR_SCRIPT);
    const page = await ctx.newPage();
    const t0 = Date.now();
    const missed = [];
    const stage = makeStage(page, device, missed);
    await clip.ready(stage);
    await page.mouse.move(size.width / 4, 300);
    await stage.pause(500);
    const lead = (Date.now() - t0) / 1000;
    await clip.run(stage);
    const total = (Date.now() - t0) / 1000;
    const video = page.video();
    await ctx.close();
    renameSync(await video.path(), path.join(out, `${id}.raw.webm`));
    index[id] = { trimStart: +lead.toFixed(2), duration: +(total - lead).toFixed(2), missed };
    allMissed.push(...missed.map((m) => `${id}: ${m}`));
    console.log(id, index[id].duration, missed.length ? `MISSED ${missed.length}` : 'ok');
    writeFileSync(path.join(out, 'clips.json'), JSON.stringify(index, null, 1));
  }
  await browser.close();
}
if (allMissed.length) { console.log(allMissed.join('\n')); process.exit(1); }
