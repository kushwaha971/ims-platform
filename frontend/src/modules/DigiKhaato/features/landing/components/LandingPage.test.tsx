import { act, fireEvent, screen, within } from '@testing-library/react';

import { ThemeProvider } from 'src/components/providers/ThemeProvider';
import { themeRestored } from 'src/redux/slice/themeSlice';
import { store } from 'src/redux/store';
import { en as enMessages, hi as hiMessages } from 'src/tests/allMessages';
import {
  COMPARATIVE_CLAIMS,
  LANDING_JARGON,
  MODULE_WORDS,
  STATUS_WORDS,
  namesACompetitor,
  withoutBrand,
} from 'src/tests/moduleVocabulary';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { THEME_CHOICE_COOKIE } from 'src/utils/cookieUtils';

import { DEMO_TRANSCRIPT } from '../config/demoTranscript';
import { FEATURE_CLIPS } from '../config/media';
import { LANDING_MODULES, VISIBLE_MODULES } from '../config/modules';
import { PRICING, YEARLY_BILLED_MONTHS, priceFor, yearlyPrice } from '../config/pricing';
import {
  LANDING_DESCRIPTION,
  LANDING_SHARE_DESCRIPTION,
  LANDING_SHARE_TITLE,
  LANDING_TITLE,
} from '../config/seo';
import { WHY_POINTS } from '../config/why';

