'use client';

import { useState } from 'react';

import { Plus, Share2 } from 'lucide-react';

import {
  UbButton,
  UbCard,
  UbDateRangePicker,
  UbFab,
  UbShareSheet,
  UbStack,
  UbSwitch,
  UbText,
} from 'src/design-system';
import { useShareFeedback } from 'src/hooks/useShareFeedback';

/**
 * Part 32 §32.6.4 — design-system wave 3, in the gallery.
 *
 * `UbFab` is ONLY here: no product screen uses it yet, because the one
 * candidate action (Add party) is already in the page header and the owner's
 * rule is that a control without a job is not shown. It is off by default and
 * floats over the whole gallery when switched on — which is the real
 * behaviour, and the demo snackbar below this section rises above it.
 *
 * `UbTimeline` and `UbPartyHeader` are absent by decision — see
 * docs/DESIGN-SYSTEM.md §4.
 */
type DemoPreset = 'thisMonth' | 'lastMonth' | 'thisFy' | 'custom';

const PRESETS = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisFy', label: 'This year' },
  { value: 'custom', label: 'Custom' },
] as const;

const DEMO_MESSAGE =
  'Namaste Ramesh Traders,\nRs 2,500.00 is pending with Kumar Stores as of 23/09/2026.\n' +
  'Kindly pay at your convenience. Thank you.\n— Kumar Stores';

export function DesignSystemWave3Gallery(): React.JSX.Element {
  const [shareOpen, setShareOpen] = useState(false);
  const [withPhone, setWithPhone] = useState(true);
  const [preset, setPreset] = useState<DemoPreset>('custom');
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: '2026-04-01',
    to: '2026-09-23',
  });
  const [corrections, setCorrections] = useState(false);
  const [fabShown, setFabShown] = useState(false);
  const feedback = useShareFeedback();

  return (
    <>
      <UbCard
        title="UbShareSheet"
        description="WhatsApp (wa.me), SMS (sms:?&body=), copy, and the platform sheet where it exists. It reports; the caller speaks."
      >
        <UbStack gap={3}>
          <UbSwitch
            checked={withPhone}
            onCheckedChange={setWithPhone}
            label="Party has a mobile number"
            className="w-auto"
          />
          <UbButton
            variant="secondary"
            icon={<Share2 aria-hidden className="h-4 w-4" />}
            onClick={() => setShareOpen(true)}
            className="self-start"
          >
            Open the share sheet
          </UbButton>
        </UbStack>
        <UbShareSheet
          open={shareOpen}
          onOpenChange={setShareOpen}
          title="Send reminder"
          description={
            withPhone
              ? 'To Ramesh Traders · +91 98123 45678'
              : 'To Ramesh Traders · no mobile saved, so WhatsApp will ask you to choose the chat'
          }
          message={DEMO_MESSAGE}
          phone={withPhone ? '+919812345678' : null}
          labels={{
            whatsapp: 'WhatsApp',
            sms: 'SMS',
            copy: 'Copy text',
            more: 'More…',
            close: 'Close',
            preview: 'Message',
          }}
          onShared={feedback.onShared}
          onFailed={feedback.onFailed}
        />
      </UbCard>

      <UbCard
        title="UbDateRangePicker"
        description="Presets on the chip track; the dates, only for Custom, on the right with the screen's other scope."
      >
        <UbStack gap={3}>
          <UbDateRangePicker
            name="gallery-range"
            presets={PRESETS}
            preset={preset}
            onPresetChange={setPreset}
            customPreset="custom"
            from={range.from}
            to={range.to}
            onRangeChange={(from, to) => setRange({ from, to })}
            max="2026-09-23"
            labels={{ presets: 'Period', from: 'From date', to: 'To date' }}
            end={
              <UbSwitch
                checked={corrections}
                onCheckedChange={setCorrections}
                label="Show corrections"
                className="min-h-10 w-auto"
              />
            }
          />
          <UbText variant="caption" tone="tertiary">
            {`preset=${preset} · from=${range.from ?? '—'} · to=${range.to ?? '—'}`}
          </UbText>
        </UbStack>
      </UbCard>

      <UbCard
        title="UbFab"
        description="56 px, safe-area aware, clears the toast via useBottomInset. No product caller yet — the header already carries Add party."
      >
        <UbSwitch
          checked={fabShown}
          onCheckedChange={setFabShown}
          label="Show the floating button"
          className="w-auto"
        />
        {fabShown && (
          <UbFab
            label="Add party"
            icon={<Plus aria-hidden className="h-6 w-6" />}
            onClick={() => setFabShown(false)}
          />
        )}
      </UbCard>
    </>
  );
}
