import { useEffect } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';

import { UbField } from '../UbField';

import { UbSelect } from './UbSelect';

const OPTIONS = [
  { value: 'retail', label: 'Retail shop' },
  { value: 'wholesale', label: 'Wholesale' },
];

/** The shape the profile page had: form created while loading, `reset()` later. */
function ProfileLikeForm({
  defaults,
}: Readonly<{ defaults?: { businessType: string } }>): React.JSX.Element {
  const form = useForm<{ businessType: string }>({ defaultValues: defaults });
  const { reset, control } = form;
  const value = useWatch({ control, name: 'businessType' });
  useEffect(() => {
    if (defaults) reset(defaults);
  }, [defaults, reset]);
  if (!defaults) return <p>loading</p>;
  return (
    <FormProvider {...form}>
      <form>
        <UbField name="businessType" label="Business type">
          {(field) => <UbSelect {...field} options={OPTIONS} />}
        </UbField>
        <p data-testid="value">{String(value)}</p>
      </form>
    </FormProvider>
  );
}

/**
 * QA D1 (High) — /settings/profile loaded a saved business type and state
 * code and then showed "Choose…" in both selects, blocking Save with "Choose
 * a business type". The form mounts before `reset(defaults)` lands, so the
 * select's value goes from empty to 'retail' after mount; Radix's hidden
 * native `<select>` (rendered because a `name` is passed) is then set to a
 * value whose `<option>` it does not hold yet, reads back '' and fires
 * `onValueChange('')` — which React Hook Form stores, wiping the loaded value.
 * No `UbSelect` option can have the value '' (Radix forbids it), so '' only
 * ever comes from that path, and is dropped.
 */
describe('UbSelect', () => {
  it('keeps a value React Hook Form resets in after the field mounted (QA D1)', async () => {
    const { rerender } = render(<ProfileLikeForm />);
    await act(async () => {
      rerender(<ProfileLikeForm defaults={{ businessType: 'retail' }} />);
    });
    expect(screen.getByTestId('value')).toHaveTextContent('retail');
    expect(screen.getByRole('combobox')).toHaveTextContent('Retail shop');
  });

  it('ignores an empty report from the hidden native select (QA D1)', () => {
    const onChange = jest.fn();
    // Radix renders the native `<select>` only inside a `<form>`, as UbForm is.
    const { container } = render(
      <form>
        <UbSelect name="stateCode" value="retail" onChange={onChange} options={OPTIONS} />
      </form>
    );
    const native = container.ownerDocument.querySelector('select[aria-hidden="true"]');
    expect(native).not.toBeNull();
    fireEvent.change(native as HTMLSelectElement, { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(native as HTMLSelectElement, { target: { value: 'wholesale' } });
    expect(onChange).toHaveBeenCalledWith('wholesale');
  });

  it('renders a value present at mount', () => {
    render(<UbSelect name="stateCode" value="wholesale" onChange={jest.fn()} options={OPTIONS} />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Wholesale');
  });
});
