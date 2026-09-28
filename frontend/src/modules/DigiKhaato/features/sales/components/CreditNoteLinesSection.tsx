'use client';

import {
  UbDivider,
  UbField,
  UbGrid,
  UbPanel,
  UbQuantityInput,
  UbStack,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { remainingQty } from '../view-model/creditNoteForm';

import type { SalesDocument } from '../types/sales.types';

const trim = (qty: string): string => String(Number(qty));

/**
 * SAL-04 §7 — the return-mode lines: every line of the invoice, with what was
 * invoiced, what earlier notes already took back, and a return quantity capped
 * at the rest (FR-2). Price, discount and tax are the invoice's and are not
 * editable here (BR-1), so each row shows them as text. A fully returned line
 * is shown and locked, so the merchant sees why it cannot be returned again.
 */
export function CreditNoteLinesSection({
  invoice,
  disabled,
}: Readonly<{ invoice: SalesDocument; disabled: boolean }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbPanel>
      <UbStack gap={3} className="p-4" data-testid="credit-note-lines">
        <UbText variant="h4">{t('sales.creditNote.linesTitle')}</UbText>
        {invoice.lines.map((line, index) => {
          const left = remainingQty(line);
          return (
            <UbStack key={line.id ?? index} gap={2}>
              {index > 0 && <UbDivider />}
              <UbGrid columns={{ base: 1, sm: 3 }} gap={3}>
                <UbStack gap={0} className="min-w-0 sm:col-span-2">
                  <UbText variant="body-sm" className="line-clamp-2">
                    {line.description}
                  </UbText>
                  <UbText variant="caption" tone="tertiary" className="ds-num">
                    {t('sales.creditNote.lineCaption', {
                      invoiced: trim(line.qty),
                      returned: trim(line.returnedQty || '0'),
                      unit: line.unitCode,
                      rate: formatInr(line.unitPrice),
                    })}
                  </UbText>
                </UbStack>
                <UbField
                  name={`lines.${index}.qty`}
                  label={t('sales.creditNote.returnQty')}
                  placeholder={t('sales.creditNote.returnQtyPlaceholder', { count: String(left) })}
                  hint={left > 0 ? t('sales.creditNote.upTo', { count: String(left) }) : undefined}
                >
                  {(field) => (
                    <UbQuantityInput
                      {...field}
                      value={(field.value as string) ?? ''}
                      unit={line.unitCode}
                      decimals={/^(NOS|PCS)$/.test(line.unitCode) ? 0 : 3}
                      disabled={disabled || left === 0}
                    />
                  )}
                </UbField>
              </UbGrid>
            </UbStack>
          );
        })}
      </UbStack>
    </UbPanel>
  );
}
