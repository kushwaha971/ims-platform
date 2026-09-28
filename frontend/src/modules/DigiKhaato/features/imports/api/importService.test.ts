import { AxiosError, AxiosHeaders } from 'axios';

import { api } from 'src/api/AxiosInstances';

import { exportDownloadUrl, requestListExport } from './exportService';
import {
  commitImport,
  importErrorsUrl,
  importTemplateUrl,
  toImportJob,
  uploadImport,
  type ImportJobWire,
} from './importService';

/**
 * The import and export wire halves. The transport is stubbed at the module
 * boundary (§19.13.3); fixtures follow IMP-01 §14 and IMP-02 §14, so a contract
 * change on either side breaks this file rather than the merchant's screen.
 */

const WIRE: ImportJobWire = {
  id: 'job-1',
  kind: 'parties',
  status: 'ready',
  total_rows: 3,
  valid_rows: 2,
  error_rows: 1,
  file: { name: 'parties.csv', size_bytes: 1200 },
  summary: null,
  error: null,
  errors: [
    {
      row: 7,
      column: 'opening_date',
      value: '31/02/2026',
      code: 'invalid_date',
      message: 'Use a date like 01/04/2026.',
    },
  ],
  errors_total: 1,
  errors_truncated: false,
  warnings: [],
  preview_rows: [{ row: 2, valid: true, name: 'Ramesh Traders', opening_balance: '2300.00' }],
  totals: { opening_receivable: '2300.00', opening_payable: '0.00' },
  progress: { done: 3, total: 3 },
  has_error_file: true,
  can_commit: false,
  summary_fields: ['created_parties'],
  created_at: '2026-09-24T05:00:00Z',
  finished_at: null,
};

afterEach(() => jest.restoreAllMocks());

describe('toImportJob', () => {
  it('keeps row problems addressed by the TEMPLATE column name', () => {
    /* "opening_date" is the header in the merchant's sheet; camel-casing it
       would point the message at a column that does not exist there. */
    const job = toImportJob(WIRE);
    expect(job.errors[0]).toEqual(WIRE.errors?.[0]);
    expect(job.previewRows[0]?.opening_balance).toBe('2300.00');
    expect(job.canCommit).toBe(false);
    expect(job.hasErrorFile).toBe(true);
    expect(job.fileName).toBe('parties.csv');
  });

  it('reads a failure with its request id and whether it can be retried', () => {
    const job = toImportJob({
      ...WIRE,
      status: 'failed',
      error: {
        code: 'server_error',
        message: 'Nothing was saved.',
        request_id: 'import-job-1',
        at: 'commit',
      },
    });
    expect(job.failure).toEqual({
      code: 'server_error',
      message: 'Nothing was saved.',
      requestId: 'import-job-1',
      row: null,
      columns: [],
      at: 'commit',
    });
  });
});

describe('uploadImport', () => {
  it('sends kind and file as multipart and reports upload progress', async () => {
    const post = jest.spyOn(api, 'post').mockImplementation(async (_url, _body, config) => {
      config?.onUploadProgress?.({ loaded: 50, total: 200, bytes: 50, lengthComputable: true });
      return { data: { data: { ...WIRE, status: 'uploaded' } } };
    });
    const seen: number[] = [];
    const file = new File(['name\nA'], 'parties.csv', { type: 'text/csv' });
    const job = await uploadImport('parties', file, (percent) => seen.push(percent));
    expect(job.status).toBe('uploaded');
    const [url, body] = post.mock.calls[0] ?? [];
    expect(url).toBe('/imports');
    expect((body as FormData).get('kind')).toBe('parties');
    expect((body as FormData).get('file')).toBeInstanceOf(File);
    expect(seen).toEqual([25]);
  });
});

describe('commitImport', () => {
  it('carries the Idempotency-Key the press minted', async () => {
    /* A double tap on a slow connection must be one commit: the server replays
       the first answer for the same key. */
    const post = jest
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { data: { ...WIRE, status: 'importing' } } });
    await commitImport('job-1', 'key-123');
    const config = post.mock.calls[0]?.[2] as { headers?: Record<string, string> };
    expect(post.mock.calls[0]?.[0]).toBe('/imports/job-1/commit');
    expect(config.headers?.['Idempotency-Key']).toBe('key-123');
  });
});

