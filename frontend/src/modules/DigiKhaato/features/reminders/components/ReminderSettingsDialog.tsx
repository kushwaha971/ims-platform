'use client';

import { memo, useCallback } from 'react';

import {
  UbDialog,
  UbSectionHeading,
  UbSelect,
  UbStack,
  UbStatusBanner,
  UbSwitch,
  UbText,
} from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { useTranslation } from 'src/hooks/useTranslation';

import { reminderTabsFor } from '../moduleTabs';
import { selectReminderSettings, selectReminderSettingsSaving } from '../redux/reminderSlice';
import { saveReminderSettings } from '../redux/reminderThunk';
import { halfHoursBetween, reminderTabLabel } from '../view-model/moduleReminderDisplay';

import type { ReminderSettingsPatch } from '../types/reminder.types';

// Loaded with dynamic(), so its own words come with its own chunk rather than
// with the screen that opens it (src/i18n/catalogueRegistry.ts).
import 'src/i18n/catalogues/reminders';

/**
 * LED-07 FR-1 and LED-08 FR-1 — the two SMS switches, owner and admin only.
 *
 * Each switch saves on its own, the moment it is flipped: there is no form to
 * submit, and the server's answer is what the switch then shows. When no SMS
 * provider is configured the switches still save (the merchant is choosing
 * what happens once one is), and the banner says plainly that nothing will be
 * sent until then — never a green "on" that implies messages are leaving.
 */
export interface ReminderSettingsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function ReminderSettingsDialogBase({ open, onOpenChange }: Readonly<ReminderSettingsDialogProps>) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const settings = useAppSelector(selectReminderSettings);
  const saving = useAppSelector(selectReminderSettingsSaving);
  const { can } = usePermissions();
  /* A7 §10 — narrowing a module's sending hours is the owner's alone. */
  const canNarrow = can('platform.tenant.manage');
  const windows = settings?.windows;
  const tabLabels = Object.fromEntries(
    reminderTabsFor(Object.keys(windows ?? {})).map((tab) => [tab.module, tab.labelId])
  );

  const save = useCallback(
    (patch: ReminderSettingsPatch) => {
      void dispatch(saveReminderSettings(patch));
    },
    [dispatch]
  );

  return (
    <UbDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('reminders.settings.title')}
      description={t('reminders.settings.body')}
      closeLabel={t('common.action.close')}
    >
      <UbStack gap={4}>
        {settings && !settings.smsConfigured && (
          <UbStatusBanner
            tone="info"
            title={t('reminders.settings.noProvider.title')}
            description={t('reminders.settings.noProvider.body')}
          />
        )}
        <UbSwitch
          checked={settings?.autoSms ?? false}
          onCheckedChange={(checked) => save({ autoSms: checked })}
          disabled={!settings || saving}
          label={t('reminders.settings.autoSms')}
          description={t('reminders.settings.autoSms.body')}
        />
        <UbSwitch
          checked={settings?.partySmsOnEntry ?? false}
          onCheckedChange={(checked) => save({ partySmsOnEntry: checked })}
          disabled={!settings || saving}
          label={t('reminders.settings.entrySms')}
          description={t('reminders.settings.entrySms.body')}
        />
        {/* A7 (PLT-X06 §7, BR-5) — one row per module whose policy has sending
            hours; a tenant may narrow them, never widen, never under an hour
            (the server refuses; the options only offer the module's own span). */}
        {windows &&
          Object.entries(windows).map(([module, window]) => {
            const name = reminderTabLabel(t, module, tabLabels[module] ?? '');
            const options = halfHoursBetween(window.policyStart, window.policyEnd).map((value) => ({
              value,
              label: value,
            }));
            return (
              <UbStack key={module} gap={2}>
                <UbSectionHeading as="h3" title={t('reminders.settings.window.title', { name })} />
                <UbText variant="caption" tone="tertiary">
                  {t('reminders.settings.window.body', {
                    start: window.policyStart,
                    end: window.policyEnd,
                  })}
                </UbText>
                {canNarrow ? (
                  <UbStack direction="row" gap={2} align="center" className="flex-wrap">
                    <UbSelect
                      aria-label={t('reminders.settings.window.start', { name })}
                      value={window.start}
                      options={options.filter((o) => o.value < window.end)}
                      disabled={saving}
                      onChange={(value) => save({ windows: { [module]: [value, window.end] } })}
                      className="w-28"
                    />
                    <UbText variant="body-sm" tone="secondary">
                      {t('reminders.settings.window.to')}
                    </UbText>
                    <UbSelect
                      aria-label={t('reminders.settings.window.end', { name })}
                      value={window.end}
                      options={options.filter((o) => o.value > window.start)}
                      disabled={saving}
                      onChange={(value) => save({ windows: { [module]: [window.start, value] } })}
                      className="w-28"
                    />
                  </UbStack>
                ) : (
                  <UbText variant="body-sm">
                    {t('reminders.settings.window.current', {
                      start: window.start,
                      end: window.end,
                    })}
                  </UbText>
                )}
              </UbStack>
            );
          })}
      </UbStack>
    </UbDialog>
  );
}

export const ReminderSettingsDialog = memo(ReminderSettingsDialogBase);
