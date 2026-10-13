'use client';

import { useEffect, useId, useState } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { Check, MessageCircle } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';

import {
  UbActionLink,
  UbButton,
  UbCard,
  UbChoiceChips,
  UbDrawer,
  UbField,
  UbForm,
  UbListItemText,
  UbNativeSelect,
  UbStack,
  UbStatusBadge,
  UbText,
  UbTextArea,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { prepareBulkMessages, recordLibraryMessage } from '../redux/libraryMessageThunk';
import { selectLibrarySeats } from '../redux/librarySeatsSlice';
import { fetchLibraryShifts } from '../redux/librarySeatThunk';
import { AUDIENCES, BULK_KINDS, CUSTOM_MESSAGE_MAX, PERSONAL_TOKENS } from '../types/message.types';
import { useMessageSchemas } from '../validation/messageSchemas';

import type {
  Audience,
  BulkKind,
  BulkMessageFormValues,
  BulkMessageRow,
} from '../types/message.types';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

/**
 * QA F4 / B51 — a message to a group: fee unpaid, plans ending this week, one
 * shift, or everybody. The server prepares one message per student with that
 * student's own name and figure (and sends a minor's to the guardian); the desk
 * then opens each in WhatsApp on the library's phone, one tap per student,
 * because the product sends nothing itself (DEC-012). Each tap is recorded and
 * builds the text again, so a fee paid at the desk in between is not asked for.
 */
export function BulkMessageDrawer({
  onClose,
}: Readonly<{ onClose: () => void }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const formId = useId();
  const { bulkSchema } = useMessageSchemas();
  const { shifts } = useAppSelector(selectLibrarySeats);
  const [rows, setRows] = useState<readonly BulkMessageRow[] | null>(null);
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<BulkMessageFormValues>({
    resolver: yupResolver(bulkSchema),
    mode: 'onTouched',
    defaultValues: { kind: 'fee', audience: 'unpaid', shiftId: '', text: '' },
  });
  const kind = useWatch({ control: form.control, name: 'kind' });
  const audience = useWatch({ control: form.control, name: 'audience' });

  useEffect(() => {
    if (shifts.length > 0) return undefined;
    const promise = dispatch(fetchLibraryShifts());
    return () => promise.abort();
  }, [dispatch, shifts.length]);

  const prepare = async (values: BulkMessageFormValues) => {
    setFailure(null);
    setBusy(true);
    const result = await dispatch(
      prepareBulkMessages({
        kind: values.kind,
        audience: values.audience,
        shiftId: values.shiftId,
        text: values.text.trim(),
      })
    );
    setBusy(false);
    if (prepareBulkMessages.fulfilled.match(result)) {
      setRows(result.payload);
      setSent(new Set());
    } else {
      setFailure(result.payload?.message ?? t('library.messages.error.prepare'));
    }
  };

  const record = (row: BulkMessageRow) => {
    const text = kind === 'custom' ? form.getValues('text').trim() : undefined;
    void dispatch(recordLibraryMessage({ membershipId: row.membershipId, kind, text })).then(
      (result) => {
        if (recordLibraryMessage.fulfilled.match(result)) {
          setSent((before) => new Set(before).add(row.membershipId));
        } else if (result.payload) {
          dispatch(
            showSnackbar({
              severity: 'error',
              message: result.payload.message,
              requestId: result.payload.requestId,
            })
          );
        }
      }
    );
  };

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && onClose()}
      title={t('library.messages.bulk.title')}
      closeLabel={t('common.action.close')}
      footer={
        rows === null ? (
          <>
            <UbButton variant="secondary" onClick={onClose}>
              {t('common.action.cancel')}
            </UbButton>
            <UbButton
              type="submit"
              form={formId}
              busy={busy}
              busyLabel={t('library.working')}
              data-testid="library-bulk-prepare"
            >
              {t('library.messages.bulk.prepare')}
            </UbButton>
          </>
        ) : (
          <>
            <UbButton variant="secondary" onClick={() => setRows(null)}>
              {t('library.messages.bulk.change')}
            </UbButton>
            <UbButton onClick={onClose}>{t('library.messages.bulk.done')}</UbButton>
          </>
        )
      }
    >
      {rows === null ? (
        <UbForm
          id={formId}
          form={form}
          formErrors={failure ? [failure] : undefined}
          onSubmit={prepare}
        >
          <UbText variant="label">{t('library.messages.bulk.kind')}</UbText>
          <UbField name="kind" label={t('library.messages.bulk.kind')} controlOwnsLabel>
            {(field) => (
              <UbChoiceChips<BulkKind>
                id={field.id}
                ariaLabel={t('library.messages.bulk.kind')}
                value={field.value as BulkKind}
                onChange={(next) => field.onChange(next)}
                onBlur={field.onBlur}
                options={BULK_KINDS.map((value) => ({
                  value,
                  label: t(`library.messages.bulk.kind.${value}`),
                }))}
              />
            )}
          </UbField>
          <UbText variant="label">{t('library.messages.bulk.audience')}</UbText>
          <UbField name="audience" label={t('library.messages.bulk.audience')} controlOwnsLabel>
            {(field) => (
              <UbChoiceChips<Audience>
                id={field.id}
                ariaLabel={t('library.messages.bulk.audience')}
                value={field.value as Audience}
                onChange={(next) => field.onChange(next)}
                onBlur={field.onBlur}
                options={AUDIENCES.map((value) => ({
                  value,
                  label: t(`library.messages.bulk.audience.${value}`),
                }))}
              />
            )}
          </UbField>
          {audience === 'shift' && (
            <UbField name="shiftId" label={t('library.messages.bulk.shift')} required>
              {(field) => (
                <UbNativeSelect
                  {...field}
                  placeholder={t('library.messages.bulk.shift.placeholder')}
                  options={shifts.map((shift) => ({ value: shift.id, label: shift.name }))}
                />
              )}
            </UbField>
          )}
          {kind === 'custom' && (
            <UbField
              name="text"
              label={t('library.messages.custom.label')}
              hint={t('library.messages.custom.hint', { tokens: PERSONAL_TOKENS.join(' ') })}
              required
            >
              {(field) => (
                <UbTextArea
                  {...field}
                  rows={5}
                  maxLength={CUSTOM_MESSAGE_MAX}
                  counterLabel={t('library.messages.custom.counter', {
                    count: '{count}',
                    max: '{max}',
                  })}
                />
              )}
            </UbField>
          )}
        </UbForm>
      ) : (
        <UbStack gap={3} data-testid="library-bulk-rows">
          <UbText variant="body-sm" tone="secondary">
            {rows.length === 0
              ? t('library.messages.bulk.nobody')
              : t('library.messages.bulk.ready', { count: rows.length, sent: sent.size })}
          </UbText>
          {rows.map((row) => (
            <UbCard key={row.membershipId} padded>
              <UbStack gap={2} data-testid={`library-bulk-row-${row.membershipId}`}>
                <UbListItemText
                  primary={row.name}
                  secondary={
                    row.recipient.isGuardian
                      ? t('library.messages.toGuardian', { name: row.recipient.name })
                      : row.memberNumber
                  }
                />
                <UbText
                  variant="body-sm"
                  className="whitespace-pre-line rounded-control bg-surface-sunken p-3"
                >
                  {row.text}
                </UbText>
                <UbStack direction="row" gap={2} align="center" wrap>
                  {row.recipient.hasMobile && row.waUrl ? (
                    <UbActionLink
                      href={row.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                      onClick={() => record(row)}
                      data-testid="library-bulk-send"
                    >
                      {t('library.messages.openWhatsApp')}
                    </UbActionLink>
                  ) : (
                    <UbText variant="caption" tone="warning">
                      {t('library.messages.noMobile', { name: row.recipient.name })}
                    </UbText>
                  )}
                  {sent.has(row.membershipId) && (
                    <UbStatusBadge
                      tone="success"
                      icon={<Check className="h-3 w-3" aria-hidden />}
                      label={t('library.messages.bulk.opened')}
                    />
                  )}
                </UbStack>
              </UbStack>
            </UbCard>
          ))}
        </UbStack>
      )}
    </UbDrawer>
  );
}
