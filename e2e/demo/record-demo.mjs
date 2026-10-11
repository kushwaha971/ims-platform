/**
 * e2e/demo/record-demo.mjs — records the picture of the narrated demo film.
 *
 *   DEMO_DEVICE=desktop|mobile node e2e/demo/record-demo.mjs <work-dir>
 *
 * Two films with one narration (Hindi): the desktop layout (1280x720) and the
 * phone layout (390 px wide, recorded at 720x1558) — the phone one is the
 * phone LAYOUT, tapped through like a phone, not the desktop picture shrunk.
 *
 * Every feature is told the same way (owner, 11 Oct 2026): a still card with
 * the PROBLEM and a moment it bites, then the answer performed on the demo
 * stack's real screens, step by step, and its benefit in the last line.
 *
 * THE VOICE AND THE PICTURE KEEP STEP BY CONSTRUCTION. `cue(n)` means "line n
 * is spoken from NOW": it first waits for the line before it to finish (and
 * the pause after it), then stamps the moment, and the steps written after it
 * are performed while that line is heard. So a line can never start before
 * the step before it is done, and a step can never run ahead of its line.
 * The first films laid every line at a time worked out beforehand, and the
 * screen drifted away from the voice whenever a page took longer than the
 * sentence. The stamped times go into timeline.json, and `build-demo.mjs`
 * lays each line's audio, and its caption, exactly there.
 *
 * Writes <work>/<device>/segment-*.webm and timeline.json. It CHANGES the demo
 * book (a business, an entry, a bill, a collection), so re-seed before each
 * run. A step that cannot be performed is logged as MISSED and the run exits
 * non-zero, so a film with a hole in it is never built silently.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { DESKTOP, PHONE, lending, library, makeStage, shop } from './flows.mjs';
import { CURSOR_SCRIPT, FE, HERE, codeFor, logSize, signIn, sleep } from './lib.mjs';

const work = process.argv[2];
const device = (process.env.DEMO_DEVICE ?? 'desktop') === 'mobile' ? PHONE : DESKTOP;
if (!work) throw new Error('usage: DEMO_DEVICE=desktop|mobile node e2e/demo/record-demo.mjs <work-dir>');
const out = path.join(work, device.name);
mkdirSync(out, { recursive: true });

const script = JSON.parse(readFileSync(path.join(HERE, 'script.json'), 'utf8'));
const timing = JSON.parse(readFileSync(path.join(work, 'timing.json'), 'utf8'));
const LANG = timing.lang;
const VIEW = device.mobile ? device.context.viewport : { width: 1280, height: 720 };
/** The size the film is cut to; the frames themselves are whatever the screen is. */
const SIZE = device.mobile ? { width: 720, height: 1558 } : { width: 1280, height: 720 };
const NEW_MOBILE = '9876501234';
const lockup = readFileSync(path.join(HERE, '..', '..', 'frontend', 'public', 'brand', 'yourkhata-lockup.svg'), 'utf8');

const browser = await chromium.launch(device.launch);
const timeline = [];
const missed = [];

/**
 * One browser context = one segment of picture, kept as FRAMES WITH THE TIME
 * EACH WAS DRAWN, not as a video file.
 *
 * Playwright's own recorder cannot be used for a narrated film, and this cost
 * the first set of films their sync (owner, 11 Oct 2026: "not properly
 * synchronized"). It writes every frame the browser sends at least once into
 * a 25 fps file, and a moving pointer or an opening dialog sends more than 25
 * a second — so the file runs long against the clock, by 4 to 9 per cent, and
 * by an amount that depends on how busy the screen was. Measured on the
 * published films: the picture was 12 to 14 seconds behind the voice by the
 * end of a four-minute take. Nothing in the film is slow; the tape is.
 *
 * So the frames are taken from the browser's screencast directly, each with
 * the browser's own timestamp, and `build-demo.mjs` shows every frame for
 * exactly as long as it was on screen. A scene's picture is then as long as
 * the scene took, to the frame, and the voice is laid over it by the same clock.
 */
