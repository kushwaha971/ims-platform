'use client';

import { useCallback, useMemo } from 'react';

import { Copy } from 'lucide-react';

import {
  UbButton,
  UbDialog,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';

import { buildShareText } from '../view-model/credentialsShare';

import type { UseMembersResult } from '../hooks/useMembers';

/**
 * The one-time credentials (DEC-012).
 *
 * The password exists on the client for exactly as long as this dialog does:
 * the server keeps a hash and cannot show it again. So the dialog is honest
 * about that in a banner, before the fields, where it is read — and it says the
 * useful half too, which is that a new one can always be created. "Cannot be
 * shown again" on its own reads as "you have one chance", and a merchant who
 * believes that will photograph their screen.
 *
 * ── The primary action is "Copy message", not "Copy password" ───────────────
 * The owner's job is not to copy a password, it is to tell Ramesh how to get
 * in. Copying the password alone leaves them typing the address, the link and
 * an explanation into WhatsApp from memory, on a phone, while the only copy of
 * the password sits in a dialog behind the keyboard. The fields are still shown
 * and individually selectable for whoever wants just one of them.
 *
 * The inputs are `readOnly` and not disabled: a disabled input cannot be
 * focused, so a merchant whose clipboard permission was refused could not
 * select the text by hand — which is the exact case the fallback exists for.
 */
export function CredentialsDialog({
  members,
}: Readonly<{ members: UseMembersResult }>): React.JSX.Element | null {
  const { t, d } = useTranslation();
  const activeTenant = useAppSelector(selectActiveTenant);
  const { lastCredentials, dismissCredentials, copyShareText } = members;

  const shareText = useMemo(
    () =>
      lastCredentials
        ? buildShareText({
            credentials: lastCredentials,
            businessName: activeTenant?.name ?? '',
            translate: t,
          })
        : null,
    [lastCredentials, activeTenant, t]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) dismissCredentials();
    },
    [dismissCredentials]
  );

  const handleCopy = useCallback(() => {
    if (shareText) void copyShareText(shareText);
  }, [shareText, copyShareText]);

  if (!lastCredentials) return null;

  const { member, email, password, passwordExpiresAt } = lastCredentials;

  /**
   * They already had a DigiKhaato account, so there is no password to send and
   * there must not be one: issuing a new password for an existing account would
   * be a takeover wearing an onboarding costume. The dialog says what actually
   * happened instead of showing an empty field.
   */
  if (!password) {
    return (
      <UbDialog
        open
        onOpenChange={handleOpenChange}
        title={t('team.credentials.existing.title')}
        closeLabel={t('common.action.close')}
        footer={<UbButton onClick={dismissCredentials}>{t('team.credentials.done')}</UbButton>}
      >
        <UbText variant="body" tone="secondary">
          {t('team.credentials.existing.body', { name: member.fullName })}
        </UbText>
      </UbDialog>
    );
  }

  return (
    <UbDialog
      open
      onOpenChange={handleOpenChange}
      title={t('team.credentials.title')}
      description={t('team.credentials.body', { name: member.fullName })}
      closeLabel={t('common.action.close')}
      // A stray backdrop tap on a phone would destroy a password that cannot be
      // recovered. The merchant has to say they are done with it.
      dismissOnBackdrop={false}
      footer={<UbButton onClick={dismissCredentials}>{t('team.credentials.done')}</UbButton>}
    >
      <UbStack gap={3}>
        <UbStatusBanner tone="warning" title={t('team.credentials.once')} />

        <UbButton
          onClick={handleCopy}
          icon={<Copy aria-hidden className="h-4 w-4" />}
          data-testid="credentials-copy-message"
        >
          {t('team.credentials.copyAll')}
        </UbButton>

        {/* Visible labels, not `aria-label` alone. These were two unlabelled
            grey boxes: the merchant could see an address and a short string and
            had to infer which was which. On the one screen in the product that
            must not be misread — and whose contents are about to be typed into
            a phone by somebody else — the words are worth the vertical space.
            Sighted users were the ones being under-served, which is the usual
            sign that an `aria-label` was standing in for a label. */}
        <UbStack gap={3}>
          <UbStack gap={1}>
            <UbText variant="label" tone="secondary">
              {t('team.credentials.email.label')}
            </UbText>
            <UbTextInput
              value={email}
              // The value is the server's; this field exists to be read and
              // copied, and `onChange` is required by the control's contract.
              onChange={() => undefined}
              readOnly
              aria-label={t('team.credentials.email.label')}
              data-testid="credentials-email"
            />
          </UbStack>
          <UbStack gap={1}>
            <UbText variant="label" tone="secondary">
              {t('team.credentials.password.label')}
            </UbText>
            <UbTextInput
              value={password}
              onChange={() => undefined}
              readOnly
              aria-label={t('team.credentials.password.label')}
              data-testid="credentials-password"
            />
          </UbStack>
        </UbStack>

        <UbText variant="body-sm" tone="secondary">
          {t('team.credentials.forced')}
        </UbText>

        {passwordExpiresAt ? (
          <UbText variant="body-sm" tone="secondary">
            {/* `d()`, not `toLocaleDateString()`, which printed "9/28/2026" —
                a US format, in a product for Indian merchants, on a line whose
                whole job is to say when the password dies. */}
            {t('team.credentials.expires', { date: d(passwordExpiresAt) })}
          </UbText>
        ) : null}
      </UbStack>
    </UbDialog>
  );
}
