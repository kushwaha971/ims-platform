'use client';

import { useCallback } from 'react';

import { Copy } from 'lucide-react';

import {
  UbButton,
  UbDialog,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import type { UseInvitationsResult } from '../hooks/useInvitations';

/**
 * The one-time invitation link.
 *
 * `accept_url` exists on the client for exactly as long as this dialog does:
 * the server keeps a hash of the token and cannot show the link again, and
 * there is no "resend" endpoint at MVP. So the screen has to be honest about
 * that rather than quietly relying on the merchant to notice — the warning
 * banner says it in one sentence, before the field, where it is read.
 *
 * Borrowed from BrandHub's `InviteSentModal`, which solves the same problem for
 * customer invitations: the link in a read-only field, a copy control beside
 * it, and a single acknowledging action rather than a Cancel — there is nothing
 * to cancel, the invitation has already been sent.
 *
 * The field is `readOnly` and not disabled: a disabled input cannot be focused,
 * so a merchant whose clipboard permission was refused could not select the
 * text by hand — which is the exact case the fallback exists for.
 */
export function InviteLinkDialog({
  invitations,
}: Readonly<{ invitations: UseInvitationsResult }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { lastInvite, dismissInviteLink, copyInviteLink } = invitations;

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) dismissInviteLink();
    },
    [dismissInviteLink]
  );

  const handleCopy = useCallback(() => {
    void copyInviteLink();
  }, [copyInviteLink]);

  if (!lastInvite) return null;

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={t('team.link.title')}
      description={t('team.link.body', { email: lastInvite.email })}
      closeLabel={t('common.action.close')}
      // A stray backdrop tap on a phone would destroy a link that cannot be
      // recovered. The merchant has to say they are done with it.
      dismissOnBackdrop={false}
      footer={
        <UbButton onClick={dismissInviteLink}>{t('team.link.done')}</UbButton>
      }
    >
      <UbStack gap={3}>
        <UbStatusBanner tone="warning" title={t('team.link.once')} />

        {lastInvite.acceptUrl ? (
          <UbStack gap={2}>
            <UbTextInput
              value={lastInvite.acceptUrl}
              // The value is the server's; this field exists to be read and
              // copied, and `onChange` is required by the control's contract.
              onChange={() => undefined}
              readOnly
              aria-label={t('team.link.label')}
              data-testid="invite-accept-url"
            />
            <UbButton
              variant="secondary"
              onClick={handleCopy}
              icon={<Copy aria-hidden className="h-4 w-4" />}
            >
              {t('common.action.copy')}
            </UbButton>
          </UbStack>
        ) : (
          /**
           * The 201 arrived without a link. It is not a failure — the
           * invitation exists and the email has been sent — but the merchant
           * asked for something to pass on, so the screen says which of the two
           * happened instead of showing an empty box.
           */
          <UbText variant="body-sm" tone="secondary">
            {t('team.link.absent')}
          </UbText>
        )}
      </UbStack>
    </UbDialog>
  );
}
