/**
 * A navigation that loads a new DOCUMENT, replacing the current history entry
 * the way `router.replace` does — so Back does not return to the screen that
 * sent it.
 *
 * It exists as one function, rather than `window.location.replace` written
 * where it is needed, for two reasons: tests replace it at the module boundary
 * (jsdom does not implement navigation), and every caller passes a same-origin
 * PATH that it has already validated — `safeNextPath` for `?next=` — which this
 * resolves against the current origin and never against anything else.
 *
 * Use it only where a client-side navigation would be WRONG, not merely slow:
 * the one caller today is `useAuthRedirect`, and its comment says why.
 */
export const replaceDocument = (path: string): void => {
  if (typeof window === 'undefined') return;
  window.location.replace(new URL(path, window.location.origin).toString());
};
