import { siteLocalization } from './tools/localization-plugin.mjs';
import { defineConfig } from 'vitest/config';
import { siteMetadata } from './tools/site-plugin.mjs';

/**
 * 앱(index.html → src/app/main.ts, 해석 워커 src/worker/parse.worker.ts) 빌드와 vitest 설정.
 * GitHub Pages 프로젝트 사이트(https://gyutae-kim.github.io/opencad-step/)에서 돌도록 상대 경로로 낸다.
 */
export default defineConfig({
  base: './',
  plugins: [siteLocalization(), siteMetadata()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 4402,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
