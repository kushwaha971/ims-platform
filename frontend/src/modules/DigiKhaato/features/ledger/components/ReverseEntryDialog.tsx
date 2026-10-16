'use client';

import { ReasonConfirmDialog } from 'src/components/records/ReasonConfirmDialog';
import { UbAmount, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { entryAmountView } from '../view-model/entryDisplay';
import { khataEntryTitle } from '../view-model/narration';

import type { UseEntryCorrectionResult } from '../hooks/useEntryCorrection';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/ledger';
import 'src/i18n/catalogues/money';

/**
 * LED-03 FR-2 — "Reverse this entry", and the one question it asks.
 *
 * ── Why this is a dialog and the correction is a drawer ────────────────────
 * They ask for different amounts of work. A reversal is a decision with one
 * input: the merchant has already looked at the row and knows it should not
 * exist, and all that remains is to say why. A correction is a form with six
 * fields. Putting both in a drawer would make the common one feel heavier than
 * it is; putting both in a dialog would cramp the other.
 *
 * ── Why the entry is shown again inside the dialog ─────────────────────────
 * §23's confirmation rule, and it earns its space here. The ⋯ menu that opened
 * this covered the row it belongs to, and on a phone the list has very likely
 * scrolled. A merchant confirming "reverse ₹500 to Ramesh — cement bags" is
 * confirming something; one confirming "reverse this entry" is confirming that
 * they pressed a button.
 *
 * ── Why the reason is not optional ────────────────────────────────────────
 * The reason is the feature. The mistake stays in the book for ever, and the
 * row beside it says what was done; without a reason nothing says why, and
 * "why" is the question somebody arrives with a year later. Three characters
 * is the floor — "dup" is a real answer a shopkeeper gives.
 *
 * The dialog is `ReasonConfirmDialog` (WP-03 D-04c), which applies the same
 * reason rule as the correction drawer (`reasonText`), so the two cannot
 * disagree about how short a reason may be. A reversal that fails keeps the
 * dialog open with what was typed; the shell will not close mid-request.
 */
export function ReverseEntryDialog({
  correction,
}: Readonly<{ correction: UseEntryCorrectionResult }>): React.JSX.Element | null {
  const { t, d } = useTranslation();
  const { reversing, isSaving, formErrors, close, submitReverse } = correction;

  if (!reversing) return null;

  const view = entryAmountView(
    reversing.direction,
    reversing.entryType,
    reversing.bucket,
    !!reversing.source?.adjustment
  );

  return (
    <ReasonConfirmDialog
      title={t('ledger.correction.reverse.title')}
      confirmLabel={t('ledger.correction.reverse.confirm')}
      workingLabel={t('ledger.correction.reversing')}
      reasonLabel={t('ledger.correction.reason')}
      reasonPlaceholder={t('ledger.correction.reason.placeholder')}
      reasonHint={t('ledger.correction.reason.hint')}
      requiredMessageId="ledger.correction.reason.required"
      busy={isSaving}
      onConfirm={submitReverse}
      onClose={close}
      formErrors={formErrors}
    >
      {/* The row, restated. See the component docstring. */}
      <UbStack direction="row" justify="between" align="start" className="gap-3">
        <UbStack gap={1} className="min-w-0 flex-1">
          <UbText variant="body" className="truncate">
            {khataEntryTitle(reversing, t)}
          </UbText>
          <UbText variant="caption" tone="tertiary">
            {d(reversing.entryDate)}
          </UbText>
        </UbStack>
        <UbAmount
          value={reversing.amount}
          tone={view.tone}
          sign="none"
          label={t(view.labelId)}
          size="sm"
        />
      </UbStack>

      <UbText variant="caption" tone="tertiary">
        {t('ledger.correction.reverse.body')}
      </UbText>
    </ReasonConfirmDialog>
  );
}
