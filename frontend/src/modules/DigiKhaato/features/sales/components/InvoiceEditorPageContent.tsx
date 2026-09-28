'use client';

import { useCallback, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Save, Send, Trash2 } from 'lucide-react';

import {
  UbButton,
  UbConfirmDialog,
  UbEmptyState,
  UbForm,
  UbGrid,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbPanel,
  UbStack,
  UbStatusBanner,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectLocale } from 'src/redux/slice/localeSlice';
import { selectActiveRole } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';

import { useDraftAutosave } from '../hooks/useDraftAutosave';
import { useEditorWindowEffects } from '../hooks/useEditorWindowEffects';
import { useInvoiceEditor } from '../hooks/useInvoiceEditor';
import { conflictResolved } from '../redux/invoiceEditorSlice';
import { deleteInvoiceDraft } from '../redux/salesThunk';
import { documentTitleId } from '../view-model/invoiceDisplay';

import { InvoiceLinesSection } from './InvoiceLinesSection';
import { InvoicePartySection } from './InvoicePartySection';
import { InvoiceSaveIndicator } from './InvoiceSaveIndicator';
import { InvoiceTotalsPanel } from './InvoiceTotalsPanel';

import type { PaymentRowForm } from '../view-model/invoiceForm';

/* The payment sheet and the success sheet load with the tap that opens them. */
const PaymentDrawerLazy = dynamic(
  () => import('./InvoicePaymentDrawer').then((m) => m.InvoicePaymentDrawer),
  { ssr: false }
);
const IssuedDialogLazy = dynamic(
  () => import('./InvoiceIssuedDialog').then((m) => m.InvoiceIssuedDialog),
  { ssr: false }
);

/**
 * SAL-02 / SAL-06 / SAL-07 — `/sales/invoices/new` and `/[id]/edit`: the
 * billing counter. Party (or walk-in) and dates on the left with the line
 * grid; the totals panel sticky on the right; Save draft (Ctrl+S) and Issue
 * (Ctrl+Enter) in the header. A walk-in pays in full through the payment
 * sheet (F8); a party bill issues on credit to the khata.
 */
