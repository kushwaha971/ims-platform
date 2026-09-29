import { render, screen } from '@testing-library/react';

import { UbDeviceFrame } from './UbDeviceFrame';

/**
 * The frame is chrome around a recording; it must add nothing a screen reader
 * reads (the address pill is decoration) and must not change what it holds.
 */
describe('UbDeviceFrame', () => {
  it('draws a browser window whose address pill is decorative', () => {
    const { container } = render(
      <UbDeviceFrame variant="browser" url="yourkhata.com">
        <span>screen</span>
      </UbDeviceFrame>
    );

    expect(container.querySelector('[data-device="browser"]')).toBeInTheDocument();
    expect(screen.getByText('yourkhata.com').closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('screen')).toBeInTheDocument();
  });

  it('draws a phone whose speaker sits in the bezel, not over the screen', () => {
    const { container } = render(
      <UbDeviceFrame variant="phone" tilt>
        <span>screen</span>
      </UbDeviceFrame>
    );

    expect(container.querySelector('[data-device="phone"]')).toBeInTheDocument();
    const screenBox = screen.getByText('screen').parentElement as HTMLElement;
    expect(screenBox.querySelector('[aria-hidden="true"]')).toBeNull();
  });
});
