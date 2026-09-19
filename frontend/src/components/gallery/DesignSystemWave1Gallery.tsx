'use client';

import { useCallback, useMemo, useState } from 'react';

import { useForm } from 'react-hook-form';

import {
  UbButton,
  UbCard,
  UbCheckbox,
  UbConfirmDialog,
  UbDialog,
  UbField,
  UbFieldError,
  UbForm,
  UbInputHint,
  UbOtpInput,
  UbPhoneInput,
  UbProgress,
  UbRadioGroup,
  UbSelect,
  UbStack,
  UbStepper,
  UbTabs,
  UbText,
  UbTextInput,
} from 'src/design-system';

/**
 * Part 23 §23.4 / Part 32 §32.4.4 — design-system WAVE 1 in the live gallery.
 *
 * Storybook is not a dependency (ADR-021), so this is where a reviewer sees
 * every wave-1 wrapper in every state it ships with: a form with a live
 * validation error, the OTP cells mid-entry and read-only, the button's busy
 * state, the four-step stepper with a completed step behind it, both overlays,
 * and the meter at each of its three tones.
 *
 * Literal strings rather than `t()` are deliberate here and only here: the
 * gallery is developer chrome, not product (§23.2.2).
 */
interface DemoValues {
  name: string;
  mobile: string | null;
}

