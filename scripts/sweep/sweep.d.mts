export const USAGE: string;
export interface SweepArgs {
  dirs: string[];
  list: string | null;
  out: string | null;
  qualities: string[];
  jobs: number | null;
  limit: number | null;
  timeout: number;
  resume: boolean;
  force: boolean;
  keep: boolean;
  help: boolean;
}
export function parseArgs(argv: string[], env?: Record<string, string | undefined>): SweepArgs;
export function main(argv?: string[]): Promise<number>;
