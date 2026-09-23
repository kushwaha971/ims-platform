'use client';

import { memo, useCallback, useState } from 'react';

import {
  UbButton,
  UbDialog,
  UbInputHint,
  UbRadioGroup,
  UbStack,
  UbStatusBanner,
  UbTag,
  UbTextInput,
  UB_TAG_COLORS,
  isUbTagColor,
} from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';

import type { TagFormDraft } from '../hooks/usePartyTagManager';

/**
 * PTY-05 — create a tag, rename one, or change its colour.
 *
 * ── Every swatch has a NAME ─────────────────────────────────────────────────
 * R-A-2 and FRD §5, and this is the control where it is easiest to get wrong. A
 * row of eight coloured circles is a control that cannot be used by somebody
 * who cannot tell them apart, and "the third one" is not a thing a screen
 * reader says. So the picker is a radio group whose options are "Blue", "Teal",
 * "Purple" — real words, announced — with the colour shown beside each as a
 * preview chip rather than instead of it.
 *
 * `UbRadioGroup` and not a grid of buttons for the same reason: arrow keys move
 * between radios in a group, which is what somebody navigating by keyboard
 * expects of a set of mutually exclusive choices, and a grid of eight buttons
 * would need eight tab stops.
 *
 * ── A collision is an offer, not a refusal ──────────────────────────────────
 * Renaming on to a name that exists answers 409 with the other tag's id. The
 * merchant has just found out the two are the same thing; the useful move is
 * the merge, so the banner offers it rather than telling them to go and do it.
 */
export interface PartyTagFormDialogProps {
  readonly t: TranslateFn;
  readonly open: boolean;
  readonly draft: TagFormDraft | null;
  readonly saving: boolean;
  readonly error: ApiErrorShape | null;
  readonly collision: { readonly name: string; readonly id: string } | null;
  readonly canMerge: boolean;
  readonly onSave: (draft: TagFormDraft) => void;
  readonly onAcceptMerge: () => void;
  readonly onClose: () => void;
}

const NO_COLOUR = '';

function PartyTagFormDialogBase({
  t,
  open,
  draft,
  saving,
  error,
  collision,
  canMerge,
  onSave,
  onAcceptMerge,
  onClose,
}: Readonly<PartyTagFormDialogProps>) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(NO_COLOUR);
  const [loaded, setLoaded] = useState<TagFormDraft | null>(null);

  /* Adjusted DURING RENDER on a new draft, not in an effect.
   *
   * React's own "adjusting state when a prop changes" pattern, and here it is
   * not a style preference: `react-hooks/set-state-in-effect` fails the build
   * on the effect version, because an effect that calls setState synchronously
   * renders the dialog once with the previous tag's name in it before
   * correcting itself. On a dialog that is a visible flash of the wrong tag.
   *
   * The comparison is by IDENTITY, which is sound because the manager hook
   * mints a fresh draft object on every `openCreate` / `openEdit` — so
   * re-opening the same tag reloads the fields, and a re-render while the
   * merchant is typing does not.
   *
   * Only while `open`, so closing leaves the fields alone: clearing on close
   * races the closing animation and blanks them while they are still on screen.
   */
  if (open && draft !== null && draft !== loaded) {
    setLoaded(draft);
    setName(draft.name);
    setColor(draft.color ?? NO_COLOUR);
  }

  const trimmed = name.trim();
  /* The two characters the server refuses (EC-14). Checked here so the merchant
     is told while they are typing rather than after a round trip — the filter
     serialises tags as `?tag=A,B`, so a comma in a name is a filter that
     silently matches nothing. */
  const illegal = trimmed.includes(',') || trimmed.includes(';');

  const handleSave = useCallback(() => {
    if (draft === null || trimmed.length === 0 || illegal) return;
    onSave({ id: draft.id, name: trimmed, color: color === NO_COLOUR ? null : color });
  }, [color, draft, illegal, onSave, trimmed]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !saving) onClose();
    },
    [onClose, saving]
  );

  if (!open || draft === null) return null;

  const colourOptions = [
    { value: NO_COLOUR, label: t('parties.tags.form.colour.none') },
    ...UB_TAG_COLORS.map((token) => ({
      value: token as string,
      label: t(`parties.tags.colour.${token}`),
    })),
  ];

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={draft.id === null ? t('parties.tags.form.createTitle') : t('parties.tags.form.editTitle')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={saving}>
            {t('parties.tags.form.cancel')}
          </UbButton>
          <UbButton
            onClick={handleSave}
            busy={saving}
            busyLabel={t('parties.tags.form.saving')}
            disabled={trimmed.length === 0 || illegal}
          >
            {t('parties.tags.form.save')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={4}>
        {collision && (
          <UbStatusBanner
            tone="warning"
            title={t('parties.tags.form.taken', { name: collision.name })}
            action={
              /* Offered only to somebody who may merge. A staff member who can
                 assign tags but not reorganise them gets the message without a
                 button that would 403 — §19.7.5, an absent control rather than
                 a disabled one. */
              canMerge ? (
                <UbButton variant="secondary" size="sm" onClick={onAcceptMerge} busy={saving}>
                  {t('parties.tags.form.mergeInstead')}
                </UbButton>
              ) : undefined
            }
          />
        )}
        {error && !collision && <UbStatusBanner tone="error" title={error.message} />}

        <UbStack gap={1.5}>
          <UbTextInput
            value={name}
            onChange={setName}
            type="text"
            maxLength={40}
            autoFocus
            disabled={saving}
            invalid={illegal}
            aria-label={t('parties.tags.form.name')}
            placeholder={t('parties.tags.form.namePlaceholder')}
          />
          <UbInputHint>{t('parties.tags.form.nameHint')}</UbInputHint>
        </UbStack>

        <UbStack gap={1.5}>
          <UbRadioGroup
            name="tag-colour"
            value={color}
            onChange={setColor}
            options={colourOptions}
            /* `ariaLabel`, not `aria-label`. The prop is spelled the BrandHub
               way here, and passing the DOM spelling is silently accepted by
               JSX and dropped — which shipped a radio group with no accessible
               name at all, announcing as eight unlabelled radios. */
            ariaLabel={t('parties.tags.form.colour')}
          />
          <UbInputHint>{t('parties.tags.form.colourHint')}</UbInputHint>
        </UbStack>

        {/* The chip as it will actually appear, which is the only honest answer
            to "what will this look like". A swatch in a radio row is a circle;
            a merchant is choosing how a label reads beside a party's name. */}
        <UbTag
          name={trimmed || t('parties.tags.form.namePlaceholder')}
          color={isUbTagColor(color) ? color : null}
        />
      </UbStack>
    </UbDialog>
  );
}

PartyTagFormDialogBase.displayName = 'PartyTagFormDialog';
export const PartyTagFormDialog = memo(PartyTagFormDialogBase);
