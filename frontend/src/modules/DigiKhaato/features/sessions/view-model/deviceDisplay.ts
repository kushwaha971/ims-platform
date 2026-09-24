import type { DeviceSession } from '../types/session.types';

type T = (id: string, values?: Record<string, string | number | Date>) => string;

/**
 * PLT-09 §7 — what a device card is called.
 *
 * The person's own name for it wins ("Shop counter phone"); then the browser
 * and system the server read from the user agent ("Chrome on Android"); then a
 * plain "Unknown device", never an empty title. The UA is a claim, not a fact
 * (EC-3) — which is exactly why the label the person typed outranks it.
 */
export const deviceTitle = (session: DeviceSession, t: T): string => {
  if (session.label) return session.label;
  if (session.browser && session.os) {
    return t('sessions.device.browserOn', { browser: session.browser, os: session.os });
  }
  return session.browser ?? session.os ?? t('sessions.device.unknown');
};

/**
 * The caption under the title: when it was last used and where from. The IP
 * arrives masked to /24 from the server (§19); no city is ever looked up.
 */
export const deviceCaption = (
  session: DeviceSession,
  t: T,
  formatWhen: (iso: string) => string
): string => {
  const parts: string[] = [];
  const when = session.lastUsedAt ?? session.createdAt;
  parts.push(t('sessions.lastUsed', { when: formatWhen(when) }));
  if (session.ipMasked) parts.push(session.ipMasked);
  if (session.tenantName) parts.push(session.tenantName);
  return parts.join(' · ');
};
