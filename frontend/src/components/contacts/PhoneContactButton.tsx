'use client';

import { UbButton, UbStack, UbText } from 'src/design-system';
import { usePhoneContactPicker } from 'src/hooks/usePhoneContactPicker';
import type { PickedPhoneContact } from 'src/utils/phoneContacts';

/**
 * "Choose phone contact" — one contact the merchant picks fills a form's name
 * and mobile, and nothing is saved until they press Save (PTY-07 FR-10). Library
 * admission, the new loan and the party form share it, so the browser check,
 * the cancel that is not an error and the snackbar for a real failure are
 * written once.
 *
 * Where the browser cannot pick contacts (every desktop, iOS Safari) a screen
 * chooses between saying so — `unsupportedNote`, a disabled button with the
 * note under it — and drawing nothing, which is what the party form does: a
 * dead button on the fifteen-second path is clutter (PTY-07 FR-14).
 */
export function PhoneContactButton({
  onPick,
  label,
  errorMessage,
  unsupportedNote,
  disabled = false,
}: Readonly<{
  onPick: (contact: PickedPhoneContact) => void;
  label: string;
  errorMessage: string;
  unsupportedNote?: string;
  disabled?: boolean;
}>): React.JSX.Element | null {
  const { supported, busy, choose } = usePhoneContactPicker(onPick, errorMessage);
  if (!supported && !unsupportedNote) return null;
  return (
    <UbStack gap={2}>
      <UbButton
        variant="outlineNeutral"
        disabled={disabled || !supported}
        busy={busy}
        onClick={choose}
      >
        {label}
      </UbButton>
      {!supported && (
        <UbText variant="caption" tone="secondary">
          {unsupportedNote}
        </UbText>
      )}
    </UbStack>
  );
}
