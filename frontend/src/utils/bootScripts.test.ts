import { BRAND_CACHE_STORAGE_KEY, BRAND_INIT, THEME_INIT } from 'src/utils/bootScripts';
import { THEME_CHOICE_COOKIE } from 'src/utils/cookieUtils';
import { writeLocal } from 'src/utils/storage';
import { THEME_CACHE_KEY } from 'src/utils/theme';

/**
 * The pre-paint scripts are strings, so the only honest test is to RUN them
 * against what their writers actually wrote.
 */
const run = (script: string): void => {
  new Function(script)();
};

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  document.cookie = `${THEME_CHOICE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
});

describe('BRAND_INIT', () => {
  /**
   * The defect: BRAND_INIT read `ub.theme_cache` while WhiteLabelSync wrote
   * `writeLocal('ub_theme_cache')`, i.e. `ub.ub_theme_cache`. The cache was
   * written and never read, so a white-labelled shop flashed indigo on every
   * load. Writing through the REAL writer and running the REAL script is what
   * fails if either side's spelling moves again.
   */
  it('replays the ramp WhiteLabelSync writes through writeLocal', () => {
    writeLocal(THEME_CACHE_KEY, {
      tenantId: 't-1',
      vars: { '--primary-500': '170 60% 40%', '--accent-quiet': 'rgba(1, 2, 3, 0.1)' },
    });

    run(BRAND_INIT);

    expect(document.documentElement.style.getPropertyValue('--primary-500')).toBe('170 60% 40%');
    expect(document.documentElement.style.getPropertyValue('--accent-quiet')).toBe(
      'rgba(1, 2, 3, 0.1)'
    );
  });

  it('reads the key storage.ts writes, not a hand-spelled copy of it', () => {
    expect(BRAND_CACHE_STORAGE_KEY).toBe('ub.ub_theme_cache');
    expect(BRAND_INIT).toContain(JSON.stringify(BRAND_CACHE_STORAGE_KEY));
  });

  it('ignores anything in the cache that is not the primary ramp or the two tints', () => {
    writeLocal(THEME_CACHE_KEY, { tenantId: 't-1', vars: { '--canvas': '0 0% 0%' } });

    run(BRAND_INIT);

    expect(document.documentElement.style.getPropertyValue('--canvas')).toBe('');
  });

  it('survives a corrupt cache without throwing', () => {
    window.localStorage.setItem(BRAND_CACHE_STORAGE_KEY, '{not json');

    expect(() => run(BRAND_INIT)).not.toThrow();
  });
});

describe('THEME_INIT', () => {
  /** The landing page's toggle writes this cookie; a reload must honour it. */
  it('applies an explicit dark choice from the cookie', () => {
    document.cookie = `${THEME_CHOICE_COOKIE}=dark; path=/`;

    run(THEME_INIT);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to light with no choice, whatever the OS prefers (§19.8.4)', () => {
    run(THEME_INIT);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
