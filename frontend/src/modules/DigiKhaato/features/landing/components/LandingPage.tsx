'use client';

import { memo } from 'react';

import dynamic from 'next/dynamic';

import { UbAmbientGlow, UbBox, UbLink } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { SHOW_PRICING } from '../config/pricing';

import { FaqSection, FinalCta, LandingFooter } from './LandingClosing';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LANDING_SCALE } from './LandingPrimitives';
import { AlsoIncludedSection, HowItWorksSection } from './LandingSections';
import { AudienceSection, ModulesSection } from './ModulesSection';
import { PlatformMapSection } from './PlatformMap';
import { UseCaseExplorer } from './UseCaseExplorer';
import { WhySection } from './WhySection';

// The words this page renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
// Imported HERE, in the client tree, rather than in `app/page.tsx`: that file is
// a server component, and a registration there never reaches the browser.
import 'src/i18n/catalogues/landing';

/**
 * Pricing is hidden for now (CR-2026-09-29-PLATFORM-D), so its section is its
 * own chunk: while `SHOW_PRICING` is off the page never fetches it, and the
 * `/` route does not carry four plans and a billing toggle nobody can see.
 * Server-rendered as before when the flag is on, so the plans stay in the HTML.
 */
const PricingSection = dynamic(() => import('./PricingSection').then((module) => module.PricingSection));

/**
 * The public front page, `/` — what a business sees before it has an account.
 * Signed-in browsers never get here (`proxy.ts` sends them to the dashboard),
 * so nothing on it reads the session.
 *
 * The story is "one platform, many modules, shared core", in this order:
 * header · hero · the module map (#platform) · one card per module (#modules)
 * · Shop & billing's use-case explorer (#features) · why YourKhata (#why:
 * what other apps miss, and what a business gets here) · who it's for · also
 * included · how it works (#how) · pricing (#pricing, while `SHOW_PRICING` is
 * on) · FAQ (#faq) · the closing band · footer.
 *
 * CR-2026-09-29-PLATFORM-D: every module is presented the same way, as part of
 * the product, from `config/modules.ts` — no Live / Planned label anywhere. A
 * module with recordings shows them; one without shows text and an icon
 * illustration, never an invented screen. A module's own words (borrower,
 * library, guest, student…) render only inside that module's elements
 * (`data-module-id`) or the FAQ answer that names every module
 * (`data-module-summary`); `src/tests/moduleVocabulary.ts` is the list.
 *
 * Copy rules (and a test for each, `LandingPage.test.tsx` and
 * `unbuiltFeatureCopy.test.ts`): no offline mode, SMS or email sending,
 * e-invoice or e-way bill (the FAQ says plainly that e-invoicing is not
 * supported), GST return filing, bank sync, payment gateway, barcode, P&L or
 * balance sheet, branches or a native app; no testimonials, user counts,
 * ratings or invented figures; and nothing implies that YourKhata sends a
 * message — the merchant presses send (DEC-012).
 *
 * Everything here is route-local: this component tree is the `/` chunk and no
 * slice is registered for it, so the shared shell does not grow.
 */
function LandingPageBase({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();
  return (
    <UbBox className={cn('relative min-h-dvh overflow-x-clip bg-canvas', LANDING_SCALE, className)}>
      {/* Behind the header AND the hero, so the light has no edge where the
          hero begins under the floating header. */}
      <UbAmbientGlow className="bottom-auto h-[min(1150px,calc(100dvh+280px))]" />
      <UbLink
        href="#main"
        underline={false}
        className="sr-only z-50 rounded-control bg-surface-card px-4 py-2 ds-body-base-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('landing.skip')}
      </UbLink>
      <LandingHeader />
      <UbBox as="main" id="main" tabIndex={-1} className="outline-none">
        <LandingHero />
        <PlatformMapSection />
        <ModulesSection />
        <UseCaseExplorer />
        <WhySection />
        <AudienceSection />
        <AlsoIncludedSection />
        <HowItWorksSection />
        {SHOW_PRICING && <PricingSection />}
        <FaqSection />
        <FinalCta />
      </UbBox>
      <LandingFooter />
    </UbBox>
  );
}

LandingPageBase.displayName = 'LandingPage';
export const LandingPage = memo(LandingPageBase);