const segment = async (name, run) => {
  const ctx = await browser.newContext({ ...device.context, viewport: VIEW, locale: 'en-IN' });
  await ctx.addInitScript(CURSOR_SCRIPT);
  const page = await ctx.newPage();
  const frameDir = path.join(out, `frames-${name}`);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
  const base = Date.now() / 1000;
  const now = () => Date.now() / 1000 - base;
  const waitUntil = async (t) => { const ms = (t - now()) * 1000; if (ms > 0) await sleep(ms); };

  // ≤ 25 frames a second are kept. A frame that arrives sooner is held, and
  // written if nothing newer replaces it within 50 ms — so the LAST frame of
  // a burst (the state the screen came to rest in) is never the one dropped.
  const frames = [];
  let held = null;
  let heldTimer = null;
  const keep = (frame) => { const file = `f${String(frames.length).padStart(6, '0')}.jpg`; writeFileSync(path.join(frameDir, file), Buffer.from(frame.data, 'base64')); frames.push({ file, t: +(frame.t - base).toFixed(4) }); };
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (event) => {
    cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    const frame = { data: event.data, t: event.metadata?.timestamp ?? Date.now() / 1000 };
    clearTimeout(heldTimer);
    const last = frames.at(-1);
    if (!last || frame.t - base - last.t >= 0.04) { held = null; keep(frame); return; }
    held = frame;
    heldTimer = setTimeout(() => { if (held) { keep(held); held = null; } }, 50);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });

  const scene = async (id, perform = async () => {}) => {
    const lines = timing.lines[id];
    const start = now();
    const starts = [];
    /** When the voice is free to begin the next line. */
    let free = start;
    // Line n is spoken from now. Any line before it that was never cued is
    // spoken first, in order: a line is never skipped and never overlaps.
    const cue = async (n) => {
      for (let k = starts.length; k <= n; k += 1) {
        await waitUntil(free);
        starts[k] = now();
        free = starts[k] + lines[k] + timing.gap.line;
      }
    };
    /** Wait for the line being spoken to finish. */
    const spoken = () => waitUntil(free - timing.gap.line);
    const sceneMissed = [];
    const stage = makeStage(page, device, sceneMissed);
    // A step outside `soft` that fails is still only a missed step: the take
    // carries on, and the run exits non-zero at the end.
    try { await perform({ cue, spoken, st: stage }); } catch (e) { sceneMissed.push(`scene aborted — ${String(e.message).split('\n')[0].slice(0, 150)}`); await page.keyboard.press('Escape').catch(() => {}); }
    await cue(lines.length - 1);
    await spoken();
    await sleep(timing.gap.scene * 1000);
    missed.push(...sceneMissed.map((m) => `${id}: ${m}`));
    timeline.push({ scene: id, segment: name, start: +start.toFixed(3), end: +now().toFixed(3), lines: starts.map((t) => +(t - start).toFixed(3)) });
    console.log('scene', id, (now() - start).toFixed(1));
  };

  /** A still card held for as long as its lines take: the problem, or a title. */
  const cardScene = async (id) => {
    const data = script.scenes.find((s) => s.id === id).card;
    // A navigation still under way would replace the card a moment after it is drawn.
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(400);
    await page.setContent(data.n ? problemCard(data.n, ...data[LANG]) : titleCard(...data[LANG]));
    await sleep(600);
    await scene(id);
  };

  await run(page, scene, cardScene);
  await sleep(300);
  await cdp.send('Page.stopScreencast').catch(() => {});
  clearTimeout(heldTimer);
  if (held) keep(held);
  writeFileSync(path.join(out, `frames-${name}.json`), JSON.stringify({ dir: `frames-${name}`, frames }));
  await ctx.close();
  console.log('segment', name, frames.length, 'frames over', now().toFixed(1), 's');
};

/** Still cards. Sizes are in vw, so the same card fits the phone and the desktop frame. */
const FONT = "-apple-system,'Segoe UI',Roboto,'Noto Sans Devanagari','Kohinoor Devanagari',sans-serif";
const m = device.mobile;
const titleCard = (title, chips) => `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${m ? '7vw' : '2.6vw'};background:linear-gradient(135deg,#f5f4ff 0%,#ffffff 55%,#eeedfb 100%);font-family:${FONT};color:#17163a">
<div style="width:${m ? '62vw' : '33vw'}">${lockup.replace(/width="228" height="64"/, 'width="100%" height="auto"')}</div>
<div style="font-size:${m ? '7.4vw' : '3.1vw'};font-weight:650;letter-spacing:-0.02em;text-align:center;max-width:84vw;line-height:1.3">${title}</div>
<div style="display:flex;gap:${m ? '3vw' : '1.1vw'};flex-wrap:wrap;justify-content:center;max-width:88vw">${chips.map((l) => `<span style="font-size:${m ? '4.6vw' : '1.7vw'};padding:0.5em 1.1em;border-radius:999px;background:#fff;border:1.5px solid #cfcdf6;color:#3a36b8;font-weight:550">${l}</span>`).join('')}</div>
</body></html>`;
/** The problem, as the question a business owner asks, and the moment it bites. */
const problemCard = (n, question, moment) => `<!doctype html><html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${m ? '6vw' : '2.2vw'};background:linear-gradient(160deg,#17163a 0%,#2a278f 100%);font-family:${FONT};color:#fff;padding:0 ${m ? '8vw' : '10vw'};box-sizing:border-box">
<div style="font-size:${m ? '4.2vw' : '1.45vw'};font-weight:600;letter-spacing:0.04em;padding:0.45em 1.2em;border-radius:999px;background:rgba(255,255,255,.14);border:1.5px solid rgba(255,255,255,.35)">${LANG === 'hi' ? 'मुश्किल' : 'Problem'} ${n}</div>
<div style="font-size:${m ? '8.4vw' : '3.6vw'};font-weight:680;letter-spacing:-0.02em;text-align:center;line-height:1.3">${question}</div>
<div style="font-size:${m ? '5vw' : '1.9vw'};text-align:center;line-height:1.5;color:#d9d8ff">${moment}</div>
</body></html>`;

