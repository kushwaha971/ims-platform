'use client';

import { memo, useState } from 'react';

import {
  BarChart3,
  BellRing,
  BookOpenText,
  CircleCheckBig,
  Package,
  ReceiptIndianRupee,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';

import {
  UbBox,
  UbChipTabs,
  UbDeviceFrame,
  UbReveal,
  UbStack,
  UbText,
  UbVideo,
  type UbVideoLabels,
} from 'src/design-system';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';

import {
  DESKTOP_MEDIA,
  FEATURE_CLIPS,
  MOBILE_MEDIA,
  USE_CASE_IDS,
  type UseCaseId,
} from '../config/media';

import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

/**
 * The signature section: six everyday jobs, each as a problem, three steps,
 * the features it uses, what it gets you — and a recording of exactly those
 * steps in the real app.
 *
 * Two layouts, chosen by CSS, never by script (so neither shifts):
 *  - `lg`+: a chip tab row (`UbChipTabs`: a tablist, arrow keys, a sliding
 *    indicator), the steps card on the left and the framed desktop loop on the
 *    right. Only the ACTIVE tab's `UbVideo` is mounted, so only one clip is
 *    ever loading or playing; switching crossfades the panel over 250 ms.
 *  - below `lg`: the six stacked, each with its PHONE recording in a phone
 *    frame, loaded when it comes within 200 px of the viewport.
 * `UbVideo`'s `media` keeps a phone from fetching a desktop clip and the
 * reverse, although both trees are in the document.
 */
const ICONS: Readonly<Record<UseCaseId, LucideIcon>> = {
  khata: BookOpenText,
  reminder: BellRing,
  bill: ReceiptIndianRupee,
  stock: Package,
  purchase: ShoppingCart,
  reports: BarChart3,
};

const key = (id: UseCaseId, part: string): string => `landing.uc.${id}.${part}`;

/**
 * `headingAs`: the stacked cards (below `lg`) title each job with an h3, so
 * their sub-headings are h4. The desktop explorer's job title is a TAB, not a
 * heading, so there the same sub-headings are h3 — an h4 straight under the
 * section's h2 is a skipped level (CR-2026-09-29-PLATFORM-C).
 */
function UseCaseDetails({
  id,
  t,
  headingAs = 'h4',
}: Readonly<{ id: UseCaseId; t: TranslateFn; headingAs?: 'h3' | 'h4' }>) {
  const features = t(key(id, 'features')).split(' · ');
  return (
    <UbStack gap={6}>
      <UbStack gap={2}>
        <UbText as="span" variant="inherit" className="ds-body-s-semibold text-text-accent">
          {t('landing.features.problem')}
        </UbText>
        <UbText variant="inherit" tone="primary" className="ds-body-xl-medium">
          {t(key(id, 'problem'))}
        </UbText>
      </UbStack>

      <UbStack gap={3}>
        <UbText as={headingAs} variant="inherit" className="ds-body-s-medium text-text-tertiary">
          {t('landing.features.steps')}
        </UbText>
        <UbStack as="ol" gap={3}>
          {[1, 2, 3].map((n) => (
            <UbStack as="li" key={n} direction="row" gap={3} align="start">
              <UbText
                as="span"
                variant="inherit"
                aria-label={t('landing.features.stepNumber', { n })}
                className="ds-num-s-semibold flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent-line bg-accent-quiet text-text-accent"
              >
                {n}
              </UbText>
              <UbText variant="inherit" tone="secondary" className="ds-body-base-regular pt-0.5">
                {t(key(id, `step${n}`))}
              </UbText>
            </UbStack>
          ))}
        </UbStack>
      </UbStack>

      <UbStack gap={2}>
        <UbText as={headingAs} variant="inherit" className="ds-body-s-medium text-text-tertiary">
          {t('landing.features.used')}
        </UbText>
        <UbStack as="ul" direction="row" wrap gap={2}>
          {features.map((feature) => (
            <UbText
              as="li"
              key={feature}
              variant="inherit"
              className="ds-body-s-medium rounded-pill border border-border-hairline bg-surface-subtle px-3 py-1 text-text-secondary"
            >
              {feature}
            </UbText>
          ))}
        </UbStack>
      </UbStack>

      <UbStack
        direction="row"
        gap={3}
        align="start"
        className="rounded-[14px] border border-success/25 bg-success-dim px-4 py-3"
      >
        <CircleCheckBig aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <UbText variant="inherit" className="ds-body-base-medium text-success">
          {t(key(id, 'benefit'))}
        </UbText>
      </UbStack>
    </UbStack>
  );
}

function UseCaseExplorerBase() {
  const { t } = useTranslation();
  const [active, setActive] = useState<UseCaseId>('khata');
  const labels: UbVideoLabels = {
    play: t('landing.video.play'),
    pause: t('landing.video.pause'),
    fallback: t('landing.video.fallback'),
  };
  const tabs = USE_CASE_IDS.map((id) => {
    const Icon = ICONS[id];
    return { value: id, label: t(key(id, 'tab')), icon: <Icon aria-hidden className="h-4 w-4" /> };
  });
  const clip = FEATURE_CLIPS[active].desktop;
  const phoneClip = FEATURE_CLIPS[active].mobile;

  return (
    <UbBox
      as="section"
      id="features"
      aria-labelledby="landing-features-title"
      className={`${LANDING_SECTION} scroll-mt-24`}
    >
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-features-title"
          eyebrow={t('landing.features.eyebrow')}
          lead={t('landing.features.lead')}
          keyLine={t('landing.features.key')}
        />

        {/* One explorer at every width (10 Oct 2026). Below `lg` this used to
            be the six jobs stacked, each with its own phone recording — 7,000
            px of a 22,000 px page on a 360 px phone. Now the chips scroll
            sideways and one job shows at a time.

            EVERY job's words stay in the HTML: the inactive ones are `hidden`,
            not unmounted, so a crawler, an answer engine and find-in-page read
            all six without pressing anything. Only the active job's recording
            is mounted, so nothing extra is downloaded. */}
        <UbReveal className="mt-10 lg:mt-12">
          <UbChipTabs
            value={active}
            onValueChange={setActive}
            tabs={tabs}
            ariaLabel={t('landing.features.tablist')}
            className="items-center gap-6 lg:gap-8"
            listClassName="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            panelClassName="w-full"
          >
            <UbBox className="grid w-full items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] xl:gap-12">
              <UbBox className="rounded-[24px] border border-border-hairline bg-surface-card p-5 shadow-[0_18px_50px_-30px_rgb(10_9_11/0.25)] sm:p-7 xl:p-8">
                {USE_CASE_IDS.map((id) => (
                  <UbBox key={id} hidden={id !== active} data-use-case={id}>
                    <UseCaseDetails id={id} t={t} headingAs="h3" />
                  </UbBox>
                ))}
              </UbBox>
              <UbBox className="hidden lg:block">
                <UbDeviceFrame variant="browser" url="yourkhata.com">
                  <UbVideo
                    key={clip.id}
                    {...clip}
                    alt={t(key(active, 'alt'))}
                    labels={labels}
                    media={DESKTOP_MEDIA}
                  />
                </UbDeviceFrame>
              </UbBox>
              <UbBox className="mx-auto w-[min(64vw,15rem)] lg:hidden">
                <UbDeviceFrame variant="phone" glow={false}>
                  <UbVideo
                    key={phoneClip.id}
                    {...phoneClip}
                    alt={t(key(active, 'alt'))}
                    labels={labels}
                    media={MOBILE_MEDIA}
                  />
                </UbDeviceFrame>
              </UbBox>
            </UbBox>
          </UbChipTabs>
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

UseCaseExplorerBase.displayName = 'UseCaseExplorer';
export const UseCaseExplorer = memo(UseCaseExplorerBase);
