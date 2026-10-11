/**
 * e2e/demo/record-demo.mjs — records the picture of the narrated demo film.
 *
 *   DEMO_LANG=en DEMO_DEVICE=desktop node e2e/demo/record-demo.mjs <work-dir>
 *
 * Four films: English and Hindi, each for the desktop layout (1280x720) and for
 * the phone layout (390 px wide, recorded at 720x1558). Every scene in
 * `script.json` is performed here on the demo stack's real screens (the steps
 * are in `flows.mjs`, shared with the landing page's loops) and held for
 * exactly as long as that language's narration runs (`timing.json`, written
 * by `voice.mjs`). Inside a scene, `cue(n)` waits for the moment line n is
 * spoken, so the pointer does what the voice is saying.
 *
 * Writes <work>/<lang>-<device>/segment-*.webm and timeline.json (where each
 * scene starts and ends inside its segment). `build-demo.mjs` cuts and joins
 * them and lays the voice and captions over.
 *
 * It CHANGES the demo book (an entry, a bill, an issue and a return, a
 * collection), so re-seed before each run. A step that cannot be performed is
 * logged as MISSED and the run exits non-zero, so a film with a hole in it is
 * never built silently.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DESKTOP, PHONE, lending, library, makeStage, shop } from './flows.mjs';
import { CURSOR_SCRIPT, FE, HERE, STATE, clickEl, codeFor, logSize, sleep } from './lib.mjs';

const work = process.argv[2];
const LANG = process.env.DEMO_LANG ?? 'en';
const device = (process.env.DEMO_DEVICE ?? 'desktop') === 'mobile' ? PHONE : DESKTOP;
if (!work) throw new Error('usage: DEMO_LANG=en|hi DEMO_DEVICE=desktop|mobile node e2e/demo/record-demo.mjs <work-dir>');
const out = path.join(work, `${LANG}-${device.name}`);
mkdirSync(out, { recursive: true });

const timing = JSON.parse(readFileSync(path.join(work, 'timing.json'), 'utf8'));
const VIEW = device.mobile ? device.context.viewport : { width: 1280, height: 720 };
const SIZE = device.mobile ? { width: 720, height: 1558 } : { width: 1280, height: 720 };
const NEW_MOBILE = '9876501234';
const lockup = readFileSync(path.join(HERE, '..', '..', 'frontend', 'public', 'brand', 'yourkhata-lockup.svg'), 'utf8');

const browser = await chromium.launch(device.launch);
const timeline = [];
const missed = [];

/** One browser context = one video file. */
const segment = async (name, run) => {
  const ctx = await browser.newContext({ ...device.context, viewport: VIEW, recordVideo: { dir: out, size: SIZE }, locale: 'en-IN' });
  await ctx.addInitScript(CURSOR_SCRIPT);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  const waitUntil = async (t) => { const ms = (t - now()) * 1000; if (ms > 0) await sleep(ms); };

  const scene = async (id, perform) => {
    const lines = timing.lines[LANG][id];
    const start = now();
    const cueAt = (n) => start + lines.slice(0, n).reduce((sum, d) => sum + d + timing.gap.line, 0);
    const sceneMissed = [];
    const stage = makeStage(page, device, sceneMissed);
    // A step outside `soft` that fails is still only a missed step: the take
    // carries on, and the run exits non-zero at the end.
    try { await perform({ cue: (n) => waitUntil(cueAt(n)), st: stage }); } catch (e) { sceneMissed.push(`scene aborted — ${String(e.message).split('\n')[0].slice(0, 150)}`); await page.keyboard.press('Escape').catch(() => {}); }
    missed.push(...sceneMissed.map((m) => `${id}: ${m}`));
    await waitUntil(start + timing.scenes[id][LANG]);
    timeline.push({ scene: id, segment: name, start: +start.toFixed(3), end: +now().toFixed(3) });
    console.log('scene', id, (now() - start).toFixed(1), `(script ${timing.scenes[id][LANG]})`);
  };

  await run(page, scene);
  const video = page.video();
  await ctx.close();
  renameSync(await video.path(), path.join(out, `segment-${name}.webm`));
};

