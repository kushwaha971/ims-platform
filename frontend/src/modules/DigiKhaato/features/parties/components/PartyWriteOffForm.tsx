'use client';

import {
  UbCheckbox,
  UbDateInput,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import type { BlockedBalance } from '../hooks/usePartyArchive';

/**
 * PTY-04 FR-3/FR-6 — the write-off form inside the archive dialog: the
 * consequence line, a required reason, the entry date and the acknowledgement.
 * State is the dialog's (its footer's button reads it); this module holds only
 * the controls, so they load when the form opens rather than with the khata.
 */
export interface PartyWriteOffFormProps {
  readonly t: TranslateFn;
  readonly name: string;
  readonly blocked: BlockedBalance;
  readonly amountText: string;
  readonly today: string;
  readonly saving: boolean;
  readonly reason: string;
  readonly onReasonChange: (value: string) => void;
  readonly entryDate: string;
  readonly onEntryDateChange: (value: string) => void;
  readonly acknowledged: boolean;
  readonly onAcknowledgedChange: (value: boolean) => void;
}

export function PartyWriteOffForm({
  t,
  name,
  blocked,
  amountText,
  today,
  saving,
  reason,
  onReasonChange,
  entryDate,
  onEntryDateChange,
  acknowledged,
  onAcknowledgedChange,
}: Readonly<PartyWriteOffFormProps>): React.JSX.Element {
  return (
    <UbStack gap={4}>
      {/* FR-6's consequence line: what the book will say afterwards, in
                the merchant's words, before they commit to it. */}
      <UbStatusBanner
        tone="warning"
        title={t(
          blocked.label === 'receivable'
            ? 'parties.writeOff.consequence.receivable'
            : 'parties.writeOff.consequence.payable',
          { amount: amountText, name }
        )}
      />
      <UbStack gap={1}>
        <UbText
          as="label"
          htmlFor="write-off-reason"
          variant="inherit"
          className="ds-body-base-medium"
        >
          {t('parties.writeOff.reason')}
        </UbText>
        <UbTextInput
          id="write-off-reason"
          value={reason}
          onChange={onReasonChange}
          type="text"
          maxLength={160}
          placeholder={t('parties.writeOff.reason.placeholder')}
          disabled={saving}
          autoComplete="off"
        />
        <UbText variant="caption" tone="tertiary">
          {t('parties.writeOff.reason.hint')}
        </UbText>
      </UbStack>
      <UbStack gap={1}>
        <UbText as="span" variant="inherit" className="ds-body-base-medium">
          {t('parties.writeOff.date')}
        </UbText>
        <UbDateInput
          name="write-off-date"
          aria-label={t('parties.writeOff.date')}
          placeholder={t('ledger.entry.date.placeholder')}
          value={entryDate}
          max={today}
          disabled={saving}
          onChange={(value: string | null) => onEntryDateChange(value ?? '')}
        />
      </UbStack>
      <UbCheckbox
        checked={acknowledged}
        onChange={onAcknowledgedChange}
        label={t('parties.writeOff.ack')}
      />
    </UbStack>
  );
}
