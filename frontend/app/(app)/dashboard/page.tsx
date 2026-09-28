'use client';

import { DashboardPageContent } from 'modules/DigiKhaato/features/reports/components/DashboardPageContent';

/**
 * RPT-01 — `/dashboard`, the post-login landing screen (§1: "the first screen
 * for ≥ 90 % of sessions"). Until RPT-01 it was a `redirect()` to the party
 * list; a member who may not read reports is still sent there, by the page.
 */
export default function DashboardPage(): React.JSX.Element {
  return <DashboardPageContent />;
}
