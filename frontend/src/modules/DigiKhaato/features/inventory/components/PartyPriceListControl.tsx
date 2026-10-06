'use client';

import { useEffect, useMemo, useState } from 'react';

import { UbInfoRow, UbLink, UbSelect, UbStack, UbText } from 'src/design-system';
import { useAppDispatch } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { priceListPath, ROUTES } from 'src/routes';

import {
  assignPriceList,
  getPartyRates,
  listPriceLists,
  type PriceList,
} from '../api/priceListService';
import { priceRule } from '../view-model/priceListDisplay';

import 'src/i18n/catalogues/priceLists';

const NONE = 'none';

/**
 * The khata renders its info panel twice — the desktop rail and the phone's
 * "Details" disclosure, one hidden by CSS — so two of these are mounted at
 * once. A change made in one is announced to the other, or rotating a tablet
 * would show the list the merchant just changed away from.
 */
const CHANGED = 'ub:party-price-list';

/**
 * Shop gap §1.6 — on a customer's khata: which price list their bills start
 * from. A select for whoever may set prices; plain text for everyone else.
 * With no list made yet it links to where one is made rather than offering an
 * empty choice.
 */
export function PartyPriceListControl({
  partyId,
  canWrite,
}: Readonly<{ partyId: string; canWrite: boolean }>): React.JSX.Element | null {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const [lists, setLists] = useState<readonly PriceList[] | null>(null);
  const [current, setCurrent] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listPriceLists(controller.signal), getPartyRates(partyId, [], controller.signal)])
      .then(([all, mine]) => {
        setLists(all);
        setCurrent(mine.priceList?.id ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [partyId]);

  useEffect(() => {
    const heard = (event: Event) => {
      const detail = (event as CustomEvent<{ partyId: string; listId: string | null }>).detail;
      if (detail.partyId === partyId) setCurrent(detail.listId);
    };
    window.addEventListener(CHANGED, heard);
    return () => window.removeEventListener(CHANGED, heard);
  }, [partyId]);

  const options = useMemo(
    () => [
      { value: NONE, label: t('priceLists.party.none') },
      // The name alone: "Wholesale — 5% below selling price" was cut off in a
      // 300 px rail. The rule is the caption under the select.
      ...(lists ?? []).map((list) => ({ value: list.id, label: list.name })),
    ],
    [lists, t]
  );

  if (lists === null || current === undefined) return null;
  const chosen = lists.find((list) => list.id === current) ?? null;

  if (!canWrite || lists.length === 0) {
    if (!chosen && !canWrite) return null;
    return (
      <UbInfoRow
        label={t('priceLists.party.label')}
        value={
          chosen ? (
            <UbLink href={priceListPath(chosen.id)}>{chosen.name}</UbLink>
          ) : (
            <UbLink href={ROUTES.ITEM_PRICE_LISTS}>{t('priceLists.new')}</UbLink>
          )
        }
      />
    );
  }

  const change = async (value: string) => {
    const next = value === NONE ? null : value;
    setSaving(true);
    try {
      await assignPriceList(partyId, next);
      setCurrent(next);
      window.dispatchEvent(new CustomEvent(CHANGED, { detail: { partyId, listId: next } }));
      dispatch(showSnackbar({ severity: 'success', id: 'priceLists.party.saved' }));
    } catch {
      // The global snackbar has said why.
    } finally {
      setSaving(false);
    }
  };

  return (
    <UbStack gap={1} data-testid="party-price-list">
      <UbText variant="caption" tone="secondary">
        {t('priceLists.party.label')}
      </UbText>
      <UbSelect
        aria-label={t('priceLists.party.label')}
        value={current ?? NONE}
        onChange={(value) => void change(value)}
        options={options}
        disabled={saving}
      />
      {chosen && (
        <UbText variant="caption" tone="tertiary">
          {priceRule(chosen.adjustPercent, t)}
        </UbText>
      )}
    </UbStack>
  );
}
