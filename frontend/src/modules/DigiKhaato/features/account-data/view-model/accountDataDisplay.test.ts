import { toTenantExport } from '../api/accountDataService';

import { daysLeft, exportBadge, formatBytes, isInFlight, nameMatches } from './accountDataDisplay';

/** PLT-10 — the pure half of "Your data". */
describe('accountDataDisplay', () => {
  it('rounds the cool-off UP, so the last day still reads "1 day left"', () => {
    const hour = 60 * 60 * 1000;
    expect(daysLeft(30 * 24 * hour)).toBe(30);
    expect(daysLeft(29 * 24 * hour + 1)).toBe(30);
    expect(daysLeft(hour)).toBe(1);
    expect(daysLeft(0)).toBe(0);
    expect(daysLeft(-5)).toBe(0);
  });

  it('compares the typed business name the way the server does: trimmed, any case', () => {
    expect(nameMatches('  sharma kirana ', 'Sharma Kirana')).toBe(true);
    expect(nameMatches('Sharma', 'Sharma Kirana')).toBe(false);
  });

  it('prints sizes in binary units with one decimal', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(null)).toBe('—');
  });

  it('gives every export state a badge, and polls only what is still being built', () => {
    expect(exportBadge('succeeded').tone).toBe('success');
    expect(exportBadge('failed').tone).toBe('error');
    expect(exportBadge('expired').labelId).toBe('data.export.status.expired');
    const base = toTenantExport({
      id: 'e1',
      status: 'running',
      requested_at: '2026-09-24T10:00:00Z',
      finished_at: null,
      expires_at: null,
      size_bytes: null,
      download_url: null,
      requested_by: null,
    });
    expect(isInFlight(base)).toBe(true);
    expect(isInFlight({ ...base, status: 'succeeded' })).toBe(false);
  });

  it('turns the server download path into an absolute URL, never one relative to the page', () => {
    // A relative href resolves against the FRONTEND origin and saves the page's HTML.
    const row = toTenantExport({
      id: 'e1',
      status: 'succeeded',
      requested_at: '2026-09-24T10:00:00Z',
      finished_at: '2026-09-24T10:01:00Z',
      expires_at: '2026-10-01T10:01:00Z',
      size_bytes: 2048,
      row_counts: { 'parties.csv': 3 },
      download_url: '/api/v1/tenants/current/exports/e1/download',
      requested_by: { id: 'u1', name: 'Ramesh' },
    });
    expect(row.downloadUrl).toMatch(
      /^https?:\/\/.+\/api\/v1\/tenants\/current\/exports\/e1\/download$/
    );
    expect(row.rowCounts['parties.csv']).toBe(3);
    expect(row.requestedBy).toBe('Ramesh');
  });
});
