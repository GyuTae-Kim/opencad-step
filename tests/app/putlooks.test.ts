// 겉모습 걸기(37차 — looks.ts putLooks·LookSync, 앱 applyLooks): 바뀐 묶음만 한 목록으로 코어 0.33.0 setItemLooks 한 번에(불투명도·고르기·색·행렬),
// 지난 원하는 겉모습을 다시 써서 바뀐 묶음만 겉모습·열쇠를 새로 만든다.
// 같은 차례(분해 밀대 단계·불투명도·부품 색·흐리게·끌기·되돌리기·모두 되돌리기·0%로 되돌림)를 36차처럼 모든 묶음의 겉모습을 새로 만들어 불투명도·색은 묶음마다 +
// 행렬은 setItemMatrices로 건 뷰어와 그리기 기록(가짜 WebGL2 — 그리기마다 균일 변수·그리기 상태)·묶음 겉모습(itemLook)·화면 격자 고르기(경계를 비킨 자리)·
// 장면 범위·부품 보기 범위·분해 이동 표가 같은지, 코어에 넘긴 묶음이 겉모습 열쇠가 바뀐 묶음과 같은지 실제 코어(가짜 DOM)로 본다
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Viewer3d } from 'opencad-viewer3d';
import type { Mesh3d, Scene3d } from 'opencad-viewer3d/types';
import type { ProductNode } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan } from '../../src/app/explode';
import { dragUnits, ExplodeTweaks } from '../../src/app/explodetweak';
import { desiredLooks, lookKey, LookSync, putLooks, type AppliedLooks, type Look, type LookInput } from '../../src/app/looks';
import { drawLog, type FakeElement, installDom } from './fakeview';

/** 한 변 2인 상자 그물(가운데 c) */
const box = (id: string, c: [number, number, number]): Mesh3d => ({
  id,
  positions: Float32Array.from([
    c[0] - 1, c[1] - 1, c[2] + 1, c[0] + 1, c[1] - 1, c[2] + 1, c[0] + 1, c[1] + 1, c[2] + 1, c[0] - 1, c[1] + 1, c[2] + 1,
  ]),
  indices: Uint32Array.from([0, 1, 2, 0, 2, 3]),
  color: [0.7, 0.7, 0.7, 1],
});
const N = (name: string, meshIds: string[], children: ProductNode[] = []): ProductNode => ({ name, productId: name, meshIds, children });

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
});
afterAll(() => dom.restore());

// 하위 조립 둘(셋·둘) + 낱 부품 하나 — 단계별 분해가 두 단계
const meshes = [box('a1', [-6, 0, 0]), box('a2', [-4, 2, 0]), box('a3', [-5, -2, 0]), box('b1', [5, 0, 0]), box('b2', [6, 2, 0]), box('c', [0, 5, 0])];
const products = [N('R', [], [N('A', [], [N('a1', ['a1']), N('a2', ['a2']), N('a3', ['a3'])]), N('B', [], [N('b1', ['b1']), N('b2', ['b2'])]), N('c', ['c'])])];
const scene: Scene3d = { name: 'looks', units: 'mm', meshes, lines: [] };
const plan = explodePlan(meshes, products, 'step', 'free');
const ids = meshes.map((m) => m.id);

const viewer = (): Viewer3d => {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  // 판(z 위 사각형)을 마주 보게 위에서, 100% 분해 자리까지 보이게 물러서서
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), distance: 45 });
  v.renderNow();
  return v;
};
/** 그리기 한 번의 기록(가짜 WebGL2) */
const frame = (v: Viewer3d): string[] => {
  const log = drawLog((v.canvas as unknown as FakeElement).getContext('webgl2'))!;
  log.draws = [];
  log.on = true;
  v.renderNow();
  log.on = false;
  return log.draws;
};
/** 뷰어 상태: 묶음 겉모습·화면 격자 고르기·장면 범위(전체 보기 카메라)·부품 범위(묶음 보기 카메라) — 카메라는 되돌린다 */
const state = (v: Viewer3d): string => {
  const picks: unknown[] = [];
  for (let y = 13.7; y < 600; y += 17.9) for (let x = 17.9; x < 800; x += 19.7) picks.push(v.pick(x, y));
  const c0 = v.getCamera();
  v.fit(false);
  const fit = v.getCamera();
  v.fitItems(['a2', 'b1'], false);
  const items = v.getCamera();
  v.setCamera(c0);
  v.renderNow();
  return JSON.stringify({ looks: ids.map((id) => v.itemLook(id)), picks, fit, items });
};
/** 36차 앱의 걸기(불투명도·색은 묶음마다, 행렬은 모아 setItemMatrices) — 견줄 기준 */
const put36 = (v: Viewer3d, applied: Map<string, string>, want: ReadonlyMap<string, Look>): number => {
  const mats: [string, number[] | null][] = [];
  for (const id of [...applied.keys()])
    if (!want.has(id)) {
      v.setItemOpacity(id, null);
      v.setItemColor(id, null);
      mats.push([id, null]);
      applied.delete(id);
    }
  for (const [id, l] of want) {
    const k = lookKey(l);
    if (applied.get(id) === k) continue;
    v.setItemOpacity(id, l.alpha, { pickable: l.pickable });
    v.setItemColor(id, l.color);
    mats.push([id, l.matrix]);
    applied.set(id, k);
  }
  if (mats.length) v.setItemMatrices(mats);
  return mats.length;
};