import { splitAroundWord } from './LandingHero';
import { ModuleStage } from './LandingModuleParts';
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
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: jest.fn(),
  });
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
      'All your records, in one place. Track dues, GST bills, stock, fees, collections and payments.'
    );
    expect(within(h1).getByTestId('ub-rotator')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the badge, the support copy and the micro-copy under the CTAs', () => {
    renderPage();

    expect(screen.getByText('Shop, Library and Lending on one platform')).toBeInTheDocument();
    // DEC-013: sign-up is a mobile number and a code. The page said "email"
    // in four places for a day after the sign-in screen stopped asking for one.
    expect(
      screen.getByText('Sign up with your mobile number. No card needed.')
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/sign up with email|email and a password/i);
  });

  /** No billing exists, so every "Start free" goes to sign-up and nowhere else. */
  it('sends every Start free to /signup and every Log in to /login', () => {
    renderPage();

    const starts = screen.getAllByRole('link', { name: /^Start free/ });
    // header, hero, how it works, closing band (pricing is hidden; nothing is
    // charged today, so "Start free" is true and stays)
    expect(starts.length).toBeGreaterThanOrEqual(4);
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
    expect(hrefs).toEqual(['#modules', '#demo', '#platform', '#why', '#faq']);
    hrefs.forEach((href) => expect(container.querySelector(href as string)).not.toBeNull());
  });

  it('offers the six use cases as a tablist', () => {
    renderPage();

    const tablist = screen.getByRole('tablist', { name: 'Use cases' });
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((tab) => tab.textContent)
    ).toEqual(['Ledger', 'Reminders', 'GST bill', 'Stock', 'Purchases', 'Reports']);
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Stock' }));
    expect(screen.getByRole('tabpanel', { name: 'Stock' })).toHaveTextContent(
      'Adjust stock with a reason'
    );
  });

  it('answers fourteen questions in the FAQ, e-invoicing and the lending module honestly', () => {
    renderPage();
    const faq = document.getElementById('faq') as HTMLElement;

    const questions = within(faq).getAllByRole('button');
    expect(questions).toHaveLength(14);
    // What it is and how you get in come first: the two things a cold visitor asks.
    expect(questions[0]).toHaveTextContent('What is YourKhata?');
    expect(questions[1]).toHaveTextContent('How do I sign up and log in?');
    fireEvent.click(within(faq).getByRole('button', { name: 'Does it support e-invoicing?' }));
    expect(within(faq).getByText(/^Not today\./)).toBeInTheDocument();
    fireEvent.click(
      within(faq).getByRole('button', { name: 'Does the lending module lend money?' })
    );
    expect(within(faq).getByText(/^No\. Lending & collections keeps a record/)).toBeInTheDocument();
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

  /**
   * The narrated demo is a SECTION (owner, 10 Oct 2026), and ONE film since
   * 11 Oct: Hindi voice, English subtitles. Before play is pressed there is no
   * <video> in the page at all — the film costs a visitor one poster image —
   * and nothing ever plays by itself.
   */
  it('shows one demo film, with no language switch, and loads nothing until play is pressed', () => {
    const { container } = renderPage();
    const demo = container.querySelector('#demo') as HTMLElement;

    expect(screen.getByRole('link', { name: 'Watch the demo' })).toHaveAttribute('href', '#demo');
    expect(demo.querySelector('video')).toBeNull();
    // The separate English film is withdrawn, and the switch between films with it.
    expect(within(demo).queryByRole('tablist')).toBeNull();
    // Both posters are in the HTML and lazy; CSS shows the one for this screen.
    expect(
      [...demo.querySelectorAll('img')].map((img) => [
        img.getAttribute('src'),
        img.getAttribute('loading'),
      ])
    ).toEqual([
      ['/media/landing/demo-hi-mobile-poster.jpg', 'lazy'],
      ['/media/landing/demo-hi-desktop-poster.jpg', 'lazy'],
    ]);

    // jsdom matches no media query, so this is the phone: it gets the PHONE cut.
    fireEvent.click(within(demo).getByTestId('landing-demo-play'));
    const video = within(demo).getByTestId('landing-demo-video');
    expect(video).toHaveAttribute('src', '/media/landing/demo-hi-mobile.mp4');
    expect(video).toHaveAttribute('lang', 'hi');
    expect(video).toHaveAttribute('controls');
    expect(video).not.toHaveAttribute('muted');
    // Somebody reading the page in English is not left out of a Hindi film:
    // it carries English subtitles, and on an English page they are the ones on.
    const captions = video.querySelector('track[kind="captions"]') as HTMLTrackElement;
    expect(captions).toHaveAttribute('src', '/media/landing/demo-hi-mobile.vtt');
    expect(captions).toHaveAttribute('srclang', 'hi');
    expect(captions).not.toHaveAttribute('default');
    const subtitles = video.querySelector('track[kind="subtitles"]') as HTMLTrackElement;
    expect(subtitles).toHaveAttribute('src', '/media/landing/demo-hi-mobile.en.vtt');
    expect(subtitles).toHaveAttribute('srclang', 'en');
    expect(subtitles).toHaveAttribute('default');

    // A missing film is a sentence and a way forward, not a black box.
    fireEvent.error(video);
    const unavailable = within(demo).getByTestId('landing-demo-unavailable');
    expect(within(unavailable).getByRole('link', { name: /start free/i })).toHaveAttribute(
      'href',
      '/signup'
    );
  });

  /** From `lg` the same button plays the DESKTOP cut: a wide screen never downloads the phone film. */
  it('plays the desktop cut on a desktop', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: /min-width: 1024px/.test(query),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const { container } = renderPage();
      const demo = container.querySelector('#demo') as HTMLElement;
      fireEvent.click(within(demo).getByTestId('landing-demo-play'));
      const video = within(demo).getByTestId('landing-demo-video');
      expect(video).toHaveAttribute('src', '/media/landing/demo-hi-desktop.mp4');
      expect(video.querySelector('track[kind="subtitles"]')).toHaveAttribute(
        'src',
        '/media/landing/demo-hi-desktop.en.vtt'
      );
    } finally {
      window.matchMedia = original;
    }
  });

  /** Both narrations are in the HTML, whichever language is showing: text a crawler can read. */
  it('keeps both transcripts and every chapter in the page', () => {
    const { container } = renderPage();
    const demo = container.querySelector('#demo') as HTMLElement;

    (['en', 'hi'] as const).forEach((language) => {
      const block = demo.querySelector(`[data-demo-language="${language}"]`) as HTMLElement;
      expect(block).toHaveAttribute('lang', language);
      DEMO_TRANSCRIPT[language].chapters.forEach((chapter) => {
        chapter.paragraphs.forEach((paragraph) => expect(block.textContent).toContain(paragraph));
      });
      expect(within(block).getAllByRole('listitem', { hidden: true })).toHaveLength(
        DEMO_TRANSCRIPT[language].chapters.length
      );
    });
    expect(demo.querySelector('[data-demo-language="en"]')).not.toHaveAttribute('hidden');
    expect(demo.querySelector('[data-demo-language="hi"]')).toHaveAttribute('hidden');
  });
});

/**
 * CR-2026-09-29-PLATFORM-D — one platform, many modules, every module
 * presented the same way as part of the product. The rules that keep that
 * honest: no status label anywhere, and nothing invented — a module with no
 * recordings shows words and an icon illustration, never a screen.
 */
