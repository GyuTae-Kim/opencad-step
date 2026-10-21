/**
 * 최근 문서: 파일 고르기·끌어다 놓기로 잘 연 STEP 파일을 이 브라우저의 IndexedDB(opencad-step)에만 둔다.
 * 서버로 보내지 않는다. 휴대폰 브라우저는 뒤로 간 탭(특히 WebGL 페이지)을 버렸다가 돌아오면 다시 불러오므로,
 * 시작 화면에서 파일 앱을 다시 거치지 않고 바로 연다.
 *
 * - 새것부터 8개, 60MB보다 큰 파일은 두지 않는다. 같은 이름·크기면 하나로 친다(다시 열면 맨 앞으로).
 * - 목록(이름·크기·시각, recent 저장소)과 파일 바이트(recent-data 저장소)를 따로 둔다 — 목록을 그리거나 개수를 줄일 때
 *   파일 바이트(최대 8 × 60MB)를 읽지 않고, 다시 열 때만 그 파일 하나를 읽는다. 바이트는 Blob 그대로 넣는다.
 * - IndexedDB를 못 쓰는 환경(비공개 창 등)에서는 조용히 아무것도 하지 않는다.
 * - 다시 열 때 "없음"(지워진 파일)과 "못 읽음"(잠깐의 저장소 오류 — iOS가 뒤에서 연결을 끊는 등)을 가린다:
 *   없으면 목록에서 지우고, 못 읽으면 항목을 남겨 다시 누를 수 있게 한다.
 * - 저장소는 RecentBackend로 바꿔 끼울 수 있다(시험은 메모리 저장소로 순서·개수·크기 한계를 본다).
 */

/** 목록에 보일 한 줄(파일 바이트 없음) */
export interface RecentEntry {
  /** `이름:크기` */
  id: string;
  name: string;
  /** 바이트 수 */
  size: number;
  /** 마지막으로 연 때(ms) */
  time: number;
}

/** 저장소(IndexedDB 또는 시험용 메모리): 목록과 파일 바이트를 따로 둔다. 오류는 던진다 */
export interface RecentBackend {
  /** 목록만(파일 바이트는 읽지 않는다) */
  entries(): Promise<RecentEntry[]>;
  /** 목록 항목과 파일 바이트를 함께 넣는다(같은 id는 바꾼다) */
  put(entry: RecentEntry, data: Blob): Promise<void>;
  /** 목록 항목만 바꾼다(시각 새로) */
  touch(entry: RecentEntry): Promise<void>;
  /** 파일 바이트(없으면 null) */
  data(id: string): Promise<Blob | null>;
  remove(ids: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}

/** 다시 열기 결과: 파일, 없음(목록에서 지울 것), 못 읽음(잠깐의 오류 — 항목은 남긴다) */
export type RecentRead = { kind: 'ok'; file: File } | { kind: 'missing' } | { kind: 'error' };

export const RECENT_DB = 'opencad-step';
/** 목록(이름·크기·시각) */
export const RECENT_STORE = 'recent';
/** 파일 바이트(목록과 같은 id) */
export const RECENT_DATA_STORE = 'recent-data';
/** 남기는 개수 */
export const RECENT_MAX = 8;
/** 이보다 큰 파일은 남기지 않는다(바이트) */
export const RECENT_MAX_SIZE = 60 * 1024 * 1024;

/** 같은 파일로 칠 열쇠 */
export function recentId(name: string, size: number): string {
  return `${name}:${size}`;
}

/** 남길 만한 크기인지(빈 파일·60MB 넘는 파일은 빼고) */
export function canRemember(size: number): boolean {
  return Number.isFinite(size) && size > 0 && size <= RECENT_MAX_SIZE;
}

/** 새것부터(마지막으로 연 때가 늦은 것부터) */
export function newestFirst<T extends { time: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.time - a.time);
}

/** 개수 한계를 넘어 지울 것들(오래된 것부터 넘친 만큼) */
export function overflowIds(list: readonly RecentEntry[], max = RECENT_MAX): string[] {
  return newestFirst(list)
    .slice(Math.max(0, max))
    .map((e) => e.id);
}

/** 목록에 보일 때: 오늘이면 시각만, 올해면 월·일·시각, 그 전이면 연·월·일 */
export function recentTimeLabel(time: number, now: number, locale = 'ko'): string {
  const t = new Date(time);
  const n = new Date(now);
  const sameDay = t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate();
  const opts: Intl.DateTimeFormatOptions = sameDay
    ? { hour: 'numeric', minute: '2-digit' }
    : t.getFullYear() === n.getFullYear()
      ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, opts).format(t);
  } catch {
    return new Intl.DateTimeFormat('ko', opts).format(t);
  }
}

/** 모양이 맞는 항목만, 바이트 같은 덧붙은 값 없이 */
function cleanEntries(list: readonly RecentEntry[]): RecentEntry[] {
  return list
    .filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string' && Number.isFinite(e.size) && Number.isFinite(e.time))
    .map(({ id, name, size, time }) => ({ id, name, size, time }));
}

