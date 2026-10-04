'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import dynamic from 'next/dynamic';

import {
  UbButton,
  UbCard,
  UbChoiceChips,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPressable,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';

import { finePreview } from '../api/libraryChargeService';
import { useCounter } from '../hooks/useCounter';
import { COUNTER_MODES, type CounterMode, type CounterRow } from '../types/counter.types';
import { MODE_SHORTCUTS } from '../view-model/counterDisplay';

import { CounterMemberPanel } from './CounterMemberPanel';
import { CounterSessionList } from './CounterSessionList';

/** The prompts load with the scan that needs them, and are preloaded on idle (LIB-06 §7). */
const loadPrompts = () => import('./CounterPrompts');
const OverridePromptLazy = dynamic(() => loadPrompts().then((m) => m.OverridePrompt), {
  ssr: false,
});
const FinishDialogLazy = dynamic(() => loadPrompts().then((m) => m.FinishDialog), {
  ssr: false,
});
const MarkLostDialogLazy = dynamic(() => import('./ChargeDialogs').then((m) => m.MarkLostDialog), {
  ssr: false,
});
const PaymentFormDrawerLazy = dynamic(
  () =>
    import('modules/DigiKhaato/features/payments/components/PaymentFormDrawer').then(
      (m) => m.PaymentFormDrawer
    ),
  { ssr: false }
);

/**
 * F05 (LIB-06) — `/library/counter`, the screen a library uses most: one scan
 * box, three modes, and a list of what happened. Keyboard-first: a scanner
 * types and presses Enter; Alt+I/R/N switch modes; Esc finishes with the
 * member. Focus returns to the box after every action and every dialog.
 *
 * Not `dynamic()` itself — its first paint is the scan box. The prompts are.
 */
export function CounterPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const counter = useCounter();
  const box = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [active, setActive] = useState(0);
  const [collecting, setCollecting] = useState<CounterRow | null>(null);
  const [losing, setLosing] = useState<{
    loanId: string;
    title: string;
    fine: { amount: string; daysLate: number } | null;
  } | null>(null);
  const { can } = usePermissions();
  const canCollect = can('payments.payment.write');
  const canAdjust = can('library.loan.adjust');
  const { member, mode, prompt, search } = counter;

  const focusBox = useCallback(() => {
    requestAnimationFrame(() => box.current?.focus());
  }, []);

  // Preload the prompts' chunk on idle, so an override never waits on it.
  useEffect(() => {
    const id = window.setTimeout(() => void loadPrompts(), 1500);
    return () => window.clearTimeout(id);
  }, []);

  // Focus back in the box whenever a prompt or the finish dialog closes.
  useEffect(() => {
    if (!prompt && !finishing && !collecting && !losing) focusBox();
  }, [prompt, finishing, collecting, losing, focusBox, counter.session.length, member]);

  const finish = useCallback(() => {
    if (member) setFinishing(true);
  }, [member]);

  // FR-1 — Alt+I/R/N by `event.code`; Esc finishes with the member.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = event.altKey ? MODE_SHORTCUTS[event.code] : undefined;
      if (shortcut) {
        event.preventDefault();
        counter.setMode(shortcut);
        focusBox();
      } else if (event.key === 'Escape' && member && !prompt && !finishing) {
        finish();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [counter, member, prompt, finishing, finish, focusBox]);

  const submit = useCallback(() => {
    // QA-F05-3 — the box clears on submit, so with names on screen an empty
    // Enter means "this one", not Finish.
    if (
      search &&
      search.results.length > 0 &&
      (text.trim() === '' || text.trim() === search.code)
    ) {
      const picked = search.results[Math.min(active, search.results.length - 1)];
      if (picked) counter.pickMember(picked.membershipId);
      setText('');
      return;
    }
    if (!text.trim()) {
      finish();
      return;
    }
    counter.submit(text);
    setText('');
    setActive(0);
  }, [search, text, active, counter, finish]);

  const modes = useMemo(
    () =>
      COUNTER_MODES.map((value) => ({
        value,
        label: t(`library.counter.mode.${value}`),
      })),
    [t]
  );

  if (!counter.canIssue) {
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

  const failedKeys = new Set(counter.failed.map((item) => item.key));
  const pending = [...(counter.inFlight ? [counter.inFlight] : []), ...counter.queue];

  return (
    <UbPageShell>
      <UbPageHeader title={t('library.counter.title')} />
      <UbStack gap={4} className="lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-6">
        <UbStack gap={3} className="min-w-0">
          <UbChoiceChips<CounterMode>
            id="library-counter-mode"
            value={mode}
            onChange={(next) => {
              counter.setMode(next);
              focusBox();
            }}
            options={modes}
            ariaLabel={t('library.counter.modeLabel')}
          />
          <UbStack gap={1}>
            <UbTextInput
              ref={box}
              id="library-counter-box"
              name="library-counter-box"
              aria-label={t('library.counter.scanHint')}
              placeholder={t(`library.counter.placeholder.${mode}`)}
              value={text}
              onChange={setText}
              autoComplete="off"
              enterKeyHint="go"
              data-testid="counter-box"
              onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                } else if (search && event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActive((i) => Math.min(i + 1, search.results.length - 1));
                } else if (search && event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                }
              }}
            />
            <UbText variant="caption" tone="tertiary" className="max-sm:hidden">
              {t('library.counter.keys')}
            </UbText>
          </UbStack>

          {search && (
            <UbCard padded>
              {search.results.length === 0 ? (
                <UbText variant="body-sm" tone="tertiary">
                  {t('library.counter.noMember', { q: search.code })}
                </UbText>
              ) : (
                <UbStack as="ul" gap={0} aria-label={t('library.counter.matches')}>
                  {search.results.map((result, index) => (
                    <UbStack as="li" key={result.membershipId} gap={0}>
                      <UbPressable
                        className={`w-full rounded-control px-3 py-2 text-left ${
                          index === active ? 'bg-surface-hover' : ''
                        }`}
                        aria-current={index === active ? 'true' : undefined}
                        onClick={() => {
                          counter.pickMember(result.membershipId);
                          setText('');
                        }}
                      >
                        <UbListItemText
                          primary={result.name}
                          secondary={[result.memberNumber, result.groupLabel]
                            .filter(Boolean)
                            .join(' · ')}
                        />
                      </UbPressable>
                    </UbStack>
                  ))}
                </UbStack>
              )}
            </UbCard>
          )}

          {prompt?.kind === 'alreadyWith' && member && (
            <UbCard padded>
              <UbStack data-testid="counter-already-with" gap={2}>
                <UbText variant="body-sm">
                  {t('library.counter.alreadyWith', { name: member.name, title: prompt.title })}
                </UbText>
                <UbStack direction="row" gap={2}>
                  <UbButton
                    size="sm"
                    onClick={() =>
                      counter.submit(prompt.code, { copyId: prompt.copyId, mode: 'return' })
                    }
                  >
                    {t('library.counter.mode.return')}
                  </UbButton>
                  <UbButton
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      counter.submit(prompt.code, { copyId: prompt.copyId, mode: 'renew' })
                    }
                  >
                    {t('library.counter.renew')}
                  </UbButton>
                  <UbButton size="sm" variant="ghost" onClick={counter.closePrompt}>
                    {t('common.action.cancel')}
                  </UbButton>
                </UbStack>
              </UbStack>
            </UbCard>
          )}

          {counter.session.length === 0 && pending.length === 0 ? (
            <UbText variant="body-sm" tone="tertiary" data-testid="counter-empty">
              {t(
                mode === 'issue' && !member
                  ? 'library.counter.empty.issue'
                  : `library.counter.empty.${mode}`
              )}
            </UbText>
          ) : (
            <CounterSessionList
              rows={counter.session}
              pending={pending}
              failedKeys={failedKeys}
              t={t}
              today={counter.today}
              busy={counter.busy}
              onUndo={(row) => void counter.undo(row, t('library.counter.undoReason'))}
              onRetry={counter.retry}
              onSkip={counter.skip}
              onCollect={canCollect ? setCollecting : undefined}
            />
          )}
        </UbStack>

        <UbStack gap={3} className="lg:sticky lg:top-4">
          {member ? (
            <CounterMemberPanel
              member={member}
              t={t}
              busy={counter.busy}
              onRenew={(copyId, code) => counter.submit(code, { copyId, mode: 'renew' })}
              onLost={
                canAdjust
                  ? (loanId, title) => {
                      setLosing({ loanId, title, fine: null });
                      void finePreview(loanId)
                        .then((fine) => setLosing((now) => (now ? { ...now, fine } : now)))
                        .catch(() => undefined);
                    }
                  : undefined
              }
              onRenewAll={counter.renewAll}
              onFinish={finish}
            />
          ) : (
            mode === 'issue' && (
              <UbCard padded>
                <UbText variant="body-sm" tone="tertiary">
                  {t('library.counter.noMemberYet')}
                </UbText>
              </UbCard>
            )
          )}
        </UbStack>
      </UbStack>

      {prompt?.kind === 'override' && (
        <OverridePromptLazy
          prompt={prompt}
          onClose={counter.closePrompt}
          onSubmit={(reason) =>
            counter.submit(prompt.code, {
              overrideReason: reason,
              ...(prompt.copyId ? { copyId: prompt.copyId } : {}),
            })
          }
        />
      )}
      {collecting?.charge && (
        <PaymentFormDrawerLazy
          context={{
            direction: 'in',
            partyId: collecting.charge.partyId,
            partyName: collecting.charge.partyName,
            documentId: collecting.charge.id,
            documentNumber: collecting.charge.number,
            documentDue: collecting.charge.amountDue,
            entry: 'party',
          }}
          onClose={() => setCollecting(null)}
        />
      )}
      {losing && (
        <MarkLostDialogLazy
          title={losing.title}
          fine={losing.fine}
          busy={counter.busy}
          onClose={() => setLosing(null)}
          onSubmit={(reason) => counter.markLost(losing.loanId, losing.title, reason)}
        />
      )}
      {finishing && member && (
        <FinishDialogLazy
          member={member}
          onClose={() => setFinishing(false)}
          onDone={() => {
            setFinishing(false);
            counter.finish();
          }}
        />
      )}
    </UbPageShell>
  );
}
