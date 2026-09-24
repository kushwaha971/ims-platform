import { POLL_STEPS } from '../constants/importKinds';

import {
  commitBlockReason,
  fileSizeLabel,
  pollDelay,
  previewCell,
  progressPercent,
  summaryValue,
  wizardStep,
} from './importDisplay';
import { EXPORT_POLL_STEPS } from './pollDelay';

import type { ImportJob } from '../types/import.types';

const JOB: ImportJob = {
  id: 'j1',
  kind: 'parties',
  status: 'ready',
  totalRows: 12,
  validRows: 10,
  errorRows: 2,
  fileName: 'parties.csv',
  fileSizeBytes: 2048,
  summary: null,
  failure: null,
  errors: [],
  errorsTotal: 2,
  errorsTruncated: false,
  warnings: [],
  previewRows: [],
  totals: {},
  progress: null,
  hasErrorFile: true,
  canCommit: false,
  summaryFields: [],
  createdAt: '2026-09-24T05:00:00Z',
  finishedAt: null,
};

const YES_NO = { yes: 'Yes', no: 'No' };

describe('pollDelay (IMP-01 FR-8)', () => {
  it('polls every 2 s, then 5 s after 30 s, then 15 s after two minutes', () => {
    /* A job that takes ten minutes must not cost three hundred requests, and a
       job that takes five seconds must not make the merchant wait fifteen. */
    expect(pollDelay(0, POLL_STEPS)).toBe(2_000);
    expect(pollDelay(29_999, POLL_STEPS)).toBe(2_000);
    expect(pollDelay(30_000, POLL_STEPS)).toBe(5_000);
    expect(pollDelay(119_999, POLL_STEPS)).toBe(5_000);
    expect(pollDelay(120_000, POLL_STEPS)).toBe(15_000);
  });

  it('backs an export poll off from 3 s to 10 s (IMP-02 FR-14)', () => {
    expect(pollDelay(0, EXPORT_POLL_STEPS)).toBe(3_000);
    expect(pollDelay(45_000, EXPORT_POLL_STEPS)).toBe(10_000);
  });
});

describe('commitBlockReason (FR-6, §8)', () => {
  it('names the rows to fix when there are problems', () => {
    /* The disabled Import button carries its reason BENEATH it — a phone has
       no hover, so a tooltip would be a reason nobody can read. */
    expect(commitBlockReason(JOB)).toEqual({
      id: 'imports.review.blocked.errors',
      values: { count: 2 },
    });
  });

  it('says the file is empty rather than blaming the merchant', () => {
    expect(commitBlockReason({ ...JOB, errorRows: 0, validRows: 0 })).toEqual({
      id: 'imports.review.blocked.empty',
    });
  });

  it('says whose decision it is when the server withholds the commit', () => {
    // An accountant reads the preview; only the owner or an admin commits.
    expect(commitBlockReason({ ...JOB, errorRows: 0 })).toEqual({
      id: 'imports.review.blocked.permission',
    });
  });

  it('is null — enabled — when the server says the job may be committed', () => {
    expect(commitBlockReason({ ...JOB, errorRows: 0, canCommit: true })).toBeNull();
  });
});

describe('previewCell (AC-3)', () => {
  it('formats money as the product will show it, so a shifted column stands out', () => {
    expect(previewCell('124500.00', 'money', YES_NO)).toBe('₹1,24,500.00');
  });

  it('prints dates dd/mm/yyyy, the way rows read everywhere else', () => {
    expect(previewCell('2026-04-01', 'date', YES_NO)).toBe('01/04/2026');
  });

  it('joins lists and draws a dash for nothing', () => {
    expect(previewCell(['Camp Area', 'Route 2'], 'list', YES_NO)).toBe('Camp Area, Route 2');
    expect(previewCell(null, 'text', YES_NO)).toBe('—');
    expect(previewCell([], 'list', YES_NO)).toBe('—');
    expect(previewCell(true, 'bool', YES_NO)).toBe('Yes');
  });

  /* Found on the look stack: the preview printed "+91982000…" (a 13-digit
     run cut by its column) and "to_receive" / "customer" — the file's codes,
     not what the khata will say once the row is saved. */
  it('groups a mobile as the party list does, and words a coded choice', () => {
    expect(previewCell('+919820000001', 'mobile', YES_NO)).toBe('+91 98200 00001');
    const choice = (value: string) => (value === 'to_receive' ? 'They owe me' : value);
    expect(previewCell('to_receive', 'label', { ...YES_NO, choice })).toBe('They owe me');
    expect(previewCell('to_receive', 'label', YES_NO)).toBe('to_receive');
  });
});

describe('the rest of the read', () => {
  it('puts a job at step 3, a chosen kind at 2, nothing at 1', () => {
    expect(wizardStep(JOB, 'parties')).toBe(3);
    expect(wizardStep(null, 'items')).toBe(2);
    expect(wizardStep(null, null)).toBe(1);
  });

  it('has no percentage until the total is known', () => {
    expect(progressPercent(null)).toBeNull();
    expect(progressPercent({ done: 200, total: null })).toBeNull();
    expect(progressPercent({ done: 50, total: 200 })).toBe(25);
  });

  it('formats money summary fields as rupees and counts as counts', () => {
    expect(summaryValue('opening_receivable', '2300.00')).toBe('₹2,300.00');
    expect(summaryValue('created_parties', 412)).toBe('412');
  });

  it('labels a file size in the unit a person reads', () => {
    expect(fileSizeLabel(512)).toBe('512 B');
    expect(fileSizeLabel(2048)).toBe('2.0 KB');
    expect(fileSizeLabel(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});
