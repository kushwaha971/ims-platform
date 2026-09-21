/**
 * The theme rules, at the slice level.
 *
 * The defect these prevent: `themeSlice` had a `systemThemeObserved` action that
 * copied `prefers-color-scheme` into `mode` whenever `explicit` was false, and
 * `explicit` was only set by `themeChanged`, which **nothing dispatched** — there
 * was no theme control anywhere in the product. So the operating system decided
 * the theme permanently, and §19.8.4's "light is the default" was unreachable.
 */
import reducer, {
  selectThemeIsExplicit,
  selectThemeMode,
  themeChanged,
  themeRestored,
  type ThemeState,
} from './themeSlice';

const initial = (): ThemeState => reducer(undefined, { type: '@@INIT' });

describe('themeSlice', () => {
  it('starts light and unchosen', () => {
    expect(initial()).toEqual({ mode: 'light', explicit: false });
  });

  it('records a choice as explicit, which is what allows it to be persisted', () => {
    const next = reducer(initial(), themeChanged('dark'));
    expect(next).toEqual({ mode: 'dark', explicit: true });
  });

  it('treats a restored cookie value as explicit, because only a choice is stored', () => {
    const next = reducer(initial(), themeRestored('dark'));
    expect(next.mode).toBe('dark');
    expect(next.explicit).toBe(true);
  });

  it('has no action that lets the operating system set the mode', () => {
    // The guard against reintroducing the bug. A `systemThemeObserved` — under
    // any name — cannot coexist with "light is the default": the moment the OS
    // can write `mode`, the default is the OS's, not the product's.
    const actionNames = Object.keys(reducer(initial(), { type: 'probe' }));
    expect(actionNames).toEqual(['mode', 'explicit']);
    expect(reducer(initial(), { type: 'theme/systemThemeObserved', payload: 'dark' })).toEqual({
      mode: 'light',
      explicit: false,
    });
  });

  it('selects what it stores', () => {
    const state = { theme: reducer(initial(), themeChanged('dark')) } as never;
    expect(selectThemeMode(state)).toBe('dark');
    expect(selectThemeIsExplicit(state)).toBe(true);
  });
});
