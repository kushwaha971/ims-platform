import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import {
  flattenErrorDetails,
  readDetail,
  readDetailNumber,
  readFieldCodes,
} from 'src/utils/errorDetails';

/**
 * Part 19 §19.5.6 — reading a 400 without throwing on it.
 *
 * The bug this file exists to hold down: `applyServerErrors` called `.join(' ')`
 * on every value in `details`. DRF nests a child serializer's errors as an
 * OBJECT, and `TenantUpdateSerializer.address` is an `AddressSerializer`, so
 * the wizard's step 3 gets `{address: {line1: [...]}, phone: [...]}` and
 * `.join` is not a function. The handler that exists to DISPLAY the 400 threw
 * instead — and `address` is declared before `phone` on the serializer, so it
 * threw on the very first entry.
 */
const error = (details: Record<string, unknown>): ApiErrorShape => ({
  code: 'validation_error',
  message: 'Please check the highlighted fields.',
  details,
  requestId: 'req_9',
  status: 400,
  warnings: [],
});

/** A stand-in for RHF's `setError`, recording what was anchored where. */
const recorder = (): {
  readonly setError: jest.Mock;
  readonly anchored: () => Record<string, string>;
} => {
  const setError = jest.fn();
  return {
    setError,
    anchored: () =>
      Object.fromEntries(
        setError.mock.calls.map((call) => [
          call[0] as string,
          (call[1] as { message: string }).message,
        ])
      ),
  };
};

describe('applyServerErrors — DRF nests, and this must not throw on it', () => {
  it('flattens a nested child serializer onto the flat controls the form has', () => {
    const { setError, anchored } = recorder();

    // Exactly what `PATCH /tenants/current` answers when step 3 is rejected.
    const unanchored = applyServerErrors(
      error({
        address: {
          line1: ['This field may not be null.'],
          pincode: ['Enter a valid pincode.'],
        },
        phone: ['Enter a valid phone number.'],
      }),
      // The onboarding address step's RHF fields are FLAT (`line1`, `pincode`),
      // while the wire path is nested (`address.line1`).
      setError as never,
      ['line1', 'line2', 'city', 'district', 'pincode', 'phone', 'email']
    );

    expect(anchored()).toEqual({
      line1: 'This field may not be null.',
      pincode: 'Enter a valid pincode.',
      phone: 'Enter a valid phone number.',
    });
    expect(unanchored).toEqual([]);
  });

  it('anchors on the nested RHF path when the form is itself nested', () => {
    const { setError, anchored } = recorder();

    applyServerErrors(error({ address: { line1: ['Required.'] } }), setError as never, [
      'address',
      'phone',
    ]);

    expect(anchored()).toEqual({ 'address.line1': 'Required.' });
  });

  it('focuses only the FIRST rejected field, not every one in turn', () => {
    const { setError } = recorder();

    applyServerErrors(error({ line1: ['a'], pincode: ['b'], phone: ['c'] }), setError as never, [
      'line1',
      'pincode',
      'phone',
    ]);

    const focusFlags = setError.mock.calls.map(
      (call) => (call[2] as { shouldFocus: boolean }).shouldFocus
    );
    expect(focusFlags).toEqual([true, false, false]);
  });

  it('sends a message it cannot anchor to the form-level banner, never nowhere', () => {
    const { setError } = recorder();

    const unanchored = applyServerErrors(
      error({
        non_field_errors: ['That business already exists.'],
        address: { non_field_errors: ['An address needs a city.'] },
        gstin: ['Not a valid GSTIN.'],
      }),
      setError as never,
      ['line1']
    );

    expect(unanchored).toEqual([
      'That business already exists.',
      'An address needs a city.',
      'Not a valid GSTIN.',
    ]);
    expect(setError).not.toHaveBeenCalled();
  });

  it('joins several messages for one field into one sentence', () => {
    const { setError, anchored } = recorder();

    applyServerErrors(error({ password: ['Too short.', 'Too common.'] }), setError as never, [
      'password',
    ]);

    expect(anchored()).toEqual({ password: 'Too short. Too common.' });
  });

  it('survives a scalar, a null and a deeply nested list without throwing', () => {
    const { setError } = recorder();

    expect(() =>
      applyServerErrors(
        error({
          detail: 'Not found.',
          nothing: null,
          lines: [{}, { unit_price: ['Must be a decimal string.'] }],
        }),
        setError as never,
        ['lines']
      )
    ).not.toThrow();

    expect(setError.mock.calls[0]?.[0]).toBe('lines.1.unitPrice');
  });
});

