'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * CR-2026-09-29-SEC-A — a whole region of the app that must not offer writes.
 *
 * The one caller today is the shell during a support (impersonation) session:
 * the owner consented to a VIEW-ONLY session and the server refuses every
 * write with 403 `impersonation_forbidden`. The value is the sentence that
 * explains why; `null` (the default) means "not view only". The button
 * primitives read it and disable their primary and destructive variants and
 * every submit, titled with that sentence, so no feature has to remember the
 * session. The server stays the authority — this is only so the operator is
 * not offered buttons that are certain to fail.
 */
const UbViewOnlyContext = createContext<string | null>(null);

export interface UbViewOnlyProviderProps {
  /** Why nothing can be changed, in the reader's language; `null` to switch off. */
  readonly reason: string | null;
  readonly children: ReactNode;
}

export function UbViewOnlyProvider({
  reason,
  children,
}: UbViewOnlyProviderProps): React.JSX.Element {
  return <UbViewOnlyContext.Provider value={reason}>{children}</UbViewOnlyContext.Provider>;
}

/** The view-only reason for this subtree, or `null` when writes are offered. */
export const useUbViewOnly = (): string | null => useContext(UbViewOnlyContext);
