'use client';

import { useEffect, useState } from 'react';

import { MessageCircle } from 'lucide-react';

import { UbActionLink, UbButton, UbDialog, UbStack, UbText } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { prepareLibraryMessage, recordLibraryMessage } from '../redux/libraryMessageThunk';

import type { MessageKind, PreparedMessage } from '../types/message.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';

/**
 * W06 — a WhatsApp message, handled like a reminder: the text is prepared and
 * shown first, the button opens WhatsApp on the library's own phone with it
 * filled in, and that tap is recorded so the desk can see who was told and
 * when. The link is ready BEFORE the tap: a window opened after a request
 * returns is a pop-up the browser blocks (the counter's slip learned this).
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

  useEffect(() => {
    const promise = dispatch(prepareLibraryMessage({ membershipId, kind }));
    void promise.then((result) => {
      if (prepareLibraryMessage.fulfilled.match(result)) setMessage(result.payload);
      else if (!result.meta.aborted)
        setRefusal(result.payload?.message ?? t('library.messages.error.prepare'));
    });
    return () => promise.abort();
  }, [dispatch, membershipId, kind, t]);

  const record = () => {
    void dispatch(recordLibraryMessage({ membershipId, kind })).then((result) => {
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
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(`library.messages.kind.${kind}`, { name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose}>
            {t('common.action.cancel')}
          </UbButton>
          {message?.recipient.hasMobile && message.waUrl && (
            <UbActionLink
              href={message.waUrl}
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
        {refusal && (
          <UbText variant="body-sm" tone="warning">
            {refusal}
          </UbText>
        )}
        {!message && !refusal && (
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
            <UbText
              variant="body-sm"
              className="whitespace-pre-line rounded-control bg-surface-sunken p-3"
            >
              {message.text}
            </UbText>
            {!message.recipient.hasMobile && (
              <UbText variant="body-sm" tone="warning">
                {t('library.messages.noMobile', { name: message.recipient.name })}
              </UbText>
            )}
          </>
        )}
      </UbStack>
    </UbDialog>
  );
}
