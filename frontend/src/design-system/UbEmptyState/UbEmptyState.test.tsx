import { render, screen } from '@testing-library/react';

import { UbEmptyState } from './UbEmptyState';

/**
 * QA (Sprint 3, B5 regression): the party list's error state printed the
 * request id as a bare UUID under "Try again", with no "Reference" label —
 * although the locales carry one (`common.error.reference`). A bare 36-char hex
 * string means nothing to a merchant; "Reference 5f3a…" tells them it is the
 * thing to quote to support. The label is passed in translated (a `Ub*` never
 * reaches for i18n), and the type makes it required whenever an id is.
 */
describe('UbEmptyState — no request id on screen (owner, 7 Oct 2026)', () => {
  it('prints no reference even when it is given one', () => {
    render(
      <UbEmptyState
        variant="error"
        title="We could not load your customers"
        requestId="3f2b9c1e-7d4a-4e21-9f0b-5a6c7d8e9f01"
        requestIdLabel="Reference"
      />
    );

    // Owner, 7 Oct 2026: "in any error, I do not want the reference" — the title
    // says what happened, and a 36-character id under it is noise to a merchant.
    expect(screen.queryByTestId('request-id')).not.toBeInTheDocument();
    expect(screen.queryByText(/3f2b9c1e/)).not.toBeInTheDocument();
  });

  it('prints nothing when there is no id', () => {
    render(
      <UbEmptyState variant="error" title="Nope" requestId={null} requestIdLabel="Reference" />
    );
    expect(screen.queryByTestId('request-id')).not.toBeInTheDocument();
  });
});
