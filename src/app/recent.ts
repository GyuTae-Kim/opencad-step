/**
 * 최근 문서: 파일 고르기·끌어다 놓기로 잘 연 STEP 파일을 이 브라우저의 IndexedDB(opencad-step / recent)에만 둔다.
 * 서버로 보내지 않는다. 휴대폰 브라우저는 뒤로 간 탭(특히 WebGL 페이지)을 버렸다가 돌아오면 다시 불러오므로,
 * 시작 화면에서 파일 앱을 다시 거치지 않고 바로 연다.
 *
 * - 새것부터 8개, 60MB보다 큰 파일은 두지 않는다. 같은 이름·크기면 하나로 친다(다시 열면 맨 앞으로).
 * - 파일 바이트는 Blob 그대로 넣는다(목록을 읽어도 바이트를 메모리에 올리지 않는다). Blob을 못 넣는 브라우저는 바이트로 넣는다.
 * - IndexedDB를 못 쓰는 환경(비공개 창 등)에서는 조용히 아무것도 하지 않는다.
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

/** 저장 한 건 */
export interface RecentRecord extends RecentEntry {
  data: Blob;
}

/** 저장소(IndexedDB 또는 시험용 메모리) */
export interface RecentBackend {
  all(): Promise<RecentRecord[]>;
  get(id: string): Promise<RecentRecord | undefined>;
  put(record: RecentRecord): Promise<void>;
  delete(ids: readonly string[]): Promise<void>;
  clear(): Promise<void>;
}

export const RECENT_DB = 'opencad-step';
export const RECENT_STORE = 'recent';
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

const entryOf = ({ id, name, size, time }: RecentEntry): RecentEntry => ({ id, name, size, time });

export class RecentStore {
  constructor(
    private readonly backend: RecentBackend | null = indexedDbBackend(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** 새것부터. 못 읽으면 빈 목록 */
  async list(): Promise<RecentEntry[]> {
    if (!this.backend) return [];
    try {
      return newestFirst((await this.backend.all()).map(entryOf));
    } catch {
      return [];
    }
  }

  /** 잘 연 파일 남기기. 남겼으면 true(크기 한계·저장 실패는 false) */
  async add(name: string, data: Blob): Promise<boolean> {
    if (!this.backend || !canRemember(data.size)) return false;
    try {
      await this.backend.put({ id: recentId(name, data.size), name, size: data.size, time: this.now(), data });
      const extra = overflowIds((await this.backend.all()).map(entryOf));
      if (extra.length) await this.backend.delete(extra);
      return true;
    } catch {
      return false;
    }
  }

  /** 남긴 파일(없거나 못 읽으면 null) */
  async get(id: string): Promise<File | null> {
    if (!this.backend) return null;
    try {
      const r = await this.backend.get(id);
      return r ? new File([r.data], r.name, { type: r.data.type, lastModified: r.time }) : null;
    } catch {
      return null;
    }
  }

  /** 다시 열었으면 맨 앞으로 */
  async touch(id: string): Promise<void> {
    if (!this.backend) return;
    try {
      const r = await this.backend.get(id);
      if (r) await this.backend.put({ ...r, time: this.now() });
    } catch {
      /* 순서만 못 바꾼다 */
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.backend?.delete([id]);
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

/** 이 브라우저의 IndexedDB 저장소(없으면 null). 연결은 일마다 열고 닫는다(휴대폰이 뒤에서 끊은 연결을 다시 쓰지 않게) */
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
      const req = idb.open(RECENT_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(RECENT_STORE)) req.result.createObjectStore(RECENT_STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
    const db = await open();
    try {
      return await new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(RECENT_STORE, mode);
        let result: T | undefined;
        const r = fn(t.objectStore(RECENT_STORE));
        if (r) r.onsuccess = () => (result = r.result);
        // 쓰기는 거래가 끝나야(complete) 디스크에 남았다고 본다
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error ?? new Error('IndexedDB'));
        t.onabort = () => reject(t.error ?? new Error('IndexedDB abort'));
      });
    } finally {
      db.close();
    }
  };
  // 예전 방식(바이트)으로 넣은 것도 Blob으로 맞춘다
  const asRecord = (v: unknown): RecentRecord | undefined => {
    const r = v as (RecentEntry & { data?: Blob | ArrayBuffer }) | undefined;
    if (!r || typeof r.id !== 'string' || !r.data) return undefined;
    return { id: r.id, name: r.name, size: r.size, time: r.time, data: r.data instanceof Blob ? r.data : new Blob([r.data]) };
  };
  return {
    async all() {
      const list = (await run('readonly', (s) => s.getAll())) ?? [];
      return list.map(asRecord).filter((r): r is RecentRecord => !!r);
    },
    async get(id) {
      return asRecord(await run('readonly', (s) => s.get(id)));
    },
    async put(record) {
      try {
        await run('readwrite', (s) => s.put(record));
      } catch (e) {
        // Blob을 못 넣는 브라우저: 바이트로 넣는다(용량 부족이면 이것도 실패한다)
        if (e instanceof DOMException && e.name === 'QuotaExceededError') throw e;
        const bytes = await record.data.arrayBuffer();
        await run('readwrite', (s) => s.put({ ...record, data: bytes }));
      }
    },
    async delete(ids) {
      await run('readwrite', (s) => {
        for (const id of ids) s.delete(id);
      });
    },
    async clear() {
      await run('readwrite', (s) => s.clear());
    },
  };
}
