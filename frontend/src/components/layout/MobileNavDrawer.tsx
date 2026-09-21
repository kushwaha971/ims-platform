'use client';

import { useCallback, useState } from 'react';

import { Menu } from 'lucide-react';

import { NavSections } from 'src/components/layout/NavSections';
import { UbBox, UbLogo } from 'src/design-system';
import {
  MLDrawer,
  MLDrawerContent,
  MLDrawerTitle,
  MLDrawerTrigger,
} from 'src/design-system/primitives';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { cn } from 'src/utils/cn';

/**
 * Navigation below `lg`, where until now there was none at all.
 *
 * `UbSidebar` is `hidden … lg:flex`, and the mobile header carried the logo and
 * the tenant switcher and nothing else. `useNavigation()` has been computing a
 * `bottomNav` list the whole time and **no component consumed it**, so on a
 * phone a merchant could use the screen they landed on and reach no other except
 * by typing a URL. That is the single largest usability gap in the product, and
 * it existed because `UbDrawer` was deferred waiting for an `ml-uikit` that
 * could not be installed.
 *
 * A drawer rather than a bottom bar, for now. A bottom bar shows four
 * destinations; `useNavigation()` currently yields ten across four sections, and
 * a merchant who cannot reach Settings or Team from their phone is no better off
 * than before. The drawer carries all of them, grouped exactly as the rail
 * groups them — the same `NavSections`, so the two cannot drift.
 *
 * Closing on navigation is the behaviour a drawer needs and a rail does not;
 * `NavSections` takes `onNavigate` for precisely that. Radix handles the rest —
 * overlay click, Escape, focus trap and return, and `aria-modal` — which is most
 * of what a hand-rolled drawer gets wrong.
 */
export function MobileNavDrawer(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  const close = useCallback(() => setOpen(false), []);

  return (
    <MLDrawer open={open} onOpenChange={setOpen} direction="left">
      <MLDrawerTrigger
        aria-label={t('nav.open')}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-0 focus-visible:border focus-visible:border-border-focus lg:hidden"
      >
        <Menu aria-hidden className="h-5 w-5" />
      </MLDrawerTrigger>

      <MLDrawerContent
        // `--surface-nav` in both themes, matching the rail, so the drawer reads
        // as the same navigation rather than a second one.
        className={cn(
          'flex h-dvh w-[min(20rem,85vw)] flex-col gap-5 bg-surface-nav px-3 py-5 text-text-onNav',
          // vaul draws a horizontal grab handle at the top, which is the right
          // affordance for a bottom sheet and the wrong one here: this opens
          // from the left, so a handle suggesting a downward drag points the
          // wrong way. The edge swipe still works; only the misleading mark goes.
          '[&_[data-vaul-handle]]:hidden'
        )}
      >
        <MLDrawerTitle className="sr-only">{t('nav.primary')}</MLDrawerTitle>
        <UbBox className="px-1">
          <UbLogo variant="full" size="sm" wordmark={appName} label={appName} />
        </UbBox>
        <UbBox as="nav" aria-label={t('nav.primary')} className="min-h-0 flex-1 overflow-y-auto">
          <NavSections onNavigate={close} />
        </UbBox>
      </MLDrawerContent>
    </MLDrawer>
  );
}
