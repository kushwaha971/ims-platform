'use client';

import { memo } from 'react';

import {
  ArrowDown,
  Blocks,
  HardDriveDownload,
  History,
  MegaphoneOff,
  MonitorSmartphone,
  QrCode,
  Stamp,
  UserCog,
  X,
  type LucideIcon,
} from 'lucide-react';

import { UbBox, UbReveal, UbStack, UbText } from 'src/design-system';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';

import { WHY_POINTS, whyKey, type WhyId } from '../config/why';

import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

const WHY_ICON: Readonly<Record<WhyId, LucideIcon>> = {
  shared: Blocks,
  brand: Stamp,
  corrections: History,
  payments: QrCode,
  roles: UserCog,
  data: HardDriveDownload,
  anywhere: MonitorSmartphone,
  noads: MegaphoneOff,
};

/**
 * One point, read top to bottom as a contrast: the common failing in a quiet
 * inset ("Often elsewhere", a muted ✕), a connector, then what YourKhata does —
 * its icon, the benefit as the heading, and the sentence that makes it true.
 *
 * The three parts sit on the list's rows through `subgrid`, so across a row
 * of cards every connector, icon and heading lines up however long each
 * failing is.
 *
 * The heading is the BENEFIT, so a screen reader's heading list is the list of
 * reasons; the failing is labelled in words as well as by the ✕, because an
 * icon alone would leave "Separate apps…" reading like a feature.
 */
function WhyCard({ id, t }: Readonly<{ id: WhyId; t: TranslateFn }>) {
  const Icon = WHY_ICON[id];
  return (
    <UbBox
      as="article"
      aria-labelledby={`landing-why-${id}`}
      data-why-id={id}
      className="group row-span-3 grid grid-rows-subgrid rounded-[22px] border border-border-hairline bg-surface-card p-3 shadow-[0_24px_60px_-48px_var(--device-glow)] transition-[border-color,box-shadow] duration-base ease-standard hover:border-accent-line hover:shadow-[0_28px_70px_-40px_var(--device-glow)]"
    >
      <UbStack gap={2} className="rounded-[16px] bg-surface-subtle p-4 ring-1 ring-inset ring-border-hairline">
        <UbStack direction="row" align="center" gap={2}>
          <UbBox
            aria-hidden
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-strong text-text-tertiary"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </UbBox>
          <UbText
            as="span"
            variant="inherit"
            className="ds-body-s-semibold uppercase tracking-[0.06em] text-text-tertiary [&:lang(hi)]:normal-case [&:lang(hi)]:tracking-normal"
          >
            {t('landing.why.missLabel')}
          </UbText>
        </UbStack>
        <UbText variant="inherit" tone="secondary" className="ds-body-s-regular">
          {t(whyKey(id, 'miss'))}
        </UbText>
      </UbStack>

      <UbBox aria-hidden className="relative flex h-7 items-center justify-center">
        <UbBox className="absolute inset-y-0 left-1/2 w-0 -translate-x-1/2 border-l border-dashed border-accent-line" />
        <UbBox className="relative flex h-6 w-6 items-center justify-center rounded-full border border-accent-line bg-surface-card text-text-accent">
          <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.25} />
        </UbBox>
      </UbBox>

      <UbStack gap={3} className="px-3 pb-3">
        <UbBox
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent text-text-inverse shadow-[0_10px_24px_-12px_var(--device-glow)] transition-transform duration-base ease-standard group-hover:-translate-y-0.5"
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </UbBox>
        <UbText
          as="h3"
          id={`landing-why-${id}`}
          variant="inherit"
          className="text-balance ds-body-l-semibold text-text-primary"
        >
          {t(whyKey(id, 'title'))}
        </UbText>
        <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
          {t(whyKey(id, 'get'))}
        </UbText>
      </UbStack>
    </UbBox>
  );
}

/**
 * #why — "What other apps miss. What you get with YourKhata." Eight points
 * from `config/why.ts`, drawn from the competitor research
 * (docs/platform/research/candidates-and-competitors.md §5–6) and stated
 * generically: no competitor is named and nothing is ranked. 1 → 2 → 4
 * columns, so eight is one, four or two even rows.
 */
function WhySectionBase() {
  const { t } = useTranslation();
  return (
    <UbBox
      as="section"
      id="why"
      aria-labelledby="landing-why-title"
      className={`${LANDING_SECTION} scroll-mt-24 bg-surface-subtle`}
    >
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-why-title"
          eyebrow={t('landing.why.eyebrow')}
          lead={t('landing.why.lead')}
          keyLine={t('landing.why.key')}
        />
        <UbText
          variant="inherit"
          tone="secondary"
          align="center"
          className="mx-auto mt-5 max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] leading-relaxed"
        >
          {t('landing.why.body')}
        </UbText>
        {/* Three rows per card (failing · connector · answer), shared across a
            row of cards; the vertical space between cards is each item's own
            bottom padding, so the row gap never opens up INSIDE a card. */}
        <UbReveal as="ul" stagger className="mt-12 grid gap-x-4 sm:grid-cols-2 md:gap-x-5 xl:grid-cols-4">
          {WHY_POINTS.map((id) => (
            <UbBox as="li" key={id} className="row-span-3 grid grid-rows-subgrid pb-4 md:pb-5">
              <WhyCard id={id} t={t} />
            </UbBox>
          ))}
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

WhySectionBase.displayName = 'WhySection';
export const WhySection = memo(WhySectionBase);
