/** Keep third-party execution behind the initial page load and an idle slot. */
export function afterPageLoadIdle(run: () => void): () => void {
  let cancelled = false;
  let scheduled = false;
  let idleId: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (cancelled || scheduled) return;
    scheduled = true;
    const invoke = (): void => {
      if (!cancelled) run();
    };
    if (window.requestIdleCallback) idleId = window.requestIdleCallback(invoke, { timeout: 1500 });
    else timer = setTimeout(invoke, 1500);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', schedule);
    if (idleId !== undefined) window.cancelIdleCallback?.(idleId);
    if (timer !== undefined) clearTimeout(timer);
  };
}
