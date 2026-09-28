'use client';

import { memo, useCallback, useMemo, useState } from 'react';

import {
  UbButton,
  UbDialog,
  UbRadioGroup,
  UbStack,
  UbStatusBanner,
  UbText,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';

import { MAX_BULK_TAG_NAMES, MAX_TAGS_PER_PARTY } from '../constants/partyTags';

import { PartyTagField } from './PartyTagField';

import type { BulkTagMode, BulkTagResult } from '../api/tagService';
import type { PartyTagWithCount } from '../types/party.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/parties';

/**
 * PTY-05 FR-8 — tag a selection from the list's selection bar.
 *
 * ── Three modes, and the middle one is the dangerous one ────────────────────
 * Add keeps what is there. Remove takes these off. Replace throws away every
 * other tag on every selected party — which is a reasonable thing to want when
 * re-cutting routes for a season, and a catastrophic thing to do by accident on
 * two hundred parties. So it is never the default, it says what it will do in a
 * warning banner rather than in help text, and it is the one mode with no Undo
 * (see `usePartyBulkTag` for why the inverse cannot be built exactly).
 *
 * ── The dialog becomes the report ───────────────────────────────────────────
 * Same decision as PTY-04's bulk archive, for the same reason: "38 of 40" is a
 * number a merchant then has to go and investigate. The skipped parties and the
 * reason each was skipped are what they actually need, and a snackbar cannot
 * hold them.
 */
export interface PartyBulkTagDialogProps {
  readonly t: TranslateFn;
  readonly open: boolean;
  readonly count: number;
  readonly saving: boolean;
  readonly undoing: boolean;
  readonly undone: boolean;
  readonly result: BulkTagResult | null;
  readonly appliedMode: BulkTagMode | null;
  readonly tags: readonly PartyTagWithCount[];
  readonly onConfirm: (tagNames: readonly string[], mode: BulkTagMode) => void;
  readonly onUndo: () => void;
  readonly onClose: () => void;
}

const MODES: readonly BulkTagMode[] = ['add', 'replace', 'remove'];

function PartyBulkTagDialogBase({
  t,
  open,
  count,
  saving,
  undoing,
  undone,
  result,
  appliedMode,
  tags,
  onConfirm,
  onUndo,
  onClose,
}: Readonly<PartyBulkTagDialogProps>) {
  const [names, setNames] = useState<string[]>([]);
  const [mode, setMode] = useState<BulkTagMode>('add');

  const modeOptions = useMemo(
    () => MODES.map((value) => ({ value, label: t(`parties.tags.bulk.mode.${value}`) })),
    [t]
  );

  const handleMode = useCallback((value: string) => setMode(value as BulkTagMode), []);
  const handleConfirm = useCallback(() => onConfirm(names, mode), [onConfirm, names, mode]);
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !saving && !undoing) onClose();
    },
    [onClose, saving, undoing]
  );

  if (!open) return null;

  const done = result !== null;
  const removing = appliedMode === 'remove';
  /**
   * Nothing to say and nothing to undo.
   *
   * `updated_count` is parties CHANGED, so a merchant who adds a tag every
   * selected party already carries gets zero — which is correct, and used to
   * render as "Tagged 0 parties" over an empty box with an Undo button beside
   * it. Undo of nothing is a control that can only confuse, and "0" is a number
   * standing in for a sentence. This is that sentence.
   */
  const nothingChanged = done && result.updatedCount === 0 && result.skipped.length === 0;
  /* Replace has no exact inverse, so it is not offered one. See the hook. */
  const canUndo =
    done && !nothingChanged && appliedMode !== null && appliedMode !== 'replace' && !undone;

  const title = done
    ? nothingChanged
      ? t(removing ? 'parties.tags.bulk.noChangeRemove' : 'parties.tags.bulk.noChange')
      : removing
        ? result.updatedCount === 1
          ? t('parties.tags.bulk.doneRemovedOne')
          : t('parties.tags.bulk.doneRemoved', { count: result.updatedCount })
        : result.updatedCount === 1
          ? t('parties.tags.bulk.doneOne')
          : t('parties.tags.bulk.done', { count: result.updatedCount })
    : count === 1
      ? t('parties.tags.bulk.titleOne')
      : t('parties.tags.bulk.title', { count });

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      dismissOnBackdrop={false}
      title={title}
      closeLabel={t('common.action.close')}
      footer={
        done ? (
          <>
            {canUndo && (
              <UbButton
                variant="secondary"
                onClick={onUndo}
                busy={undoing}
                busyLabel={t('parties.tags.bulk.submitting')}
              >
                {t('parties.tags.bulk.undo')}
              </UbButton>
            )}
            <UbButton onClick={onClose} disabled={undoing}>
              {t('common.action.close')}
            </UbButton>
          </>
        ) : (
          <>
            <UbButton variant="secondary" onClick={onClose} disabled={saving}>
              {t('common.action.cancel')}
            </UbButton>
            <UbButton
              onClick={handleConfirm}
              busy={saving}
              busyLabel={t('parties.tags.bulk.submitting')}
              /* Disabled rather than hidden, because the reason is visible and
                 fixable two inches above: there are no tags chosen yet. */
              disabled={names.length === 0}
            >
              {t('parties.tags.bulk.submit')}
            </UbButton>
          </>
        )
      }
    >
      {done ? (
        <UbStack gap={2}>
          {result.skipped.length === 0 ? (
            /* A body that always says something. It used to render a single
               space when there was nothing to report, which drew a dialog with
               a title, a blank, and two buttons — the shape of a screen that is
               still loading. */
            <UbText variant="body-sm" tone="tertiary">
              {undone
                ? t('parties.tags.bulk.undone')
                : nothingChanged
                  ? t('parties.tags.bulk.noChangeBody')
                  : t(removing ? 'parties.tags.bulk.doneBodyRemove' : 'parties.tags.bulk.doneBody')}
            </UbText>
          ) : (
            <>
              <UbText variant="body-sm">
                {t('parties.tags.bulk.skipped', { count: result.skipped.length })}
              </UbText>
              {/* Named, not counted. A party skipped for carrying ten tags
                  already is a party the merchant can fix; one they were never
                  going to reach — another tenant's id, a row deleted between
                  the selection and the press — is not, and the two need
                  different words or the merchant goes looking for a problem
                  that is not theirs. */}
              {result.skipped.map((skip) => (
                <UbText key={skip.id} variant="body-sm" tone="tertiary">
                  {skip.reason === 'tag_limit_reached'
                    ? /* NAMED. "3 were skipped" over three identical fragments
                         reading "already carries 10 tags" tells a merchant that
                         something is wrong and not which party — and a party at
                         the ceiling is exactly the one they can fix, by opening
                         it and taking a tag off. The server sends the name for
                         this reason; the client cannot reliably join on ids,
                         because the list refetches underneath this dialog. */
                      t('parties.tags.bulk.skipped.tagLimitNamed', {
                        name: skip.name,
                        max: MAX_TAGS_PER_PARTY,
                      })
                    : /* No name for a party this tenant does not have — there
                         is nothing to name, and inventing a label for a row
                         they cannot see would be a leak. */
                      t('parties.tags.bulk.skipped.notFoundNamed')}
                </UbText>
              ))}
            </>
          )}
        </UbStack>
      ) : (
        <UbStack gap={4}>
          <UbStack gap={1.5}>
            <UbText as="label" variant="label" tone="secondary" htmlFor="bulk-tag-names">
              {t('parties.tags.field.label')}
            </UbText>
            {/* The same picker as the party form, with the same create-inline:
                a merchant cutting a new route does not have the tag yet, and
                sending them to the manager first is sending them away from the
                selection they just made. */}
            <PartyTagField
              id="bulk-tag-names"
              t={t}
              value={names}
              onChange={setNames}
              tags={tags}
              disabled={saving}
              /* THIS dialog's ceiling, not the party form's. Reusing the field
                 meant the picker accepted ten names while the server took five:
                 the sixth chip produced a 400 the merchant saw as "could not
                 apply those tags", with nothing pointing at which chip was the
                 problem. */
              max={MAX_BULK_TAG_NAMES}
              fullLabel={(max) => t('parties.tags.bulk.full', { max })}
            />
            <UbText variant="caption" tone="tertiary">
              {t('parties.tags.field.hint', { max: MAX_BULK_TAG_NAMES })}
            </UbText>
          </UbStack>

          <UbRadioGroup
            value={mode}
            onChange={handleMode}
            options={modeOptions}
            name="bulk-tag-mode"
            /* `ariaLabel`, not `aria-label` — see `PartyTagFormDialog`. */
            ariaLabel={t('parties.tags.bulk.mode.label')}
          />

          {/* A banner, not help text. Replace is the one irreversible thing on
              this screen and the sentence has to be impossible to skim past. */}
          {mode === 'replace' && (
            <UbStatusBanner tone="warning" title={t('parties.tags.bulk.replaceWarning')} />
          )}
        </UbStack>
      )}
    </UbDialog>
  );
}

PartyBulkTagDialogBase.displayName = 'PartyBulkTagDialog';
export const PartyBulkTagDialog = memo(PartyBulkTagDialogBase);
