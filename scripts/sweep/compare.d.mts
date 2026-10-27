import type { SweepRecord } from './summary.mjs';
export interface QualityCompare {
  pairs: number;
  onlyBefore: number;
  onlyAfter: number;
  classChanged: number;
  classChanges: Record<string, number>;
  newExceptions: { hash: string; path?: string; error?: string; message?: string }[];
  metricChanged: number;
  top: { hash: string; path?: string; score: number; diff: Record<string, unknown> }[];
  summary: Record<string, [number, number]>;
}
export const METRICS: Record<string, (r: SweepRecord) => number | undefined>;
export function readRun(dir: string): SweepRecord[];
export function compareRecords(before: SweepRecord[], after: SweepRecord[], opts?: { top?: number }): { qualities: Record<string, QualityCompare>; changed: boolean };
export function formatCompare(res: { qualities: Record<string, QualityCompare>; changed: boolean }, opts?: { paths?: boolean }): string;
export function main(argv?: string[]): number;
