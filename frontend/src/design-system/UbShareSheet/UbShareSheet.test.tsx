import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbShareSheet, type UbShareSheetProps } from 'src/design-system/UbShareSheet';

/**
 * `UbShareSheet` — the one share surface (NTF-03 FR-1). What is asserted is
 * what reaches the customer (the URLs), what the merchant can reach (the
 * controls, by name and by keyboard), and what the product says afterwards
 * (only that a channel was OPENED — DEC-012 / NTF-03 BR-1).
 */
const LABELS = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  copy: 'Copy text',
  more: 'More…',
  close: 'Close',
  preview: 'Message',
} as const;

const MESSAGE = 'Namaste Ramesh Traders,\nRs 2,500.00 is pending with Kumar & Co.';

const original = {
  share: navigator.share,
  canShare: navigator.canShare,
  clipboard: navigator.clipboard,
  execCommand: document.execCommand,
};

/* jsdom cannot navigate; a real browser follows the link after the click.
   Preventing the default here stands in for "the browser followed it" without
   jsdom printing "Not implemented: navigation" into the run. */
const swallowNavigation = (event: MouseEvent) => {
  if ((event.target as Element | null)?.closest('a')) event.preventDefault();
};

beforeEach(() => {
  document.addEventListener('click', swallowNavigation);
  Object.assign(navigator, { share: undefined, canShare: undefined });
});

afterEach(() => {
  document.removeEventListener('click', swallowNavigation);
  Object.assign(navigator, { share: original.share, canShare: original.canShare });
  Object.defineProperty(navigator, 'clipboard', { value: original.clipboard, configurable: true });
  document.execCommand = original.execCommand;
  jest.useRealTimers();
});

const renderSheet = (overrides: Partial<UbShareSheetProps> = {}) => {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    onShared: jest.fn(),
    onFailed: jest.fn(),
    title: 'Send reminder',
    description: 'To Ramesh Traders · +91 98123 45678',
    message: MESSAGE,
    phone: '+919812345678',
    labels: LABELS,
    ...overrides,
  };
  render(<UbShareSheet {...props} />);
  return props;
};

