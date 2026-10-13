import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { ImportWizard } from './ImportWizard';

import type { ImportJob } from '../types/import.types';

/**
 * T-IMP-01-13 — the wizard's states on screen: content → hook → thunk →
 * service, with the service stubbed at the module boundary. Each test names
 * the merchant-facing promise it protects.
 */
jest.mock('../api/importService', () => ({
  ...jest.requireActual<object>('../api/importService'),
  getImportJob: jest.fn(),
  uploadImport: jest.fn(),
  commitImport: jest.fn(),
  cancelImport: jest.fn(),
  listImportRows: jest.fn(),
}));

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/imports',
}));

const service = jest.requireMock('../api/importService') as {
  getImportJob: jest.Mock;
  uploadImport: jest.Mock;
  commitImport: jest.Mock;
  cancelImport: jest.Mock;
  listImportRows: jest.Mock;
};

const OWNER: readonly PermissionCode[] = [
  'parties.party.read',
  'parties.party.write',
  'ledger.entry.write',
  'inventory.item.read',
  'inventory.item.write',
];

const signIn = (permissions: readonly PermissionCode[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: ['parties', 'ledger', 'inventory', 'import_export'],
      version: 1,
    })
  );
};

const READY: ImportJob = {
  id: 'job-1',
  kind: 'parties',
  status: 'ready',
  totalRows: 12,
  validRows: 10,
  errorRows: 2,
  fileName: 'parties.csv',
  fileSizeBytes: 2048,
  summary: null,
  failure: null,
  errors: [
    {
      row: 7,
      column: 'opening_date',
      value: '31/02/2026',
      code: 'invalid_date',
      message: 'Use a date like 01/04/2026.',
    },
    {
      row: 12,
      column: 'mobile',
      value: '9876543203',
      code: 'duplicate_in_file',
      message: 'Repeats row 3.',
    },
  ],
  errorsTotal: 2,
  errorsTruncated: false,
  warnings: [],
  previewRows: [
    {
      row: 2,
      valid: true,
      name: 'Ramesh Traders',
      mobile: '+919876543210',
      type: 'customer',
      opening_balance: '2300.00',
      opening_type: 'to_receive',
      opening_date: '2026-04-01',
      state: '27',
      tags: ['Camp Area'],
    },
  ],
  totals: {
    opening_receivable: '124500.00',
    opening_payable: '22150.00',
    customers: 9,
    suppliers: 1,
  },
  totalsProblems: {},
  duplicates: 0,
  progress: { done: 12, total: 12 },
  hasErrorFile: true,
  canCommit: false,
  summaryFields: ['created_parties', 'opening_entries', 'opening_receivable', 'opening_payable'],
  createdAt: '2026-09-24T05:00:00Z',
  finishedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetAllFeatureState());
  signIn(OWNER);
  service.listImportRows.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 25 });
});

const renderJob = (job: ImportJob) => {
  service.getImportJob.mockResolvedValue(job);
  return renderWithProviders(<ImportWizard kind={null} jobId={job.id} exportId={null} />);
};

