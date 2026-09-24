'use client';

import type { ReactNode } from 'react';

import {
  UbButton,
  UbDivider,
  UbEmptyState,
  UbLink,
  UbPanel,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import type { RequestStatus } from 'src/types/api.types';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatQuantity } from 'src/utils/quantity';

import { formatSignedQuantity, isInbound, movementLabelId } from '../view-model/itemDisplay';

import type { StockMovement } from '../types/item.types';

/**
 * INV-03 FR-2 — the movement ledger, newest ARRIVAL first, so each row's
 * running figures (on hand after, average after) read consistently down the
 * page (CR-2026-09-24-INV-A). Inbound is success-toned, outbound error-toned,
 * and the words "In"/"Out" are always there beside the colour. A row dated
 * before an earlier arrival carries "Backdated". Adjustment rows open their
 * adjustment; an opening has no link (FR-4).
 *
 * The row's title owns its line (the khata's rule): badges sit on the caption
 * underneath, never beside the title where they would squeeze it.
 */
export function ItemMovementList({
  movements,
  unitCode,
  status,
  hasMore,
  onLoadMore,
  onOpenSource,
  emptyAction,
}: Readonly<{
  movements: readonly StockMovement[];
  unitCode: string;
  status: RequestStatus;
  hasMore: boolean;
  onLoadMore: () => void;
  onOpenSource: (sourceId: string) => void;
  emptyAction?: ReactNode;
}>): React.JSX.Element {
  const { t } = useTranslation();

  if (status === 'loading' && movements.length === 0) {
    return <UbSkeleton variant="list" />;
  }
  if (movements.length === 0) {
    return (
      <UbEmptyState
        variant="firstUse"
        title={t('items.movements.empty.title')}
        description={t('items.movements.empty.body')}
        action={emptyAction}
      />
    );
  }

  return (
    <UbPanel>
      <UbStack as="ul" gap={0} data-testid="item-movements">
        {movements.map((movement, index) => {
          const inbound = isInbound(movement.qty);
          const canOpen = movement.source.type === 'stock_adjustment' && movement.source.id;
          return (
            <UbStack as="li" key={movement.id} gap={0}>
              {index > 0 && <UbDivider />}
              <UbStack direction="row" gap={3} justify="between" className="px-4 py-3">
                <UbStack gap={1} className="min-w-0 flex-1">
                  <UbText variant="body-sm-medium" className="line-clamp-2">
                    {t(movementLabelId(movement.movementType))}
                    {movement.reason ? ` · ${t(`stock.adjust.reason.${movement.reason}`)}` : ''}
                  </UbText>
                  <UbStack direction="row" gap={2} wrap align="center">
                    <UbText as="span" variant="caption" tone="tertiary">
                      {formatBusinessDate(movement.movementDate)}
                      {movement.createdBy ? ` · ${movement.createdBy.name}` : ''}
                    </UbText>
                    {canOpen && movement.source.id ? (
                      <UbLink
                        href="#"
                        variant="caption"
                        onClick={(event: React.MouseEvent) => {
                          event.preventDefault();
                          onOpenSource(movement.source.id ?? '');
                        }}
                      >
                        {movement.source.number ?? t('items.movements.viewSource')}
                      </UbLink>
                    ) : null}
                    {movement.isBackdated && (
                      <UbStatusBadge tone="info" label={t('items.movements.backdated')} />
                    )}
                    {movement.reversesId && (
                      <UbStatusBadge tone="neutral" label={t('items.movements.reversal')} />
                    )}
                  </UbStack>
                </UbStack>
                <UbStack gap={0} align="end" className="shrink-0">
                  <UbText
                    as="span"
                    variant="body-sm-medium"
                    tone={inbound ? 'success' : 'error'}
                    className="ds-num whitespace-nowrap"
                    aria-label={t(
                      inbound ? 'items.movements.inLabel' : 'items.movements.outLabel',
                      {
                        qty: formatQuantity(movement.qty.replace('-', ''), unitCode),
                      }
                    )}
                  >
                    {formatSignedQuantity(movement.qty, unitCode)}
                  </UbText>
                  <UbText
                    as="span"
                    variant="caption"
                    tone="tertiary"
                    className="ds-num whitespace-nowrap"
                  >
                    {t('items.movements.after', {
                      qty: formatQuantity(movement.onHandAfter, unitCode),
                      cost: formatInr(movement.avgCostAfter),
                    })}
                  </UbText>
                </UbStack>
              </UbStack>
            </UbStack>
          );
        })}
      </UbStack>
      {hasMore && (
        <UbStack className="px-4 py-3" align="center">
          <UbButton
            variant="secondary"
            size="sm"
            onClick={onLoadMore}
            busy={status === 'loading'}
            busyLabel={t('common.loading')}
          >
            {t('items.movements.loadMore')}
          </UbButton>
        </UbStack>
      )}
    </UbPanel>
  );
}
