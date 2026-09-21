import '@testing-library/jest-dom';

/**
 * `src/constants.ts` validates its environment at module load, so the test run
 * has to supply the same variables the app requires (§19.14.1).
 */
process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:8000/api/v1';

// jsdom has no matchMedia; ThemeProvider and the responsive hooks read it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

/**
 * jsdom has no `AbortSignal.timeout` either. It is the request ceiling on
 * §19.10.3's connectivity probe (`useDegradedNetwork`), and its absence is not
 * a harmless gap: `probe()` wraps its whole body in `try/catch` so that a dead
 * link is a `false` rather than a throw, which means a missing
 * `AbortSignal.timeout` makes the probe report a failed link WITHOUT EVER
 * CALLING `fetch`. A test of probe behaviour would then pass or fail for a
 * reason that has nothing to do with the code under test.
 *
 * Timers are the honest shape for it, so it also behaves under
 * `jest.useFakeTimers()`, which is how the probe's spacing is tested at all.
 */
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
  Object.defineProperty(AbortSignal, 'timeout', {
    writable: true,
    configurable: true,
    value: (ms: number): AbortSignal => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
      return controller.signal;
    },
  });
}
