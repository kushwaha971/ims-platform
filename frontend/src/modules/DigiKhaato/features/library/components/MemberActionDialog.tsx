'use client';

import { useId, useMemo, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbDateInput,
  UbDialog,
  UbField,
  UbChoiceChips,
  UbForm,
  UbMoneyInput,
  UbNativeSelect,
  UbStack,
  UbSwitch,
  UbText,
  UbTextArea,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { formatInr } from 'src/utils/money';

import { useMemberSchemas } from '../validation/memberSchemas';
import { isNonZero } from '../view-model/memberDisplay';

import type { MemberAction } from '../api/libraryMemberService';
import type { ActOutcome } from '../hooks/useMemberDetail';
import type {
  CloseFormValues,
  DepositFormValues,
  MemberDetail,
  MembershipType,
  ReasonFormValues,
} from '../types/member.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

export type MemberDialogKind = Exclude<MemberAction, 'rejoin'> | 'rejoin';

interface Props {
  readonly kind: MemberDialogKind;
  readonly member: MemberDetail;
  readonly types: readonly MembershipType[];
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (body: Readonly<Record<string, unknown>>) => Promise<ActOutcome>;
}

/**
 * F04 (LIB-04 FR-5…FR-9) — one dialog per membership act, each saying what it
 * does before the librarian confirms rather than after: a renewal charges the
 * fee to the khata; a suspension blocks borrowing; closing applies the deposit
 * to what is owed (when asked) and refuses while books are out (BR-6). A
 * refusal from the server is said in the dialog, where it was asked.
 */
export function MemberActionDialog(props: Props): React.JSX.Element {
  if (props.kind === 'close') return <CloseDialog {...props} />;
  if (props.kind === 'suspend') return <SuspendDialog {...props} />;
  if (props.kind === 'rejoin') return <RejoinDialog {...props} />;
  if (props.kind === 'deposit') return <DepositDialog {...props} />;
  return <ConfirmDialog {...props} />;
}

function Footer({
  formId,
  busy,
  onClose,
  label,
  destructive = false,
}: Readonly<{
  formId?: string;
  busy: boolean;
  onClose: () => void;
  label: string;
  destructive?: boolean;
}>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <UbButton variant="secondary" onClick={onClose} disabled={busy} autoFocus={destructive}>
        {t('common.action.cancel')}
      </UbButton>
      <UbButton
        type={formId ? 'submit' : 'button'}
        form={formId}
        variant={destructive ? 'destructive' : 'primary'}
        busy={busy}
        busyLabel={t('library.working')}
        data-testid="library-member-confirm"
      >
        {label}
      </UbButton>
    </>
  );
}

function ConfirmDialog({ kind, member, busy, onClose, onSubmit }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<Record<string, never>>({ defaultValues: {} });
  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(`library.member.${kind}.title`, { name: member.name })}
      closeLabel={t('common.action.close')}
      footer={
        <Footer
          formId={formId}
          busy={busy}
          onClose={onClose}
          label={t(`library.member.${kind}.confirm`)}
        />
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" tone="secondary">
          {t(`library.member.${kind}.body`, { type: member.type.name })}
        </UbText>
        <UbForm
          id={formId}
          form={form}
          formErrors={failure ? [failure] : undefined}
          onSubmit={async () => {
            const outcome = await onSubmit({});
            if (outcome.ok) onClose();
            else setFailure(outcome.error?.message ?? null);
          }}
        >
          {null}
        </UbForm>
      </UbStack>
    </UbDialog>
  );
}

function SuspendDialog({ member, busy, onClose, onSubmit }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const { reasonSchema } = useMemberSchemas();
  const schema = useMemo(() => reasonSchema(true), [reasonSchema]);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm<ReasonFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: { reason: '', until: '' },
  });
  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.member.suspend.title', { name: member.name })}
      closeLabel={t('common.action.close')}
      footer={
        <Footer
          formId={formId}
          busy={busy}
          onClose={onClose}
          label={t('library.member.suspend.confirm')}
          destructive
        />
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" tone="secondary">
          {t('library.member.suspend.body')}
        </UbText>
        <UbForm
          id={formId}
          form={form}
          formErrors={failure ? [failure] : undefined}
          onSubmit={async (values) => {
            const outcome = await onSubmit({
              reason: values.reason.trim(),
              until: values.until || undefined,
            });
            if (outcome.ok) onClose();
            else setFailure(outcome.error?.message ?? null);
          }}
        >
          <UbField name="reason" label={t('library.member.reason')} required>
            {(field) => <UbTextArea {...field} rows={2} maxLength={160} disabled={busy} />}
          </UbField>
          <UbField
            name="until"
            label={t('library.member.suspend.until')}
            hint={t('library.member.suspend.untilHint')}
            optionalLabel={t('common.field.optional')}
          >
            {(field) => <UbDateInput {...field} value={field.value as string} disabled={busy} />}
          </UbField>
        </UbForm>
      </UbStack>
    </UbDialog>
  );
}

