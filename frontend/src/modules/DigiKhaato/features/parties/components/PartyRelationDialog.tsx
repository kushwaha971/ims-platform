'use client';

import { useCallback, useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { X } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';

import {
  formatRequestReference,
  UbButton,
  UbChoiceChips,
  UbDialog,
  UbField,
  UbForm,
  UbListItemText,
  UbPressable,
  UbStack,
  UbStatusBanner,
  UbSwitch,
  UbText,
  UbTextInput,
  type UbFieldRenderProps,
} from 'src/design-system';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';

import { usePartySearch } from '../hooks/usePartySearch';
import {
  RELATION_FIELD_FOR_SERVER,
  RELATION_KINDS,
  usePartyRelationSchemas,
  type PartyRelationFormValues,
} from '../validation/partyRelationSchemas';
import { KIND_LABEL } from '../view-model/partyRelationDisplay';

import type { UsePartyRelationsResult } from '../hooks/usePartyRelations';

// Loaded with dynamic(): its words come with its own chunk.
import 'src/i18n/catalogues/partyLinks';
import 'src/i18n/catalogues/validation';

const DEFAULTS: PartyRelationFormValues = {
  relatedPartyId: '',
  relatedPartyName: '',
  kind: 'guardian',
  receivesMessages: false,
};

/**
 * A6 (PLT-X04 §2 flow 3) — "Add guardian or payer": pick a party, say which
 * they are, and whether reminders go to them. The picker is the product's one
 * party search (`usePartySearch`), minus the party whose khata this is.
 */
export function PartyRelationDialog({
  partyId,
  partyName,
  relations,
}: Readonly<{
  partyId: string;
  partyName: string;
  relations: UsePartyRelationsResult;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const { relationSchema } = usePartyRelationSchemas(partyId);
  const formId = useId();
  const form = useForm<PartyRelationFormValues>({
    resolver: yupResolver(relationSchema),
    mode: 'onTouched',
    defaultValues: DEFAULTS,
  });
  const { reset, setError, setValue, control } = form;
  const { dialogOpen, closeDialog, save, saving, saveError } = relations;

  // Cleared when the dialog OPENS (clearing on close races the animation).
  useEffect(() => {
    if (dialogOpen) reset(DEFAULTS);
  }, [dialogOpen, reset]);

  /* A field error from the server lands under its field; anything else is the
     banner below the form. */
  useEffect(() => {
    const details = (saveError?.details ?? {}) as Record<string, unknown>;
    for (const [wire, field] of Object.entries(RELATION_FIELD_FOR_SERVER)) {
      const messages = details[wire];
      if (Array.isArray(messages) && typeof messages[0] === 'string') {
        setError(field, { type: 'server', message: messages[0] });
      }
    }
  }, [saveError, setError]);
  const bannerError =
    saveError &&
    !Object.keys(RELATION_FIELD_FOR_SERVER).some((key) => key in (saveError.details ?? {}))
      ? saveError
      : null;

  const kindOptions = useMemo(
    () => RELATION_KINDS.map((kind) => ({ value: kind, label: t(KIND_LABEL[kind]) })),
    [t]
  );

  const submit = useCallback(
    (values: PartyRelationFormValues) =>
      save({
        relatedPartyId: values.relatedPartyId,
        kind: values.kind,
        receivesMessages: values.receivesMessages,
      }),
    [save]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !saving) closeDialog();
    },
    [closeDialog, saving]
  );

  const pickedName = useWatch({ control, name: 'relatedPartyName' });
  const pick = useCallback(
    (id: string, name: string) => {
      setValue('relatedPartyId', id, { shouldValidate: Boolean(id), shouldTouch: true });
      setValue('relatedPartyName', name);
    },
    [setValue]
  );

  return (
    <UbDialog
      open={dialogOpen}
      onOpenChange={handleOpenChange}
      title={t('parties.relations.dialog.title')}
      description={t('parties.relations.dialog.body', { name: partyName })}
      closeLabel={t('common.action.close')}
      footer={
        <>
          <UbButton variant="secondary" onClick={closeDialog} disabled={saving}>
            {t('common.action.cancel')}
          </UbButton>
          <UbButton
            type="submit"
            form={formId}
            busy={saving}
            busyLabel={t('parties.relations.dialog.saving')}
          >
            {t('parties.relations.dialog.save')}
          </UbButton>
        </>
      }
    >
      <UbForm id={formId} form={form} onSubmit={submit}>
        <UbField
          name="relatedPartyId"
          label={t('parties.relations.dialog.party')}
          placeholder={t('parties.relations.dialog.partyPlaceholder')}
          required
        >
          {(field) => (
            <RelatedPartyPicker
              field={field}
              selfId={partyId}
              pickedName={pickedName}
              onPick={pick}
              t={t}
            />
          )}
        </UbField>
        <UbField name="kind" label={t('parties.relations.dialog.kind')} controlOwnsLabel>
          {(field) => (
            <UbChoiceChips
              value={field.value as PartyRelationFormValues['kind']}
              onChange={field.onChange}
              onBlur={field.onBlur}
              options={kindOptions}
              ariaLabel={t('parties.relations.dialog.kind')}
              invalid={field.invalid}
              describedBy={field['aria-describedby']}
            />
          )}
        </UbField>
        <UbField
          name="receivesMessages"
          label={t('parties.relations.dialog.messages')}
          controlOwnsLabel
        >
          {(field) => (
            <UbSwitch
              id={field.id}
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              label={t('parties.relations.dialog.messages')}
              description={t('parties.relations.dialog.messagesHint')}
            />
          )}
        </UbField>
      </UbForm>
      {bannerError && (
        <UbStatusBanner
          tone="error"
          title={bannerError.message}
          description={
            bannerError.requestId
              ? formatRequestReference(t('common.error.reference'), bannerError.requestId)
              : undefined
          }
          className="mt-3"
        />
      )}
    </UbDialog>
  );
}

