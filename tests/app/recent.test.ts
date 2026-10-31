import { describe, expect, it } from 'vitest';
import { canRemember, newestFirst, overflowIds, RECENT_MAX, RECENT_MAX_SIZE, recentId, recentTimeLabel, RecentStore, type RecentBackend, type RecentEntry } from '../../src/app/recent';
import { storedTweaks, storeTweaks } from '../../src/app/explodetool';

/**
 * 시험용 메모리 저장소(IndexedDB 대신): 목록과 바이트를 따로 두고, 바이트를 읽은 횟수를 센다.
 * fail이면 모든 일이 실패하고(비공개 창 흉내), failData면 바이트 읽기만 실패한다(잠깐의 저장소 오류 흉내)
 */
function memoryBackend(opts: { fail?: boolean; failData?: boolean } = {}) {
  const meta = new Map<string, RecentEntry>();
  const bytes = new Map<string, Blob>();
  const st = { meta, bytes, dataReads: 0, failData: !!opts.failData };
  const guard = () => {
    if (opts.fail) throw new DOMException('no storage', 'InvalidStateError');
  };
  const backend: RecentBackend = {
    async entries() {
      guard();
      return [...meta.values()].map((e) => ({ ...e }));
    },
    async put(entry, data) {
      guard();
      meta.set(entry.id, { ...entry });
      bytes.set(entry.id, data);
    },
    async touch(entry) {
      guard();
      meta.set(entry.id, { ...entry });
    },
    async data(id) {
      guard();
      st.dataReads++;
      if (st.failData) throw new DOMException('Connection to Indexed Database server lost', 'UnknownError');
      return bytes.get(id) ?? null;
    },
    async remove(ids) {
      guard();
      for (const id of ids) {
        meta.delete(id);
        bytes.delete(id);
      }
    },
    async clear() {
      guard();
      meta.clear();
      bytes.clear();
    },
  };
  return { backend, st };
}

/** 부를 때마다 1초씩 가는 시계 */
function clock(start = 1_700_000_000_000) {
  let t = start;
  return () => (t += 1000);
}

const blob = (n: number) => new Blob([new Uint8Array(n)]);

