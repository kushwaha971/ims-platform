'use client';

import { useCallback, useState } from 'react';

import { BookOpen, Package, Wallet } from 'lucide-react';

import { ReasonConfirmDialog } from 'src/components/records/ReasonConfirmDialog';
import { UbButton, UbDialog, UbLink, UbStack, UbStatusBanner, UbText } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { formatInr, sumMoney } from 'src/utils/money';

import { originHref } from '../originLinks';
import { voidCreditNote, voidInvoice } from '../redux/salesFlowThunk';
import { voidConsequences } from '../view-model/voidConsequences';

import type { SalesDocument } from '../types/sales.types';
import type { UnallocatedPayment } from '../types/salesFlows.types';
import 'src/i18n/catalogues/sales';

const ICONS = { stock: Package, ledger: BookOpen, payment: Wallet } as const;

/**
 * SAL-05 §7 / SAL-04 FR-10 — "Void invoice INV/26-27/0042?", the consequences
 * said before the tap (FR-5), a reason of at least three characters (§10),
 * and a destructive confirm. Never "delete": the number stays and the rows
 * that undo it are new (BR-1).
 *
 * ── The payments step (FR-6 / FR-7) ──────────────────────────────────────────
 * Shown only when the void reports payments it detached (PAY-05
 * `release_document_allocations`): each receipt stays `recorded`, its amount
 * now unallocated. A party's money is an advance in their khata (given back,
 * if at all, as a "Paid out" payment); a walk-in's has no khata to sit in and
 * goes back over the counter, so the server voids that counter receipt with
 * the bill (UAT D3) and the cash book, day book and cash in hand drop it. Each
 * receipt is listed and linked, so the next step is one tap.
 *
 * ── A live credit note blocks the void (QA S-D4) ─────────────────────────────
 * The server refuses an invoice with an issued credit note against it ("Void
 * credit note CN/… first.") because the note's return and credit are still on
 * it. The rule is said up front, with a link to the note, and Void is
 * disabled — the consequence list would otherwise promise stock and khata
 * moves that ignore what the note already took back. Any other refusal is
 * shown in the dialog: a 400 is a field-level error the global snackbar
 * leaves to the screen, and this dialog has no field to hang it on.
 *
 * ── A document another module issued (A5, R55, FRD 00 PLT-X05 §7) ────────────
 * The module decides whether its document may be voided here. A refusal
 * (409 `document_origin_locked`) shows the module's own reason in place, with a
 * link to its record when the module registered one, and Void stays disabled —
 * the answer will not change until something changes over there. A question
 * (409 `document_origin_confirm`) shows the module's words and turns the button
 * into "Void anyway", which resends with `confirm_origin: true`.
 *
 * The reason step is `ReasonConfirmDialog` (WP-03 D-04c): the consequences,
 * refusals and origin banners are this file's; the reason, the footer and
 * "no closing mid-request" are the shell's.
 */
const LIVE_NOTE = (status: string): boolean => status !== 'void' && status !== 'draft';

