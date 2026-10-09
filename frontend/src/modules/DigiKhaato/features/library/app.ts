import {
  Armchair,
  BookCopy,
  CalendarCheck,
  IndianRupee,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  ScanLine,
  Settings,
  Users,
  Wallet,
} from 'lucide-react';

import { ROUTES } from 'src/routes';

import type { AppManifest } from 'modules/DigiKhaato/features/navigation/appManifest';

/**
 * docs/platform/14 §4.2 — the Library app's own menu: a study library's
 * students, seats, fees and attendance first, the book counter in its own
 * group below (owner, 4 Oct 2026). Moved here from the shared list unchanged.
 */
export const LIBRARY_APP: AppManifest = {
  code: 'library',
  labelId: 'nav.workspace.library',
  routePrefixes: [ROUTES.LIBRARY_HOME],
  // docs/platform/14 step 6 — this app's words on the shared khata.
  words: {
    'parties.detail.badge.customer': 'library.words.person',
    'parties.detail.backToList': 'library.words.backToList',
    'parties.detail.notFound': 'library.words.notFound',
    'parties.detail.error.title': 'library.words.error',
    'parties.detail.archivedBanner': 'library.words.archived',
  },
  peopleHref: ROUTES.LIBRARY_MEMBERS,
  sections: [
    { key: 'daily', labelId: 'nav.section.daily' },
    { key: 'books', labelId: 'nav.section.books' },
  ],
  navigation: [
    {
      // F05 (LIB-06) — the counter, the screen a library uses most.
      key: 'libraryCounter',
      icon: ScanLine,
      labelId: 'nav.library.counter',
      href: ROUTES.LIBRARY_COUNTER,
      module: 'library',
      permission: 'library.loan.write',
      // A study library's books are a side line (owner, 4 Oct 2026): students
      // and seats come first, the book counter sits in its own group below.
      section: 'books',
      order: 2,
    },
    {
      // W04 — a reading room's day; the library's first row, so its landing.
      key: 'libraryHome',
      icon: LayoutDashboard,
      labelId: 'nav.library.home',
      href: ROUTES.LIBRARY_HOME,
      module: 'library',
      permission: 'library.loan.read',
      section: 'daily',
      order: 1,
      bottomNav: true,
    },
    {
      // F04 (LIB-04) — the library's members; a study library's STUDENTS
      // (owner, 4 Oct 2026), so the first of its daily rows.
      key: 'libraryMembers',
      icon: Users,
      labelId: 'nav.library.members',
      href: ROUTES.LIBRARY_MEMBERS,
      module: 'library',
      permission: 'library.member.read',
      section: 'daily',
      order: 2,
      bottomNav: true,
    },
    {
      // W03 — the seat map by shift: the room as the librarian sees it.
      key: 'librarySeats',
      icon: Armchair,
      labelId: 'nav.library.seats',
      href: ROUTES.LIBRARY_SEATS,
      module: 'library',
      permission: 'library.member.read',
      section: 'daily',
      order: 3,
      bottomNav: true,
    },
    {
      // W03 — who has to pay, and the fee plans.
      key: 'libraryFees',
      icon: IndianRupee,
      labelId: 'nav.library.fees',
      href: ROUTES.LIBRARY_FEES,
      module: 'library',
      permission: 'library.member.read',
      section: 'daily',
      order: 4,
      bottomNav: true,
    },
    {
      // W05 — the reading room's day register.
      key: 'libraryAttendance',
      icon: CalendarCheck,
      labelId: 'nav.library.attendance',
      href: ROUTES.LIBRARY_ATTENDANCE,
      module: 'library',
      permission: 'library.member.read',
      section: 'daily',
      order: 5,
    },
    {
      // W06 — today's fee messages, sent by hand like reminders.
      key: 'libraryMessages',
      icon: MessageCircle,
      labelId: 'nav.library.messages',
      href: ROUTES.LIBRARY_MESSAGES,
      module: 'library',
      permission: 'library.member.read',
      section: 'daily',
      order: 6,
    },
    {
      // Library P0 — fees in, expenses out, what is left.
      key: 'libraryMoney',
      icon: Wallet,
      labelId: 'nav.library.money',
      href: ROUTES.LIBRARY_MONEY,
      module: 'library',
      permission: 'library.reports.read',
      section: 'daily',
      order: 7,
    },
    {
      // Library P0 — the rent, the light bill, the wifi: the shared Expenses page,
      // which keeps this app's menu (it is no longer the shop's alone).
      key: 'libraryExpenses',
      icon: Receipt,
      labelId: 'nav.expenses',
      href: ROUTES.EXPENSES,
      // The library's row: shown while the library runs (every business has the
      // expenses module), so a business without the library never lists this app.
      module: 'library',
      permission: 'expenses.expense.read',
      section: 'daily',
      order: 8,
    },
    {
      // F03 (LIB-02) — the library's first page. Shown only while the library
      // module is on; each later library row arrives with its own page (F01).
      key: 'libraryCatalogue',
      icon: BookCopy,
      labelId: 'nav.library.catalogue',
      href: ROUTES.LIBRARY_CATALOGUE,
      module: 'library',
      permission: 'library.catalogue.read',
      section: 'books',
      order: 1,
    },
    {
      // F02 (LIB-01 §7) — the library's settings and counters.
      key: 'librarySettings',
      icon: Settings,
      labelId: 'nav.library.settings',
      href: ROUTES.LIBRARY_SETTINGS,
      module: 'library',
      permission: 'library.settings.manage',
      section: 'account',
      order: 60,
    },
  ],
};
