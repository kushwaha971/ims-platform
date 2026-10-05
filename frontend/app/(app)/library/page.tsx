'use client';

import { LibraryHomePageContent } from 'modules/DigiKhaato/features/library/components/LibraryHomePageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** W04 — a reading room's day: seats per shift, who has to pay, what came in. */
export default function Page(): React.JSX.Element {
  return <LibraryHomePageContent />;
}
