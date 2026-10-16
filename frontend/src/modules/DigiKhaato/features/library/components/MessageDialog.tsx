'use client';

import { useEffect, useId, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { MessageCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';

import {
  UbActionLink,
  UbButton,
  UbField,
  UbForm,
  UbMessageBox,
  UbStack,
  UbText,
  UbTextArea,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useEditableMessage } from 'src/hooks/useEditableMessage';
import { useShareSheetLabels } from 'src/hooks/useShareSheetLabels';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { prepareLibraryMessage, recordLibraryMessage } from '../redux/libraryMessageThunk';
import { CUSTOM_MESSAGE_MAX, PERSONAL_TOKENS } from '../types/message.types';
import { useMessageSchemas } from '../validation/messageSchemas';

import { LibraryDialog } from './LibraryOverlays';

import type { CustomMessageFormValues, MessageKind, PreparedMessage } from '../types/message.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

/**
 * W06 — a WhatsApp message, handled like a reminder: the text is prepared and
 * shown first, the button opens WhatsApp on the library's own phone with it
 * filled in, and that tap is recorded so the desk can see who was told and
 * when. The link is ready BEFORE the tap: a window opened after a request
 * returns is a pop-up the browser blocks (the counter's slip learned this).
 *
 * QA F4 / B51 — a custom message asks for the desk's words first; the server
 * fills in this student's {name}, {amount}, {due_date} and {upi_link}, signs it
 * with the library's name, and the preview is what WhatsApp will open with.
 *
 * WP-04 M-08 — the prepared words sit in the shared editable box, so the desk
 * can correct a fee or receipt message before WhatsApp opens; the link carries
 * exactly what the box holds and the tap records those words (`final_text`).
 */
export function MessageDialog({
  membershipId,
  name,
  kind,
  onClose,
}: Readonly<{
  membershipId: string;
  name: string;
  kind: MessageKind;
  onClose: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [message, setMessage] = useState<PreparedMessage | null>(null);
  const [refusal, setRefusal] = useState('');
  const custom = kind === 'custom';
  // A custom message has no text until the desk writes it; every other kind is
  // prepared the moment the dialog opens.
  const [text, setText] = useState<string | null>(custom ? null : '');
  const formId = useId();
  const labels = useShareSheetLabels();
  const editable = useEditableMessage(message?.text ?? '', message?.waUrl);
  const { customSchema } = useMessageSchemas();
  const form = useForm<CustomMessageFormValues>({
    resolver: yupResolver(customSchema),
    mode: 'onTouched',
    defaultValues: { text: '' },
  });

  useEffect(() => {
    if (text === null) return undefined;
    const promise = dispatch(
      prepareLibraryMessage({ membershipId, kind, text: custom ? text : undefined })
    );
    void promise.then((result) => {
      if (prepareLibraryMessage.fulfilled.match(result)) setMessage(result.payload);
      else if (!result.meta.aborted)
        setRefusal(result.payload?.message ?? t('library.messages.error.prepare'));
    });
    return () => promise.abort();
  }, [dispatch, membershipId, kind, custom, text, t]);

  /** New words (or back to writing them): the old preview and refusal go with them. */
  const write = (next: string | null) => {
    setMessage(null);
    setRefusal('');
    setText(next);
  };

  const record = () => {
    void dispatch(
      recordLibraryMessage({
        membershipId,
        kind,
        text: custom ? (text ?? '') : undefined,
        finalText: editable.text,
      })
    ).then((result) => {
      if (recordLibraryMessage.fulfilled.match(result)) {
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'library.messages.recorded',
            params: { name: message?.recipient.name ?? name },
          })
        );
        onClose();
      } else if (result.payload) {
        dispatch(
          showSnackbar({
            severity: 'error',
            message: result.payload.message,
            requestId: result.payload.requestId,
          })
        );
      }
    });
  };

  return (
    <LibraryDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(`library.messages.kind.${kind}`, { name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.cancel')}
          </UbButton>
          {text === null && (
            <UbButton type="submit" form={formId} data-testid="library-message-prepare">
              {t('library.messages.custom.prepare')}
            </UbButton>
          )}
          {custom && text !== null && (
            <UbButton variant="secondary" onClick={() => write(null)}>
              {t('library.messages.custom.edit')}
            </UbButton>
          )}
          {message?.recipient.hasMobile && editable.href && (
            <UbActionLink
              href={editable.href}
              target="_blank"
              rel="noopener noreferrer"
              icon={<MessageCircle className="h-4 w-4" aria-hidden />}
              onClick={record}
              data-testid="library-message-send"
            >
              {t('library.messages.openWhatsApp')}
            </UbActionLink>
          )}
        </>
      }
    >
      <UbStack gap={3} data-testid="library-message">
        {text === null && (
          <UbForm id={formId} form={form} onSubmit={(values) => write(values.text.trim())}>
            <UbField
              name="text"
              label={t('library.messages.custom.label')}
              hint={t('library.messages.custom.hint', { tokens: PERSONAL_TOKENS.join(' ') })}
              required
            >
              {(field) => (
                <UbTextArea
                  {...field}
                  rows={5}
                  maxLength={CUSTOM_MESSAGE_MAX}
                  counterLabel={t('library.messages.custom.counter', {
                    count: '{count}',
                    max: '{max}',
                  })}
                />
              )}
            </UbField>
          </UbForm>
        )}
        {refusal && (
          <UbText variant="body-sm" tone="warning">
            {refusal}
          </UbText>
        )}
        {text !== null && !message && !refusal && (
          <UbText variant="body-sm" tone="tertiary">
            {t('library.messages.preparing')}
          </UbText>
        )}
        {message && (
          <>
            <UbText variant="caption" tone="tertiary">
              {message.recipient.isGuardian
                ? t('library.messages.toGuardian', { name: message.recipient.name })
                : t('library.messages.to', { name: message.recipient.name })}
            </UbText>
            <UbMessageBox
              message={message.text}
              draft={editable.draft}
              onDraftChange={editable.setDraft}
              labels={labels}
            />
            {!message.recipient.hasMobile && (
              <UbText variant="body-sm" tone="warning">
                {t('library.messages.noMobile', { name: message.recipient.name })}
              </UbText>
            )}
          </>
        )}
      </UbStack>
    </LibraryDialog>
  );
}
