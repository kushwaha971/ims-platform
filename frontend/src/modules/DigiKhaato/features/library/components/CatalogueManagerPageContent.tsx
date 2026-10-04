'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  UbButton,
  UbCard,
  UbConfirmDialog,
  UbDialog,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbNativeSelect,
  UbStack,
  UbStatusBadge,
  UbTextInput,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';

import { selectLibraryCatalogueForm } from '../redux/libraryCatalogueFormSlice';
import {
  deleteLibraryCategory,
  deleteLibraryLocation,
  fetchLibraryCategories,
  fetchLibraryLocations,
  mergeLibraryCategory,
  saveLibraryCategory,
  saveLibraryLocation,
} from '../redux/libraryCatalogueThunk';

/**
 * F03 (LIB-02 FR-8) — the library's own two lists: categories (one level,
 * mergeable) and locations (a short code a librarian writes on a shelf, and a
 * name). Either can be renamed; either is deleted only while nothing uses it
 * and is otherwise switched off, which hides it from the pickers and keeps
 * every book that already names it. The server decides "in use" (409 with the
 * count); this screen offers Delete only where its count says zero and
 * Switch off everywhere else.
 */
type Kind = 'categories' | 'locations';

/* Spelled out rather than built as `library.${kind}.…`: a template id is read by the locale
   checker as "any library.* message", which would tie this page to every catalogue a library
   key lives in. */
const WORDS = {
  categories: {
    title: 'library.categories.title',
    add: 'library.categories.add',
    empty: 'library.categories.empty',
    emptyBody: 'library.categories.emptyBody',
    name: 'library.categories.name',
  },
  locations: {
    title: 'library.locations.title',
    add: 'library.locations.add',
    empty: 'library.locations.empty',
    emptyBody: 'library.locations.emptyBody',
    name: 'library.locations.name',
  },
} as const;

interface Row {
  readonly id: string;
  readonly label: string;
  readonly secondary: string;
  readonly code: string;
  readonly name: string;
  readonly isActive: boolean;
  readonly used: number;
}

type Editing = { readonly id: string | null; readonly code: string; readonly name: string };