function CloseDialog({ member, busy, onClose, onSubmit }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const { closeSchema } = useMemberSchemas();
  const [failure, setFailure] = useState<string | null>(null);
  const held = member.deposit?.held ?? '0.00';
  const form = useForm<CloseFormValues>({
    resolver: yupResolver(closeSchema),
    mode: 'onTouched',
    defaultValues: { reason: '', applyToDues: isNonZero(held) && isNonZero(member.duesAmount) },
  });
  const booksOut = member.loansOpen > 0;
  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.member.close.title', { name: member.name })}
      closeLabel={t('common.action.close')}
      footer={
        booksOut ? (
          <UbButton variant="secondary" onClick={onClose} autoFocus>
            {t('common.action.close')}
          </UbButton>
        ) : (
          <Footer
            formId={formId}
            busy={busy}
            onClose={onClose}
            label={t('library.member.close.confirm')}
            destructive
          />
        )
      }
    >
      {booksOut ? (
        <UbText variant="body-sm" data-testid="library-close-books-out">
          {t('library.member.close.booksOut', { count: member.loansOpen })}
        </UbText>
      ) : (
        <UbStack gap={3}>
          <UbText variant="body-sm" tone="secondary">
            {t('library.member.close.body')}
          </UbText>
          <UbForm
            id={formId}
            form={form}
            formErrors={failure ? [failure] : undefined}
            onSubmit={async (values) => {
              const outcome = await onSubmit({
                reason: values.reason.trim(),
                apply_to_dues: values.applyToDues,
              });
              if (outcome.ok) onClose();
              else setFailure(outcome.error?.message ?? null);
            }}
          >
            <UbField name="reason" label={t('library.member.reason')} required>
              {(field) => <UbTextArea {...field} rows={2} maxLength={160} disabled={busy} />}
            </UbField>
            {isNonZero(held) && isNonZero(member.duesAmount) && (
              <UbField name="applyToDues" label={t('library.member.close.apply')} controlOwnsLabel>
                {(field) => (
                  <UbSwitch
                    id={field.id}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    label={t('library.member.close.apply')}
                    description={t('library.member.close.applyHint', {
                      held: formatInr(held),
                      dues: formatInr(member.duesAmount),
                    })}
                    disabled={busy}
                  />
                )}
              </UbField>
            )}
            {isNonZero(held) && (
              <UbText variant="caption" tone="tertiary">
                {t('library.member.close.refundNote', { held: formatInr(held) })}
              </UbText>
            )}
          </UbForm>
        </UbStack>
      )}
    </UbDialog>
  );
}

function RejoinDialog({ member, types, busy, onClose, onSubmit }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const active = types.filter((type) => type.isActive);
  const [typeId, setTypeId] = useState(member.type.id);
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.member.rejoin.title', { name: member.name })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            busy={busy}
            busyLabel={t('library.working')}
            data-testid="library-member-confirm"
            onClick={async () => {
              const outcome = await onSubmit({ membership_type_id: typeId });
              if (outcome.ok) onClose();
              else setFailure(outcome.error?.message ?? null);
            }}
          >
            {t('library.member.rejoin.confirm')}
          </UbButton>
        </>
      }
    >
      <UbStack gap={3}>
        <UbText variant="body-sm" tone="secondary">
          {t('library.member.rejoin.body')}
        </UbText>
        <UbNativeSelect
          name="library-rejoin-type"
          aria-label={t('library.enrol.type')}
          value={typeId}
          onChange={setTypeId}
          options={active.map((type) => ({ value: type.id, label: type.name }))}
        />
        {failure && (
          <UbText variant="body-sm" tone="error">
            {failure}
          </UbText>
        )}
      </UbStack>
    </UbDialog>
  );
}

/**
 * QA B4 — the deposit a student did not pay at admission is taken here, later.
 * It goes to the held deposit (refundable), never to fee dues or income, and
 * says so before the librarian confirms.
 */
function DepositDialog({ member, busy, onClose, onSubmit }: Props): React.JSX.Element {
  const { t } = useTranslation();
  const formId = useId();
  const [failure, setFailure] = useState<string | null>(null);
  const { depositSchema } = useMemberSchemas();
  const due = member.deposit?.due ?? '0.00';
  const schema = useMemo(() => depositSchema(due), [depositSchema, due]);
  const form = useForm<DepositFormValues>({
    resolver: yupResolver(schema),
    mode: 'onTouched',
    defaultValues: { amount: due, paymentMode: 'cash' },
  });
  return (
    <UbDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.member.deposit.title', { name: member.name })}
      closeLabel={t('common.action.close')}
      footer={
        <Footer
          formId={formId}
          busy={busy}
          onClose={onClose}
          label={t('library.member.deposit.confirm')}
        />
      }
    >
      <UbForm
        id={formId}
        form={form}
        formErrors={failure ? [failure] : undefined}
        onSubmit={async (values) => {
          const outcome = await onSubmit({
            mode_breakup: [{ mode: values.paymentMode, amount: values.amount }],
          });
          if (outcome.ok) onClose();
          else setFailure(outcome.error?.message ?? null);
        }}
      >
        <UbStack gap={3}>
          <UbText variant="body-sm" tone="secondary">
            {t('library.member.deposit.body', { due: formatInr(due) })}
          </UbText>
          <UbField name="amount" label={t('library.member.deposit.amount')}>
            {(field) => (
              <UbMoneyInput
                id={field.id}
                value={(field.value as string) ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={field.invalid}
                disabled={busy}
              />
            )}
          </UbField>
          <UbField name="paymentMode" label={t('library.enrol.paidBy')} controlOwnsLabel>
            {(field) => (
              <UbChoiceChips<'cash' | 'upi'>
                id={field.id}
                ariaLabel={t('library.enrol.paidBy')}
                value={field.value as 'cash' | 'upi'}
                onChange={(next) => field.onChange(next)}
                onBlur={field.onBlur}
                options={[
                  { value: 'cash', label: t('library.enrol.paidBy.cash') },
                  { value: 'upi', label: t('library.enrol.paidBy.upi') },
                ]}
                disabled={busy}
              />
            )}
          </UbField>
        </UbStack>
      </UbForm>
    </UbDialog>
  );
}
