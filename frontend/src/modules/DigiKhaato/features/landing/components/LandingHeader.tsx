'use client';

import { memo, useCallback, useRef, useState } from 'react';

import { Menu } from 'lucide-react';

import { UbActionLink, UbBox, UbButton, UbDialog, UbLink, UbLogo, UbStack } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { cn } from 'src/utils/cn';

import { SHOW_PRICING } from '../config/pricing';

import { LANDING_CONTAINER } from './LandingPrimitives';
import { LanguageToggle, ThemeToggle } from './LandingToggles';

const ANCHORS = [
  { href: '#platform', key: 'landing.nav.platform' },
  { href: '#modules', key: 'landing.nav.modules' },
  { href: '#why', key: 'landing.nav.why' },
  { href: '#pricing', key: 'landing.nav.pricing' },
  { href: '#faq', key: 'landing.nav.faq' },
] as const;

/**
 * In-page anchors, in reading order. The ids are the sections' own. Pricing is
 * listed only while `SHOW_PRICING` is on (CR-2026-09-29-PLATFORM-D) — a link
 * to a section that is not rendered is a dead anchor. A function, read at
 * render, so the flag is never frozen into a module constant.
 */
export const landingAnchors = (): readonly (typeof ANCHORS)[number][] =>
  SHOW_PRICING ? ANCHORS : ANCHORS.filter((anchor) => anchor.href !== '#pricing');

/**
 * A floating pill: sticky 12 px from the top, translucent canvas with a
 * backdrop blur, a hairline and a soft shadow — so it reads as a surface over
 * the page in both themes rather than a band across it.
 *
 * Desktop (`lg`+): logo, the four anchors centred, then theme, language,
 * Log in and Start free. Below `lg`: logo, Start free and a menu button; the
 * menu is `UbDialog` — a bottom sheet on a phone, with the focus trap, Escape
 * and focus-return every dialog in the product already has.
 */
function LandingHeaderBase() {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const anchors = landingAnchors();

  return (
    <UbBox as="header" className="sticky top-0 z-40 pt-3">
      <UbBox className={LANDING_CONTAINER}>
        <UbStack
          direction="row"
          align="center"
          justify="between"
          gap={3}
          className={cn(
            'h-14 rounded-[20px] border border-border-hairline pl-4 pr-2 lg:h-16 lg:pl-5',
            'bg-canvas/75 shadow-[0_8px_30px_-12px_rgb(10_9_11/0.18)] backdrop-blur-xl backdrop-saturate-150'
          )}
        >
          <UbLink href={ROUTES.HOME} underline={false} tone="inherit" className="shrink-0 rounded-control outline-none focus-visible:shadow-focus">
            <UbLogo variant="full" size="md" label={t('landing.nav.home')} />
          </UbLink>

          <UbBox as="nav" aria-label={t('landing.nav.label')} className="hidden lg:block">
            <UbStack as="ul" direction="row" gap={1}>
              {anchors.map((anchor) => (
                <UbBox as="li" key={anchor.href}>
                  <UbLink
                    href={anchor.href}
                    underline={false}
                    variant="inherit"
                    tone="secondary"
                    className="inline-flex h-10 items-center rounded-pill px-4 ds-body-base-medium transition-colors duration-fast hover:bg-surface-hover hover:text-text-primary"
                  >
                    {t(anchor.key)}
                  </UbLink>
                </UbBox>
              ))}
            </UbStack>
          </UbBox>

          <UbStack direction="row" align="center" gap={2} className="shrink-0">
            <ThemeToggle className="hidden lg:inline-flex" />
            <LanguageToggle className="hidden lg:inline-flex" />
            <UbActionLink
              href={ROUTES.LOGIN}
              variant="ghost"
              className="hidden rounded-[14px] sm:inline-flex"
            >
              {t('landing.nav.login')}
            </UbActionLink>
            <UbActionLink
              href={ROUTES.SIGNUP}
              variant="primary"
              className="ub-lift rounded-[14px] px-4"
              data-testid="landing-header-start"
            >
              {t('landing.nav.startFree')}
            </UbActionLink>
            <UbButton
              ref={menuButtonRef}
              variant="ghost"
              iconOnly
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              icon={<Menu aria-hidden className="h-5 w-5" />}
              className="rounded-pill lg:hidden"
            >
              {t('landing.nav.menu.open')}
            </UbButton>
          </UbStack>
        </UbStack>
      </UbBox>

      <UbDialog
        open={menuOpen}
        onOpenChange={setMenuOpen}
        title={t('landing.nav.menu.title')}
        closeLabel={t('landing.nav.menu.close')}
        returnFocusRef={menuButtonRef}
      >
        <UbStack gap={6}>
          <UbBox as="nav" aria-label={t('landing.nav.label')}>
            <UbStack as="ul" gap={1}>
              {anchors.map((anchor) => (
                <UbBox as="li" key={anchor.href}>
                  <UbLink
                    href={anchor.href}
                    underline={false}
                    variant="inherit"
                    tone="primary"
                    onClick={closeMenu}
                    className="flex h-12 items-center rounded-control px-3 ds-body-l-medium hover:bg-surface-hover"
                  >
                    {t(anchor.key)}
                  </UbLink>
                </UbBox>
              ))}
            </UbStack>
          </UbBox>
          <UbStack direction="row" align="center" justify="between" gap={3}>
            <LanguageToggle />
            <ThemeToggle />
          </UbStack>
          <UbStack gap={3}>
            <UbActionLink href={ROUTES.SIGNUP} variant="primary" size="lg" className="w-full rounded-[14px]">
              {t('landing.nav.startFree')}
            </UbActionLink>
            <UbActionLink href={ROUTES.LOGIN} variant="outlineNeutral" size="lg" className="w-full rounded-[14px]">
              {t('landing.nav.login')}
            </UbActionLink>
          </UbStack>
        </UbStack>
      </UbDialog>
    </UbBox>
  );
}

LandingHeaderBase.displayName = 'LandingHeader';
export const LandingHeader = memo(LandingHeaderBase);
