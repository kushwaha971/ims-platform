/**
 * The back-off both pollers share — the wizard's (IMP-01 FR-8) and the
 * export button's (IMP-02 FR-14). A module of its own that imports nothing:
 * the Export button sits on three list routes, and taking this from
 * `importDisplay` put that module's money, date and quantity formatting in
 * every one of their chunks (measured: +2 to +3 KB gz each).
 */
export interface PollStep {
  readonly afterMs: number;
  readonly everyMs: number;
}

/** The delay before the next poll, given how long we have been watching. */
export const pollDelay = (elapsedMs: number, steps: readonly PollStep[]): number => {
  let delay = steps[0]?.everyMs ?? 2_000;
  for (const step of steps) if (elapsedMs >= step.afterMs) delay = step.everyMs;
  return delay;
};

/** IMP-02 FR-14 — an async export is polled every 3 s, backing off to 10 s. */
export const EXPORT_POLL_STEPS: readonly PollStep[] = [
  { afterMs: 0, everyMs: 3_000 },
  { afterMs: 30_000, everyMs: 10_000 },
];

/** How long an async export is waited on before the notification takes over. */
export const EXPORT_POLL_GIVE_UP_MS = 10 * 60_000;