describe('the review step', () => {
  it('imports the good rows and skips the ones with problems, saying so (QA B33)', async () => {
    /* "Fix 16 rows first" used to block 11 good rows. The button now says what it
       will do — and sends exactly that, so the server never guesses. */
    const user = userEvent.setup();
    renderJob({ ...READY, canCommit: true });
    service.commitImport.mockResolvedValue({ ...READY, status: 'importing' });
    const commit = await screen.findByRole('button', { name: 'Import 10 good rows, skip 2' });
    expect(commit).toBeEnabled();
    await user.click(commit);
    await waitFor(() => expect(service.commitImport).toHaveBeenCalledTimes(1));
    expect(service.commitImport.mock.calls[0]?.[2]).toEqual({
      skipErrors: true,
      duplicates: 'skip',
    });
  });

  it('says the money in problem rows apart from the totals (QA B27)', async () => {
    renderJob({ ...READY, canCommit: true, totalsProblems: { opening_receivable: '1300.00' } });
    expect(await screen.findByTestId('import-problem-money')).toHaveTextContent(
      '₹1,300.00 is in rows with problems'
    );
  });

  it('asks what to do with rows the book already has, skipping by default (QA B28)', async () => {
    const user = userEvent.setup();
    renderJob({ ...READY, errorRows: 0, errors: [], canCommit: true, duplicates: 3 });
    service.commitImport.mockResolvedValue({ ...READY, status: 'importing' });
    expect(await screen.findByText('3 rows are already in your book')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Add them again' }));
    await user.click(screen.getByTestId('import-commit'));
    await waitFor(() => expect(service.commitImport).toHaveBeenCalledTimes(1));
    expect(service.commitImport.mock.calls[0]?.[2]).toEqual({
      skipErrors: false,
      duplicates: 'create',
    });
  });

  it('lists every problem by the spreadsheet row and column (US-IMP-01-2)', async () => {
    /* jsdom has no viewport, so the grid draws its phone cards — which is the
       rendering a merchant fixing a sheet on the counter actually sees. */
    renderJob(READY);
    expect(await screen.findByText('Row 7')).toBeInTheDocument();
    expect(screen.getByText('opening_date')).toBeInTheDocument();
    expect(screen.getByText('Use a date like 01/04/2026.')).toBeInTheDocument();
    expect(screen.getByText('Repeats row 3.')).toBeInTheDocument();
  });

  it('offers the file with the problems marked, as a download of the server file', async () => {
    renderJob(READY);
    const link = await screen.findByRole('link', { name: 'Download file with problems' });
    expect(link).toHaveAttribute('download');
    expect(link.getAttribute('href')).toMatch(/\/imports\/job-1\/errors\.csv$/);
  });

  it('shows the opening totals the owner checks against their own book (PTY-10 FR-7)', async () => {
    renderJob(READY);
    expect(
      await screen.findByText(
        'Opening balances: You will get ₹1,24,500.00 · You will give ₹22,150.00'
      )
    ).toBeInTheDocument();
  });

  it('previews rows as they will be saved — money en-IN, dates dd/mm/yyyy (AC-3)', async () => {
    // QA B34 — every row now comes a page at a time from the server.
    service.listImportRows.mockResolvedValue({
      rows: READY.previewRows,
      total: 1,
      page: 1,
      pageSize: 25,
    });
    renderJob({ ...READY, errorRows: 0, errors: [], canCommit: true });
    expect(await screen.findByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText('₹2,300.00')).toBeInTheDocument();
  });

  it('commits once, with an idempotency key, when the file is clean', async () => {
    const user = userEvent.setup();
    renderJob({ ...READY, errorRows: 0, errors: [], canCommit: true });
    service.commitImport.mockResolvedValue({ ...READY, status: 'importing', errorRows: 0 });
    // QA B44 — the button names the kinds: 9 customers and 1 supplier.
    await user.click(
      await screen.findByRole('button', { name: 'Import 10 parties (9 customers, 1 supplier)' })
    );
    await waitFor(() => expect(service.commitImport).toHaveBeenCalledTimes(1));
    const [id, key] = service.commitImport.mock.calls[0] as [string, string];
    expect(id).toBe('job-1');
    expect(key).toMatch(/.{8,}/);
  });

  it('says the import can be left running while it commits', async () => {
    renderJob({ ...READY, status: 'importing', errorRows: 0, errors: [] });
    expect(await screen.findByText('Importing 10 rows…')).toBeInTheDocument();
    expect(screen.getByText(/You can leave this page/)).toBeInTheDocument();
  });
});

describe('the outcomes', () => {
  it('reports a failed commit with its reference and offers to import again (AC-4)', async () => {
    renderJob({
      ...READY,
      status: 'failed',
      errorRows: 0,
      errors: [],
      canCommit: true,
      failure: {
        code: 'server_error',
        message: 'The import failed and nothing was saved (RuntimeError). Try again.',
        requestId: 'import-job-1',
        row: null,
        columns: [],
        at: 'commit',
      },
    });
    expect(await screen.findByText('The import failed and nothing was saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import again' })).toBeInTheDocument();
  });

  it('says a wrong file is a wrong file (Alternate B)', async () => {
    renderJob({
      ...READY,
      status: 'failed',
      canCommit: false,
      failure: {
        code: 'missing_columns',
        message: 'These columns are missing: name.',
        requestId: null,
        row: null,
        columns: ['name'],
        at: null,
      },
    });
    expect(await screen.findByText('This does not look like the right file')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import again' })).not.toBeInTheDocument();
  });

  it('shows what was created and the way to the records (FR-9)', async () => {
    renderJob({
      ...READY,
      status: 'completed',
      errorRows: 0,
      errors: [],
      summary: {
        created_parties: 412,
        opening_entries: 300,
        opening_receivable: '124500.00',
        opening_payable: '0.00',
      },
    });
    // QA B44 — parties, not customers: a file mixes customers and suppliers.
    expect(await screen.findByText('412 parties imported')).toBeInTheDocument();
    expect(screen.getByText('₹1,24,500.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to customers and suppliers' })).toHaveAttribute(
      'href',
      '/parties'
    );
  });

  it('confirms a cancelled import saved nothing (AC-7)', async () => {
    renderJob({ ...READY, status: 'cancelled' });
    expect(await screen.findByText('Import cancelled — nothing was saved')).toBeInTheDocument();
  });
});

