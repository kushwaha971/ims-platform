import { COUNTER_MODES, type CounterMode, type CounterRow } from '../types/counter.types';

/**
 * F05 — the counter's device memory (mode, beep, today's session) and its
 * small decisions, outside React so they can be tested alone. Every storage
 * read and write is wrapped: a private window throws, and a counter that will
 * not open because a preference could not be read is a poor trade.
 */
const MODE_KEY = 'ub.library.counter.mode';
const BEEP_KEY = 'ub.library.counter.beep';
const SESSION_KEY = 'ub.library.counter.session';

export const readMode = (): CounterMode => {
  try {
    const stored = window.localStorage.getItem(MODE_KEY);
    return COUNTER_MODES.includes(stored as CounterMode) ? (stored as CounterMode) : 'issue';
  } catch {
    return 'issue';
  }
};

export const rememberMode = (mode: CounterMode): void => {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* not worth an error */
  }
};

export const beepOn = (): boolean => {
  try {
    return window.localStorage.getItem(BEEP_KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setBeep = (on: boolean): void => {
  try {
    window.localStorage.setItem(BEEP_KEY, on ? 'on' : 'off');
  } catch {
    /* not worth an error */
  }
};

/** FR-13 — the session survives a reload for the same business day and tenant. */
export const readSession = (tenantId: string, day: string): CounterRow[] => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as { tenant: string; day: string; rows: CounterRow[] })
      : null;
    return parsed && parsed.tenant === tenantId && parsed.day === day ? parsed.rows : [];
  } catch {
    return [];
  }
};

export const saveSession = (tenantId: string, day: string, rows: readonly CounterRow[]): void => {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ tenant: tenantId, day, rows }));
  } catch {
    /* the server is the truth; this list is a convenience */
  }
};

/** FR-15 — a short tone on a refusal: Web Audio, no asset and no dependency. */
export const beep = (): void => {
  try {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.frequency.value = 440;
    gain.gain.value = 0.08;
    tone.connect(gain).connect(context.destination);
    tone.start();
    tone.stop(context.currentTime + 0.15);
    tone.onended = () => void context.close();
  } catch {
    /* sound is never the only signal */
  }
};

/** FR-1 — Alt+I/R/N, read from `event.code` so macOS Option (which types a glyph) works. */
export const MODE_SHORTCUTS: Readonly<Record<string, CounterMode>> = {
  KeyI: 'issue',
  KeyR: 'return',
  KeyN: 'renew',
};

/**
 * FR-10, D20 — an issued row may be undone the same day while the loan is
 * untouched: a later row in this session that returned or renewed the same
 * loan takes Undo away (QA-F05-2 — the server would refuse it anyway).
 */
export const canUndo = (
  row: CounterRow,
  today: string,
  touched: ReadonlySet<string> = new Set()
): boolean =>
  row.kind === 'issued' && !!row.loanId && row.issuedOn === today && !touched.has(row.loanId);

/** The loans a later row in the session returned or renewed. */
export const touchedLoans = (rows: readonly CounterRow[]): Set<string> =>
  new Set(
    rows
      .filter((r) => (r.kind === 'returned' || r.kind === 'renewed') && r.loanId)
      .map((r) => r.loanId as string)
  );
