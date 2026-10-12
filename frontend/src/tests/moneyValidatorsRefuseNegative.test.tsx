import { useEffect } from 'react';

import { useValidationSchemas, type ValidationSchemas } from 'src/hooks/useValidationSchemas';
import { renderWithProviders } from 'src/tests/renderWithProviders';

/**
 * QA B14 — "Staff may waive up to" took −50 and saved ₹50.00 with a success toast:
 * the money input dropped the minus without a word. It now keeps it, and both money
 * validators every form shares refuse it as "Enter 0 or more." before any format
 * check could word it as a typo.
 */
function Probe({ onReady }: Readonly<{ onReady: (v: ValidationSchemas) => void }>): null {
  const schemas = useValidationSchemas();
  useEffect(() => onReady(schemas), [onReady, schemas]);
  return null;
}

const messageOf = (run: () => unknown): string => {
  try {
    run();
    return '';
  } catch (error) {
    return (error as Error).message;
  }
};

it('refuses a negative amount in words, in the required and the optional validator', () => {
  let v = null as unknown as ValidationSchemas;
  renderWithProviders(
    <Probe
      onReady={(schemas) => {
        v = schemas;
      }}
    />
  );
  expect(messageOf(() => v.amountValidation({ allowZero: true }).validateSync('-50'))).toBe(
    'Enter 0 or more.'
  );
  expect(messageOf(() => v.optionalAmountValidation().validateSync('-50'))).toBe(
    'Enter 0 or more.'
  );
  expect(messageOf(() => v.optionalAmountValidation().validateSync('50'))).toBe('');
});