describe('최근 문서 순수 함수', () => {
  it('새것부터 늘어놓고, 넘친 만큼 오래된 것을 고른다', () => {
    const list = [
      { id: 'a', name: 'a', size: 1, time: 10 },
      { id: 'c', name: 'c', size: 1, time: 30 },
      { id: 'b', name: 'b', size: 1, time: 20 },
    ];
    expect(newestFirst(list).map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(list.map((e) => e.id)).toEqual(['a', 'c', 'b']); // 원본은 그대로
    expect(overflowIds(list, 2)).toEqual(['a']);
    expect(overflowIds(list, 3)).toEqual([]);
    expect(overflowIds(list, 0)).toEqual(['c', 'b', 'a']);
  });

  it('크기 한계: 빈 파일과 60MB 넘는 파일은 남기지 않는다', () => {
    expect(RECENT_MAX).toBe(8);
    expect(RECENT_MAX_SIZE).toBe(60 * 1024 * 1024);
    expect(canRemember(1)).toBe(true);
    expect(canRemember(RECENT_MAX_SIZE)).toBe(true);
    expect(canRemember(RECENT_MAX_SIZE + 1)).toBe(false);
    expect(canRemember(0)).toBe(false);
    expect(canRemember(Number.NaN)).toBe(false);
    expect(recentId('부품.stp', 1234)).toBe('부품.stp:1234');
  });

  it('시각 표기: 오늘은 시각만, 올해는 월·일, 그 전은 연도까지', () => {
    const now = new Date(2026, 9, 21, 15, 0).getTime();
    const today = recentTimeLabel(new Date(2026, 9, 21, 9, 5).getTime(), now, 'en');
    expect(today).toMatch(/9:05/);
    expect(today).not.toMatch(/Oct/);
    expect(recentTimeLabel(new Date(2026, 2, 3, 9, 5).getTime(), now, 'en')).toMatch(/Mar 3/);
    expect(recentTimeLabel(new Date(2025, 2, 3, 9, 5).getTime(), now, 'en')).toMatch(/2025/);
    expect(recentTimeLabel(new Date(2026, 9, 21, 15, 4).getTime(), now, 'ko')).toMatch(/3:04/);
    // 모르는 언어 꼬리표면 한국어로
    expect(() => recentTimeLabel(now, now, '!!')).not.toThrow();
  });
});

describe('RecentStore(바꿔 끼운 저장소)', () => {
  it('새것부터 8개만 남기고, 같은 이름·크기는 하나로 맨 앞에 — 목록·개수 줄이기는 파일 바이트를 읽지 않는다', async () => {
    const { backend, st } = memoryBackend();
    const store = new RecentStore(backend, clock());
    for (let i = 0; i < 10; i++) expect(await store.add(`m${i}.stp`, blob(10 + i))).toBe(true);
    let list = await store.list();
    expect(list).toHaveLength(RECENT_MAX);
    expect(list.map((e) => e.name)).toEqual(['m9.stp', 'm8.stp', 'm7.stp', 'm6.stp', 'm5.stp', 'm4.stp', 'm3.stp', 'm2.stp']);
    // 넘친 것은 목록과 바이트 모두에서 지운다
    expect(st.meta.size).toBe(RECENT_MAX);
    expect(st.bytes.size).toBe(RECENT_MAX);
    expect(st.bytes.has('m0.stp:10')).toBe(false);
    // 같은 파일을 다시 남기면 개수는 그대로, 맨 앞으로
    await store.add('m4.stp', blob(14));
    list = await store.list();
    expect(list).toHaveLength(RECENT_MAX);
    expect(list[0]).toMatchObject({ id: 'm4.stp:14', name: 'm4.stp', size: 14 });
    // 이름이 같아도 크기가 다르면 다른 파일
    await store.add('m4.stp', blob(15));
    list = await store.list();
    expect(list.slice(0, 2).map((e) => e.id)).toEqual(['m4.stp:15', 'm4.stp:14']);
    expect(list.map((e) => e.name)).not.toContain('m2.stp');
    // 목록에는 파일 바이트가 없고, 지금까지 바이트를 한 번도 읽지 않았다
    expect(Object.keys(list[0]!).sort()).toEqual(['id', 'name', 'size', 'time']);
    expect(st.dataReads).toBe(0);
  });

  it('60MB 넘는 파일과 빈 파일은 남기지 않는다', async () => {
    const { backend } = memoryBackend();
    const store = new RecentStore(backend, clock());
    const big = { size: RECENT_MAX_SIZE + 1 } as Blob;
    expect(await store.add('big.stp', big)).toBe(false);
    expect(await store.add('empty.stp', blob(0))).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it('다시 열기: 그 파일 하나만 읽고, touch로 맨 앞으로(바이트는 다시 쓰지 않음), 지우기·모두 지우기', async () => {
    const { backend, st } = memoryBackend();
    const store = new RecentStore(backend, clock());
    await store.add('a.stp', new Blob(['ISO-10303-21;']));
    await store.add('b.stp', blob(3));
    const got = await store.read('a.stp:13');
    expect(got.kind).toBe('ok');
    const file = (got as { kind: 'ok'; file: File }).file;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('a.stp');
    expect(await file.text()).toBe('ISO-10303-21;');
    expect(st.dataReads).toBe(1);
    expect((await store.list())[0]!.name).toBe('b.stp');
    const before = st.bytes.get('a.stp:13');
    await store.touch('a.stp:13');
    expect((await store.list()).map((e) => e.name)).toEqual(['a.stp', 'b.stp']);
    expect(st.bytes.get('a.stp:13')).toBe(before);
    await store.remove('a.stp:13');
    expect((await store.list()).map((e) => e.name)).toEqual(['b.stp']);
    expect(st.bytes.has('a.stp:13')).toBe(false);
    await store.clear();
    expect(await store.list()).toEqual([]);
    expect(st.bytes.size).toBe(0);
  });

  it('다시 열기: 없음(목록 항목이나 바이트가 없음)과 못 읽음(잠깐의 오류)을 가린다', async () => {
    const { backend, st } = memoryBackend();
    const store = new RecentStore(backend, clock());
    await store.add('a.stp', blob(5));
    expect(await store.read('none:1')).toEqual({ kind: 'missing' });
    st.bytes.delete('a.stp:5');
    expect(await store.read('a.stp:5')).toEqual({ kind: 'missing' });
    await store.add('b.stp', blob(6));
    st.failData = true;
    expect(await store.read('b.stp:6')).toEqual({ kind: 'error' });
    // 못 읽었을 때 항목은 그대로 남는다(다시 누를 수 있다)
    expect((await store.list()).map((e) => e.id)).toContain('b.stp:6');
    st.failData = false;
    expect((await store.read('b.stp:6')).kind).toBe('ok');
  });

  it('저장소를 못 쓰면(비공개 창·IndexedDB 없음) 조용히 빈 목록, 다시 열기는 못 읽음', async () => {
    const broken = new RecentStore(memoryBackend({ fail: true }).backend, clock());
    expect(await broken.add('a.stp', blob(3))).toBe(false);
    expect(await broken.list()).toEqual([]);
    expect(await broken.read('a.stp:3')).toEqual({ kind: 'error' });
    await expect(broken.touch('a.stp:3')).resolves.toBeUndefined();
    await expect(broken.remove('a.stp:3')).resolves.toBeUndefined();
    await expect(broken.clear()).resolves.toBeUndefined();
    const none = new RecentStore(null);
    expect(await none.add('a.stp', blob(3))).toBe(false);
    expect(await none.list()).toEqual([]);
    expect(await none.read('a.stp:3')).toEqual({ kind: 'error' });
    expect(await storeTweaks(none.backend, 'a.stp:3', { v: 1 })).toBe(false);
    expect(await storeTweaks(broken.backend, 'a.stp:3', { v: 1 })).toBe(false);
    expect(await storedTweaks(broken.backend, 'a.stp:3')).toBeNull();
  });

  it('분해 손질(35차 — 분해 조각 explodetool.ts가 읽고 씀): 남긴 파일 항목에만 두고, 같은 파일을 다시 남기거나 맨 앞으로 옮겨도 지키며, 항목을 지우면 함께 없어진다', async () => {
    const { backend, st } = memoryBackend();
    const store = new RecentStore(backend, clock());
    const data = { v: 1, axes: { z: [['0/1', 2.5]] } };
    // 항목이 없는 파일(예제·주소로 연 것, 60MB 넘는 것)에는 두지 않는다
    expect(await storeTweaks(store.backend, 'a.stp:3', data)).toBe(false);
    await store.add('a.stp', blob(3));
    expect(await storeTweaks(store.backend, 'a.stp:3', data)).toBe(true);
    expect(await storedTweaks(store.backend, 'a.stp:3')).toEqual(data);
    // 바이트는 다시 쓰지 않는다(목록 항목만)
    expect(st.bytes.size).toBe(1);
    await store.add('a.stp', blob(3));
    await store.touch('a.stp:3');
    expect(await storedTweaks(store.backend, 'a.stp:3')).toEqual(data);
    expect((await store.list())[0]!.explode).toEqual(data);
    // 객체가 아닌 값은 손질로 치지 않는다, null이면 뺀다
    await backend.touch({ ...(await backend.entries())[0]!, explode: 'bad' });
    expect(await storedTweaks(store.backend, 'a.stp:3')).toBeNull();
    await storeTweaks(store.backend, 'a.stp:3', data);
    expect(await storeTweaks(store.backend, 'a.stp:3', null)).toBe(true);
    expect(await storedTweaks(store.backend, 'a.stp:3')).toBeNull();
    expect((await backend.entries())[0]).not.toHaveProperty('explode');
    await storeTweaks(store.backend, 'a.stp:3', data);
    await store.remove('a.stp:3');
    expect(await storedTweaks(store.backend, 'a.stp:3')).toBeNull();
  });
});
