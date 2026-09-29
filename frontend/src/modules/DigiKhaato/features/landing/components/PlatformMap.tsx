'use client';

import { memo } from 'react';

import { UbBox, UbLink, UbReveal, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { CORE_IDS, LANDING_MODULES, type LandingModule } from '../config/modules';

import { CoreChip, ModuleIconTile } from './LandingModuleParts';
import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

/**
 * "One platform, many modules, shared core", drawn rather than listed.
 *
 * The drawing is a stack: the modules are a row of tiles on TOP, the shared
 * core is one wide slab UNDER them, and a connector joins every tile to the
 * slab, so the relationship reads before a word is read. Every module's tile
 * and connector is drawn the same way (CR-2026-09-29-PLATFORM-D): the map
 * shows the product's shape, not a build plan.
 *
 * Every tile is a link to the module's card in #modules, so the map is also
 * the section's table of contents.
 *
 * From `lg` the tiles share one row, one column per module — the count is
 * `--module-cols`, set from `LANDING_MODULES.length`, so a module added to the
 * config gets its column with no edit here — and each has its own stub down to
 * a bus line. The bus runs from the centre of the first column to the centre
 * of the last: `(100% - (n - 1) gaps) / 2n` in from each edge, exact for n
 * equal columns at `gap-4`, and `e2e/landing.mjs` measures it. Below `lg` the
 * tiles wrap into two columns and a single centre line carries the "built on"
 * label, because per-tile stubs cannot line up with a grid that wraps.
 */
const TILE =
  'group relative flex h-full flex-col gap-3 rounded-[18px] border border-border-hairline bg-surface-card p-4 shadow-[0_18px_44px_-30px_var(--device-glow)] outline-none transition-[border-color,box-shadow,transform] duration-base ease-standard hover:-translate-y-0.5 hover:border-accent-line focus-visible:shadow-focus sm:p-5';

/** `lg`: one column per module, from `--module-cols`. */
const MODULE_COLUMNS = 'lg:grid-cols-[repeat(var(--module-cols),minmax(0,1fr))]';

const MAP_VARS = {
  '--module-cols': LANDING_MODULES.length,
  '--bus-inset': `calc((100% - ${LANDING_MODULES.length - 1}rem) / ${2 * LANDING_MODULES.length})`,
} as React.CSSProperties;

function ModuleTile({ module, t }: Readonly<{ module: LandingModule; t: (id: string) => string }>) {
  return (
    <UbLink
      href={`#module-${module.id}`}
      underline={false}
      tone="inherit"
      variant="inherit"
      data-module-id={module.id}
      data-module-card="map"
      className={TILE}
    >
      <ModuleIconTile id={module.id} />
      <UbText as="span" variant="inherit" className="ds-body-l-semibold text-text-primary">
        {t(`landing.module.${module.id}.name`)}
      </UbText>
    </UbLink>
  );
}

function PlatformMapSectionBase() {
  const { t } = useTranslation();
  return (
    <UbBox
      as="section"
      id="platform"
      aria-labelledby="landing-platform-title"
      className={`${LANDING_SECTION} scroll-mt-24`}
    >
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-platform-title"
          eyebrow={t('landing.platform.eyebrow')}
          lead={t('landing.platform.lead')}
          keyLine={t('landing.platform.key')}
        />
        <UbText
          variant="inherit"
          tone="secondary"
          align="center"
          className="mx-auto mt-5 max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] leading-relaxed"
        >
          {t('landing.platform.body')}
        </UbText>

        <UbReveal className="mt-12 lg:mt-14">
          <UbBox
            role="group"
            aria-label={t('landing.platform.map')}
            className="relative mx-auto max-w-6xl rounded-[28px] border border-border-hairline bg-surface-subtle/70 p-3 sm:p-5 lg:p-7"
            data-testid="landing-module-map"
            style={MAP_VARS}
          >
            {/* ── the modules, on top ─────────────────────────────────── */}
            <UbText
              as="h3"
              variant="inherit"
              className="mb-3 px-1 ds-body-s-semibold uppercase tracking-[0.08em] text-text-tertiary"
            >
              {t('landing.platform.modules')}
            </UbText>
            <UbBox as="ul" className={cn('grid grid-cols-2 gap-3 sm:gap-4', MODULE_COLUMNS)}>
              {LANDING_MODULES.map((module) => (
                <UbBox as="li" key={module.id}>
                  <ModuleTile module={module} t={t} />
                </UbBox>
              ))}
            </UbBox>

            {/* ── the connectors ──────────────────────────────────────── */}
            <UbBox aria-hidden className="relative h-14 lg:h-16">
              <UbBox
                data-testid="landing-map-stubs"
                className={cn('absolute inset-x-0 top-0 hidden h-1/2 gap-4 lg:grid', MODULE_COLUMNS)}
              >
                {LANDING_MODULES.map((module) => (
                  <UbBox key={module.id} className="mx-auto h-full w-0 border-l-2 border-accent-line" />
                ))}
              </UbBox>
              <UbBox className="absolute left-[var(--bus-inset)] right-[var(--bus-inset)] top-1/2 hidden h-0 border-t-2 border-accent-line lg:block" />
              <UbBox className="absolute left-1/2 top-0 h-full w-0 -translate-x-1/2 border-l-2 border-accent lg:top-1/2 lg:h-1/2" />
              <UbText
                as="span"
                variant="inherit"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-pill border border-accent-line bg-surface-card px-3 py-1 ds-body-s-medium text-text-accent shadow-sm"
              >
                {t('landing.platform.connector')}
              </UbText>
            </UbBox>

            {/* ── the shared core, underneath ─────────────────────────── */}
            <UbBox
              className="relative overflow-clip rounded-[22px] border border-accent-line bg-surface-card p-5 shadow-[0_24px_60px_-36px_var(--device-glow)] sm:p-6 lg:p-8"
              data-testid="landing-core"
            >
              <UbBox
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,var(--accent-quiet),transparent_70%)]"
              />
              <UbStack gap={5} className="relative">
                <UbStack direction="row" wrap align="center" justify="between" gap={3}>
                  <UbStack gap={1}>
                    <UbText as="h3" variant="inherit" className="ds-body-xl-semibold text-text-primary">
                      {t('landing.platform.core.title')}
                    </UbText>
                    <UbText variant="inherit" tone="tertiary" className="ds-body-base-regular">
                      {t('landing.platform.core.caption')}
                    </UbText>
                  </UbStack>
                </UbStack>
                <UbStack as="ul" direction="row" wrap gap={2.5}>
                  {CORE_IDS.map((id) => (
                    <CoreChip key={id} id={id} t={t} />
                  ))}
                </UbStack>
                <UbText
                  variant="inherit"
                  tone="secondary"
                  className="border-t border-border-hairline pt-4 ds-body-base-regular"
                >
                  {t('landing.platform.core.foot')}
                </UbText>
              </UbStack>
            </UbBox>
          </UbBox>
        </UbReveal>
      </UbBox>
    </UbBox>
  );
}

PlatformMapSectionBase.displayName = 'PlatformMapSection';
export const PlatformMapSection = memo(PlatformMapSectionBase);
