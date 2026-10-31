// 겉모습 걸기(37차 — looks.ts putLooks, 앱 applyLooks): 바뀐 묶음만 한 목록으로 코어 0.33.0 setItemLooks 한 번에(불투명도·고르기·색·행렬).
// 같은 차례(분해 밀대 단계·불투명도·부품 색·흐리게·끌기 한 부품·0%로 되돌림)를 36차처럼 불투명도·색은 묶음마다 + 행렬은 setItemMatrices로 건 뷰어와
// 그리기 기록(가짜 WebGL2 — 그리기마다 균일 변수·그리기 상태)·묶음 겉모습(itemLook)·화면 격자 고르기(경계를 비킨 자리)·장면 범위·부품 보기 범위가 같은지 실제 코어(가짜 DOM)로 본다
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Viewer3d } from 'opencad-viewer3d';
import type { Mesh3d, Scene3d } from 'opencad-viewer3d/types';
import type { ProductNode } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan } from '../../src/app/explode';
import { desiredLooks, lookKey, putLooks, type Look } from '../../src/app/looks';
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
    const appliedA = new Map<string, string>();
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
      expect([...appliedA]).toEqual([...appliedB]);
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
