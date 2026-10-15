'use client';

import { useState } from 'react';

import { CompactDialog } from 'src/components/records/CompactOverlays';
import {
  UbButton,
  UbChoiceChips,
  UbDateInput,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { recordLendingVisit } from '../redux/lendingThunk';

import type { VisitOutcome } from '../types/lending.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/lending';

const OUTCOMES: readonly VisitOutcome[] = ['not_paid', 'not_home', 'promised'];

/**
 * "Not paid today" (FRD LEN-08): a stop with no money still gets a word — not
 * paid, not at home, or promised a date — and an optional reason, so the
 * office sees the round was walked and why the money did not come.
 */
export function NotPaidDialog({
  loanId,
  name,
  today,
  onClose,
}: Readonly<{
  loanId: string;
  name: string;
  today: string;
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [outcome, setOutcome] = useState<VisitOutcome>('not_paid');
  const [reason, setReason] = useState('');
  const [promisedOn, setPromisedOn] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (outcome === 'promised' && !promisedOn) {
      setError(t('lending.visit.promised.required'));
      return;
    }
    setBusy(true);
    const result = await dispatch(
      recordLendingVisit({
        loanId,
        outcome,
        reason: reason.trim(),
        promisedOn: promisedOn ?? undefined,
      })
    );
    setBusy(false);
    if (recordLendingVisit.fulfilled.match(result)) {
      dispatch(showSnackbar({ severity: 'success', id: 'lending.visit.done', params: { name } }));
      onClose();
    } else {
      setError(result.payload?.message ?? t('lending.collect.error'));
    }
  };

  return (
    <CompactDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('lending.visit.title', { name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton onClick={() => void save()} busy={busy} data-testid="lending-visit-save">
            {t('lending.visit.save')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={3}>
        <UbChoiceChips<VisitOutcome>
          id="lending-visit-outcome"
          ariaLabel={t('lending.visit.outcome')}
          value={outcome}
          onChange={setOutcome}
          options={OUTCOMES.map((o) => ({ value: o, label: t(`lending.visit.outcome.${o}`) }))}
        />
        {outcome === 'promised' && (
          <UbDateInput
            name="lending-visit-promised"
            aria-label={t('lending.visit.promisedOn')}
            placeholder={t('lending.visit.promisedOn')}
            value={promisedOn}
            min={today}
            onChange={(value: string | null) => {
              setPromisedOn(value);
              setError('');
            }}
          />
        )}
        <UbTextInput
          id="lending-visit-reason"
          name="lending-visit-reason"
          aria-label={t('lending.visit.reason')}
          placeholder={t('lending.visit.reason.placeholder')}
          value={reason}
          onChange={setReason}
          maxLength={160}
        />
        {error && (
          <UbText variant="caption" tone="formError">
            {error}
          </UbText>
        )}
      </UbStack>
    </CompactDialog>
  );
}
