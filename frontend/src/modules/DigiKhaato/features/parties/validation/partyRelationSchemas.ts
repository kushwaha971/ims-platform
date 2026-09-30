'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import type { PartyRelationKind } from '../types/party.types';

export const RELATION_KINDS: readonly PartyRelationKind[] = ['guardian', 'payer'];

export interface PartyRelationFormValues {
  relatedPartyId: string;
  /** Shown in the picked row; never sent. */
  relatedPartyName: string;
  kind: PartyRelationKind;
  receivesMessages: boolean;
}

/** The RHF paths this form owns, so a server `related_party_id` error lands on the picker. */
export const RELATION_FIELD_FOR_SERVER: Readonly<Record<string, keyof PartyRelationFormValues>> = {
  related_party_id: 'relatedPartyId',
  kind: 'kind',
};

/**
 * A6 — the guardian/payer form, composed from the central validators (R-F-2).
 * The picker refuses the party whose khata this is (BR-2) before the server has
 * to; the duplicate check is the server's, because only it knows every link.
 */
export const usePartyRelationSchemas = (
  selfId: string
): { readonly relationSchema: Yup.ObjectSchema<PartyRelationFormValues> } => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(
    () => ({
      relationSchema: Yup.object({
        relatedPartyId: Yup.string()
          .required(t('parties.relations.validation.party'))
          .notOneOf([selfId], t('parties.relations.validation.self')),
        relatedPartyName: Yup.string().defined(),
        kind: v.enumValidation(RELATION_KINDS, 'parties.relations.validation.kind').defined(),
        receivesMessages: Yup.boolean().defined(),
      }),
    }),
    [v, t, selfId]
  );
};
