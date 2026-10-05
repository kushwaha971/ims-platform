import {
  deviceLabelFrom,
  minutesUntil,
  passwordStrength,
  safeNextPath,
  secondsUntil,
} from './authDisplay';

/**
 * Part 19 §19.1.1 layer 3 — the pure layer. Where a session goes after sign-in
 * used to be tested here as a client rule; it is the server's now
 * (`backend/apps/platform_app/tests/test_landing.py`), and `landing.test.ts`
 * proves the one place it becomes a path (docs/platform/14 §4.1).
 */

describe('safeNextPath — §19.6.4 rule 2', () => {
  it('keeps a same-origin absolute path', () => {
    expect(safeNextPath('/parties?q=ram', '/dashboard')).toBe('/parties?q=ram');
  });

  it.each<readonly [string | null, string]>([
    ['//evil.com', 'a protocol-relative URL'],
    ['https://evil.com', 'an absolute URL'],
    ['/\\evil.com', 'a backslash-escaped host'],
    ['javascript://x', 'a scheme'],
    ['parties', 'a relative path with no leading slash'],
    ['', 'an empty value'],
    [null, 'a missing value'],
  ])('refuses %s (%s) and uses the fallback', (value: string | null) => {
    expect(safeNextPath(value, '/dashboard')).toBe('/dashboard');
  });
});

/**
 * F-2 (QA, 23 Sep 2026) — the open redirect the prefix deny-list let through.
 *
 * `/login?next=/%09/evil.test/x` was proven live: `searchParams.get` decodes
 * `%09` to a tab, the old check saw `/` + tab and passed it, and the browser's
 * URL parser deleted the tab, navigating to `//evil.test/x` on another host.
 * The old helper returned every refused row below verbatim, except the UNC
 * backslash and `javascript:`, which it already refused and which stay here as
 * regression rows.
 */
describe('safeNextPath — F-2 parser-rewrite bypasses', () => {
  it.each<readonly [string, string]>([
    ['/\t/evil.com', 'a tab after the first slash'],
    ['/\n/evil.com', 'a line feed after the first slash'],
    ['/\r/evil.com', 'a carriage return after the first slash'],
    ['/\u0000/evil.com', 'a NUL'],
    ['/\u007F/evil.com', 'a DEL'],
    ['/\t\t/evil.com', 'several stripped characters'],
    ['/parties\\..\\..\\evil.com', 'a backslash later in the path'],
    ['\\\\evil.com', 'a UNC-style double backslash'],
    ['/.//evil.com', 'a dot segment that resolves to //evil.com'],
    ['/a/../..//evil.com', 'dot-dot segments that resolve to //evil.com'],
    ['/%2F/evil.com', 'an encoded slash that one stray decode turns into //'],
    ['/%5C/evil.com', 'an encoded backslash'],
    ['/%E0%A4', 'a malformed percent sequence'],
    ['javascript:alert(1)', 'a javascript: URL'],
  ])('refuses %j (%s)', (value: string) => {
    expect(safeNextPath(value, '/dashboard')).toBe('/dashboard');
  });

  it('refuses the exact live payload once URLSearchParams has decoded it', () => {
    const next = new URLSearchParams('next=/%09/evil.test/x').get('next');
    expect(next).toBe('/\t/evil.test/x');
    expect(safeNextPath(next, '/dashboard')).toBe('/dashboard');
  });

  it('allows a space, which the parser encodes into a same-origin path', () => {
    // Decided: harmless. `/ /evil.com` is `/%20/evil.com` on our own host.
    expect(safeNextPath('/ /evil.com', '/dashboard')).toBe('/%20/evil.com');
  });

  it.each<readonly [string, string]>([
    ['/parties?x=1#y', '/parties?x=1#y'],
    ['/parties/abc', '/parties/abc'],
    [
      '/parties/3f2a9c1e-0000-4000-8000-000000000001/statement?from=2026-04-01',
      '/parties/3f2a9c1e-0000-4000-8000-000000000001/statement?from=2026-04-01',
    ],
    ['/parties?tag=Camp%20Area', '/parties?tag=Camp%20Area'],
  ])('keeps the in-app address %s', (value: string, expected: string) => {
    expect(safeNextPath(value, '/dashboard')).toBe(expected);
  });
});

describe('countdown arithmetic', () => {
  it('never returns a negative number of seconds', () => {
    expect(secondsUntil(1_000, 5_000)).toBe(0);
  });

  it('rounds a part-second up, so "1s left" is never shown as 0', () => {
    expect(secondsUntil(5_500, 5_000)).toBe(1);
  });

  it('rounds a part-minute up for the throttle copy', () => {
    expect(minutesUntil(61_000, 0)).toBe(2);
    expect(minutesUntil(null, 0)).toBe(0);
  });
});

describe('passwordStrength — PLT-02 §7', () => {
  it('says nothing about an empty field', () => {
    expect(passwordStrength('').percent).toBe(0);
  });

  it('calls a bare ten-character password weak', () => {
    expect(passwordStrength('aaaaaaaaaa').strength).toBe('weak');
  });

  it('calls a letter-and-digit password at the floor fair', () => {
    expect(passwordStrength('abcdefgh12').strength).toBe('fair');
  });

  /**
   * CR-2026-09-19-A moved the floor to ten (Part 27 §27.4.2). The meter has to
   * move with it: a nine-character password the FORM will reject must not be
   * presented as having cleared the length signal.
   */
  it('gives a nine-character password no credit for length', () => {
    const nine = passwordStrength('abcdefg12');
    const ten = passwordStrength('abcdefgh12');
    expect(nine.percent).toBeLessThan(ten.percent);
  });

  it('calls a long mixed password strong', () => {
    expect(passwordStrength('Kirana#2026Shop').strength).toBe('strong');
  });

  it('never exceeds 100 %', () => {
    expect(passwordStrength('Kirana#2026Shop!!!!').percent).toBeLessThanOrEqual(100);
  });
});

describe('deviceLabelFrom — PLT-01 §7', () => {
  it('names the browser and the platform a user will recognise', () => {
    expect(
      deviceLabelFrom(
        'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
        'Browser'
      )
    ).toBe('Chrome on Android');
  });

  it('prefers Edge over the Chrome token it also carries', () => {
    expect(deviceLabelFrom('Windows Chrome/120 Edg/120', 'Browser')).toBe('Edge on Windows');
  });

  it('falls back rather than inventing a label it cannot derive', () => {
    expect(deviceLabelFrom('curl/8.0', 'Browser')).toBe('Browser');
  });

  it('caps the label at the documented 120 characters', () => {
    expect(deviceLabelFrom('', 'x'.repeat(200))).toHaveLength(120);
  });
});
