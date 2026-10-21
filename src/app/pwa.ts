/**
 * 홈 화면 앱(PWA) 연결: 오프라인 서비스 워커 등록과 새 판 알림, 데스크톱 파일 열기(file_handlers → launchQueue).
 * - 서비스 워커(빌드가 만든 sw.js — tools/sw-plugin.mjs)는 앱 뿌리에 있다. 언어 페이지는 <base href="../">라 document.baseURI가 뿌리다.
 * - 새 판이 설치돼 기다리면 onUpdate(적용 함수)를 부른다. 적용하면 새 워커가 넘겨받은 뒤 한 번 다시 읽는다
 *   (처음 설치 때의 넘겨받기는 다시 읽지 않는다).
 * - 개발 서버(import.meta.env.DEV)와 서비스 워커가 없는 브라우저는 아무것도 하지 않는다.
 */

/** 서비스 워커 등록(오프라인)과 새 판 알림 */
export function registerServiceWorker(onUpdate: (apply: () => void) => void): void {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let applied = false;
  sw.addEventListener('controllerchange', () => {
    if (!applied) return;
    applied = false;
    location.reload();
  });
  const url = new URL('sw.js', document.baseURI);
  sw.register(url, { scope: new URL('./', url).href })
    .then((reg) => {
      const prompt = (w: ServiceWorker) =>
        onUpdate(() => {
          applied = true;
          w.postMessage({ type: 'SKIP_WAITING' });
        });
      if (reg.waiting && sw.controller) prompt(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && sw.controller) prompt(w);
        });
      });
      // 앱으로 돌아올 때 새 판이 있는지 본다(홈 화면 앱은 오래 열려 있다)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {
      /* 등록 실패(비공개 창·파일 주소 등): 오프라인 없이 그대로 쓴다 */
    });
}

interface LaunchParams {
  files?: readonly { getFile(): Promise<File> }[];
}

/** 데스크톱 홈 화면 앱으로 파일을 열면(파일 탐색기 "연결 프로그램") 그 파일을 넘긴다 */
export function consumeLaunchQueue(open: (file: File) => void): void {
  const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }).launchQueue;
  if (!lq || typeof lq.setConsumer !== 'function') return;
  lq.setConsumer((params) => {
    const h = params.files?.[0];
    if (h) void h.getFile().then(open, () => {});
  });
}
