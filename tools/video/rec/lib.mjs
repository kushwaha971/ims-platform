/**
 * lib.mjs — the recording engine for the YourKhata demo videos.
 *
 * Why not Playwright's `recordVideo`: in this container it records at CSS-pixel
 * size (390×844 for the phone) at ~70 kbit/s VP8 and ignores deviceScaleFactor,
 * so text is soft. Instead we poll `Page.captureScreenshot` on our own CDP
 * session (with the device-metrics override repeated on that session, because
 * CDP emulation is per-session) → JPEG frames at DEVICE pixels (780×1688 phone,
 * 1920×1080 desktop) with wall-clock timestamps, ~12–20 fps. The editor turns
 * them into constant 30 fps with the concat demuxer's per-frame durations.
 *
 * Sync model: narration audio is generated FIRST (tools/tts.py → durations.json).
 * Each segment starts its action and its audio at the same mark; the segment
 * lasts max(action time, audio + gap). Marks are wall-clock, same clock as the
 * frames, so the editor places each WAV at (mark − chapter start).
 */
import { chromium } from '/home/claude/repo/e2e/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

export const FE = process.env.FE ?? 'http://localhost:3000';
export const ROOT = '/home/claude/video';

export const PROFILES = {
  // Real phone: 390×844 CSS, DPR 2 → 780×1688 frames; touch + mobile UA.
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, touch: true },
  // YouTube 16:9: 1440×810 CSS at DPR 4/3 → 1920×1080 frames; text renders 1.33× larger than a 1080p screen.
  desktop: { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, isMobile: false, hasTouch: false, touch: false },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── In-page overlay: cursor (desktop) / finger (mobile), ripple, privacy masker ── */
const OVERLAY = (touch) => `(() => {
  const TOUCH = ${touch};
  const install = () => {
    if (document.getElementById('__yk_cursor')) return;
    const s = document.createElement('style');
    s.textContent = \`
      #__yk_cursor{position:fixed;left:-100px;top:-100px;pointer-events:none;z-index:2147483647;transition:opacity .25s,transform .12s;opacity:0}
      #__yk_cursor.touch{width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,184,0,.38);border:3px solid rgba(255,140,0,.95);box-shadow:0 0 0 2px rgba(255,255,255,.9),0 2px 10px rgba(0,0,0,.25)}
      #__yk_cursor.arrow{width:30px;height:30px;margin:-4px 0 0 -4px}
      #__yk_cursor.arrow::before{content:'';position:absolute;left:-14px;top:-14px;width:36px;height:36px;border-radius:50%;background:rgba(255,184,0,.30)}
      .__yk_ripple{position:fixed;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:4px solid rgba(255,140,0,.95);pointer-events:none;z-index:2147483646;animation:__ykr .65s ease-out forwards}
      @keyframes __ykr{from{transform:scale(.6);opacity:1}to{transform:scale(2.6);opacity:0}}
      .__yk_masked{filter:blur(8px)!important}
      ::-webkit-scrollbar{width:0!important;height:0!important}
    \`;
    document.documentElement.appendChild(s);
    const c = document.createElement('div');
    c.id = '__yk_cursor';
    c.className = TOUCH ? 'touch' : 'arrow';
    if (!TOUCH) c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" style="position:relative"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    let hideT = 0;
    window.__yk = {
      move(x, y) { c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.opacity = 1; if (TOUCH) { clearTimeout(hideT); } },
      ripple(x, y) {
        const r = document.createElement('div'); r.className = '__yk_ripple'; r.style.left = x + 'px'; r.style.top = y + 'px';
        document.documentElement.appendChild(r); setTimeout(() => r.remove(), 800);
        c.style.transform = 'scale(.82)'; setTimeout(() => (c.style.transform = ''), 160);
        if (TOUCH) { clearTimeout(hideT); hideT = setTimeout(() => (c.style.opacity = 0), 900); }
      },
      hide() { c.style.opacity = 0; },
      leaks: [],
    };
    if (!TOUCH) {
      addEventListener('mousemove', (e) => window.__yk.move(e.clientX, e.clientY), true);
      addEventListener('mousedown', (e) => window.__yk.ripple(e.clientX, e.clientY), true);
    }
    // Privacy masker: blur temporary passwords, share-link tokens, JWT-like strings.
    const TOKEN = /\\/d\\/[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]+/;
    const scan = () => {
      document.querySelectorAll('[data-testid=credentials-password],[data-testid=credentials-copy-message]').forEach((e) => e.classList.add('__yk_masked'));
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (TOKEN.test(n.data) && n.parentElement && !n.parentElement.closest('script,style')) {
          n.parentElement.classList.add('__yk_masked');
          if (window.__yk.leaks.length < 50) window.__yk.leaks.push(n.data.replace(/[A-Za-z0-9_-]{12,}/g, '•••').slice(0, 80));
        }
      }
      document.querySelectorAll('input').forEach((i) => {
        if (i.value && TOKEN.test(i.value)) { i.classList.add('__yk_masked'); }
      });
    };
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan();
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();
})();`;

