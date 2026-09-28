'use client';

import { useCallback, useState } from 'react';

import dynamic from 'next/dynamic';

import { Search } from 'lucide-react';

import { UbButton } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { PartyQuickSearch } from 'modules/DigiKhaato/features/parties/components/PartyQuickSearch';
import { useCanSearchParties } from 'modules/DigiKhaato/features/parties/hooks/usePartySearch';

/**
 * W4-P — the sheet (vaul, via `UbDrawer`) is fetched on the first tap rather
 * than with every `(app)` route; see `MobileNavDrawer` for the measured reason.
 */
const UbDrawer = dynamic(
  () => import('src/design-system/UbDrawer').then((module) => module.UbDrawer),
  { ssr: false }
);

/**
 * UAT D2 (High/P1) — "find a khata" below 1024 px.
 *
 * The party search lived only in `UbAppTopBar`, which is `hidden lg:flex`, so a
 * merchant on a phone had no way to jump to "Ramesh" except by scrolling the
 * customer list. The phone header has no room for a 360 px field, so it gets a
 * 44 px search button and the button opens the SAME `PartyQuickSearch` in a
 * full-width sheet — the same component and therefore the same
 * `usePartySearch`: one debounced, abortable source, not a second fetch.
 *
 * The sheet is mounted only while open (`UbDrawer` renders nothing closed), and
 * the field takes focus as it opens, so tapping the icon brings up the keyboard
 * rather than a second tap. Choosing a party closes the sheet on the way to the
 * khata. The button is absent — not disabled — for a role that cannot read
 * parties, on exactly the rule the search itself uses.
 */
export function MobileQuickSearch(): React.JSX.Element | null {
  const { t } = useTranslation();
  const canSearch = useCanSearchParties();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  if (!canSearch) return null;

  return (
    <>
      <UbButton
        variant="ghost"
        iconOnly
        onClick={() => {
          setOpened(true);
          setOpen(true);
        }}
        className="h-11 w-11 shrink-0 text-text-secondary"
        icon={<Search aria-hidden className="h-5 w-5" />}
      >
        {t('parties.quickSearch.label')}
      </UbButton>
      {opened && (
        <UbDrawer
          open={open}
          onOpenChange={setOpen}
          title={t('parties.quickSearch.label')}
          closeLabel={t('common.action.close')}
          className="min-h-[60dvh]"
        >
          <PartyQuickSearch autoFocus inline onNavigate={close} />
        </UbDrawer>
      )}
    </>
  );
}
