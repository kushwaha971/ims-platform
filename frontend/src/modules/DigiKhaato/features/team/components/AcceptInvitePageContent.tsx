'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { UbButton, UbCard, UbStack, UbStatusBanner, UbText } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { toApiError } from 'src/utils/apiError';

import { fetchSession } from 'modules/DigiKhaato/features/auth/redux/sessionThunk';

import { acceptInvitation } from '../api/invitationService';

/**
 * The destination of an invitation link (PLT-05 FR-10).
 *
 * It accepts on mount rather than behind a button. The merchant already made
 * the decision when they clicked a link addressed to them from a business they
 * know; asking "are you sure?" on arrival is a second decision about the same
 * thing. The states below are what actually needs saying.
 *
 * Failure is rendered in place, not toasted. "This invitation has expired" is an
 * explanation with a next step, and a message that disappears after four seconds
 * leaves someone staring at a blank screen with no idea what went wrong — so the
 * service call suppresses the snackbar for this one path.
 *
 * `fetchSession()` is re-dispatched on success because accepting CREATES a
 * membership: the session in the store was read before this tenant existed for
 * this user, and sending them onward with a stale `tenants[]` means the switcher
 * does not list the business they just joined.
 *
 * Route protection is the proxy's: `/accept-invite` is in
 * `SESSION_ONLY_ROUTE_PREFIXES`, so an anonymous visitor is sent to sign in with
 * `?next=` carrying the link, and arrives back here afterwards. That is why this
 * component never handles the signed-out case itself.
 */
type Phase = 'working' | 'joined' | 'failed';

export function AcceptInvitePageContent({ token }: Readonly<{ token: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('working');
  const [message, setMessage] = useState<string>('');

  /**
   * Accepting must happen exactly once per token, and a `cancelled` flag is not
   * enough to guarantee that.
   *
   * React's development double-invoke runs the effect, cleans it up, and runs it
   * again — two real POSTs. The first returns 200 and creates the membership;
   * the second returns 400 `invitation_invalid`, because the token is now spent.
   * The second is the one that lands, so a person who HAS just joined is shown
   * "this invitation cannot be used". Measured exactly that way against the live
   * server: 200 followed by three 400s, with the membership present in the
   * database the whole time.
   *
   * A flag closed over by the effect cannot help, because the second run gets a
   * fresh closure with a fresh flag. This ref survives both, keyed by the token
   * so a genuinely different link still works.
   *
   * It is not only a development concern: accepting is not idempotent, so ANY
   * double-fire — a fast refresh, a remount under Suspense — spends the link and
   * reports failure. The guard is what makes the operation safe to mount.
   */
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (attempted.current === token) return undefined;
    attempted.current = token;

    /* No `cancelled` flag. It was here, and combined with the ref guard above it
     * produced a worse bug than the one it was meant to prevent: React's
     * double-invoke cleans up the FIRST run (setting the flag) and the ref then
     * skips the SECOND, so neither ever sets a result and the screen sits on
     * "Joining this business…" forever. Measured exactly that way.
     *
     * It is also unnecessary. The ref already guarantees one request per token,
     * which is the thing that actually matters here, and since React 18 a state
     * update on an unmounted component is a silent no-op rather than a warning.
     * A guard that only exists to silence a warning React no longer emits is not
     * worth a stuck screen. */
    const run = async (): Promise<void> => {
      try {
        await acceptInvitation(token);
        // The membership is new, so the cached session predates it.
        await dispatch(fetchSession())
          .unwrap()
          .catch(() => undefined);
        setPhase('joined');
      } catch (error) {
        setMessage(toApiError(error, 'team.accept.failed').message);
        setPhase('failed');
      }
    };

    void run();
    return undefined;
  }, [dispatch, token]);

  const goToDashboard = useCallback(() => router.replace(ROUTES.DASHBOARD), [router]);
  const goToSwitch = useCallback(() => router.replace(ROUTES.SWITCH_TENANT), [router]);

  return (
    <UbCard>
      <UbStack gap={4}>
        {phase === 'working' && (
          <UbText variant="body" tone="muted">
            {t('team.accept.working')}
          </UbText>
        )}

        {phase === 'joined' && (
          <>
            <UbStatusBanner
              tone="success"
              title={t('team.accept.joinedTitle')}
              description={t('team.accept.joinedBody')}
            />
            <UbStack direction="row" gap={2}>
              <UbButton onClick={goToDashboard}>{t('team.accept.goToDashboard')}</UbButton>
              <UbButton variant="secondary" onClick={goToSwitch}>
                {t('team.accept.chooseBusiness')}
              </UbButton>
            </UbStack>
          </>
        )}

        {phase === 'failed' && (
          <>
            <UbStatusBanner
              tone="error"
              title={t('team.accept.failedTitle')}
              description={message || t('team.accept.failed')}
            />
            {/* No retry: every reason this fails — expired, revoked, already
                used, addressed to someone else — is one a retry cannot change.
                The way forward is the business asking again, so the only action
                offered is the one that works. */}
            <UbStack direction="row" gap={2}>
              <UbButton onClick={goToSwitch}>{t('team.accept.chooseBusiness')}</UbButton>
            </UbStack>
          </>
        )}
      </UbStack>
    </UbCard>
  );
}
