'use client';

import { useMemo, useState } from 'react';

import { ArrowLeftRight, LogOut, MonitorSmartphone, ShieldCheck } from 'lucide-react';

import { useAccountActions } from 'src/components/layout/useAccountActions';
import {
  UbAvatar,
  UbBox,
  UbMenuList,
  UbPageHeader,
  UbPageShell,
  UbSearchInput,
  UbText,
  type UbMenuListRow,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectActiveTenant } from 'src/redux/slice/sessionSlice';
import { ROUTES } from 'src/routes';

import { useNavigation } from '../useNavigation';

/**
 * docs/mobile-redesign/03 §3 — the phone's More tab: every destination that is
 * not one of the four tabs, in words, grouped exactly as the sidebar groups
 * them, then the business and the person.
 *
 * It is built from the same `useNavigation()` sections the rail renders, so the
 * two can never disagree about what exists or who may open it: a row a role
 * cannot see is not in either. Nothing is invented here; nothing is dropped.
 *
 * "Find a feature" filters the rows by their words, for the long tail a
 * merchant meets once a month and cannot remember the group of.
 */
export function MorePageContent(): React.JSX.Element {
  const { t } = useTranslation();
  const { sections, bottomNav } = useNavigation();
  const tenant = useAppSelector(selectActiveTenant);
  const { user, impersonating, locale, options, setLocale, signOut } = useAccountActions();
  const [query, setQuery] = useState('');

  const tabKeys = useMemo(() => new Set(bottomNav.map((tab) => tab.key)), [bottomNav]);
  const needle = query.trim().toLocaleLowerCase();

  const groups = useMemo(
    () =>
      sections
        .map((section) => ({
          key: section.key,
          title: t(section.labelId),
          rows: section.items
            .filter((item) => !tabKeys.has(item.key))
            .map<UbMenuListRow>((item) => {
              const Icon = item.icon;
              return {
                key: item.key,
                label: t(item.labelId),
                href: item.href,
                icon: <Icon aria-hidden className="h-5 w-5" />,
              };
            })
            .filter((row) => !needle || row.label.toLocaleLowerCase().includes(needle)),
        }))
        .filter((group) => group.rows.length > 0),
    [sections, tabKeys, needle, t]
  );

  const businessRows: UbMenuListRow[] = [
    {
      key: 'switch',
      label: t('nav.workspace.label'),
      caption: tenant?.name,
      href: ROUTES.SWITCH_TENANT,
      icon: <ArrowLeftRight aria-hidden className="h-5 w-5" />,
    },
  ];

  const displayName = user ? user.name || user.email : '';
  const accountRows: UbMenuListRow[] = [
    {
      key: 'devices',
      label: t('sessions.nav'),
      href: ROUTES.SETTINGS_DEVICES,
      icon: <MonitorSmartphone aria-hidden className="h-5 w-5" />,
    },
    ...(user?.isSuperAdmin && !impersonating
      ? [
          {
            key: 'console',
            label: t('admin.nav.console'),
            href: ROUTES.ADMIN_TENANTS,
            icon: <ShieldCheck aria-hidden className="h-5 w-5" />,
          },
        ]
      : []),
    {
      key: 'signout',
      label: t('auth.logout.action'),
      tone: 'danger',
      onSelect: () => void signOut(),
      icon: <LogOut aria-hidden className="h-5 w-5" />,
    },
  ];

  return (
    <UbPageShell header={<UbPageHeader title={t('nav.more')} />}>
      <UbSearchInput
        value={query}
        onChange={setQuery}
        placeholder={t('nav.more.search')}
        aria-label={t('nav.more.search')}
      />
      <UbBox className="-mx-4 flex flex-col lg:mx-0">
        {groups.map((group) => (
          <UbMenuList key={group.key} title={group.title} rows={group.rows} />
        ))}
        {needle && groups.length === 0 ? (
          <UbText as="p" variant="body" tone="tertiary" className="px-4 py-6">
            {t('nav.more.searchEmpty', { query: query.trim() })}
          </UbText>
        ) : null}

        {!needle && (
          <>
            <UbMenuList title={t('nav.section.business')} rows={businessRows} />

            <UbMenuList
              title={t('nav.more.you')}
              rows={[
                {
                  key: 'who',
                  label: displayName,
                  caption: user?.name ? user.email : undefined,
                  icon: <UbAvatar name={displayName || '?'} size="sm" />,
                },
              ]}
            />
            <UbMenuList
              title={t('auth.language.label')}
              selectable
              rows={options.map((option) => ({
                key: option.value,
                label: option.label,
                lang: option.value,
                selected: option.value === locale,
                onSelect: () => setLocale(option.value),
              }))}
            />
            <UbMenuList rows={accountRows} className="pb-2" />
          </>
        )}
      </UbBox>
    </UbPageShell>
  );
}
