'use client';

import { useEffect, useState } from 'react';

import dynamic from 'next/dynamic';

import { Plus } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPressable,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';
import { formatInr } from 'src/utils/money';

import { selectLibraryMemberList } from '../redux/libraryMemberListSlice';
import { fetchLibraryMembershipTypes } from '../redux/libraryMemberThunk';
import { isNonZero } from '../view-model/memberDisplay';

import type { MembershipType } from '../types/member.types';

/** The plan form loads with the tap that opens it (CLAUDE.md). */
const PlanDialogLazy = dynamic(() => import('./PlanDialog').then((m) => m.PlanDialog), {
  ssr: false,
});

/** Where each "who has to pay" shortcut goes: the students list, filtered. */
const SHORTCUTS = [
  { key: 'overdue', query: 'status=expired', tone: 'error' },
  { key: 'unpaid', query: 'hasDues=true', tone: 'warning' },
  { key: 'due_soon', query: 'status=expiring', tone: 'warning' },
] as const;

/**
 * W03 (owner, 4 Oct 2026) — `/library/fees`: a reading room runs on monthly
 * fees, so its money screen says who has to pay — the plan ran out, a fee is
 * charged and not paid, or the plan ends this week — and holds the fee plans a
 * student joins on (Monthly ₹900, Quarterly ₹2,400…). No khata, no "owed".
 */
export function FeesPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { types } = useAppSelector(selectLibraryMemberList);
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.member.read');
  const canManage = hasModule('library') && can('library.settings.manage');
  const [editing, setEditing] = useState<MembershipType | 'new' | null>(null);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLibraryMembershipTypes());
    return () => promise.abort();
  }, [dispatch, canRead]);

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('library.noAccess.title')}
          description={t('library.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell width="measure">
      <UbPageHeader title={t('library.fees.title')} />
      <UbStack gap={5}>
        <UbStack gap={2} data-testid="library-fees-shortcuts">
          <UbText variant="label">{t('library.fees.toCollect')}</UbText>
          {SHORTCUTS.map((shortcut) => (
            <UbCard key={shortcut.key} padded>
              <UbStack direction="row" justify="between" align="center" gap={3}>
                <UbListItemText
                  primary={t(`library.fees.shortcut.${shortcut.key}`)}
                  secondary={t(`library.fees.shortcut.${shortcut.key}.hint`)}
                />
                <UbActionLink
                  href={`${ROUTES.LIBRARY_MEMBERS}?${shortcut.query}`}
                  variant="secondary"
                  size="sm"
                >
                  {t('library.fees.see')}
                </UbActionLink>
              </UbStack>
            </UbCard>
          ))}
        </UbStack>

        <UbStack gap={2} data-testid="library-fees-plans">
          <UbStack direction="row" justify="between" align="center" gap={2}>
            <UbText variant="label">{t('library.plans.title')}</UbText>
            {canManage && (
              <UbButton
                size="sm"
                variant="secondary"
                icon={<Plus className="h-4 w-4" aria-hidden />}
                onClick={() => setEditing('new')}
                data-testid="library-plan-add"
              >
                {t('library.plans.add')}
              </UbButton>
            )}
          </UbStack>
          {types.length === 0 ? (
            <UbText variant="body-sm" tone="tertiary">
              {t('library.plans.none')}
            </UbText>
          ) : (
            <UbCard padded>
              <UbStack as="ul" gap={0} aria-label={t('library.plans.title')}>
                {types.map((plan) => (
                  <UbStack as="li" key={plan.id} gap={0}>
                    <UbPressable
                      className="w-full rounded-control px-1 py-2 text-left"
                      disabled={!canManage}
                      onClick={() => setEditing(plan)}
                    >
                      <UbStack direction="row" justify="between" align="center" gap={3}>
                        <UbListItemText
                          primary={plan.name}
                          secondary={[
                            plan.validityMonths
                              ? t('library.plans.length', { months: plan.validityMonths })
                              : t('library.member.noExpiry'),
                            isNonZero(plan.admissionFee)
                              ? t('library.plans.admission', {
                                  amount: formatInr(plan.admissionFee),
                                })
                              : '',
                            isNonZero(plan.depositAmount)
                              ? t('library.plans.deposit', {
                                  amount: formatInr(plan.depositAmount),
                                })
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                        <UbStack direction="row" gap={2} align="center">
                          {!plan.isActive && (
                            <UbStatusBadge tone="neutral" label={t('library.plans.notInUse')} />
                          )}
                          <UbText variant="body-sm-medium">{formatInr(plan.feeAmount)}</UbText>
                        </UbStack>
                      </UbStack>
                    </UbPressable>
                  </UbStack>
                ))}
              </UbStack>
            </UbCard>
          )}
        </UbStack>
      </UbStack>
      {editing && (
        <PlanDialogLazy
          plan={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </UbPageShell>
  );
}
