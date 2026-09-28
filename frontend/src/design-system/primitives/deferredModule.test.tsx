import { act, render, screen } from '@testing-library/react';

import { deferredModule, useDeferredModule, type DeferredModule } from './deferredModule';

/**
 * W4-P — the comboboxes' search lists are fetched after first paint through
 * this. What each test prevents is a combobox that opens onto nothing.
 */
interface Panel {
  readonly label: string;
}

const controllable = (): {
  readonly module: DeferredModule<Panel>;
  readonly loader: jest.Mock;
  readonly land: () => void;
  readonly fail: () => void;
} => {
  let resolve: (value: Panel) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const loader = jest.fn(
    () =>
      new Promise<Panel>((ok, no) => {
        resolve = ok;
        reject = no;
      })
  );
  return {
    module: deferredModule(loader),
    loader,
    land: () => resolve({ label: 'the panel' }),
    fail: () => reject(new Error('chunk failed')),
  };
};

function Probe({
  module,
  open,
}: Readonly<{ module: DeferredModule<Panel>; open: boolean }>): React.JSX.Element {
  const panel = useDeferredModule(module, open);
  return <output>{panel ? panel.label : 'fallback'}</output>;
}

describe('deferredModule', () => {
  it('fetches once, however many components mount it', () => {
    const { module, loader } = controllable();
    render(
      <>
        <Probe module={module} open={false} />
        <Probe module={module} open={false} />
      </>
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('is there synchronously on open once the fetch after mount has landed', async () => {
    /* The common case, and the one the design depends on: the panel must be
       in the FIRST render of an open popover, or Radix focuses the fallback. */
    const { module, land } = controllable();
    const view = render(<Probe module={module} open={false} />);
    await act(async () => land());
    view.rerender(<Probe module={module} open />);
    expect(screen.getByRole('status')).toHaveTextContent('the panel');
  });

  it('swaps the panel in when an open beat the chunk', async () => {
    const { module, land } = controllable();
    render(<Probe module={module} open />);
    expect(screen.getByRole('status')).toHaveTextContent('fallback');
    await act(async () => land());
    expect(screen.getByRole('status')).toHaveTextContent('the panel');
  });

  it('retries a chunk that failed instead of remembering the failure', async () => {
    const { module, loader, fail } = controllable();
    await act(async () => {
      const first = module.load();
      fail();
      await first.catch(() => undefined);
    });
    void module.load();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
