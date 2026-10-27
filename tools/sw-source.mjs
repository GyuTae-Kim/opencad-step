/**
 * 오프라인용 서비스 워커(sw.js)의 본문. 빌드 끝에 공용 도구(opencad-site-kit/pwa/sw-plugin)가 미리 담을 목록과 판 이름(내용 지문)을 정해
 * 이 함수로 dist/sw.js를 쓴다(설정은 tools/site.mjs의 offline).
 * - HTML(이동 요청)은 네트워크 먼저(배포가 늘 보이게, 안 되면 담아 둔 것 — 담는 것은 미리 담을 목록의 페이지만).
 * - 담아 둔 것 먼저는 미리 담을 목록과 빌드 결과(assets/)뿐이다. 그 밖(?open=으로 받는 STEP 파일 등)과 앱 범위 밖 주소는
 *   손대지 않고 네트워크로 보낸다(바뀐 파일이 옛것으로 열리거나 큰 파일이 캐시에 쌓이지 않게).
 * - 새 판은 기다리다가(skipWaiting 없음) 페이지가 "새로 고침"을 고르면(SKIP_WAITING) 바뀐다.
 * - Android 공유 받기(share_target, POST …/share-target): 파일을 최근 문서 IndexedDB(opencad-step, 판 2)에 넣고 ?recent=<id>로 연다.
 * 돌려주는 글(첫 줄 주석 포함)은 sw.js에 그대로 들어간다 — 바꾸면 판 이름도 바뀐다.
 */

export function serviceWorkerSource({ version, urls }) {
  return `/* OpenCAD STEP 뷰어 서비스 워커 — 빌드가 만든다(tools/sw-plugin.mjs). 판 ${version} */
'use strict';
const CACHE = 'opencad-step-${version}';
const PRECACHE = ${JSON.stringify(urls)};
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
`;
}