describe('the module story', () => {
  const moduleElements = (container: HTMLElement) => [
    ...container.querySelectorAll<HTMLElement>('[data-module-card][data-module-id]'),
  ];
  /** Anything a picture could be, outside decoration drawn from our own icon set. */
  const visualMedia = (el: HTMLElement) =>
    [...el.querySelectorAll('video, img, picture, source, iframe, canvas, svg')].filter(
      (node) => !node.closest('[aria-hidden="true"]')
    );

  /**
   * The map tile, the card and the audience row — three places for each module
   * the page SHOWS. Gym and Hotel are hidden (owner, 10 Oct 2026) through
   * `LANDING_HIDDEN_MODULES`: they stay in the config, five of five, and
   * appear nowhere on the rendered page.
   */
  it('shows the visible modules in the map, the cards and "Who it\'s for", and neither hidden one', () => {
    const { container } = renderPage();
    const elements = moduleElements(container);

    expect(elements.map((el) => `${el.dataset.moduleCard}:${el.dataset.moduleId}`).sort()).toEqual(
      VISIBLE_MODULES.flatMap((module) =>
        ['audience', 'card', 'map'].map((where) => `${where}:${module.id}`)
      ).sort()
    );
    expect(LANDING_MODULES).toHaveLength(5);
    expect(VISIBLE_MODULES.map((module) => module.id)).toEqual(['shop', 'lending', 'library']);
    const map = screen.getByTestId('landing-module-map');
    expect(
      within(map)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Shop & billing', 'Lending & collections', 'Library']);
    expect(
      container.querySelector(
        '#module-gym, #module-hotel, [data-module-id="gym"], [data-module-id="hotel"]'
      )
    ).toBeNull();
    expect(container.textContent).not.toMatch(/gym|fitness|hotel|guest house/i);
    expect(container.querySelector('#module-coaching, [data-module-id="coaching"]')).toBeNull();
    expect(container.textContent).not.toMatch(/coaching|tuition/i);
  });

  /**
   * The owner's rule: no Live, Planned or In development — as a chip, a
   * caption, a heading or an attribute — in either language. `status` stays in
   * the config for the pre-launch check and the page renders nothing from it.
   */
  it.each(['en', 'hi'] as const)(
    'renders no status chip, status attribute or status wording (%s)',
    (locale) => {
      const { container } = renderWithProviders(<LandingPage />, { locale });

      expect(
        container.querySelector('[data-module-status], [data-testid^="landing-status-"]')
      ).toBeNull();
      const text = container.textContent ?? '';
      expect(text).not.toMatch(STATUS_WORDS[locale]);
      if (locale === 'en')
        expect(text).not.toMatch(/one module today|more planned|planned to help/i);
    }
  );

  /**
   * No screenshot, no video, no mock UI and no figure for a module without
   * recordings: its stage is an illustration made of our own icons (aria-hidden
   * decoration). Gym and Hotel are the two without recordings and are hidden
   * from the page, so the rule is checked on the stage itself — which is what
   * draws them the day they are shown again.
   */
  it('gives a module without media no video or image, only its illustration', () => {
    const withoutMedia = LANDING_MODULES.filter((module) => !module.media);
    expect(withoutMedia.map((module) => module.id)).toEqual(['gym', 'hotel']);

    const labels = { play: 'Play video', pause: 'Pause video', fallback: 'Open the video' };
    withoutMedia.forEach((module) => {
      const { container, unmount } = renderWithProviders(
        <ModuleStage id={module.id} t={(id) => id} videoLabels={labels} />
      );
      expect(
        container.querySelector(
          '[data-module-stage="illustration"] [data-module-illustration][aria-hidden="true"]'
        )
      ).not.toBeNull();
      expect(visualMedia(container)).toHaveLength(0);
      expect(container.querySelector('[data-device], video, img')).toBeNull();
      unmount();
    });
  });

  /** Every card the page shows has a real recording, two actions and its "What you can do" list. */
  it('gives every visible module a recording, a list and two actions that name it', () => {
    const { container } = renderPage();
    VISIBLE_MODULES.forEach((module) => {
      const card = container.querySelector(`#module-${module.id}`) as HTMLElement;
      const name = enMessages[`landing.module.${module.id}.name`];
      expect(
        card.querySelector('[data-module-stage="media"] [data-device="browser"] video')
      ).not.toBeNull();
      expect(card.querySelector('[data-module-illustration]')).toBeNull();
      expect(within(card).getByRole('heading', { name: 'What you can do' })).toBeInTheDocument();
      expect(within(card).getByRole('link', { name: `Start free with ${name}` })).toHaveAttribute(
        'href',
        '/signup'
      );
      expect(within(card).getByRole('link', { name: `See ${name} in the demo` })).toHaveAttribute(
        'href',
        '#demo'
      );
    });
  });

  /** A module with `media` gets its real recording, in a browser frame, on the same card. */
  it('renders the framed recording for a module with media — Shop & billing today', () => {
    const { container } = renderPage();
    const shop = container.querySelector('#module-shop') as HTMLElement;

    const stage = shop.querySelector('[data-module-stage="media"]') as HTMLElement;
    expect(stage).not.toBeNull();
    expect(stage.querySelector('[data-device="browser"] video')).not.toBeNull();
    // Two recordings since 11 Oct 2026: the desktop layout in a browser frame
    // and the phone layout in a phone frame. CSS shows one; each only loads
    // on the screen it is for.
    expect(stage.querySelector('[data-device="phone"] video')).not.toBeNull();
    expect(within(stage).getAllByRole('img', { name: /two-item tax invoice/ })).toHaveLength(2);
    expect(shop.querySelector('[data-module-illustration]')).toBeNull();
    expect(
      container.querySelector('#features video, #features [data-testid="ub-video"]')
    ).not.toBeNull();
  });

  /**
   * "When a module ships, its real recordings are added through the config"
   * (vision §4): the SAME stage, given `media` for another module, draws the
   * frame and drops the illustration. No component changes.
   */
  it("turns any module's illustration into its recording when the config gives it media", () => {
    const labels = { play: 'Play video', pause: 'Pause video', fallback: 'Open the video' };
    const t = (key: string) => key;
    const { container, rerender } = renderWithProviders(
      <ModuleStage id="library" t={t} videoLabels={labels} />
    );
    expect(container.querySelector('[data-module-illustration]')).not.toBeNull();
    expect(container.querySelector('video, [data-device]')).toBeNull();

    rerender(
      <ModuleStage
        id="library"
        media={{ clip: FEATURE_CLIPS.khata.desktop, altKey: 'landing.uc.khata.alt' }}
        t={t}
        videoLabels={labels}
      />
    );
    expect(
      container.querySelector('[data-module-stage="media"] [data-device="browser"] video')
    ).not.toBeNull();
    expect(container.querySelector('[data-module-illustration]')).toBeNull();
  });

  /**
   * A module's own words render only in that module's own elements, or in the
   * FAQ answer that names every module — the rendered form of the catalogue
   * rule in `unbuiltFeatureCopy.test.ts`, so a hard-coded string cannot slip
   * past it. In both languages.
   */
  it.each(['en', 'hi'] as const)(
    "renders each module's words only inside that module (%s)",
    (locale) => {
      const { container } = renderWithProviders(<LandingPage />, { locale });
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      const outside: string[] = [];
      const inside = new Set<string>();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? '';
        Object.entries(MODULE_WORDS).forEach(([id, words]) => {
          if (!words[locale].test(text)) return;
          if (node.parentElement?.closest(`[data-module-id="${id}"], [data-module-summary]`))
            inside.add(id);
          else outside.push(`${id}: ${text}`);
        });
      }
      expect(outside).toEqual([]);
      // Not vacuous: every VISIBLE module's words were found, in their own place
      // — and a hidden module's words were found nowhere at all.
      expect([...inside].sort()).toEqual(
        VISIBLE_MODULES.map((module) => module.id)
          .filter((id) => id in MODULE_WORDS)
          .sort()
      );
    }
  );

  /** Vision §4: no "kirana" and no regional jargon, in the text or any attribute. */
  it.each(['en', 'hi'] as const)(
    'uses no regional jargon, in text or attributes (%s)',
    (locale) => {
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
    }
  );

  /**
   * The page's `<title>` and description are copy too, and are not in the
   * catalogue. They live in `config/seo.ts` (CR-2026-09-29-PLATFORM-C), so
   * this reads the VALUES rather than slicing `app/page.tsx`'s source, which
   * would pass on a file that only names the constants. `src/tests/seo.test.tsx`
   * has the lengths.
   */
  it('keeps "kirana" and jargon out of the metadata', () => {
    for (const text of [
      LANDING_TITLE,
      LANDING_DESCRIPTION,
      LANDING_SHARE_TITLE,
      LANDING_SHARE_DESCRIPTION,
    ]) {
      expect(withoutBrand(text)).not.toMatch(LANDING_JARGON.en);
    }
  });

  it('says under the plans that plans for the other modules are added there', () => {
    renderWithProviders(<PricingSection />);

    expect(screen.getByTestId('landing-pricing-modules')).toHaveTextContent(
      'These plans cover Shop & billing. Plans for the other modules will be added here.'
    );
  });
});

