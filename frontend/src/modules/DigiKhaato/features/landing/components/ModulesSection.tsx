'use client';

import { memo } from 'react';

import { ArrowDown, Check } from 'lucide-react';

import { UbActionLink, UbBox, UbReveal, UbStack, UbText } from 'src/design-system';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';

import {
  LANDING_MODULES,
  LIVE_MODULES,
  PROBLEM_LINES,
  UPCOMING_MODULES,
  type LandingModule,
} from '../config/modules';

import { CoreChip, ModuleIconTile, ModuleStatusChip } from './LandingModuleParts';
import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

/**
 * #modules — one card per module, every one from `config/modules.ts`.
 *
 * A LIVE module gets the wide card: what is in it, what it is built on, and
 * the page's two real actions, Start free and "See it in use" (down to the
 * use-case explorer, which is this module's deep dive with its recordings).
 *
 * Any other module gets a quiet card and nothing else: its status chip, what
 * it is for, the problems it is planned to address and the core it will build
 * on. It has no screenshot, no video, no demo, no date and no button. That is
 * the owner's rule (vision §4) rather than a styling choice, and
 * `LandingPage.test.tsx` fails if a card marked `planned` ever holds media or
 * a link to sign up.
 */
const SHOP_LINES = [1, 2, 3, 4, 5, 6] as const;

function LiveModuleCard({ module, t }: Readonly<{ module: LandingModule; t: TranslateFn }>) {
  const key = (part: string) => `landing.module.${module.id}.${part}`;
  return (
    <UbBox
      as="article"
      id={`module-${module.id}`}
      aria-labelledby={`landing-module-${module.id}`}
      data-module-status={module.status}
      data-module-card="card"
      className="relative scroll-mt-28 overflow-clip rounded-[28px] border border-accent bg-surface-card p-6 shadow-[0_28px_70px_-40px_var(--device-glow)] ring-1 ring-inset ring-accent sm:p-8 lg:p-10"
    >
      <UbBox
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_70%_at_100%_0%,var(--accent-quiet),transparent)]"
      />
      <UbBox className="relative grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
        <UbStack gap={5} align="start" className="min-w-0">
          <UbStack direction="row" align="center" gap={4} wrap>
            <ModuleIconTile id={module.id} status={module.status} size="lg" />
            <UbStack gap={1.5} align="start">
              <ModuleStatusChip status={module.status} t={t} />
              <UbText
                as="h3"
                id={`landing-module-${module.id}`}
                variant="inherit"
                className="text-[clamp(1.5rem,1.2rem+1vw,2rem)] font-semibold leading-tight tracking-[-0.02em] text-text-primary"
              >
                {t(key('name'))}
              </UbText>
            </UbStack>
          </UbStack>
          <UbText variant="inherit" className="ds-body-base-medium text-text-accent">
            {t(key('audience'))}
          </UbText>
          <UbText variant="inherit" tone="secondary" className="max-w-[36rem] text-[1.0625rem] leading-relaxed">
            {t(key('purpose'))}
          </UbText>
          <UbStack direction="row" wrap gap={3} className="w-full max-sm:flex-col max-sm:[&>*]:w-full">
            <UbActionLink
              href={ROUTES.SIGNUP}
              variant="primary"
              size="lg"
              className="ub-lift h-12 rounded-[14px] px-6 text-[1.0625rem]"
              data-testid="landing-module-start"
            >
              {t('landing.nav.startFree')}
            </UbActionLink>
            <UbActionLink
              href="#features"
              variant="outlineNeutral"
              size="lg"
              icon={<ArrowDown aria-hidden className="order-last h-4 w-4" />}
              className="ub-lift h-12 rounded-[14px] px-6 text-[1.0625rem]"
            >
              {t('landing.modules.seeInUse')}
            </UbActionLink>
          </UbStack>
        </UbStack>

        <UbStack gap={6} className="min-w-0 rounded-[20px] border border-border-hairline bg-surface-subtle p-5 sm:p-6">
          <UbStack gap={3}>
            <UbText as="h4" variant="inherit" className="ds-body-s-semibold text-text-tertiary">
              {t('landing.modules.included')}
            </UbText>
            <UbBox as="ul" className="grid gap-3 sm:grid-cols-2">
              {SHOP_LINES.map((n) => (
                <UbStack as="li" key={n} direction="row" gap={3} align="start">
                  <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <UbText variant="inherit" className="ds-body-base-regular text-text-primary">
                    {t(key(`i.${n}`))}
                  </UbText>
                </UbStack>
              ))}
            </UbBox>
          </UbStack>
          <UbStack gap={3} className="border-t border-border-hairline pt-5">
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
      </UbBox>
    </UbBox>
  );
}

