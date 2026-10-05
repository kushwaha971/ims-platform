'use client';

import { SeatsPageContent } from 'modules/DigiKhaato/features/library/components/SeatsPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** W03 — the seat map: every desk, who holds it in a shift, and their fee. */
export default function Page(): React.JSX.Element {
  return <SeatsPageContent />;
}
