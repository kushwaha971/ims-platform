// PHASE 1 dry run: the real mobile chapter m03 (dashboard + menu) against
// whatever build is served on :3000, on a fresh seeded demo owner.
import { chapters as all } from './mobile.mjs';
import { newDemoOwner, seedBackground, nextRun } from '../seed.mjs';
export const meta = { id: 'dryrun-mobile', profile: 'mobile', title: 'Dry run — mobile m03', stages: ['main'],
  format: 'dry run', audience: 'internal', targetLength: '~30 s' };
export async function prepare(h) {
  const o = await newDemoOwner('dry', { email: `rajesh.dry${nextRun('dry')}@sharmastore.example` });
  await seedBackground(o.token, { skip: ['Ramesh Traders'] });
  h.state.acct = { email: o.email, password: o.password };
}
const m03 = all.find((c) => c.id === 'm03');
export const chapters = [{ ...m03, setup: async (h) => { await h.quickLogin(h.state.acct.email, h.state.acct.password); await h.goto('/dashboard', 2500); } }];
