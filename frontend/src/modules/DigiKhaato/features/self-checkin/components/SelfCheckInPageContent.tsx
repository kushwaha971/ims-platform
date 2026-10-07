'use client';

import { useEffect, useId, useState } from 'react';

import { CheckCircle2 } from 'lucide-react';

import {
  UbButton,
  UbCard,
  UbEmptyState,
  UbSkeleton,
  UbStack,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import type { ApiErrorShape } from 'src/types/api.types';

import { fetchSelfCheckIn, submitSelfCheckIn } from '../redux/selfCheckinThunk';

import type { SelfCheckInResult } from '../types/selfCheckin.types';

// The words this page renders arrive with its chunk; imported in the client module,
// because a server page's imports never reach the browser.
import 'src/i18n/catalogues/selfCheckin';

/**
 * Library P0 — what a student sees after scanning the door's QR: the library's name,
 * two boxes (student number, last four digits of the mobile) and one button. Then
 * their own first name and place, or "already checked in today", or "please see the
 * desk". A wrong half says only "we could not find you" — never which half.
 */
export function SelfCheckInPageContent({ token }: Readonly<{ token: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const baseId = useId();
  const [library, setLibrary] = useState<string | null>(null);
  const [dead, setDead] = useState(false);
  const [number, setNumber] = useState('');
  const [last4, setLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorShape | null>(null);
  const [done, setDone] = useState<SelfCheckInResult | null>(null);

  useEffect(() => {
    const request = dispatch(fetchSelfCheckIn(token));
    void request.then((result) => {
      if (fetchSelfCheckIn.fulfilled.match(result)) {
        setLibrary(result.payload);
        document.title = result.payload;
      } else if (!result.meta.aborted) setDead(true);
    });
    return () => request.abort();
  }, [dispatch, token]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await dispatch(
      submitSelfCheckIn({ token, memberNumber: number, mobileLast4: last4 })
    );
    setBusy(false);
    if (submitSelfCheckIn.fulfilled.match(result)) setDone(result.payload);
    else setError(result.payload ?? null);
  };

  if (dead) {
    return (
      <UbStack className="mx-auto w-full max-w-md">
        <UbEmptyState
          variant="firstUse"
          title={t('selfCheckin.dead.title')}
          description={t('selfCheckin.dead.body')}
        />
      </UbStack>
    );
  }
  if (!library) {
    return (
      <UbStack className="mx-auto w-full max-w-md">
        <UbSkeleton variant="card" />
      </UbStack>
    );
  }
  const message =
    error?.code === 'checkin_not_found'
      ? t('selfCheckin.notFound')
      : error?.code === 'checkin_see_desk'
        ? t('selfCheckin.seeDesk')
        : error?.status === 429
          ? t('selfCheckin.tooMany')
          : error
            ? t('selfCheckin.failed')
            : null;
  return (
    <UbStack className="mx-auto w-full max-w-md" data-testid="self-checkin-page">
      <UbCard padded>
        <UbStack gap={4}>
          <UbStack gap={1}>
            <UbText as="h1" variant="h2">
              {library}
            </UbText>
            <UbText variant="body-sm" tone="secondary">
              {t('selfCheckin.subtitle')}
            </UbText>
          </UbStack>
          {done ? (
            <UbStack gap={2} align="center" data-testid="self-checkin-done">
              <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
              <UbText variant="h3" align="center">
                {t(done.already ? 'selfCheckin.already' : 'selfCheckin.welcome', {
                  name: done.firstName,
                })}
              </UbText>
              {(done.seat || done.shift) && (
                <UbText variant="body" align="center">
                  {[done.seat ? t('selfCheckin.seat', { seat: done.seat }) : '', done.shift ?? '']
                    .filter(Boolean)
                    .join(' · ')}
                </UbText>
              )}
              {done.warning && (
                <UbStatusBanner
                  tone="warning"
                  title={t('selfCheckin.warning')}
                  description={done.warning}
                />
              )}
            </UbStack>
          ) : (
            <UbStack gap={3}>
              <UbTextInput
                id={`${baseId}-number`}
                aria-label={t('selfCheckin.number')}
                placeholder={t('selfCheckin.number')}
                value={number}
                onChange={setNumber}
                autoComplete="off"
              />
              <UbTextInput
                id={`${baseId}-last4`}
                aria-label={t('selfCheckin.last4')}
                placeholder={t('selfCheckin.last4')}
                value={last4}
                onChange={(next) => setLast4(next.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                autoComplete="off"
              />
              {message && <UbStatusBanner tone="error" title={message} />}
              <UbButton
                size="lg"
                busy={busy}
                busyLabel={t('selfCheckin.working')}
                disabled={!number.trim() || last4.length !== 4}
                onClick={() => void submit()}
                data-testid="self-checkin-submit"
              >
                {t('selfCheckin.submit')}
              </UbButton>
            </UbStack>
          )}
        </UbStack>
      </UbCard>
    </UbStack>
  );
}
