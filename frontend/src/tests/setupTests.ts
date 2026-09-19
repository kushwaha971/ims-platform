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