function RelatedPartyPicker({
  field,
  selfId,
  pickedName,
  onPick,
  t,
}: Readonly<{
  field: UbFieldRenderProps;
  selfId: string;
  pickedName: string;
  onPick: (id: string, name: string) => void;
  t: TranslateFn;
}>): React.JSX.Element {
  const { query, setQuery, results, status, isEmpty, canSearch, clear } = usePartySearch();
  const shown = useMemo(() => results.filter((party) => party.id !== selfId), [results, selfId]);

  if (field.value) {
    return (
      <UbStack
        direction="row"
        align="center"
        justify="between"
        className="border-border-default h-10 rounded-control border px-3"
      >
        <UbText variant="body" className="truncate">
          {pickedName}
        </UbText>
        <UbButton
          variant="ghost"
          size="sm"
          iconOnly
          icon={<X className="h-4 w-4" aria-hidden />}
          aria-label={t('parties.relations.dialog.clear', { name: pickedName })}
          onClick={() => {
            onPick('', '');
            clear();
          }}
        >
          {t('parties.relations.dialog.clear', { name: pickedName })}
        </UbButton>
      </UbStack>
    );
  }

  if (!canSearch) {
    return (
      <UbText variant="caption" tone="tertiary">
        {t('parties.relations.dialog.noAccess')}
      </UbText>
    );
  }

  return (
    <UbStack gap={1}>
      <UbTextInput
        id={field.id}
        name={field.name}
        value={query}
        onChange={setQuery}
        onBlur={field.onBlur}
        placeholder={field.placeholder}
        invalid={field.invalid}
        aria-invalid={field['aria-invalid']}
        aria-describedby={field['aria-describedby']}
        autoComplete="off"
      />
      {shown.length > 0 && (
        <UbStack
          as="ul"
          gap={0}
          aria-label={t('parties.relations.dialog.results')}
          className="border-border-default rounded-control border"
        >
          {shown.map((party) => (
            <UbStack as="li" key={party.id} gap={0}>
              <UbPressable
                className="w-full px-3 py-2 text-left"
                onClick={() => {
                  onPick(party.id, party.name);
                  clear();
                }}
              >
                <UbListItemText primary={party.name} secondary={party.mobile ?? undefined} />
              </UbPressable>
            </UbStack>
          ))}
        </UbStack>
      )}
      {(isEmpty || (status === 'succeeded' && shown.length === 0 && query.trim())) && (
        <UbText variant="caption" tone="tertiary">
          {t('parties.relations.dialog.noMatch')}
        </UbText>
      )}
    </UbStack>
  );
}
