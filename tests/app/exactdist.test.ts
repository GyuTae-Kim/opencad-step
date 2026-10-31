// 개체 측정 최소 거리를 B-rep 곡면·곡선 정의로 다듬기(40차 — app/exactdist.ts): 합성 조립에서 삼각형 값(≈)과 다듬은 값을 앱과 따로 푼 정확한 값에 견준다.
// - 민 원기둥(해석 워커의 곡면 정의) 옆면 둘: 틈 3·거의 닿는 틈 0.01(두 축을 잇는 선 위에 삼각형 꼭짓점이 오지 않게 돌려 놓음) — 부품 사이 최소 거리도
// - 구(면 표의 식)와 B-스플라인 지붕, 꼭짓점과 지붕(점-곡면), 지붕의 B-스플라인 모서리와 원 모서리(곡선-곡선)
// - 받지 않는 것: 오목(원기둥 안쪽 점 — 정확한 거리가 현보다 멀다), 지붕 경계 밖으로 나가는 자리, 평면끼리, 시간 한도
// - measurePicked: 다듬으면 "≈" 없이 그 값·두 점, 못 다듬으면 삼각형 값 "≈" 그대로
import { describe, expect, it } from 'vitest';
import { buildBvh } from 'opencad-viewer3d/bvh';
import { closestBetween, type ClosestShape } from 'opencad-viewer3d/closest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToSceneDeferred } from '../../src/scene';
import { createDoc } from '../../src/app/doc';
import { edgeDetails } from '../../src/app/edges';
import { faceDetails } from '../../src/app/faces';
import { measurePicked, pickedClosest, pickedEdge, pickedFace, pickedPoint, type Picked } from '../../src/app/entpick';
import { exactParts, exactPicked, pickedGeo, refineClosest, type ExactScene } from '../../src/app/exactdist';
import { packFaceSurfaces, reviveFaceSurfaces } from '../../src/facesurf';
import { cube, sphere, StepText, type P3 } from '../stepText';
import { extrudedCylinder, roofBlock, roofZ } from './facescene';

type V3 = [number, number, number];

/** 조립: 부품(이름, 만들기, 자리 원점, 자리 x축) — 곡면 정의는 해석 워커처럼 보내고 되살린다 */
function assembly(parts: [string, (w: StepText) => number, P3, P3?][]) {
  const w = new StepText();
  const ctx = w.context();
  const g = parts.map(([, , o, x]) => w.ax2(o, [0, 0, 1], x ?? [1, 0, 0]));
  const root = w.product('asm', g, ctx, 'SHAPE_REPRESENTATION');
  parts.forEach(([name, make], i) => w.place(root, w.product(name, [make(w)], ctx), g[i]!, `${name}-${i}`));
  const bytes = w.bytes();
  const { scene, surfaces } = stepToSceneDeferred(bytes);
  const d = createDoc('synth.stp', bytes.length, { scene, ms: 0 } as never);
  const look = surfaces ? reviveFaceSurfaces(structuredClone(packFaceSurfaces(surfaces)!)) : null;
  const s: ExactScene = { meshes: new Map(scene.meshes.map((m) => [m.id, m])), faces: d.faces, edges: d.edges, surfaces: look };
  return { scene, d, s, meshOf: (id: string) => scene.meshes.find((m) => m.id === id) };
}
type Ctx = ReturnType<typeof assembly>;

