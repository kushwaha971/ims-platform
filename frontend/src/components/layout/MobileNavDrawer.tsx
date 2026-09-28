'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { Menu } from 'lucide-react';

import { UbButton } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

const MobileNavDrawerSheet = dynamic(
  () =>
    import('src/components/layout/MobileNavDrawerSheet').then(
      (module) => module.MobileNavDrawerSheet
    ),
  { ssr: false }
);

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
 *
 * ── The sheet is its own chunk (W4-P, 28 Sep 2026) ──────────────────────────
 * vaul and the Radix dialog under it were in the chunk every `(app)` route
 * loads, desktop included, for a drawer a phone opens now and then. Only the
 * trigger is here now; the sheet (`MobileNavDrawerSheet`) is fetched on the
 * first press and stays mounted after it, so closing still animates and every
 * later open is instant. The trigger is an ordinary button rather than vaul's
 * `Drawer.Trigger` — Radix returns focus to whatever was focused when the
 * dialog opened, which is this button, so nothing about focus changed.
 */
export function MobileNavDrawer(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <UbButton
        variant="ghost"
        iconOnly
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
        className="h-11 w-11 shrink-0 text-text-secondary lg:hidden"
        icon={<Menu aria-hidden className="h-5 w-5" />}
      >
        {t('nav.open')}
      </UbButton>
      {opened && <MobileNavDrawerSheet open={open} onOpenChange={setOpen} />}
    </>
  );
}
