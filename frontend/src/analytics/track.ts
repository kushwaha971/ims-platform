/**
 * Record that something happened, for product analytics (DEC-017).
 *
 * It never LOADS the SDK: if analytics is off, not allowed on this address, or
 * simply not here yet, the call does nothing. So a screen may say what
 * happened without knowing whether anybody is listening, and without putting
 * the SDK in its own chunk.
 *
 * `properties` are facts about the product — which cut, which chapter, which
 * app — never anything a person typed and never a name, a number or an amount
 * (`analyticsRules.ts`, rule 3).
 */
export const track = (
  event: string,
  properties: Record<string, string | number | boolean> = {}
): void => {
  if (typeof window === 'undefined') return;
  void import('./posthogClient')
    .then(({ posthogIfLoaded }) => posthogIfLoaded()?.capture(event, properties))
    .catch(() => undefined);
};
