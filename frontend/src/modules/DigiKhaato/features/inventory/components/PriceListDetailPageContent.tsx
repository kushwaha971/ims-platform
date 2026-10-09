'use client';

import { useCallback, useEffect, useState } from 'react';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

import { Pencil, Trash2 } from 'lucide-react';

import {
  UbAsyncCombobox,
  UbButton,
  UbCard,
  UbConfirmDialog,
  UbEmptyState,
  UbListItemText,
  UbMoneyInput,
  UbPageHeader,
  UbPageHeaderMobileActions,
  UbPageShell,
  UbPageSkeleton,
  UbPressable,
  UbSectionHeading,
  UbStack,
  UbText,
} from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES } from 'src/routes';
import { formatInr } from 'src/utils/money';
import { comboPaging } from 'src/utils/searchPaging';

import {
  deletePriceList,
  getPriceList,
  setPinnedRate,
  type PriceList,
  type PriceListDetail,
} from '../api/priceListService';
import { useItemSearch } from '../hooks/useItemSearch';
import { priceRule } from '../view-model/priceListDisplay';

const PriceListFormDialog = dynamic(
  () => import('./PriceListFormDialog').then((m) => m.PriceListFormDialog),
  { ssr: false }
);

type Load =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly list: PriceListDetail }
  | { readonly status: 'failed'; readonly missing: boolean };

