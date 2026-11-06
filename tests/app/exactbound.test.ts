// 개체 측정 부품 사이 최소 거리의 오목한 자리 받기(45차 — app/exactbound.ts): 구멍 안에 든 축처럼 현이 곡면 안쪽으로 들어가 삼각형 값이 정확한 값보다
// 작은 짝에서, 다듬은 먼 정류점이 두 부품의 전역 최소라는 것을 보이면 받는다.
// - 판 구멍(반지름 2)을 지나는 축(반지름 1.5): 같은 축이면 0.5, 0.3 비킨 축이면 0.2 — 구멍 둘레 윗면·아랫면(구멍 고리)과 축 옆면이 테두리에서 같은 거리로 닿아도
// - 구멍 안에 든 짧은 축(끝 평면 둘이 구멍 안): 0.5
// - 받지 않는 것: 막힌 구멍 바닥이 축 끝 평면에서 0.495(구멍 벽 0.5보다 가깝다 — 참 최소는 0.495), 기운 축(나란하지 않음), 시간 한도
// 46차 — 시간 조각(sliced): 받기를 조각으로 나눠 돌려도 한 번에 돈 것과 같은 답, 쉰 틈은 한도 시계에서 빠짐, 그만두기,
// 앱의 partsLater(먼저 null — "≈", 받으면 later() 뒤 같은 짝에 그 답)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBvh } from 'opencad-viewer3d/bvh';
import { closestBetween, type ClosestShape } from 'opencad-viewer3d/closest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToSceneDeferred } from '../../src/scene';
import { createDoc } from '../../src/app/doc';
import { exactParts, exactPartsSliced, partsLater, type ExactScene } from '../../src/app/exactdist';
import { bsplineCtrlFor, rho, segRho, sliced } from '../../src/app/exactbound';
import { sampleStepBytes } from '../../src/app/sample';
import { cylinder, plateWithHole, r, StepText, type P3 } from '../stepText';

type V3 = [number, number, number];