function UpcomingModuleCard({ module, t }: Readonly<{ module: LandingModule; t: TranslateFn }>) {
  const key = (part: string) => `landing.module.${module.id}.${part}`;
  return (
    <UbStack
      as="article"
      gap={5}
      id={`module-${module.id}`}
      aria-labelledby={`landing-module-${module.id}`}
      data-module-status={module.status}
      data-module-card="card"
      className="h-full scroll-mt-28 rounded-[24px] border border-dashed border-border-strong bg-surface-card p-6 transition-[border-color] duration-base ease-standard hover:border-accent-line"
    >
      <UbStack direction="row" align="start" justify="between" gap={3}>
        <ModuleIconTile id={module.id} status={module.status} size="lg" />
        <ModuleStatusChip status={module.status} t={t} />
      </UbStack>
      <UbStack gap={2}>
        <UbText
          as="h3"
          id={`landing-module-${module.id}`}
          variant="inherit"
          className="ds-body-xl-semibold text-text-primary"
        >
          {t(key('name'))}
        </UbText>
        <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
          {t(key('purpose'))}
        </UbText>
      </UbStack>
      <UbStack gap={3} className="flex-1">
        <UbText as="h4" variant="inherit" className="ds-body-s-semibold text-text-tertiary">
          {t('landing.modules.problems')}
        </UbText>
        <UbStack as="ul" gap={2.5}>
          {PROBLEM_LINES.map((n) => (
            <UbStack as="li" key={n} direction="row" gap={3} align="start">
              <UbBox
                as="span"
                aria-hidden
                className="mt-[0.45rem] h-2 w-2 shrink-0 rounded-full border-2 border-border-strong"
              />
              <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
                {t(key(`problem.${n}`))}
              </UbText>
            </UbStack>
          ))}
        </UbStack>
      </UbStack>
      <UbStack gap={2.5} className="border-t border-border-hairline pt-4">
        <UbText as="h4" variant="inherit" className="ds-body-s-semibold text-text-tertiary">
          {t('landing.modules.willBuildOn')}
        </UbText>
        <UbStack as="ul" direction="row" wrap gap={2}>
          {module.buildsOn.map((id) => (
            <CoreChip key={id} id={id} t={t} size="sm" />
          ))}
        </UbStack>
      </UbStack>
    </UbStack>
  );
}

function ModulesSectionBase() {
  const { t } = useTranslation();
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
        <UbReveal className="mt-12">
          {LIVE_MODULES.map((module) => (
            <LiveModuleCard key={module.id} module={module} t={t} />
          ))}
        </UbReveal>
        <UbReveal as="ul" stagger className="mt-5 grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-4">
          {UPCOMING_MODULES.map((module) => (
            <UbBox as="li" key={module.id}>
              <UpcomingModuleCard module={module} t={t} />
            </UbBox>
          ))}
        </UbReveal>
        <UbText variant="body-sm" tone="tertiary" align="center" className="mx-auto mt-6 max-w-2xl">
          {t('landing.modules.note')}
        </UbText>
      </UbBox>
    </UbBox>
  );
}

ModulesSectionBase.displayName = 'ModulesSection';
export const ModulesSection = memo(ModulesSectionBase);

/**
 * "Who it's for": one row per module, the audience it serves, what they would
 * keep in it, and its status. Rows rather than cards, so the page does not
 * show a third grid of the same five modules; a live row carries the accent,
 * the rest are quiet.
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
          {LANDING_MODULES.map((module) => {
            const live = module.status === 'live';
            return (
              <UbBox as="li" key={module.id}>
                <UbStack
                  direction="row"
                  align="center"
                  gap={4}
                  data-module-status={module.status}
                  data-module-card="audience"
                  className={cn(
                    'rounded-[18px] border p-4 sm:p-5',
                    live
                      ? 'border-accent-line bg-accent-quiet'
                      : 'border-border-hairline bg-surface-card'
                  )}
                >
                  <ModuleIconTile id={module.id} status={module.status} />
                  <UbStack gap={1} className="min-w-0 flex-1">
                    <UbStack direction="row" align="center" gap={2} wrap>
                      <UbText as="h3" variant="inherit" className="ds-body-l-semibold text-text-primary">
                        {t(`landing.module.${module.id}.audience`)}
                      </UbText>
                      <ModuleStatusChip status={module.status} t={t} />
                    </UbStack>
                    <UbText variant="inherit" tone="secondary" className="ds-body-base-regular">
                      {t(`landing.module.${module.id}.keeps`)}
                    </UbText>
                  </UbStack>
                </UbStack>
              </UbBox>
            );
          })}
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

AudienceSectionBase.displayName = 'AudienceSection';
export const AudienceSection = memo(AudienceSectionBase);
