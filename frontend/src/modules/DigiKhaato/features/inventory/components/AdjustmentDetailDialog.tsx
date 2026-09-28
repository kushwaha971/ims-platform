'use client';

import { useEffect } from 'react';

import {
  UbButton,
  UbDialog,
  UbDivider,
  UbInfoRow,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatQuantity } from 'src/utils/quantity';

import {
  adjustmentOpened,
  adjustmentViewClosed,
  selectAdjustmentViewing,
  selectAdjustmentViewingId,
  selectAdjustmentViewingStatus,
} from '../redux/stockAdjustmentSlice';
import { fetchStockAdjustment } from '../redux/stockThunk';
import { formatSignedQuantity } from '../view-model/itemDisplay';

import { SignedAmount } from './SignedAmount';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/items';
import 'src/i18n/catalogues/movement';
import 'src/i18n/catalogues/stock';

/**
 * INV-06 FR-8/FR-9 — one posted adjustment: number, date, reason, note, who
 * posted it and every line with its before/after. Immutable, so no edit
 * control; "Post opposite adjustment" opens the drawer with every quantity
 * negated, which is how an adjustment is undone. The merchant still picks the
 * reason: why a correction happened is theirs to say, not the screen's.
 */
export function AdjustmentDetailDialog({
  canAdjust,
}: Readonly<{ canAdjust: boolean }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const id = useAppSelector(selectAdjustmentViewingId);
  const adjustment = useAppSelector(selectAdjustmentViewing);
  const status = useAppSelector(selectAdjustmentViewingStatus);

  useEffect(() => {
    if (!id) return undefined;
    const promise = dispatch(fetchStockAdjustment(id));
    return () => promise.abort();
  }, [dispatch, id]);

  const shown = adjustment && adjustment.id === id ? adjustment : null;
  const close = () => dispatch(adjustmentViewClosed());

  const postOpposite = () => {
    if (!shown) return;
    dispatch(adjustmentViewClosed());
    dispatch(
      adjustmentOpened(
        shown.lines.map((line) => ({
          itemId: line.item.id,
          itemName: line.item.name,
          unitCode: line.item.unitCode,
          allowDecimal: true,
          onHand: line.onHandAfter,
          avgCost: line.avgCostAfter,
          mode: 'by' as const,
          qty: line.qty.startsWith('-') ? line.qty.slice(1) : `-${line.qty}`,
          unitCost: line.unitCost ?? '',
        }))
      )
    );
  };

  return (
    <UbDialog
      open={Boolean(id)}
      onOpenChange={(next) => (next ? undefined : close())}
      title={shown ? shown.number : t('stock.adjust.detail.title')}
      closeLabel={t('common.action.close')}
      footer={
        canAdjust && shown ? (
          <UbButton variant="secondary" onClick={postOpposite}>
            {t('stock.adjust.detail.opposite')}
          </UbButton>
        ) : undefined
      }
    >
      {!shown || status === 'loading' ? (
        <UbSkeleton variant="text" />
      ) : (
        <UbStack gap={3}>
          <UbInfoRow
            label={t('stock.adjust.date.label')}
            value={formatBusinessDate(shown.adjustmentDate)}
          />
          <UbInfoRow
            label={t('stock.adjust.reason.label')}
            value={t(`stock.adjust.reason.${shown.reason}`)}
          />
          {shown.note && <UbInfoRow label={t('stock.adjust.note.label')} value={shown.note} />}
          <UbInfoRow
            label={t('stock.adjust.detail.postedBy')}
            value={shown.createdBy?.name ?? t('items.detail.removedUser')}
          />
          <UbDivider />
          {shown.lines.map((line) => (
            <UbStack key={line.movementId} gap={1}>
              <UbText variant="body-sm-medium">{line.item.name}</UbText>
              <UbText variant="caption" tone="tertiary" className="ds-num">
                {t('stock.adjust.detail.line', {
                  qty: formatSignedQuantity(line.qty, line.item.unitCode),
                  before: formatQuantity(line.onHandBefore, line.item.unitCode),
                  after: formatQuantity(line.onHandAfter, line.item.unitCode),
                  cost: formatInr(line.unitCost ?? '0'),
                })}
              </UbText>
            </UbStack>
          ))}
          <UbDivider />
          <UbInfoRow
            variant="total"
            label={t('stock.adjust.valueImpact')}
            value={
              <SignedAmount value={shown.valueImpactTotal} label={t('stock.adjust.valueImpact')} />
            }
          />
        </UbStack>
      )}
    </UbDialog>
  );
}
