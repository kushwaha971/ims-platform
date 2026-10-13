'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { MessageCircle, Phone } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbCard,
  UbConfirmDialog,
  UbListItemText,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { placeLibraryMember } from '../redux/libraryMemberThunk';
import { FEE_TONE, isNonZero, shiftHours } from '../view-model/memberDisplay';

import type { SeatMapRow, SeatOccupant } from '../types/seat.types';

/** The message loads with the tap that opens it (CLAUDE.md). */
const MessageDialogLazy = dynamic(() => import('./MessageDialog').then((m) => m.MessageDialog), {
  ssr: false,
});

/**
 * QA F6 — the panel under the seat map: EVERY student on the tapped seat, in any
 * shift, whatever view the map is in. "A1 is Asha's in the morning and Imran's in
 * the evening" is the question a librarian taps a seat to answer; before, the card
 * showed only the student of the current view. Each line has the shift and its
 * hours, the plan's end, the fee, the mobile, and what the desk does next:
 * collect, message, change the seat (on the student page, where the overlap check
 * lives) or free it here.
 */
export function SeatPanel({
  seat,
  canWrite,
}: Readonly<{ seat: SeatMapRow; canWrite: boolean }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [messaging, setMessaging] = useState<SeatOccupant | null>(null);
  const [freeing, setFreeing] = useState<SeatOccupant | null>(null);
  const [busy, setBusy] = useState(false);

  const free = async () => {
    if (!freeing) return;
    setBusy(true);
    const result = await dispatch(
      placeLibraryMember({
        id: freeing.membershipId,
        version: freeing.version,
        body: { seatId: null },
      })
    );
    setBusy(false);
    if (placeLibraryMember.fulfilled.match(result)) {
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'library.seats.freed',
          params: { seat: seat.label, name: freeing.name },
        })
      );
    } else if (result.payload) {
      dispatch(
        showSnackbar({
          severity: 'error',
          message: result.payload.message,
          requestId: result.payload.requestId,
        })
      );
    }
    setFreeing(null);
  };

  return (
    <UbCard padded>
      <UbStack gap={3} data-testid="library-seat-detail">
        <UbText variant="label">{t('library.seats.detailTitle', { seat: seat.label })}</UbText>
        {seat.holders.length === 0 ? (
          <UbText variant="body-sm" tone="tertiary">
            {t('library.seats.freeAllDay')}
          </UbText>
        ) : (
          seat.holders.map((o) => (
            <UbStack
              key={o.membershipId}
              gap={2}
              className="border-b border-border-hairline pb-3 last:border-b-0 last:pb-0"
              data-testid={`library-seat-holder-${o.membershipId}`}
            >
              <UbStack direction="row" justify="between" align="start" gap={2}>
                <UbListItemText
                  primary={o.name}
                  secondary={[
                    o.memberNumber,
                    o.shift
                      ? `${o.shift.name} ${shiftHours(o.shift)}`
                      : t('library.seats.day.allDay'),
                    o.validUntil
                      ? t('library.member.validUntilOn', {
                          date: formatBusinessDate(o.validUntil),
                        })
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
                <UbStack gap={1} align="end" className="shrink-0">
                  <UbStatusBadge
                    tone={FEE_TONE[o.feeState]}
                    label={t(`library.fee.${o.feeState}`)}
                  />
                  {o.otherShift && (
                    <UbStatusBadge tone="neutral" label={t('library.seats.view.other_shift')} />
                  )}
                </UbStack>
              </UbStack>
              {o.mobile && (
                <UbActionLink
                  href={`tel:${o.mobile}`}
                  variant="ghost"
                  size="sm"
                  icon={<Phone className="h-4 w-4" aria-hidden />}
                  className="self-start"
                >
                  {o.mobile}
                </UbActionLink>
              )}
              <UbStack direction="row" gap={2} wrap>
                <UbActionLink
                  href={`${ROUTES.LIBRARY_MEMBERS}/${o.membershipId}`}
                  variant="secondary"
                  size="sm"
                >
                  {isNonZero(o.duesAmount)
                    ? t('library.seats.collect', { amount: formatInr(o.duesAmount) })
                    : t('library.seats.open')}
                </UbActionLink>
                {canWrite && (
                  <>
                    <UbButton
                      variant="secondary"
                      size="sm"
                      icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                      onClick={() => setMessaging(o)}
                    >
                      {t('library.seats.message')}
                    </UbButton>
                    <UbActionLink
                      href={`${ROUTES.LIBRARY_MEMBERS}/${o.membershipId}`}
                      variant="secondary"
                      size="sm"
                    >
                      {t('library.seats.change')}
                    </UbActionLink>
                    <UbButton
                      variant="secondary"
                      size="sm"
                      onClick={() => setFreeing(o)}
                      data-testid="library-seat-free"
                    >
                      {t('library.seats.free')}
                    </UbButton>
                  </>
                )}
              </UbStack>
            </UbStack>
          ))
        )}
      </UbStack>
      {messaging && (
        <MessageDialogLazy
          membershipId={messaging.membershipId}
          name={messaging.name}
          kind={isNonZero(messaging.duesAmount) ? 'fee' : 'custom'}
          onClose={() => setMessaging(null)}
        />
      )}
      {freeing && (
        <UbConfirmDialog
          open
          onOpenChange={(next) => !next && setFreeing(null)}
          title={t('library.seats.free.title', { seat: seat.label })}
          description={t('library.seats.free.body', { name: freeing.name, seat: seat.label })}
          confirmLabel={t('library.seats.free')}
          cancelLabel={t('common.action.cancel')}
          closeLabel={t('common.action.close')}
          onConfirm={() => void free()}
          busy={busy}
          busyLabel={t('library.working')}
        />
      )}
    </UbCard>
  );
}
