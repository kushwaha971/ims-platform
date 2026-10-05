'use client';

import { NewLoanPageContent } from 'modules/DigiKhaato/features/lending/components/NewLoanPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/lending';
import 'src/i18n/catalogues/validation';

/** Lending — give a loan, with the schedule and its real cost shown first. */
export default function Page(): React.JSX.Element {
  return <NewLoanPageContent />;
}