export function CatalogueManagerPageContent({ kind }: Readonly<{ kind: Kind }>): React.JSX.Element {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('library') && can('library.catalogue.read');
  const canWrite = canRead && can('library.catalogue.write');
  const state = useAppSelector(selectLibraryCatalogueForm);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [merging, setMerging] = useState<{ row: Row; into: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      kind === 'categories'
        ? dispatch(fetchLibraryCategories())
        : dispatch(fetchLibraryLocations()),
    [dispatch, kind]
  );
  useEffect(() => {
    if (!canRead) return undefined;
    const promise = load();
    return () => promise.abort();
  }, [load, canRead]);
  /* A merge refetches (the counts moved on two rows at once). */
  useEffect(() => {
    if (state.stale && canRead) void load();
  }, [load, state.stale, canRead]);

  const rows = useMemo<readonly Row[]>(
    () =>
      kind === 'categories'
        ? state.categories.map((c) => ({
            id: c.id,
            label: c.name,
            secondary: t('library.categories.count', { count: c.titleCount }),
            code: '',
            name: c.name,
            isActive: c.isActive,
            used: c.titleCount,
          }))
        : state.locations.map((l) => ({
            id: l.id,
            label: l.name ? `${l.code} · ${l.name}` : l.code,
            secondary: t('library.locations.count', { count: l.copyCount }),
            code: l.code,
            name: l.name,
            isActive: l.isActive,
            used: l.copyCount,
          })),
    [kind, state.categories, state.locations, t]
  );
  const status = kind === 'categories' ? state.categoriesStatus : state.locationsStatus;

  const run = useCallback(
    async (
      write: () => Promise<{ readonly meta: { readonly requestStatus: string } }>,
      doneId: string
    ): Promise<boolean> => {
      setBusy(true);
      const result = await write();
      setBusy(false);
      const ok = result.meta.requestStatus === 'fulfilled';
      if (ok) dispatch(showSnackbar({ severity: 'success', id: doneId }));
      return ok;
    },
    [dispatch]
  );

  const save = useCallback(async () => {
    if (!editing) return;
    const ok =
      kind === 'categories'
        ? await run(
            () => dispatch(saveLibraryCategory({ id: editing.id, name: editing.name })),
            'library.manager.saved'
          )
        : await run(
            () =>
              dispatch(
                saveLibraryLocation({ id: editing.id, code: editing.code, name: editing.name })
              ),
            'library.manager.saved'
          );
    if (ok) setEditing(null);
  }, [editing, kind, run, dispatch]);

  const setActive = useCallback(
    (row: Row, isActive: boolean) =>
      void run(
        () =>
          kind === 'categories'
            ? dispatch(saveLibraryCategory({ id: row.id, name: row.name, isActive }))
            : dispatch(
                saveLibraryLocation({ id: row.id, code: row.code, name: row.name, isActive })
              ),
        'library.manager.saved'
      ),
    [kind, run, dispatch]
  );

  const title = t(WORDS[kind].title);
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
    <UbPageShell>
      <UbPageHeader
        title={title}
        actions={
          canWrite && (
            <UbButton onClick={() => setEditing({ id: null, code: '', name: '' })}>
              {t(WORDS[kind].add)}
            </UbButton>
          )
        }
      />
      {status !== 'loading' && rows.length === 0 ? (
        <UbEmptyState
          variant="firstUse"
          title={t(WORDS[kind].empty)}
          description={t(WORDS[kind].emptyBody)}
        />
      ) : (
        <UbCard>
          <UbStack gap={3} data-testid={`library-${kind}`}>
            {rows.map((row) => (
              <UbStack key={row.id} direction="row" gap={2} align="center" wrap>
                <UbListItemText
                  primary={row.label}
                  secondary={row.secondary}
                  secondaryVariant="caption"
                  secondaryTone="tertiary"
                  className="min-w-0 flex-1"
                />
                {!row.isActive && <UbStatusBadge tone="neutral" label={t('library.manager.off')} />}
                {canWrite && (
                  <UbStack direction="row" gap={1} wrap>
                    <UbButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing({ id: row.id, code: row.code, name: row.name })}
                    >
                      {t('library.manager.rename')}
                    </UbButton>
                    {kind === 'categories' && row.used > 0 && rows.length > 1 && (
                      <UbButton
                        variant="ghost"
                        size="sm"
                        onClick={() => setMerging({ row, into: '' })}
                      >
                        {t('library.categories.merge')}
                      </UbButton>
                    )}
                    {row.used === 0 ? (
                      <UbButton variant="ghost" size="sm" onClick={() => setDeleting(row)}>
                        {t('library.manager.delete')}
                      </UbButton>
                    ) : (
                      <UbButton
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setActive(row, !row.isActive)}
                      >
                        {t(row.isActive ? 'library.manager.switchOff' : 'library.manager.switchOn')}
                      </UbButton>
                    )}
                  </UbStack>
                )}
              </UbStack>
            ))}
          </UbStack>
        </UbCard>
      )}

      {editing && (
        <UbDialog
          open
          onOpenChange={(next) => !next && setEditing(null)}
          title={t(editing.id ? 'library.manager.rename' : WORDS[kind].add)}
          closeLabel={t('common.action.close')}
          footer={
            <>
              <UbButton variant="secondary" onClick={() => setEditing(null)}>
                {t('common.action.cancel')}
              </UbButton>
              <UbButton
                busy={busy}
                busyLabel={t('library.working')}
                disabled={!(kind === 'categories' ? editing.name : editing.code).trim()}
                onClick={() => void save()}
              >
                {t('library.form.save')}
              </UbButton>
            </>
          }
        >
          <UbStack gap={3}>
            {kind === 'locations' && (
              <UbTextInput
                aria-label={t('library.locations.code')}
                placeholder={t('library.locations.code')}
                value={editing.code}
                maxLength={24}
                autoFocus
                onChange={(code: string) => setEditing({ ...editing, code })}
              />
            )}
            <UbTextInput
              aria-label={t(WORDS[kind].name)}
              placeholder={t(WORDS[kind].name)}
              value={editing.name}
              maxLength={kind === 'categories' ? 60 : 80}
              autoFocus={kind === 'categories'}
              onChange={(name: string) => setEditing({ ...editing, name })}
            />
          </UbStack>
        </UbDialog>
      )}

      {merging && (
        <UbDialog
          open
          onOpenChange={(next) => !next && setMerging(null)}
          title={t('library.categories.mergeTitle', { name: merging.row.name })}
          closeLabel={t('common.action.close')}
          footer={
            <>
              <UbButton variant="secondary" onClick={() => setMerging(null)}>
                {t('common.action.cancel')}
              </UbButton>
              <UbButton
                busy={busy}
                busyLabel={t('library.working')}
                disabled={!merging.into}
                onClick={async () => {
                  const ok = await run(
                    () =>
                      dispatch(mergeLibraryCategory({ id: merging.row.id, intoId: merging.into })),
                    'library.categories.merged'
                  );
                  if (ok) setMerging(null);
                }}
              >
                {t('library.categories.merge')}
              </UbButton>
            </>
          }
        >
          <UbNativeSelect
            aria-label={t('library.categories.mergeInto')}
            placeholder={t('library.categories.mergeInto')}
            value={merging.into}
            options={rows
              .filter((r) => r.id !== merging.row.id)
              .map((r) => ({ value: r.id, label: r.label }))}
            onChange={(into: string) => setMerging({ ...merging, into })}
          />
        </UbDialog>
      )}

      <UbConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={t('library.manager.deleteTitle', { name: deleting?.label ?? '' })}
        description={t('library.manager.deleteBody')}
        confirmLabel={t('library.manager.delete')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await run(
            () =>
              kind === 'categories'
                ? dispatch(deleteLibraryCategory(deleting.id))
                : dispatch(deleteLibraryLocation(deleting.id)),
            'library.manager.deleted'
          );
          if (ok) setDeleting(null);
        }}
      />
    </UbPageShell>
  );
}
