'use client';

import { useCallback, useState, type ComponentType } from 'react';

import { MoreHorizontal } from 'lucide-react';

import { UbButton, UbDialog, UbStack } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

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
 */
export function CatalogueActionsMenu({
  t,
  items,
}: Readonly<{ t: TranslateFn; items: readonly CatalogueAction[] }>): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const run = useCallback((action?: () => void) => {
    setOpen(false);
    action?.();
  }, []);
  const shown = items.filter((item) => item.action !== undefined);
  if (shown.length === 0) return null;

  return (
    <>
      <UbButton
        variant="outlineNeutral"
        icon={<MoreHorizontal className="h-4 w-4" aria-hidden />}
        iconOnly="mobile"
        aria-label={t('library.actions.more')}
        onClick={() => setOpen(true)}
        data-testid="library-more"
      >
        {t('library.actions.moreShort')}
      </UbButton>
      <UbDialog
        open={open}
        onOpenChange={setOpen}
        title={t('library.actions.more')}
        closeLabel={t('common.action.close')}
      >
        <UbStack gap={1}>
          {shown.map((item) => (
            <UbButton
              key={item.key}
              variant="ghost"
              fullWidth
              className="justify-start"
              icon={<item.icon className="h-4 w-4" aria-hidden />}
              onClick={() => run(item.action)}
            >
              {item.label}
            </UbButton>
          ))}
        </UbStack>
      </UbDialog>
    </>
  );
}
