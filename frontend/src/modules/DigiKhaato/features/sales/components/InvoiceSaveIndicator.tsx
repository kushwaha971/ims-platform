'use client';

import { UbText } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatTimestamp } from 'src/utils/dates';

import type { AutosaveIndicator } from '../hooks/useDraftAutosave';

/**
 * SAL-06 §7 — the header's save state: Saving… / Draft saved hh:mm /
 * Offline — saved on this device / Couldn't save. A caption, never a toast:
 * autosave happens every few seconds and a toast each time would be noise.
 */
export function InvoiceSaveIndicator({
  indicator,
  savedAt,
}: Readonly<{ indicator: AutosaveIndicator; savedAt: string | null }>): React.JSX.Element | null {
  const { t } = useTranslation();
  if (indicator === 'idle') return null;
  const time = savedAt ? (formatTimestamp(savedAt).split(', ')[1] ?? '') : '';
  const copy: Record<
    Exclude<AutosaveIndicator, 'idle'>,
    { id: string; tone: 'tertiary' | 'warning' | 'formError' }
  > = {
    saving: { id: 'sales.draft.saving', tone: 'tertiary' },
    saved: { id: 'sales.draft.saved', tone: 'tertiary' },
    offline: { id: 'sales.draft.offline', tone: 'warning' },
    error: { id: 'sales.draft.error', tone: 'formError' },
    conflict: { id: 'sales.draft.conflictShort', tone: 'warning' },
  };
  const { id, tone } = copy[indicator];
  return (
    <UbText variant="caption" tone={tone} role="status" data-testid="invoice-save-indicator">
      {t(id, { time })}
    </UbText>
  );
}