export class Recorder {
  /**
   * @param video   'mobile' | 'desktop' | 'superadmin'
   * @param profile key of PROFILES
   * @param opts    { dry: boolean (no narration waits; screenshot per segment), only: chapter ids }
   */
  constructor(video, profile, opts = {}) {
    this.video = video;
    this.profile = PROFILES[profile];
    this.opts = opts;
    this.build = `${ROOT}/build/${video}`;
    const durFile = `${this.build}/durations.json`;
    this.durations = existsSync(durFile) ? JSON.parse(readFileSync(durFile, 'utf8')) : {};
    this.stages = {};
    this.log = [];
    this.leaks = [];
  }

  async launch() {
    this.browser = await chromium.launch({ args: ['--hide-scrollbars', '--font-render-hinting=none'] });
  }

  /** A browser context + page ("stage"); super-admin uses two (operator, owner). */
  async stage(key, { locale = 'en-IN' } = {}) {
    const p = this.profile;
    const ctx = await this.browser.newContext({
      viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: p.isMobile, hasTouch: p.hasTouch,
      locale, timezoneId: 'Asia/Kolkata', colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'],
    });
    await ctx.addInitScript(OVERLAY(p.touch));
    // Printing opens the OS dialog in a real browser; here it would block — record the call instead.
    await ctx.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => this.log.push({ t: Date.now(), kind: 'pageerror', msg: String(e).slice(0, 300) }));
    // WhatsApp / wa.me pop-ups cannot load here (and must not show a real third-party UI):
    // capture the URL for the narration + the share-page step, then close the pop-up.
    ctx.on('page', async (pop) => {
      if (pop === page) return;
      const url = pop.url();
      this.lastPopup = url;
      await pop.close().catch(() => {});
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: p.viewport.width, height: p.viewport.height, deviceScaleFactor: p.deviceScaleFactor, mobile: p.isMobile,
    });
    const st = { key, ctx, page, cdp, cursor: { x: p.viewport.width / 2, y: p.viewport.height / 2 } };
    this.stages[key] = st;
    if (!this.current) this.current = st;
    return st;
  }

  /** Which stage the camera is on (frames come from this page). */
  camera(key) { this.current = this.stages[key]; this.mark('camera', { key }); }

  /* ── frame capture ─────────────────────────────────────────────────────── */
  async startCapture(dir) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    this.frames = [];
    this.marks = [];
    this.capDir = dir;
    this.capturing = true;
    this.t0 = Date.now();
    let n = 0;
    const pending = new Set();
    this.loop = (async () => {
      while (this.capturing) {
        const st = this.current;
        const t = Date.now();
        try {
          const r = await st.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, optimizeForSpeed: true });
          const file = `${dir}/f${String(n++).padStart(6, '0')}.jpg`;
          const w = writeFile(file, Buffer.from(r.data, 'base64'));
          pending.add(w); w.finally(() => pending.delete(w));
          this.frames.push({ t, file });
        } catch (e) {
          await sleep(30); // navigation in progress — try again
        }
      }
      await Promise.all(pending);
    })();
  }

  async stopCapture() {
    this.capturing = false;
    await this.loop;
    const tEnd = Date.now();
    writeFileSync(`${this.capDir}/frames.json`, JSON.stringify({ t0: this.t0, tEnd, frames: this.frames.map((f) => ({ t: f.t, file: f.file.split('/').pop() })) }));
    writeFileSync(`${this.capDir}/marks.json`, JSON.stringify({ t0: this.t0, tEnd, marks: this.marks }, null, 1));
    const secs = (tEnd - this.t0) / 1000;
    this.log.push({ kind: 'capture', dir: this.capDir, frames: this.frames.length, secs, fps: +(this.frames.length / secs).toFixed(1) });
  }

  mark(kind, data = {}) { (this.marks ??= []).push({ kind, t: Date.now() - (this.t0 ?? Date.now()), ...data }); }

  /* ── running a story ───────────────────────────────────────────────────── */
  async runChapter(ch, h) {
    const dir = `${this.build}/rec/${ch.id}`;
    if (ch.setup) await ch.setup(h); // off-camera: seeding, navigation to the start screen
    await sleep(600);
    if (!this.opts.dry) await this.startCapture(dir); else { mkdirSync(dir, { recursive: true }); this.marks = []; this.t0 = Date.now(); }
    await sleep(700); // a still lead-in so the fade-in has frames
    for (const seg of ch.segments) {
      if (seg.onCard) continue; // plays over the title card, not the recording
      const dur = this.durations[seg.id]?.secs ?? estimate(seg.say ?? seg.cap);
      const gap = seg.gap ?? 0.7;
      const start = Date.now();
      this.mark('seg', { id: seg.id, dur });
      if (seg.label) this.mark('label', { text: seg.label });
      // `lead` (s): let the narration start before the action (e.g. "ab yahan tap kijiye").
      if (seg.lead && !this.opts.dry) await sleep(seg.lead * 1000);
      try {
        if (seg.act) await seg.act(h);
      } catch (e) {
        this.log.push({ kind: 'action-failed', seg: seg.id, msg: String(e).split('\n')[0].slice(0, 300) });
        console.error(`  ✗ ${seg.id}: ${String(e).split('\n')[0].slice(0, 200)}`);
      }
      const spent = (Date.now() - start) / 1000;
      if (!this.opts.dry) {
        const rest = dur + gap - spent;
        if (rest > 0) await sleep(rest * 1000);
        else this.log.push({ kind: 'overrun', seg: seg.id, by: +(-rest).toFixed(2) });
      } else {
        await sleep(400);
        await this.current.page.screenshot({ path: `${dir}/${seg.id}.png` }).catch(() => {});
      }
      await this.privacyCheck(seg.id);
      this.mark('segEnd', { id: seg.id });
    }
    await sleep(900); // tail for the fade-out
    if (!this.opts.dry) await this.stopCapture();
    else writeFileSync(`${dir}/marks.json`, JSON.stringify({ t0: this.t0, tEnd: Date.now(), marks: this.marks }, null, 1));
  }

  /** Fails loudly (in the log) if anything secret could be on screen. */
  async privacyCheck(segId) {
    for (const st of [this.current]) {
      const r = await st.page.evaluate(() => {
        const out = [];
        document.querySelectorAll('input').forEach((i) => {
          const hint = `${i.name} ${i.autocomplete} ${i.getAttribute('aria-label') ?? ''} ${i.placeholder}`.toLowerCase();
          if (/password/.test(hint) && i.type !== 'password' && i.value) out.push(`visible password field ${i.name}`);
        });
        return { out, leaks: window.__yk?.leaks?.splice(0) ?? [] };
      }).catch(() => ({ out: [], leaks: [] }));
      for (const m of r.out) this.leaks.push({ seg: segId, kind: 'password', m });
      for (const m of r.leaks) this.leaks.push({ seg: segId, kind: 'token-masked', m });
    }
  }

  async close() {
    writeFileSync(`${this.build}/record-log.json`, JSON.stringify({ log: this.log, leaks: this.leaks }, null, 1));
    await this.browser?.close();
  }
}

