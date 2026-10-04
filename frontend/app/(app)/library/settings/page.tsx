'use client';

import { LibrarySettingsPageContent } from 'modules/DigiKhaato/features/library/components/LibrarySettingsPageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

/** F02 (LIB-01 §7) — the library's settings and its two counters. */
export default function Page(): React.JSX.Element {
  return <LibrarySettingsPageContent />;
}
