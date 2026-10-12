import { buildValidationSchemas } from 'src/hooks/useValidationSchemas';

/**
 * EC-8 — "today" is the business's day, not the device's. At 20:00 UTC an India
 * business is already on the next calendar day; the entry drawer fills that day
 * in as its default, and the rule used to compare it with the device's clock and
 * call it the future. Every form with a date refused its own default for five
 * and a half hours a night on any machine not set to India time — which also made
 * the ledger, payment and invoice suites fail on a UTC box after 18:30.
 */
describe('a business date is judged by the business’s clock', () => {
  const t = ((key: string) => key) as never;

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-12T20:00:00Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('accepts the business’s today even when the device is still on yesterday', async () => {
    const rule = buildValidationSchemas(t, 'Asia/Kolkata').businessDateValidation();
    await expect(rule.isValid('2026-10-13')).resolves.toBe(true);
    await expect(rule.isValid('2026-10-12')).resolves.toBe(true);
  });

  it('still refuses the business’s tomorrow', async () => {
    const rule = buildValidationSchemas(t, 'Asia/Kolkata').businessDateValidation();
    await expect(rule.isValid('2026-10-14')).resolves.toBe(false);
  });

  it('uses India time when the session has not named a zone', async () => {
    const rule = buildValidationSchemas(t).businessDateValidation();
    await expect(rule.isValid('2026-10-13')).resolves.toBe(true);
  });
});