export const estimate = (text = '') => Math.max(2, text.split(/\s+/).length / 2.3);

/* ── helpers handed to story actions ─────────────────────────────────────── */
export function helpers(rec) {
  const st = () => rec.current;
  const page = () => rec.current.page;
  const touch = () => rec.profile.touch;
  const dry = !!rec.opts.dry;
  const slow = (ms) => sleep(dry ? Math.min(ms, 250) : ms);

  async function point(locator) {
    await locator.waitFor({ state: 'visible', timeout: 15000 });
    await locator.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })).catch(() => {});
    await slow(250);
    const b = await locator.boundingBox();
    if (!b) throw new Error('no bounding box');
    return { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 22) };
  }
  /** Glide the desktop cursor (visible arrow) along a human-ish path. */
  async function glide(x, y) {
    const s = st();
    const dist = Math.hypot(x - s.cursor.x, y - s.cursor.y);
    const steps = Math.max(8, Math.min(40, Math.round(dist / 18)));
    await page().mouse.move(x, y, { steps });
    s.cursor = { x, y };
  }

  const h = {
    rec,
    get page() { return page(); },
    sleep: slow,
    /** Wall-clock wait that is NOT shortened in dry runs (e.g. waiting for a server job). */
    hardWait: sleep,
    loc: (sel) => page().locator(sel),
    role: (role, name, opts = {}) => page().getByRole(role, { name, ...opts }).first(),
    btn: (name) => page().getByRole('button', { name }).first(),
    link: (name) => page().getByRole('link', { name }).first(),
    text: (t) => page().getByText(t).first(),
    testid: (id) => page().getByTestId(id).first(),
    ph: (p) => page().getByPlaceholder(p).first(),
    dialog: () => page().getByRole('dialog').last(),

    async goto(path, settle = 1800) {
      await page().goto(`${FE}${path}`, { waitUntil: 'domcontentloaded' });
      await page().waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await slow(settle);
    },
    /** Tap (mobile) / click (desktop) with a visible indicator. */
    async tap(locator, { pause = 450 } = {}) {
      const { x, y } = await point(locator);
      if (touch()) {
        await page().evaluate(([x, y]) => { window.__yk?.move(x, y); }, [x, y]);
        await slow(pause);
        await page().evaluate(([x, y]) => { window.__yk?.ripple(x, y); }, [x, y]);
        await slow(120);
        await locator.tap({ timeout: 8000 }).catch(async () => locator.click({ timeout: 8000 }));
      } else {
        await glide(x, y);
        await slow(pause);
        await page().mouse.down(); await slow(90); await page().mouse.up();
      }
      await slow(500);
    },
    /** Point at something without clicking (to draw the eye while narrating). */
    async hover(locator, hold = 900) {
      const { x, y } = await point(locator);
      if (touch()) {
        await page().evaluate(([x, y]) => { window.__yk?.move(x, y); setTimeout(() => window.__yk?.hide(), 1400); }, [x, y]);
      } else await glide(x, y);
      await slow(hold);
    },
    /** Visible, human-speed typing. */
    async type(locator, text, { delay = 75, clear = true } = {}) {
      await h.tap(locator, { pause: 250 });
      if (clear) { await locator.fill(''); }
      await locator.pressSequentially(text, { delay: dry ? 0 : delay });
      await slow(350);
    },
    async press(key) { await page().keyboard.press(key); await slow(300); },
    /** Smooth scroll by dy CSS px (or to an element). */
    async scroll(dy, ms = 900) {
      await page().evaluate(([dy, ms]) => {
        const el = [...document.querySelectorAll('main, [data-ub-scroll], body')].find((e) => e.scrollHeight > e.clientHeight + 10) ?? document.scrollingElement;
        const target = el === document.body ? document.scrollingElement : el;
        target.scrollBy({ top: dy, behavior: 'smooth' });
      }, [dy, ms]);
      await slow(ms);
    },
    async scrollTo(locator, ms = 900) {
      await locator.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      await slow(ms);
    },
    async top() { await page().evaluate(() => { (document.scrollingElement).scrollTo({ top: 0, behavior: 'smooth' }); document.querySelector('main')?.scrollTo?.({ top: 0, behavior: 'smooth' }); }); await slow(700); },
    /** Pick from a searchable party/item picker. */
    async pick(input, query, optionText) {
      await h.type(input, query, { delay: 110 });
      await slow(1200);
      const opt = page().getByRole('option', { name: optionText }).first();
      const alt = page().getByText(optionText, { exact: false }).last();
      await h.tap((await opt.count()) ? opt : alt);
    },
    /** Soft assertion — recorded in the log; a dry run reports failures. */
    async expectText(re, what = String(re)) {
      const ok = await page().getByText(re).first().isVisible({ timeout: 6000 }).catch(() => false);
      if (!ok) { rec.log.push({ kind: 'expect-failed', what }); console.error(`  ? expected ${what}`); }
      return ok;
    },
    label(text) { rec.mark('label', { text }); },
    camera(key) { rec.camera(key); },
    async login(email, password) {
      await h.goto('/login', 1200);
      await h.type(h.loc('input[type="email"]'), email, { delay: 45 });
      await h.type(h.loc('input[type="password"]'), password, { delay: 45 }); // masked field: dots only
      await h.tap(h.loc('button[type="submit"]'));
      await page().waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
      await slow(1500);
    },
    /** Fast, off-camera login (setup blocks). */
    async quickLogin(email, password) {
      await page().goto(`${FE}/login`, { waitUntil: 'networkidle' });
      await page().fill('input[type="email"]', email);
      await page().fill('input[type="password"]', password);
      await page().click('button[type="submit"]');
      await page().waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 });
      await sleep(1200);
    },
  };
  return h;
}

/** Entry point shared by the three record-*.mjs scripts. */
export async function runStory(story, { dry = false, only = null } = {}) {
  const rec = new Recorder(story.meta.id, story.meta.profile, { dry, only });
  await rec.launch();
  const h = helpers(rec);
  h.state = {};
  for (const key of story.meta.stages ?? ['main']) await rec.stage(key);
  rec.camera((story.meta.stages ?? ['main'])[0]);
  if (story.prepare) await story.prepare(h);
  for (const ch of story.chapters) {
    if (ch.cardOnly) continue;
    if (only && !only.includes(ch.id)) { if (ch.skipSetup) await ch.skipSetup(h); continue; }
    console.log(`▶ ${ch.id} ${ch.title}`);
    await rec.runChapter(ch, h);
  }
  await rec.close();
  const bad = rec.log.filter((l) => /failed|pageerror/.test(l.kind));
  console.log(`done: ${bad.length} problems; overruns ${rec.log.filter((l) => l.kind === 'overrun').length}; leaks ${rec.leaks.length}`);
  for (const b of bad) console.log('  ', JSON.stringify(b));
  return rec;
}