/** 그물 i의 종류 kind 면(첫째) */
function face(c: Ctx, i: number, kind: string): Picked {
  const m = c.scene.meshes[i]!;
  const fx = c.d.faces!;
  const t = fx.tables[fx.tableOf.get(m.id)!]!;
  for (let f = 0; f < t.kinds.length; f++) if (fx.kinds[t.kinds[f]!] === kind) return pickedFace(faceDetails(m, t, f, fx.kinds)!, [0, 0, 0]);
  throw new Error(`no ${kind}`);
}
/** 그물 i의 종류 kind 모서리 가운데 pred가 맞는 것 */
function edge(c: Ctx, i: number, kind: string, pred: (ends: [V3, V3]) => boolean): Picked {
  const m = c.scene.meshes[i]!;
  const ex = c.d.edges!;
  const t = ex.tables[ex.tableOf.get(m.id)!]!;
  for (let e = 0; e + 1 < t.segStart.length; e++) {
    const ep = edgeDetails(m, t, e, ex.kinds);
    if (ep && ep.kind === kind && pred(ep.ends)) return pickedEdge(ep, ep.mid);
  }
  throw new Error(`no ${kind} edge`);
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

// 앱과 따로 푼 정확한 값: 두 매개변수 [0, 1]² 격자 뒤 줄여 가는 좌표 탐색
function min2(f: (u: number, v: number) => number, n = 80): number {
  let best = { u: 0, v: 0, d: Infinity };
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const d = f(i / n, j / n);
      if (d < best.d) best = { u: i / n, v: j / n, d };
    }
  let h = 1 / n;
  while (h > 1e-13) {
    let moved = false;
    for (const [du, dv] of [
      [h, 0],
      [-h, 0],
      [0, h],
      [0, -h],
      [h, h],
      [-h, -h],
      [h, -h],
      [-h, h],
    ] as const) {
      const u = Math.min(1, Math.max(0, best.u + du));
      const v = Math.min(1, Math.max(0, best.v + dv));
      const d = f(u, v);
      if (d < best.d) {
        best = { u, v, d };
        moved = true;
      }
    }
    if (!moved) h /= 2;
  }
  return best.d;
}
const A = 10;
const B = 8;
const roofAt = (u: number, v: number): V3 => [A * u, B * v, roofZ(u, v)];
const d3 = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const deg = (x: number) => (x * Math.PI) / 180;
const at40 = (L: number): P3 => [L * Math.cos(deg(40)), L * Math.sin(deg(40)), 0];
const x17: P3 = [Math.cos(deg(17)), Math.sin(deg(17)), 0];

/** 개체 측정 최소 거리: 삼각형 값과 다듬은 값 */
function both(c: Ctx, a: Picked, b: Picked) {
  const tri = pickedClosest(a, b, c.meshOf)!;
  return { tri, ex: exactPicked(a, b, tri, c.s, 30, 1000) };
}

