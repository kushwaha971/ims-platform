import { screen } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { ModuleToggleList } from './ModuleToggleList';

import type { SettingsModules } from '../types/settings.types';

const modules: SettingsModules = {
  enabled: ['platform', 'parties', 'ledger', 'inventory', 'sales'],
  available: ['platform', 'parties', 'ledger', 'inventory', 'sales'],
  locked: [],
  core: ['ledger', 'parties', 'platform'],
};

/**
 * A12 (PLT-X10 §2 flow 1, §8) — when switching a module off is refused, the
 * refused row says WHAT is still open and how many, and what to do next —
 * "never 'not allowed' alone". The global snackbar still carries the server's
 * message; this is the specific answer under the switch that was tapped.
 */
describe('ModuleToggleList refusal', () => {
  it('lists each open thing under the refused switch and says to close them first', () => {
    renderWithProviders(
      <ModuleToggleList
        modules={modules}
        canEdit
        busy={false}
        onChange={jest.fn()}
        refusal={{
          module: 'inventory',
          lines: [
            { labelId: 'settings.module.blocker', count: 3 },
            { labelId: null, count: 2 },
          ],
        }}
      />
    );
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('3 records are still open');
    expect(note).toHaveTextContent('2 records are still open');
    expect(note).toHaveTextContent('Close them first, then turn this off.');
  });

  it('falls back to the generic line when a label has no copy on this screen', () => {
    renderWithProviders(
      <ModuleToggleList
        modules={modules}
        canEdit
        busy={false}
        onChange={jest.fn()}
        refusal={{ module: 'sales', lines: [{ labelId: 'library.off.copiesOut', count: 1 }] }}
      />
    );
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent('1 record is still open');
    expect(note).not.toHaveTextContent('library.off.copiesOut');
  });

  it('shows nothing extra without a refusal', () => {
    renderWithProviders(
      <ModuleToggleList modules={modules} canEdit busy={false} onChange={jest.fn()} />
    );
    expect(screen.queryByRole('status')).toBeNull();
  });
});
