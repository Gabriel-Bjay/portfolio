// Holt's linear exponential smoothing with a grid-searched α/β and a ±1.96σ·√h prediction band.
import type { Granularity } from "./types";

export const MIN_PERIODS = 6;

export const HORIZON: Record<Granularity, number> = { day: 14, week: 6, month: 3 };

const GRID = [0.01, ...Array.from({ length: 19 }, (_, i) => Math.round((i + 1) * 5) / 100), 0.99];
const Z_95 = 1.96;

export interface HoltState {
  /** Sum of squared one-step-ahead errors. */
  sse: number;
  /** Smoothed level after the last observation. */
  level: number;
  /** Smoothed trend (change per period) after the last observation. */
  trend: number;
}

/**
 * Runs Holt's method over `y` (length ≥ 2). Starts from level = y[0], trend = y[1] − y[0];
 * for t ≥ 1 the forecast is level + trend, the error is y[t] − forecast, and
 *   level' = α·y[t] + (1−α)(level + trend),   trend' = β(level' − level) + (1−β)·trend.
 */
export function holtRun(y: readonly number[], alpha: number, beta: number): HoltState {
  let level = y[0];
  let trend = y[1] - y[0];
  let sse = 0;
  for (let t = 1; t < y.length; t++) {
    const predicted = level + trend;
    const error = y[t] - predicted;
    sse += error * error;
    const nextLevel = alpha * y[t] + (1 - alpha) * predicted;
    trend = beta * (nextLevel - level) + (1 - beta) * trend;
    level = nextLevel;
  }
  return { sse, level, trend };
}

export interface ForecastPoint {
  /** 1 = the first period after the data ends. */
  step: number;
  value: number;
  lower: number;
  upper: number;
}

export interface Forecast {
  alpha: number;
  beta: number;
  /** Standard deviation of the one-step-ahead errors (degrees of freedom adjusted). */
  sigma: number;
  points: ForecastPoint[];
}

export type ForecastResult = { ok: true; forecast: Forecast } | { ok: false; reason: string };

/**
 * Fits α, β on a grid (smallest SSE wins; ties keep the earliest grid point) and projects `horizon`
 * periods. `skip` periods are projected but not returned: use it when the latest observed period
 * was cut short and excluded from `y`, so the forecast starts after it.
 */
export function forecastSeries(y: readonly number[], horizon: number, skip = 0): ForecastResult {
  if (y.length < MIN_PERIODS) {
    return {
      ok: false,
      reason: `A forecast needs at least ${MIN_PERIODS} complete periods of data; this view has ${y.length}.`,
    };
  }
  let best = { alpha: GRID[0], beta: GRID[0], state: holtRun(y, GRID[0], GRID[0]) };
  for (const alpha of GRID) {
    for (const beta of GRID) {
      const state = holtRun(y, alpha, beta);
      if (state.sse < best.state.sse - 1e-9) best = { alpha, beta, state };
    }
  }
  const residuals = y.length - 1;
  const sigma = Math.sqrt(best.state.sse / Math.max(1, residuals - 2));
  const points: ForecastPoint[] = [];
  for (let h = skip + 1; h <= skip + horizon; h++) {
    const centre = best.state.level + h * best.state.trend;
    const half = Z_95 * sigma * Math.sqrt(h);
    points.push({
      step: h - skip,
      value: Math.max(0, centre),
      lower: Math.max(0, centre - half),
      upper: Math.max(0, centre + half),
    });
  }
  return { ok: true, forecast: { alpha: best.alpha, beta: best.beta, sigma, points } };
}
