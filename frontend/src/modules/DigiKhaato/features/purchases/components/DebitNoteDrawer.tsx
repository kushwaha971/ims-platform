'use client';

import { useId, useMemo, useState } from 'react';

import { useRouter } from 'next/navigation';

import { CompactDrawer as UbDrawer } from 'src/components/records/CompactOverlays';
import {
  UbButton,
  UbDateInput,
  UbDivider,
  UbSelect,
  UbQuantityInput,
  UbStack,
  UbStatusBanner,
  UbSwitch,
  UbText,
  UbTextInput,
  isoToday,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import type { ApiErrorShape } from 'src/types/api.types';
import { formatInr } from 'src/utils/money';

import { issueDebitNote } from '../redux/purchaseBillThunk';
import {
  DEBIT_NOTE_REASONS,
  type DebitNoteReason,
  type PurchaseBill,
} from '../types/purchase.types';
import {
  returnableQty,
  shortLines,
  supplierName,
  trimQty,
} from '../view-model/purchaseBillDisplay';

// Loaded with dynamic(), so its own words come with its own chunk.
import 'src/i18n/catalogues/purchases';

/**
 * Shop P0 (PUR-07 US-1, US-2, US-6) — "Return goods" from a recorded bill: each line
 * with what it may still send back, a reason, and whether the goods leave the shelf
 * (off for a price the supplier got wrong, where nothing moves). Issued at once —
 * the server takes the stock out at the bill's cost, puts a "You will give less" on
 * the supplier's khata, and takes the amount off this bill's due; what the bill
 * cannot take stays as credit with the supplier.
 *
 * The amounts are the server's: the drawer never prices a return, because the tax
 * is the bill's own rate and its rupee discounts are shared out by the server.
 */
export function DebitNoteDrawer({
  bill,
  onClose,
}: Readonly<{ bill: PurchaseBill; onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const baseId = useId();
  const idempotency = useIdempotencyKey();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState<DebitNoteReason | ''>('');
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [date, setDate] = useState<string>(isoToday());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorShape | null>(null);

  const lines = useMemo(
    () => bill.lines.map((line) => ({ line, left: returnableQty(line, bill.links.returned) })),
    [bill.lines, bill.links.returned]
  );
  const picked = lines.filter(({ line }) => Number(qty[line.lineNo] || 0) > 0);
  const over = picked.some(({ line, left }) => Number(qty[line.lineNo]) > Number(left));
  const reasonOptions = useMemo(
    () =>
      DEBIT_NOTE_REASONS.map((value) => ({
        value,
        label: t(`purchases.debitNote.reason.${value}`),
      })),
    [t]
  );
  const short = error?.code === 'insufficient_stock' ? shortLines(error.details) : [];

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await dispatch(
      issueDebitNote({
        idempotencyKey: idempotency.key,
        against_id: bill.id,
        document_date: date,
        reason,
        reason_note: note.trim(),
        restock,
        lines: picked.map(({ line }) => ({
          bill_line_no: line.lineNo,
          qty: qty[line.lineNo] ?? '0',
        })),
      })
    );
    setBusy(false);
    if (!issueDebitNote.fulfilled.match(result)) {
      setError(result.payload ?? null);
      return;
    }
    const issued = result.payload.bill;
    dispatch(
      showSnackbar({
        severity: 'success',
        id: 'purchases.debitNote.done',
        params: { number: issued.number ?? '', amount: formatInr(issued.grandTotal) },
      })
    );
    onClose();
    router.push(`${ROUTES.DEBIT_NOTES}/${issued.id}`);
  };

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('purchases.debitNote.title', { number: bill.number ?? '' })}
      description={t('purchases.debitNote.hint', { name: supplierName(bill) })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            busy={busy}
            busyLabel={t('purchases.debitNote.working')}
            disabled={picked.length === 0 || over || !reason}
            onClick={() => void submit()}
            data-testid="debit-note-issue"
          >
            {t('purchases.debitNote.issue')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={4}>
        <UbStack gap={0} data-testid="debit-note-lines">
          {lines.map(({ line, left }, index) => {
            const value = qty[line.lineNo] ?? '';
            const tooMany = Number(value || 0) > Number(left);
            return (
              <UbStack key={line.lineNo} gap={2}>
                {index > 0 && <UbDivider />}
                <UbStack direction="row" justify="between" align="center" className="gap-3 py-2">
                  <UbStack gap={0} className="min-w-0 flex-1">
                    <UbText variant="body-sm" className="line-clamp-2">
                      {line.description}
                    </UbText>
                    <UbText
                      variant="caption"
                      tone={tooMany ? 'error' : 'tertiary'}
                      className="ds-num"
                    >
                      {t('purchases.debitNote.lineHint', {
                        bought: trimQty(line.qty),
                        left,
                        unit: line.unitCode,
                        cost: formatInr(line.unitCost),
                      })}
                    </UbText>
                  </UbStack>
                  <UbQuantityInput
                    id={`${baseId}-qty-${line.lineNo}`}
                    aria-label={t('purchases.debitNote.qtyLabel', { name: line.description })}
                    value={value}
                    onChange={(next) => setQty((current) => ({ ...current, [line.lineNo]: next }))}
                    unit={line.unitCode}
                    invalid={tooMany}
                    disabled={left === '0'}
                    placeholder="0"
                    className="w-32 shrink-0"
                  />
                </UbStack>
              </UbStack>
            );
          })}
        </UbStack>
        <UbStack gap={1}>
          <UbText variant="body-sm-medium">{t('purchases.debitNote.reasonLabel')}</UbText>
          <UbSelect
            id={`${baseId}-reason`}
            aria-label={t('purchases.debitNote.reasonLabel')}
            value={reason}
            onChange={(next) => setReason(next as DebitNoteReason)}
            options={reasonOptions}
            placeholder={t('purchases.debitNote.reasonPlaceholder')}
          />
        </UbStack>
        <UbTextInput
          id={`${baseId}-note`}
          aria-label={t('purchases.debitNote.noteLabel')}
          placeholder={t('purchases.debitNote.notePlaceholder')}
          value={note}
          onChange={setNote}
          maxLength={160}
        />
        <UbStack gap={1}>
          <UbText variant="body-sm-medium">{t('purchases.debitNote.date')}</UbText>
          <UbDateInput
            id={`${baseId}-date`}
            value={date}
            onChange={(next) => setDate(next ?? isoToday())}
            min={bill.documentDate}
            max={isoToday()}
            placeholder={t('purchases.debitNote.date')}
          />
        </UbStack>
        <UbSwitch
          id={`${baseId}-restock`}
          checked={restock}
          onCheckedChange={setRestock}
          label={t('purchases.debitNote.restock')}
          description={t(
            restock ? 'purchases.debitNote.restockOn' : 'purchases.debitNote.restockOff'
          )}
        />
        {short.length > 0 && (
          <UbStatusBanner
            tone="error"
            title={t('purchases.debitNote.shortTitle')}
            description={short
              .map((line) =>
                t('purchases.void.shortLine', { name: line.name, qty: line.after, unit: line.unit })
              )
              .join(' · ')}
          />
        )}
        {error && error.code !== 'insufficient_stock' && (
          <UbStatusBanner tone="error" title={error.message} />
        )}
      </UbStack>
    </UbDrawer>
  );
}
