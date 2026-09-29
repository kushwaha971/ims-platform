import { act, fireEvent, screen, within } from '@testing-library/react';

import { ThemeProvider } from 'src/components/providers/ThemeProvider';
import { themeRestored } from 'src/redux/slice/themeSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { THEME_CHOICE_COOKIE } from 'src/utils/cookieUtils';

import { PRICING, YEARLY_BILLED_MONTHS, priceFor, yearlyPrice } from '../config/pricing';

import { splitAroundWord } from './LandingHero';
import { LandingPage } from './LandingPage';
import { ThemeToggle } from './LandingToggles';
import { PricingSection } from './PricingSection';

/**
 * The landing page is the product's only public claim about itself, so the
 * tests are mostly about what it must NOT say or do: promise a price that is
 * charged, say "most popular" about plans nobody has bought, lose a CTA's
 * destination, or give the heading an accessible name that changes every two
 * seconds.
 */
beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: jest.fn(() => Promise.resolve()),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: jest.fn() });
});

const renderPage = () => renderWithProviders(<LandingPage />);

describe('LandingPage', () => {
  /**
   * The rotating word is decoration: the heading's accessible name must be the
   * complete sentence, once, whatever word is showing.
   */
  it('names the hero heading with the full static sentence', () => {
    renderPage();

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveAccessibleName(
      'One khata for your whole shop. Track udhaar, GST bills, stock and payments.'
    );
    expect(within(h1).getByTestId('ub-rotator')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the badge, the support copy and the micro-copy under the CTAs', () => {
    renderPage();

    expect(screen.getByText('For kirana, wholesale and retail shops')).toBeInTheDocument();
    expect(screen.getByText('Sign up with email. No card needed.')).toBeInTheDocument();
  });

  /** No billing exists, so every "Start free" goes to sign-up and nowhere else. */
  it('sends every Start free to /signup and every Log in to /login', () => {
    renderPage();

    const starts = screen.getAllByRole('link', { name: /^Start free/ });
    expect(starts.length).toBeGreaterThanOrEqual(7); // header, hero, how, four plans, closing band
    starts.forEach((link) => expect(link).toHaveAttribute('href', '/signup'));
    screen
      .getAllByRole('link', { name: 'Log in' })
      .forEach((link) => expect(link).toHaveAttribute('href', '/login'));
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/legal/terms');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/legal/privacy');
  });

  it('links every anchor in the header to a section that exists', () => {
    const { container } = renderPage();
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0] as HTMLElement;

    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(['#features', '#how', '#pricing', '#faq']);
    hrefs.forEach((href) => expect(container.querySelector(href as string)).not.toBeNull());
  });

  it('offers the six use cases as a tablist', () => {
    renderPage();

    const tablist = screen.getByRole('tablist', { name: 'Use cases' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Khata',
      'Reminders',
      'GST bill',
      'Stock',
      'Purchases',
      'Reports',
    ]);
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Stock' }));
    expect(screen.getByRole('tabpanel', { name: 'Stock' })).toHaveTextContent(
      'Adjust stock with a reason'
    );
  });

  it('answers eight questions in the FAQ, e-invoicing honestly', () => {
    renderPage();
    const faq = document.getElementById('faq') as HTMLElement;

    const questions = within(faq).getAllByRole('button');
    expect(questions).toHaveLength(8);
    fireEvent.click(within(faq).getByRole('button', { name: 'Does it support e-invoicing?' }));
    expect(within(faq).getByText(/^Not today\./)).toBeInTheDocument();
  });

  /**
   * Nothing on this page may claim a user count, a rating or a testimonial —
   * checked on the RENDERED text, so a hard-coded string cannot slip past the
   * catalogue check in unbuiltFeatureCopy.test.ts.
   */
  it('renders no testimonial, rating, user count or popularity claim', () => {
    const { container } = renderPage();
    const text = container.textContent ?? '';

    expect(text).not.toMatch(/most popular|testimonial|rating|★|trusted by|loved by/i);
    expect(text).not.toMatch(/\d[\d,]*\+?\s*(users|shops|merchants|businesses)\b/i);
    expect(text).not.toMatch(/\d\s*%/);
  });

  it('opens the narrated demo in a dialog loaded on first click', async () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Watch the demo' }));

    const dialog = await screen.findByRole('dialog', { name: 'YourKhata demo' });
    const video = within(dialog).getByTestId('landing-demo-video');
    expect(video).toHaveAttribute('src', '/media/landing/demo-mobile.mp4');
    expect(video.querySelector('track[kind="captions"]')).not.toBeNull();

    // A missing film is a sentence and a way forward, not a black box.
    fireEvent.error(video);
    expect(within(dialog).getByTestId('landing-demo-unavailable')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /start free/i })).toHaveAttribute(
      'href',
      '/signup'
    );

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('PricingSection', () => {
  /**
   * Nothing is charged today. While the figures are `proposed`, the page says
   * so in words beside them; once approved, the notice goes and nothing else
   * changes.
   */
  it('shows the proposed-pricing notice while the plans are proposed', () => {
    expect(PRICING.status).toBe('proposed');
    renderWithProviders(<PricingSection />);

    expect(screen.getByTestId('landing-pricing-proposed')).toHaveTextContent(
      'Nothing is charged today'
    );
  });

  it('hides the notice once the plans are approved', () => {
    renderWithProviders(<PricingSection pricing={{ ...PRICING, status: 'approved' }} />);

    expect(screen.queryByTestId('landing-pricing-proposed')).not.toBeInTheDocument();
    expect(screen.getByTestId('landing-price-business')).toHaveTextContent('₹349');
  });

  /** "2 months free" is a promise: yearly is exactly ten months, for every plan. */
  it('prices yearly at exactly ten times monthly, with no struck-through figure', () => {
    renderWithProviders(<PricingSection />);

    fireEvent.click(screen.getByRole('radio', { name: 'Yearly' }));

    expect(YEARLY_BILLED_MONTHS).toBe(10);
    PRICING.plans.forEach((plan) => {
      expect(priceFor(plan, 'yearly')).toBe(plan.monthly * 10);
      expect(screen.getByTestId(`landing-price-${plan.id}`)).toHaveTextContent(
        `₹${yearlyPrice(plan.monthly).toLocaleString('en-IN')}`
      );
    });
    expect(screen.getByTestId('landing-price-starter')).toHaveTextContent('₹1,490');
    expect(screen.getByTestId('landing-price-wholesale')).toHaveTextContent('₹6,990');
    expect(screen.getByText('2 months free')).toBeInTheDocument();
    expect(document.querySelector('s, del, .line-through')).toBeNull();
  });

  it('carries the four plans at the agreed monthly prices, excluding GST', () => {
    renderWithProviders(<PricingSection />);

    expect(PRICING.plans.map((plan) => [plan.id, plan.monthly])).toEqual([
      ['free', 0],
      ['starter', 149],
      ['business', 349],
      ['wholesale', 699],
    ]);
    expect(screen.getByText('Prices exclude GST.')).toBeInTheDocument();
    expect(screen.getByTestId('landing-plan-free')).toHaveTextContent('30 invoices a month');
    expect(screen.getByTestId('landing-plan-wholesale')).toHaveTextContent('Unlimited devices');
  });

  it('calls Business "good for growing shops", never "most popular"', () => {
    renderWithProviders(<PricingSection />);

    expect(screen.getByTestId('landing-plan-business')).toHaveTextContent('Good for growing shops');
    expect(document.body.textContent).not.toMatch(/popular/i);
  });
});

describe('ThemeToggle', () => {
  /**
   * The toggle must write an EXPLICIT choice — the only kind `ub_theme_choice`
   * stores and the only kind the pre-paint script reads — or a visitor who
   * picked dark here gets light again on the next load.
   */
  it('writes the explicit choice to the cookie the pre-paint script reads', () => {
    act(() => {
      store.dispatch(themeRestored('light'));
    });
    document.cookie = `${THEME_CHOICE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    renderWithProviders(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>
    );
    const toggle = screen.getByRole('button', { name: 'Dark mode' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(store.getState().theme).toEqual({ mode: 'dark', explicit: true });
    expect(document.cookie).toContain(`${THEME_CHOICE_COOKIE}=dark`);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('splitAroundWord', () => {
  it('splits the key line around the rotating word in either language', () => {
    expect(splitAroundWord('Track ⁣WORD⁣')).toEqual(['Track ', '']);
    expect(splitAroundWord('हिसाब रखें: ⁣WORD⁣')).toEqual(['हिसाब रखें: ', '']);
  });
});