/** A still card. Sizes are in vw, so the same card fits the phone and the desktop frame. */
const card = (title, lines) => `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${device.mobile ? '7vw' : '2.6vw'};background:linear-gradient(135deg,#f5f4ff 0%,#ffffff 55%,#eeedfb 100%);font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans Devanagari',sans-serif;color:#17163a">
<div style="width:${device.mobile ? '62vw' : '33vw'}">${lockup.replace(/width="228" height="64"/, 'width="100%" height="auto"')}</div>
<div style="font-size:${device.mobile ? '7.4vw' : '3.1vw'};font-weight:650;letter-spacing:-0.02em;text-align:center;max-width:84vw;line-height:1.25">${title}</div>
<div style="display:flex;gap:${device.mobile ? '3vw' : '1.1vw'};flex-wrap:wrap;justify-content:center;flex-direction:${device.mobile ? 'column' : 'row'};align-items:center">${lines.map((l) => `<span style="font-size:${device.mobile ? '4.6vw' : '1.7vw'};padding:0.5em 1.1em;border-radius:999px;background:#fff;border:1.5px solid #cfcdf6;color:#3a36b8;font-weight:550">${l}</span>`).join('')}</div>
</body></html>`;

const CARDS = {
  en: {
    intro: ['All your records, in one place', ['Shop &amp; billing', 'Library', 'Lending']],
    outro: ['Start free at yourkhata.com', ['Sign up with your mobile number', 'No card needed', 'Hindi or English']],
  },
  hi: {
    intro: ['आपका सारा हिसाब, एक ही जगह', ['दुकान और बिलिंग', 'लाइब्रेरी', 'कर्ज़ और वसूली']],
    outro: ['yourkhata.com पर मुफ़्त शुरू करें', ['मोबाइल नंबर से साइन अप', 'कोई कार्ड नहीं', 'हिंदी या अंग्रेज़ी']],
  },
};

/** The real sign-in: the number, Send code, then the code read from the demo API's log. */
const otpStep = async (page, mobile, at, cue, numberCue, codeCue) => {
  await page.goto(`${FE}${at}`, { waitUntil: 'networkidle' });
  const field = page.getByLabel(/Mobile number/).first();
  if (numberCue !== null) await cue(numberCue);
  await clickEl(page, field, { after: 200 });
  await field.pressSequentially(mobile, { delay: 110 });
  const from = logSize();
  await sleep(500);
  await clickEl(page, page.getByRole('button', { name: /Send code/ }), { after: 300 });
  await page.getByRole('heading', { name: /Enter the code/ }).waitFor({ timeout: 30000 });
  const code = await codeFor(mobile, from);
  if (codeCue !== null) await cue(codeCue);
  await page.getByRole('textbox').first().focus();
  await page.keyboard.type(code, { delay: 320 });
  await page.waitForURL((u) => !/\/(login|signup)/.test(u.pathname), { timeout: 60000 });
  await page.waitForLoadState('networkidle').catch(() => {});
};

const openBusiness = async (st, name) => {
  await st.go('/switch');
  await st.pause(1300);
  await st.tap(st.page.getByRole('main').getByText(name).first(), { after: 300 });
  await st.page.waitForURL((u) => !u.pathname.startsWith('/switch'), { timeout: 15000 }).catch(() => {});
  await st.settle();
};

// ── Segment A: the title card and a brand-new number signing up ─────────────
await segment('a', async (page, scene) => {
  await page.setContent(card(...CARDS[LANG].intro));
  await sleep(700);
  await scene('intro', async () => {});
  await scene('signup', async ({ cue, st }) => {
    await otpStep(page, NEW_MOBILE, '/signup', cue, 1, 2);
    await cue(3);
    await st.soft('business name', async () => { await st.tap(page.getByLabel('Business name'), { after: 150 }); await st.type('Sharma Kirana Store', 70); });
    await st.soft('owner name', async () => { await st.tap(page.getByLabel(/Your name/), { after: 150 }); await st.type('Ramesh Sharma', 70); });
    await st.soft('business type', async () => { await st.tap(page.getByRole('radio', { name: /Retail shop/ }), { after: 400 }); });
  });
});

