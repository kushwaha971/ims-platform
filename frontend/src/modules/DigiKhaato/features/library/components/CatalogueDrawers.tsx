'use client';

import { useEffect, useId, useMemo } from 'react';

import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch, type Control } from 'react-hook-form';

import {
  UbButton,
  UbCheckbox,
  UbChoiceChips,
  UbDateInput,
  UbDisclosure,
  UbDrawer,
  UbField,
  UbForm,
  UbListItemText,
  UbMoneyInput,
  UbSelect,
  UbStack,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useDebounce } from 'src/hooks/useDebounce';
import { useTranslation, type TranslateFn } from 'src/hooks/useTranslation';

import { CATALOGUE_SEARCH_DEBOUNCE_MS, COPIES_MAX } from '../constants/catalogueConstants';
import {
  emptyCopies,
  emptyTitle,
  titleFormValues,
  useCatalogueForm,
} from '../hooks/useCatalogueForm';
import { selectLibraryTitleDetail } from '../redux/libraryTitleDetailSlice';
import {
  COPY_SOURCES,
  MATERIAL_TYPES,
  type AddBookFormValues,
  type CopiesFormValues,
  type CopySource,
  type LibraryCategory,
  type LibraryLocation,
  type MaterialType,
  type TitleFormValues,
} from '../types/catalogue.types';
import { useCatalogueSchemas } from '../validation/catalogueSchemas';
import { shelfLine } from '../view-model/copyDisplay';

// Loaded with dynamic(), so its words come with its own chunk.
import 'src/i18n/catalogues/library';
import 'src/i18n/catalogues/validation';

const NONE = 'none';

/**
 * F03 (LIB-02 FR-3, FR-4, §8) — the catalogue's three drawers, one chunk:
 * "Add book" (a title with its first copies), "Add copies" (more copies of a
 * title) and "Edit details". Mounted by the screens only while a drawer is
 * open, through `dynamic()`, so React Hook Form, the resolver and the schema
 * ship with the tap that opens a drawer and not with the list a librarian
 * opens to READ — the rule CLAUDE.md has measured three times.
 *
 * The first field takes focus through the dialog's own hook honouring React's
 * `autoFocus` (fixed in `mlOverlayPrimitives` after LED-01), and nothing opens
 * red: validation runs `onTouched`.
 */
export function CatalogueDrawers(): React.JSX.Element | null {
  const form = useCatalogueForm();
  const { drawer } = form;
  if (!drawer) return null;
  if (drawer.kind === 'addBook') return <AddBookDrawer form={form} query={drawer.query} />;
  if (drawer.kind === 'addCopies') {
    return <AddCopiesDrawer form={form} title={{ id: drawer.titleId, title: drawer.title }} />;
  }
  return <EditTitleDrawer form={form} titleId={drawer.titleId} />;
}

type FormApi = ReturnType<typeof useCatalogueForm>;

// ── Add book ─────────────────────────────────────────────────────────────────

