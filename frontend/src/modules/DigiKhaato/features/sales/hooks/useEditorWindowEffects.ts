'use client';

import { useEffect } from 'react';

import { ROUTES } from 'src/routes';

/**
 * The editor's three window-level behaviours, kept out of the page so it
 * only renders:
 *  · SAL-06 — after the first server save the address names the draft, so a
 *    reload reopens it rather than a blank bill;
 *  · the dirty guard — closing the tab with unsaved typing asks first (the
 *    device copy still exists, this is the belt to its braces);
 *  · SAL-02 §7 keyboard map — Ctrl+S saves, Ctrl+Enter and F8 issue.
 */
export const useEditorWindowEffects = ({
  documentId,
  savedId,
  dirty,
  onSave,
  onIssue,
}: {
  readonly documentId: string | null;
  readonly savedId: string | null;
  readonly dirty: boolean;
  readonly onSave: () => void;
  readonly onIssue: () => void;
}): void => {
  useEffect(() => {
    if (!documentId && savedId && typeof window !== 'undefined') {
      window.history.replaceState(null, '', `${ROUTES.SALES_INVOICES}/${savedId}/edit`);
    }
  }, [documentId, savedId]);

  useEffect(() => {
    if (!dirty) return undefined;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSave();
      } else if ((mod && event.key === 'Enter') || event.key === 'F8') {
        event.preventDefault();
        onIssue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave, onIssue]);
};
