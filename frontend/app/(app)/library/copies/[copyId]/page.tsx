'use client';

import { use } from 'react';

import { CopyDetailPageContent } from 'modules/DigiKhaato/features/library/components/CopyDetailPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** F03 (LIB-02 FR-11) — one copy and its history. */
export default function Page({
  params,
}: Readonly<{ params: Promise<{ copyId: string }> }>): React.JSX.Element {
  const { copyId } = use(params);
  return <CopyDetailPageContent id={copyId} />;
}
