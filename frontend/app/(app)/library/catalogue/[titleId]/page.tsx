'use client';

import { use } from 'react';

import { TitleDetailPageContent } from 'modules/DigiKhaato/features/library/components/TitleDetailPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** F03 (LIB-02 FR-11) — one title and its copies. */
export default function Page({
  params,
}: Readonly<{ params: Promise<{ titleId: string }> }>): React.JSX.Element {
  const { titleId } = use(params);
  return <TitleDetailPageContent id={titleId} />;
}
