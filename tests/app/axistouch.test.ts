/**
 * 축·잠근 선이 B-스플라인 모서리에 접하는 자리(app/curvesnap.ts intersectAxis — 24차 touchParam).
 * 접하는 자리에서는 두 접선이 나란해 가우스-뉴턴이 멈추고(직선과 곡선 사이가 매개변수 차의 제곱으로만 줄어든다), 멈춘 곳이 접점에서
 * 곡률 반지름의 약 1e-7배 비켜 있었다(합성 판 2.4e-7~4.1e-7 — 곡률 반지름 약 5.7만인 평평한 곡선이면 4.1e-3). 그 자리에서 곡선 접선이 직선과 나란한
 * 매개변수를 1차원 뉴턴으로 따로 풀어 접점의 발(직선 위)을 돌려준다. 기댓값은 식으로 따로 둔다.
 * - 접하는 세계 Y축(판의 가장 바깥 — 3u² + 10u − 6 = 0)과 여러 자리의 접선(축 이름 없는 잠근 선): 접점에 1e-11·1e-10 안, 축 위 정확히
 * - 평평한 B-스플라인의 접하는 X축: 접점(식 — 표본 격자 밖)에 1e-9 안
 * - 허용치 밖으로 비킨 선은 null, 허용치 안 틈은 접점의 발, 조금 안쪽으로 지나는 선(두 근)은 곡선 위 실제 교점 그대로(접점으로 바꾸지 않는다)
 * - 접점이 모서리 끝 바로 밖이면 null(끝점으로 당겨 받지 않는다), 다른 토막 둘레의 결과는 그대로
 */
import { describe, expect, it } from 'vitest';
import type { SnapAxis, SnapRefineInput, SnapSegment } from 'opencad-viewer3d';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { intersectAxis, toWorld } from '../../src/app/curvesnap';
import type { SnapEdgeIndex } from '../../src/app/snap';
import { StepText, type P3 } from '../stepText';
import { bsAt, bsTangentAt, curveStep, type V3 } from './curvescene';

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const addK = (a: readonly number[], b: readonly number[], k: number): V3 => [a[0]! + k * b[0]!, a[1]! + k * b[1]!, a[2]! + k * b[2]!];

interface Bs {
  mesh: Mesh3d;
  s0: number;
  poly: V3[];
  byId: Map<string, Mesh3d>;
  ex: SnapEdgeIndex;
}

/** 장면의 첫 B-스플라인 모서리와 그 꺾은선(세계) */
function bspline(bytes: Uint8Array): Bs {
  const s = stepToScene(bytes);
  const ex = stepEdgeIndex(s)!;
  for (const mesh of s.meshes) {
    const table = ex.tables[ex.tableOf.get(mesh.id)!]!;
    const E = mesh.edges!;
    for (let e = 0; e + 1 < table.segStart.length; e++) {
      if (ex.kinds[table.kinds[e]!] !== 'bspline') continue;
      const s0 = table.segStart[e]!;
      const s1 = table.segStart[e + 1]!;
      const poly: V3[] = [toWorld(mesh, E[s0 * 6]!, E[s0 * 6 + 1]!, E[s0 * 6 + 2]!)];
      for (let k = s0; k < s1; k++) poly.push(toWorld(mesh, E[k * 6 + 3]!, E[k * 6 + 4]!, E[k * 6 + 5]!));
      return { mesh, s0, poly, byId: new Map(s.meshes.map((m) => [m.id, m] as const)), ex };
    }
  }
  throw new Error('B-스플라인 모서리 없음');
}

/** 점 p에 가장 가까운 꺾은선 토막 */
function segNear(b: Bs, p: readonly number[]): number {
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k + 1 < b.poly.length; k++) {
    const a = b.poly[k]!;
    const u = [b.poly[k + 1]![0] - a[0], b.poly[k + 1]![1] - a[1], b.poly[k + 1]![2] - a[2]];
    const t = Math.min(1, Math.max(0, dot([p[0]! - a[0], p[1]! - a[1], p[2]! - a[2]], u) / dot(u, u)));
    const d = dist(addK(a, u, t), p);
    if (d < bd) [bd, best] = [d, k];
  }
  return best;
}

/** 코어 점(축 직선과 꺾은선 토막의 가장 가까운 두 점의 가운데 — 토막 범위 안, 나란하면 토막 가운데) */
function coreMid(o: V3, e: V3, a: V3, b: V3): V3 {
  const g = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const eg = dot(e, g);
  const gg = dot(g, g);
  const den = gg - eg * eg;
  const t = den > 1e-12 * gg ? Math.min(1, Math.max(0, (dot(g, w) - eg * dot(e, w)) / den)) : 0.5;
  const q = addK(a, g, t);
  const s = dot([q[0] - o[0], q[1] - o[1], q[2] - o[2]], e);
  return [0.5 * (q[0] + o[0] + s * e[0]), 0.5 * (q[1] + o[1] + s * e[1]), 0.5 * (q[2] + o[2] + s * e[2])];
}

