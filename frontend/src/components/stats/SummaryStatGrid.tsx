'use client';

import type { ReactNode } from 'react';

import { UbStatGrid } from 'src/design-system/charts';
import { useTranslation } from 'src/hooks/useTranslation';

/**
 * `UbStatGrid` folded into one summary line with "Details" (owner, 6 Oct
 * 2026: the cards above a list took the space the list needed). The design
 * system cannot translate, so this supplies the two words; `storageKey`
 * remembers each screen's choice on this device.
 */
export function SummaryStatGrid({
  storageKey,
  children,
  live,
  label,
  className,
}: Readonly<{
  storageKey: string;
  children: ReactNode;
  live?: boolean;
  label?: string;
  className?: string;
}>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <UbStatGrid
      live={live}
      label={label}
      className={className}
      collapse={{
        storageKey,
        labels: { show: t('common.summary.show'), hide: t('common.summary.hide') },
      }}
    >
      {children}
    </UbStatGrid>
  );
}
