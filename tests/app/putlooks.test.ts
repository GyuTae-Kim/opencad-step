// 겉모습 걸기(36차 — looks.ts putLooks, 앱 applyLooks): 바뀐 묶음만 걸고 분해 행렬은 모아 setItemMatrices 한 번에.
// 같은 차례(분해 밀대 단계·불투명도·부품 색·흐리게·끌기 한 부품·0%로 되돌림)를 35차처럼 묶음마다 setItemMatrix로 건 뷰어와
// 묶음 겉모습(itemLook)·장면 범위·화면 격자 고르기(경계를 비킨 자리)·부품 보기 범위가 같은지 실제 코어(가짜 DOM)로 본다
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Viewer3d } from 'opencad-viewer3d';
import type { Mesh3d, Scene3d } from 'opencad-viewer3d/types';
import type { ProductNode } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan } from '../../src/app/explode';
import { desiredLooks, lookKey, putLooks, type Look } from '../../src/app/looks';
import { installDom } from './fakeview';

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

describe('겉모습 걸기: 행렬을 모아 한 번에', () => {
  // 하위 조립 둘(셋·둘) + 낱 부품 하나 — 단계별 분해가 두 단계
  const meshes = [box('a1', [-6, 0, 0]), box('a2', [-4, 2, 0]), box('a3', [-5, -2, 0]), box('b1', [5, 0, 0]), box('b2', [6, 2, 0]), box('c', [0, 5, 0])];
  const products = [N('R', [], [N('A', [], [N('a1', ['a1']), N('a2', ['a2']), N('a3', ['a3'])]), N('B', [], [N('b1', ['b1']), N('b2', ['b2'])]), N('c', ['c'])])];
  const scene: Scene3d = { name: 'looks', units: 'mm', meshes, lines: [] };
  const plan = explodePlan(meshes, products, 'step', 'free');
  const ids = meshes.map((m) => m.id);
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
    want({ t: 0.5 }),
    want({}),
  ];
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

  it('같은 차례를 묶음마다 setItemMatrix로 건 뷰어와 겉모습·범위·고르기가 같고, 행렬은 단계마다 한 번에 건다', () => {
    const a = viewer();
    const b = viewer();
    const appliedA = new Map<string, string>();
    const appliedB = new Map<string, string>();
    let batches = 0;
    let singles = 0;
    const setMatrices = a.setItemMatrices.bind(a);
    a.setItemMatrices = (e) => (batches++, setMatrices(e));
    const setMatrix = a.setItemMatrix.bind(a);
    a.setItemMatrix = (id, m) => (singles++, setMatrix(id, m));
    const counts: number[] = [];
    for (const [i, w] of steps.entries()) {
      const n = putLooks(a, appliedA, w);
      counts.push(n);
      // 35차 앱(묶음마다)
      let m = 0;
      for (const id of [...appliedB.keys()])
        if (!w.has(id)) {
          b.setItemOpacity(id, null);
          b.setItemColor(id, null);
          b.setItemMatrix(id, null);
          appliedB.delete(id);
          m++;
        }
      for (const [id, l] of w) {
        const k = lookKey(l);
        if (appliedB.get(id) === k) continue;
        b.setItemOpacity(id, l.alpha, { pickable: l.pickable });
        b.setItemColor(id, l.color);
        b.setItemMatrix(id, l.matrix);
        appliedB.set(id, k);
        m++;
      }
      a.renderNow();
      b.renderNow();
      expect(n, `${i}단계 건 수`).toBe(m);
      const sa = state(a);
      expect(sa, `${i}단계`).toBe(state(b));
      // 시험이 헛돌지 않게: 격자 자리 여럿이 판을 고른다
      expect((sa.match(/"kind":"mesh"/g) ?? []).length, `${i}단계 고르기`).toBeGreaterThan(10);
      expect([...appliedA]).toEqual([...appliedB]);
    }
    expect(singles).toBe(0);
    expect(batches).toBe(steps.length);
    // 끌기로 한 부품만 바뀐 단계(4)는 그 묶음 하나만 걸었다
    expect(counts[4]).toBe(1);
    // 모두 되돌린 뒤에는 겉모습을 건 적 없는 뷰어와 같다
    putLooks(a, appliedA, new Map());
    a.renderNow();
    const fresh = viewer();
    expect(state(a)).toBe(state(fresh));
    expect(appliedA.size).toBe(0);
    // 바뀐 것이 없으면 코어를 부르지 않는다
    expect(putLooks(a, appliedA, new Map())).toBe(0);
    expect(batches).toBe(steps.length);
    for (const v of [a, b, fresh]) v.dispose();
  });
});
