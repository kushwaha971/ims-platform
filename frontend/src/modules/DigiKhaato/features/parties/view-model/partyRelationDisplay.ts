import type { PartyRelation } from '../types/party.types';

type Translate = (id: string, values?: Record<string, string | number | Date>) => string;

/**
 * A6 (PLT-X04 §8) — the words for guardian/payer links. Their copy is the `partyLinks` catalogue rather than
 * `parties`, because `parties` is loaded by every screen with a party picker
 * and these sentences are read only on a khata and in the archive dialogs.
 */

const LINE_ON_PERSON = {
  guardian: 'parties.relations.line.guardian',
  payer: 'parties.relations.line.payer',
} as const;
const LINE_ON_RELATED = {
  guardian: 'parties.relations.line.guardianOf',
  payer: 'parties.relations.line.payerFor',
} as const;

/** The kind as a word — the dialog's choice and the removal confirmation. */
export const KIND_LABEL = {
  guardian: 'parties.relations.kind.guardian',
  payer: 'parties.relations.kind.payer',
} as const;

/**
 * The one-line reading of a link from the khata it is shown on: on Rahul's
 * "Guardian: Mohan", on Mohan's "Guardian of Rahul". `other` is the party the
 * line names, which is what the row links to.
 */
export const relationLine = (
  t: Translate,
  relation: PartyRelation,
  viewpoint: 'person' | 'related'
): { readonly title: string; readonly other: PartyRelation['party'] } =>
  viewpoint === 'person'
    ? {
        title: t(LINE_ON_PERSON[relation.kind], { name: relation.relatedParty.name }),
        other: relation.relatedParty,
      }
    : {
        title: t(LINE_ON_RELATED[relation.kind], { name: relation.party.name }),
        other: relation.party,
      };
