'use client';

import { memo } from 'react';

import { UbAmbientGlow, UbBox, UbLink } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { FaqSection, FinalCta, LandingFooter } from './LandingClosing';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LANDING_SCALE } from './LandingPrimitives';
import { AlsoIncludedSection, HowItWorksSection, SegmentsSection } from './LandingSections';
import { PricingSection } from './PricingSection';
import { UseCaseExplorer } from './UseCaseExplorer';

// The words this page renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
// Imported HERE, in the client tree, rather than in `app/page.tsx`: that file is
// a server component, and a registration there never reaches the browser.
import 'src/i18n/catalogues/landing';

/**
 * The public front page, `/` — what a shopkeeper sees before they have an
 * account. Signed-in browsers never get here (`proxy.ts` sends them to the
 * dashboard), so nothing on it reads the session.
 *
 * Order: header · hero · who it is for · the use-case explorer (#features) ·
 * also included · how it works (#how) · pricing (#pricing) · FAQ (#faq) · the
 * closing band · footer.
 *
 * Copy rules (and a test for each, `LandingPage.test.tsx` and
 * `unbuiltFeatureCopy.test.ts`): nothing that is not built — no offline mode,
 * SMS or email sending, e-invoice or e-way bill (the FAQ says plainly that
 * e-invoicing is not supported), GST return filing, bank sync, payment
 * gateway, barcode, P&L or balance sheet, branches or a native app; no
 * testimonials, user counts, ratings or invented figures; and nothing implies
 * that YourKhata sends a message — the merchant presses send (DEC-012).
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
        <SegmentsSection />
        <UseCaseExplorer />
        <AlsoIncludedSection />
        <HowItWorksSection />
        <PricingSection />
        <FaqSection />
        <FinalCta />
      </UbBox>
      <LandingFooter />
    </UbBox>
  );
}

LandingPageBase.displayName = 'LandingPage';
export const LandingPage = memo(LandingPageBase);
