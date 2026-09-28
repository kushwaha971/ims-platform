'use client';

import { memo, useCallback } from 'react';

import { UbDialog, UbStack, UbStatusBanner, UbSwitch } from 'src/design-system';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useTranslation } from 'src/hooks/useTranslation';

import { selectReminderSettings, selectReminderSettingsSaving } from '../redux/reminderSlice';
import { saveReminderSettings } from '../redux/reminderThunk';

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
      </UbStack>
    </UbDialog>
  );
}

export const ReminderSettingsDialog = memo(ReminderSettingsDialogBase);