const openBusiness = async (st, name) => {
  await st.go('/switch');
  await st.pause(1300);
  await st.tap(st.page.getByRole('main').getByText(name).first(), { after: 300 });
  await st.page.waitForURL((u) => !u.pathname.startsWith('/switch'), { timeout: 15000 }).catch(() => {});
  await st.settle();
};

const main = (page) => page.getByRole('main');

// ── Segment A: the title, and a brand-new number that chooses what it needs ──
await segment('a', async (page, scene, cardScene) => {
  await cardScene('intro');
  await cardScene('start-problem');

  await page.goto(`${FE}/signup`, { waitUntil: 'networkidle' });
  await sleep(600);
  await scene('start', async ({ cue, spoken, st }) => {
    // 0 — only a mobile number.
    await cue(0);
    const field = page.getByLabel(/Mobile number/).first();
    await st.tap(field, { after: 200 });
    await field.pressSequentially(NEW_MOBILE, { delay: 150 });
    // 1 — Send code, then the four digits.
    await cue(1);
    const from = logSize();
    await st.tap(page.getByRole('button', { name: /Send code/ }), { after: 300 });
    await page.getByRole('heading', { name: /Enter the code/ }).waitFor({ timeout: 30000 });
    const code = await codeFor(NEW_MOBILE, from);
    await st.pause(1500);
    await page.getByRole('textbox').first().focus();
    await page.keyboard.type(code, { delay: 650 });
    await page.waitForURL(/\/onboarding\/step\/1/, { timeout: 60000 });
    const choice = page.getByRole('group', { name: 'What do you want to use?' });
    await choice.waitFor({ timeout: 30000 });
    // 2 — the business, the owner, the state.
    await cue(2);
    await st.soft('business name', async () => { await st.tap(page.getByLabel('Business name'), { after: 150 }); await st.type('Sharma Kirana Store', 55); });
    await st.soft('owner name', async () => { await st.tap(page.getByLabel(/Your name/), { after: 150 }); await st.type('Ramesh Sharma', 55); });
    await st.soft('state', async () => {
      await st.tap(page.getByRole('combobox', { name: /State/ }), { after: 300 });
      await st.type('Maha', 120);
      await st.tap(page.getByRole('option', { name: /Maharashtra/ }), { after: 400 });
    });
    // 3 — what do you want to use: one, or several.
    await cue(3);
    await st.soft('look at the choices', async () => {
      await choice.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await st.pause(700);
      await st.look([choice.getByRole('checkbox', { name: /^Library/ }), choice.getByRole('checkbox', { name: /^Lending/ }), choice.getByRole('checkbox', { name: /^Shop/ })], 1300);
    });
    // 4 — Shop is ticked, so the kind of shop is asked; Continue.
    await cue(4);
    await st.soft('tick Shop', async () => { await st.tap(choice.getByRole('checkbox', { name: /^Shop/ }), { after: 900 }); });
    await st.soft('kind of shop', async () => { await st.tap(page.getByRole('radio', { name: /Retail shop/ }), { after: 700 }); });
    await spoken();
    await st.soft('continue', async () => { await st.tap(page.getByRole('button', { name: 'Continue' }), { after: 300 }); await page.waitForURL(/\/onboarding\/step\/2/, { timeout: 30000 }); await st.settle(); });
    // 5 — GST and address skipped; the last screen says the choice back.
    await cue(5);
    await st.soft('skip GST', async () => { await st.pause(900); await st.tap(page.getByRole('button', { name: /Skip/ }), { after: 300 }); await page.waitForURL(/\/onboarding\/step\/3/, { timeout: 30000 }); await st.settle(); });
    await st.soft('skip address', async () => { await st.pause(900); await st.tap(page.getByRole('button', { name: /Skip/ }), { after: 300 }); await page.waitForURL(/\/onboarding\/step\/4/, { timeout: 30000 }); await st.settle(); });
    await st.soft('summary', async () => { await page.getByText('You will use').waitFor({ timeout: 20000 }); await st.look([page.getByText('You will use'), page.getByText('Shop', { exact: true }).first()], 1100); });
    await spoken();
    await st.soft('start using', async () => { await st.tap(page.getByRole('button', { name: /Start using/ }), { after: 300 }); await page.waitForURL((u) => !u.pathname.startsWith('/onboarding'), { timeout: 60000 }); await st.settle(); await st.pause(1200); });
    // 6 — the menu holds what was chosen, and nothing else.
    await cue(6);
    if (device.mobile) await st.look([page.getByRole('link', { name: 'Parties' }), page.getByRole('link', { name: 'Bills' }), page.getByRole('link', { name: 'Items' }), page.getByRole('link', { name: 'More' })], 1100);
    else await st.look([page.getByRole('link', { name: 'Customers', exact: true }), page.getByRole('link', { name: 'Bills', exact: true }), page.getByRole('link', { name: 'Purchases', exact: true }), page.getByRole('link', { name: 'Items', exact: true }), page.getByRole('link', { name: 'Reports', exact: true })], 1000);
  });
});