export function DesignSystemWave1Gallery(): React.JSX.Element {
  const [tab, setTab] = useState<'password' | 'otp'>('password');
  const [code, setCode] = useState('12');
  const [remember, setRemember] = useState(true);
  const [gst, setGst] = useState<'unregistered' | 'composition' | 'regular'>('unregistered');
  const [state, setState] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const form = useForm<DemoValues>({
    mode: 'onChange',
    defaultValues: { name: '', mobile: '' },
  });

  const { setError } = form;
  const breakIt = useCallback(() => {
    setError('name', { type: 'demo', message: 'Enter your business name' });
  }, [setError]);

  const steps = useMemo(
    () => [
      { key: 'business', label: 'Business' },
      { key: 'gst', label: 'GST details' },
      { key: 'address', label: 'Address' },
      { key: 'summary', label: 'Almost done' },
    ],
    []
  );

  const cellLabel = useCallback((index: number, total: number) => `Digit ${index} of ${total}`, []);

  return (
    <UbStack gap={6}>
      <UbCard
        title="UbForm · UbField · UbFieldError · UbInputHint"
        description="Part 19 §19.5.4 — the anatomy every form in the product is."
      >
        <UbForm
          form={form}
          onSubmit={() => undefined}
          formErrors={['A form-level message the server could not anchor to a field.']}
        >
          <UbField name="name" label="Business name" hint="Two to 160 characters" required>
            {(field) => <UbTextInput {...field} />}
          </UbField>
          <UbField name="mobile" label="Mobile number" required>
            {(field) => <UbPhoneInput {...field} />}
          </UbField>
          <UbButton variant="secondary" onClick={breakIt}>
            Show a validation error
          </UbButton>
        </UbForm>

        <UbStack gap={1} className="mt-4">
          <UbInputHint>A hint, alone.</UbInputHint>
          <UbFieldError>An error message, alone, in --form-error.</UbFieldError>
        </UbStack>
      </UbCard>

      <UbCard title="UbButton" description="Every variant, every size, and the busy state.">
        <UbStack direction="row" wrap align="center" gap={3}>
          <UbButton variant="primary">Primary</UbButton>
          <UbButton variant="secondary">Secondary</UbButton>
          <UbButton variant="ghost">Ghost</UbButton>
          <UbButton variant="destructive">Destructive</UbButton>
          <UbButton disabled>Disabled</UbButton>
          <UbButton busy busyLabel="Sending…">
            Get code
          </UbButton>
          <UbButton size="sm">Small</UbButton>
          <UbButton size="lg">Large (44px)</UbButton>
        </UbStack>
      </UbCard>

      <UbCard title="UbTextInput" description="Text, uppercase, password with its reveal.">
        <UbStack gap={3}>
          <UbTextInput value="Sharma General Store" onChange={() => undefined} />
          <UbTextInput value="27aapfu0939f1zv" onChange={() => undefined} uppercase />
          <UbTextInput
            value="secret123"
            onChange={() => undefined}
            type="password"
            revealLabel="Show password"
            hideLabel="Hide password"
          />
          <UbTextInput value="" onChange={() => undefined} invalid placeholder="Invalid" />
          <UbTextInput value="" onChange={() => undefined} disabled placeholder="Disabled" />
        </UbStack>
      </UbCard>

      <UbCard title="UbPhoneInput" description="PLT-01 FR-1 — +91 fixed, ten digits.">
        <UbStack gap={3}>
          <UbPhoneInput value="+919876543210" onChange={() => undefined} aria-label="Mobile" />
          <UbPhoneInput value="" onChange={() => undefined} invalid aria-label="Mobile, invalid" />
        </UbStack>
      </UbCard>

      <UbCard title="UbOtpInput" description="PLT-01 §7 — partial, complete and read-only.">
        <UbStack gap={4}>
          <UbOtpInput
            value={code}
            onChange={setCode}
            label="Six-digit code"
            cellLabel={cellLabel}
          />
          <UbOtpInput
            value="123456"
            onChange={() => undefined}
            invalid
            label="Six-digit code, rejected"
            cellLabel={cellLabel}
          />
          <UbOtpInput
            value="123456"
            onChange={() => undefined}
            readOnly
            label="Six-digit code, verifying"
            cellLabel={cellLabel}
          />
        </UbStack>
      </UbCard>

      <UbCard title="UbTabs" description="A scope control, not navigation.">
        <UbTabs
          value={tab}
          onValueChange={setTab}
          tabs={[
            { value: 'password', label: 'Password' },
            { value: 'otp', label: 'OTP' },
          ]}
          ariaLabel="How you want to log in"
        >
          <UbText variant="body-sm" tone="tertiary">
            The {tab} panel.
          </UbText>
        </UbTabs>
      </UbCard>

      <UbCard title="UbRadioGroup · UbCheckbox · UbSelect">
        <UbStack gap={5}>
          <UbRadioGroup
            name="gst"
            value={gst}
            onChange={setGst}
            ariaLabel="GST status"
            options={[
              {
                value: 'unregistered',
                label: 'Not registered under GST',
                hint: 'Estimates instead of tax invoices.',
              },
              { value: 'composition', label: 'Composition scheme' },
              { value: 'regular', label: 'Regular GST' },
            ]}
          />
          <UbCheckbox checked={remember} onChange={setRemember} label="Remember this number" />
          <UbSelect
            value={state}
            onChange={setState}
            placeholder="Choose your state"
            aria-label="State"
            options={[
              { value: '27', label: 'Maharashtra' },
              { value: '09', label: 'Uttar Pradesh' },
              { value: '97', label: 'Other Territory' },
            ]}
          />
        </UbStack>
      </UbCard>

      <UbCard title="UbStepper" description="PLT-03 §7 — bar below md, labelled dots above.">
        <UbStepper
          steps={steps}
          current={2}
          completed={1}
          onStepSelect={() => undefined}
          progressLabel="Step 2 of 4"
        />
      </UbCard>

      <UbCard
        title="UbProgress"
        description="Accent below 80 %, amber at 80 %, --form-error at 100 %."
      >
        <UbStack gap={3}>
          <UbProgress used={1} limit={3} ariaLabel="team members, comfortable" />
          <UbProgress used={4} limit={5} ariaLabel="team members, near the limit" />
          <UbProgress used={3} limit={3} ariaLabel="team members, at the limit" />
          <UbProgress used={999} limit={null} ariaLabel="team members, unlimited" />
        </UbStack>
      </UbCard>

      <UbCard
        title="UbDialog · UbConfirmDialog"
        description="Portalled, focus-trapped, Escape-dismissible."
      >
        <UbStack direction="row" wrap gap={3}>
          <UbButton variant="secondary" onClick={() => setDialogOpen(true)}>
            Open a dialog
          </UbButton>
          <UbButton variant="destructive" onClick={() => setConfirmOpen(true)}>
            Open a destructive confirm
          </UbButton>
        </UbStack>

        <UbDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Plan limit reached"
          description="You have used 3 of 3 team members on the Free plan."
          closeLabel="Dismiss"
          footer={
            <>
              <UbButton variant="secondary" onClick={() => setDialogOpen(false)}>
                Close
              </UbButton>
              <UbButton onClick={() => setDialogOpen(false)}>Contact Metis</UbButton>
            </>
          }
        >
          <UbProgress used={3} limit={3} ariaLabel="team members" />
        </UbDialog>

        <UbConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Leave this business?"
          description="You will lose access until somebody invites you again."
          confirmLabel="Leave business"
          cancelLabel="Cancel"
          closeLabel="Dismiss"
          onConfirm={() => setConfirmOpen(false)}
        />
      </UbCard>
    </UbStack>
  );
}
