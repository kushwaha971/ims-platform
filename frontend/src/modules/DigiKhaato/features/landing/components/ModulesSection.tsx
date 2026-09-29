'use client';

import { memo } from 'react';

import { Check } from 'lucide-react';

import { UbBox, UbReveal, UbStack, UbText, type UbVideoLabels } from 'src/design-system';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';

import { CAN_DO_LINES, LANDING_MODULES, type LandingModule } from '../config/modules';

import { CoreChip, ModuleIconTile, ModuleStage } from './LandingModuleParts';
import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

/**
 * #modules — one card per module, every one from `config/modules.ts`, and
 * every one the SAME card (CR-2026-09-29-PLATFORM-D): the stage on top (the
 * module's recording when it has `media`, an icon illustration when it does
 * not), then its name and who it is for, what it keeps, four "What you can do"
 * lines and the core pieces it is built on.
 *
 * There is no status on it and nothing that differs by status, so the day a
 * module ships its recordings the change is `media` in the config and this
 * file is untouched. The grid is 1 → 2 → 3 columns and does not care how many
 * modules there are; a short last row is centred (`CARD_CELL`).
 *
 * A card without media holds no `<video>`, `<img>` or frame — the owner's rule
 * that nothing is invented — and `LandingPage.test.tsx` checks it on the DOM.
 */
function ModuleCard({
  module,
  t,
  videoLabels,
}: Readonly<{ module: LandingModule; t: TranslateFn; videoLabels: UbVideoLabels }>) {
  const key = (part: string) => `landing.module.${module.id}.${part}`;
  return (
    <UbStack
      as="article"
      gap={5}
      id={`module-${module.id}`}
      aria-labelledby={`landing-module-${module.id}`}
      data-module-id={module.id}
      data-module-card="card"
      className="group h-full scroll-mt-28 rounded-[26px] border border-border-hairline bg-surface-card p-3 shadow-[0_24px_60px_-44px_var(--device-glow)] transition-[border-color,box-shadow] duration-base ease-standard hover:border-accent-line hover:shadow-[0_28px_70px_-36px_var(--device-glow)] sm:p-4"
    >
      <ModuleStage id={module.id} media={module.media} t={t} videoLabels={videoLabels} />

      <UbStack gap={5} className="flex-1 px-2 pb-2 sm:px-3 sm:pb-3">
        <UbStack gap={3}>
          <UbStack direction="row" align="center" gap={3}>
            <ModuleIconTile id={module.id} size="sm" />
            <UbStack gap={0.5} className="min-w-0">
              <UbText
                as="h3"
                id={`landing-module-${module.id}`}
                variant="inherit"
                className="ds-body-xl-semibold text-text-primary"
              >
                {t(key('name'))}
              </UbText>
              <UbText variant="inherit" className="ds-body-s-medium text-text-accent">
                {t(key('audience'))}
              </UbText>
            </UbStack>
          </UbStack>
          <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
            {t(key('purpose'))}
          </UbText>
        </UbStack>

        <UbStack gap={3} className="flex-1">
          <UbText as="h4" variant="inherit" className="ds-body-s-semibold text-text-tertiary">
            {t('landing.modules.canDo')}
          </UbText>
          <UbStack as="ul" gap={2.5}>
            {CAN_DO_LINES.map((n) => (
              <UbStack as="li" key={n} direction="row" gap={3} align="start">
                <UbBox
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-quiet text-text-accent"
                >
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                </UbBox>
                <UbText variant="inherit" className="ds-body-base-regular text-text-primary">
                  {t(key(`i.${n}`))}
                </UbText>
              </UbStack>
            ))}
          </UbStack>
        </UbStack>

        <UbStack gap={2.5} className="border-t border-border-hairline pt-4">
          <UbText as="h4" variant="inherit" className="ds-body-s-semibold text-text-tertiary">
            {t('landing.modules.buildsOn')}
          </UbText>
          <UbStack as="ul" direction="row" wrap gap={2}>
            {module.buildsOn.map((id) => (
              <CoreChip key={id} id={id} t={t} size="sm" />
            ))}
          </UbStack>
        </UbStack>
      </UbStack>
    </UbStack>
  );
}

/**
 * Two cards a row from `md`, three from `xl`, each card two tracks of a
 * 4- / 6-track grid so a SHORT last row is centred rather than leaving a hole:
 * a lone last card starts at track 2 of 4; a last pair starts at track 2 of 6.
 * Written against the count, not for five, so a module added or removed in
 * the config still lays out evenly.
 */
const CARD_CELL =
  'md:col-span-2 md:[&:last-child:nth-child(odd)]:col-start-2 xl:[&:last-child:nth-child(odd)]:col-start-auto xl:[&:nth-last-child(2):nth-child(3n+1)]:col-start-2 xl:[&:last-child:nth-child(3n+1)]:col-start-3';

function ModulesSectionBase() {
  const { t } = useTranslation();
  const videoLabels = {
    play: t('landing.video.play'),
    pause: t('landing.video.pause'),
    fallback: t('landing.video.fallback'),
  };
  return (
    <UbBox
      as="section"
      id="modules"
      aria-labelledby="landing-modules-title"
      className={`${LANDING_SECTION} scroll-mt-24 bg-surface-subtle`}
    >
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-modules-title"
          eyebrow={t('landing.modules.eyebrow')}
          lead={t('landing.modules.lead')}
          keyLine={t('landing.modules.key')}
        />
        <UbReveal as="ul" stagger className="mt-12 grid gap-4 md:grid-cols-4 md:gap-5 xl:grid-cols-6">
          {LANDING_MODULES.map((module) => (
            <UbBox as="li" key={module.id} className={CARD_CELL}>
              <ModuleCard module={module} t={t} videoLabels={videoLabels} />
            </UbBox>
          ))}
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

ModulesSectionBase.displayName = 'ModulesSection';
export const ModulesSection = memo(ModulesSectionBase);

/**
 * "Who it's for": one row per module, the audience it serves and what they
 * keep in it. Rows rather than cards, so the page does not show a third grid
 * of the same modules; every row is drawn the same way.
 */
function AudienceSectionBase() {
  const { t } = useTranslation();
  return (
    <UbBox as="section" aria-labelledby="landing-audience-title" className={LANDING_SECTION}>
      <UbBox className={`${LANDING_CONTAINER} grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-16`}>
        <LandingSectionHeading
          id="landing-audience-title"
          eyebrow={t('landing.audience.eyebrow')}
          lead={t('landing.audience.lead')}
          keyLine={t('landing.audience.key')}
          align="start"
          className="lg:sticky lg:top-28 lg:self-start"
        />
        <UbReveal as="ul" stagger className="flex flex-col gap-3">
          {LANDING_MODULES.map((module) => (
            <UbBox as="li" key={module.id}>
              <UbStack
                direction="row"
                align="center"
                gap={4}
                data-module-id={module.id}
                data-module-card="audience"
                className="rounded-[18px] border border-border-hairline bg-surface-card p-4 transition-[border-color] duration-base ease-standard hover:border-accent-line sm:p-5"
              >
                <ModuleIconTile id={module.id} />
                <UbStack gap={1} className="min-w-0 flex-1">
                  <UbText as="h3" variant="inherit" className="ds-body-l-semibold text-text-primary">
                    {t(`landing.module.${module.id}.audience`)}
                  </UbText>
                  <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
                    {t(`landing.module.${module.id}.keeps`)}
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

AudienceSectionBase.displayName = 'AudienceSection';
export const AudienceSection = memo(AudienceSectionBase);
