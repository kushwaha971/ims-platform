'use client';

import { useCallback, useState } from 'react';

import dynamic from 'next/dynamic';

import {
  UbBox,
  UbButton,
  UbConfirmDialog,
  UbLink,
  UbPanel,
  UbPanelSection,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';
import { partyPath } from 'src/routes';

import { usePartyRelations } from '../hooks/usePartyRelations';
import { KIND_LABEL, relationLine } from '../view-model/partyRelationDisplay';

import type { PartyRelation } from '../types/party.types';

// Loaded with dynamic() from the khata: its words come with its own chunk.
import 'src/i18n/catalogues/partyLinks';

const PartyRelationDialogLazy = /* @__PURE__ */ dynamic(() =>
  import('./PartyRelationDialog').then((m) => m.PartyRelationDialog)
);

interface Row {
  readonly relation: PartyRelation;
  readonly viewpoint: 'person' | 'related';
}

/**
 * A6 (PLT-X04 §2 flow 3, §7) — "Guardian and payer" on the khata.
 *
 * Both directions in one list: on Rahul's khata "Guardian: Mohan", on Mohan's
 * "Guardian of Rahul". Each names the other party as a link to their khata.
 * An ended link stays listed with its end date, because "who was told" is a
 * question a merchant gets asked; Remove on a link a reminder has used ENDS it
 * (the server decides, the snackbar says which happened).
 *
 * The khata mounts this only while a module with roles is on (the detail's
 * `roles` key), so a plain shop never sees the section or makes its request.
 */
export function PartyRelationsSection({
  partyId,
  partyName,
  readOnly,
}: Readonly<{ partyId: string; partyName: string; readOnly: boolean }>): React.JSX.Element {
  const { t, d } = useTranslation();
  const relations = usePartyRelations(partyId, true);
  const { data, status, error, canWrite, removingId, remove, openDialog, refetch } = relations;
  const [confirming, setConfirming] = useState<Row | null>(null);
  const writable = canWrite && !readOnly;

  const rows: Row[] = data
    ? [
        ...data.asPerson.map((relation) => ({ relation, viewpoint: 'person' as const })),
        ...data.asRelated.map((relation) => ({ relation, viewpoint: 'related' as const })),
      ]
    : [];

  const confirmRemove = useCallback(() => {
    if (confirming) remove(confirming.relation.id);
    setConfirming(null);
  }, [confirming, remove]);

  return (
    /* The info panel's own frame and heading, so the rail reads as one column
       of sections rather than a panel and a louder card under it (look pass). */
    <UbPanel as="section">
      <UbPanelSection
        title={t('parties.relations.title')}
        action={
          writable ? (
            <UbButton variant="ghost" size="sm" onClick={openDialog}>
              {t('parties.relations.add')}
            </UbButton>
          ) : undefined
        }
      >
        {status === 'failed' && !data ? (
          <UbStack gap={2}>
            <UbText variant="body-sm" tone="tertiary">
              {error?.message ?? t('parties.relations.error')}
            </UbText>
            <UbBox>
              <UbButton variant="secondary" size="sm" onClick={refetch}>
                {t('common.action.retry')}
              </UbButton>
            </UbBox>
          </UbStack>
        ) : !data ? (
          <UbSkeleton variant="list" count={2} />
        ) : rows.length === 0 ? (
          <UbText variant="body-sm" tone="tertiary">
            {t('parties.relations.empty')}
          </UbText>
        ) : (
          <UbStack as="ul" gap={3}>
            {rows.map(({ relation, viewpoint }) => {
              const line = relationLine(t, relation, viewpoint);
              return (
                <UbStack
                  as="li"
                  key={`${viewpoint}:${relation.id}`}
                  direction="row"
                  align="start"
                  justify="between"
                  gap={2}
                >
                  {/* The line owns its width and wraps (the LED-03 rule); the
                    badges and the caption sit underneath it. */}
                  <UbStack gap={1} className="min-w-0">
                    <UbLink
                      href={partyPath(line.other.id)}
                      variant="body-sm"
                      className="line-clamp-2 whitespace-normal break-words"
                    >
                      {line.title}
                    </UbLink>
                    <UbStack direction="row" gap={2} className="flex-wrap" align="center">
                      {!relation.active && relation.toOn && (
                        <UbStatusBadge
                          tone="neutral"
                          label={t('parties.relations.ended', { date: d(relation.toOn) })}
                        />
                      )}
                      {relation.active && relation.receivesMessages && (
                        <UbStatusBadge tone="info" label={t('parties.relations.getsReminders')} />
                      )}
                      {line.other.status === 'archived' && (
                        <UbStatusBadge tone="neutral" label={t('parties.relations.archived')} />
                      )}
                      {line.other.mobileMasked && (
                        <UbText variant="caption" tone="tertiary">
                          {line.other.mobileMasked}
                        </UbText>
                      )}
                    </UbStack>
                  </UbStack>
                  {writable && relation.active && (
                    <UbButton
                      variant="ghost"
                      size="sm"
                      className="shrink-0"
                      busy={removingId === relation.id}
                      busyLabel={t('parties.relations.removing')}
                      onClick={() => setConfirming({ relation, viewpoint })}
                    >
                      {t('parties.relations.remove')}
                    </UbButton>
                  )}
                </UbStack>
              );
            })}
          </UbStack>
        )}

        {relations.dialogOpen && (
          <PartyRelationDialogLazy partyId={partyId} partyName={partyName} relations={relations} />
        )}
        <UbConfirmDialog
          open={confirming !== null}
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
          title={t('parties.relations.removeConfirm.title')}
          description={
            confirming
              ? t('parties.relations.removeConfirm.body', {
                  line: relationLine(t, confirming.relation, confirming.viewpoint).title,
                  kind: t(KIND_LABEL[confirming.relation.kind]),
                })
              : ''
          }
          confirmLabel={t('parties.relations.remove')}
          cancelLabel={t('common.action.cancel')}
          closeLabel={t('common.action.close')}
          onConfirm={confirmRemove}
          destructive
        />
      </UbPanelSection>
    </UbPanel>
  );
}
