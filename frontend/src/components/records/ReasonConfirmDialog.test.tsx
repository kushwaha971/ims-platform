import { useState } from 'react';

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';
import { REASON_MAX_CHARS } from 'src/utils/reason';

import { ReasonConfirmDialog } from './ReasonConfirmDialog';

/**
 * WP-03 D-04c — the shell every "void / cancel / reverse, and say why" dialog
 * is built on. Seven dialogs each composed it, and they disagreed: three greyed
 * the confirm button until a reason was typed and four said why on submit; all
 * seven closed on Escape or ✕ while the request was still running, so the
 * snackbar or refusal arrived with the dialog gone.
 */
function Harness({
  busy = false,
  onConfirm = jest.fn(),
  onClose = jest.fn(),
  suggestions,
}: Readonly<{
  busy?: boolean;
  onConfirm?: (reason: string) => void;
  onClose?: () => void;
  suggestions?: readonly string[];
}>): React.JSX.Element {
  const [open, setOpen] = useState(true);
  if (!open) return <></>;
  return (
    <ReasonConfirmDialog
      title="Void INV/26-27/0001?"
      confirmLabel="Void bill"
      workingLabel="Voiding…"
      reasonLabel="Why are you voiding it?"
      requiredMessageId="sales.void.reasonRequired"
      busy={busy}
      onConfirm={onConfirm}
      onClose={() => {
        onClose();
        setOpen(false);
      }}
      suggestions={suggestions}
      confirmTestId="void-confirm"
    >
      Stock goes back.
    </ReasonConfirmDialog>
  );
}

it('says why instead of greying the button when no reason is written', async () => {
  const onConfirm = jest.fn();
  renderWithProviders(<Harness onConfirm={onConfirm} />);
  const confirm = screen.getByTestId('void-confirm');
  expect(confirm).toBeEnabled();
  await userEvent.click(confirm);
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/Why are you voiding it/)).toHaveAccessibleDescription(/.+/);
});

it('sends the reason trimmed, and caps it at the shared limit', async () => {
  const onConfirm = jest.fn();
  renderWithProviders(<Harness onConfirm={onConfirm} />);
  const box = screen.getByLabelText(/Why are you voiding it/);
  expect(box).toHaveFocus();
  expect(box).toHaveAttribute('maxLength', String(REASON_MAX_CHARS));
  await userEvent.type(box, '  Wrong party  ');
  await userEvent.click(screen.getByTestId('void-confirm'));
  expect(onConfirm).toHaveBeenCalledWith('Wrong party');
});

it('stays open while the request runs: Escape and ✕ do nothing until it answers', async () => {
  const onClose = jest.fn();
  renderWithProviders(<Harness busy onClose={onClose} />);
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: /close/i }));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('fills the reason from a suggestion', async () => {
  const onConfirm = jest.fn();
  renderWithProviders(<Harness onConfirm={onConfirm} suggestions={['Entered twice']} />);
  await userEvent.click(screen.getByRole('button', { name: 'Entered twice' }));
  await userEvent.click(screen.getByTestId('void-confirm'));
  expect(onConfirm).toHaveBeenCalledWith('Entered twice');
});
