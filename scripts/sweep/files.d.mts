export const STEP_EXTENSIONS: string[];
export function nameKind(name: string): 'step' | 'packed' | 'gz' | 'zip' | null;
export function extensionOf(name: string): string;
export function gzipHasStepName(path: string): Promise<boolean>;
export function zipHasStepEntry(path: string): Promise<boolean>;
export function walkDirs(dirs: string[]): Promise<string[]>;
export function keepOpenable(paths: string[]): Promise<string[]>;
export function hashFile(path: string): Promise<string>;
export interface SweepFile {
  hash: string;
  path: string;
  size: number;
  copies: number;
}
export function dedupe(paths: string[]): Promise<{ files: SweepFile[]; unreadable: number }>;
