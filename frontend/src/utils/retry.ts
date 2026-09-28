/** Resolves after `ms` milliseconds. */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Runs `attempt`; while it fails with an error `shouldRetry` accepts, waits the
 * next delay in `delaysMs` and runs it again. So `delaysMs.length` is the number
 * of RETRIES, and the delays are the backoff. Any other failure, and the last
 * one, is rethrown unchanged.
 *
 * Bounded by construction — there is no "retry forever" spelling — because an
 * unbounded retry is a request the user cannot stop and a server that cannot
 * shed load.
 */
export const retryWhile = async <T>(
  attempt: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  delaysMs: readonly number[]
): Promise<T> => {
  for (const delay of delaysMs) {
    try {
      return await attempt();
    } catch (error) {
      if (!shouldRetry(error)) throw error;
    }
    await wait(delay);
  }
  return attempt();
};
