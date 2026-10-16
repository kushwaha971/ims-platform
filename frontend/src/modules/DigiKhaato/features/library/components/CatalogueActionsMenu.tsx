'use client';

import { type ComponentType } from 'react';

import { UbMoreActions, type UbButtonSize } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { LIBRARY_OVERLAY_CLASSNAME } from './LibraryOverlays';

export interface CatalogueAction {
  readonly key: string;
  readonly label: string;
  readonly icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Absent → the item is not drawn (the viewer may not, or the state forbids it). */
  readonly action?: () => void;
}

/**
 * F03 — the catalogue pages' ⋯: the khata's `PartyHeaderMenu` pattern (a sheet,
 * not an anchored popover, one menu at every width), for the actions that are
 * housekeeping rather than the reason the page exists. Nothing to offer, no
 * button — a ⋯ that opens an empty panel teaches a merchant the app is broken.
 * The ⋯ and its sheet are `UbMoreActions` (WP-03 D-04a); this keeps the
 * library's sizing and test ids.
 */
export function CatalogueActionsMenu({
  t,
  items,
  size = 'md',
}: Readonly<{
  t: TranslateFn;
  items: readonly CatalogueAction[];
  size?: UbButtonSize;
}>): React.JSX.Element | null {
  return (
    <UbMoreActions
      label={t('library.actions.moreShort')}
      title={t('library.actions.more')}
      closeLabel={t('common.action.close')}
      size={size}
      className={
        size === 'lg'
          ? 'max-sm:h-11 max-sm:w-11'
          : size === 'sm'
            ? 'max-sm:h-7 max-sm:w-7'
            : 'max-sm:h-10 max-sm:w-10'
      }
      sheetClassName={LIBRARY_OVERLAY_CLASSNAME}
      testId="library-more"
      rows={items.map((item) => ({
        key: item.key,
        label: item.label,
        icon: <item.icon className="h-5 w-5" aria-hidden />,
        onSelect: item.action,
        testId: `library-action-${item.key}`,
      }))}
    />
  );
}
