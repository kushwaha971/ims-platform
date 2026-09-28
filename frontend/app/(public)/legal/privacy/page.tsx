'use client';

import { LegalPageContent } from 'modules/DigiKhaato/features/legal/components/LegalPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/legal';

/** CR-2026-09-19-D — the document the sign-up screen's legal line links to. */
export default function PrivacyPage(): React.JSX.Element {
  return <LegalPageContent titleId="legal.privacy.title" />;
}
