'use client';

import { CounterPageContent } from 'modules/DigiKhaato/features/library/components/CounterPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** F05 (LIB-06) — the counter: issue, return and renew at the desk. */
export default function Page(): React.JSX.Element {
  return <CounterPageContent />;
}
