'use client';

import { UbAmount, UbBox, UbDivider, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { entryAmountView } from '../view-model/entryDisplay';
import { statementRowTitle } from '../view-model/narration';
import { isStruckThrough } from '../view-model/statementDisplay';

import type { StatementDeposit } from '../types/statement.types';

/**
 * A2 (FRD 00 PLT-X01 §7–8) — the statement's "Deposit held" block.
 *
 * Money the shop HOLDS for this party and must give back (ADR-044): a library
 * deposit, a room's security deposit. It is printed beneath the running-balance
 * table and never inside it, because a deposit is not something the party paid
 * against what they owe — counting it there would tell a customer their bill is
 * settled by money that is still theirs. So the caption says so, the amounts are
 * neutral (never the red of "you gave" or the green of "you got"), and the block
 * ends with what is held at the period's end.
 *
 * Rendered only when the server sends one (`summary.deposit`), which is only when
 * the period has a deposit line: a shop without deposits sees no change at all.
 * The same component is used on screen and on the print sheet, so the two cannot
 * disagree about a figure a customer is handed.
 */
export function DepositHeldBlock({
  deposit,
}: Readonly<{ deposit: StatementDeposit }>): React.JSX.Element {
  const { t, d } = useTranslation();

  return (
    <UbStack gap={3} data-testid="statement-deposit-block">
      <UbStack gap={1}>
        <UbText variant="h3">{t('ledger.statement.deposit.title')}</UbText>
        <UbText variant="caption" tone="tertiary">
          {t('ledger.statement.deposit.caption')}
        </UbText>
      </UbStack>
      {deposit.rows.map((row) => {
        const view = entryAmountView(row.direction, row.entryType, 'deposit');
        const struck = isStruckThrough(row);
        /* A deposit receipt with no note is titled "Deposit received", not by its
           entry type ("Payment received" would read as a payment against the bill),
           and the amount's own label is then hidden so the words are not said twice
           on screen — they stay in the accessible name (the timeline's rule). */
        const note = row.note.trim();
        const title = note ? statementRowTitle(row, t) : t(view.labelId);
        return (
          <UbBox key={row.id}>
            <UbDivider />
            <UbStack direction="row" justify="between" align="start" className="gap-3 py-2">
              <UbStack gap={1} className="min-w-0 flex-1">
                <UbText variant="caption" tone="tertiary">
                  {d(row.entryDate)}
                </UbText>
                <UbText
                  variant="body-sm"
                  className={
                    struck
                      ? 'line-clamp-2 break-words line-through opacity-60'
                      : 'line-clamp-2 break-words'
                  }
                >
                  {title}
                </UbText>
              </UbStack>
              {/* Neutral, with its words: "Deposit received" / "Deposit returned". */}
              <UbAmount
                value={row.amount}
                tone={view.tone}
                sign="none"
                label={t(view.labelId)}
                labelHidden={!note}
                size="sm"
              />
            </UbStack>
          </UbBox>
        );
      })}
      <UbDivider />
      <UbStack direction="row" justify="between" align="center" className="gap-3">
        <UbText variant="body-sm" tone="secondary">
          {t('ledger.statement.deposit.held')}
        </UbText>
        <UbAmount
          value={deposit.held}
          tone="neutral"
          sign="none"
          label={t('ledger.statement.deposit.held')}
          labelHidden
          size="sm"
        />
      </UbStack>
    </UbStack>
  );
}
