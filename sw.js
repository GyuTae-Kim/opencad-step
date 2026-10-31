/* OpenCAD STEP 뷰어 서비스 워커 — 빌드가 만든다(tools/sw-plugin.mjs). 판 b4cccb7625c2 */
'use strict';
const CACHE = 'opencad-step-b4cccb7625c2';
const PRECACHE = ["apple-touch-icon.png","assets/check.worker-DZ0o49ar.js","assets/de-DsP22ycZ.js","assets/en-2IdYgXpc.js","assets/explodebar-Bt2zOc_H.js","assets/export-CDOm2C6s.js","assets/facesurf-KKIPVnom.js","assets/index-CoVyUv1z.css","assets/index-DMvpnSYS.js","assets/ja-DXLK8KBd.js","assets/parse.worker-BYyYmkhi.js","assets/sample-D7bAbMBe.js","assets/selink-CIgmrsvi.js","assets/tangent-DsdUnTwT.js","assets/viewerkit-C4GB2FVS.js","assets/zh-CN-CH5vnSYs.js","de/","de/manifest.webmanifest","en/","en/manifest.webmanifest","favicon.svg","icon-192.png","icon-512.png","icon-maskable-512.png","./","ja/","ja/manifest.webmanifest","manifest.webmanifest","zh-CN/","zh-CN/manifest.webmanifest"];
const SCOPE = self.registration.scope;
/** 담아 둔 것 먼저 쓸 경로(미리 담을 목록) */
const PRECACHE_PATHS = new Set(PRECACHE.map((u) => new URL(u, SCOPE).pathname));
const RECENT_DB = 'opencad-step';
const RECENT_MAX_SIZE = 60 * 1024 * 1024;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(new URL(u, self.registration.scope), { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('opencad-step-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** 최근 문서 저장소(판 2: 목록 recent keyPath id, 바이트 recent-data)에 파일 넣기 — 앱 recent.ts와 같은 꼴 */
function putRecent(file) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECENT_DB, 2);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (ev.oldVersion < 2 && db.objectStoreNames.contains('recent')) db.deleteObjectStore('recent');
      if (!db.objectStoreNames.contains('recent')) db.createObjectStore('recent', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recent-data')) db.createObjectStore('recent-data');
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB'));
    req.onsuccess = () => {
      const db = req.result;
      const id = file.name + ':' + file.size;
      const t = db.transaction(['recent', 'recent-data'], 'readwrite');
      t.objectStore('recent-data').put(file, id);
      t.objectStore('recent').put({ id, name: file.name, size: file.size, time: Date.now() });
      t.oncomplete = () => {
        db.close();
        resolve(id);
      };
      t.onerror = t.onabort = () => {
        db.close();
        reject(t.error || new Error('IndexedDB'));
      };
    };
  });
}

/** 공유 받기: 파일을 최근 문서에 넣고 그 페이지에서 연다(실패하면 까닭을 붙여 페이지로) */
async function shareTarget(request) {
  const page = new URL('./', request.url);
  try {
    const form = await request.formData();
    const file = form.getAll('file').find((f) => f && typeof f === 'object' && 'size' in f);
    if (!file) page.searchParams.set('share-error', 'no-file');
    else if (file.size > RECENT_MAX_SIZE) page.searchParams.set('share-error', 'too-big');
    else page.searchParams.set('recent', await putRecent(file));
  } catch (e) {
    page.searchParams.set('share-error', 'store');
  }
  return Response.redirect(page.href, 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 앱 범위 밖(같은 출처의 다른 앱·파일)은 손대지 않는다
  if (!url.href.startsWith(SCOPE)) return;
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(shareTarget(req));
    return;
  }
  if (req.method !== 'GET') return;
  // HTML: 네트워크 먼저(새 배포가 바로 보이게), 안 되면 담아 둔 것
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && PRECACHE_PATHS.has(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(new Request(url.origin + url.pathname), copy));
          }
          return res;
        })
        .catch(() => caches.match(new Request(url.origin + url.pathname)).then((hit) => hit || caches.match(new URL('./', self.registration.scope).href)).then((hit) => hit || Response.error())),
    );
    return;
  }
  // 미리 담을 목록(아이콘·앱 정보 등)과 내용 지문 이름의 빌드 결과(assets/)만: 담아 둔 것 먼저, 없으면 받아서 담는다.
  // 그 밖(?open=으로 받는 STEP 파일 등)은 손대지 않는다 — 네트워크 그대로, 담지 않는다
  const rel = url.pathname.slice(new URL(SCOPE).pathname.length);
  if (!PRECACHE_PATHS.has(url.pathname) && !rel.startsWith('assets/')) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: url.pathname.endsWith('.webmanifest') }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
