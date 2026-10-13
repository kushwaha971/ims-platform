'use client';

import { MemberListPageContent } from 'modules/DigiKhaato/features/library/components/MemberListPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/exports';
import 'src/i18n/catalogues/library';

/** F04 (LIB-04 FR-6) — the library's members. */
export default function Page(): React.JSX.Element {
  return <MemberListPageContent />;
}
