import { HandCoins, Landmark, MessageCircle, Route, Users } from 'lucide-react';

import { ROUTES } from 'src/routes';

import type { AppManifest } from 'modules/DigiKhaato/features/navigation/appManifest';

/**
 * docs/platform/14 §4.2 — Lending & collections' own menu: today's round,
 * loans, borrowers, routes and messages. Moved here from the shared list
 * unchanged.
 */
export const LENDING_APP: AppManifest = {
  code: 'lending',
  labelId: 'nav.workspace.lending',
  routePrefixes: [ROUTES.LENDING_HOME],
  sections: [{ key: 'daily', labelId: 'nav.section.daily' }],
  navigation: [
    {
      // L02 — lending's day: today's collection round (FRD LEN-08), its landing.
      key: 'lendingToday',
      icon: HandCoins,
      labelId: 'nav.lending.today',
      href: ROUTES.LENDING_HOME,
      module: 'lending',
      permission: 'lending.today.read',
      section: 'daily',
      order: 1,
      bottomNav: true,
    },
    {
      key: 'lendingLoans',
      icon: Landmark,
      labelId: 'nav.lending.loans',
      href: ROUTES.LENDING_LOANS,
      module: 'lending',
      permission: 'lending.loan.read',
      section: 'daily',
      order: 2,
      bottomNav: true,
    },
    {
      key: 'lendingBorrowers',
      icon: Users,
      labelId: 'nav.lending.borrowers',
      href: ROUTES.LENDING_BORROWERS,
      module: 'lending',
      permission: 'lending.borrower.read',
      section: 'daily',
      order: 3,
      bottomNav: true,
    },
    {
      key: 'lendingRoutes',
      icon: Route,
      labelId: 'nav.lending.routes',
      href: ROUTES.LENDING_ROUTES,
      module: 'lending',
      permission: 'lending.route.read',
      section: 'daily',
      order: 4,
    },
    {
      // L03 — today's reminders to borrowers, sent by hand like reminders (LEN-12).
      key: 'lendingMessages',
      icon: MessageCircle,
      labelId: 'nav.lending.messages',
      href: ROUTES.LENDING_MESSAGES,
      module: 'lending',
      permission: 'lending.reminder.send',
      section: 'daily',
      order: 5,
    },
  ],
};