/** The "pin a rate" row: pick an item, type its rate on this list. */
function PinRate({
  listId,
  initial,
  onPinned,
}: Readonly<{
  listId: string;
  initial: { itemId: string; name: string; rate: string } | null;
  onPinned: () => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const search = useItemSearch();
  const [item, setItem] = useState<{ id: string; name: string } | null>(
    initial ? { id: initial.itemId, name: initial.name } : null
  );
  const [rate, setRate] = useState(initial?.rate ?? '');
  const [busy, setBusy] = useState(false);
  const pin = async () => {
    if (!item || rate === '') return;
    setBusy(true);
    try {
      await setPinnedRate(listId, item.id, rate);
      setItem(null);
      setRate('');
      onPinned();
    } catch {
      // The global snackbar has said why.
    } finally {
      setBusy(false);
    }
  };
  return (
    <UbStack direction="row" gap={2} align="end" wrap data-testid="price-list-pin">
      <UbStack gap={1} className="min-w-0 flex-[2_1_14rem]">
        <UbAsyncCombobox
          aria-label={t('priceLists.pin.item')}
          value={item?.id ?? null}
          selectedLabel={item?.name}
          query={search.query}
          onQueryChange={search.setQuery}
          onOpen={search.activate}
          paging={comboPaging(search, t)}
          options={search.options}
          loading={search.status === 'loading'}
          onSelect={(option) => {
            const row = search.find(option.value);
            if (row) {
              setItem({ id: row.id, name: row.name });
              setRate(row.sellingPrice);
            }
          }}
          placeholder={t('priceLists.pin.item')}
          searchPlaceholder={t('items.list.searchPlaceholder')}
          emptyLabel={t('priceLists.pin.noItems')}
          loadingLabel={t('common.loading')}
        />
      </UbStack>
      <UbStack gap={1} className="flex-[1_1_8rem]">
        <UbMoneyInput
          aria-label={t('priceLists.pin.rate')}
          value={rate}
          onChange={setRate}
          placeholder={t('priceLists.pin.rate')}
        />
      </UbStack>
      <UbButton onClick={() => void pin()} disabled={!item || rate === ''} busy={busy}>
        {t('priceLists.pin.action')}
      </UbButton>
    </UbStack>
  );
}

/**
 * Shop gap §1.6 — one price list: its rule, and the items whose rate is pinned
 * exactly. Every other item is charged at its selling price moved by the rule.
 */
export function PriceListDetailPageContent({ id }: Readonly<{ id: string }>): React.JSX.Element {
  const { t } = useTranslation();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const canWrite = hasModule('inventory') && can('inventory.item.write');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Tapping a pinned row puts it back in the pin row to change. */
  const [repin, setRepin] = useState<{ itemId: string; name: string; rate: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPriceList(id, controller.signal)
      .then((list) => setLoad({ status: 'ready', list }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const status = (error as { status?: number } | null)?.status;
        setLoad({ status: 'failed', missing: status === 404 });
      });
    return () => controller.abort();
  }, [id, attempt]);
  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  const unpin = async (itemId: string) => {
    try {
      await setPinnedRate(id, itemId, null);
      refetch();
    } catch {
      // The global snackbar has said why.
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await deletePriceList(id);
      dispatch(showSnackbar({ severity: 'success', id: 'priceLists.deleted' }));
      router.push(ROUTES.ITEM_PRICE_LISTS);
    } catch {
      setBusy(false);
    }
  };

  if (load.status === 'failed') {
    return (
      <UbPageShell>
        <UbEmptyState
          variant={load.missing ? 'firstUse' : 'error'}
          title={t(load.missing ? 'priceLists.notFound' : 'priceLists.error')}
          action={
            load.missing ? undefined : (
              <UbButton variant="secondary" onClick={refetch}>
                {t('common.action.retry')}
              </UbButton>
            )
          }
        />
      </UbPageShell>
    );
  }
  if (load.status === 'loading') return <UbPageSkeleton variant="card" />;
  const list = load.list;

  return (
    <UbPageShell>
      <UbPageHeader
        title={list.name}
        subtitle={priceRule(list.adjustPercent, t)}
        /* docs/mobile-redesign (A3) — on a phone these actions are a worded ⋯ sheet. */
        renderMobileActions={(actions) => (
          <UbPageHeaderMobileActions
            actions={actions}
            mobile={{
              menuLabel: t('common.action.moreActions'),
              closeLabel: t('common.action.close'),
            }}
          />
        )}
        actions={
          canWrite ? (
            <>
              <UbButton
                variant="secondary"
                icon={<Pencil className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                onClick={() => setEditing(true)}
              >
                {t('priceLists.edit')}
              </UbButton>
              <UbButton
                variant="secondary"
                icon={<Trash2 className="h-4 w-4" aria-hidden />}
                iconOnly="mobile"
                onClick={() => setDeleting(true)}
              >
                {t('priceLists.delete')}
              </UbButton>
            </>
          ) : undefined
        }
      />
      <UbStack gap={3}>
        <UbText variant="body-sm" tone="secondary">
          {t('priceLists.detail.explain', { rule: priceRule(list.adjustPercent, t) })}
        </UbText>
        <UbSectionHeading
          as="h2"
          title={t('priceLists.pinnedTitle')}
          meta={t('priceLists.pinned', { count: list.rates.length })}
        />
        {canWrite && (
          <PinRate
            key={repin?.itemId ?? 'new'}
            listId={list.id}
            initial={repin}
            onPinned={() => {
              setRepin(null);
              refetch();
            }}
          />
        )}
        {list.rates.length === 0 ? (
          <UbText variant="caption" tone="tertiary">
            {t('priceLists.pinnedEmpty')}
          </UbText>
        ) : (
          <UbCard padded>
            <UbStack as="ul" gap={0} aria-label={t('priceLists.pinnedTitle')}>
              {list.rates.map((row) => {
                const body = (
                  <UbListItemText
                    className="min-w-0 flex-1"
                    primary={row.item.name}
                    secondary={t('priceLists.pinnedLine', {
                      selling: formatInr(row.sellingPrice),
                      rule: formatInr(row.fromPercent),
                    })}
                  />
                );
                return (
                  <UbStack
                    as="li"
                    key={row.item.id}
                    direction="row"
                    align="center"
                    gap={3}
                    className="border-b border-border-hairline py-3 last:border-b-0"
                    data-testid="price-list-rate"
                  >
                    {canWrite ? (
                      <UbPressable
                        className="min-w-0 flex-1 text-left"
                        onClick={() =>
                          setRepin({ itemId: row.item.id, name: row.item.name, rate: row.rate })
                        }
                      >
                        {body}
                      </UbPressable>
                    ) : (
                      body
                    )}
                    <UbText variant="body-sm-medium" className="ds-num shrink-0">
                      {formatInr(row.rate)}
                    </UbText>
                    {canWrite && (
                      <UbButton
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="h-4 w-4" aria-hidden />}
                        iconOnly
                        aria-label={t('priceLists.unpin', { item: row.item.name })}
                        onClick={() => void unpin(row.item.id)}
                      >
                        {t('priceLists.unpin', { item: row.item.name })}
                      </UbButton>
                    )}
                  </UbStack>
                );
              })}
            </UbStack>
          </UbCard>
        )}
      </UbStack>
      {editing && (
        <PriceListFormDialog
          editing={list as PriceList}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refetch();
          }}
        />
      )}
      <UbConfirmDialog
        open={deleting}
        onOpenChange={(next) => (next ? undefined : setDeleting(false))}
        title={t('priceLists.deleteTitle', { name: list.name })}
        description={t('priceLists.deleteBody', { count: list.partyCount })}
        confirmLabel={t('priceLists.delete')}
        cancelLabel={t('common.action.cancel')}
        closeLabel={t('common.action.close')}
        onConfirm={() => void remove()}
        busy={busy}
        destructive
      />
    </UbPageShell>
  );
}
