'use client';

import { useState } from 'react';

import dynamic from 'next/dynamic';

import { Lock, Plus } from 'lucide-react';

import {
  UbButton,
  UbDivider,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbPanel,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbTabs,
  UbText,
} from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { useInventoryMasters } from '../hooks/useInventoryMasters';

const MasterFormDialog = dynamic(
  () => import('./MasterFormDialog').then((m) => m.MasterFormDialog),
  {
    ssr: false,
  }
);

type MasterTab = 'categories' | 'units';

/**
 * INV-04 — the two small masters items depend on. Categories are one level
 * deep with their live item counts; units show which are the standard GST
 * codes (locked) and which are this shop's own. Create-only at MVP, as the
 * FRD says — there is no rename control to promise something that is not built.
 */
export function InventoryMastersPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const masters = useInventoryMasters();
  const [tab, setTab] = useState<MasterTab>('categories');
  const [adding, setAdding] = useState<'category' | 'unit' | null>(null);

  return (
    <UbPageShell>
      <UbPageHeader
        title={t('inventory.masters.title')}
        actions={
          masters.canWrite ? (
            <UbButton
              icon={<Plus className="h-4 w-4" aria-hidden />}
              iconOnly="mobile"
              onClick={() => setAdding(tab === 'units' ? 'unit' : 'category')}
            >
              {tab === 'units'
                ? t('inventory.masters.unit.add')
                : t('inventory.masters.category.add')}
            </UbButton>
          ) : undefined
        }
      />
      <UbTabs<MasterTab>
        value={tab}
        onValueChange={setTab}
        ariaLabel={t('inventory.masters.title')}
        layout="fit"
        tabs={[
          { value: 'categories', label: t('inventory.masters.categories') },
          { value: 'units', label: t('inventory.masters.units') },
        ]}
      >
        {tab === 'categories' ? (
          masters.categoriesLoading && masters.categories.length === 0 ? (
            <UbSkeleton variant="list" />
          ) : masters.categories.length === 0 ? (
            <UbEmptyState
              variant="firstUse"
              title={t('inventory.masters.category.empty.title')}
              description={t('inventory.masters.category.empty.body')}
            />
          ) : (
            <UbPanel>
              <UbStack as="ul" gap={0} data-testid="category-list">
                {masters.categories.map((parent, index) => (
                  <UbStack as="li" key={parent.id} gap={0}>
                    {index > 0 && <UbDivider />}
                    <UbStack direction="row" justify="between" className="px-4 py-3">
                      <UbText variant="body-sm-medium">{parent.name}</UbText>
                      <UbText variant="caption" tone="tertiary">
                        {t('inventory.masters.itemCount', { count: parent.itemCount })}
                      </UbText>
                    </UbStack>
                    {parent.children.map((child) => (
                      <UbStack
                        key={child.id}
                        direction="row"
                        justify="between"
                        className="py-2 pl-8 pr-4"
                      >
                        <UbText variant="body-sm">{child.name}</UbText>
                        <UbText variant="caption" tone="tertiary">
                          {t('inventory.masters.itemCount', { count: child.itemCount })}
                        </UbText>
                      </UbStack>
                    ))}
                  </UbStack>
                ))}
              </UbStack>
            </UbPanel>
          )
        ) : masters.loading && masters.units.length === 0 ? (
          <UbSkeleton variant="list" />
        ) : (
          <UbPanel>
            <UbStack as="ul" gap={0} data-testid="unit-list">
              {masters.units.map((unit, index) => (
                <UbStack as="li" key={unit.id} gap={0}>
                  {index > 0 && <UbDivider />}
                  <UbStack
                    direction="row"
                    gap={3}
                    justify="between"
                    align="center"
                    className="px-4 py-3"
                  >
                    <UbStack gap={0} className="min-w-0">
                      <UbText variant="body-sm-medium" className="ds-mono">
                        {unit.code}
                      </UbText>
                      <UbText variant="caption" tone="tertiary">
                        {unit.name} ·{' '}
                        {unit.allowDecimal
                          ? t('inventory.masters.unit.decimalsOn')
                          : t('inventory.masters.unit.decimalsOff')}
                      </UbText>
                    </UbStack>
                    {unit.isSystem ? (
                      <UbStatusBadge
                        tone="neutral"
                        icon={<Lock className="h-3 w-3" aria-hidden />}
                        label={t('inventory.masters.unit.gst')}
                      />
                    ) : (
                      <UbStatusBadge tone="info" label={t('inventory.masters.unit.custom')} />
                    )}
                  </UbStack>
                </UbStack>
              ))}
            </UbStack>
          </UbPanel>
        )}
      </UbTabs>
      {adding && <MasterFormDialog kind={adding} onClose={() => setAdding(null)} />}
    </UbPageShell>
  );
}