describe('choosing and uploading', () => {
  it('tells an accountant to ask the owner instead of offering Choose', () => {
    signIn(['parties.party.read', 'inventory.item.read']);
    renderWithProviders(<ImportWizard kind={null} jobId={null} exportId={null} />);
    expect(screen.getAllByText('Ask the owner — your role cannot import this.')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Choose' })).not.toBeInTheDocument();
  });

  it('refuses a file over 5 MB before sending a byte (EC-3)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImportWizard kind="parties" jobId={null} exportId={null} />);
    const input = screen.getByLabelText('Choose CSV file');
    const big = new File(['x'], 'parties.csv', { type: 'text/csv' });
    Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
    await user.upload(input, big);
    expect(service.uploadImport).not.toHaveBeenCalled();
  });

  it('uploads the chosen file and moves to the job page', async () => {
    const user = userEvent.setup();
    service.uploadImport.mockResolvedValue({ ...READY, status: 'uploaded' });
    renderWithProviders(<ImportWizard kind="parties" jobId={null} exportId={null} />);
    const file = new File(['name\nRamesh'], 'parties.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Choose CSV file'), file);
    await waitFor(() => expect(service.uploadImport).toHaveBeenCalledTimes(1));
    expect(service.uploadImport.mock.calls[0]?.[0]).toBe('parties');
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/imports/job-1'));
  });
});

describe('watching a running job (QA B31)', () => {
  it('keeps asking until the job finishes, even when an answer changes nothing', async () => {
    /* The page stayed on "Importing 7 rows…" after the job had completed: each
       read used to schedule the next from its own answer, so an unchanged answer
       could leave no timer behind. The answers here are identical three times. */
    jest.useFakeTimers();
    try {
      const importing = { ...READY, status: 'importing' as const, errorRows: 0, errors: [] };
      service.getImportJob
        .mockResolvedValueOnce(importing)
        .mockResolvedValueOnce(importing)
        .mockResolvedValueOnce(importing)
        .mockResolvedValueOnce(importing)
        .mockResolvedValue({ ...importing, status: 'completed', summary: { created_parties: 10 } });
      renderWithProviders(<ImportWizard kind={null} jobId={READY.id} exportId={null} />);
      for (let i = 0; i < 6; i += 1) {
        await jest.advanceTimersByTimeAsync(2_100);
      }
      expect(service.getImportJob.mock.calls.length).toBeGreaterThanOrEqual(5);
      const calls = service.getImportJob.mock.calls.length;
      await jest.advanceTimersByTimeAsync(20_000);
      // Finished: the polling stopped.
      expect(service.getImportJob.mock.calls.length).toBe(calls);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the outcome after skipping rows (QA B33)', () => {
  it('never says everything was saved when rows were skipped', async () => {
    renderJob({
      ...READY,
      status: 'completed',
      summary: { created_parties: 2, skipped_rows: 2, skipped_duplicates: 1 },
    });
    expect(await screen.findByText(/2 rows with problems were skipped/)).toBeInTheDocument();
    expect(screen.getByText(/1 row already in your book was skipped/)).toBeInTheDocument();
    expect(screen.queryByText('Everything in the file was saved.')).not.toBeInTheDocument();
  });
});
