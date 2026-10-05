'use client';

import { use } from 'react';

import { LoanPageContent } from 'modules/DigiKhaato/features/lending/components/LoanPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/lending';

/** Lending — one loan: terms, instalments, collections, visits. */
export default function Page({
  params,
}: Readonly<{ params: Promise<{ loanId: string }> }>): React.JSX.Element {
  const { loanId } = use(params);
  return <LoanPageContent id={loanId} />;
}