export function InvoiceEditorPageContent({
  documentId,
}: Readonly<{ documentId: string | null }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const locale = useAppSelector(selectLocale);
  const role = useAppSelector(selectActiveRole);
  const editor = useInvoiceEditor(documentId);
  const autosave = useDraftAutosave(editor, documentId);
  const { form, preview, editor: server, canWrite, save, issue, values, today } = editor;
  const [paying, setPaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const context = server.context;
  const taxFree = context ? context.gstType !== 'regular' : false;
  const walkIn = values.mode === 'walkIn';
  const hasLines = preview.lines.length > 0 && values.lines.some((l) => l.itemId || l.description);
  const locked = server.issuing || !!server.issued;
  const creditBlocked = server.error?.code === 'credit_limit_exceeded';
  const mayOverride = role === 'owner' || role === 'admin';

  const finishIssue = useCallback(
    async (payment: readonly PaymentRowForm[] | null, override = false) => {
      const result = await issue(payment, override);
      if (result) {
        setPaying(false);
        autosave.clearLocal();
      }
    },
    [issue, autosave]
  );
  const startIssue = useCallback(() => {
    if (!hasLines || locked) return;
    // SAL-07 FR-3 / SAL-02 FR-10 — a walk-in pays in full; a party bill may
    // take a payment at issue or go on "Full credit" from the same sheet.
    if (preview.grandTotal !== '0.00') setPaying(true);
    else void finishIssue(null);
  }, [hasLines, locked, preview.grandTotal, finishIssue]);

  const saveNow = useCallback(() => void save(false), [save]);
  useEditorWindowEffects({
    documentId,
    savedId: server.documentId,
    dirty: autosave.dirty,
    onSave: saveNow,
    onIssue: startIssue,
  });

  if (!canWrite) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('sales.noAccess.title')}
          description={t('sales.noAccess.writeBody')}
        />
      </UbPageShell>
    );
  }
  if (!context || (documentId && server.loadStatus !== 'succeeded')) {
    return <UbPageSkeleton variant="card" />;
  }

  const title = t(
    documentTitleId(
      context.gstType === 'composition' ? 'bill_of_supply' : 'invoice',
      context.gstType
    )
  );
  return (
    <UbPageShell>
      <UbPageHeader
        title={
          documentId || server.documentId
            ? t('sales.editor.editTitle', { title })
            : t('sales.editor.newTitle', { title })
        }
        subtitle={undefined}
        controls={
          <InvoiceSaveIndicator indicator={autosave.indicator} savedAt={autosave.savedAt} />
        }
        actions={
          <>
            {server.documentId && (
              <UbButton
                variant="ghost"
                iconOnly="mobile"
                icon={<Trash2 className="h-4 w-4" aria-hidden />}
                onClick={() => setConfirmDelete(true)}
                disabled={locked}
              >
                {t('sales.editor.delete')}
              </UbButton>
            )}
            <UbButton
              variant="secondary"
              iconOnly="mobile"
              icon={<Save className="h-4 w-4" aria-hidden />}
              onClick={() => void save(false)}
              busy={server.saveState === 'saving'}
              disabled={locked}
            >
              {t('sales.editor.saveDraft')}
            </UbButton>
            <UbButton
              iconOnly="mobile"
              icon={<Send className="h-4 w-4" aria-hidden />}
              onClick={startIssue}
              busy={server.issuing}
              busyLabel={t('sales.editor.issuing')}
              disabled={!hasLines || locked}
              data-testid="invoice-issue"
            >
              {t('sales.editor.issue')}
            </UbButton>
          </>
        }
      />
      <UbForm form={form} onSubmit={() => startIssue()}>
        <UbGrid columns={{ base: 1, lg: 3 }} gap={4}>
          <UbStack gap={4} className="lg:col-span-2">
            {creditBlocked && (
              <UbStatusBanner
                tone="error"
                title={t('sales.credit.blocked')}
                description={server.error?.message}
                action={
                  mayOverride ? (
                    <UbButton
                      size="sm"
                      variant="secondary"
                      onClick={() => void finishIssue(null, true)}
                    >
                      {t('sales.credit.override')}
                    </UbButton>
                  ) : undefined
                }
              />
            )}
            <UbPanel>
              <InvoicePartySection
                form={form}
                today={today}
                tenantState={context.stateCode}
                locale={locale}
                disabled={locked}
              />
            </UbPanel>
            <InvoiceLinesSection
              form={form}
              preview={preview}
              rateOptions={context.rateOptions}
              taxFree={taxFree}
              disabled={locked}
              onSubmitShortcut={startIssue}
            />
          </UbStack>
          <InvoiceTotalsPanel
            form={form}
            preview={preview}
            taxFree={taxFree}
            rule46={server.rule46}
            warnings={server.warnings}
            disabled={locked}
          />
        </UbGrid>
      </UbForm>

      {paying && (
        <PaymentDrawerLazy
          open
          grandTotal={preview.grandTotal}
          busy={server.issuing}
          onClose={() => setPaying(false)}
          onConfirm={(rows) => void finishIssue(rows)}
          onCredit={walkIn ? undefined : () => void finishIssue(null)}
        />
      )}
      {server.issued && (
        <IssuedDialogLazy
          issued={server.issued}
          onPrint={() =>
            router.push(`${ROUTES.SALES_INVOICES}/${server.issued?.document.id}?print=1`)
          }
          onView={() => router.push(`${ROUTES.SALES_INVOICES}/${server.issued?.document.id}`)}
          onNewBill={() => {
            if (documentId) {
              router.push(`${ROUTES.SALES_INVOICES}/new`);
              return;
            }
            editor.restart();
            window.history.replaceState(null, '', `${ROUTES.SALES_INVOICES}/new`);
          }}
        />
      )}
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
        onOpenChange={setConfirmDelete}
        title={t('sales.editor.deleteTitle')}
        description={t('sales.editor.deleteBody')}
        confirmLabel={t('sales.editor.delete')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        destructive
        onConfirm={() => {
          if (!server.documentId) return;
          void dispatch(deleteInvoiceDraft(server.documentId)).then(() => {
            autosave.clearLocal();
            router.push(ROUTES.SALES_INVOICES);
          });
        }}
      />
    </UbPageShell>
  );
}
