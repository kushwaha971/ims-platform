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
  it('gives the Shop four tabs: Home, Parties, Bills, Items', () => {
    /* Prevents: a manifest edit that quietly changes what is in the bar. */
    expect(shopTabs.map((tab) => tab.key)).toEqual(['dashboard', 'customers', 'invoices', 'items']);
  });

  it('shows the bar on a menu destination and lights its tab', () => {
    expect(mobileNavState('/customers', shopRows, shopTabs)).toEqual({
      visible: true,
      active: 'customers',
    });
  });

  it('lights the parent tab for a page that lives under one (Suppliers → Parties)', () => {
    /* Prevents: Suppliers lighting More although it is half of the Parties tab. */
    expect(mobileNavState('/suppliers', shopRows, shopTabs).active).toBe('customers');
    expect(mobileNavState('/sales/estimates', shopRows, shopTabs).active).toBe('invoices');
  });

  it('lights More for every other destination, and on More itself', () => {
    expect(mobileNavState('/payments', shopRows, shopTabs)).toEqual({
      visible: true,
      active: 'more',
    });
    expect(mobileNavState('/more', shopRows, shopTabs)).toEqual({ visible: true, active: 'more' });
  });

  it('hides the bar on detail and task screens', () => {
    /* Prevents: a nav bar under a khata's docked You gave / You got, or under
       a form's Save — two bars fighting for one thumb. */
    expect(mobileNavState('/parties/42', shopRows, shopTabs).visible).toBe(false);
    expect(mobileNavState('/sales/invoices/new', shopRows, shopTabs)).toEqual({
      visible: false,
      active: 'invoices',
    });
  });

  it('prefers the most specific row: /library/attendance is More, not "Today"', () => {
    /* Prevents: every library page lighting Home because it sits under /library. */
    expect(mobileNavState('/library/attendance', libraryRows, libraryTabs).active).toBe('more');
    expect(mobileNavState('/library/seats', libraryRows, libraryTabs).active).toBe('librarySeats');
  });
});
