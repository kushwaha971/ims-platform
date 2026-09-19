'use client';

import { redirect } from 'next/navigation';

import { ROUTES } from 'src/routes';

/**
 * Sprint 0 has no dashboard: RPT-01 is Sprint 11. The route exists because
 * §19.6.5 step 5 and the PWA `start_url` both point at it, and a 404 there
 * would read to the user as data loss after a tenant switch.
 */
export default function DashboardPage(): never {
  redirect(ROUTES.PARTIES);
}
