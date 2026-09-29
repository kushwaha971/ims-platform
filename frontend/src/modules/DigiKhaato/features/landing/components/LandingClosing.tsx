'use client';

import { memo } from 'react';

import { ArrowRight } from 'lucide-react';

import {
  UbActionLink,
  UbBox,
  UbDisclosure,
  UbLink,
  UbLogo,
  UbReveal,
  UbStack,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { LANDING_ANCHORS } from './LandingHeader';
import {
  LANDING_CONTAINER,
  LANDING_SECTION,
  LandingSectionHeading,
  SANS_KEY,
  SERIF_LEAD,
} from './LandingPrimitives';

/** The FAQ, in the order a shopkeeper asks. Every answer is checked against what is built. */
export const FAQ_IDS = ['phone', 'hindi', 'gst', 'staff', 'export', 'cost', 'brand', 'einvoice'] as const;

function FaqSectionBase() {
  const { t } = useTranslation();
  return (
    <UbBox as="section" id="faq" aria-labelledby="landing-faq-title" className={`${LANDING_SECTION} scroll-mt-24`}>
      <UbBox className={`${LANDING_CONTAINER} grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16`}>
        <LandingSectionHeading
          id="landing-faq-title"
          eyebrow={t('landing.faq.eyebrow')}
          lead={t('landing.faq.lead')}
          keyLine={t('landing.faq.key')}
          align="start"
          className="lg:sticky lg:top-28 lg:self-start"
        />
        <UbReveal as="ul" stagger className="flex flex-col gap-3">
          {FAQ_IDS.map((id) => (
            <UbBox as="li" key={id}>
              <UbDisclosure
                size="lg"
                label={t(`landing.faq.${id}.q`)}
                className="rounded-[18px] bg-surface-card"
              >
                <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
                  {t(`landing.faq.${id}.a`)}
                </UbText>
              </UbDisclosure>
            </UbBox>
          ))}
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

FaqSectionBase.displayName = 'FaqSection';
export const FaqSection = memo(FaqSectionBase);

/**
 * The closing band: the page's one dark block in BOTH themes (primary-700 →
 * primary-900), so it reads as the end of the page rather than another
 * section. Its type is `--landing-band-text` — white in both themes, which
 * `text-inverse` is not (it turns to ink in dark mode, for the lighter dark
 * accent) — and check-contrast.mjs holds it to 4.5:1 on every stop.
 */
function FinalCtaBase() {
  const { t } = useTranslation();
  return (
    <UbBox as="section" aria-labelledby="landing-cta-title" className="pb-16 md:pb-24">
      <UbBox className={LANDING_CONTAINER}>
        <UbReveal className="relative overflow-clip rounded-[28px] bg-gradient-to-br from-primary-700 via-primary-800 to-primary-900 px-6 py-14 text-center md:px-12 md:py-20">
          <UbBox
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary-400/30 blur-3xl"
          />
          <UbBox
            aria-hidden
            className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-primary-500/30 blur-3xl"
          />
          <UbStack gap={6} align="center" className="relative">
            <UbText
              as="h2"
              id="landing-cta-title"
              variant="inherit"
              tone="inherit"
              className="text-[hsl(var(--landing-band-text))] text-[clamp(2rem,1.3rem+2.6vw,3.25rem)] leading-[1.1]"
            >
              <UbText as="span" variant="inherit" tone="inherit" className={SERIF_LEAD}>
                {t('landing.cta.lead')}
              </UbText>{' '}
              <UbText as="span" variant="inherit" tone="inherit" className={SANS_KEY}>
                {t('landing.cta.key')}
              </UbText>
            </UbText>
            <UbText variant="inherit" tone="inherit" className="max-w-xl text-[1.0625rem] leading-relaxed text-[hsl(var(--landing-band-text))]">
              {t('landing.cta.body')}
            </UbText>
            <UbStack direction="row" wrap gap={3} justify="center" className="max-sm:w-full max-sm:flex-col">
              <UbActionLink
                href={ROUTES.SIGNUP}
                variant="secondary"
                size="lg"
                icon={<ArrowRight aria-hidden className="order-last h-4 w-4" />}
                className="ub-lift h-12 rounded-[14px] bg-[hsl(var(--landing-band-text))] px-6 text-[1.0625rem] text-primary-800 hover:bg-primary-50"
                data-testid="landing-final-start"
              >
                {t('landing.nav.startFree')}
              </UbActionLink>
              <UbActionLink
                href={ROUTES.LOGIN}
                variant="ghost"
                size="lg"
                className="h-12 rounded-[14px] px-6 text-[1.0625rem] text-[hsl(var(--landing-band-text))] ring-1 ring-inset ring-[hsl(var(--landing-band-text)/0.35)] hover:bg-[hsl(var(--landing-band-text)/0.1)]"
              >
                {t('landing.nav.login')}
              </UbActionLink>
            </UbStack>
          </UbStack>
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

FinalCtaBase.displayName = 'FinalCta';
export const FinalCta = memo(FinalCtaBase);

function FooterLink({ href, children }: Readonly<{ href: string; children: string }>) {
  return (
    <UbBox as="li">
      <UbLink href={href} underline={false} tone="secondary" variant="inherit" className="ds-body-base-regular hover:text-text-primary hover:underline">
        {children}
      </UbLink>
    </UbBox>
  );
}

function LandingFooterBase() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  return (
    <UbBox as="footer" className="border-t border-border-hairline bg-surface-subtle">
      <UbBox className={`${LANDING_CONTAINER} grid gap-10 py-12 md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] md:py-16`}>
        <UbStack gap={4} align="start">
          <UbLogo variant="full" size="md" label="YourKhata" />
          <UbText variant="inherit" tone="tertiary" className="max-w-xs ds-body-base-regular">
            {t('landing.footer.tagline')}
          </UbText>
        </UbStack>
        <UbBox as="nav" aria-label={t('landing.footer.product')}>
          <UbText as="h2" variant="inherit" className="mb-3 ds-body-s-semibold">
            {t('landing.footer.product')}
          </UbText>
          <UbStack as="ul" gap={2}>
            {LANDING_ANCHORS.map((anchor) => (
              <FooterLink key={anchor.href} href={anchor.href}>
                {t(anchor.key)}
              </FooterLink>
            ))}
          </UbStack>
        </UbBox>
        <UbBox as="nav" aria-label={t('landing.footer.account')}>
          <UbText as="h2" variant="inherit" className="mb-3 ds-body-s-semibold">
            {t('landing.footer.account')}
          </UbText>
          <UbStack as="ul" gap={2}>
            <FooterLink href={ROUTES.SIGNUP}>{t('landing.footer.signup')}</FooterLink>
            <FooterLink href={ROUTES.LOGIN}>{t('landing.nav.login')}</FooterLink>
          </UbStack>
        </UbBox>
        <UbBox as="nav" aria-label={t('landing.footer.legal')}>
          <UbText as="h2" variant="inherit" className="mb-3 ds-body-s-semibold">
            {t('landing.footer.legal')}
          </UbText>
          <UbStack as="ul" gap={2}>
            <FooterLink href={ROUTES.LEGAL_TERMS}>{t('landing.footer.terms')}</FooterLink>
            <FooterLink href={ROUTES.LEGAL_PRIVACY}>{t('landing.footer.privacy')}</FooterLink>
          </UbStack>
        </UbBox>
      </UbBox>
      <UbBox className={`${LANDING_CONTAINER} border-t border-border-hairline py-6`}>
        <UbText variant="body-sm" tone="tertiary">
          {t('landing.footer.copyright', { year: String(year) })}
        </UbText>
      </UbBox>
    </UbBox>
  );
}

LandingFooterBase.displayName = 'LandingFooter';
export const LandingFooter = memo(LandingFooterBase);
