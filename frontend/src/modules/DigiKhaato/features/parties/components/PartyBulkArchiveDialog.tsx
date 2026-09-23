'use client';

import { memo, useCallback, useState } from 'react';

import { UbButton, UbDialog, UbStack, UbText, UbTextInput } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { absMoney, compareMoney, formatInr } from 'src/utils/money';

import type { BulkArchiveResult } from '../api/partyService';

/**
 * FR-9's yearly clean-up: archive a selection, and say what it could not take.
 *
 * ── The dialog becomes the report ──────────────────────────────────────────
 * A partial success is the NORMAL outcome here, not the exception — any party
 * with a balance is skipped, and a merchant selecting thirty inactive parties
 * will usually have a few. "Archived 26 · 4 skipped" in a snackbar tells them
 * a number and then disappears; what they need is which four and what each one
 * owes, so that they can go and settle or chase. So the dialog does not close
 * on success: it swaps to the list.
 *
 * ── Never a write-off, and never a "skip anyway" ───────────────────────────
 * BR-10. Forgiving a debt is a decision about one person and one amount, and a
 * checkbox in a list of thirty is exactly where it would stop being one.
 */
export interface PartyBulkArchiveDialogProps {
  readonly t: TranslateFn;
  readonly open: boolean;
  readonly count: number;
  readonly saving: boolean;
  readonly result: BulkArchiveResult | null;
  readonly onConfirm: (reason: string) => void;
  readonly onClose: () => void;
}

/** Negative: the merchant owes THEM. The wording, not a sign, says so. */
const isPayable = (balance: string | null): boolean =>
  balance !== null && compareMoney(balance, '0.00') < 0;

function PartyBulkArchiveDialogBase({
  t,
  open,
  count,
  saving,
  result,
  onConfirm,
  onClose,
}: Readonly<PartyBulkArchiveDialogProps>) {
  const [reason, setReason] = useState('');
  const handleConfirm = useCallback(() => onConfirm(reason.trim()), [onConfirm, reason]);
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !saving) onClose();
    },
    [onClose, saving]
  );

  if (!open) return null;

  const done = result !== null;

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      dismissOnBackdrop={false}
      title={
        done
          ? t('parties.archive.bulk.done', {
              archived: result.archived.length,
              skipped: result.skipped.length,
            })
          : t('parties.archive.bulk.title', { count })
      }
      closeLabel={t('common.action.close')}
      footer={
        done ? (
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.close')}
          </UbButton>
        ) : (
          <>
            <UbButton variant="secondary" onClick={onClose} disabled={saving} autoFocus>
              {t('common.action.cancel')}
            </UbButton>
            <UbButton
              variant="destructive"
              onClick={handleConfirm}
              busy={saving}
              busyLabel={t('parties.archive.saving')}
            >
              {t('parties.archive.action')}
            </UbButton>
          </>
        )
      }
    >
      <UbStack gap={3}>
        {done ? (
          result.skipped.length === 0 ? (
            <UbText variant="body-sm">{t('parties.archive.bulk.allDone')}</UbText>
          ) : (
            <UbStack gap={2}>
              <UbText variant="body-sm">{t('parties.archive.bulk.skippedIntro')}</UbText>
              {result.skipped.map((row) => (
                <UbText key={row.id} variant="body-sm" tone="tertiary">
                  {row.code === 'not_found'
                    ? t('parties.archive.bulk.skip.notFound')
                    : /* The balance is why it was skipped, so the balance is
                         what the line says — a name and a reason code would
                         send the merchant back to the list to look each one up.

                         The MAGNITUDE, with the direction in the wording.
                         `formatInr(row.balance)` signs what it formats, and
                         this line first shipped reading "Naidu Agency —
                         -₹282.90 outstanding": a minus against the word
                         "outstanding", which says nothing about who owes whom.
                         §23.2.6 rule 3 again, one layer away from `UbAmount`,
                         which is where it is easy to reintroduce. */
                      t(
                        isPayable(row.balance)
                          ? 'parties.archive.bulk.skip.payable'
                          : 'parties.archive.bulk.skip.receivable',
                        {
                          name: row.name,
                          amount: formatInr(absMoney(row.balance ?? '0.00')),
                        }
                      )}
                </UbText>
              ))}
            </UbStack>
          )
        ) : (
          <UbStack gap={3}>
            <UbText variant="body-sm">{t('parties.archive.body')}</UbText>
            {/* Said before the press, not after: anyone with a balance will be
                skipped, and a merchant who knows that up front reads the result
                as the system working rather than as a partial failure. */}
            <UbText variant="body-sm" tone="tertiary">
              {t('parties.archive.bulk.skipNotice')}
            </UbText>
            <UbTextInput
              value={reason}
              onChange={setReason}
              type="text"
              maxLength={160}
              aria-label={t('parties.archive.reason')}
              placeholder={t('parties.archive.reason')}
              disabled={saving}
            />
          </UbStack>
        )}
      </UbStack>
    </UbDialog>
  );
}

PartyBulkArchiveDialogBase.displayName = 'PartyBulkArchiveDialog';
export const PartyBulkArchiveDialog = memo(PartyBulkArchiveDialogBase);
