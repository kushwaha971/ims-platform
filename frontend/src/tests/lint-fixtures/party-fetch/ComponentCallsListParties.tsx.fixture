// @lint-at: components/PartyPickerProbe.tsx
// @expect: no-restricted-imports
'use client';

import { useEffect, useState } from 'react';

import { UbText } from 'src/design-system';

import { listParties } from 'modules/DigiKhaato/features/parties/api/partyService';

/** A feature component growing its own party search — the defect the fence exists for. */
export function PartyPickerProbe({ q }: { readonly q: string }): React.JSX.Element {
  const [count, setCount] = useState(0);
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
      }).then((page) => setCount(page.rows.length));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [q]);
  return <UbText>{count}</UbText>;
}
