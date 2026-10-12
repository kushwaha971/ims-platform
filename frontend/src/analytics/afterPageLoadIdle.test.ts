import { afterPageLoadIdle } from './afterPageLoadIdle';
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
it('waits for page load and can cancel work before third-party loading', () => {
  const ready = jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
  const run = jest.fn();
  const cancel = afterPageLoadIdle(run);
  jest.advanceTimersByTime(2000);
  expect(run).not.toHaveBeenCalled();
  cancel();
  window.dispatchEvent(new Event('load'));
  jest.advanceTimersByTime(2000);
  expect(run).not.toHaveBeenCalled();
  ready.mockRestore();
});
it('runs once after load and the idle fallback', () => {
  const ready = jest.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
  const run = jest.fn();
  afterPageLoadIdle(run);
  window.dispatchEvent(new Event('load'));
  window.dispatchEvent(new Event('load'));
  jest.advanceTimersByTime(1600);
  expect(run).toHaveBeenCalledTimes(1);
  ready.mockRestore();
});
