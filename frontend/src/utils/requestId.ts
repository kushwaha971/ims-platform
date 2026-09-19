/**
 * Part 22 §22.1 "Tracing" — one id per request, echoed by the server on every
 * response and every error, and rendered on error screens (R-E-4). It is the
 * only thing that connects a user's screenshot to a backend log line.
 */
export const newRequestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Non-secure fallback for the jsdom/test and older-webview cases. A request
  // id needs to be unique, not unguessable.
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};
