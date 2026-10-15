'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { Armchair, MessageCircle } from 'lucide-react';

import {
  UbActionLink,
  UbAvatar,
  UbButton,
  UbConfirmDialog,
  UbLink,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';
import { formatPhoneForDisplay } from 'src/utils/share';

import { placeLibraryMember } from '../redux/libraryMemberThunk';
import { FEE_TONE, isNonZero, shiftHours } from '../view-model/memberDisplay';

import { CatalogueActionsMenu } from './CatalogueActionsMenu';

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
  admissionHref,
  onOpenMember,
}: Readonly<{
  seat: SeatMapRow;
  canWrite: boolean;
  admissionHref?: string;
  onOpenMember?: (id: string) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const canCollect = hasModule('payments') && can('payments.payment.write');
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
    <UbStack gap={4}>
      <UbStack gap={3} data-testid="library-seat-detail">
        {seat.zone && (
          <UbText variant="body-sm" tone="tertiary">
            {seat.zone}
          </UbText>
        )}
        {canWrite && admissionHref && (
          <UbActionLink
            href={admissionHref}
            variant={seat.holders.length === 0 ? 'primary' : 'secondary'}
            className="self-start"
          >
            {t('library.members.add')}
          </UbActionLink>
        )}
        {seat.holders.length === 0 ? (
          <UbText variant="body-sm" tone="tertiary">
            {t('library.seats.freeAllDay')}
          </UbText>
        ) : (
          seat.holders.map((o) => (
            <UbStack
              key={o.membershipId}
              gap={3}
              className="rounded-card border border-border-hairline bg-surface-card p-4 shadow-1"
              data-testid={`library-seat-holder-${o.membershipId}`}
            >
              <UbStack direction="row" justify="between" align="start" gap={2}>
                <UbAvatar name={o.name} className="bg-primary-50 text-text-accent" />
                <UbStack gap={0} className="min-w-0 flex-1">
                  <UbText variant="body-medium" className="break-words">
                    {o.name}
                  </UbText>
                  {o.mobile ? (
                    <UbLink
                      href={`tel:${o.mobile}`}
                      variant="caption"
                      tone="secondary"
                      underline={false}
                      className="ub-hit self-start"
                    >
                      {formatPhoneForDisplay(o.mobile)}
                    </UbLink>
                  ) : (
                    <UbText variant="caption" tone="tertiary">
                      {o.memberNumber}
                    </UbText>
                  )}
                </UbStack>
                <UbStack gap={1} align="end" className="shrink-0">
                  <UbStatusBadge
                    tone={FEE_TONE[o.feeState]}
                    label={
                      isNonZero(o.duesAmount)
                        ? t('library.fee.amountDue', { amount: formatInr(o.duesAmount) })
                        : t(`library.fee.${o.feeState}`)
                    }
                  />
                  {o.otherShift && (
                    <UbStatusBadge tone="neutral" label={t('library.seats.view.other_shift')} />
                  )}
                </UbStack>
              </UbStack>
              <UbStack className="grid grid-cols-2 gap-3 border-t border-border-hairline pt-3">
                <UbStack gap={1}>
                  <UbText variant="caption" tone="tertiary">
                    {t('library.enrol.shift')}
                  </UbText>
                  <UbText variant="body-sm-medium">
                    {o.shift?.name || t('library.seats.day.allDay')}
                  </UbText>
                  {o.shift && (
                    <UbText variant="caption" tone="secondary">
                      {shiftHours(o.shift)}
                    </UbText>
                  )}
                </UbStack>
                <UbStack gap={1}>
                  <UbText variant="caption" tone="tertiary">
                    {t('library.member.validUntil')}
                  </UbText>
                  <UbText variant="body-sm-medium">
                    {o.validUntil ? formatBusinessDate(o.validUntil) : t('library.member.noExpiry')}
                  </UbText>
                </UbStack>
              </UbStack>
              <UbStack direction="row" gap={2} wrap>
                <UbActionLink
                  href={`${ROUTES.LIBRARY_MEMBERS}/${o.membershipId}`}
                  onClick={(event) => {
                    if (
                      onOpenMember &&
                      !event.metaKey &&
                      !event.ctrlKey &&
                      !event.shiftKey &&
                      !event.altKey
                    ) {
                      event.preventDefault();
                      onOpenMember(o.membershipId);
                    }
                  }}
                  variant={canCollect && isNonZero(o.duesAmount) ? 'primary' : 'secondary'}
                  size="sm"
                >
                  {canCollect && isNonZero(o.duesAmount)
                    ? t('library.seats.collect', { amount: formatInr(o.duesAmount) })
                    : t('library.seats.open')}
                </UbActionLink>
                {canWrite && (
                  <>
                    <UbButton
                      variant="outlineNeutral"
                      size="sm"
                      icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                      onClick={() => setMessaging(o)}
                    >
                      {t('library.seats.message')}
                    </UbButton>
                    <CatalogueActionsMenu
                      size="sm"
                      t={t}
                      items={[
                        {
                          key: 'changeSeat',
                          label: t('library.seats.change'),
                          icon: Armchair,
                          action: onOpenMember ? () => onOpenMember(o.membershipId) : undefined,
                        },
                        {
                          key: 'freeSeat',
                          label: t('library.seats.free'),
                          icon: Armchair,
                          action: () => setFreeing(o),
                        },
                      ]}
                    />
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
    </UbStack>
  );
}
