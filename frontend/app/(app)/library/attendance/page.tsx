'use client';

import { AttendancePageContent } from 'modules/DigiKhaato/features/library/components/AttendancePageContent';

// The words this screen renders arrive with its chunk (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/library';

/** W05 — the reading room's day register: check students in and out. */
export default function Page(): React.JSX.Element {
  return <AttendancePageContent />;
}