/** 지나는 점 O·방향 dir의 직선이 토막 k(없으면 near에 가장 가까운 토막)와 만나는 코어 후보(open이면 직선 위에서 토막에 가장 가까운 점) */
function input(b: Bs, O: V3, dir: V3, near: readonly number[], axis?: SnapAxis, open = false, k = segNear(b, near)): SnapRefineInput {
  const sg: SnapSegment = { kind: 'edge', id: b.mesh.id, index: b.s0 + k, raw: b.s0 + k, ends: [b.poly[k]!, b.poly[k + 1]!] };
  let point = coreMid(O, dir, sg.ends[0], sg.ends[1]);
  if (open) point = addK(O, dir, dot([point[0] - O[0], point[1] - O[1], point[2] - O[2]], dir));
  return { kind: 'axisEdge', point, segment: sg, first: O, ray: { origin: [0, 0, 100], dir: [0, 0, -1] }, line: { origin: O, dir, ...(axis ? { axis } : {}) }, ...(open ? { open: true } : {}) };
}

const curves = bspline(curveStep());
/** 판 좌표 y가 가장 큰 자리(세계 x가 가장 작은 곳 — 접선이 세계 +Y): y′ ∝ 6 − 10u − 3u² = 0 */
const U_TOP = (-10 + Math.sqrt(172)) / 6;
const TOP = bsAt(U_TOP);

/**
 * 곡률 반지름 약 5.7만인 평평한 B-스플라인 판: (0,0) → (300,0) 위로 0.2쯤 부푼 3차 베지어(조절점 y 0, 0.3, 0.2, 0 — x = 300u) + 곧은 모서리 셋(z = 0).
 * 가장 높은 곳은 y′ ∝ 0.9u² − 2.4u + 0.9 = 0, u = (8 − √28)/6(표본 격자 밖)
 */
const U_FLAT = (8 - Math.sqrt(28)) / 6;
const FLAT_TOP: V3 = [300 * U_FLAT, 0.9 * U_FLAT * (1 - U_FLAT) ** 2 + 0.6 * U_FLAT ** 2 * (1 - U_FLAT), 0];
function flatStep(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const cp: P3[] = [
    [0, 0, 0],
    [100, 0.3, 0],
    [200, 0.2, 0],
    [300, 0, 0],
  ];
  const Q: P3 = [300, -4, 0];
  const R: P3 = [0, -4, 0];
  const V0 = w.vertex(cp[0]!);
  const V3v = w.vertex(cp[3]!);
  const VQ = w.vertex(Q);
  const VR = w.vertex(R);
  const bs = w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',3,(${cp.map((p) => `#${w.pt(p)}`).join(',')}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.`);
  const es = [w.edge(V0, V3v, bs), w.edge(V3v, VQ, w.line(cp[3]!, Q)), w.edge(VQ, VR, w.line(Q, R)), w.edge(VR, V0, w.line(R, cp[0]!))];
  const face = w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], w.plane([0, 0, 0], [0, 0, -1]));
  const shell = w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
  const p = w.product('flat-plate', [shell], mm, 'SHAPE_REPRESENTATION');
  const root = w.product('flat', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  w.place(root, p, w.ax2([0, 0, 0]), 'flat-1');
  return w.bytes('flat.stp');
}

/** 판 B-스플라인(curvescene)의 매개변수 0 → uEnd 부분만 모서리로 둔 판(끝 꼭짓점이 곡선 안쪽 점) — 나머지는 곧은 모서리로 닫는다 */
function trimmedStep(uEnd: number): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const cp: P3[] = [
    [0, 0, 0],
    [2, 6, 0],
    [9, 7, 0],
    [12, 0, 0],
  ];
  const b = [(1 - uEnd) ** 3, 3 * uEnd * (1 - uEnd) ** 2, 3 * uEnd * uEnd * (1 - uEnd), uEnd ** 3];
  const E: P3 = [0, 1, 2].map((k) => b.reduce((s, x, i) => s + x * cp[i]![k]!, 0)) as P3;
  const R: P3 = [0, -4, 0];
  const V0 = w.vertex(cp[0]!);
  const VE = w.vertex(E);
  const VR = w.vertex(R);
  const bs = w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',3,(${cp.map((p) => `#${w.pt(p)}`).join(',')}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.`);
  const es = [w.edge(V0, VE, bs), w.edge(VE, VR, w.line(E, R)), w.edge(VR, V0, w.line(R, cp[0]!))];
  const face = w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], w.plane([0, 0, 0], [0, 0, -1]));
  const shell = w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
  const p = w.product('trim-plate', [shell], mm, 'SHAPE_REPRESENTATION');
  const root = w.product('trim', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  w.place(root, p, w.ax2([-20, -30, 0], [0, 0, 1], [0, 1, 0]), 'trim-1');
  return w.bytes('trim.stp');
}

