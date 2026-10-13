import { useMemo } from 'react';

import * as Yup from 'yup';

import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import { AUDIENCES, BULK_KINDS, CUSTOM_MESSAGE_MAX } from '../types/message.types';

import type {
  Audience,
  BulkKind,
  BulkMessageFormValues,
  CustomMessageFormValues,
} from '../types/message.types';

/**
 * QA F4 / B51 — the custom-message and group-message forms. Kept apart from
 * `memberSchemas` so a message dialog does not carry the admission schema (and
 * the payment editor's words) into its chunk. The server re-checks each rule.
 */
export interface MessageSchemas {
  readonly customSchema: Yup.ObjectSchema<CustomMessageFormValues>;
  readonly bulkSchema: Yup.ObjectSchema<BulkMessageFormValues>;
}

export const useMessageSchemas = (): MessageSchemas => {
  const v = useValidationSchemas();

  return useMemo(() => {
    const words = () => v.requiredText(CUSTOM_MESSAGE_MAX, 'library.messages.custom.required');
    const customSchema = Yup.object({ text: words() });
    const bulkSchema = Yup.object({
      kind: Yup.mixed<BulkKind>()
        .oneOf([...BULK_KINDS])
        .defined(),
      audience: Yup.mixed<Audience>()
        .oneOf([...AUDIENCES])
        .defined(),
      shiftId: Yup.string()
        .defined()
        .default('')
        .when('audience', {
          is: 'shift',
          then: () => v.requiredText(40, 'library.messages.bulk.shift.required'),
        }),
      text: Yup.string()
        .defined()
        .default('')
        .when('kind', { is: 'custom', then: () => words() }),
    });
    return { customSchema, bulkSchema } as MessageSchemas;
  }, [v]);
};