/** 조립: 부품(이름, 만들기, 자리 원점, 자리 z축) */
function assembly(parts: [string, (w: StepText) => number, P3, P3?][]) {
  const w = new StepText();
  const ctx = w.context();
  const g = parts.map(([, , o, z]) => {
    const zz = z ?? [0, 0, 1];
    const x: P3 = Math.abs(zz[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    // x를 z에 수직으로
    const d = x[0] * zz[0] + x[1] * zz[1] + x[2] * zz[2];
    return w.ax2(o, zz, [x[0] - d * zz[0], x[1] - d * zz[1], x[2] - d * zz[2]]);
  });
  const root = w.product('asm', g, ctx, 'SHAPE_REPRESENTATION');
  parts.forEach(([name, make], i) => w.place(root, w.product(name, [make(w)], ctx), g[i]!, `${name}-${i}`));
  const bytes = w.bytes();
  const { scene } = stepToSceneDeferred(bytes);
  const d = createDoc('synth.stp', bytes.length, { scene, ms: 0 } as never);
  const s: ExactScene = { meshes: new Map(scene.meshes.map((m) => [m.id, m])), faces: d.faces, edges: d.edges, surfaces: null };
  return { scene, s };
}

/** 부품 통째 삼각형 모양(코어 closestPoints와 같은 계산) */
function partShape(m: Mesh3d): ClosestShape {
  const P = m.positions;
  const o = m.origin ?? [0, 0, 0];
  const M = m.matrix;
  const w = (i: number): V3 => {
    const x = P[i * 3]! + o[0], y = P[i * 3 + 1]! + o[1], z = P[i * 3 + 2]! + o[2];
    return M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
  };
  const c0 = w(0);
  const pos = new Float32Array(P.length);
  for (let i = 0; i < P.length / 3; i++) {
    const q = w(i);
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = q[k]! - c0[k]!;
  }
  return { kind: 'triangle', positions: pos, indices: m.indices, bvh: buildBvh('triangle', pos, m.indices), model: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, c0[0], c0[1], c0[2], 1] };
}

/** 20×10×4 덩이 윗면(z = 4)에서 (10, 5) 중심 반지름 2·깊이 depth 막힌 구멍(바닥 원판) */
function blockWithBlindHole(w: StepText, depth: number): number {
  const W = 20;
  const D = 10;
  const H = 4;
  const c: P3 = [10, 5, 0];
  const rad = 2;
  const zb = H - depth;
  const P = (i: number): P3 => [i & 1 ? W : 0, i & 2 ? D : 0, i & 4 ? H : 0];
  const V = Array.from({ length: 8 }, (_, i) => w.vertex(P(i)));
  const edges = new Map<string, number>();
  const oe = (i: number, j: number) => {
    const k = i < j ? `${i}-${j}` : `${j}-${i}`;
    let e = edges.get(k);
    if (e === undefined) {
      const [s, t] = i < j ? [i, j] : [j, i];
      e = w.edge(V[s]!, V[t]!, w.line(P(s), P(t)));
      edges.set(k, e);
    }
    return w.oe(e, i < j);
  };
  const quad = (q: number[]) => w.loop(q.map((i, k) => oe(i, q[(k + 1) % 4]!)));
  const Hb = w.vertex([c[0] + rad, c[1], zb]);
  const Ht = w.vertex([c[0] + rad, c[1], H]);
  const Cb = w.edge(Hb, Hb, w.circle([c[0], c[1], zb], rad));
  const Ct = w.edge(Ht, Ht, w.circle([c[0], c[1], H], rad));
  const L = w.edge(Hb, Ht, w.line([c[0] + rad, c[1], zb], [c[0] + rad, c[1], H]));
  const list = [
    w.face([w.bound(quad([0, 2, 3, 1]))], w.plane([0, 0, 0]), false),
    w.face([w.bound(quad([4, 5, 7, 6])), w.bound(w.loop([w.oe(Ct, false)]), false)], w.plane([0, 0, H])),
    w.face([w.bound(quad([0, 1, 5, 4]))], w.plane([0, 0, 0], [0, -1, 0])),
    w.face([w.bound(quad([2, 6, 7, 3]))], w.plane([0, D, 0], [0, 1, 0])),
    w.face([w.bound(quad([0, 4, 6, 2]))], w.plane([0, 0, 0], [-1, 0, 0], [0, 1, 0])),
    w.face([w.bound(quad([1, 3, 7, 5]))], w.plane([W, 0, 0], [1, 0, 0], [0, 1, 0])),
    // 구멍 벽(법선은 축 쪽)과 바닥(법선 +Z — 구멍 쪽)
    w.face([w.bound(w.loop([w.oe(L, true), w.oe(Ct, true), w.oe(L, false), w.oe(Cb, false)]))], w.add('CYLINDRICAL_SURFACE', `'',#${w.ax2(c)},${r(rad)}`), false),
    w.face([w.bound(w.loop([w.oe(Cb, true)]))], w.plane([c[0], c[1], zb])),
  ];
  return w.solid(list, 'block');
}

/** 두 부품의 삼각형 답과 다듬은 답(받는 시간 boundMs) */
function measure(c: ReturnType<typeof assembly>, boundMs = 2000) {
  const [ma, mb] = c.scene.meshes as [Mesh3d, Mesh3d];
  const tri = closestBetween(partShape(ma), partShape(mb))!;
  const why: string[] = [];
  const ex = exactParts(ma.id, mb.id, tri, c.s, 30, 1000, (w) => why.push(w), boundMs);
  return { tri, ex, why };
}

/** 예제 조립의 다듬기 자료와 이름으로 그물 찾기 */
function sampleScene() {
  const bytes = sampleStepBytes();
  const { scene } = stepToSceneDeferred(bytes);
  const d = createDoc('sample.stp', bytes.length, { scene, ms: 0 } as never);
  const s: ExactScene = { meshes: new Map(scene.meshes.map((m) => [m.id, m])), faces: d.faces, edges: d.edges, surfaces: null };
  const meshOf = (name: string): Mesh3d => {
    let id: string | undefined;
    const walk = (n: (typeof d.products)[number]) => {
      if (n.name === name && n.meshIds.length) id ??= n.meshIds[0];
      n.children.forEach(walk);
    };
    d.products.forEach(walk);
    return scene.meshes.find((m) => m.id === id)!;
  };
  return { s, meshOf };
}

describe('부품 사이 최소 거리의 오목한 자리 받기(45차)', { timeout: 30_000 }, () => {
  it('축과 선분의 거리(ρ): 점·선분(가장 가까운 자리가 안쪽·끝)', () => {
    const H = { o: [0, 0, 0] as V3, a: [0, 0, 1] as V3 };
    expect(rho(H, [3, 4, 7])).toBeCloseTo(5, 12);
    expect(segRho(H, [-1, 2, 0], [1, 2, 5])).toBeCloseTo(2, 12);
    expect(segRho(H, [3, 0, 0], [5, 0, 1])).toBeCloseTo(3, 12);
  });

  it('B-스플라인 토막을 품는 조절점: 그 매개변수 구간에 닿는 것과 앞뒤 하나씩(닫힌 곡선·구간 밖은 전부, 가중치가 양수가 아니면 없음)', () => {
    // 2차, 조절점 6개, 매듭 [0 0 0 1 2 3 4 4 4]
    const knots = Float64Array.from([0, 0, 0, 1, 2, 3, 4, 4, 4]);
    const ctrl = Float64Array.from([0, 0, 0, 1, 1, 0, 2, 0, 0, 3, 1, 0, 4, 0, 0, 5, 1, 0]);
    const def = { kind: 'bspline' as const, degree: 2, knots, ctrl, rational: false, ta: 0, tb: 4, period: 0 };
    // [2.2, 2.8]는 매듭 구간 [2, 3) — 그 구간의 조절점 2·3·4와 앞뒤 하나씩(1·5)
    expect(bsplineCtrlFor(def, 2.2, 2.8)!.map((p) => p[0])).toEqual([1, 2, 3, 4, 5]);
    expect(bsplineCtrlFor({ ...def, period: 4 }, 2.2, 2.8)).toHaveLength(6);
    expect(bsplineCtrlFor(def, -1, 0.5)).toHaveLength(6);
    const w = Float64Array.from([0, 0, 0, 1, 1, 1, 0, 1, 2, 0, 0, 1, 3, 1, 0, -1, 4, 0, 0, 1, 5, 1, 0, 1]);
    expect(bsplineCtrlFor({ ...def, ctrl: w, rational: true }, 2.2, 2.8)).toBeNull();
  });

  it('예제 조립: 받침판 구멍(반지름 2)의 핀(반지름 1.6)은 0.4, 핀을 두른 고리(원환 — 안쪽 반지름 2.1)는 0.5', () => {
    const { s, meshOf } = sampleScene();
    const pin = meshOf('핀');
    for (const [name, want] of [
      ['받침판', 0.4],
      ['고리', 0.5],
    ] as const) {
      const other = meshOf(name);
      const tri = closestBetween(partShape(pin), partShape(other))!;
      expect(tri.distance).toBeLessThan(want - 1e-3);
      const ex = exactParts(pin.id, other.id, tri, s, 30, 1000, null, 2000);
      expect(Math.abs(ex!.distance - want), name).toBeLessThan(1e-9);
    }
  });

  describe('시간 조각(46차)', () => {
    afterEach(() => vi.useRealTimers());

    it('예제의 두 오목한 짝을 아주 짧은 조각(0 ms — 쉴 틈마다)으로 나눠 돌려도 한 번에 돈 것과 같은 두 점·값', async () => {
      const { s, meshOf } = sampleScene();
      const pin = meshOf('핀');
      for (const name of ['받침판', '고리']) {
        const other = meshOf(name);
        const tri = closestBetween(partShape(pin), partShape(other))!;
        const once = exactParts(pin.id, other.id, tri, s, 30, 1000, null, 5000)!;
        const p = exactPartsSliced(pin.id, other.id, tri, s, 30, 1000, null, 5000, 0);
        expect(p.run, name).toBeDefined();
        const e = (await p.run!.done)!;
        expect([e.distance, ...e.a, ...e.b], name).toEqual([once.distance, ...once.a, ...once.b]);
        // 쉴 틈마다 조각을 끊었다(첫 조각만 부른 자리에서 — 예제 부품은 작아 쉴 틈이 몇 번뿐)
        expect(p.run!.stats.slices, name).toBeGreaterThan(1);
      }
    });

    it('쉰 틈(조각 사이)은 한도 시계에서 빠진다 — 한 걸음 2 ms, 조각 4 ms, 조각 사이 1초여도 한도 9 ms 안에 다섯 걸음', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      let t = 0;
      const steps: number[] = [];
      const run = sliced(
        function* (now) {
          const end = now() + 9;
          let n = 0;
          while (now() <= end) {
            steps.push(now());
            t += 2;
            n++;
            yield;
          }
          return n;
        },
        4,
        () => t,
      );
      // 첫 조각은 부른 자리에서 두 걸음
      expect(steps).toEqual([0, 2]);
      for (let k = 0; k < 5; k++) {
        t += 1000;
        vi.runOnlyPendingTimers();
      }
      expect(await run.done).toBe(5);
      expect(steps).toEqual([0, 2, 4, 6, 8]);
      expect(run.stats).toEqual({ slices: 3, longest: 4, busy: 10 });
    });

    it('그만두면 더 돌지 않는다', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      let t = 0;
      let n = 0;
      const run = sliced(
        function* () {
          for (;;) {
            n++;
            t += 5;
            yield;
          }
        },
        4,
        () => t,
      );
      expect(n).toBe(1);
      vi.runOnlyPendingTimers();
      expect(n).toBe(2);
      run.cancel();
      vi.runAllTimers();
      expect(n).toBe(2);
    });

    it('앱의 partsLater: 받기가 끝나기 전에는 null("≈"), 받으면 later() — 같은 짝을 다시 재면 그 답, 다른 짝으로 부르면 앞 받기는 그만둔다', async () => {
      const { s, meshOf } = sampleScene();
      const pin = meshOf('핀');
      const plate = meshOf('받침판');
      const ring = meshOf('고리');
      const triP = closestBetween(partShape(pin), partShape(plate))!;
      const triR = closestBetween(partShape(pin), partShape(ring))!;
      const key = {};
      const later = vi.fn();
      expect(partsLater(key, pin.id, plate.id, triP, s, 30, later)).toBeNull();
      await vi.waitFor(() => expect(later).toHaveBeenCalledTimes(1), { timeout: 20_000, interval: 20 });
      expect(Math.abs(partsLater(key, pin.id, plate.id, triP, s, 30, later)!.distance - 0.4)).toBeLessThan(1e-9);
      // 다른 짝(같은 key라도 삼각형 답이 다르면)은 새로 — 받기 전 null, 그동안 앞 짝을 다시 부르면 또 새로(앞 답은 잊는다)
      const later2 = vi.fn();
      expect(partsLater(key, pin.id, ring.id, triR, s, 30, later2)).toBeNull();
      await vi.waitFor(() => expect(later2).toHaveBeenCalledTimes(1), { timeout: 20_000, interval: 20 });
      expect(Math.abs(partsLater(key, pin.id, ring.id, triR, s, 30, later2)!.distance - 0.5)).toBeLessThan(1e-9);
      // 다른 key(새 측정 짝)는 같은 부품이어도 새로 받는다
      const later3 = vi.fn();
      expect(partsLater({}, pin.id, ring.id, triR, s, 30, later3)).toBeNull();
      // 그 받기가 끝나기 전에 또 다른 짝을 부르면 앞 받기는 later를 부르지 않는다
      const later4 = vi.fn();
      partsLater({}, pin.id, plate.id, triP, s, 30, later4);
      await vi.waitFor(() => expect(later4).toHaveBeenCalledTimes(1), { timeout: 20_000, interval: 20 });
      expect(later3).not.toHaveBeenCalled();
    });
  });

  it('판 구멍(반지름 2)을 지나는 축(반지름 1.5): 삼각형 값은 0.5보다 작고, 받으면 0.5 — 구멍 둘레 평면과 축 옆면이 테두리에서 닿는 짝도 갈린다', () => {
    const c = assembly([
      ['pin', (w) => cylinder(w, 1.5, 4), [10, 5, -1]],
      ['plate', (w) => plateWithHole(w), [0, 0, 0]],
    ]);
    const { tri, ex, why } = measure(c);
    expect(tri.distance).toBeLessThan(0.5 - 1e-3);
    expect(ex, why.join('\n')).not.toBeNull();
    expect(Math.abs(ex!.distance - 0.5)).toBeLessThan(1e-9);
    expect(ex!.farther).toBeUndefined();
    // 두 점은 축 반지름 1.5와 구멍 반지름 2 자리(같은 방향)
    const rr = (p: readonly number[]) => Math.hypot(p[0]! - 10, p[1]! - 5);
    expect([rr(ex!.a), rr(ex!.b)].sort()).toEqual([expect.closeTo(1.5, 9), expect.closeTo(2, 9)]);
    // 시간 한도 안에 못 보이면 받지 않는다(삼각형 값 "≈" 그대로)
    expect(measure(c, -1).ex).toBeNull();
  });

  it('0.3 비킨 축은 0.2, 구멍 안에 든 짧은 축(끝 평면 둘이 구멍 안)은 0.5', () => {
    const off = measure(
      assembly([
        ['pin', (w) => cylinder(w, 1.5, 4), [10.3, 5, -1]],
        ['plate', (w) => plateWithHole(w), [0, 0, 0]],
      ]),
    );
    expect(off.tri.distance).toBeLessThan(0.2);
    expect(Math.abs(off.ex!.distance - 0.2)).toBeLessThan(1e-9);
    const short = measure(
      assembly([
        ['pin', (w) => cylinder(w, 1.5, 1), [10, 5, 0.5]],
        ['plate', (w) => plateWithHole(w), [0, 0, 0]],
      ]),
    );
    expect(short.tri.distance).toBeLessThan(0.5 - 1e-3);
    expect(Math.abs(short.ex!.distance - 0.5)).toBeLessThan(1e-9);
  });

  it('받지 않는 것: 막힌 구멍 바닥이 축 끝 평면에서 0.495(참 최소)면 구멍 벽 0.5를 받지 않는다, 기운 축은 나란하지 않아 받지 않는다', () => {
    // 구멍 바닥 z = 1, 축 끝 z = 1.495
    const blind = measure(
      assembly([
        ['pin', (w) => cylinder(w, 1.5, 3), [10, 5, 1.495]],
        ['block', (w) => blockWithBlindHole(w, 3), [0, 0, 0]],
      ]),
    );
    // 삼각형 답이 구멍 벽 쪽이든 바닥 쪽이든 0.5는 받지 않는다(받으면 바닥 0.495, 평면끼리는 다듬지 않아 null)
    if (blind.ex) expect(Math.abs(blind.ex.distance - 0.495)).toBeLessThan(1e-9);
    if (blind.tri.distance < 0.495 - 1e-6) expect(blind.why.some((w) => /^concave: pair/.test(w))).toBe(true);
    // 기운 축(1°)
    const t = (1 * Math.PI) / 180;
    const tilt = measure(
      assembly([
        ['pin', (w) => cylinder(w, 1.5, 4), [10, 5, -1], [Math.sin(t), 0, Math.cos(t)]],
        ['plate', (w) => plateWithHole(w), [0, 0, 0]],
      ]),
    );
    if (tilt.ex) expect(tilt.ex.distance).toBeLessThanOrEqual(tilt.tri.distance + 1e-9);
  });
});
