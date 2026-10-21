export function precacheable(path: string): boolean;
export function listFiles(root: string): string[];
export function precacheUrls(files: string[]): string[];
export function serviceWorkerSource(o: { version: string; urls: string[] }): string;
export function serviceWorker(): import('vite').Plugin;