/**
 * "Why YourKhata" (#why, owner request 29 Sep 2026): what other apps commonly
 * miss, and what YourKhata does instead. Rendered, in both languages, so a
 * hard-coded string cannot slip past the catalogue checks.
 */
describe('Why YourKhata', () => {
  const HEADINGS = {
    en: [
      'One app, one set of records',
      'Your name on your bills, not ours',
      'Mistakes are corrected, never erased',
      'Payments come straight to you',
      'Each person sees only their part',
      'Your data stays yours',
      'Any phone or computer, in Hindi or English',
      'No ads',
    ],
    hi: [
      'एक ऐप, एक ही रिकॉर्ड',
      'बिल पर आपका नाम, हमारा नहीं',
      'गलती सुधरती है, मिटती नहीं',
      'पैसा सीधे आपके पास',
      'हर व्यक्ति सिर्फ़ अपना हिस्सा देखे',
      'आपका डेटा आपका ही',
      'कोई भी फ़ोन या कंप्यूटर, हिन्दी या अंग्रेज़ी में',
      'कोई विज्ञापन नहीं',
    ],
  } as const;

  it.each(['en', 'hi'] as const)(
    'renders every point as a contrast, with no competitor named (%s)',
    (locale) => {
      const { container } = renderWithProviders(<LandingPage />, { locale });
      const section = container.querySelector('#why') as HTMLElement;
      expect(section).not.toBeNull();
      expect(section).toHaveAttribute('aria-labelledby', 'landing-why-title');

      const cards = [...section.querySelectorAll<HTMLElement>('article[data-why-id]')];
      expect(cards.map((card) => card.dataset.whyId)).toEqual([...WHY_POINTS]);
      expect(
        within(section)
          .getAllByRole('heading', { level: 3 })
          .map((h) => h.textContent)
      ).toEqual([...HEADINGS[locale]]);
      // Every card names the failing in words, not only with the ✕.
      const missLabel = locale === 'en' ? 'Often elsewhere' : 'अक्सर दूसरी जगह';
      cards.forEach((card) => expect(within(card).getByText(missLabel)).toBeInTheDocument());

      const text = section.textContent ?? '';
      expect(namesACompetitor(text, locale)).toBe(false);
      expect(text).not.toMatch(COMPARATIVE_CLAIMS[locale]);
      // Words and our own icons only: no screenshot, no video.
      expect(section.querySelector('video, img, picture, iframe, [data-device]')).toBeNull();
    }
  );

  it('sits after the module map and is in the header', () => {
    const { container } = renderPage();
    const ids = [...container.querySelectorAll('main section[id]')].map((el) => el.id);
    expect(ids.indexOf('why')).toBe(ids.indexOf('platform') + 1);
    // Reading order: what it does, see it, the shop's jobs, how it fits together, why.
    expect(ids.slice(0, 5)).toEqual(['modules', 'demo', 'features', 'platform', 'why']);
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0] as HTMLElement;
    expect(within(nav).getByRole('link', { name: 'Why YourKhata' })).toHaveAttribute(
      'href',
      '#why'
    );
  });

  it('names no competitor anywhere on the rendered page, in either language', () => {
    (['en', 'hi'] as const).forEach((locale) => {
      const { container, unmount } = renderWithProviders(<LandingPage />, { locale });
      expect(namesACompetitor(container.textContent ?? '', locale)).toBe(false);
      unmount();
    });
  });
});

describe('PricingSection', () => {
  /**
   * The plans name their lines by short id (config/pricing.ts), so the section
   * builds each message id at render; every one it can build must exist.
   */
  it('has every plan line in both languages', () => {
    const keys = PRICING.plans.flatMap((plan) => [
      `landing.pricing.${plan.includes}`,
      ...plan.features.map((feature) => `landing.pricing.f.${feature}`),
    ]);
    keys.forEach((key) => {
      expect({
        key,
        en: !!(enMessages as Record<string, string>)[key],
        hi: !!(hiMessages as Record<string, string>)[key],
      }).toEqual({
        key,
        en: true,
        hi: true,
      });
    });
  });

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
