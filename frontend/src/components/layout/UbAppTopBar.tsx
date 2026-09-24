'use client';

import { AccountMenu } from 'src/components/layout/AccountMenu';
import { UbBox } from 'src/design-system';

import { PartyQuickSearch } from 'modules/DigiKhaato/features/parties/components/PartyQuickSearch';

/**
 * The desktop app bar — the owner asked for a header across the top of every
 * screen. 56 px, white, a hairline under it, sticky; the page's own header
 * (title, description, actions) still starts the content beneath it.
 *
 * What is in it is what exists: the party search (the one question asked
 * from anywhere — "where is Ramesh's khata?") and the account menu with
 * Sign out and the language switch. No notification bell: notifications are
 * not built, and a bell that never rings is a feature that is not there (the
 * owner's rule: do not show what is not built).
 *
 * UAT D2 — the account menu is `AccountMenu` now, shared with the phone
 * header, because this bar is `hidden lg:flex` and was the ONLY place Sign out
 * existed. UAT D3 — `data-print="hide"`: a printed statement opened with this
 * bar, the user's name and email printed above the shop's.
 */
export function UbAppTopBar(): React.JSX.Element {
  return (
    <UbBox
      as="header"
      data-print="hide"
      className="sticky top-0 z-30 hidden h-14 shrink-0 items-center justify-between gap-6 border-b border-border-hairline bg-surface-card px-6 lg:flex"
    >
      <PartyQuickSearch className="max-w-[360px]" />
      <AccountMenu />
    </UbBox>
  );
}
