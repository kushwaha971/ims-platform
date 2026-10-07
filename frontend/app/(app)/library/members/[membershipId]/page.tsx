'use client';

import { use } from 'react';

import { MemberDetailPageContent } from 'modules/DigiKhaato/features/library/components/MemberDetailPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/payLink';

/** F04 (LIB-04 §7) — one member. */
export default function Page({
  params,
}: Readonly<{ params: Promise<{ membershipId: string }> }>): React.JSX.Element {
  const { membershipId } = use(params);
  return <MemberDetailPageContent id={membershipId} />;
}
