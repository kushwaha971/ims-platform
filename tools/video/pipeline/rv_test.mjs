import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: '/home/claude/video/work/rvtest', size: { width: 1920, height: 1080 } } });
const p = await ctx.newPage();
await p.goto('http://localhost:3000/login');
await p.waitForTimeout(5000);
await ctx.close(); await b.close();
console.log('ok');
