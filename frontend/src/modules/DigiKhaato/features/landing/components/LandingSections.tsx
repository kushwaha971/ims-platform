'use client';

import { memo } from 'react';

import {
  Check,
  FileDown,
  Gauge,
  Languages,
  MoonStar,
  ShoppingBasket,
  Store,
  Truck,
  UserCog,
  type LucideIcon,
  ArrowRight,
  FileSpreadsheet,
} from 'lucide-react';

import { UbActionLink, UbBox, UbReveal, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

/**
 * The page's three quieter sections: who it is for, what else is in the box,
 * and the three steps to start. Each card lifts its border and glows on hover
 * (`LANDING_CARD`), which is the only motion in them beyond the reveal.
 */
export const LANDING_CARD =
  'h-full rounded-[20px] border border-border-hairline bg-surface-card p-6 transition-[border-color,box-shadow] duration-base ease-standard hover:border-accent-line hover:shadow-[0_18px_50px_-24px_var(--device-glow)] md:p-7';

function IconTile({ icon: Icon }: Readonly<{ icon: LucideIcon }>) {
  return (
    <UbBox
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent-quiet text-text-accent ring-1 ring-inset ring-accent-line"
    >
      <Icon className="h-5 w-5" />
    </UbBox>
  );
}

const SEGMENTS: readonly { readonly id: string; readonly icon: LucideIcon }[] = [
  { id: 'kirana', icon: ShoppingBasket },
  { id: 'wholesale', icon: Truck },
  { id: 'retail', icon: Store },
];

function SegmentsSectionBase() {
  const { t } = useTranslation();
  return (
    <UbBox as="section" aria-labelledby="landing-segments-title" className={LANDING_SECTION}>
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-segments-title"
          eyebrow={t('landing.segments.eyebrow')}
          lead={t('landing.segments.lead')}
          keyLine={t('landing.segments.key')}
        />
        <UbReveal as="ul" stagger className="mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
          {SEGMENTS.map(({ id, icon }) => (
            <UbBox as="li" key={id}>
              <UbStack gap={5} className={LANDING_CARD}>
                <IconTile icon={icon} />
                <UbText as="h3" variant="inherit" className="ds-body-xl-semibold text-text-primary">
                  {t(`landing.segments.${id}.title`)}
                </UbText>
                <UbStack as="ul" gap={3}>
                  {[1, 2, 3].map((n) => (
                    <UbStack as="li" key={n} direction="row" gap={3} align="start">
                      <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
                        {t(`landing.segments.${id}.${n}`)}
                      </UbText>
                    </UbStack>
                  ))}
                </UbStack>
              </UbStack>
            </UbBox>
          ))}
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

SegmentsSectionBase.displayName = 'SegmentsSection';
export const SegmentsSection = memo(SegmentsSectionBase);

const ALSO: readonly { readonly id: string; readonly icon: LucideIcon }[] = [
  { id: 'staff', icon: UserCog },
  { id: 'language', icon: Languages },
  { id: 'theme', icon: MoonStar },
  { id: 'csv', icon: FileSpreadsheet },
  { id: 'statements', icon: FileDown },
  { id: 'credit', icon: Gauge },
];

function AlsoIncludedSectionBase() {
  const { t } = useTranslation();
  return (
    <UbBox
      as="section"
      aria-labelledby="landing-also-title"
      className={`${LANDING_SECTION} bg-surface-subtle`}
    >
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-also-title"
          eyebrow={t('landing.also.eyebrow')}
          lead={t('landing.also.lead')}
          keyLine={t('landing.also.key')}
        />
        <UbReveal as="ul" stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALSO.map(({ id, icon }) => (
            <UbBox as="li" key={id}>
              <UbStack direction="row" gap={4} align="start" className={LANDING_CARD}>
                <IconTile icon={icon} />
                <UbStack gap={1} className="min-w-0">
                  <UbText as="h3" variant="inherit" className="ds-body-l-semibold text-text-primary">
                    {t(`landing.also.${id}.title`)}
                  </UbText>
                  <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
                    {t(`landing.also.${id}.body`)}
                  </UbText>
                </UbStack>
              </UbStack>
            </UbBox>
          ))}
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

AlsoIncludedSectionBase.displayName = 'AlsoIncludedSection';
export const AlsoIncludedSection = memo(AlsoIncludedSectionBase);

function HowItWorksSectionBase() {
  const { t } = useTranslation();
  return (
    <UbBox as="section" id="how" aria-labelledby="landing-how-title" className={`${LANDING_SECTION} scroll-mt-24`}>
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-how-title"
          eyebrow={t('landing.how.eyebrow')}
          lead={t('landing.how.lead')}
          keyLine={t('landing.how.key')}
        />
        <UbReveal as="ol" stagger className="relative mt-12 grid gap-4 md:grid-cols-3 md:gap-5">
          {[1, 2, 3].map((n) => (
            <UbBox as="li" key={n} className="relative">
              <UbStack gap={4} className={LANDING_CARD}>
                <UbText
                  as="span"
                  variant="inherit"
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-accent font-serif-display text-[1.375rem] italic text-text-inverse"
                >
                  {n}
                </UbText>
                <UbText as="h3" variant="inherit" className="ds-body-xl-semibold text-text-primary">
                  {t(`landing.how.${n}.title`)}
                </UbText>
                <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
                  {t(`landing.how.${n}.body`)}
                </UbText>
              </UbStack>
            </UbBox>
          ))}
        </UbReveal>
        <UbStack align="center" className="mt-10">
          <UbActionLink
            href={ROUTES.SIGNUP}
            variant="primary"
            size="lg"
            icon={<ArrowRight aria-hidden className="order-last h-4 w-4" />}
            className="ub-lift h-12 rounded-[14px] px-6 text-[1.0625rem]"
          >
            {t('landing.nav.startFree')}
          </UbActionLink>
        </UbStack>
      </UbBox>
    </UbBox>
  );
}

HowItWorksSectionBase.displayName = 'HowItWorksSection';
export const HowItWorksSection = memo(HowItWorksSectionBase);
