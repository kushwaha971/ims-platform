import { yupResolver } from '@hookform/resolvers/yup';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import * as Yup from 'yup';

import { UbButton } from 'src/design-system/UbButton';
import { UbField } from 'src/design-system/UbField';
import { UbForm } from 'src/design-system/UbForm';
import { UbTextInput } from 'src/design-system/UbTextInput';

/**
 * Part 19 §19.5.4 — the form anatomy's contract, which is what lets every other
 * form in the product be written without any error plumbing:
 *
 *  1. the label is bound to the control (`htmlFor`/`id`), so the whole label is
 *     a hit target and a screen reader names the field;
 *  2. the error is read out of RHF BY NAME — the caller never writes
 *     `errors.x?.message`;
 *  3. `aria-describedby` points at the hint, and at the ERROR once there is
 *     one, and never at both;
 *  4. `aria-invalid` is set, so the border can be `--form-error` without the
 *     colour being the only signal (§23.2.4 rule 2);
 *  5. form-level messages the server could not anchor are rendered, never
 *     dropped (§19.5.6).
 */
interface Values {
  name: string;
}

function Harness({ formErrors }: Readonly<{ formErrors?: readonly string[] }>) {
  const form = useForm<Values>({
    resolver: yupResolver(Yup.object({ name: Yup.string().required('Enter your name').defined() })),
    mode: 'onSubmit',
    defaultValues: { name: '' },
  });

  return (
    <UbForm form={form} onSubmit={jest.fn()} formErrors={formErrors}>
      <UbField name="name" label="Business name" hint="Two to 160 characters" required>
        {(field) => <UbTextInput {...field} />}
      </UbField>
      <UbButton type="submit">Save</UbButton>
    </UbForm>
  );
}

describe('UbField', () => {
  it('binds the label to the control', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Business name/);
    expect(input).toHaveAttribute('id', 'name');
  });

  it('points aria-describedby at the hint while there is no error', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Business name/);
    expect(input).toHaveAttribute('aria-describedby', 'name-hint');
    expect(screen.getByText('Two to 160 characters')).toHaveAttribute('id', 'name-hint');
  });

  it('shows the schema message, in --form-error, once the form is submitted', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    const message = await screen.findByText('Enter your name');
    expect(message).toHaveClass('text-formError');
    expect(message).toHaveAttribute('id', 'name-error');
  });

  it('moves aria-describedby to the error and drops the hint', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Enter your name');

    const input = screen.getByLabelText(/Business name/);
    expect(input).toHaveAttribute('aria-describedby', 'name-error');
    // Two lines of guidance under one input is how a 360 px form runs out.
    expect(screen.queryByText('Two to 160 characters')).not.toBeInTheDocument();
  });

  it('marks the control invalid, so colour is not the only signal', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Enter your name');

    expect(screen.getByLabelText(/Business name/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders the form-level messages the server could not anchor', () => {
    render(<Harness formErrors={['Something about the whole form']} />);
    expect(screen.getByText('Something about the whole form')).toBeInTheDocument();
  });
});
