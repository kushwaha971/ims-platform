import type { ApiErrorShape } from 'src/types/api.types';
import { rootOfPath, snakeToCamelPath } from 'src/utils/caseMapper';

import type { FieldErrors, FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.5.6 — maps a 400's `details` onto RHF fields.
 *
 * Returns the messages that could NOT be anchored to a field so the caller can
 * show them at form level: nothing the server said is ever dropped silently.
 * `shouldFocus` matters more than it looks — on a 360 px screen with the
 * keyboard up, scrolling the rejected field into view is the difference between
 * a fixable error and an abandoned form.
 */
export function applyServerErrors<T extends FieldValues>(
  error: ApiErrorShape,
  setError: UseFormSetError<T>,
  knownFields: readonly string[]
): readonly string[] {
  const unanchored: string[] = [];

  Object.entries(error.details).forEach(([wireField, messages]) => {
    const message = messages.join(' ');
    if (!message) return;
    if (wireField === 'non_field_errors') {
      unanchored.push(message);
      return;
    }
    const path = snakeToCamelPath(wireField);
    if (knownFields.includes(rootOfPath(path))) {
      setError(path as Path<T>, { type: 'server', message }, { shouldFocus: true });
    } else {
      unanchored.push(message);
    }
  });

  return unanchored;
}

/**
 * Reads one field's message out of RHF's nested error tree by dotted path, so
 * `UbField` never asks its caller to wire `errors.address?.pincode?.message`.
 */
export const getFieldError = (errors: FieldErrors, name: string): string | undefined => {
  const node = name.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, errors);

  if (typeof node !== 'object' || node === null) return undefined;
  const message = (node as { message?: unknown }).message;
  return typeof message === 'string' && message.length > 0 ? message : undefined;
};
