'use client';

import { useCallback, useEffect, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import {
  UbButton,
  UbCard,
  UbEmptyState,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbPressable,
  UbSkeleton,
  UbStack,
  UbText,
} from 'src/design-system';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { priceListPath } from 'src/routes';

import { listPriceLists, type PriceList } from '../api/priceListService';
import { priceRule } from '../view-model/priceListDisplay';

const PriceListFormDialog = dynamic(
  () => import('./PriceListFormDialog').then((m) => m.PriceListFormDialog),
  { ssr: false }
);

type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly lists: readonly PriceList[] }
  | { readonly status: 'failed' };

/**
 * Shop gap §1.6 — `/items/price-lists`. A price list is a rate card for a
 * group of customers ("Wholesale": 5% below selling price, with a few exact
 * rates pinned). A customer is put on a list from their khata page, and their
 * bills then start from the list's rate.
 */
export function PriceListsPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('inventory') && can('inventory.item.read');
  const canWrite = hasModule('inventory') && can('inventory.item.write');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!canRead) return undefined;
    const controller = new AbortController();
    listPriceLists(controller.signal)
      .then((lists) => setLoad({ status: 'ready', lists }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: 'failed' });
      });
    return () => controller.abort();
  }, [canRead, attempt]);

  const saved = useCallback(
    (list: PriceList) => {
      setAdding(false);
      router.push(priceListPath(list.id));
    },
    [router]
  );

  if (!canRead) {
    return (
      <UbPageShell>
        <UbEmptyState
          variant="firstUse"
          title={t('priceLists.noAccess.title')}
          description={t('priceLists.noAccess.body')}
        />
      </UbPageShell>
    );
  }

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('priceLists.title')}
        subtitle={t('priceLists.subtitle')}
        actions={
          canWrite ? (
            <UbButton
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              onClick={() => setAdding(true)}
            >
              {t('priceLists.new')}
            </UbButton>
          ) : undefined
        }
      />
      {load.status === 'loading' && <UbSkeleton variant="list" count={3} />}
      {load.status === 'failed' && (
        <UbEmptyState
          variant="error"
          title={t('priceLists.error')}
          action={
            <UbButton variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              {t('common.action.retry')}
            </UbButton>
          }
        />
      )}
      {load.status === 'ready' && load.lists.length === 0 && (
        <UbEmptyState
          variant="firstUse"
          title={t('priceLists.empty.title')}
          description={t('priceLists.empty.body')}
          action={
            canWrite ? (
              <UbButton variant="secondary" onClick={() => setAdding(true)}>
                {t('priceLists.new')}
              </UbButton>
            ) : undefined
          }
        />
      )}
      {load.status === 'ready' && load.lists.length > 0 && (
        <UbCard padded>
          <UbStack as="ul" gap={0} aria-label={t('priceLists.title')}>
            {load.lists.map((list) => (
              <UbStack
                as="li"
                key={list.id}
                gap={0}
                className="border-b border-border-hairline py-3 last:border-b-0"
                data-testid="price-list-row"
              >
                <UbPressable
                  className="w-full text-left"
                  onClick={() => router.push(priceListPath(list.id))}
                >
                  <UbStack direction="row" justify="between" align="center" gap={3}>
                    <UbListItemText
                      className="min-w-0 flex-1"
                      primary={list.name}
                      secondary={priceRule(list.adjustPercent, t)}
                    />
                    <UbText variant="caption" tone="secondary" className="shrink-0">
                      {[
                        t('priceLists.customers', { count: list.partyCount }),
                        t('priceLists.pinned', { count: list.rateCount }),
                      ].join(' · ')}
                    </UbText>
                  </UbStack>
                </UbPressable>
              </UbStack>
            ))}
          </UbStack>
        </UbCard>
      )}
      {adding && (
        <PriceListFormDialog editing={null} onClose={() => setAdding(false)} onSaved={saved} />
      )}
    </UbPageShell>
  );
}
