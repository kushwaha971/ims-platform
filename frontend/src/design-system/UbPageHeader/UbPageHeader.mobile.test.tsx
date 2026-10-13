import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Download, Plus } from 'lucide-react';

import { UbActionLink } from 'src/design-system/UbActionLink';
import { UbButton } from 'src/design-system/UbButton';
import { UbPageHeader, UbPageHeaderMobileActions } from 'src/design-system/UbPageHeader';

/**
 * docs/mobile-redesign (audit A3) — a list header on a phone: its icon squares
 * become a worded ⋯ sheet and the primary action the floating button, while a
 * desktop document stays exactly what it was.
 */
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
}));

const setPhone = (phone: boolean): void => {
  // setupTests defines `matchMedia` writable (not configurable): assign it.
  window.matchMedia = (query: string) =>
    ({
      matches: phone && query.includes('max-width: 1023.98px'),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
};

it('lets a complete document number wrap instead of cutting its suffix (QA B17)', () => {
  // The issued bill's identity must remain readable beside a crowded action row.
  render(<UbPageHeader title="INV/26-27/0001" wrapTitle />);
  expect(screen.getByRole('heading', { name: 'INV/26-27/0001' })).not.toHaveClass('truncate');
});

const header = (onAdd = jest.fn(), onExport = jest.fn()) =>
  render(
    <UbPageHeader
      title="Customers"
      actions={
        <>
          <UbActionLink href="/parties/tags" iconOnly="mobile">
            Manage tags
          </UbActionLink>
          <UbButton
            variant="secondary"
            iconOnly="mobile"
            icon={<Download aria-hidden />}
            onClick={onExport}
          >
            Download
          </UbButton>
        </>
      }
      primaryAction={
        <UbButton iconOnly="mobile" icon={<Plus aria-hidden />} onClick={onAdd}>
          Add customer
        </UbButton>
      }
      renderMobileActions={(actions) => (
        <UbPageHeaderMobileActions
          actions={actions}
          mobile={{
            menuLabel: 'More actions',
            closeLabel: 'Close',
            primary: { label: 'Add customer', icon: <Plus aria-hidden />, onClick: onAdd },
          }}
        />
      )}
    />
  );

describe('UbPageHeader on a phone', () => {
  afterEach(() => setPhone(false));

  it('adds nothing to a desktop document', () => {
    /* Prevents: a second "Add customer" or a stray ⋯ in the desktop DOM. */
    setPhone(false);
    header();
    expect(screen.getAllByRole('button', { name: 'Add customer' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('offers the actions as worded rows in a ⋯ sheet, and closes after one is chosen', async () => {
    /* Prevents: unlabelled icon squares on a phone (A3), and a sheet that
       stays open over the screen its action just opened. */
    setPhone(true);
    const onExport = jest.fn();
    const user = userEvent.setup();
    header(jest.fn(), onExport);
    await user.click(screen.getByRole('button', { name: 'More actions' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'More actions' }));
    const row = sheet.getByRole('button', { name: 'Download' });
    expect(row).toHaveClass('w-full', 'justify-start');
    expect(sheet.getByText('Manage tags')).not.toHaveClass('max-sm:sr-only');
    await user.click(row);
    expect(onExport).toHaveBeenCalledTimes(1);
    await screen.findByRole('button', { name: 'More actions' });
    expect(screen.queryByRole('dialog', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('puts the primary action in the floating button', async () => {
    setPhone(true);
    const onAdd = jest.fn();
    const user = userEvent.setup();
    header(onAdd);
    const fab = screen
      .getAllByRole('button', { name: 'Add customer' })
      .find((node) => node.closest('[data-ub-fab]'));
    expect(fab).toBeDefined();
    await user.click(fab as HTMLElement);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
