'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';

import {
  UbActionLink,
  UbButton,
  UbConfirmDialog,
  UbEmptyState,
  UbLink,
  UbPageHeader,
  UbPageShell,
  UbPageSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { ROUTES } from 'src/routes';

import { useTitleDetail } from '../hooks/useCatalogueDetail';
import { selectLibraryCatalogueForm } from '../redux/libraryCatalogueFormSlice';
import { copyPlace, shelfLine } from '../view-model/copyDisplay';

import { CatalogueActionsMenu } from './CatalogueActionsMenu';
import { CopyStatusBadge } from './CopyStatusBadge';
import { LibraryCard, LibraryFacts } from './LibraryCard';

const CatalogueDrawersLazy = dynamic(
  () => import('./CatalogueDrawers').then((m) => m.CatalogueDrawers),
  { ssr: false }
);

/**
 * F03 (LIB-02 FR-11, FR-12, §8) — `/library/catalogue/[titleId]`: the work and
 * every copy of it. The title owns its line and wraps; the badges sit on the
 * caption line underneath (CLAUDE.md, LED-03's rule), so a long Hindi title is
 * never cut to make room for "Archived".
 *
 * Archive is offered only when every copy is withdrawn — the server's rule
 * (FR-12, 409 `library_title_has_copies`) shown before the tap rather than
 * after it. Holds and the 12-month issue count are absent until LIB-06/08 give
 * them a table.
 */
export function TitleDetailPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const detail = useTitleDetail(id);
  const { drawer } = useAppSelector(selectLibraryCatalogueForm);
  const [confirming, setConfirming] = useState(false);
  const { title } = detail;

  if (!detail.canRead) {
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
  if (detail.status === 'failed' && !title) {
    const notFound = detail.error?.status === 404;
    return (
      <UbPageShell>
        <UbEmptyState
          variant={notFound ? 'firstUse' : 'error'}
          title={t(notFound ? 'library.title.notFound' : 'library.title.error.title')}
          description={notFound ? undefined : detail.error?.message}
          requestId={notFound ? null : (detail.error?.requestId ?? null)}
          requestIdLabel={t('common.error.reference')}
          action={
            notFound ? (
              <UbActionLink href={ROUTES.LIBRARY_CATALOGUE} variant="secondary">
                {t('library.catalogue.title')}
              </UbActionLink>
            ) : (
              <UbButton variant="secondary" onClick={detail.refetch}>
                {t('common.action.retry')}
              </UbButton>
            )
          }
        />
      </UbPageShell>
    );
  }
  if (!title) return <UbPageSkeleton variant="card" />;

  const archived = title.status === 'archived';
  const line = shelfLine(title);
  const facts: readonly [string, string][] = [
    [t('library.title.isbn'), title.isbn13 ?? ''],
    [t('library.title.publisher'), title.publisher],
    [t('library.title.edition'), title.edition],
    [t('library.title.year'), title.year ? String(title.year) : ''],
    [t('library.title.language'), title.language],
    [t('library.column.category'), title.category?.name ?? ''],
    [t('library.title.callNumber'), title.callNumber],
  ].filter((fact): fact is [string, string] => fact[1] !== '');

  return (
    <UbPageShell>
      <UbPageHeader
        title={title.title}
        actions={
          <UbStack direction="row" gap={2}>
            {detail.canWrite && !archived && (
              <UbButton
                icon={<Plus className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                className="max-sm:h-10 max-sm:w-10"
                onClick={detail.addCopies}
                data-testid="library-add-copies"
              >
                {t('library.title.addCopies')}
              </UbButton>
            )}
            <CatalogueActionsMenu
              t={t}
              items={[
                {
                  key: 'edit',
                  label: t('library.title.edit'),
                  icon: Pencil,
                  action: detail.canWrite ? detail.edit : undefined,
                },
                {
                  key: 'archive',
                  label: t(archived ? 'library.title.restore' : 'library.title.archive'),
                  icon: archived ? ArchiveRestore : Archive,
                  action:
                    detail.canWrite && (archived || title.copiesTotal === 0)
                      ? () => setConfirming(true)
                      : undefined,
                },
              ]}
            />
          </UbStack>
        }
      />
      <UbStack gap={3} data-testid="library-title-screen">
        <UbStack gap={1}>
          {(title.subtitle || title.authors) && (
            <UbText variant="body" tone="secondary">
              {[title.subtitle, title.authors].filter(Boolean).join(' · ')}
            </UbText>
          )}
          <UbStack direction="row" gap={2} wrap align="center">
            <UbText variant="caption" tone="tertiary">
              {`${t(`library.material.${title.materialType}`)} · ${t(line.id, line.params)}`}
            </UbText>
            {archived && <UbStatusBadge tone="neutral" label={t('library.title.archived')} />}
          </UbStack>
        </UbStack>

        {facts.length > 0 && (
          <LibraryCard>
            <LibraryFacts items={facts} />
          </LibraryCard>
        )}

        <LibraryCard title={t('library.title.copiesHeading', { count: title.copies.length })}>
          {title.copies.length === 0 ? (
            <UbText variant="body-sm" tone="tertiary">
              {t('library.title.noCopies')}
            </UbText>
          ) : (
            <UbStack gap={2} data-testid="library-title-copies">
              {title.copies.map((copy) => (
                <UbStack key={copy.id} direction="row" gap={3} align="center" wrap>
                  <UbLink
                    href={`${ROUTES.LIBRARY_COPIES}/${copy.id}`}
                    variant="body-sm"
                    className="ds-mono"
                  >
                    {copy.accessionNumber}
                  </UbLink>
                  {copy.volumeLabel && (
                    <UbText variant="caption" tone="secondary">
                      {copy.volumeLabel}
                    </UbText>
                  )}
                  {copyPlace(copy) && (
                    <UbText variant="caption" tone="tertiary">
                      {copyPlace(copy)}
                    </UbText>
                  )}
                  <CopyStatusBadge status={copy.status} t={t} />
                  {copy.isReference && (
                    <UbStatusBadge tone="neutral" label={t('library.copy.reference')} />
                  )}
                </UbStack>
              ))}
            </UbStack>
          )}
        </LibraryCard>

        {title.notes && (
          <LibraryCard title={t('library.title.notes')}>
            <UbText variant="body-sm">{title.notes}</UbText>
          </LibraryCard>
        )}
      </UbStack>

      <UbConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t(archived ? 'library.title.restoreConfirm' : 'library.title.archiveConfirm', {
          title: title.title,
        })}
        description={t(archived ? 'library.title.restoreBody' : 'library.title.archiveBody')}
        confirmLabel={t(archived ? 'library.title.restore' : 'library.title.archive')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        busy={detail.archiveStatus === 'loading'}
        onConfirm={async () => {
          if (await detail.setArchived(!archived)) setConfirming(false);
        }}
      />
      {drawer && <CatalogueDrawersLazy />}
    </UbPageShell>
  );
}