describe('겉모습 걸기: 바뀐 묶음만 한 목록으로(setItemLooks)', () => {
  const want = (o: { t?: number; opacity?: [string, number][]; colors?: boolean; dim?: string[]; extra?: [string, [number, number, number]] }): Map<string, Look> => {
    const moves = o.t ? explodeMoves(plan, o.t, EXPLODE_SCALE) : undefined;
    if (moves && o.extra) {
      const [id, d] = o.extra;
      const m = moves.get(id) ?? [0, 0, 0];
      moves.set(id, [m[0] + d[0], m[1] + d[1], m[2] + d[2]]);
    }
    return desiredLooks({ items: meshes, products, opacity: new Map(o.opacity ?? []), dim: o.dim ? new Set(o.dim) : null, partColors: !!o.colors, ...(moves ? { moves } : {}) });
  };
  const steps = [
    want({ t: 0.25 }),
    want({ t: 0.5 }),
    want({ t: 0.75, opacity: [['b1', 0.5]] }),
    want({ t: 1, opacity: [['b1', 0.5]], colors: true }),
    want({ t: 1, opacity: [['b1', 0.5]], colors: true, extra: ['a2', [0.5, 0.25, 0]] }),
    want({ t: 1, colors: true, dim: ['a1', 'a2', 'a3'] }),
    want({ t: 0.5, dim: ['a1', 'a2', 'a3', 'b1', 'b2'] }),
    want({ t: 0.5 }),
    want({}),
  ];

  it('같은 차례를 36차처럼(불투명도·색 하나씩 + setItemMatrices) 건 뷰어와 그리기 기록·겉모습·범위·고르기가 같고, 코어는 단계마다 setItemLooks 한 번만', () => {
    const a = viewer();
    const b = viewer();
    const appliedA: AppliedLooks = new Map();
    const appliedB = new Map<string, string>();
    const calls = { looks: 0, other: 0 };
    const setLooks = a.setItemLooks.bind(a);
    a.setItemLooks = (e) => (calls.looks++, setLooks(e));
    for (const k of ['setItemOpacity', 'setItemColor', 'setItemMatrix', 'setItemMatrices'] as const) {
      const f = (a[k] as (...x: unknown[]) => unknown).bind(a);
      (a as unknown as Record<string, unknown>)[k] = (...x: unknown[]) => (calls.other++, f(...x));
    }
    const counts: number[] = [];
    const frames: string[] = [];
    for (const [i, w] of steps.entries()) {
      const n = putLooks(a, appliedA, w);
      counts.push(n);
      const m = put36(b, appliedB, w);
      expect(n, `${i}단계 건 수`).toBe(m);
      const fa = frame(a);
      expect(fa, `${i}단계 그리기 기록`).toEqual(frame(b));
      // 시험이 헛돌지 않게: 판 여섯을 그린다
      expect(fa.filter((x) => x.startsWith('["drawElements"')).length, `${i}단계 그리기`).toBeGreaterThanOrEqual(6);
      frames.push(JSON.stringify(fa));
      const sa = state(a);
      expect(sa, `${i}단계`).toBe(state(b));
      expect((sa.match(/"kind":"mesh"/g) ?? []).length, `${i}단계 고르기`).toBeGreaterThan(10);
      expect([...appliedA].map(([id, x]) => [id, x.key])).toEqual([...appliedB]);
    }
    expect(calls.other).toBe(0);
    expect(calls.looks).toBe(steps.length);
    // 그리기 기록이 겉모습을 담는다(이웃한 단계끼리 다르다)
    for (let i = 1; i < frames.length; i++) expect(frames[i], `${i}단계`).not.toBe(frames[i - 1]);
    // 끌기로 한 부품만 바뀐 단계(4)는 그 묶음 하나만 걸었다
    expect(counts[4]).toBe(1);
    // 모두 되돌린 뒤에는 겉모습을 건 적 없는 뷰어와 같다
    putLooks(a, appliedA, new Map());
    const fresh = viewer();
    expect(frame(a)).toEqual(frame(fresh));
    expect(state(a)).toBe(state(fresh));
    expect(appliedA.size).toBe(0);
    // 바뀐 것이 없으면 코어를 부르지 않는다
    expect(putLooks(a, appliedA, new Map())).toBe(0);
    expect(calls.looks).toBe(steps.length);
    for (const v of [a, b, fresh]) v.dispose();
  });
});

