import { screen, within } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { LandingPage } from './LandingPage';

/**
 * CR-2026-09-29-PLATFORM-D — pricing is hidden behind ONE flag,
 * `SHOW_PRICING` in `config/pricing.ts`. This file flips the real flag (the
 * module is mocked with a getter, and every consumer reads the flag at render
 * time), so both states are exercised through the same code the page ships —
 * not through a prop that only a test would pass.
 */
let mockShowPricing = false;
jest.mock('../config/pricing', () => {
  const actual = jest.requireActual('../config/pricing');
  return {
    __esModule: true,
    ...actual,
    get SHOW_PRICING() {
      return mockShowPricing;
    },
  };
});

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn(() => Promise.resolve()),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: jest.fn() });
});

const navHrefs = (name: string) =>
  screen
    .getAllByRole('navigation', { name })
    .flatMap((nav) => within(nav).getAllByRole('link').map((link) => link.getAttribute('href')));

describe('the pricing flag', () => {
  it('while off: no section, no anchor, no nav or footer link, no cost question, and Start free stays', () => {
    mockShowPricing = false;
    const { container } = renderWithProviders(<LandingPage />);

    expect(container.querySelector('#pricing')).toBeNull();
    expect(container.querySelector('a[href="#pricing"]')).toBeNull();
    expect(navHrefs('Main')).not.toContain('#pricing');
    expect(navHrefs('Product')).toEqual(['#platform', '#modules', '#why', '#faq']);
    expect(screen.queryByRole('link', { name: 'Pricing' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'What does it cost?' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Do I need a card to sign up?' })).toBeInTheDocument();
    // No plan, period or pricing notice anywhere. (₹ alone is not a price:
    // the explorer's steps say "enter ₹1,200", which is a ledger entry.)
    expect(container.textContent).not.toMatch(/\/month|\/year|Starter|Wholesale|2 months free|Proposed pricing|exclude GST/);
    expect(screen.getAllByRole('link', { name: 'Start free' }).length).toBeGreaterThanOrEqual(4);
  });

  // The section is its own chunk (`dynamic()` in LandingPage.tsx), so it is awaited.
  it('while on: the section, its anchor in the header and footer, and the cost question all come back', async () => {
    mockShowPricing = true;
    const { container } = renderWithProviders(<LandingPage />);

    expect(await screen.findByTestId('landing-plan-business')).toBeInTheDocument();
    expect(container.querySelector('#pricing')).not.toBeNull();
    expect(navHrefs('Main')).toEqual(['#platform', '#modules', '#why', '#pricing', '#faq']);
    expect(navHrefs('Product')).toEqual(['#platform', '#modules', '#why', '#pricing', '#faq']);
    expect(screen.getByRole('button', { name: 'What does it cost?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Do I need a card to sign up?' })).toBeNull();
    // header, hero, how, four plans, closing band
    expect(screen.getAllByRole('link', { name: 'Start free' }).length).toBeGreaterThanOrEqual(8);
  });
});
