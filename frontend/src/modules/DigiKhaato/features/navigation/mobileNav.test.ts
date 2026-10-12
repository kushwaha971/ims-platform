import { manifestFor } from 'modules/appManifests';

import { mobileNavState } from './mobileNav';

/**
 * Which phone tab is lit and whether the bar shows — the two rules a merchant
 * feels on every screen. Driven by the real manifests, so a manifest edit that
 * breaks them fails here rather than on a phone.
 */
const shopRows = manifestFor('shop')?.navigation ?? [];
const shopTabs = shopRows.filter((row) => row.bottomNav).slice(0, 4);
const libraryRows = manifestFor('library')?.navigation ?? [];
const libraryTabs = libraryRows.filter((row) => row.bottomNav).slice(0, 4);

describe('mobileNavState', () => {
  it('gives the Shop four tabs: Home, Customers, Suppliers, Bills', () => {
    /* Prevents: a manifest edit that quietly changes what is in the bar, and
       Suppliers folded under Customers again (owner, 12 Oct 2026: "both are
       different"). */
    expect(shopTabs.map((tab) => tab.key)).toEqual([
      'dashboard',
      'customers',
      'suppliers',
      'invoices',
    ]);
  });

  it('shows the bar on a menu destination and lights its tab', () => {
    expect(mobileNavState('/customers', shopRows, shopTabs)).toEqual({
      visible: true,
      topLevel: true,
      active: 'customers',
    });
  });

  it('lights Suppliers as its own tab, and a parent tab for a page under one', () => {
    /* Prevents: Suppliers lighting Customers, and Estimates lighting More
       although it is one of the Bills tab's pages. */
    expect(mobileNavState('/suppliers', shopRows, shopTabs).active).toBe('suppliers');
    expect(mobileNavState('/sales/estimates', shopRows, shopTabs).active).toBe('invoices');
  });

  it('lights More for every other destination, and on More itself', () => {
    expect(mobileNavState('/payments', shopRows, shopTabs)).toEqual({
      visible: true,
      topLevel: true,
      active: 'more',
    });
    expect(mobileNavState('/more', shopRows, shopTabs)).toEqual({
      visible: true,
      topLevel: true,
      active: 'more',
    });
  });

  it('hides the bar only on a focused task: a form, or a khata with its docked actions', () => {
    /* Prevents: a nav bar under a khata's docked You gave / You got, or under
       a form's Save — two bars fighting for one thumb. */
    expect(mobileNavState('/parties/42', shopRows, shopTabs).visible).toBe(false);
    expect(mobileNavState('/sales/invoices/new', shopRows, shopTabs)).toEqual({
      visible: false,
      topLevel: false,
      active: 'invoices',
    });
    expect(mobileNavState('/sales/invoices/7/edit', shopRows, shopTabs).visible).toBe(false);
    expect(mobileNavState('/lending/loans/new', shopRows, shopTabs).visible).toBe(false);
  });

  it.each([
    ['/reports/day-book', 'a report'],
    ['/settings/profile', 'a settings page'],
    ['/settings/devices', 'the devices page More links to'],
    ['/parties/tags', 'the tag manager'],
    ['/parties/42/statement', 'a statement'],
    ['/items/9', 'an item'],
    ['/sales/invoices/7', 'a bill'],
    ['/lending/loans/3', 'a loan'],
    ['/library/members/5', 'a student'],
    ['/switch', 'the list of businesses'],
  ])('keeps the bar on %s (%s), with Back in the header', (path) => {
    /* Prevents (owner, 12 Oct 2026): the bar vanishing on every nested page,
       so the only way out of a report or a settings page was Back, pressed
       until something familiar appeared. These pages dock nothing. */
    const state = mobileNavState(path, shopRows, shopTabs);
    expect(state.visible).toBe(true);
    expect(state.topLevel).toBe(false);
    expect(state.active).not.toBeNull();
  });

  it('prefers the most specific row: /library/attendance is More, not "Today"', () => {
    /* Prevents: every library page lighting Home because it sits under /library. */
    expect(mobileNavState('/library/attendance', libraryRows, libraryTabs).active).toBe('more');
    expect(mobileNavState('/library/seats', libraryRows, libraryTabs).active).toBe('librarySeats');
  });
});
