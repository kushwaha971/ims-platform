'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import {
  UbButton,
  UbCombobox,
  UbDialog,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';

import type { PartyTagWithCount } from '../types/party.types';

/**
 * PTY-05 FR-10 — fold one tag into another.
 *
 * ── The consequence line is the whole dialog ────────────────────────────────
 * A merge is one-directional and deletes its source (BR-6), and "Merge Camp
 * into Camp Area?" gives a merchant nothing to check their intent against. The
 * sentence states the arithmetic — how many parties move, and which tag stops
 * existing — before the press, and the snackbar states it again afterwards so
 * the two can be compared.
 *
 * The number is the source's own count, which is an upper bound rather than the
 * exact figure: parties that already carry the target are skipped, and only the
 * server knows how many that is. Saying "up to" would be more precise and less
 * useful — the merchant is deciding whether this is the right pair of tags, not
 * auditing a total, and the result reports the split when it lands.
 *
 * ── `UbCombobox`, single-select ─────────────────────────────────────────────
 * Exactly one target, from a closed list of tags that already exist. This is
 * the one tag control in PTY-05 with no create-inline: merging into a tag that
 * does not exist yet is a rename, and there is a rename two rows up.
 */
export interface PartyTagMergeDialogProps {
  readonly t: TranslateFn;
  readonly open: boolean;
  readonly source: PartyTagWithCount | null;
  readonly tags: readonly PartyTagWithCount[];
  readonly saving: boolean;
  readonly error: ApiErrorShape | null;
  readonly onMerge: (intoId: string) => void;
  readonly onClose: () => void;
}

function PartyTagMergeDialogBase({
  t,
  open,
  source,
  tags,
  saving,
  error,
  onMerge,
  onClose,
}: Readonly<PartyTagMergeDialogProps>) {
  const [intoId, setIntoId] = useState<string | null>(null);

  const options = useMemo(
    () =>
      tags
        /* A tag cannot be merged into itself — the server refuses it, and
           offering it here would be a choice whose only outcome is an error. */
        .filter((tag) => tag.id !== source?.id)
        .map((tag) => ({ value: tag.id, label: tag.name })),
    [tags, source]
  );

  const target = useMemo(() => tags.find((tag) => tag.id === intoId), [tags, intoId]);

  const handleMerge = useCallback(() => {
    if (intoId) onMerge(intoId);
  }, [intoId, onMerge]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !saving) {
        setIntoId(null);
        onClose();
      }
    },
    [onClose, saving]
  );

  if (!open || source === null) return null;

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={t('parties.tags.merge.title', { name: source.name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={saving}>
            {t('parties.tags.form.cancel')}
          </UbButton>
          <UbButton
            variant="destructive"
            onClick={handleMerge}
            busy={saving}
            busyLabel={t('parties.tags.merge.submitting')}
            disabled={!intoId}
          >
            {t('parties.tags.merge.submit')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={4}>
        {error && <UbStatusBanner tone="error" title={error.message} />}

        <UbCombobox
          value={intoId}
          onChange={setIntoId}
          options={options}
          aria-label={t('parties.tags.merge.target')}
          placeholder={t('parties.tags.merge.targetPlaceholder')}
          searchPlaceholder={t('parties.tags.filter.search')}
          emptyLabel={t('parties.tags.filter.empty')}
          disabled={saving}
        />

        {target && (
          <UbText variant="body-sm">
            {t(
              source.partyCount === 1
                ? 'parties.tags.merge.consequenceOne'
                : 'parties.tags.merge.consequence',
              { moving: source.partyCount, target: target.name, name: source.name }
            )}
          </UbText>
        )}
      </UbStack>
    </UbDialog>
  );
}

PartyTagMergeDialogBase.displayName = 'PartyTagMergeDialog';
export const PartyTagMergeDialog = memo(PartyTagMergeDialogBase);
