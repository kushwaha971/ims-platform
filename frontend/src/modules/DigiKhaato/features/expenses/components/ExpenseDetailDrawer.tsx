'use client';

import { useCallback, useRef } from 'react';

import {
  UbAmount,
  UbButton,
  UbDrawer,
  UbInfoRow,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  UbTag,
  isUbTagColor,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';

import { categoryLabel, modeLabelId } from '../view-model/expenseDisplay';

import { VoidExpenseDialog } from './VoidExpenseDialog';

import type { UseExpenseFormResult } from '../hooks/useExpenseForm';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/expenses';
import 'src/i18n/catalogues/money';
import 'src/i18n/catalogues/partyPicker';
import 'src/i18n/catalogues/validation';

/**
 * EXP-01 FR-10 — one expense, and the one thing that can be done to it here.
 *
 * Edit (FR-11's 24-hour window) and Duplicate are not built, so they are not
 * offered; Void is, because a wrong expense has to be withdrawable today. A
 * void keeps the row, its number and its reason on screen — the sheet swaps to
 * the Void badge in place from the server's answer (FR-12, AC-6).
 *
 * Lazily loaded by the list, with the void dialog inside it: neither is needed
 * to READ the list.
 */
export function ExpenseDetailDrawer({
  form,
}: Readonly<{ form: UseExpenseFormResult }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const voidButton = useRef<HTMLButtonElement | null>(null);
  const { detail, canVoid, closeDetail, openVoid } = form;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) closeDetail();
    },
    [closeDetail]
  );

  if (!detail) return null;
  const modeId = modeLabelId(detail.mode, detail.upiApp);
  const isVoid = detail.status === 'void';

  return (
    <>
      <UbDrawer
        open
        onOpenChange={handleOpenChange}
        title={detail.number}
        closeLabel={t('common.action.close')}
        footer={
          canVoid && !isVoid ? (
            <UbButton ref={voidButton} variant="destructive" onClick={() => openVoid(detail)}>
              {t('expenses.void.action')}
            </UbButton>
          ) : undefined
        }
      >
        <UbStack gap={4} data-testid="expense-detail">
          {isVoid && (
            <UbStatusBanner
              tone="warning"
              title={t('expenses.void.badge')}
              description={detail.voidReason ?? undefined}
            />
          )}
          <UbStack direction="row" justify="between" align="center">
            <UbAmount value={detail.amount} size="lg" />
            {isVoid ? (
              <UbStatusBadge tone="neutral" label={t('expenses.void.badge')} />
            ) : detail.paid ? (
              <UbStatusBadge tone="success" label={t('expenses.status.paid')} />
            ) : (
              <UbStatusBadge tone="warning" label={t('expenses.status.unpaid')} />
            )}
          </UbStack>
          <UbStack gap={0}>
            <UbInfoRow
              label={t('expenses.category')}
              value={
                <UbTag
                  name={categoryLabel(detail.category, t('expenses.category.archivedSuffix'))}
                  color={isUbTagColor(detail.category.color) ? detail.category.color : null}
                />
              }
            />
            <UbInfoRow label={t('expenses.date')} value={formatBusinessDate(detail.expenseDate)} />
            {modeId && <UbInfoRow label={t('expenses.mode')} value={t(modeId)} />}
            {detail.reference && (
              <UbInfoRow label={t('expenses.reference')} value={detail.reference} />
            )}
            {detail.party && (
              <UbInfoRow
                label={detail.paid ? t('expenses.paidTo') : t('expenses.owedTo')}
                value={detail.party.name}
              />
            )}
            {!detail.paid && detail.dueOn && (
              <UbInfoRow label={t('expenses.dueOn')} value={formatBusinessDate(detail.dueOn)} />
            )}
            {detail.note && <UbInfoRow label={t('expenses.note')} value={detail.note} />}
            {detail.createdBy?.name && (
              <UbInfoRow label={t('expenses.recordedBy')} value={detail.createdBy.name} />
            )}
          </UbStack>
          {!detail.paid && !isVoid && detail.party && (
            <UbStatusBanner
              tone="info"
              title={t('expenses.unpaid.khataNote', { name: detail.party.name })}
            />
          )}
        </UbStack>
      </UbDrawer>
      <VoidExpenseDialog form={form} returnFocusRef={voidButton} />
    </>
  );
}
