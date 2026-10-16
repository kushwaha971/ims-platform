'use client';

import { useEffect, useRef, useState } from 'react';

import {
  UbActionLink,
  UbButton,
  UbMessageBox,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useEditableMessage } from 'src/hooks/useEditableMessage';
import { useShareSheetLabels } from 'src/hooks/useShareSheetLabels';
import { useTranslation } from 'src/hooks/useTranslation';
import { hasReason } from 'src/utils/reason';

import { issueSlip } from '../api/libraryCirculationService';
import { blockParams } from '../view-model/memberDisplay';

import { LibraryDialog } from './LibraryOverlays';

import type { CounterMember, CounterPrompt } from '../types/counter.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';

/**
 * F05 (LIB-06 FR-4) — an overridable refusal: the blocks in words, a one-line
 * reason, Enter. The scan is re-sent with `override_reason`; the server decides
 * again and audits the override. Its first focus is set here rather than by
 * `autoFocus` (the LED-01 lesson in CLAUDE.md).
 */
export function OverridePrompt({
  prompt,
  onClose,
  onSubmit,
}: Readonly<{
  prompt: Extract<CounterPrompt, { kind: 'override' }>;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => field.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const send = () => {
    if (!hasReason(reason)) {
      setError(t('library.counter.override.reasonRequired'));
      return;
    }
    onSubmit(reason.trim());
  };

  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.counter.override.title')}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton onClick={send} data-testid="counter-override-send">
            {t('library.counter.override')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={3}>
        {prompt.blocks.map((block) => (
          <UbText key={block.code} variant="body-sm" tone="warning">
            {t(
              `library.member.block.${block.code}`,
              blockParams({ code: block.code, overridable: true, params: block.params })
            )}
          </UbText>
        ))}
        <UbTextInput
          ref={field}
          id="library-override-reason"
          name="library-override-reason"
          aria-label={t('library.counter.override.reason')}
          placeholder={t('library.counter.override.placeholder')}
          value={reason}
          onChange={(next) => {
            setReason(next);
            setError('');
          }}
          invalid={!!error}
          maxLength={160}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              send();
            }
          }}
        />
        {error && (
          <UbText variant="caption" tone="formError">
            {error}
          </UbText>
        )}
      </UbStack>
    </LibraryDialog>
  );
}

/**
 * F05 (LIB-06 FR-11) — "Finish with Asha?": the issue slip as a prepared
 * WhatsApp text, sent from the library's own phone (DEC-012), or Done.
 *
 * WP-04 M-10 — the slip sits in the share sheet's editable box, so a wrong
 * date can be fixed or a line added before WhatsApp opens, and the link
 * carries exactly what the box holds. A blank slip offers no link. The slip is
 * a share, not a reminder: the server records nothing, so nothing is sent back.
 */
export function FinishDialog({
  member,
  onClose,
  onDone,
}: Readonly<{
  member: CounterMember;
  onClose: () => void;
  onDone: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const labels = useShareSheetLabels();
  const [slip, setSlip] = useState<{ text: string; waUrl: string; hasMobile: boolean } | null>(
    null
  );
  const editable = useEditableMessage(slip?.text ?? '', slip?.waUrl);

  useEffect(() => {
    if (member.loans.length === 0) return;
    let live = true;
    issueSlip(member.membershipId)
      .then((result) => live && setSlip(result))
      .catch(() => live && setSlip(null));
    return () => {
      live = false;
    };
  }, [member]);

  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.counter.finishWith', { name: member.name })}
      closeLabel={t('common.action.close')}
      footer={
        <UbButton onClick={onDone} data-testid="counter-done">
          {t('library.counter.done')}
        </UbButton>
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" tone="secondary">
          {t('library.member.booksOf', { count: member.loansOpen, max: member.type.maxCopies })}
        </UbText>
        {slip?.hasMobile && slip.waUrl && (
          <UbStack gap={2}>
            <UbMessageBox
              message={slip.text}
              draft={editable.draft}
              onDraftChange={editable.setDraft}
              labels={labels}
              rows={4}
            />
            {editable.href && (
              <UbActionLink
                href={editable.href}
                variant="secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('library.counter.slipWhatsApp')}
              </UbActionLink>
            )}
          </UbStack>
        )}
        {slip && !slip.hasMobile && (
          <UbText variant="caption" tone="tertiary" data-testid="counter-slip-no-mobile">
            {t('library.counter.slipNoMobile', { name: member.name })}
          </UbText>
        )}
      </UbStack>
    </LibraryDialog>
  );
}