// 따로 푸는 정확한 값(격자 탐색)이 부하가 높은 기계에서 느릴 수 있어 시험마다 시간을 넉넉히
describe('개체 측정 최소 거리를 정확한 정의로(40차)', { timeout: 30_000 }, () => {
  it('민 원기둥 옆면 둘(반지름 2, 축 사이 7): 삼각형 값은 현 때문에 0.0092 크고, 다듬으면 3 — 부품 사이 최소 거리도', () => {
    const c = assembly([
      ['x1', (w) => extrudedCylinder(w, 2, 10), [0, 0, 0]],
      ['x2', (w) => extrudedCylinder(w, 2, 10), at40(7), x17],
    ]);
    const { tri, ex } = both(c, face(c, 0, 'extrusion'), face(c, 1, 'extrusion'));
    expect(tri.distance - 3).toBeGreaterThan(0.005);
    expect(Math.abs(ex!.distance - 3)).toBeLessThan(1e-9);
    // 두 점은 축을 잇는 선 위(40° 쪽 반지름 2 자리와 그 맞은편)
    expect(d3(ex!.a, [2 * Math.cos(deg(40)), 2 * Math.sin(deg(40)), ex!.a[2]])).toBeLessThan(1e-9);
    expect(d3(ex!.b, [5 * Math.cos(deg(40)), 5 * Math.sin(deg(40)), ex!.b[2]])).toBeLessThan(1e-9);
    const [ma, mb] = c.scene.meshes as [Mesh3d, Mesh3d];
    const r = closestBetween(partShape(ma), partShape(mb))!;
    expect(r.distance - 3).toBeGreaterThan(0.005);
    expect(Math.abs(exactParts(ma.id, mb.id, r, c.s, 30, 1000)!.distance - 3)).toBeLessThan(1e-9);
  });

  it('거의 닿는 민 원기둥 둘(틈 0.01): 삼각형 값은 두 배 가까이(0.0194), 다듬으면 0.01', () => {
    const c = assembly([
      ['x1', (w) => extrudedCylinder(w, 2, 10), [0, 0, 0]],
      ['x2', (w) => extrudedCylinder(w, 2, 10), at40(4.01), x17],
    ]);
    const { tri, ex } = both(c, face(c, 0, 'extrusion'), face(c, 1, 'extrusion'));
    expect(tri.distance).toBeGreaterThan(0.015);
    expect(Math.abs(ex!.distance - 0.01)).toBeLessThan(1e-9);
  });

  it('구(면 표의 식, 반지름 1.5)와 B-스플라인 지붕, 꼭짓점과 지붕 — 앱과 따로 푼 값과 1e-6 안, 삼각형 값보다 작다', () => {
    const ctr: V3 = [5, 4, 9];
    const c = assembly([
      ['roof', (w) => roofBlock(w, A, B), [0, 0, 0]],
      ['ball', (w) => sphere(w, 1.5), ctr],
    ]);
    const exact = min2((u, v) => d3(roofAt(u, v), ctr)) - 1.5;
    const { tri, ex } = both(c, face(c, 1, 'sphere'), face(c, 0, 'bspline'));
    expect(tri.distance - exact).toBeGreaterThan(0.005);
    expect(Math.abs(ex!.distance - exact)).toBeLessThan(1e-6);
    expect(ex!.distance).toBeLessThanOrEqual(tri.distance);
    // 꼭짓점(점)과 지붕
    const P: V3 = [3, 5, 9.5];
    const c2 = assembly([
      ['roof', (w) => roofBlock(w, A, B), [0, 0, 0]],
      ['cube', (w) => cube(w, 1).solid, P],
    ]);
    const e2 = min2((u, v) => d3(roofAt(u, v), P));
    const r2 = both(c2, pickedPoint(c2.scene.meshes[1]!.id, P, '꼭짓점'), face(c2, 0, 'bspline'));
    expect(r2.tri.distance - e2).toBeGreaterThan(0.001);
    expect(Math.abs(r2.ex!.distance - e2)).toBeLessThan(1e-6);
  });

  it('곡선-곡선: 지붕의 y = 0 B-스플라인 모서리와 민 원기둥 위 원 모서리', () => {
    const c = assembly([
      ['roof', (w) => roofBlock(w, A, B), [0, 0, 0]],
      ['x', (w) => extrudedCylinder(w, 2, 8), [5, -4, 0]],
    ]);
    const curve = (u: number): V3 => [A * u, 0, roofZ(u, 0)];
    const rim = (t: number): V3 => [5 + 2 * Math.cos(t * 2 * Math.PI), -4 + 2 * Math.sin(t * 2 * Math.PI), 8];
    const exact = min2((u, t) => d3(curve(u), rim(t)), 120);
    const bs = edge(c, 0, 'bspline', (e) => Math.abs(e[0][1]) < 1e-9 && Math.abs(e[1][1]) < 1e-9);
    const ci = edge(c, 1, 'circle', (e) => Math.abs(e[0][2] - 8) < 1e-9);
    const { tri, ex } = both(c, bs, ci);
    expect(tri.distance - exact).toBeGreaterThan(0.001);
    expect(Math.abs(ex!.distance - exact)).toBeLessThan(1e-6);
  });

  it('받지 않는 것: 오목(원기둥 안쪽 점 — 정확한 거리 2가 현보다 멀다), 지붕 경계 밖, 평면끼리, 곡면 정의를 아직 받지 않음, 시간 한도', () => {
    const c = assembly([
      ['x1', (w) => extrudedCylinder(w, 2, 10), [0, 0, 0]],
      ['cube', (w) => cube(w, 0.2).solid, [-0.1, -0.1, 4.9]],
    ]);
    const why: string[] = [];
    const tri = pickedClosest(face(c, 0, 'extrusion'), pickedPoint(c.scene.meshes[1]!.id, [0, 0, 5], '점'), c.meshOf)!;
    expect(tri.distance).toBeLessThan(2);
    expect(exactPicked(face(c, 0, 'extrusion'), pickedPoint(c.scene.meshes[1]!.id, [0, 0, 5], '점'), tri, c.s, 30, 1000, (w) => why.push(w))).toBeNull();
    expect(why[0]).toMatch(/^farther (2|1\.99999999)/);
    // 잘린 면 밖: 민 원기둥(높이 10) 위쪽 바깥 점(4, 0, 13)의 곡면 위 발(2, 0, 13)은 옆면 경계(z ≤ 10) 밖이라 받지 않는다(그 자리 최소는 경계 곡선 위)
    const outPt = pickedPoint(c.scene.meshes[1]!.id, [4, 0, 13], '점');
    const t1 = pickedClosest(face(c, 0, 'extrusion'), outPt, c.meshOf)!;
    const w1: string[] = [];
    expect(exactPicked(face(c, 0, 'extrusion'), outPt, t1, c.s, 30, 1000, (w) => w1.push(w))).toBeNull();
    expect(w1).toEqual(['outside A']);
    // 지붕 모서리 밖 위 점: 잘리지 않은 B-스플라인 조각은 매개변수 끝이 곧 면 경계라 끝(u = 1)에 걸린 극소까지 푼다(앱과 따로 푼 값과 1e-6 안) —
    // 그 경계 곡선이 현보다 점에서 멀어 삼각형 값보다 크므로 받지는 않는다(더 먼 자리 규칙)
    const c2 = assembly([
      ['roof', (w) => roofBlock(w, A, B), [0, 0, 0]],
      ['cube', (w) => cube(w, 1).solid, [12, 4, 9]],
    ]);
    const roof = face(c2, 0, 'bspline');
    const far = pickedPoint(c2.scene.meshes[1]!.id, [12, 4, 9], '점');
    const t2 = pickedClosest(roof, far, c2.meshOf)!;
    const edgeExact = min2((u, v) => d3(roofAt(u, v), [12, 4, 9]));
    const w2: string[] = [];
    expect(exactPicked(roof, far, t2, c2.s, 30, 1000, (w) => w2.push(w))).toBeNull();
    const m2 = /^farther ([\d.e+-]+) > ([\d.e+-]+)$/.exec(w2[0] ?? '');
    expect(m2).not.toBeNull();
    expect(Math.abs(Number(m2![1]) - edgeExact)).toBeLessThan(1e-6);
    expect(Number(m2![2])).toBeCloseTo(t2.distance, 12);
    // 평면끼리는 다듬지 않는다(삼각형 값이 곧 정확한 값)
    const plane = face(c2, 0, 'plane');
    const plane2 = face(c2, 1, 'plane');
    const t3 = pickedClosest(plane, plane2, c2.meshOf)!;
    expect(exactPicked(plane, plane2, t3, c2.s, 30, 1000)).toBeNull();
    // 곡면 정의를 아직 받지 않았으면(lookup이 undefined) 다듬지 않는다
    expect(pickedGeo(roof, { ...c2.s, surfaces: () => undefined })).toBeNull();
    // 시간 한도를 넘기면 그만둔다
    const G = pickedGeo(roof, c2.s)!;
    const P = pickedGeo(pickedPoint(c2.scene.meshes[1]!.id, [5, 4, 9], '점'), c2.s)!;
    const t4 = pickedClosest(roof, pickedPoint(c2.scene.meshes[1]!.id, [5, 4, 9], '점'), c2.meshOf)!;
    expect(refineClosest(G, P, t4, 30, -Infinity)).toBeNull();
    expect(refineClosest(G, P, t4, 30)).not.toBeNull();
  });

  it('measurePicked: 다듬으면 "≈" 없이 그 값·두 점, 못 다듬으면 삼각형 값 "≈" 그대로 — 부품 사이 최소 거리도', () => {
    const c = assembly([
      ['x1', (w) => extrudedCylinder(w, 2, 10), [0, 0, 0]],
      ['x2', (w) => extrudedCylinder(w, 2, 10), at40(7), x17],
    ]);
    const a = face(c, 0, 'extrusion');
    const b = face(c, 1, 'extrusion');
    const parts = (x: string, y: string) => closestBetween(partShape(c.meshOf(x)!), partShape(c.meshOf(y)!));
    const plain = measurePicked(a, b, { size: 1, closest: (x, y) => pickedClosest(x, y, c.meshOf), parts });
    expect(plain.lines.map((l) => [l.label, l.approx])).toEqual([
      ['최소 거리', true],
      ['부품 사이 최소 거리', true],
    ]);
    const m = measurePicked(a, b, {
      size: 1,
      closest: (x, y) => pickedClosest(x, y, c.meshOf),
      parts,
      refine: (x, y, r) => exactPicked(x, y, r, c.s, 30),
      refineParts: (x, y, r) => exactParts(x, y, r, c.s, 30),
    });
    expect(m.approx).toBe(false);
    expect(m.lines.map((l) => [l.label, l.approx])).toEqual([
      ['최소 거리', false],
      ['부품 사이 최소 거리', false],
    ]);
    expect(Math.abs(m.lines[0]!.value - 3)).toBeLessThan(1e-9);
    expect(Math.abs(d3(m.annotations[0]!.a, m.annotations[0]!.b!) - 3)).toBeLessThan(1e-9);
    // 다듬지 못하면(null) 그대로
    const no = measurePicked(a, b, { size: 1, closest: (x, y) => pickedClosest(x, y, c.meshOf), refine: () => null });
    expect([no.lines[0]!.approx, no.lines[0]!.value]).toEqual([true, plain.lines[0]!.value]);
  });
});