// ── Segment B: the owner logs in and works through all three modules ────────
await segment('b', async (page, scene) => {
  await page.goto(`${FE}/login`, { waitUntil: 'networkidle' });
  await sleep(500);

  await scene('login', async ({ cue, st }) => {
    // Line 0 is spoken over the number and the code going in.
    await otpStep(page, STATE.owner.mobile, '/login', cue, null, null);
    await cue(1);
    await st.look([page.getByText('To collect').first(), page.getByText('To pay').first(), page.getByText(/Today's sales|Cash in hand/).first()], 900);
    await cue(2);
    if (device.mobile) await st.look([page.getByRole('link', { name: 'Parties' }), page.getByRole('link', { name: 'Bills' }), page.getByRole('link', { name: 'Items' }), page.getByRole('link', { name: 'More' })], 700);
    else await st.look([page.getByRole('link', { name: 'Customers', exact: true }), page.getByRole('link', { name: 'Bills', exact: true }), page.getByRole('link', { name: 'Purchases', exact: true }), page.getByRole('link', { name: 'Items', exact: true })], 700);
  });

  await scene('shop-khata', async ({ cue, st }) => {
    await st.nav('Customers', '/customers');
    await st.pause(900);
    await cue(1);
    await st.soft('open khata', async () => { await st.tap(page.getByRole('button', { name: 'Open Ramesh Traders' }).first(), { after: 300 }); await page.waitForURL(/\/parties\/[0-9a-f-]{20,}/, { timeout: 15000 }); await st.settle(); });
    await st.pause(1200);
    await shop.entry(st, 'got', '500', 'Cash at the shop');
    await cue(2);
    await st.look([page.getByText(/You will get|To collect|Balance/).first()], 900);
  });

  await scene('shop-bill', async ({ cue, st }) => {
    await shop.bill(st, 'Anita General Store', [['Basm', 'Basmati Rice 5kg', 2]], { issue: false });
    await cue(2);
    await st.soft('issue bill', async () => {
      await st.tap(page.getByRole('button', { name: 'Issue', exact: true }).first(), { after: 350 });
      const credit = st.dialog().getByRole('button', { name: /Full credit/ });
      if (await credit.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) await st.tap(credit, { after: 300 });
      const view = st.dialog().getByRole('button', { name: 'View bill' });
      await view.waitFor({ timeout: 20000 });
      await st.pause(1000);
      await st.tap(view, { after: 300 });
      await page.waitForURL(/\/sales\/invoices\/[0-9a-f-]{20,}$/, { timeout: 20000 });
      await st.settle();
    });
  });

  await scene('shop-stock', async ({ cue, st }) => { await shop.itemsAndReports(st, cue); });

  await scene('library-home', async ({ cue, st }) => {
    await cue(1);
    await openBusiness(st, 'Vidya Reading Room');
    await st.go('/library');
    await cue(2);
    await st.look([page.getByText(/Fee unpaid/).first(), page.getByText(/Seats by shift/).first(), page.getByText(/Who has to pay/).first()], 1100);
  });

  await scene('library-students', async ({ cue, st }) => {
    await library.students(st);
    await cue(1);
    await library.admission(st);
  });

  await scene('library-books', async ({ cue, st }) => {
    await library.closeDialog(st);
    await library.catalogue(st);
    await cue(1);
    await library.issue(st, 'M-0004', STATE.library.freeCopy);
    await cue(2);
    await library.returnBook(st, STATE.library.freeCopy);
  });

  await scene('library-seats', async ({ st }) => { await library.seatsAndAttendance(st); });

  await scene('lending-today', async ({ cue, st }) => {
    await openBusiness(st, 'Verma Finance');
    await lending.today(st, 300);
    await cue(1);
    await st.look([page.getByText(/To collect today/).first(), page.getByText('Geeta Devi').first(), page.getByText('Ramu Kaka').first()], 900);
    await cue(2);
    await lending.collect(st);
  });

  await scene('lending-loans', async ({ cue, st }) => {
    await lending.loans(st);
    await cue(1);
    await lending.openLoan(st);
    await cue(2);
    await lending.newLoan(st);
  });

  await scene('together', async ({ cue, st }) => {
    await st.go('/switch');
    await st.look([page.getByRole('main').getByText('Sharma General Store'), page.getByRole('main').getByText('Vidya Reading Room'), page.getByRole('main').getByText('Verma Finance')], 800);
    await cue(1);
    await st.go('/settings/team');
    await st.soft('add member', async () => { await st.tap(page.getByRole('button', { name: 'Add member' }).first(), { after: 1300 }); });
    await cue(2);
    await page.keyboard.press('Escape');
    await st.pause(300);
    await st.soft('hindi', async () => {
      if (device.mobile) {
        await st.go('/more');
        const hindi = page.getByRole('radio', { name: 'हिन्दी' });
        await hindi.scrollIntoViewIfNeeded();
        await st.tap(hindi, { after: 1200 });
        await page.mouse.wheel(0, -2000);
      } else {
        await st.go('/lending');
        await st.tap(page.getByRole('button', { name: /Account menu/ }).last(), { after: 700 });
        await st.tap(page.getByRole('menuitem', { name: 'हिन्दी' }).or(page.getByText('हिन्दी', { exact: true })).first(), { after: 1200 });
      }
      await st.pause(900);
    });
  });

  await page.setContent(card(...CARDS[LANG].outro));
  await sleep(500);
  await scene('outro', async () => {});
});

await browser.close();
writeFileSync(path.join(out, 'timeline.json'), JSON.stringify({ lang: LANG, device: device.name, size: SIZE, timeline, missed }, null, 1));
console.log(JSON.stringify({ scenes: timeline.length, missed }));
process.exit(missed.length ? 1 : 0);
