'use client';

import { BorrowersPageContent } from 'modules/DigiKhaato/features/lending/components/BorrowersPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/lending';

/** Lending — borrowers. */
export default function Page(): React.JSX.Element {
  return <BorrowersPageContent />;
}