describe('축·잠근 선이 B-스플라인 모서리에 접하는 자리(intersectAxis — 접점 따로 풀기)', () => {
  it('판의 가장 바깥에 접하는 세계 Y축: 접점에 1e-11 안, 축 위 정확히(닫힌·열린 후보 모두)', () => {
    const O: V3 = [TOP[0], -45, 0];
    for (const open of [false, true]) {
      const q = intersectAxis(input(curves, O, [0, 1, 0], TOP, 'y', open), curves.byId, curves.ex);
      expect(q, `열린 후보 ${open}`).toBeTruthy();
      expect(dist(q!, TOP)).toBeLessThan(1e-11);
      expect(q![0]).toBe(O[0]);
      expect(q![2]).toBe(O[2]);
    }
  });

  it('여러 자리의 접선(축 이름 없는 잠근 선): 접점에 1e-10 안, 직선 위', () => {
    for (const u of [0.13, 0.37, U_TOP, 0.64, 0.81, 0.93]) {
      const X = bsAt(u);
      const d = bsTangentAt(u);
      const O = addK(X, d, -15);
      const q = intersectAxis(input(curves, O, d, X), curves.byId, curves.ex);
      expect(q, `u ${u}`).toBeTruthy();
      expect(dist(q!, X), `u ${u}`).toBeLessThan(1e-10);
      const s = dot([q![0] - O[0], q![1] - O[1], q![2] - O[2]], d);
      expect(dist(q!, addK(O, d, s))).toBeLessThan(1e-12);
    }
  });

  it('곡률 반지름 약 5.7만인 평평한 B-스플라인의 접하는 X축: 접점에 1e-9 안(반복이 멈춘 자리는 1e-3쯤 비켜 있었다)', () => {
    const flat = bspline(flatStep());
    const T = FLAT_TOP;
    const O: V3 = [-20, T[1], 0];
    for (const open of [false, true]) {
      const q = intersectAxis(input(flat, O, [1, 0, 0], T, 'x', open), flat.byId, flat.ex);
      expect(q, `열린 후보 ${open}`).toBeTruthy();
      expect(dist(q!, T)).toBeLessThan(1e-9);
      expect([q![1], q![2]]).toEqual([O[1], O[2]]);
    }
  });

  it('허용치 밖으로 비킨 접선은 null, 허용치 안 틈(1e-7)은 접점을 직선에 내린 발', () => {
    const n: V3 = [-1, 0, 0];
    expect(intersectAxis(input(curves, [TOP[0] - 1e-3, -45, 0], [0, 1, 0], TOP, 'y'), curves.byId, curves.ex)).toBeNull();
    const O: V3 = [TOP[0] - 1e-7, -45, 0];
    const q = intersectAxis(input(curves, O, [0, 1, 0], TOP, 'y'), curves.byId, curves.ex);
    expect(q).toBeTruthy();
    expect(dist(q!, addK(TOP, n, 1e-7))).toBeLessThan(1e-11);
    expect(q![0]).toBe(O[0]);
  });

  it('조금 안쪽으로 지나는 축(두 근)은 곡선 위 실제 교점 그대로 — 접점으로 바꾸지 않는다', () => {
    const x = TOP[0] + 1e-6;
    // 판 좌표 y(u) = −20 − x를 푸는 두 근(접점 양쪽 — 반 나눔)
    const yAt = (u: number): number => -20 - bsAt(u)[0];
    const want = -20 - x;
    const root = (a: number, b: number): number => {
      for (let i = 0; i < 200; i++) {
        const m = 0.5 * (a + b);
        if ((yAt(m) - want) * (yAt(a) - want) <= 0) b = m;
        else a = m;
      }
      return 0.5 * (a + b);
    };
    const roots = [root(U_TOP - 0.05, U_TOP), root(U_TOP, U_TOP + 0.05)].map(bsAt);
    expect(dist(roots[0]!, roots[1]!)).toBeGreaterThan(1e-4);
    for (const near of roots) {
      const q = intersectAxis(input(curves, [x, -45, 0], [0, 1, 0], near, 'y'), curves.byId, curves.ex);
      expect(q).toBeTruthy();
      expect(Math.min(...roots.map((r) => Math.abs(q![1] - r[1])))).toBeLessThan(1e-9);
      expect(dist(q!, TOP)).toBeGreaterThan(1e-5);
    }
  });

  it('접점이 모서리 끝 바로 밖(매개변수 0.004 — 틈 약 1e-4)이면 null, 모서리 안이면 그 접점', () => {
    const cut = bspline(trimmedStep(U_TOP - 0.004));
    const last = cut.poly.length - 2;
    const O: V3 = [TOP[0], -45, 0];
    expect(intersectAxis(input(cut, O, [0, 1, 0], TOP, 'y', false, last), cut.byId, cut.ex)).toBeNull();
    expect(intersectAxis(input(cut, O, [0, 1, 0], TOP, 'y', true, last), cut.byId, cut.ex)).toBeNull();
    const whole = bspline(trimmedStep(U_TOP + 0.05));
    const q = intersectAxis(input(whole, O, [0, 1, 0], TOP, 'y'), whole.byId, whole.ex);
    expect(q).toBeTruthy();
    expect(dist(q!, TOP)).toBeLessThan(1e-11);
  });
});
