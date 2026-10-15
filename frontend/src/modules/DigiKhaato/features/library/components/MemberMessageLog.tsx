'use client';

import { useEffect, useState } from 'react';

import { UbButton, UbStack, UbText } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import type { TranslateFn } from 'src/hooks/useTranslation';
import { formatTimestamp } from 'src/utils/dates';

import { fetchMessageLog } from '../redux/libraryMessageThunk';
import { MESSAGE_KINDS } from '../types/message.types';

import { LibraryCard } from './LibraryCard';

import type { MessageLogRow } from '../types/message.types';

/** How many lines show before "Show all". */
const FIRST_LINES = 5;

/**
 * QA F4 — "each send appears in the person's log". What this student (or their
 * guardian) was sent from the desk, newest first: which message, when, to whom,
 * and the words themselves, so "I never got any message" has an answer on the
 * screen. `refreshKey` changes when a message dialog closes, so a send made a
 * moment ago is already here.
 */
export function MemberMessageLog({
  membershipId,
  refreshKey,
  t,
}: Readonly<{
  membershipId: string;
  refreshKey: number;
  t: TranslateFn;
}>): React.JSX.Element | null {
  const dispatch = useAppDispatch();
  const [rows, setRows] = useState<readonly MessageLogRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const promise = dispatch(fetchMessageLog(membershipId));
    void promise.then((result) => {
      if (fetchMessageLog.fulfilled.match(result)) {
        setRows(result.payload);
        setFailed(false);
      } else if (!result.meta.aborted) setFailed(true);
    });
    return () => promise.abort();
  }, [dispatch, membershipId, refreshKey]);

  if (rows === null && !failed) return null;
  const shown = all ? (rows ?? []) : (rows ?? []).slice(0, FIRST_LINES);
  const kindLabel = (kind: string): string =>
    (MESSAGE_KINDS as readonly string[]).includes(kind)
      ? t(`library.messages.log.kind.${kind}`)
      : t('library.messages.log.kind.message');

  return (
    <LibraryCard padded={false}>
      <UbStack gap={3} className="p-3" data-testid="library-message-log">
        <UbText as="h2" variant="body-medium">
          {t('library.messages.log.title')}
        </UbText>
        {failed && (
          <UbText variant="body-sm" tone="warning">
            {t('library.messages.log.error')}
          </UbText>
        )}
        {rows !== null && rows.length === 0 && (
          <UbText variant="body-sm" tone="tertiary">
            {t('library.messages.log.none')}
          </UbText>
        )}
        {shown.map((row) => (
          <UbStack key={row.id} gap={0}>
            <UbText variant="body-sm">{kindLabel(row.kind)}</UbText>
            <UbText variant="caption" tone="tertiary">
              {[
                row.sentAt ? formatTimestamp(row.sentAt) : '',
                t('library.messages.log.to', { name: row.to }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </UbText>
            {row.text && (
              <UbText variant="caption" tone="secondary" className="whitespace-pre-line">
                {row.text}
              </UbText>
            )}
          </UbStack>
        ))}
        {!all && (rows?.length ?? 0) > FIRST_LINES && (
          <UbButton variant="ghost" size="sm" className="self-start" onClick={() => setAll(true)}>
            {t('library.messages.log.showAll', { count: rows?.length ?? 0 })}
          </UbButton>
        )}
      </UbStack>
    </LibraryCard>
  );
}
