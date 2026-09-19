/**
 * @jest-environment node
 */
import {
  areaPath,
  barLength,
  formatAxisAmount,
  formatChartDate,
  formatChartDateShort,
  horizontalBarPath,
  linePath,
  nearestPointIndex,
  niceAxisMax,
  seriesPoints,
  toPlotValue,
} from './chartScale';

describe('chartScale — the geometry the charts are drawn from', () => {
  it('rounds an axis maximum to a number a reader can hold', () => {
    expect(niceAxisMax(47318)).toBe(50000);
    expect(niceAxisMax(112000)).toBe(200000);
    expect(niceAxisMax(0)).toBe(1);
    expect(niceAxisMax(-5)).toBe(1);
  });

  it('clamps a bar into its plot rather than letting it overrun', () => {
    expect(barLength(50, 100, 200)).toBe(100);
    expect(barLength(500, 100, 200)).toBe(200);
    expect(barLength(-5, 100, 200)).toBe(0);
    expect(barLength(50, 0, 200)).toBe(0);
  });

  it('parses a decimal money string without throwing on rubbish', () => {
    expect(toPlotValue('1234.50')).toBe(1234.5);
    expect(toPlotValue('')).toBe(0);
    expect(toPlotValue('not a number')).toBe(0);
  });

  it('writes dates the way India reads them', () => {
    expect(formatChartDate('2026-09-19')).toBe('19/09/2026');
    expect(formatChartDateShort('2026-09-19')).toBe('19/09');
    expect(formatChartDate('rubbish')).toBe('rubbish');
  });

  it('groups axis ticks 2,2,3 — not 3,3,3', () => {
    expect(formatAxisAmount(123456)).toBe('1,23,456');
  });

  it('rounds the DATA end of a bar and leaves the baseline end square', () => {
    const d = horizontalBarPath({ x: 0, y: 2, width: 100, height: 12, radius: 4 });
    // Two quadratic corners, both at the right-hand (data) end.
    expect(d.match(/Q/g)).toHaveLength(2);
    // The baseline end is two straight corners at x = 0.
    expect(d.startsWith('M 0 2')).toBe(true);
    expect(d.endsWith('L 0 14 Z')).toBe(true);
  });

  it('never emits a corner wider than the bar it is rounding', () => {
    const d = horizontalBarPath({ x: 0, y: 0, width: 2, height: 12, radius: 4 });
    expect(d).not.toContain('NaN');
    expect(d).toContain('Q');
  });

  it('returns nothing for a zero-length bar, so no empty path is painted', () => {
    expect(horizontalBarPath({ x: 0, y: 0, width: 0, height: 12 })).toBe('');
  });

  it('closes an area down to the baseline and leaves the line open', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 10, y: 5 },
    ];
    expect(linePath(points)).toBe('M 0 10 L 10 5');
    expect(areaPath(points, 20)).toBe('M 0 10 L 10 5 L 10 20 L 0 20 Z');
    expect(linePath([])).toBe('');
    expect(areaPath([], 20)).toBe('');
  });

  it('spreads a series across the plot and inverts the y axis', () => {
    const plot = { left: 10, top: 0, width: 100, height: 50 };
    const points = seriesPoints([0, 50, 100], 100, plot);
    expect(points).toEqual([
      { x: 10, y: 50 },
      { x: 60, y: 25 },
      { x: 110, y: 0 },
    ]);
  });

  it('centres a one-point series instead of dividing by zero', () => {
    const points = seriesPoints([10], 10, { left: 0, top: 0, width: 100, height: 50 });
    expect(points).toEqual([{ x: 50, y: 0 }]);
  });

  it('snaps the crosshair to the nearest X, so the reader aims at a date', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(nearestPointIndex(48, points)).toBe(1);
    expect(nearestPointIndex(-20, points)).toBe(0);
    expect(nearestPointIndex(9999, points)).toBe(2);
    expect(nearestPointIndex(5, [])).toBe(-1);
  });
});
