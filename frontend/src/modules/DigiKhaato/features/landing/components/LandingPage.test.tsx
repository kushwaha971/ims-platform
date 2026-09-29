import { act, fireEvent, screen, within } from '@testing-library/react';

import { ThemeProvider } from 'src/components/providers/ThemeProvider';
import { themeRestored } from 'src/redux/slice/themeSlice';
import { store } from 'src/redux/store';
import {
  LANDING_JARGON,
  PLANNED_MODULE_WORDS,
  withoutBrand,
} from 'src/tests/plannedModuleVocabulary';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { THEME_CHOICE_COOKIE } from 'src/utils/cookieUtils';



import { LANDING_MODULES, UPCOMING_MODULES } from '../config/modules';
import { PRICING, YEARLY_BILLED_MONTHS, priceFor, yearlyPrice } from '../config/pricing';
import {
  LANDING_DESCRIPTION,
  LANDING_SHARE_DESCRIPTION,
  LANDING_SHARE_TITLE,
  LANDING_TITLE,
} from '../config/seo';

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
      'All your records, in one place. Track dues, GST bills, stock, payments and expenses.'
    );
    expect(within(h1).getByTestId('ub-rotator')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the badge, the support copy and the micro-copy under the CTAs', () => {
    renderPage();

    expect(screen.getByText('Live for shops today · more modules planned')).toBeInTheDocument();
    expect(screen.getByText('Sign up with email. No card needed.')).toBeInTheDocument();
  });

  /** No billing exists, so every "Start free" goes to sign-up and nowhere else. */
  it('sends every Start free to /signup and every Log in to /login', () => {
    renderPage();

    const starts = screen.getAllByRole('link', { name: /^Start free/ });
    // header, hero, the live module's card, how, four plans, closing band
    expect(starts.length).toBeGreaterThanOrEqual(9);
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
    expect(hrefs).toEqual(['#platform', '#modules', '#pricing', '#faq']);
    hrefs.forEach((href) => expect(container.querySelector(href as string)).not.toBeNull());
  });

  it('offers the six use cases as a tablist', () => {
    renderPage();

    const tablist = screen.getByRole('tablist', { name: 'Use cases' });
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Ledger',
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

  it('answers ten questions in the FAQ, e-invoicing and the lending module honestly', () => {
    renderPage();
    const faq = document.getElementById('faq') as HTMLElement;

    const questions = within(faq).getAllByRole('button');
    expect(questions).toHaveLength(10);
    fireEvent.click(within(faq).getByRole('button', { name: 'Does it support e-invoicing?' }));
    expect(within(faq).getByText(/^Not today\./)).toBeInTheDocument();
    fireEvent.click(within(faq).getByRole('button', { name: 'Is the lending module available?' }));
    expect(within(faq).getByText(/^Not yet\. Lending & collections is planned/)).toBeInTheDocument();
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

/**
 * CR-2026-09-29-PLATFORM-B — one platform, many modules, and the rule that
 * makes showing planned modules honest: they are named, described and marked
 * Planned, and nothing more.
 */
describe('the module story', () => {
  const moduleElements = (container: HTMLElement) =>
    [...container.querySelectorAll<HTMLElement>('[data-module-card][data-module-status]')];

  /** The map tile, the card and the audience row — three places, one status each. */
  it('shows every configured module in the map, the cards and "Who it\'s for", each with its status chip', () => {
    const { container } = renderPage();
    const elements = moduleElements(container);

    expect(elements.map((el) => el.dataset.moduleCard).sort()).toEqual(
      [...LANDING_MODULES.flatMap(() => ['audience', 'card', 'map'])].sort()
    );
    elements.forEach((el) => {
      const status = el.dataset.moduleStatus as string;
      expect({ card: el.dataset.moduleCard, status, chips: el.querySelectorAll(`[data-testid="landing-status-${status}"]`).length }).toEqual({
        card: el.dataset.moduleCard,
        status,
        chips: 1,
      });
    });
    LANDING_MODULES.forEach((module) => {
      expect(container.querySelector(`#module-${module.id}`)).toHaveAttribute('data-module-status', module.status);
    });
  });

  /**
   * The owner's rule for a planned module: no screenshot, no video, no demo,
   * no fake UI, and no "available now" CTA. Checked on the DOM, so a poster
   * image or a Start free added to the card later fails here.
   */
  it('gives a planned module a Planned chip and never media, a demo or a sign-up link', () => {
    const { container } = renderPage();
    const planned = moduleElements(container).filter((el) => el.dataset.moduleStatus !== 'live');

    expect(planned.length).toBe(UPCOMING_MODULES.length * 3);
    planned.forEach((el) => {
      expect(within(el).getByText('Planned')).toBeInTheDocument();
      // An icon inside an aria-hidden tile is decoration drawn from our own
      // set, which the brief allows; anything else visual is not.
      const media = [...el.querySelectorAll('video, img, picture, source, iframe, canvas, svg')].filter(
        (node) => !node.closest('[aria-hidden="true"]')
      );
      expect(media).toHaveLength(0);
      expect(el.querySelector('[data-testid="landing-demo-open"], a[href="/signup"], button')).toBeNull();
      expect(el.textContent).not.toMatch(/\bsoon\b|coming|available now|today|₹/i);
    });
  });

  it('gives the live module its Start free and a way down to its recordings', () => {
    const { container } = renderPage();
    const shop = container.querySelector('#module-shop') as HTMLElement;

    expect(within(shop).getByText('Live')).toBeInTheDocument();
    expect(within(shop).getByRole('link', { name: 'Start free' })).toHaveAttribute('href', '/signup');
    expect(within(shop).getByRole('link', { name: 'See it in use' })).toHaveAttribute('href', '#features');
    expect(container.querySelector('#features video, #features [data-testid="ub-video"]')).not.toBeNull();
  });

  /**
   * A planned module's words render only where the page says it is planned —
   * the rendered form of the catalogue rule in `unbuiltFeatureCopy.test.ts`,
   * so a hard-coded string cannot slip past it. In both languages.
   */
  it.each(['en', 'hi'] as const)('renders planned-module words only inside a planned scope (%s)', (locale) => {
    const { container } = renderWithProviders(<LandingPage />, { locale });
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const outside: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      if (!PLANNED_MODULE_WORDS[locale].test(text)) continue;
      if (!node.parentElement?.closest('[data-module-status="planned"], [data-planned-scope]')) {
        outside.push(text);
      }
    }
    expect(outside).toEqual([]);
  });

  /** Vision §4: no "kirana" and no regional jargon, in the text or any attribute. */
  it.each(['en', 'hi'] as const)('uses no regional jargon, in text or attributes (%s)', (locale) => {
    const { container } = renderWithProviders(<LandingPage />, { locale });
    const pattern = locale === 'en' ? LANDING_JARGON.en : LANDING_JARGON.hi;
    // The attributes a person reads or hears. Ids and file paths such as
    // `feat-khata-desktop.webm` are code, and the recordings keep their names.
    const READABLE = ['alt', 'aria-label', 'title', 'placeholder', 'aria-description'];
    const attributes = [...container.querySelectorAll('*')].flatMap((el) =>
      READABLE.map((name) => el.getAttribute(name)).filter((value): value is string => !!value)
    );

    expect(withoutBrand(container.textContent ?? '')).not.toMatch(pattern);
    expect(attributes.filter((value) => pattern.test(withoutBrand(value)))).toEqual([]);
  });

  /**
   * The page's `<title>` and description are copy too, and are not in the
   * catalogue. They live in `config/seo.ts` now (CR-2026-09-29-PLATFORM-C), so
   * this reads the VALUES rather than slicing `app/page.tsx`'s source, which
   * would pass on a file that only names the constants. `src/tests/seo.test.tsx`
   * has the lengths and the planned-module rule.
   */
  it('keeps "kirana" and jargon out of the metadata', () => {
    for (const text of [LANDING_TITLE, LANDING_DESCRIPTION, LANDING_SHARE_TITLE, LANDING_SHARE_DESCRIPTION]) {
      expect(withoutBrand(text)).not.toMatch(LANDING_JARGON.en);
    }
  });

  it('says under the plans that other modules are priced when they launch', () => {
    renderWithProviders(<PricingSection />);

    expect(screen.getByTestId('landing-pricing-modules')).toHaveTextContent(
      'Pricing for other modules will be decided when they launch.'
    );
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
