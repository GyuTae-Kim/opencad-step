import { siteLocalization } from 'opencad-site-kit/i18n/localization-plugin';
import { siteMetadata } from 'opencad-site-kit/seo/site-plugin';
import { serviceWorker } from 'opencad-site-kit/pwa/sw-plugin';
import { defineConfig } from 'vitest/config';
import { offline, site } from './tools/site.mjs';

/**
 * 앱(index.html → src/app/main.ts, 해석 워커 src/worker/parse.worker.ts) 빌드와 vitest 설정.
 * GitHub Pages 프로젝트 사이트(https://gyutae-kim.github.io/opencad-step/)에서 돌도록 상대 경로로 낸다.
 * 언어 페이지·검색 정보·언어별 앱 정보와 빌드 끝의 오프라인 서비스 워커(dist/sw.js)는 공용 도구(opencad-site-kit)가 tools/site.mjs 설정으로 만든다.
 */
export default defineConfig({
  base: './',
  plugins: [siteLocalization(site), siteMetadata(site), serviceWorker(offline)],
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
