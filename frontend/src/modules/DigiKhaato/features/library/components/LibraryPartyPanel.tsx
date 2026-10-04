'use client';

import { useEffect, useState } from 'react';

import {
  UbActionLink,
  UbPanel,
  UbPanelSection,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';
import { formatBusinessDate, todayInTenantTz } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import type { PartyPanelProps } from 'modules/DigiKhaato/features/parties/modulePanels';

import { findMemberByParty } from '../api/libraryMemberService';
import { isNonZero, STATUS_TONE, validityLine } from '../view-model/memberDisplay';

import type { MemberSummary } from '../types/member.types';

// Its own chunk, so its own words.
import 'src/i18n/catalogues/library';

/**
 * F04 (LIB-04 §7 `LibraryPartyPanel`) — on a member's khata: the card number,
 * whether the membership is good, books out and what is owed to the library,
 * and a link to the member page where the acts are. It reads once on mount and
 * offers no write of its own — the khata already has the money actions.
 */
export function LibraryPartyPanel({ party }: Readonly<PartyPanelProps>): React.JSX.Element | null {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const today = todayInTenantTz(timezone ?? undefined);
  const canRead = can('library.member.read');
  const [member, setMember] = useState<MemberSummary | null | undefined>(undefined);

  useEffect(() => {
    if (!canRead) return undefined;
    const controller = new AbortController();
    findMemberByParty(party.id, controller.signal)
      .then(setMember)
      .catch(() => {
        if (!controller.signal.aborted) setMember(null);
      });
    return () => controller.abort();
  }, [party.id, canRead]);

  if (!canRead || member === null) return null;
  if (member === undefined) {
    return (
      <UbPanel as="section">
        <UbPanelSection title={t('library.panel.title')}>
          <UbSkeleton variant="text" count={2} />
        </UbPanelSection>
      </UbPanel>
    );
  }
  const validity = validityLine(member, today);
  return (
    <UbPanel as="section" data-testid="library-party-panel">
      <UbPanelSection
        title={t('library.panel.title')}
        badge={t(`library.member.status.${member.effectiveStatus}`)}
      >
        <UbStack gap={2}>
          <UbStack direction="row" gap={2} align="center" wrap>
            <UbText variant="body-sm" className="ds-mono">
              {member.memberNumber}
            </UbText>
            <UbStatusBadge tone={STATUS_TONE[member.effectiveStatus]} label={member.type.name} />
          </UbStack>
          <UbText variant="caption" tone="tertiary">
            {t(
              validity.id,
              validity.params && 'date' in validity.params
                ? { date: formatBusinessDate(String(validity.params.date)) }
                : validity.params
            )}
          </UbText>
          <UbText variant="body-sm">
            {[
              t('library.member.booksOf', { count: member.loansOpen, max: member.type.maxCopies }),
              isNonZero(member.duesAmount)
                ? t('library.member.owesAmount', { amount: formatInr(member.duesAmount) })
                : t('library.member.noDues'),
            ].join(' · ')}
          </UbText>
          <UbActionLink
            href={`${ROUTES.LIBRARY_MEMBERS}/${member.membershipId}`}
            variant="secondary"
          >
            {t('library.panel.open')}
          </UbActionLink>
        </UbStack>
      </UbPanelSection>
    </UbPanel>
  );
}
