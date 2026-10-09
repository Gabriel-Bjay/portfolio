import { describe, expect, it } from "vitest";
import { forecastSeries, HORIZON, holtRun, MIN_PERIODS } from "./forecast";

describe("holtRun (hand-computed)", () => {
  // y = [10, 12, 13, 15, 14, 18], α = β = 0.5, start level 10 / trend 2:
  //   t=1 forecast 12      error  0        level 12       trend 2
  //   t=2 forecast 14      error -1        level 13.5     trend 1.75
  //   t=3 forecast 15.25   error -0.25     level 15.125   trend 1.6875
  //   t=4 forecast 16.8125 error -2.8125   level 15.40625 trend 0.984375
  //   t=5 forecast 16.390625 error 1.609375 level 17.1953125 trend 1.38671875
  // SSE = 0 + 1 + 0.0625 + 7.91015625 + 2.590087890625 = 11.562744140625
  it("matches the worked example", () => {
    const state = holtRun([10, 12, 13, 15, 14, 18], 0.5, 0.5);
    expect(state.sse).toBeCloseTo(11.562744140625, 10);
    expect(state.level).toBeCloseTo(17.1953125, 10);
    expect(state.trend).toBeCloseTo(1.38671875, 10);
    // 1-step and 2-step forecasts: level + h·trend.
    expect(state.level + state.trend).toBeCloseTo(18.58203125, 10);
    expect(state.level + 2 * state.trend).toBeCloseTo(19.96875, 10);
  });

  it("has zero error on a perfect straight line, whatever α and β are", () => {
    for (const [a, b] of [
      [0.1, 0.9],
      [0.5, 0.5],
      [0.99, 0.01],
    ]) {
      const s = holtRun([5, 7, 9, 11, 13, 15], a, b);
      expect(s.sse).toBeCloseTo(0, 10);
      expect(s.level).toBeCloseTo(15, 10);
      expect(s.trend).toBeCloseTo(2, 10);
    }
  });
});

describe("forecastSeries", () => {
  it("extends a straight line exactly and has no band", () => {
    const r = forecastSeries([10, 12, 14, 16, 18, 20], 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.forecast.points.map((p) => p.value)).toEqual([22, 24, 26].map((v) => expect.closeTo(v, 8)));
    expect(r.forecast.sigma).toBeCloseTo(0, 8);
    for (const p of r.forecast.points) {
      expect(p.lower).toBeCloseTo(p.value, 6);
      expect(p.upper).toBeCloseTo(p.value, 6);
    }
    expect(r.forecast.points.map((p) => p.step)).toEqual([1, 2, 3]);
  });

  it("picks the grid point with the smallest SSE", () => {
    const y = [10, 12, 13, 15, 14, 18, 17, 21, 20, 24];
    const r = forecastSeries(y, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { alpha, beta } = r.forecast;
    const chosen = holtRun(y, alpha, beta).sse;
    for (const a of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
      for (const b of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
        expect(chosen).toBeLessThanOrEqual(holtRun(y, a, b).sse + 1e-9);
      }
    }
  });

  it("widens the band by √h and keeps it ordered", () => {
    const r = forecastSeries([10, 14, 11, 15, 12, 18, 13, 19], 4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { sigma, points } = r.forecast;
    expect(sigma).toBeGreaterThan(0);
    points.forEach((p, i) => {
      const halfUp = p.upper - p.value;
      expect(p.lower).toBeLessThanOrEqual(p.value);
      expect(p.upper).toBeGreaterThanOrEqual(p.value);
      if (p.lower > 0) expect(halfUp).toBeCloseTo(1.96 * sigma * Math.sqrt(i + 1), 6);
    });
  });

  it("floors forecasts and bands at zero for a falling series", () => {
    const r = forecastSeries([100, 80, 60, 40, 20, 10], 6);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const p of r.forecast.points) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.lower).toBeGreaterThanOrEqual(0);
      expect(p.upper).toBeGreaterThanOrEqual(0);
    }
    expect(r.forecast.points[5].value).toBe(0);
  });

  it("refuses to forecast fewer than six periods and says why", () => {
    const r = forecastSeries([1, 2, 3, 4, 5], 3);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("at least 6") });
    expect(MIN_PERIODS).toBe(6);
    expect(forecastSeries([], 3).ok).toBe(false);
  });

  it("projects past skipped periods but returns only the requested horizon", () => {
    const y = [10, 12, 14, 16, 18, 20];
    const r = forecastSeries(y, 2, 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.forecast.points.map((p) => p.step)).toEqual([1, 2]);
    expect(r.forecast.points[0].value).toBeCloseTo(24, 8);
  });

  it("handles flat zero data without NaN", () => {
    const r = forecastSeries([0, 0, 0, 0, 0, 0, 0], 3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const p of r.forecast.points) expect(Object.values(p).every(Number.isFinite)).toBe(true);
  });

  it("is deterministic and uses the spec horizons", () => {
    const y = [3, 5, 4, 6, 8, 7, 9, 12];
    expect(forecastSeries(y, 3)).toEqual(forecastSeries(y, 3));
    expect(HORIZON).toEqual({ day: 14, week: 6, month: 3 });
  });
});
