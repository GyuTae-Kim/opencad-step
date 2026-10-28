/** records.jsonl 한 줄(워커 기록 + 해시·경로·크기·사본 수·확장자) */
export interface SweepRecord {
  hash: string;
  path?: string;
  size?: number;
  copies?: number;
  ext?: string;
  quality: string;
  class: string;
  container?: string;
  schemas?: string[];
  ap?: string;
  ms?: number;
  /** 연 뒤 질량 속성 적분 시간(ms) */
  propsMs?: number;
  triangles?: number;
  faces?: number;
  failedFaces?: number;
  warnings?: string[];
  failReasons?: Record<string, number>;
  q?: Record<string, number>;
  error?: string;
  message?: string;
  [key: string]: unknown;
}
export interface QualitySummary {
  files: number;
  classes: Record<string, number>;
  versions: Record<string, number>;
  containers: Record<string, number>;
  extensions: Record<string, number>;
  errors: Record<string, number>;
  warnings: Record<string, number>;
  failReasons: Record<string, number>;
  time: { totalMs: number; p50: number; p90: number; p99: number; max: number };
  /** 연 뒤 질량 속성 적분 시간(기록에 propsMs가 있을 때만) */
  propsTime?: { files: number; totalMs: number; p50: number; p90: number; p99: number; max: number };
  quality: Record<string, number>;
  slowest: { hash: string; ms: number; propsMs?: number; size: number | null; triangles: number | null; class: string }[];
}
export const CLASSES: string[];
export const EXCEPTION_CLASSES: Set<string>;
export const FOLDED_FILE_RATIO: number;
export function percentile(sorted: number[], p: number): number;
export function summarizeQuality(records: SweepRecord[]): QualitySummary;
export function summarize(records: SweepRecord[], info?: Record<string, unknown>): { qualities: string[]; byQuality: Record<string, QualitySummary>; done: true; [key: string]: unknown };
export function formatSummary(summary: { qualities?: string[]; byQuality: Record<string, QualitySummary> }): string;
