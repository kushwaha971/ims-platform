// @lint-at: hooks/usePartyPickerProbe.ts
// @expect: no-restricted-imports
// A HOOK, and a relative import: `import/no-restricted-paths` only fences
// components, so this is the case only the party-fetch rule can catch.
import { useEffect, useState } from 'react';

import { listParties } from '../../parties/api/partyService';

import type { Party } from '../../parties/types/party.types';

export function usePartyPickerProbe(q: string): readonly Party[] {
  const [rows, setRows] = useState<readonly Party[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void listParties({
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
      }).then((page) => setRows(page.rows));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [q]);
  return rows;
}
