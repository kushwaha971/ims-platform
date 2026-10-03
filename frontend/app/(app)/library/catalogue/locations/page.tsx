'use client';

import { CatalogueManagerPageContent } from 'modules/DigiKhaato/features/library/components/CatalogueManagerPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** F03 (LIB-02 FR-8) — the library's locations. */
export default function Page(): React.JSX.Element {
  return <CatalogueManagerPageContent kind="locations" />;
}
