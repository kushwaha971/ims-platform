'use client';

import { FeesPageContent } from 'modules/DigiKhaato/features/library/components/FeesPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** W03 — who has to pay, and the fee plans a student joins on. */
export default function Page(): React.JSX.Element {
  return <FeesPageContent />;
}
