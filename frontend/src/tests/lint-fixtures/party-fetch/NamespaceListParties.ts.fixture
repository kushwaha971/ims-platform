// @lint-at: hooks/partyNamespaceProbe.ts
// @expect: no-restricted-imports, no-restricted-syntax
// The namespace spelling: `import *` pulls in the restricted name, and the
// member access is caught on its own by no-restricted-syntax.
import * as partyService from 'modules/DigiKhaato/features/parties/api/partyService';

export const searchProbe = (q: string): Promise<unknown> =>
  partyService.listParties({
    q,
    status: 'active',
    type: '',
    balance: '',
    collection: '',
    tag: '',
    credit: '',
    ordering: 'name',
    page: 1,
    pageSize: 8,
  });