export function VoidDocumentDialog({
  doc,
  onClose,
}: Readonly<{ doc: SalesDocument; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<readonly UnallocatedPayment[] | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [originLock, setOriginLock] = useState<string | null>(null);
  const [originQuestion, setOriginQuestion] = useState<string | null>(null);
  const credit = doc.kind === 'credit_note';
  const blocking = credit ? undefined : doc.links.creditNotes.find((n) => LIVE_NOTE(n.status));

  const submit = useCallback(
    async (reason: string) => {
      setBusy(true);
      setRefusal(null);
      const thunk = credit ? voidCreditNote : voidInvoice;
      const result = await dispatch(
        thunk({
          id: doc.id,
          reason,
          ...(originQuestion ? { confirmOrigin: true } : {}),
        })
      );
      setBusy(false);
      if (!thunk.fulfilled.match(result)) {
        // §9 — a second void (another device) is the state we wanted: say so and close.
        if (result.payload?.code === 'document_already_void') {
          onClose();
          return;
        }
        const said = (result.payload?.details ?? {}) as Readonly<Record<string, unknown>>;
        if (result.payload?.code === 'document_origin_locked') {
          setOriginQuestion(null);
          setOriginLock(String(said.reason ?? result.payload.message ?? ''));
          return;
        }
        if (result.payload?.code === 'document_origin_confirm') {
          setOriginQuestion(String(said.message ?? result.payload.message ?? ''));
          return;
        }
        const details = (result.payload?.details ?? {}) as Readonly<
          Record<string, readonly string[] | undefined>
        >;
        setRefusal(
          details.nonFieldErrors?.[0] ??
            details.non_field_errors?.[0] ??
            details.reason?.[0] ??
            result.payload?.message ??
            t('sales.void.error')
        );
        return;
      }
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'sales.void.done',
          params: { number: doc.number ?? '' },
        })
      );
      const payments = result.payload.voidResult.unallocatedPayments;
      if (payments.length) setLeft(payments);
      else onClose();
    },
    [credit, dispatch, doc.id, doc.number, onClose, originQuestion, t]
  );
  const originLink = doc.origin ? originHref(doc.origin) : null;

  if (left) {
    const total = sumMoney(left.map((row) => row.amount));
    const walkIn = left.some((row) => row.walkIn);
    const party = doc.partySnapshot?.name ?? doc.party?.name ?? '';
    return (
      <UbDialog
        open
        onOpenChange={(next) => !next && onClose()}
        title={t(walkIn ? 'sales.void.followUp.walkInTitle' : 'sales.void.followUp.advanceTitle', {
          amount: formatInr(total),
          party,
        })}
        closeLabel={t('common.action.close')}
        footer={
          <UbButton onClick={onClose} data-testid="void-follow-up-done">
            {t(walkIn ? 'sales.void.followUp.done' : 'sales.void.followUp.keep')}
          </UbButton>
        }
      >
        <UbStack gap={3}>
          <UbText variant="body-sm">
            {t(walkIn ? 'sales.void.followUp.walkInBody' : 'sales.void.followUp.advanceBody', {
              amount: formatInr(total),
              party,
            })}
          </UbText>
          <UbStack gap={1} data-testid="void-follow-up-receipts">
            <UbText variant="caption" tone="secondary">
              {t('sales.void.followUp.receipts')}
            </UbText>
            {left.map((row) => (
              <UbText key={row.paymentId ?? row.number ?? row.amount} variant="body-sm">
                {row.paymentId ? (
                  <UbLink href={`${ROUTES.PAYMENTS}/${row.paymentId}`}>{row.number}</UbLink>
                ) : (
                  row.number
                )}
                {` · ${formatInr(row.amount)}`}
              </UbText>
            ))}
          </UbStack>
        </UbStack>
      </UbDialog>
    );
  }

  const title = t(credit ? 'sales.void.titleCreditNote' : 'sales.void.title', {
    number: doc.number ?? '',
  });

  if (blocking) {
    return (
      <UbDialog
        open
        onOpenChange={(next) => !next && onClose()}
        title={title}
        closeLabel={t('common.action.close')}
        footer={
          <>
            <UbButton variant="secondary" onClick={onClose}>
              {t('common.action.cancel')}
            </UbButton>
            <UbButton variant="destructive" disabled data-testid="void-confirm">
              {t(credit ? 'sales.void.confirmCreditNote' : 'sales.void.confirm')}
            </UbButton>
          </>
        }
      >
        <UbStack gap={2} data-testid="void-blocked">
          <UbStatusBanner
            tone="warning"
            title={t('sales.void.blockedByCreditNote', { number: blocking.number ?? '' })}
            description={t('sales.void.blockedByCreditNoteBody')}
          />
          <UbLink href={`${ROUTES.SALES_CREDIT_NOTES}/${blocking.id}`}>
            {t('sales.void.openCreditNote', { number: blocking.number ?? '' })}
          </UbLink>
        </UbStack>
      </UbDialog>
    );
  }

  return (
    <ReasonConfirmDialog
      title={title}
      confirmLabel={
        originQuestion
          ? t('sales.void.confirmAnyway')
          : t(credit ? 'sales.void.confirmCreditNote' : 'sales.void.confirm')
      }
      workingLabel={t('sales.void.working')}
      reasonLabel={t('sales.void.reason')}
      reasonPlaceholder={t('sales.void.reasonPlaceholder')}
      requiredMessageId="sales.void.reasonRequired"
      busy={busy}
      onConfirm={submit}
      onClose={onClose}
      confirmDisabled={!!originLock}
      confirmTestId="void-confirm"
    >
      {refusal && <UbStatusBanner tone="error" title={refusal} />}
      {originLock && (
        <UbStack gap={2} data-testid="void-origin-locked">
          <UbStatusBanner
            tone="warning"
            title={originLock}
            description={t('sales.void.originLockedBody')}
            action={
              originLink ? (
                <UbLink href={originLink}>{t('sales.void.openOrigin')}</UbLink>
              ) : undefined
            }
          />
        </UbStack>
      )}
      {originQuestion && (
        <UbStack gap={2} data-testid="void-origin-confirm">
          <UbStatusBanner tone="warning" title={originQuestion} />
        </UbStack>
      )}
      <UbStack gap={2} data-testid="void-consequences">
        {voidConsequences(doc).map(({ key, id, values }) => {
          const Icon = ICONS[key];
          return (
            <UbStack key={key} direction="row" gap={2} align="start">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
              <UbText variant="body-sm">{t(id, values)}</UbText>
            </UbStack>
          );
        })}
      </UbStack>
    </ReasonConfirmDialog>
  );
}