describe('download links', () => {
  it('are absolute API URLs, so an anchor saves the file rather than the page', () => {
    expect(importTemplateUrl('items')).toMatch(/^https?:\/\/.+\/imports\/templates\/items\.csv$/);
    expect(importErrorsUrl('job-1')).toMatch(/^https?:\/\/.+\/imports\/job-1\/errors\.csv$/);
    expect(exportDownloadUrl('e-1')).toMatch(/^https?:\/\/.+\/reports\/exports\/e-1\/download$/);
  });
});

describe('requestListExport (IMP-02 FR-6)', () => {
  it('asks for the list WITH its filters and saves the file under the server name', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({
      status: 200,
      data: new Blob(['\ufeffname\r\n']),
      headers: {
        'content-disposition': 'attachment; filename="yourkhata-parties-20260924-1142.csv"',
      },
    });
    const result = await requestListExport('/parties?q=Kumar&status=active');
    expect(get.mock.calls[0]?.[0]).toBe('/parties?q=Kumar&status=active&format=csv');
    /* The shared client's `Accept: application/json` made every browser
       export a 406 — the server picks the CSV renderer from `format=csv` and
       then checks Accept. test_list_exports pins the server half. */
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      headers: { Accept: 'text/csv, application/json' },
    });
    expect(result).toMatchObject({
      kind: 'file',
      filename: 'yourkhata-parties-20260924-1142.csv',
    });
  });

  it('reads a 202 as the queued job it is, not as a file of JSON', async () => {
    jest.spyOn(api, 'get').mockResolvedValue({
      status: 202,
      data: new Blob([
        JSON.stringify({ data: { export_id: 'e-1', status: 'queued', row_count: 8123 } }),
      ]),
      headers: {},
    });
    await expect(requestListExport('/items')).resolves.toEqual({
      kind: 'queued',
      exportId: 'e-1',
      rowCount: 8123,
    });
  });

  it('turns a refusal that arrived as a Blob back into its envelope', async () => {
    /* `responseType: 'blob'` makes the error body a Blob too; unparsed, the
       merchant would read "Request failed." instead of the server's sentence. */
    const response = {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: new Blob([
        JSON.stringify({
          error: { code: 'nothing_to_export', message: 'Nothing matches these filters.' },
        }),
      ]),
    };
    const error = new AxiosError('bad', 'ERR_BAD_REQUEST', undefined, undefined, response as never);
    jest.spyOn(api, 'get').mockRejectedValue(error);
    await expect(requestListExport('/parties')).rejects.toBe(error);
    expect(error.response?.data).toEqual({
      error: { code: 'nothing_to_export', message: 'Nothing matches these filters.' },
    });
  });
});

describe('the list export paths (IMP-02 BR-1)', () => {
  it('carry every filter on screen and no page — the file is the whole screen', async () => {
    /* An export that dropped the tag, or kept `page=3`, would be a file that
       disagrees with the list the merchant checked before pressing Export. */
    const { partyExportPath } =
      await import('modules/DigiKhaato/features/parties/api/partyService');
    const { DEFAULT_PARTY_FILTERS } =
      await import('modules/DigiKhaato/features/parties/redux/partyListSlice');
    const path = partyExportPath({
      ...DEFAULT_PARTY_FILTERS,
      q: 'Kumar',
      tag: 'Camp Area',
      page: 3,
    });
    expect(path).toContain('q=Kumar');
    expect(path).toContain('tag=Camp+Area');
    expect(path).not.toContain('page');

    const { itemExportPath } =
      await import('modules/DigiKhaato/features/inventory/api/itemService');
    const items = itemExportPath({
      q: 'rice',
      tab: 'low',
      type: '',
      categoryId: '',
      status: 'active',
      ordering: 'on_hand',
      page: 4,
    });
    expect(items).toBe('/items?q=rice&stock=low&status=active&ordering=on_hand');
  });
});
