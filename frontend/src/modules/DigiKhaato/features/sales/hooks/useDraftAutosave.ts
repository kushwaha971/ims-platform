'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppSelector } from 'src/hooks/useAppStore';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import {
  isLocalNewer,
  localDraftKey,
  readLocalDraft,
  removeLocalDraft,
  writeLocalDraft,
  type LocalDraft,
} from 'src/utils/localDrafts';

import { LOCAL_AUTOSAVE_MS, SERVER_AUTOSAVE_MS } from '../constants/salesConstants';
import { isCompleteLine, type InvoiceFormValues } from '../view-model/invoiceForm';

import type { UseInvoiceEditorResult } from './useInvoiceEditor';

/**
 * SAL-06 FR-1…FR-3 — never lose a half-typed bill.
 *
 * * Every change is written to THIS device 500 ms after the last keystroke.
 * * Once the bill means something (a complete line or a chosen party) it is
 *   saved to the server 3 s after the last change while dirty, so it can be
 *   opened on another device; the header shows Saving… / Saved hh:mm /
 *   Offline — saved on this device.
 * * Opening a draft whose local copy is NEWER than the server's offers to
 *   restore it; a new bill offers the unsynced one left on this device.
 *
 * The local slot of a bill that has never reached the server is `new`; after
 * its first save the copy moves under the server id.
 */
export type AutosaveIndicator = 'idle' | 'saving' | 'saved' | 'offline' | 'error' | 'conflict';

const meaningful = (values: InvoiceFormValues): boolean =>
  !!values.partyId || (values.lines ?? []).some(isCompleteLine);

export interface UseDraftAutosaveResult {
  readonly indicator: AutosaveIndicator;
  readonly savedAt: string | null;
  readonly restore: LocalDraft<InvoiceFormValues> | null;
  readonly acceptRestore: () => void;
  readonly discardRestore: () => void;
  readonly clearLocal: () => void;
  readonly dirty: boolean;
}

export const useDraftAutosave = (
  editor: UseInvoiceEditorResult,
  documentId: string | null
): UseDraftAutosaveResult => {
  const tenant = useAppSelector(selectActiveTenant);
  const offline = useAppSelector(selectNetworkImpaired);
  const { form, values, save, editor: server } = editor;
  const tenantId = tenant?.id ?? 'none';
  const slot = server.documentId ?? documentId ?? 'new';
  const key = localDraftKey(tenantId, 'invoice', slot);
  const dirty = form.formState.isDirty;
  const [restore, setRestore] = useState<LocalDraft<InvoiceFormValues> | null>(null);
  const saving = useRef(false);
  const checked = useRef<string | null>(null);

  // FR-3 / FR-4 — offer the device's newer copy once per editor.
  const { serverUpdatedAt, loadStatus } = server;
  useEffect(() => {
    // Once per mounted editor: a new bill's first save moves the slot, and the
    // copy written under the new id a moment later must not prompt mid-typing.
    if (checked.current !== null) return undefined;
    if (documentId && loadStatus !== 'succeeded') return undefined;
    checked.current = slot;
    const local = readLocalDraft<InvoiceFormValues>(key);
    if (!local || !isLocalNewer(local, documentId ? serverUpdatedAt : null)) return undefined;
    // Deferred a tick: the prompt opens after the form has been seeded from the server.
    const timer = window.setTimeout(() => setRestore(local), 0);
    return () => window.clearTimeout(timer);
  }, [slot, key, documentId, loadStatus, serverUpdatedAt]);

  // FR-1 — the local copy, 500 ms after the last change.
  useEffect(() => {
    if (!dirty) return undefined;
    const timer = window.setTimeout(() => {
      writeLocalDraft(key, form.getValues(), server.version);
      if (slot !== 'new') removeLocalDraft(localDraftKey(tenantId, 'invoice', 'new'));
    }, LOCAL_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [values, dirty, key, form, server.version, slot, tenantId]);

  // FR-2 — the server copy, 3 s after the last change, while dirty and meaningful.
  const blocked = offline || server.saveState === 'conflict' || server.issuing || !!server.issued;
  useEffect(() => {
    if (!dirty || blocked || !meaningful(values)) return undefined;
    const timer = window.setTimeout(() => {
      if (saving.current) return;
      saving.current = true;
      void save(true).then((result) => {
        saving.current = false;
        // Keep the typed values; clear only the dirty flag so the next change re-arms.
        if (result) form.reset(form.getValues(), { keepValues: true });
      });
    }, SERVER_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [values, dirty, blocked, save, form]);

  const acceptRestore = useCallback(() => {
    if (restore) form.reset(restore.form, { keepDefaultValues: true });
    setRestore(null);
  }, [restore, form]);
  const discardRestore = useCallback(() => {
    removeLocalDraft(key);
    setRestore(null);
  }, [key]);
  /** FR-10 / §6 — issued or deleted: the device copy has done its job. */
  const clearLocal = useCallback(() => {
    removeLocalDraft(key);
    removeLocalDraft(localDraftKey(tenantId, 'invoice', 'new'));
  }, [key, tenantId]);

  const indicator: AutosaveIndicator = offline
    ? dirty
      ? 'offline'
      : 'idle'
    : server.saveState === 'saving'
      ? 'saving'
      : server.saveState === 'conflict'
        ? 'conflict'
        : server.saveState === 'error'
          ? 'error'
          : server.savedAt
            ? 'saved'
            : 'idle';

  return {
    indicator,
    savedAt: server.savedAt,
    restore,
    acceptRestore,
    discardRestore,
    clearLocal,
    dirty,
  };
};
