// PHASE 1 dry run: the real desktop chapter d01 (login + dashboard) against the served build.
import { chapters as all } from './desktop.mjs';
import { newDemoOwner, seedBackground, nextRun } from '../seed.mjs';
export const meta = { id: 'dryrun-desktop', profile: 'desktop', title: 'Dry run — desktop d01', stages: ['main'],
  format: 'dry run', audience: 'internal', targetLength: '~45 s' };
export async function prepare(h) {
  const o = await newDemoOwner('dryd', { email: `rajesh.dryd${nextRun('dryd')}@sharmastore.example` });
  await seedBackground(o.token, { skip: ['Ramesh Traders'] });
  h.state.acct = { email: o.email, password: o.password };
}
export const chapters = [all.find((c) => c.id === 'd01')];