describe('errorDetails — the one sanctioned reader for both envelopes', () => {
  it('reads a `D` envelope scalar and a nested one by dotted path', () => {
    const details = {
      limit: 3,
      plan_code: 'free',
      support_contact: { phone: '+919000000000' },
    };

    expect(readDetail(details, 'limit')).toBe(3);
    expect(readDetail(details, 'plan_code')).toBe('free');
    expect(readDetail(details, 'support_contact.phone')).toBe('+919000000000');
  });

  it('unwraps the one-element `F` spelling of the same value', () => {
    expect(readDetailNumber({ retry_after: ['900'] }, 'retry_after')).toBe(900);
    expect(readDetailNumber({ retry_after: 900 }, 'retry_after')).toBe(900);
  });

  it('refuses a non-numeric value rather than returning NaN', () => {
    expect(readDetailNumber({ limit: 'lots' }, 'limit')).toBeNull();
    expect(readDetailNumber({ limit: {} }, 'limit')).toBeNull();
    expect(readDetailNumber({}, 'limit')).toBeNull();
  });

  it('keeps serializer field order, so the first rejected field is first', () => {
    const entries = flattenErrorDetails({
      address: { line1: ['a'] },
      phone: ['b'],
    });

    expect(entries.map((entry) => entry.path)).toEqual(['address.line1', 'phone']);
  });
});

/**
 * L6 — NEW-2's "already used by another login" rendered in English in the Hindi
 * UI, because the client printed the server's message verbatim and the server
 * does not localise field messages. The server now names the refusal with a
 * stable code in `details.field_codes`; these pin that the code, not the English,
 * decides what the merchant reads — and that the code itself is never printed.
 */
describe('applyServerErrors — field codes (L6)', () => {
  const MOBILE_TAKEN = error({
    mobile: ['This mobile number is already used by another login.'],
    field_codes: { mobile: 'mobile_taken' },
  });
  const hindi = (id: string): string =>
    id === 'errors.field.mobile_taken' ? 'यह मोबाइल नंबर पहले से इस्तेमाल हो रहा है।' : id;

  it('says a coded field in the UI language when given a translator', () => {
    const { setError, anchored } = recorder();
    const unanchored = applyServerErrors(MOBILE_TAKEN, setError, ['mobile'], hindi);

    expect(anchored()).toEqual({ mobile: 'यह मोबाइल नंबर पहले से इस्तेमाल हो रहा है।' });
    expect(unanchored).toEqual([]);
  });

  it('never prints the codes themselves as a form-level message', () => {
    const { setError } = recorder();
    const unanchored = applyServerErrors(MOBILE_TAKEN, setError, ['mobile']);

    expect(unanchored).toEqual([]);
    expect(flattenErrorDetails(MOBILE_TAKEN.details).map((one) => one.path)).toEqual(['mobile']);
  });

  it('keeps the server message when no translator is passed', () => {
    const { setError, anchored } = recorder();
    applyServerErrors(MOBILE_TAKEN, setError, ['mobile']);

    expect(anchored()).toEqual({ mobile: 'This mobile number is already used by another login.' });
  });

  it('keeps the server message for a code it has no key for', () => {
    const { setError, anchored } = recorder();
    applyServerErrors(
      error({ mobile: ['Server words.'], field_codes: { mobile: 'constructor' } }),
      setError,
      ['mobile'],
      hindi
    );

    expect(anchored()).toEqual({ mobile: 'Server words.' });
  });

  it('reads field codes defensively', () => {
    expect(readFieldCodes(undefined)).toEqual({});
    expect(readFieldCodes({ field_codes: ['mobile_taken'] })).toEqual({});
    expect(readFieldCodes({ field_codes: { mobile: 'mobile_taken', email: 3 } })).toEqual({
      mobile: 'mobile_taken',
    });
  });
});
