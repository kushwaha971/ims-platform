'use client';

import { UbStatusBadge } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { stockBadge } from '../view-model/itemDisplay';

import type { StockStatus } from '../types/item.types';

/** §17.6.0 — "In stock" / "Low" / "Out of stock · −3 NOS"; nothing for untracked items. */
export function StockBadge({
  status,
  onHand,
  unitCode,
}: Readonly<{
  status: StockStatus | null;
  onHand: string | null;
  unitCode: string;
}>): React.JSX.Element | null {
  const { t } = useTranslation();
  const view = stockBadge(status, onHand, unitCode);
  if (!view) return null;
  return <UbStatusBadge tone={view.tone} label={t(view.labelId, view.params)} />;
}
