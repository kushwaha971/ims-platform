'use client';

import { memo } from 'react';

import { HardDriveDownload, LayoutPanelTop, WifiOff, type LucideIcon } from 'lucide-react';

import { UbBox, UbReveal, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { LANDING_CONTAINER, LANDING_SECTION, LandingSectionHeading } from './LandingPrimitives';

const POINTS: readonly { readonly key: string; readonly icon: LucideIcon }[] = [
  { key: 'offline', icon: WifiOff },
  { key: 'backup', icon: HardDriveDownload },
  { key: 'same', icon: LayoutPanelTop },
];

/**
 * Owner, 12 Oct 2026: a COMING SOON desktop edition — install YourKhata on
 * your own computer and work offline, with the books on that computer's disk
 * rather than our servers — because many merchants will not put their khata
 * on somebody else's server.
 *
 * Deliberately no date, no price and no button: nothing is scheduled, and a
 * sign-up form would be a promise. "Offline for everyday entries", not "fully
 * offline": reminders, share links and UPI still need the internet. The last
 * line points at what is true TODAY (export and delete), so the section is not
 * only a promise.
 */
function DesktopSoonSectionBase() {
  const { t } = useTranslation();
  return (
    <UbBox
      as="section"
      id="desktop"
      aria-labelledby="landing-desktop-title"
      data-testid="landing-desktop-soon"
      className={`${LANDING_SECTION} scroll-mt-24`}
    >
      <UbBox className={LANDING_CONTAINER}>
        <LandingSectionHeading
          id="landing-desktop-title"
          eyebrow={t('landing.desktop.eyebrow')}
          lead={t('landing.desktop.lead')}
          keyLine={t('landing.desktop.key')}
        />
        <UbText
          variant="inherit"
          tone="secondary"
          align="center"
          className="mx-auto mt-5 max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.125rem)] leading-relaxed"
        >
          {t('landing.desktop.body')}
        </UbText>
        <UbReveal as="ul" stagger className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
          {POINTS.map(({ key, icon: Icon }) => (
            <UbBox
              as="li"
              key={key}
              className="rounded-[18px] border border-border-hairline bg-surface-card p-4"
            >
              <UbStack direction="row" align="center" gap={3}>
                <UbBox
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-quiet text-text-accent"
                >
                  <Icon className="h-4 w-4" />
                </UbBox>
                <UbText variant="inherit" tone="primary" className="ds-body-medium">
                  {t(`landing.desktop.point.${key}`)}
                </UbText>
              </UbStack>
            </UbBox>
          ))}
        </UbReveal>
        <UbText
          variant="inherit"
          tone="tertiary"
          align="center"
          className="ds-body-s-regular mx-auto mt-6 max-w-2xl"
        >
          {t('landing.desktop.meanwhile')}
        </UbText>
      </UbBox>
    </UbBox>
  );
}

DesktopSoonSectionBase.displayName = 'DesktopSoonSection';
export const DesktopSoonSection = memo(DesktopSoonSectionBase);
