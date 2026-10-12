'use client';
import { useEffect } from 'react';

import { usePathname } from 'next/navigation';

import { ANALYTICS_ENABLED, GA4_MEASUREMENT_ID } from 'src/constants';
import { isMarketingPath } from 'src/routes';

import { afterPageLoadIdle } from './afterPageLoadIdle';

/** GA4 measures acquisition only. Never collect auth/customer paths or query values.
 * Enhanced measurement is disabled in GA4; manual page views have one owner.
 */
export function GooglePublicTracker(): null {
  const pathname = usePathname();
  useEffect(() => {
    const id = GA4_MEASUREMENT_ID;
    if (!ANALYTICS_ENABLED || !/^G-[A-Z0-9]+$/.test(id) || !isMarketingPath(pathname)) return;
    const win = window as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
    const disabledKey = `ga-disable-${id}`;
    Reflect.set(win, disabledKey, false);
    win.dataLayer ??= [];
    if (!win.gtag)
      win.gtag = function () {
        // Match Google's documented gtag queue protocol.
        win.dataLayer?.push(arguments);
      };
    if (!document.getElementById('yourkhata-ga4')) win.gtag('js', new Date());
    const cancelLoad = afterPageLoadIdle(() => {
      if (document.getElementById('yourkhata-ga4')) return;
      const script = document.createElement('script');
      script.id = 'yourkhata-ga4';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
      document.head.appendChild(script);
    });
    let referrer = '';
    try {
      referrer = document.referrer ? new URL(document.referrer).origin : '';
    } catch {
      /* No untrusted referrer text. */
    }
    win.gtag('config', id, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: `${location.origin}${pathname}`,
      page_referrer: referrer,
    });
    win.gtag('event', 'page_view', {
      send_to: id,
      page_location: `${location.origin}${pathname}`,
      page_referrer: referrer,
      page_title: document.title,
    });
    return () => {
      cancelLoad();
      Reflect.set(win, disabledKey, true);
    };
  }, [pathname]);
  return null;
}
