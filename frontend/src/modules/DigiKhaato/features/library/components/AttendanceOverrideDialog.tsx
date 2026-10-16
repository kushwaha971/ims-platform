'use client';

import { useEffect, useRef, useState } from 'react';

import { UbButton, UbStack, UbText, UbTextInput } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

// Loaded with dynamic(), so its words come with its own chunk.
import { LibraryDialog } from './LibraryOverlays';

import 'src/i18n/catalogues/library';
import { hasReason } from 'src/utils/reason';

/**
 * W05 — a student who left or is on hold is refused at the desk. The dialog
 * says why; an owner or admin may let them in with a one-line reason, which
 * the attendance engine audits. Staff see the refusal and a Close button.
 * First focus is set here rather than by `autoFocus` (the LED-01 lesson).
 */
export function AttendanceOverrideDialog({
  name,
  reason,
  canOverride,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  name: string;
  reason: string;
  canOverride: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const [why, setWhy] = useState('');
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!canOverride) return undefined;
    const id = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [canOverride]);

  const send = () => {
    if (!hasReason(why)) {
      setError(t('library.member.reason.required'));
      return;
    }
    void onSubmit(why.trim());
  };

  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.attendance.blocked.title', { name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose}>
            {canOverride ? t('common.action.cancel') : t('common.action.close')}
          </UbButton>
          {canOverride && (
            <UbButton onClick={send} busy={busy} data-testid="attendance-override">
              {t('library.attendance.blocked.letIn')}
            </UbButton>
          )}
        </>
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" tone="warning">
          {reason}
        </UbText>
        {canOverride ? (
          <>
            <UbTextInput
              ref={field}
              id="library-attendance-override"
              name="library-attendance-override"
              aria-label={t('library.member.reason')}
              placeholder={t('library.attendance.blocked.placeholder')}
              value={why}
              onChange={(next) => {
                setWhy(next);
                setError('');
              }}
              invalid={!!error}
              maxLength={160}
            />
            {error && (
              <UbText variant="caption" tone="formError">
                {error}
              </UbText>
            )}
          </>
        ) : (
          <UbText variant="body-sm" tone="secondary">
            {t('library.attendance.blocked.askOwner')}
          </UbText>
        )}
      </UbStack>
    </LibraryDialog>
  );
}
