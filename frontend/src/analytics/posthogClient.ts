import { POSTHOG_DEFAULTS, POSTHOG_HOST, POSTHOG_KEY } from 'src/constants';

import { scrubEvent } from './analyticsRules';

import type { PostHog } from 'posthog-js';

/**
 * The PostHog SDK, loaded on demand and configured ONCE (DEC-017).
 *
 * `import('posthog-js')` and not a top-level import: the SDK is about 60 KB
 * gzipped, and imported statically it would join the shell every route loads,
 * including `/login` on a 3G phone. It arrives in its own chunk, after the
 * page is idle, and only where `analyticsRules` allows.
 *
 * What it is told NOT to collect, because every screen here is somebody's
 * accounts:
 *  - `mask_all_text` / `mask_all_element_attributes`: a click is recorded as
 *    "a button was pressed on /customers", never with the text on it — which
 *    on this product is a customer's name or a balance.
 *  - session recording masks every input and all text: a replay shows where a
 *    merchant got stuck, as shapes, not their book.
 *  - `before_send` cuts the query off every address: `?q=` is what somebody
 *    typed into a search box, which here is a customer's name.
 *  - `person_profiles: 'identified_only'`: an anonymous visitor to the landing
 *    page is counted, not profiled.
 *
 * The project key is a PUBLIC key by design (it ships in the page of anyone
 * who uses PostHog); it is still read from the environment so a partner build
 * or a staging build can point somewhere else, or nowhere.
 */
let loading: Promise<PostHog | null> | null = null;
let loaded: PostHog | null = null;

/** The SDK if this visit has already loaded it; never loads it. */
export const posthogIfLoaded = (): PostHog | null => loaded;

export const loadPosthog = (): Promise<PostHog | null> => {
  if (!POSTHOG_KEY || typeof window === 'undefined') return Promise.resolve(null);
  loading ??= import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        // The SDK types this as a list of the dates it knows; the value is the
        // build's, so a newer date needs no code change.
        defaults: POSTHOG_DEFAULTS as '2026-05-30',
        person_profiles: 'identified_only',
        // Page views are sent by `AnalyticsHost`, which knows which addresses
        // may be seen; the SDK's own would report a share link's token.
        capture_pageview: false,
        capture_pageleave: false,
        mask_all_text: true,
        mask_all_element_attributes: true,
        session_recording: { maskAllInputs: true, maskTextSelector: '*' },
        // Every event carries the address it was raised on; see `scrubEvent`.
        before_send: (event) => scrubEvent(event, window.location.pathname),
      });
      loaded = posthog;
      return posthog;
    })
    // Blocked by an extension, or offline: the product works exactly the same.
    .catch(() => null);
  return loading;
};

/** Tests only: forget the SDK, so each test decides afresh whether it loads. */
export const resetPosthogForTests = (): void => {
  loading = null;
  loaded = null;
};