function AddBookDrawer({ form, query }: Readonly<{ form: FormApi; query: string }>) {
  const { t } = useTranslation();
  const formId = useId();
  const { addBookSchema } = useCatalogueSchemas();
  const rhf = useForm<AddBookFormValues>({
    resolver: yupResolver(addBookSchema),
    mode: 'onTouched',
    defaultValues: { ...emptyTitle(query), copies: emptyCopies(form.today) },
  });
  const [title, isbn] = useWatch({ control: rhf.control, name: ['title', 'isbn'] });
  /* FR-3 — search first: what the merchant has typed so far, ISBN before title. */
  const probe = useDebounce((isbn || title).trim(), CATALOGUE_SEARCH_DEBOUNCE_MS);
  const { search } = form;
  useEffect(() => search(probe), [search, probe]);
  const matches = probe && form.matchesFor === probe ? form.matches : [];

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && form.close()}
      title={t('library.catalogue.add')}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!rhf.formState.isDirty}
      footer={<DrawerFooter t={t} formId={formId} busy={form.busy} onCancel={form.close} />}
    >
      <UbForm
        id={formId}
        form={rhf}
        onSubmit={(values) => form.createTitle(values, rhf.setError)}
        formErrors={form.formErrors}
      >
        <TitleFields t={t} categories={form.categories} autoFocus />
        {matches.length > 0 && (
          <UbStack gap={2} data-testid="library-add-matches">
            <UbText variant="label" tone="secondary">
              {t('library.form.matches')}
            </UbText>
            {matches.map((match) => {
              const line = shelfLine(match);
              return (
                <UbStack key={match.id} direction="row" gap={2} align="center" justify="between">
                  <UbListItemText
                    primary={match.title}
                    secondary={[match.authors, t(line.id, line.params)].filter(Boolean).join(' · ')}
                    secondaryVariant="caption"
                    secondaryTone="tertiary"
                  />
                  <UbButton
                    variant="secondary"
                    size="sm"
                    onClick={() => form.switchToAddCopies(match.id, match.title)}
                  >
                    {t('library.form.addToThis')}
                  </UbButton>
                </UbStack>
              );
            })}
          </UbStack>
        )}
        <UbText variant="label" tone="secondary">
          {t('library.form.copiesHeading')}
        </UbText>
        <CopiesFields
          t={t}
          control={rhf.control as unknown as Control<FieldValuesWithCopies>}
          prefix="copies."
          locations={form.locations}
          today={form.today}
        />
      </UbForm>
    </UbDrawer>
  );
}

// ── Add copies ───────────────────────────────────────────────────────────────

function AddCopiesDrawer({
  form,
  title,
}: Readonly<{ form: FormApi; title: { readonly id: string; readonly title: string } }>) {
  const { t } = useTranslation();
  const formId = useId();
  const { copiesSchema } = useCatalogueSchemas();
  const rhf = useForm<CopiesFormValues>({
    resolver: yupResolver(copiesSchema),
    mode: 'onTouched',
    defaultValues: emptyCopies(form.today),
  });

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && form.close()}
      title={t('library.title.addCopies')}
      description={title.title}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!rhf.formState.isDirty}
      footer={<DrawerFooter t={t} formId={formId} busy={form.busy} onCancel={form.close} />}
    >
      <UbForm
        id={formId}
        form={rhf}
        onSubmit={(values) => form.addCopies(title, values, rhf.setError)}
        formErrors={form.formErrors}
      >
        <CopiesFields
          t={t}
          control={rhf.control as unknown as Control<FieldValuesWithCopies>}
          prefix=""
          locations={form.locations}
          today={form.today}
          autoFocus
        />
      </UbForm>
    </UbDrawer>
  );
}

// ── Edit details ─────────────────────────────────────────────────────────────

