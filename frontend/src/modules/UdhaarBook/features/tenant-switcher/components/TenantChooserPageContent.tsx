'use client';

import { useMemo, useState } from 'react';

import { Plus, Star } from 'lucide-react';

import {
  UbAvatar,
  UbBox,
  UbButton,
  UbCard,
  UbEmptyState,
  UbPressable,
  UbListItemText,
  UbPageHeader,
  UbPageShell,
  UbStack,
  UbStatusBadge,
  UbStatusBanner,
  UbText,
  UbTextInput,
} from 'src/design-system';
import { MLSpinner } from 'src/design-system/primitives';
import { useTranslation } from 'src/hooks/useTranslation';
import { cn } from 'src/utils/cn';

import { useTenantSwitcher } from '../hooks/useTenantSwitcher';
import { filterTenants, needsChooserSearch } from '../view-model/tenantDisplay';

/**
 * PLT-04 FR-9 / §7 — the full-screen chooser at `/switch`.
 *
 * It is where a user lands with several memberships and no default (FR-9), what
 * "See all" opens from the menu (EC-5), and — until PLT-05 ships its acceptance
 * screen in Sprint 2 — where an invited-only user is sent, because a list that
 * names the business and says "Invitation" is more honest than a dashboard that
 * has no business behind it.
 *
 * §5 / EC-5 — the search box appears above eight rows and not before: a search
 * field over three businesses is furniture.
 *
 * The three empty-state variants (R-C-9): first-use (no business at all →
 * create one), filtered (the search matched nothing → clear it), and error.
 */
export function TenantChooserPageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const switcher = useTenantSwitcher();
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () => filterTenants(switcher.groups.active, query),
    [switcher.groups.active, query]
  );
  const showSearch = needsChooserSearch(switcher.groups.active.length);
  const isFiltered = query.trim().length > 0;

  return (
    <UbPageShell
      header={
        <UbPageHeader
          title={t('tenant.switcher.title')}
          subtitle={t('tenant.chooser.subtitle')}
          actions={
            <UbButton
              variant="secondary"
              onClick={switcher.addBusiness}
              icon={<Plus aria-hidden className="h-4 w-4" />}
              disabled={!switcher.canSwitch}
            >
              {t('tenant.switcher.add')}
            </UbButton>
          }
          controls={
            showSearch ? (
              <UbTextInput
                value={query}
                onChange={setQuery}
                placeholder={t('tenant.chooser.search')}
                aria-label={t('tenant.chooser.search')}
              />
            ) : undefined
          }
        />
      }
    >
      <UbStack gap={4}>
        {!switcher.canSwitch && (
          <UbStatusBanner
            tone="offline"
            title={t('common.network.offline')}
            description={t('tenant.switcher.offline.body')}
          />
        )}

        {switcher.error && (
          <UbStatusBanner
            tone="error"
            title={switcher.error.message}
            description={switcher.error.requestId ?? undefined}
            action={
              <UbButton variant="secondary" size="sm" onClick={switcher.clearError}>
                {t('common.action.dismiss')}
              </UbButton>
            }
          />
        )}

        {rows.length === 0 && (
          <UbEmptyState
            variant={isFiltered ? 'filtered' : 'firstUse'}
            title={
              isFiltered ? t('tenant.chooser.empty.filtered.title') : t('tenant.chooser.empty.title')
            }
            description={
              isFiltered ? t('tenant.chooser.empty.filtered.body') : t('tenant.chooser.empty.body')
            }
            action={
              isFiltered ? (
                <UbButton variant="secondary" onClick={() => setQuery('')}>
                  {t('common.action.clearFilters')}
                </UbButton>
              ) : (
                <UbButton onClick={switcher.addBusiness}>{t('tenant.switcher.add')}</UbButton>
              )
            }
          />
        )}

        {rows.length > 0 && (
          <UbCard padded={false}>
            <UbStack as="ul">
              {rows.map((tenant) => {
                const busy = switcher.switchingTenantId === tenant.id;
                const isActive = tenant.id === switcher.activeTenant?.id;
                return (
                  <UbBox
                    as="li"
                    key={tenant.id}
                    className="border-b border-border-hairline last:border-b-0"
                  >
                    <UbPressable
                      onClick={() => void switcher.switchTo(tenant.id)}
                      disabled={!switcher.canSwitch || busy}
                      selected={isActive}
                      className={cn(
                        'flex min-h-[56px] items-center gap-3 px-4 py-3',
                        'hover:bg-surface-hover disabled:opacity-60',
                        isActive && 'bg-accent-quiet'
                      )}
                    >
                      <UbAvatar name={tenant.name} />
                      <UbListItemText
                        primary={tenant.name}
                        secondary={tenant.role ? t(`tenant.role.${tenant.role}`) : undefined}
                      />
                      {tenant.isDefault && (
                        <Star
                          aria-label={t('tenant.switcher.isDefault')}
                          className="h-4 w-4 shrink-0 text-warning"
                        />
                      )}
                      {busy && <MLSpinner />}
                    </UbPressable>
                  </UbBox>
                );
              })}
            </UbStack>
          </UbCard>
        )}

        {/* FR-8 — invitations are listed separately and do not switch. PLT-05
            owns the acceptance screen; until it ships this says what it is. */}
        {switcher.groups.invited.length > 0 && (
          <UbCard title={t('tenant.switcher.invitations')}>
            <UbStack as="ul" gap={2}>
              {switcher.groups.invited.map((tenant) => (
                <UbStack
                  as="li"
                  key={tenant.id}
                  direction="row"
                  align="center"
                  justify="between"
                  gap={3}
                >
                  <UbText as="span" variant="body-sm" truncate>
                    {tenant.name}
                  </UbText>
                  <UbStatusBadge tone="info" label={t('tenant.status.invited')} />
                </UbStack>
              ))}
            </UbStack>
            <UbText variant="caption" tone="tertiary" className="mt-3">
              {t('tenant.chooser.invitations.body')}
            </UbText>
          </UbCard>
        )}

        {/* EC-6 — a suspended tenant is shown, greyed, with the reason it is. */}
        {switcher.groups.suspended.length > 0 && (
          <UbCard title={t('tenant.status.suspended')}>
            <UbStack as="ul" gap={2}>
              {switcher.groups.suspended.map((tenant) => (
                <UbStack
                  as="li"
                  key={tenant.id}
                  direction="row"
                  align="center"
                  justify="between"
                  gap={3}
                  className="opacity-60"
                >
                  <UbText as="span" variant="body-sm" truncate>
                    {tenant.name}
                  </UbText>
                  <UbStatusBadge tone="warning" label={t('tenant.status.suspended')} />
                </UbStack>
              ))}
            </UbStack>
            <UbText variant="caption" tone="tertiary" className="mt-3">
              {t('tenant.chooser.suspended.body')}
            </UbText>
          </UbCard>
        )}
      </UbStack>
    </UbPageShell>
  );
}
