'use client';

import { useEffect, useState } from 'react';

import { UbButton, UbStack, UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { getLastRate, type LastRate, type TradeSide } from '../api/itemTradeService';

/**
 * One answer per item, party and side for as long as the page is open: a bill
 * of twenty lines re-renders its notes on every keystroke, and the answer does
 * not change while the merchant is writing the next bill.
 */
const cache = new Map<string, Promise<LastRate | null>>();

export const clearLastRateCache = (): void => cache.clear();

const lookup = (itemId: string, partyId: string, side: TradeSide): Promise<LastRate | null> => {
  const key = `${side}:${partyId}:${itemId}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = getLastRate(itemId, partyId, side).catch(() => {
      cache.delete(key);
      return null;
    });
    cache.set(key, hit);
  }
  return hit;
};

const sameRate = (a: string, b: string): boolean => Number(a || 0) === Number(b || 0);

/**
 * Shop gap §1.5, price memory — under a bill line: "Last sold to Ramesh at
 * ₹44.00 on 02/10/2026 · Use". The item's list price still fills the line when
 * it is picked (SAL-02 FR-15); this offers the rate this party actually paid
 * last time, one tap away, and goes quiet once the line carries that rate.
 */
export function LastRateNote({
  itemId,
  partyId,
  partyName,
  side,
  current,
  currentInclusive,
  onUse,
}: Readonly<{
  itemId: string;
  partyId: string;
  partyName: string;
  side: TradeSide;
  current: string;
  /** Sales only: whether the line's rate includes GST. */
  currentInclusive?: boolean;
  onUse: (last: LastRate) => void;
}>): React.JSX.Element | null {
  const { t } = useTranslation();
  const key = `${side}:${partyId}:${itemId}`;
  const [answer, setAnswer] = useState<{ key: string; last: LastRate | null } | null>(null);

  useEffect(() => {
    let live = true;
    void lookup(itemId, partyId, side).then((last) => {
      if (live) setAnswer({ key, last });
    });
    return () => {
      live = false;
    };
  }, [itemId, partyId, side, key]);

  const last = answer?.key === key ? answer.last : null;
  if (!last) return null;
  const applied =
    sameRate(last.rate, current) &&
    (side === 'purchases' || (currentInclusive ?? false) === last.taxInclusive);
  const text = t(side === 'sales' ? 'items.lastRate.sold' : 'items.lastRate.bought', {
    party: partyName,
    rate: formatInr(last.rate),
    date: formatBusinessDate(last.document.date),
  });
  return (
    <UbStack direction="row" align="center" gap={2} wrap data-testid="last-rate-note">
      <UbText variant="caption" tone="tertiary">
        {last.taxInclusive ? `${text} ${t('items.lastRate.inclusive')}` : text}
      </UbText>
      {!applied && (
        <UbButton size="sm" variant="ghost" onClick={() => onUse(last)}>
          {t('items.lastRate.use')}
        </UbButton>
      )}
    </UbStack>
  );
}
