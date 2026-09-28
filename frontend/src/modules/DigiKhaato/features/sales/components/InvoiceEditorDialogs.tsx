'use client';

import { UbConfirmDialog } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';

import { conflictResolved, type InvoiceEditorState } from '../redux/invoiceEditorSlice';

import type { UseDraftAutosaveResult } from '../hooks/useDraftAutosave';

/**
 * SAL-06 — the editor's three confirmations: restore this device's newer copy
 * (FR-3), a version conflict with another device (FR-9), and discarding the
 * draft. Split from the page so the page reads as the form; shared by the bill
 * and the estimate, which differ only in what "delete" calls.
 */
export function InvoiceEditorDialogs({
  autosave,
  server,
  confirmDelete,
  onConfirmDeleteChange,
  onDelete,
}: Readonly<{
  autosave: UseDraftAutosaveResult;
  server: InvoiceEditorState;
  confirmDelete: boolean;
  onConfirmDeleteChange: (open: boolean) => void;
  onDelete: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  return (
    <>
      <UbConfirmDialog
        open={!!autosave.restore}
        onOpenChange={(open) => !open && autosave.discardRestore()}
        title={t('sales.draft.restoreTitle')}
        description={t('sales.draft.restoreBody')}
        confirmLabel={t('sales.draft.restore')}
        cancelLabel={t('sales.draft.discard')}
        closeLabel={t('common.action.close')}
        onConfirm={autosave.acceptRestore}
      />
      <UbConfirmDialog
        open={server.saveState === 'conflict'}
        onOpenChange={(open) => {
          // "Use server version": drop this device's copy and reopen the draft as saved.
          if (open) return;
          autosave.clearLocal();
          window.location.reload();
        }}
        title={t('sales.draft.conflictTitle')}
        description={t('sales.draft.conflictBody')}
        confirmLabel={t('sales.draft.keepMine')}
        cancelLabel={t('sales.draft.useServer')}
        closeLabel={t('common.action.close')}
        onConfirm={() => {
          const current = Number(server.error?.details?.current_version ?? server.version);
          dispatch(conflictResolved({ version: current }));
        }}
      />
      <UbConfirmDialog
        open={confirmDelete}
        onOpenChange={onConfirmDeleteChange}
        title={t('sales.editor.deleteTitle')}
        description={t('sales.editor.deleteBody')}
        confirmLabel={t('sales.editor.delete')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        destructive
        onConfirm={onDelete}
      />
    </>
  );
}
