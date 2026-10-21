import { describe, expect, it } from 'vitest';
import { precacheable, precacheUrls, serviceWorkerSource } from '../tools/sw-plugin.mjs';

/** 서비스 워커 원본을 가짜 self·caches·fetch·indexedDB로 돌린다 */
function runSw(network: (url: string) => Response | Promise<Response>) {
  const listeners = new Map<string, (e: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: unknown) => (typeof r === 'string' ? r : (r as { url: string }).url);
  const cacheOf = (name: string) => {
    let m = stores.get(name);
    if (!m) stores.set(name, (m = new Map()));
    return {
      put: async (r: unknown, res: Response) => void m!.set(key(r), res),
      match: async (r: unknown) => m!.get(key(r))?.clone(),
      addAll: async (rs: unknown[]) => {
        for (const r of rs) m!.set(key(r), new Response(`cached ${key(r)}`));
      },
    };
  };
  const caches = {
    open: async (n: string) => cacheOf(n),
    match: async (r: unknown) => {
      for (const m of stores.values()) {
        const hit = m.get(key(r));
        if (hit) return hit.clone();
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
  };
  // 아주 작은 IndexedDB: open → 판 올리기 → put
  const db: Record<string, Map<unknown, unknown>> = {};
  const indexedDB = {
    open() {
      const req: Record<string, unknown> & { result?: unknown } = {};
      setTimeout(() => {
        const names = new Set(Object.keys(db));
        const dbo = {
          objectStoreNames: { contains: (n: string) => names.has(n) },
          createObjectStore: (n: string) => {
            names.add(n);
            db[n] = new Map();
          },
          deleteObjectStore: (n: string) => delete db[n],
          transaction() {
            const t: Record<string, unknown> = {
              objectStore: (n: string) => ({ put: (v: unknown, k?: unknown) => db[n]!.set(k ?? (v as { id: string }).id, v) }),
            };
            setTimeout(() => (t.oncomplete as () => void)?.(), 0);
            return t;
          },
          close() {},
        };
        req.result = dbo;
        (req.onupgradeneeded as (e: unknown) => void)?.({ oldVersion: 0 });
        (req.onsuccess as () => void)?.();
      }, 0);
      return req;
    },
  };
  const self = {
    location: { origin: 'https://x.test' },
    registration: { scope: 'https://x.test/app/' },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener: (t: string, f: (e: unknown) => void) => listeners.set(t, f),
  };
  const fetch = async (r: unknown) => network(key(r));
  new Function('self', 'caches', 'fetch', 'indexedDB', serviceWorkerSource({ version: 'v1', urls: ['./', 'assets/a.js'] }))(self, caches, fetch, indexedDB);
  const fire = async (request: Record<string, unknown>) => {
    let p: Promise<Response> | undefined;
    listeners.get('fetch')!({ request, respondWith: (x: Promise<Response>) => (p = x) });
    return p ? await p : undefined;
  };
  return { listeners, stores, db, fire, caches };
}

const req = (url: string, extra: Record<string, unknown> = {}) => ({ url, method: 'GET', mode: 'no-cors', headers: new Headers(), ...extra });

describe('오프라인 서비스 워커(sw.js)', () => {
  it('미리 담을 목록: 소스 맵·공유 그림·사이트맵 빼고, index.html은 디렉터리 주소', () => {
    expect(precacheable('assets/a.js.map')).toBe(false);
    expect(precacheable('og-opencad.jpg')).toBe(false);
    expect(precacheable('assets/a.js')).toBe(true);
    expect(precacheUrls(['index.html', 'en/index.html', 'en/manifest.webmanifest', 'sitemap.xml'])).toEqual(['./', 'en/', 'en/manifest.webmanifest']);
  });

  it('HTML은 네트워크 먼저(되면 담고, 안 되면 담아 둔 것), 빌드 결과는 담아 둔 것 먼저', async () => {
    let online = true;
    const sw = runSw((url) => (online ? new Response(`net ${url}`, { headers: { 'content-type': 'text/html' } }) : Promise.reject(new Error('offline'))));
    const nav = req('https://x.test/app/?sample', { mode: 'navigate' });
    expect(await (await sw.fire(nav))!.text()).toBe('net https://x.test/app/?sample');
    await new Promise((r) => setTimeout(r, 5));
    online = false;
    expect(await (await sw.fire(nav))!.text()).toBe('net https://x.test/app/?sample');
    // 담아 둔 빌드 결과
    sw.stores.set('opencad-step-v1', new Map([['https://x.test/app/assets/a.js', new Response('cached js')]]));
    expect(await (await sw.fire(req('https://x.test/app/assets/a.js')))!.text()).toBe('cached js');
    // 다른 출처는 손대지 않는다
    expect(await sw.fire(req('https://other.test/x.js'))).toBeUndefined();
  });

  it('공유 받기: 파일을 최근 문서 저장소에 넣고 ?recent=<id>로 보낸다, 60MB 넘으면 까닭을 붙인다', async () => {
    const sw = runSw(() => new Response(''));
    const form = new FormData();
    form.append('file', new File(['ISO-10303-21;'], 'part.stp'));
    const res = (await sw.fire(req('https://x.test/app/en/share-target', { method: 'POST', formData: async () => form })))!;
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://x.test/app/en/?recent=part.stp%3A13');
    expect((sw.db['recent'] as Map<string, { name: string }>).get('part.stp:13')!.name).toBe('part.stp');
    expect(sw.db['recent-data']!.get('part.stp:13')).toBeInstanceOf(File);
    const big = { size: 61 * 1024 * 1024, name: 'big.stp' };
    const res2 = (await sw.fire(req('https://x.test/app/share-target', { method: 'POST', formData: async () => ({ getAll: () => [big] }) })))!;
    expect(res2.headers.get('location')).toBe('https://x.test/app/?share-error=too-big');
  });
});
