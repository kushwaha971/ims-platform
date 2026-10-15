'use client';

import { UbAmount, UbButton, UbStack, UbStatusBadge, UbText } from 'src/design-system';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatBusinessDate } from 'src/utils/dates';
import { formatInr } from 'src/utils/money';

import { blockParams, isNonZero, STATUS_TONE } from '../view-model/memberDisplay';

import { LibraryCard } from './LibraryCard';

import type { CounterMember } from '../types/counter.types';

/**
 * F05 (LIB-06 §8) — the member on the counter: who they are, what they hold of
 * what they may, what they owe, and every block in words. It shows only what
 * the last response said (BR-8) — the counter never pre-judges a block from
 * figures it holds; the server decides at the scan.
 */
export function CounterMemberPanel({
  member,
  t,
  busy,
  onRenew,
  onLost,
  onRenewAll,
  onFinish,
}: Readonly<{
  member: CounterMember;
  t: TranslateFn;
  busy: boolean;
  onRenew: (copyId: string, code: string) => void;
  /** F06 — present for a member holding `library.loan.adjust`. */
  onLost?: (loanId: string, title: string) => void;
  onRenewAll: () => void;
  onFinish: () => void;
}>): React.JSX.Element {
  return (
    <LibraryCard padded>
      <UbStack data-testid="counter-member-panel" gap={3}>
        <UbStack gap={1}>
          <UbStack direction="row" justify="between" align="start" gap={2}>
            <UbText variant="h4" className="line-clamp-2">
              {member.name}
            </UbText>
            <UbStatusBadge
              tone={STATUS_TONE[member.effectiveStatus]}
              label={t(`library.member.status.${member.effectiveStatus}`)}
            />
          </UbStack>
          <UbText variant="caption" tone="tertiary">
            {[member.memberNumber, member.type.name, member.groupLabel].filter(Boolean).join(' · ')}
          </UbText>
        </UbStack>

        <UbStack direction="row" gap={4} wrap>
          <UbStack gap={0} className="min-w-24">
            <UbText variant="caption" tone="tertiary">
              {t('library.member.booksOut')}
            </UbText>
            <UbText variant="body-medium" data-testid="counter-books">
              {t('library.member.booksOf', { count: member.loansOpen, max: member.type.maxCopies })}
            </UbText>
          </UbStack>
          <UbStack gap={0} className="min-w-24">
            <UbText variant="caption" tone="tertiary">
              {t('library.counter.overdue')}
            </UbText>
            <UbText variant="body-medium" tone={member.loansOverdue ? 'error' : undefined}>
              {member.loansOverdue}
            </UbText>
          </UbStack>
          <UbStack gap={0} className="min-w-24">
            <UbText variant="caption" tone="tertiary">
              {t('library.member.owes')}
            </UbText>
            {isNonZero(member.duesAmount) ? (
              <UbAmount
                value={member.duesAmount}
                tone="receivable"
                label={t('library.member.owes')}
                labelHidden
              />
            ) : (
              <UbText variant="body-medium">{t('library.member.noDues')}</UbText>
            )}
          </UbStack>
          {member.deposit && (
            <UbStack gap={0} className="min-w-24">
              <UbText variant="caption" tone="tertiary">
                {t('library.member.depositHeld')}
              </UbText>
              <UbText variant="body-medium">{formatInr(member.deposit.held)}</UbText>
            </UbStack>
          )}
        </UbStack>

        {member.blocks.length > 0 && (
          <UbStack gap={1} data-testid="counter-blocks">
            {member.blocks.map((block) => (
              <UbText key={block.code} variant="body-sm" tone="warning">
                {t(`library.member.block.${block.code}`, blockParams(block))}
              </UbText>
            ))}
          </UbStack>
        )}

        {member.loans.length > 0 && (
          <UbStack gap={2}>
            <UbStack direction="row" justify="between" align="center">
              <UbText variant="label">{t('library.counter.books')}</UbText>
              <UbButton variant="ghost" size="sm" onClick={onRenewAll} disabled={busy}>
                {t('library.counter.renewAll')}
              </UbButton>
            </UbStack>
            {member.loans.map((loan) => (
              <UbStack key={loan.id} direction="row" justify="between" align="center" gap={2}>
                <UbStack gap={0} className="min-w-0">
                  <UbText variant="body-sm" className="line-clamp-2">
                    {loan.copy.title}
                  </UbText>
                  <UbText variant="caption" tone={loan.daysOverdue > 0 ? 'error' : 'tertiary'}>
                    {[
                      loan.copy.accessionNumber,
                      t('library.counter.dueOn', { date: formatBusinessDate(loan.dueOn) }),
                    ].join(' · ')}
                  </UbText>
                </UbStack>
                <UbStack direction="row" gap={1} className="shrink-0">
                  {onLost && (
                    <UbButton
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onLost(loan.id, loan.copy.title)}
                    >
                      {t('library.charge.lost')}
                    </UbButton>
                  )}
                  <UbButton
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onRenew(loan.copy.id, loan.copy.accessionNumber)}
                  >
                    {t('library.counter.renew')}
                  </UbButton>
                </UbStack>
              </UbStack>
            ))}
          </UbStack>
        )}

        <UbButton variant="secondary" onClick={onFinish} data-testid="counter-finish">
          {t('library.counter.finish')}
        </UbButton>
      </UbStack>
    </LibraryCard>
  );
}