describe('겉모습 걸기: 바뀐 묶음만 다시 만들기(LookSync)', () => {
  /** 앱 문서 상태 꼴: 분해 정도·손질·불투명도·흐리게·부품 색(앱 applyLooks처럼 부를 때마다 묶음 목록을 새로 만든다) */
  const st = { t: 0, tweaks: new ExplodeTweaks(), opacity: new Map<string, number>(), dim: null as Set<string> | null, colors: false };
  const input = (): LookInput => ({
    items: [...meshes],
    products,
    opacity: st.opacity,
    dim: st.dim,
    partColors: st.colors,
    ...(st.t > 0 ? { moves: explodeMoves(plan, st.t, EXPLODE_SCALE, st.tweaks.count('free') ? st.tweaks.resolve(plan, 'free', plan.view) : undefined) } : {}),
  });
  /** 끌기(explodetool.ts moveTo 꼴): 누른 묶음의 끌 단위마다 처음 성분 + 세계 이동 ÷ 진행 */
  let drag: { token: string; f: number; start: number[] }[] = [];
  const press = (id: string): void => {
    drag = dragUnits(plan, st.t, id).map((u) => ({ token: u.token, f: u.f, start: [...(st.tweaks.moves('free').get(u.token) ?? [0, 0, 0])] }));
    expect(drag.length, id).toBeGreaterThan(0);
    st.tweaks.begin('free');
  };
  const moveBy = (c: [number, number, number]): void => {
    for (const u of drag) st.tweaks.put(u.token, u.start.map((s, i) => s + c[i]! / u.f));
  };
  /** 단계: 이름, 상태 바꾸기, (있으면) 코어에 넘길 묶음 */
  const steps: [string, () => void, string[]?][] = [
    ['밀대 50%', () => (st.t = 0.5)],
    ['밀대 100%', () => (st.t = 1)],
    ['a2 끌기 1', () => (press('a2'), moveBy([0.5, 0, 0])), ['a2']],
    ['a2 끌기 2', () => moveBy([1, 0.25, 0]), ['a2']],
    ['a2 끌기 3', () => moveBy([1.5, 0.5, 0]), ['a2']],
    ['a2 놓기', () => void st.tweaks.commit(), []],
    ['b1 끌기', () => (press('b1'), moveBy([0, 1, 0])), ['b1']],
    ['b1 놓기', () => void st.tweaks.commit(), []],
    ['되돌리기', () => void st.tweaks.undo('free'), ['b1']],
    ['부품 색', () => (st.colors = true)],
    ['흐리게', () => (st.dim = new Set(['a1', 'a2', 'a3']))],
    ['색·흐리게 중 c 끌기', () => (press('c'), moveBy([0, 0.5, 0.5])), ['c']],
    ['끌기 취소', () => st.tweaks.cancel(), ['c']],
    // 흐린 부품(초점 밖)의 불투명도는 흐린 값보다 낮을 때만 바뀐다
    ['흐린 b2 불투명도 50%', () => void st.opacity.set('b2', 0.5), []],
    ['초점 a1 불투명도 50%', () => void st.opacity.set('a1', 0.5), ['a1']],
    ['모두 되돌리기', () => void st.tweaks.clear('free'), ['a2']],
    ['밀대 25%', () => (st.t = 0.25)],
    ['색·흐리게 끄기', () => ((st.colors = false), (st.dim = null))],
    ['0%', () => (st.t = 0)],
    // 흐리게를 푼 뒤에는 b2의 50%도 보였다
    ['불투명도 되돌리기', () => st.opacity.clear(), ['a1', 'b2']],
    ['그대로', () => undefined, []],
  ];

  it('같은 차례를 36차처럼(모든 묶음을 새로 만들어 하나씩 + setItemMatrices) 건 뷰어와 같고, 코어에 넘긴 묶음은 겉모습 열쇠가 바뀐 묶음 그대로이며 바뀌지 않은 묶음은 겉모습을 다시 만들지 않는다', () => {
    const a = viewer();
    const b = viewer();
    const sync = new LookSync();
    let sent: string[] = [];
    const setLooks = a.setItemLooks.bind(a);
    a.setItemLooks = (e) => {
      const list = [...e];
      sent = list.map(([id]) => id);
      return setLooks(list);
    };
    const appliedB = new Map<string, string>();
    let prevFull = new Map<string, Look>();
    let prevP = new Map<string, Look>();
    const keyOf = (w: ReadonlyMap<string, Look>, id: string): string | null => (w.has(id) ? lookKey(w.get(id)!) : null);
    for (const [name, change, expected] of steps) {
      change();
      const inp = input();
      sent = [];
      const n = sync.apply(a, inp);
      // 36차: 모든 묶음의 겉모습을 새로 만들어 열쇠로 견준다
      const full = desiredLooks(inp);
      expect(n, `${name} 건 수`).toBe(put36(b, appliedB, full));
      // 코어에 넘긴 묶음 = 겉모습 열쇠가 바뀌었거나 생기거나 없어진 묶음(차례는 없어진 것 → 장면 차례)
      const changed = ids.filter((id) => keyOf(full, id) !== keyOf(prevFull, id));
      expect([...sent].sort(), name).toEqual([...changed].sort());
      if (expected) expect([...sent].sort(), `${name} 바뀐 부품`).toEqual(expected);
      // 지난 겉모습을 다시 쓴 결과는 새로 만든 것과 값이 같고, 새로 만든 겉모습 객체는 바뀐 묶음 것뿐이다
      const p = desiredLooks(inp, prevP);
      expect(p, name).toEqual(full);
      const made = [...p].filter(([id, l]) => prevP.get(id) !== l).map(([id]) => id);
      expect(made.sort(), `${name} 새로 만든 겉모습`).toEqual(changed.filter((id) => full.has(id)).sort());
      // 분해 이동 표(앱 lookMoves)
      const mv = new Map<string, number[]>();
      for (const [id, l] of full) if (l.matrix) mv.set(id, [l.matrix[12]!, l.matrix[13]!, l.matrix[14]!]);
      expect(new Map([...sync.moves()].map(([id, d]) => [id, [...d]])), name).toEqual(mv);
      const fa = frame(a);
      expect(fa, `${name} 그리기 기록`).toEqual(frame(b));
      expect(state(a), name).toBe(state(b));
      prevFull = full;
      prevP = p;
    }
    // 시험이 헛돌지 않게: 끌기·되돌리기·색·흐리게 단계가 실제로 겉모습을 바꿨다
    expect(steps.filter(([, , e]) => e?.length).length).toBeGreaterThanOrEqual(10);
    // 새 장면(코어가 겉모습을 모두 푼다): clear 뒤에는 다시 모두 건다
    st.t = 1;
    sync.clear();
    const c = viewer();
    sent = [];
    const setC = c.setItemLooks.bind(c);
    c.setItemLooks = (e) => {
      const list = [...e];
      sent = list.map(([id]) => id);
      return setC(list);
    };
    expect(sync.apply(c, input())).toBe(ids.length);
    expect(sent.sort()).toEqual([...ids].sort());
    for (const v of [a, b, c]) v.dispose();
  });

  it('부품 색: 묶음·나무가 같으면 바뀐 것이 없고(묶음 목록만 새로), 나무가 바뀌면 부품 색 표를 다시 구한다', () => {
    const v = viewer();
    const sync = new LookSync();
    const base = { opacity: new Map<string, number>(), dim: null, partColors: true } as const;
    expect(sync.apply(v, { ...base, items: [...meshes], products })).toBe(ids.length);
    const ca = v.itemLook('a1')!.color;
    const cb = v.itemLook('b1')!.color;
    expect(cb).not.toEqual(ca);
    // 같은 나무 — 묶음 목록만 새로: 바뀐 것이 없다
    expect(sync.apply(v, { ...base, items: [...meshes], products })).toBe(0);
    // 다른 나무(a1을 b1과 같은 제품으로 — 같은 제품은 같은 색) — 다시 구해 b1이 a1 색으로(앞에 나온 제품 차례)
    const other = [N('R', [], [N('A', [], [{ ...N('a1', ['a1']), productId: 'b1', name: 'b1' }, N('a2', ['a2']), N('a3', ['a3'])]), N('B', [], [N('b1', ['b1']), N('b2', ['b2'])]), N('c', ['c'])])];
    expect(sync.apply(v, { ...base, items: [...meshes], products: other })).toBeGreaterThan(0);
    expect(v.itemLook('b1')!.color).toEqual(ca);
    expect(v.itemLook('a1')!.color).toEqual(ca);
    expect(sync.apply(v, { ...base, items: [...meshes], products: other })).toBe(0);
    v.dispose();
  });
});
