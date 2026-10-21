import { describe, expect, it } from 'vitest';
import { canRemember, newestFirst, overflowIds, RECENT_MAX, RECENT_MAX_SIZE, recentId, recentTimeLabel, RecentStore, type RecentBackend, type RecentRecord } from '../../src/app/recent';

/** 시험용 메모리 저장소(IndexedDB 대신). fail이면 모든 일이 실패한다(비공개 창 흉내) */
function memoryBackend(fail = false): RecentBackend & { rows: Map<string, RecentRecord> } {
  const rows = new Map<string, RecentRecord>();
  const guard = () => {
    if (fail) throw new DOMException('no storage', 'InvalidStateError');
  };
  return {
    rows,
    async all() {
      guard();
      return [...rows.values()];
    },
    async get(id) {
      guard();
      return rows.get(id);
    },
    async put(r) {
      guard();
      rows.set(r.id, r);
    },
    async delete(ids) {
      guard();
      for (const id of ids) rows.delete(id);
    },
    async clear() {
      guard();
      rows.clear();
    },
  };
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
  it('새것부터 8개만 남기고, 같은 이름·크기는 하나로 맨 앞에', async () => {
    const be = memoryBackend();
    const store = new RecentStore(be, clock());
    for (let i = 0; i < 10; i++) expect(await store.add(`m${i}.stp`, blob(10 + i))).toBe(true);
    let list = await store.list();
    expect(list).toHaveLength(RECENT_MAX);
    expect(list.map((e) => e.name)).toEqual(['m9.stp', 'm8.stp', 'm7.stp', 'm6.stp', 'm5.stp', 'm4.stp', 'm3.stp', 'm2.stp']);
    expect(be.rows.size).toBe(RECENT_MAX);
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
    // 목록에는 파일 바이트가 없다
    expect(Object.keys(list[0]!).sort()).toEqual(['id', 'name', 'size', 'time']);
  });

  it('60MB 넘는 파일과 빈 파일은 남기지 않는다', async () => {
    const be = memoryBackend();
    const store = new RecentStore(be, clock());
    const big = { size: RECENT_MAX_SIZE + 1 } as Blob;
    expect(await store.add('big.stp', big)).toBe(false);
    expect(await store.add('empty.stp', blob(0))).toBe(false);
    expect(await store.list()).toEqual([]);
  });

  it('다시 열기: 파일을 돌려주고 touch로 맨 앞으로, 지우기·모두 지우기', async () => {
    const store = new RecentStore(memoryBackend(), clock());
    await store.add('a.stp', new Blob(['ISO-10303-21;']));
    await store.add('b.stp', blob(3));
    const file = await store.get('a.stp:13');
    expect(file).toBeInstanceOf(File);
    expect(file!.name).toBe('a.stp');
    expect(await file!.text()).toBe('ISO-10303-21;');
    expect(await store.get('none')).toBeNull();
    expect((await store.list())[0]!.name).toBe('b.stp');
    await store.touch('a.stp:13');
    expect((await store.list()).map((e) => e.name)).toEqual(['a.stp', 'b.stp']);
    await store.remove('a.stp:13');
    expect((await store.list()).map((e) => e.name)).toEqual(['b.stp']);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('저장소를 못 쓰면(비공개 창·IndexedDB 없음) 조용히 빈 목록', async () => {
    const broken = new RecentStore(memoryBackend(true), clock());
    expect(await broken.add('a.stp', blob(3))).toBe(false);
    expect(await broken.list()).toEqual([]);
    expect(await broken.get('a.stp:3')).toBeNull();
    await expect(broken.touch('a.stp:3')).resolves.toBeUndefined();
    await expect(broken.remove('a.stp:3')).resolves.toBeUndefined();
    await expect(broken.clear()).resolves.toBeUndefined();
    const none = new RecentStore(null);
    expect(await none.add('a.stp', blob(3))).toBe(false);
    expect(await none.list()).toEqual([]);
    expect(await none.get('a.stp:3')).toBeNull();
  });
});
