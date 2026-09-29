'use client';

import { useMemo } from 'react';

import dynamic from 'next/dynamic';

import { CalendarPlus, Trash2 } from 'lucide-react';

import {
  UbBox,
  UbButton,
  UbEmptyState,
  UbPageHeader,
  UbPageShell,
  UbPanel,
  UbPanelSection,
  UbSkeleton,
  UbStack,
  UbStatusBadge,
  UbSwitch,
  UbText,
} from 'src/design-system';
import { useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { todayInTenantTz } from 'src/utils/dates';

import { useBusinessDays } from '../hooks/useBusinessDays';
import { groupByMonth, moduleName, moduleOnly } from '../view-model/calendarDisplay';

import { WeekdayChips } from './WeekdayChips';

// A form belongs in the chunk that OPENS it (CLAUDE.md, the LED-03 lesson).
const ClosedDayDialog = dynamic(() =>
  import('./ClosedDayDialog').then((module) => module.ClosedDayDialog)
);

/**
 * A9b (PLT-X08 §2, §7-§8) — Settings → Business days: the weekdays the business
 * is closed, a per-feature override for each feature that reads the calendar,
 * and dated closures for the next twelve months grouped by month.
 *
 * Everyone may read it (a counter clerk needs to know the shop is shut on
 * Sunday); `platform.calendar.manage` (owner, admin) changes it. The Settings
 * hub links here only while an enabled feature reads the calendar; reached
 * directly without one, the page says so rather than offering days to nothing.
 */
export function BusinessDaysPageContent(): React.JSX.Element {
  const { t, d } = useTranslation();
  const calendar = useBusinessDays();
  const timezone = useAppSelector(selectTenantTimezone);
  const todayIso = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);
  const { data, status, error } = calendar;
  const editable = calendar.canManage && calendar.canWrite && !calendar.savingWeekdays;
  const months = useMemo(() => groupByMonth(data?.rows ?? []), [data?.rows]);

  const header = (
    <UbPageHeader title={t('calendar.page.title')} subtitle={t('calendar.page.subtitle')} />
  );

  let body: React.ReactNode;
  if (status === 'failed') {
    body = (
      <UbEmptyState
        variant="error"
        title={t('calendar.error.title')}
        description={error?.message ?? t('calendar.error.title')}
        requestId={error?.requestId ?? null}
        requestIdLabel={t('common.error.reference')}
        action={
          <UbButton variant="secondary" onClick={calendar.refetch}>
            {t('common.action.retry')}
          </UbButton>
        }
      />
    );
  } else if (!data) {
    body = <UbSkeleton variant="form" count={3} />;
  } else if (data.readers.length === 0) {
    body = (
      <UbEmptyState
        variant="firstUse"
        title={t('calendar.none.title')}
        description={t('calendar.none.body')}
      />
    );
  } else {
    body = (
      <UbStack gap={4}>
        <UbPanel as="section">
          <UbPanelSection
            title={t('calendar.weekly.title')}
            badge={calendar.canManage ? undefined : t('settings.viewOnly')}
          >
            <UbStack gap={4}>
              <UbText variant="body-sm" tone="secondary">
                {calendar.canManage ? t('calendar.weekly.body') : t('calendar.viewOnly')}
              </UbText>
              <WeekdayChips
                label={t('calendar.weekly.title')}
                value={data.closedWeekdays}
                disabled={!editable}
                onChange={calendar.setWeekdays}
              />
              {data.readers.map((module) => {
                const override = data.moduleWeekdays[module];
                const name = moduleName(t, module);
                const label = name
                  ? t('calendar.override.label', { module: name })
                  : t('calendar.override.labelGeneric');
                return (
                  <UbStack key={module} gap={3}>
                    <UbSwitch
                      checked={override !== undefined}
                      onCheckedChange={(on) =>
                        calendar.setModuleWeekdays(module, on ? [...data.closedWeekdays] : null)
                      }
                      label={label}
                      description={
                        name
                          ? t('calendar.override.description', { module: name })
                          : t('calendar.override.descriptionGeneric')
                      }
                      disabled={!editable}
                    />
                    {override !== undefined && (
                      <WeekdayChips
                        label={label}
                        value={override}
                        disabled={!editable}
                        onChange={(next) => calendar.setModuleWeekdays(module, next)}
                      />
                    )}
                  </UbStack>
                );
              })}
            </UbStack>
          </UbPanelSection>
        </UbPanel>

        <UbPanel as="section">
          <UbPanelSection
            title={t('calendar.closures.title')}
            action={
              calendar.canManage ? (
                <UbButton
                  variant="secondary"
                  size="sm"
                  onClick={calendar.openAdd}
                  disabled={!calendar.canWrite}
                  icon={<CalendarPlus aria-hidden className="h-4 w-4" />}
                >
                  {t('calendar.closures.add')}
                </UbButton>
              ) : undefined
            }
          >
            <UbStack gap={4}>
              <UbText variant="body-sm" tone="secondary">
                {t('calendar.closures.body')}
              </UbText>
              {months.length === 0 ? (
                <UbEmptyState
                  variant="firstUse"
                  title={t('calendar.closures.empty.title')}
                  description={t('calendar.closures.empty.body')}
                />
              ) : (
                months.map((group) => (
                  <UbStack key={group.month} gap={1}>
                    <UbText as="h3" variant="caption" tone="tertiary">
                      {d(`${group.month}-01`, { month: 'long', year: 'numeric' })}
                    </UbText>
                    <UbStack as="ul" gap={0}>
                      {group.rows.map((row) => (
                        <UbStack
                          as="li"
                          key={row.id}
                          direction="row"
                          gap={3}
                          align="center"
                          className="min-h-12 border-b border-border-subtle py-2 last:border-0"
                        >
                          <UbStack gap={0.5} className="min-w-0 flex-1">
                            <UbText variant="body-medium">{row.reason}</UbText>
                            <UbStack direction="row" gap={2} align="center" className="flex-wrap">
                              <UbText variant="caption" tone="tertiary">
                                {d(row.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                              </UbText>
                              {row.module && (
                                <UbStatusBadge tone="info" label={moduleOnly(t, row.module)} />
                              )}
                            </UbStack>
                          </UbStack>
                          {calendar.canManage && (
                            <UbBox className="shrink-0">
                              <UbButton
                                variant="ghost"
                                size="sm"
                                onClick={() => calendar.remove(row.id)}
                                disabled={!calendar.canWrite || calendar.deletingId === row.id}
                                aria-label={t('calendar.closures.removeLabel', {
                                  date: d(row.date),
                                })}
                                icon={<Trash2 aria-hidden className="h-4 w-4" />}
                              >
                                {t('calendar.closures.remove')}
                              </UbButton>
                            </UbBox>
                          )}
                        </UbStack>
                      ))}
                    </UbStack>
                  </UbStack>
                ))
              )}
            </UbStack>
          </UbPanelSection>
        </UbPanel>
        {calendar.canManage && calendar.addOpen && (
          <ClosedDayDialog calendar={calendar} todayIso={todayIso} />
        )}
      </UbStack>
    );
  }

  return (
    <UbPageShell header={header} width="measure">
      {body}
    </UbPageShell>
  );
}
