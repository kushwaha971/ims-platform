import { insertAt, renderTemplatePreview, templateProblems } from './settingsDisplay';

const SAMPLE = {
  party_name: 'Ramesh',
  business_name: 'Kirana Bhandar',
  amount: '₹2,300.00',
  due_date: '30/09/2026',
  upi_link: 'upi://pay?pa=shop@okaxis',
};

/**
 * PLT-06 T-PLT-06-2 — the client mirror of the server's template rules. The
 * same four cases are pinned in `apps/platform_app/tests/test_tenant_settings.py`.
 */
describe('reminder templates', () => {
  it('accepts the seeded template shape', () => {
    expect(templateProblems('Namaste {party_name}, {amount} is due to {business_name}.')).toEqual(
      []
    );
  });

  it('names an unknown placeholder, which would reach the customer as braces', () => {
    expect(templateProblems('{balanse} {amount}')).toContainEqual({
      kind: 'unknown',
      name: 'balanse',
    });
  });

  it('refuses a message that does not say how much is owed (EC-4, research F7)', () => {
    expect(templateProblems('Please pay soon.')).toContainEqual({ kind: 'missingAmount' });
  });

  it('lets an empty template through, which falls back to the default (BR-5)', () => {
    expect(templateProblems('')).toEqual([]);
  });

  it('previews with sample values and leaves an unknown token visible', () => {
    expect(renderTemplatePreview('Hi {party_name}, {amount} {oops}', SAMPLE)).toBe(
      'Hi Ramesh, ₹2,300.00 {oops}'
    );
  });

  it('inserts a chip at the caret, or at the end when there is none', () => {
    expect(insertAt('Hi , pay', 'party_name', 3)).toEqual({
      text: 'Hi {party_name}, pay',
      caret: 15,
    });
    expect(insertAt('Pay ', 'amount', null).text).toBe('Pay {amount}');
  });
});