export class RecentStore {
  constructor(
    private readonly backend: RecentBackend | null = indexedDbBackend(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** 새것부터 최대 8개. 못 읽으면 빈 목록(파일 바이트는 읽지 않는다) */
  async list(): Promise<RecentEntry[]> {
    if (!this.backend) return [];
    try {
      return newestFirst(cleanEntries(await this.backend.entries())).slice(0, RECENT_MAX);
    } catch {
      return [];
    }
  }

  /** 잘 연 파일 남기기. 남겼으면 true(크기 한계·저장 실패는 false) */
  async add(name: string, data: Blob): Promise<boolean> {
    if (!this.backend || !canRemember(data.size)) return false;
    try {
      await this.backend.put({ id: recentId(name, data.size), name, size: data.size, time: this.now() }, data);
      const extra = overflowIds(cleanEntries(await this.backend.entries()));
      if (extra.length) await this.backend.remove(extra);
      return true;
    } catch {
      return false;
    }
  }

  /** 남긴 파일 읽기(그 파일 하나만). 없음과 못 읽음을 가린다 */
  async read(id: string): Promise<RecentRead> {
    if (!this.backend) return { kind: 'error' };
    try {
      const entry = cleanEntries(await this.backend.entries()).find((e) => e.id === id);
      const data = entry ? await this.backend.data(id) : null;
      if (!entry || !data) return { kind: 'missing' };
      return { kind: 'ok', file: new File([data], entry.name, { type: data.type, lastModified: entry.time }) };
    } catch {
      return { kind: 'error' };
    }
  }

  /** 다시 열었으면 맨 앞으로(목록 항목만 바꾼다) */
  async touch(id: string): Promise<void> {
    if (!this.backend) return;
    try {
      const entry = cleanEntries(await this.backend.entries()).find((e) => e.id === id);
      if (entry) await this.backend.touch({ ...entry, time: this.now() });
    } catch {
      /* 순서만 못 바꾼다 */
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.backend?.remove([id]);
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
  }

  async clear(): Promise<void> {
    try {
      await this.backend?.clear();
    } catch {
      /* 저장소를 못 쓰는 환경 */
    }
  }
}

/**
 * 이 브라우저의 IndexedDB 저장소(없으면 null). 연결은 일마다 열고 닫는다(휴대폰이 뒤에서 끊은 연결을 다시 쓰지 않게).
 * 판 2: 목록(recent, keyPath id)과 바이트(recent-data, 바깥 열쇠 id). 판 1(목록에 바이트를 함께 넣던 꼴)은 비우고 새로 만든다.
 */
export function indexedDbBackend(): RecentBackend | null {
  let idb: IDBFactory;
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB) return null;
    idb = indexedDB;
  } catch {
    return null;
  }
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(RECENT_DB, 2);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        if (ev.oldVersion < 2 && db.objectStoreNames.contains(RECENT_STORE)) db.deleteObjectStore(RECENT_STORE);
        if (!db.objectStoreNames.contains(RECENT_STORE)) db.createObjectStore(RECENT_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(RECENT_DATA_STORE)) db.createObjectStore(RECENT_DATA_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  /** 거래 하나: fn이 요청을 걸고, 거래가 끝나면(complete — 쓰기는 디스크에 남았을 때) 마지막 요청 결과를 돌려준다 */
  const run = async <T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> => {
    const db = await open();
    try {
      return await new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        let result: T | undefined;
        let failed: DOMException | null = null;
        const r = fn(t);
        if (r) {
          r.onsuccess = () => (result = r.result);
          r.onerror = () => (failed = r.error);
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? failed ?? new Error('IndexedDB'));
        t.onabort = () => reject(t.error ?? failed ?? new Error('IndexedDB abort'));
      });
    } finally {
      db.close();
    }
  };
  const both = [RECENT_STORE, RECENT_DATA_STORE];
  return {
    async entries() {
      return ((await run([RECENT_STORE], 'readonly', (t) => t.objectStore(RECENT_STORE).getAll())) ?? []) as RecentEntry[];
    },
    async put(entry, data) {
      await run(both, 'readwrite', (t) => {
        t.objectStore(RECENT_DATA_STORE).put(data, entry.id);
        t.objectStore(RECENT_STORE).put(entry);
      });
    },
    async touch(entry) {
      await run([RECENT_STORE], 'readwrite', (t) => t.objectStore(RECENT_STORE).put(entry));
    },
    async data(id) {
      const v = (await run([RECENT_DATA_STORE], 'readonly', (t) => t.objectStore(RECENT_DATA_STORE).get(id))) as Blob | ArrayBuffer | undefined;
      return v instanceof Blob ? v : v ? new Blob([v]) : null;
    },
    async remove(ids) {
      await run(both, 'readwrite', (t) => {
        for (const id of ids) {
          t.objectStore(RECENT_STORE).delete(id);
          t.objectStore(RECENT_DATA_STORE).delete(id);
        }
      });
    },
    async clear() {
      await run(both, 'readwrite', (t) => {
        t.objectStore(RECENT_STORE).clear();
        t.objectStore(RECENT_DATA_STORE).clear();
      });
    },
  };
}
