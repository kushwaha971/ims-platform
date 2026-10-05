'use client';

import { RoutesPageContent } from 'modules/DigiKhaato/features/lending/components/RoutesPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/lending';

/** Lending — collection routes. */
export default function Page(): React.JSX.Element {
  return <RoutesPageContent />;
}