function EditTitleDrawer({ form, titleId }: Readonly<{ form: FormApi; titleId: string }>) {
  const { t } = useTranslation();
  const formId = useId();
  const { titleSchema } = useCatalogueSchemas();
  const { title } = useAppSelector(selectLibraryTitleDetail);
  const current = title?.id === titleId ? title : null;
  const rhf = useForm<TitleFormValues>({
    resolver: yupResolver(titleSchema),
    mode: 'onTouched',
    defaultValues: current ? titleFormValues(current) : emptyTitle(),
  });
  if (!current) return null;

  return (
    <UbDrawer
      open
      onOpenChange={(next) => !next && form.close()}
      title={t('library.title.edit')}
      closeLabel={t('common.action.close')}
      dismissOnBackdrop={!rhf.formState.isDirty}
      footer={<DrawerFooter t={t} formId={formId} busy={form.busy} onCancel={form.close} />}
    >
      <UbForm
        id={formId}
        form={rhf}
        onSubmit={(values) => form.editTitle(current.id, current.version, values, rhf.setError)}
        formErrors={form.formErrors}
      >
        <TitleFields t={t} categories={form.categories} autoFocus />
      </UbForm>
    </UbDrawer>
  );
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function DrawerFooter({
  t,
  formId,
  busy,
  onCancel,
}: Readonly<{ t: TranslateFn; formId: string; busy: boolean; onCancel: () => void }>) {
  return (
    <>
      <UbButton variant="secondary" onClick={onCancel} disabled={busy}>
        {t('common.action.cancel')}
      </UbButton>
      <UbButton
        type="submit"
        form={formId}
        busy={busy}
        busyLabel={t('library.working')}
        data-testid="library-form-save"
      >
        {t('common.action.save')}
      </UbButton>
    </>
  );
}

/** The title's own fields; the rarely used ones sit behind "More details". */
function TitleFields({
  t,
  categories,
  autoFocus = false,
}: Readonly<{ t: TranslateFn; categories: readonly LibraryCategory[]; autoFocus?: boolean }>) {
  const materialOptions = useMemo(
    () => MATERIAL_TYPES.map((value) => ({ value, label: t(`library.material.${value}`) })),
    [t]
  );
  const categoryOptions = useMemo(
    () => [
      { value: NONE, label: t('library.form.noCategory') },
      ...categories.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
    ],
    [t, categories]
  );

  return (
    <>
      <UbField name="title" label={t('library.form.title')} required>
        {(field) => <UbTextInput {...field} maxLength={300} autoFocus={autoFocus} />}
      </UbField>
      <UbField
        name="authors"
        label={t('library.form.authors')}
        hint={t('library.form.authors.hint')}
      >
        {(field) => <UbTextInput {...field} maxLength={300} />}
      </UbField>
      <UbField name="isbn" label={t('library.form.isbn')}>
        {(field) => (
          <UbTextInput {...field} maxLength={17} inputMode="numeric" autoComplete="off" />
        )}
      </UbField>
      <UbField name="materialType" label={t('library.form.materialType')} controlOwnsLabel>
        {(field) => (
          <UbChoiceChips<MaterialType>
            id={field.id}
            ariaLabel={t('library.form.materialType')}
            value={field.value as MaterialType}
            onChange={(next) => field.onChange(next)}
            onBlur={field.onBlur}
            options={materialOptions}
          />
        )}
      </UbField>
      <UbField name="categoryId" label={t('library.column.category')}>
        {(field) => (
          <UbSelect
            id={field.id}
            name={field.name}
            value={(field.value as string) || NONE}
            options={categoryOptions}
            onChange={(value: string) => field.onChange(value === NONE ? '' : value)}
          />
        )}
      </UbField>
      <UbField name="language" label={t('library.title.language')}>
        {(field) => <UbTextInput {...field} maxLength={40} />}
      </UbField>
      <UbDisclosure label={t('library.form.more')} keepMounted>
        <UbStack gap={4}>
          <UbField name="subtitle" label={t('library.form.subtitle')}>
            {(field) => <UbTextInput {...field} maxLength={300} />}
          </UbField>
          <UbField name="publisher" label={t('library.title.publisher')}>
            {(field) => <UbTextInput {...field} maxLength={160} />}
          </UbField>
          <UbField name="edition" label={t('library.title.edition')}>
            {(field) => <UbTextInput {...field} maxLength={40} />}
          </UbField>
          <UbField name="year" label={t('library.title.year')}>
            {(field) => <UbTextInput {...field} maxLength={4} inputMode="numeric" />}
          </UbField>
          <UbField name="callNumber" label={t('library.title.callNumber')}>
            {(field) => <UbTextInput {...field} maxLength={40} />}
          </UbField>
          <UbField name="keywords" label={t('library.form.keywords')}>
            {(field) => <UbTextInput {...field} maxLength={300} />}
          </UbField>
          <UbField name="notes" label={t('library.title.notes')}>
            {(field) => <UbTextInput {...field} maxLength={2000} />}
          </UbField>
        </UbStack>
      </UbDisclosure>
    </>
  );
}

/** A form whose copies block is at `prefix` ("copies." in Add book, "" in Add copies). */
type FieldValuesWithCopies = Record<string, unknown>;

/**
 * FR-4 — how many, where, what they cost and where they came from, and the
 * numbers: "Next available" (the counter) or "I'll type them" (continuing a
 * paper register), one field per copy.
 */
function CopiesFields({
  t,
  control,
  prefix,
  locations,
  today,
  autoFocus = false,
}: Readonly<{
  t: TranslateFn;
  control: Control<FieldValuesWithCopies>;
  prefix: string;
  locations: readonly LibraryLocation[];
  today: string;
  autoFocus?: boolean;
}>) {
  const [count, numbering] = useWatch({
    control,
    name: [`${prefix}count`, `${prefix}numbering`],
  }) as [string, 'auto' | 'typed'];
  const typed = Math.min(Math.max(Number(count) || 0, 0), COPIES_MAX);
  const sourceOptions = useMemo(
    () => COPY_SOURCES.map((value) => ({ value, label: t(`library.copy.source.${value}`) })),
    [t]
  );
  const locationOptions = useMemo(
    () => [
      { value: NONE, label: t('library.form.noLocation') },
      ...locations.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.code })),
    ],
    [t, locations]
  );

  return (
    <>
      <UbField name={`${prefix}count`} label={t('library.form.count')} required>
        {(field) => (
          <UbTextInput {...field} inputMode="numeric" maxLength={3} autoFocus={autoFocus} />
        )}
      </UbField>
      <UbField name={`${prefix}numbering`} label={t('library.form.numbering')} controlOwnsLabel>
        {(field) => (
          <UbChoiceChips<'auto' | 'typed'>
            id={field.id}
            ariaLabel={t('library.form.numbering')}
            value={field.value as 'auto' | 'typed'}
            onChange={(next) => field.onChange(next)}
            onBlur={field.onBlur}
            options={[
              { value: 'auto', label: t('library.form.numbering.auto') },
              { value: 'typed', label: t('library.form.numbering.typed') },
            ]}
          />
        )}
      </UbField>
      {numbering === 'typed' &&
        Array.from({ length: typed }, (_, i) => (
          <UbField
            key={i}
            name={`${prefix}numbers.${i}`}
            label={t('library.form.numberFor', { n: i + 1 })}
            required
          >
            {(field) => (
              <UbTextInput
                {...field}
                value={(field.value as string | undefined) ?? ''}
                maxLength={24}
                autoComplete="off"
                className="ds-mono"
              />
            )}
          </UbField>
        ))}
      {locations.length > 0 && (
        <UbField name={`${prefix}locationId`} label={t('library.copy.place')}>
          {(field) => (
            <UbSelect
              id={field.id}
              name={field.name}
              value={(field.value as string) || NONE}
              options={locationOptions}
              onChange={(value: string) => field.onChange(value === NONE ? '' : value)}
            />
          )}
        </UbField>
      )}
      <UbField name={`${prefix}price`} label={t('library.copy.price')}>
        {(field) => (
          <UbMoneyInput
            {...field}
            value={field.value as string}
            onChange={field.onChange}
            inputMode="decimal"
          />
        )}
      </UbField>
      <UbField name={`${prefix}acquiredOn`} label={t('library.copy.acquiredOn')}>
        {(field) => <UbDateInput {...field} value={field.value as string} max={today} />}
      </UbField>
      <UbField name={`${prefix}source`} label={t('library.copy.source')} controlOwnsLabel>
        {(field) => (
          <UbChoiceChips<CopySource>
            id={field.id}
            ariaLabel={t('library.copy.source')}
            value={field.value as CopySource}
            onChange={(next) => field.onChange(next)}
            onBlur={field.onBlur}
            options={sourceOptions}
          />
        )}
      </UbField>
      <UbField
        name={`${prefix}sourceNote`}
        label={t('library.form.sourceNote')}
        placeholder={t('library.form.sourceNote.placeholder')}
      >
        {(field) => <UbTextInput {...field} maxLength={160} />}
      </UbField>
      <UbDisclosure label={t('library.form.more')} keepMounted>
        <UbStack gap={4}>
          <UbField name={`${prefix}volumeLabel`} label={t('library.copy.volume')}>
            {(field) => <UbTextInput {...field} maxLength={24} />}
          </UbField>
          <UbField
            name={`${prefix}isReference`}
            label={t('library.copy.reference')}
            controlOwnsLabel
          >
            {(field) => (
              <UbCheckbox
                checked={field.value === true}
                onChange={(checked) => field.onChange(checked)}
                label={t('library.form.reference')}
              />
            )}
          </UbField>
        </UbStack>
      </UbDisclosure>
    </>
  );
}