// ── Segment B: three businesses already in use, one problem at a time ───────
await segment('b', async (page, scene, cardScene) => {
  // Signed in before the first scene: nothing between scenes is in the film.
  await signIn(page);

  await cardScene('credit-problem');
  await openBusiness(makeStage(page, device), 'Sharma General Store');
  await page.goto(`${FE}/dashboard`, { waitUntil: 'networkidle' });
  await sleep(500);
  await scene('credit', async ({ cue, spoken, st }) => {
    await cue(0);
    await st.nav('Customers', '/customers');
    await st.look([page.getByText('Ramesh Traders').first(), page.getByText('Anita General Store').first()], 1200);
    await cue(1);
    await st.soft('open khata', async () => { await st.tap(page.getByRole('button', { name: 'Open Ramesh Traders' }).first(), { after: 300 }); await page.waitForURL(/\/parties\/[0-9a-f-]{20,}/, { timeout: 15000 }); await st.settle(); });
    await st.scroll(260, 1200);
    await st.scroll(-260, 600);
    await cue(2);
    await shop.entry(st, 'got', '500', 'Cash at the shop');
    await cue(3);
    await st.look([page.getByText(/You will get|To collect|Balance/).first()], 1500);
  });

  await cardScene('billing-problem');
  await page.goto(`${FE}/sales/invoices/new`, { waitUntil: 'networkidle' });
  await sleep(700);
  await scene('billing', async ({ cue, spoken, st }) => {
    await cue(0);
    await shop.billParty(st, 'Anita General Store', { open: false });
    await cue(1);
    await shop.billItem(st, 0, 'Basm', 'Basmati Rice 5kg', 2);
    await cue(2);
    await shop.billTotals(st);
    await cue(3);
    await st.soft('issue bill', async () => {
      await st.tap(page.getByRole('button', { name: 'Issue', exact: true }).first(), { after: 350 });
      const credit = st.dialog().getByRole('button', { name: /Full credit/ });
      if (await credit.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) await st.tap(credit, { after: 300 });
      const view = st.dialog().getByRole('button', { name: 'View bill' });
      await view.waitFor({ timeout: 20000 });
      await st.pause(1200);
      await st.tap(view, { after: 300 });
      await page.waitForURL(/\/sales\/invoices\/[0-9a-f-]{20,}$/, { timeout: 20000 });
      await st.settle();
    });
    await cue(4);
    await st.scroll(300, 1400);
  });

  await cardScene('stock-problem');
  await page.goto(`${FE}/dashboard`, { waitUntil: 'networkidle' });
  await sleep(500);
  await scene('stock', async ({ cue, st }) => {
    await cue(0);
    await st.nav('Items', '/items');
    await st.pause(900);
    await st.soft('low tab', async () => { await st.tap(page.getByRole('tab', { name: /^Low/ }), { after: 1500 }); });
    await cue(1);
    await st.nav('Reports', '/reports');
    await st.look([page.getByRole('link', { name: 'Day book' }), page.getByRole('link', { name: 'Receivables aging' }), page.getByRole('link', { name: 'Sales register' }), page.getByRole('link', { name: 'GST summary' })], 1300);
    await cue(2);
    await st.soft('day book', async () => { await st.tap(page.getByRole('link', { name: 'Day book' }).first(), { after: 300 }); await st.settle(); });
  });

  await cardScene('members-problem');
  await openBusiness(makeStage(page, device), 'Vidya Reading Room');
  await page.goto(`${FE}/library`, { waitUntil: 'networkidle' });
  await sleep(700);
  await scene('members', async ({ cue, spoken, st }) => {
    await cue(0);
    await st.pause(1500);
    await cue(1);
    await st.look([page.getByText(/Fee unpaid/).first(), page.getByText(/Seats by shift/).first(), page.getByText(/Who has to pay/).first()], 1500);
    await cue(2);
    await library.students(st);
    await st.scroll(240, 1000);
    await st.scroll(-240, 500);
    await cue(3);
    await library.admission(st);
    await spoken();
    await library.closeDialog(st);
    await cue(4);
    await st.nav('Seats', '/library/seats');
    await st.pause(2200);
    await st.nav('Attendance', '/library/attendance');
    await st.pause(1500);
    await cue(5);
    await st.go('/library');
  });

  await cardScene('collect-problem');
  await openBusiness(makeStage(page, device), 'Verma Finance');
  await lending.today(makeStage(page, device), 300);
  await scene('collect', async ({ cue, st }) => {
    await cue(0);
    await st.look([page.getByText(/To collect today/).first(), page.getByText('Geeta Devi').first(), page.getByText('Ramu Kaka').first()], 1400);
    await cue(1);
    await lending.collect(st);
    await cue(2);
    await lending.loans(st);
    await lending.openLoan(st);
    await cue(3);
    await lending.today(st, 800);
  });

  await page.goto(`${FE}/switch`, { waitUntil: 'networkidle' });
  await sleep(500);
  await scene('together', async ({ cue, spoken, st }) => {
    await cue(0);
    await st.look([main(page).getByText('Sharma General Store'), main(page).getByText('Vidya Reading Room'), main(page).getByText('Verma Finance')], 1300);
    await st.soft('open a business', async () => { await st.tap(main(page).getByText('Sharma General Store').first(), { after: 300 }); await page.waitForURL((u) => !u.pathname.startsWith('/switch'), { timeout: 15000 }); await st.settle(); });
    // 1 — the business menu: what this business could add, or turn off.
    await cue(1);
    await st.soft('business menu', async () => {
      await st.tap(page.getByRole('button', { name: /Current business/ }).first(), { after: 900 });
      await st.look([page.getByText(/^Add Library/).first(), page.getByText(/^Add Lending/).first(), page.getByText(/^Turn off|^Add a business/).first()], 1500);
    });
    await spoken();
    await page.keyboard.press('Escape');
    await st.pause(400);
    // 2 — the team, and who sees what.
    await cue(2);
    await st.go('/settings/team');
    await st.soft('add member', async () => { await st.tap(page.getByRole('button', { name: 'Add member' }).first(), { after: 1500 }); await st.look([st.dialog().getByLabel(/Role/).first()], 1200); });
    await spoken();
    await page.keyboard.press('Escape');
    await st.pause(400);
    // 3 — the same screens in Hindi.
    await cue(3);
    await st.soft('hindi', async () => {
      if (device.mobile) {
        await st.go('/more');
        const hindi = page.getByRole('radio', { name: 'हिन्दी' });
        await hindi.scrollIntoViewIfNeeded();
        await st.tap(hindi, { after: 1200 });
        await page.mouse.wheel(0, -2000);
      } else {
        await st.go('/dashboard');
        await st.tap(page.getByRole('button', { name: /Account menu/ }).last(), { after: 700 });
        await st.tap(page.getByRole('menuitem', { name: 'हिन्दी' }).or(page.getByText('हिन्दी', { exact: true })).first(), { after: 1200 });
      }
      await st.pause(1500);
    });
  });

  await cardScene('outro');
});

await browser.close();
writeFileSync(path.join(out, 'timeline.json'), JSON.stringify({ lang: LANG, device: device.name, size: SIZE, timeline, missed }, null, 1));
console.log(JSON.stringify({ scenes: timeline.length, missed }));
process.exit(missed.length ? 1 : 0);
