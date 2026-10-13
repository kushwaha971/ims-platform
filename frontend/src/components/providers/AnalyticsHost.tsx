'use client';

import { useEffect, useRef, useState } from 'react';

import { usePathname } from 'next/navigation';

import { afterPageLoadIdle } from 'src/analytics/afterPageLoadIdle';
import {
  analyticsAllowedOn,
  personProperties,
  type AnalyticsBusiness,
} from 'src/analytics/analyticsRules';
import { ANALYTICS_ENABLED, POSTHOG_KEY } from 'src/constants';
import { useAppSelector } from 'src/hooks/useAppStore';
import { selectLocale } from 'src/redux/slice/localeSlice';
import {
  selectActiveTenant,
  selectSessionApps,
  selectSessionUser,
} from 'src/redux/slice/sessionSlice';

import { FeedbackTab } from './FeedbackTab';

import type { PostHog } from 'posthog-js';

/**
 * DEC-017 — product analytics and feedback (PostHog), mounted once.
 *
 * Its job is to decide WHEN the SDK may be loaded and what it is told, and to
 * offer its Feedback survey in account navigation: see `analyticsRules.ts` for the three rules. On a page
 * a merchant's customer opens, or one whose address carries a token, the SDK
 * is not even downloaded; if it was loaded earlier in the same visit it is
 * told to stop until the address is an ordinary one again.
 *
 * Off unless the build says `NEXT_PUBLIC_ANALYTICS_ENABLED=true` AND has a
 * key, so a developer's machine and the test stacks send nothing.
 */
export function AnalyticsHost(): React.JSX.Element | null {
  const pathname = usePathname() ?? '';
  const user = useAppSelector(selectSessionUser);
  const tenant = useAppSelector(selectActiveTenant);
  const apps = useAppSelector(selectSessionApps);
  const locale = useAppSelector(selectLocale);
  const identified = useRef<string | null>(null);
  /** The SDK, once it is here: what the account's Feedback action opens the survey with. */
  const [client, setClient] = useState<PostHog | null>(null);

  const enabled = ANALYTICS_ENABLED && Boolean(POSTHOG_KEY);
  const allowed = enabled && analyticsAllowedOn(pathname);
  const userId = user?.id ?? null;
  const tenantId = tenant?.id ?? null;
  const role = tenant?.role ?? null;
  const appCodes = (apps ?? []).map((app) => app.code).join(',');

  // One page view per ordinary address. Never the query string: `?next=` and
  // filters can carry a name somebody typed.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const cancelIdle = afterPageLoadIdle(() => {
      if (cancelled) return;
      // A forbidden address: only an SDK that is ALREADY here is told to stop.
      if (!allowed) {
        void import('src/analytics/posthogClient').then(({ posthogIfLoaded }) =>
          posthogIfLoaded()?.opt_out_capturing()
        );
        return;
      }
      void import('src/analytics/posthogClient')
        .then(({ loadPosthog }) => loadPosthog())
        .then((posthog) => {
          if (!posthog || cancelled) return;
          setClient(posthog);
          if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
          posthog.capture('$pageview', {
            $current_url: `${window.location.origin}${pathname}`,
          });
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [enabled, allowed, pathname]);

  // Who this is: the account id, and nothing that names them.
  useEffect(() => {
    if (!allowed) return;
    void import('src/analytics/posthogClient')
      .then(({ loadPosthog, posthogIfLoaded }) => (userId ? loadPosthog() : posthogIfLoaded()))
      .then((posthog) => {
        if (!posthog) return;
        if (!userId) {
          // Signed out: the next person on this phone is somebody else.
          if (identified.current) posthog.reset();
          identified.current = null;
          return;
        }
        const business: AnalyticsBusiness | null = tenantId
          ? { id: tenantId, role, apps: appCodes ? appCodes.split(',') : [] }
          : null;
        posthog.identify(userId, personProperties({ id: userId, locale }, business));
        identified.current = userId;
      });
  }, [allowed, userId, tenantId, role, appCodes, locale]);

  // Account feedback: only where analytics may run, and only once the SDK is here.
  return allowed && client ? <FeedbackTab posthog={client} /> : null;
}