describe('UbShareSheet', () => {
  it('is a dialog named by its title that shows who it goes to and the exact message', () => {
    /* Prevents: a sheet that opens WhatsApp without the merchant having seen
       the recipient or the words (NTF-03 §8 — a wrong number is caught before
       WhatsApp opens, not after), and a preview that flattens the message's
       own line breaks. */
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Send reminder' });
    expect(dialog).toHaveAccessibleDescription('To Ramesh Traders · +91 98123 45678');
    const preview = dialog.querySelector('[data-ub-share-preview]');
    expect(preview?.textContent).toBe(MESSAGE);
    expect(preview).toHaveClass('whitespace-pre-line');
  });

  it('links WhatsApp to the party, in a new tab, with the whole message encoded', () => {
    /* Prevents: a `wa.me/+91…` URL (invalid in WhatsApp), a message cut at the
       `&` in "Kumar & Co.", and an opener-linked tab. */
    renderSheet();
    const link = screen.getByRole('link', { name: 'WhatsApp' });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('https://wa.me/919812345678?text=')).toBe(true);
    expect(new URL(href).searchParams.get('text')).toBe(MESSAGE);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('lets WhatsApp pick the chat when the party has no number', () => {
    /* Prevents: a party without a mobile being impossible to remind, or a
       link to `wa.me/null`. */
    renderSheet({ phone: null });
    expect(screen.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/\?text=/
    );
    expect(screen.getByRole('link', { name: 'SMS' }).getAttribute('href')).toMatch(/^sms:\?&body=/);
  });

  it('links SMS with the cross-platform ?&body= form and a + number', () => {
    /* Prevents: the body being dropped on iOS or on Android — they disagree
       about `?body=` and `&body=`. */
    renderSheet({ phone: '098123 45678' });
    const href = screen.getByRole('link', { name: 'SMS' }).getAttribute('href') ?? '';
    expect(href.startsWith('sms:+919812345678?&body=Namaste%20Ramesh%20Traders%2C%0ARs')).toBe(
      true
    );
  });

  it('reports WhatsApp as opened and closes once the browser has followed the link', () => {
    /* Prevents: the anchor being unmounted INSIDE its own click (the sheet
       closing synchronously), and a caller never learning which channel was
       used — the neutral "WhatsApp opened" snackbar hangs off this. */
    jest.useFakeTimers();
    const props = renderSheet();
    // `fireEvent`, not user-event: RTL's async wrapper flushes zero-delay
    // timers under fake timers, which is exactly the tick being asserted.
    fireEvent.click(screen.getByRole('link', { name: 'WhatsApp' }));
    expect(props.onShared).toHaveBeenCalledWith('whatsapp');
    expect(props.onOpenChange).not.toHaveBeenCalled();
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('copies the message, reports it, and closes', async () => {
    /* Prevents: "Copied" being reported for text that never reached the
       clipboard, or the wrong text being copied. */
    // After `setup()`: user-event installs its own clipboard stub there.
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const props = renderSheet();
    await user.click(screen.getByRole('button', { name: 'Copy text' }));
    await waitFor(() => expect(props.onShared).toHaveBeenCalledWith('copy'));
    expect(writeText).toHaveBeenCalledWith(MESSAGE);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
    expect(props.onFailed).not.toHaveBeenCalled();
  });

  it('reports a refused copy and stays open so the preview can be selected by hand', async () => {
    /* Prevents: a silent failure on an insecure origin or an unfocused
       document (the clipboard rejects AND the execCommand fallback fails),
       and the sheet vanishing with the only selectable copy of the text. */
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    document.execCommand = jest.fn().mockReturnValue(false);
    const props = renderSheet();
    await user.click(screen.getByRole('button', { name: 'Copy text' }));
    await waitFor(() => expect(props.onFailed).toHaveBeenCalledWith('copy'));
    expect(props.onShared).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it('offers "More…" only where the platform has a share sheet', () => {
    /* Prevents: a control that throws `navigator.share is not a function` on
       desktop Firefox — the unbuilt-feature rule, broken by the platform. */
    renderSheet();
    expect(screen.queryByRole('button', { name: 'More…' })).not.toBeInTheDocument();
  });

  it('hands the platform sheet the title and the text, and reports it', async () => {
    /* Prevents: sharing a different payload from the one previewed. */
    const share = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    const user = userEvent.setup();
    const props = renderSheet();
    await user.click(screen.getByRole('button', { name: 'More…' }));
    await waitFor(() => expect(props.onShared).toHaveBeenCalledWith('native'));
    expect(share).toHaveBeenCalledWith({ title: 'Send reminder', text: MESSAGE });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('treats a dismissed platform sheet as a change of mind, not an error', async () => {
    /* Prevents: an error toast every time the merchant closes Android's share
       sheet without choosing an app. */
    Object.assign(navigator, {
      share: jest.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' })),
    });
    const user = userEvent.setup();
    const props = renderSheet();
    await user.click(screen.getByRole('button', { name: 'More…' }));
    await act(async () => undefined);
    expect(props.onFailed).not.toHaveBeenCalled();
    expect(props.onShared).not.toHaveBeenCalled();
  });

  it('reports a platform sheet that genuinely failed', async () => {
    /* Prevents: a `NotAllowedError` vanishing without a word. */
    Object.assign(navigator, {
      share: jest
        .fn()
        .mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' })),
    });
    const user = userEvent.setup();
    const props = renderSheet();
    await user.click(screen.getByRole('button', { name: 'More…' }));
    await waitFor(() => expect(props.onFailed).toHaveBeenCalledWith('native'));
  });

  it('is operable from the keyboard: Tab through the channels in order, Escape to close', async () => {
    /* Prevents: a channel reachable only by pointer, a tab order that skips
       the primary action, or a sheet the keyboard cannot leave. */
    Object.assign(navigator, { share: jest.fn().mockResolvedValue(undefined) });
    const user = userEvent.setup();
    const props = renderSheet();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'SMS' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Copy text' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'More…' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing while closed', () => {
    /* Prevents: the links (and the balance inside them) sitting in the DOM
       of every khata page whether or not anybody asked to share. */
    renderSheet({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });
});
