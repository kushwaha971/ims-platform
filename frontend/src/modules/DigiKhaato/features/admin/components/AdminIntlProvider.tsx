'use client';

import type { ReactNode } from 'react';

import 'src/i18n/catalogues/admin';

/**
 * PLT-14 — the console's own words load with the `(admin)` routes only.
 *
 * This used to be a second `IntlProvider` laid over the shell's, which is why
 * every id the global snackbar resolves had to stay in the shell catalogue: the
 * snackbar sits above this provider. W4-P made route-local catalogues general
 * (`src/i18n/catalogueRegistry.ts`): importing `src/i18n/catalogues/admin`
 * registers the console's ~110 strings into the shell's own live message map
 * when this chunk loads, so the console, its dialogs and its toasts all
 * resolve them — and /login still downloads none of them. The component stays
 * so the console's tests and `AdminShell` keep one obvious place where the
 * catalogue is loaded; it no longer renders anything of its own.
 */
export function AdminIntlProvider({
  children,
}: Readonly<{ children: ReactNode }>): React.JSX.Element {
  return <>{children}</>;
}
