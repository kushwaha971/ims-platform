'use client';

import type { ReactNode } from 'react';

import 'src/i18n/catalogues/data';

/**
 * PLT-10 — the "Your data" page's own words (both languages) load with
 * `/settings/data` only.
 *
 * This used to lay a second `IntlProvider` over the shell's; since W4-P the
 * import above registers `locales/catalogues/data.{en,hi}.json` into the
 * shell's live message map when this chunk loads, the same mechanism every
 * feature's catalogue uses (`src/i18n/catalogueRegistry.ts`). The component
 * stays as the page's one obvious "these words load here" line.
 */
export function AccountDataIntlProvider({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return <>{children}</>;
}
