import type { ApiErrorShape } from 'src/types/api.types';
import { rootOfPath, snakeToCamelPath } from 'src/utils/caseMapper';
import { flattenErrorDetails } from 'src/utils/errorDetails';

import type { FieldErrors, FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.5.6 — maps a 400's `details` onto RHF fields.
 *
 * Returns the messages that could NOT be anchored to a field so the caller can
 * show them at form level: nothing the server said is ever dropped silently.
 * `shouldFocus` matters more than it looks — on a 360 px screen with the
 * keyboard up, scrolling the rejected field into view is the difference between
 * a fixable error and an abandoned form.
 *
 * This used to call `.join(' ')` on every value in `details`, which is only
 * true of the flat `F` envelope. DRF nests a child serializer's errors as an
 * OBJECT — `TenantUpdateSerializer.address` is an `AddressSerializer`, so a
 * rejected onboarding step 3 arrives as `{address: {line1: […]}, phone: […]}`
 * — and `.join` is not a function on an object. The handler that exists to
 * DISPLAY the 400 threw instead, and because `address` is declared before
 * `phone` it threw on the first entry. `flattenErrorDetails` owns every shape
 * `details` can take; see `src/utils/errorDetails.ts`.
 */
export function applyServerErrors<T extends FieldValues>(
  error: ApiErrorShape,
  setError: UseFormSetError<T>,
  knownFields: readonly string[]
): readonly string[] {
  const unanchored: string[] = [];
  let focused = false;

  flattenErrorDetails(error.details).forEach(({ path: wirePath, message }) => {
    // `non_field_errors` is DRF's form-level bucket, at any depth: the server's
    // own `address.non_field_errors` belongs in the banner, not on a control
    // called "nonFieldErrors" that no form has.
    if (wirePath.split('.').includes('non_field_errors')) {
      unanchored.push(message);
      return;
    }

    const path = snakeToCamelPath(wirePath);
    // A nested path anchors on the control that owns it if the form is nested
    // (`address.line1`), and on the leaf if the form is flat (`line1`) — the
    // onboarding address step is the second kind, and before this it could not
    // anchor a server message at all.
    const candidates = [path, rootOfPath(path), path.split('.').slice(-1)[0] ?? path];
    const anchor = candidates.find((candidate) =>
      knownFields.includes(rootOfPath(candidate))
    );

    if (anchor === undefined) {
      unanchored.push(message);
      return;
    }

    // Only the FIRST rejected field is scrolled to. RHF focuses on every call,
    // so focusing each one walked the user down the form to the last error.
    setError(anchor as Path<T>, { type: 'server', message }, { shouldFocus: !focused });
    focused = true;
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
