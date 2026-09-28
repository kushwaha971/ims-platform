import { deviceCaption, deviceTitle } from './deviceDisplay';

import type { DeviceSession } from '../types/session.types';

const t = (id: string, values?: Record<string, string | number | Date>): string =>
  values ? `${id}:${Object.values(values).join('|')}` : id;

const base: DeviceSession = {
  id: 's1',
  label: null,
  browser: 'Chrome',
  os: 'Android',
  device: 'phone',
  ipMasked: '203.0.113.x',
  tenantName: 'Ramesh Traders',
  createdAt: '2026-09-20T10:00:00Z',
  lastUsedAt: '2026-09-24T08:30:00Z',
  isCurrent: false,
};

/** PLT-09 §7 — the words on a device card, which is how a person recognises one. */
describe('deviceDisplay', () => {
  it('prefers the name the person gave the device over the user agent', () => {
    // EC-3: the UA is the client's claim; the typed label is the person's.
    expect(deviceTitle({ ...base, label: 'Shop counter phone' }, t)).toBe('Shop counter phone');
    expect(deviceTitle(base, t)).toBe('sessions.device.browserOn:Chrome|Android');
  });

  it('never renders an empty title for an unrecognised agent', () => {
    expect(deviceTitle({ ...base, browser: null, os: null }, t)).toBe('sessions.device.unknown');
  });

  it('captions last use, the masked address and the business, in that order', () => {
    const caption = deviceCaption(base, t, () => '24/09/2026, 14:00');
    expect(caption).toBe('sessions.lastUsed:24/09/2026, 14:00 · 203.0.113.x · Ramesh Traders');
  });
});
