import { BookUser, Hourglass, Wallet } from 'lucide-react';

import { ROUTES } from 'src/routes';

import type { AppManifest } from '../navigation/appManifest';

/**
 * DEC-019 (owner, 12 Oct 2026) — the Udhaar book as an app of its own.
 *
 * "That you gave, you got is an udhaar book app, a different section; it should
 * not relate to any module, like the Khatabook app." So it has its own menu and
 * its own money — the ledger's `main` bucket, `party.balance` — and nothing of
 * the Shop's: no bills, no stock, no Shop customers' dues. A person can be in
 * both apps; their name and mobile are shared, their money is not.
 *
 * Its rows are the three things a paper khata is used for: the people and what
 * each owes, who has owed longest, and who to remind. Old dues and Reminders
 * moved here from the Shop's menu because both read the udhaar book's figure
 * since DEC-019 phase 1.
 */
export const KHATA_APP: AppManifest = {
  code: 'khata',
  labelId: 'nav.workspace.khata',
  // `/parties/<id>` stays shared (no app owns it), so opening a person keeps
  // this menu; `/ledger` is the old-dues and reminders screens.
  routePrefixes: [ROUTES.KHATA, '/ledger'],
  sections: [{ key: 'people', labelId: 'nav.section.people' }],
  navigation: [
    {
      key: 'people',
      icon: BookUser,
      labelId: 'nav.people',
      href: ROUTES.KHATA,
      module: 'khata',
      permission: 'parties.party.read',
      section: 'people',
      order: 1,
      bottomNav: true,
    },
    // LED-09 — who has owed longest, the collection round's starting list.
    {
      key: 'aging',
      icon: Hourglass,
      labelId: 'nav.aging',
      href: ROUTES.LEDGER_AGING,
      module: 'khata',
      permission: 'ledger.entry.read',
      section: 'people',
      order: 2,
      bottomNav: true,
    },
    // LED-05/06/07 — the reminder buckets, manual and bulk reminders, the history.
    {
      key: 'reminders',
      icon: Wallet,
      labelId: 'nav.reminders',
      href: ROUTES.LEDGER_REMINDERS,
      module: 'khata',
      permission: 'ledger.entry.read',
      section: 'people',
      order: 3,
      bottomNav: true,
      badge: 'overdueReminders',
    },
  ],
  peopleHref: ROUTES.KHATA,
  book: 'main',
  shell: { partySearch: true },
};
