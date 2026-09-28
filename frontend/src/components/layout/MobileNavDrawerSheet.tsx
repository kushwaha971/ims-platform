'use client';

import { NavSections } from 'src/components/layout/NavSections';
import { UbBox, UbLogo } from 'src/design-system';
import { MLDrawer, MLDrawerContent, MLDrawerTitle } from 'src/design-system/primitives';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectAppName } from 'src/redux/slice/whiteLabelSlice';
import { cn } from 'src/utils/cn';

/**
 * The navigation drawer's sheet — vaul and its Radix dialog — in its own chunk,
 * fetched when the hamburger is first pressed (W4-P). `MobileNavDrawer` keeps
 * the trigger, which is all a screen paints; see there.
 */
export function MobileNavDrawerSheet({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const appName = useAppSelector(selectAppName);

  return (
    <MLDrawer open={open} onOpenChange={onOpenChange} direction="left">
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
          <NavSections onNavigate={() => onOpenChange(false)} />
        </UbBox>
      </MLDrawerContent>
    </MLDrawer>
  );
}
