/**
 * 코어 0.18.0 다듬기(app/curvesnap.ts — 순수 계산): 축과 선분의 교차('axisEdge')를 축 직선과 B-rep 모서리 곡선의 교차로.
 * 기댓값은 시험 장면(crossscene.ts·curvescene.ts)을 지을 때 정한 점(정수 좌표·식)으로 따로 둔다.
 * - 원(평면 위 축 — 이차식의 두 교점, 평면을 지나는 축 — 원 평면 위 점), 곧은 모서리, 타원(평면 위·평면을 지나는 축), B-스플라인(반복 — 같은 평면·자리 변환 거친 판) — 1e-12
 * - 돌려준 점은 축 직선 위다(세계 축이면 지나는 점과 남은 두 좌표가 정확히 같다)
 * - 비켜 지나가는 축·호 범위 밖·축이 지나는 점(곡선 위 첫 점) 자리는 null(또는 다른 교점), 결과는 커서 광선·첫 점과 상관없다
 */
import { describe, expect, it } from 'vitest';
import type { SnapAxis, SnapRefineInput, SnapSegment } from 'opencad-viewer3d';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { intersectAxis, refineSnap, toWorld } from '../../src/app/curvesnap';
import type { SnapEdgeIndex } from '../../src/app/snap';
import { crossStep, LINE_X, RIM_H, RIM_R, RING_C, RING_N, RING_R, SPL_X } from './crossscene';
import { bsAt, curveStep, ELL_C, ELL_T0, ELL_T1, ellAt, type V3 } from './curvescene';

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-12): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
const AXES: Record<SnapAxis, V3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

interface EdgeRef {
  mesh: Mesh3d;
  e: number;
  kind: string;
  s0: number;
  poly: V3[];
}

function edgesOf(meshes: readonly Mesh3d[], ex: SnapEdgeIndex): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (const mesh of meshes) {
    const table = ex.tables[ex.tableOf.get(mesh.id)!]!;
    const E = mesh.edges!;
    for (let e = 0; e + 1 < table.segStart.length; e++) {
      const s0 = table.segStart[e]!;
      const s1 = table.segStart[e + 1]!;
      const poly: V3[] = [toWorld(mesh, E[s0 * 6]!, E[s0 * 6 + 1]!, E[s0 * 6 + 2]!)];
      for (let s = s0; s < s1; s++) poly.push(toWorld(mesh, E[s * 6 + 3]!, E[s * 6 + 4]!, E[s * 6 + 5]!));
      out.push({ mesh, e, kind: ex.kinds[table.kinds[e]!]!, s0, poly });
    }
  }
  return out;
}

const segDist = (a: V3, b: V3, p: readonly number[]): number => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const t = Math.min(1, Math.max(0, ((p[0]! - a[0]) * u[0]! + (p[1]! - a[1]) * u[1]! + (p[2]! - a[2]) * u[2]!) / (u[0]! ** 2 + u[1]! ** 2 + u[2]! ** 2)));
  return dist([a[0] + t * u[0]!, a[1] + t * u[1]!, a[2] + t * u[2]!], p);
};

/** 점 p에 가장 가까운 모서리(종류 kind, 고르면 그 그물만)의 가장 가까운 토막 */
function edgeNear(edges: readonly EdgeRef[], p: readonly number[], kind: string, keep: (r: EdgeRef) => boolean = () => true): { ref: EdgeRef; k: number } {
  let best: { ref: EdgeRef; k: number; d: number } | null = null;
  for (const ref of edges) {
    if (ref.kind !== kind || !keep(ref)) continue;
    for (let k = 0; k + 1 < ref.poly.length; k++) {
      const d = segDist(ref.poly[k]!, ref.poly[k + 1]!, p);
      if (!best || d < best.d) best = { ref, k, d };
    }
  }
  expect(best, `${kind} 모서리`).toBeTruthy();
  return best!;
}

const segOf = (ref: EdgeRef, k: number): SnapSegment => ({ kind: 'edge', id: ref.mesh.id, index: ref.s0 + k, raw: ref.s0 + k, ends: [ref.poly[k]!, ref.poly[k + 1]!] });

/** 코어 점(0.18.0 crossEdges의 c.m): 축 직선과 꺾은선 토막(범위 안)의 가장 가까운 두 점의 가운데 */
function coreMid(o: V3, e: V3, a: V3, b: V3): V3 {
  const g = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const eg = e[0] * g[0]! + e[1] * g[1]! + e[2] * g[2]!;
  const gg = g[0]! ** 2 + g[1]! ** 2 + g[2]! ** 2;
  const ew = e[0] * w[0]! + e[1] * w[1]! + e[2] * w[2]!;
  const gw = g[0]! * w[0]! + g[1]! * w[1]! + g[2]! * w[2]!;
  const t = Math.min(1, Math.max(0, (gw - eg * ew) / (gg - eg * eg)));
  const q: V3 = [a[0] + t * g[0]!, a[1] + t * g[1]!, a[2] + t * g[2]!];
  const s = (q[0] - o[0]) * e[0] + (q[1] - o[1]) * e[1] + (q[2] - o[2]) * e[2];
  return [0.5 * (q[0] + o[0] + s * e[0]), 0.5 * (q[1] + o[1] + s * e[1]), 0.5 * (q[2] + o[2] + s * e[2])];
}

/** 축과 선분의 교차 다듬기 입력: 지나는 점 origin의 axis 축이 토막(near 둘레)과 만나는 코어 점 */
function axisInput(t: { ref: EdgeRef; k: number }, origin: V3, axis: SnapAxis, first: V3 | null = origin): SnapRefineInput {
  const sg = segOf(t.ref, t.k);
  const dir = AXES[axis];
  return { kind: 'axisEdge', point: coreMid(origin, dir, sg.ends[0], sg.ends[1]), segment: sg, first, ray: { origin: [0, 0, 100], dir: [0, 0, -1] }, line: { origin, dir, axis } };
}

/** 받은 점이 축 직선 위인지: 세계 축이면 남은 두 좌표가 지나는 점과 정확히 같다 */
function onAxis(q: readonly number[] | null, origin: V3, axis: SnapAxis): void {
  const i = 'xyz'.indexOf(axis);
  for (let k = 0; k < 3; k++) if (k !== i) expect(q![k], `축 ${axis} 위`).toBe(origin[k]);
}

const cross = stepToScene(crossStep());
const cx = stepEdgeIndex(cross)!;
const cById = new Map(cross.meshes.map((m) => [m.id, m] as const));
const cEdges = edgesOf(cross.meshes, cx);
const isRim = (r: EdgeRef): boolean => r.poly[0]![2] === RIM_H && Math.abs(Math.hypot(r.poly[0]![0], r.poly[0]![1]) - RIM_R) < 1e-5;
const isRing = (r: EdgeRef): boolean => Math.abs(dist(r.poly[0]!, RING_C) - RING_R) < 1e-5;

const curves = stepToScene(curveStep());
const vx = stepEdgeIndex(curves)!;
const vById = new Map(curves.meshes.map((m) => [m.id, m] as const));
const vEdges = edgesOf(curves.meshes, vx);

describe("축과 모서리 곡선의 교차 다듬기(intersectAxis — 코어 0.18.0 'axisEdge')", () => {
  it('원 평면 위의 X축(원기둥 윗 테두리): 이차식의 두 교점 (±8, 6, 20) 가운데 코어 점에 가까운 것, 축 위 정확히', () => {
    const O: V3 = [-30, 6, RIM_H];
    for (const X of [[8, 6, RIM_H], [-8, 6, RIM_H]] as V3[]) {
      const rim = edgeNear(cEdges, X, 'circle', isRim);
      const c = axisInput(rim, O, 'x');
      // 코어 점(꺾은선 현 위)은 원 안쪽으로 비켜 있다
      expect(dist(c.point, X)).toBeGreaterThan(1e-3);
      const q = intersectAxis(c, cById, cx);
      close(q, X);
      onAxis(q, O, 'x');
      expect(refineSnap(c, cById, cx)).toEqual(q);
    }
  });

  it('원 평면을 지나는 X·Y축(세로 원판 테두리): 원 위 점 (8.8, −6.6, 23), 원 평면 위의 Z축은 (8.8, −6.6, 23)·(8.8, −6.6, 17)', () => {
    const X: V3 = [8.8, -6.6, 23];
    expect(Math.abs(dist(X, RING_C) - RING_R)).toBeLessThan(1e-14);
    expect(Math.abs(RING_N[0] * (X[0] - RING_C[0]) + RING_N[1] * (X[1] - RING_C[1]))).toBeLessThan(1e-14);
    const ring = edgeNear(cEdges, X, 'circle', isRing);
    for (const [O, axis] of [
      [[0, -6.6, 23], 'x'],
      [[8.8, 5, 23], 'y'],
      [[8.8, -6.6, 0], 'z'],
    ] as [V3, SnapAxis][]) {
      const q = intersectAxis(axisInput(ring, O, axis), cById, cx);
      close(q, X);
      onAxis(q, O, axis);
    }
    const Y: V3 = [8.8, -6.6, 17];
    const q = intersectAxis(axisInput(edgeNear(cEdges, Y, 'circle', isRing), [8.8, -6.6, 40], 'z'), cById, cx);
    close(q, Y);
  });

  it('곧은 모서리(삼각 판 빗변): X축이 (6, −8, 20)에서 만난다 — 축 위 정확히', () => {
    const line = edgeNear(cEdges, LINE_X, 'line');
    const O: V3 = [-5, -8, 20];
    const q = intersectAxis(axisInput(line, O, 'x'), cById, cx);
    close(q, LINE_X);
    onAxis(q, O, 'x');
  });

  it('타원 호(틀 30°, π/6 → π): 평면 위 X축은 각 2π/3 자리, 평면을 지나는 Z축은 그 자리 그대로, 호 밖이면 null', () => {
    for (const t of [(2 * Math.PI) / 3, 0.3 * Math.PI, 0.9 * Math.PI]) {
      const E = ellAt(t);
      const ell = edgeNear(vEdges, E, 'ellipse');
      const OX: V3 = [E[0] - 30, E[1], E[2]];
      const q = intersectAxis(axisInput(ell, OX, 'x'), vById, vx);
      close(q, E, 1e-11);
      onAxis(q, OX, 'x');
      const OZ: V3 = [E[0], E[1], 7];
      const z = intersectAxis(axisInput(ell, OZ, 'z'), vById, vx);
      close(z, E, 1e-11);
      onAxis(z, OZ, 'z');
    }
    // 타원 위지만 호 밖(각 −π/2): 가장 가까운 토막을 줘도 없다
    const G = ellAt(-Math.PI / 2);
    expect(ELL_T0 > -Math.PI / 2 && ELL_T1 < (3 * Math.PI) / 2).toBe(true);
    expect(intersectAxis(axisInput(edgeNear(vEdges, G, 'ellipse'), [G[0], G[1], 5], 'z'), vById, vx)).toBeNull();
    expect(ELL_C[2]).toBe(0);
  });

  it('B-스플라인(반복): x = 0 평면 베지어와 Y축(같은 평면)·X축(평면을 지난다) — (0, −10, 20), 자리 변환을 거친 판은 Z축이 bsAt(0.37)', () => {
    const spl = edgeNear(cEdges, SPL_X, 'bspline');
    for (const [O, axis] of [
      [[0, 5, 20], 'y'],
      [[-7, -10, 20], 'x'],
    ] as [V3, SnapAxis][]) {
      const q = intersectAxis(axisInput(spl, O, axis), cById, cx);
      close(q, SPL_X, 1e-11);
      onAxis(q, O, axis);
    }
    for (const u of [0.37, 0.81]) {
      const B = bsAt(u);
      const bs = edgeNear(vEdges, B, 'bspline');
      const OZ: V3 = [B[0], B[1], 9];
      const q = intersectAxis(axisInput(bs, OZ, 'z'), vById, vx);
      close(q, B, 1e-11);
      onAxis(q, OZ, 'z');
      // 같은 평면(z = 0)의 X축: 판 좌표 x가 늘기만 해 한 번 만난다
      const OX: V3 = [B[0] - 40, B[1], 0];
      close(intersectAxis(axisInput(bs, OX, 'x'), vById, vx), B, 1e-11);
    }
  });

  it('비켜 지나가는 축은 null: 원 평면에서 0.5 뜬 X축, 원 밖에서 원 평면을 지나는 X축, 빗변에서 0.3 뜬 X축', () => {
    expect(intersectAxis(axisInput(edgeNear(cEdges, [8, 6, RIM_H], 'circle', isRim), [-30, 6, RIM_H + 0.5], 'x'), cById, cx)).toBeNull();
    expect(intersectAxis(axisInput(edgeNear(cEdges, [8.8, -6.6, 23], 'circle', isRing), [0, -6.6, 23.2], 'x'), cById, cx)).toBeNull();
    expect(intersectAxis(axisInput(edgeNear(cEdges, LINE_X, 'line'), [-5, -8, 20.3], 'x'), cById, cx)).toBeNull();
  });

  it('축이 지나는 점(곡선 위 첫 점) 자리는 빼고 다른 교점, 결과는 커서 광선·첫 점과 상관없다, 축 직선이 없으면 null', () => {
    const F: V3 = [8, 6, RIM_H];
    const back = edgeNear(cEdges, [-8, 6, RIM_H], 'circle', isRim);
    close(intersectAxis(axisInput(back, F, 'x'), cById, cx), [-8, 6, RIM_H]);
    const here = intersectAxis(axisInput(edgeNear(cEdges, F, 'circle', isRim), F, 'x'), cById, cx);
    expect(here === null || dist(here, F) > 1).toBe(true);
    const c = axisInput(back, [-30, 6, RIM_H], 'x', null);
    const a = intersectAxis(c, cById, cx);
    expect(intersectAxis({ ...c, first: [1, 2, 3], ray: { origin: [50, -50, 50], dir: [-0.6, 0.6, -0.52915026] } }, cById, cx)).toEqual(a);
    const { line: _line, ...noLine } = c;
    expect(refineSnap(noLine, cById, cx)).toBeNull();
    // 'onEdge'처럼 풀지 않는다(축과 상관없는 곡선 위 점이 아니다)
    expect(refineSnap({ ...c, kind: 'onEdge' }, cById, cx)).not.toEqual(a);
  });

  it('코어 0.20.0: 축 이름 없는 직선(잠근 방향 — line.axis 없음)과 열린 후보(open — 직선 위에서 토막에 가장 가까운 점)도 같은 계산, 직선 위·곡선 위', () => {
    const d = (v: V3): V3 => {
      const l = Math.hypot(...v);
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    // 세로 원판 테두리 위 점을 비스듬히 지나는 직선, 원기둥 테두리 평면 위의 비스듬한 직선(두 교점 가운데 코어 점에 가까운 것), 타원 호를 지나는 직선
    const E = ellAt((2 * Math.PI) / 3);
    for (const [X, dir, edges, kind, keep, id, ex] of [
      [[8.8, -6.6, 23], d([1, 0.5, -0.3]), cEdges, 'circle', isRing, cById, cx],
      [[8, 6, RIM_H], d([1, 0.2, 0]), cEdges, 'circle', isRim, cById, cx],
      [E, d([0.4, -1, 0.7]), vEdges, 'ellipse', () => true, vById, vx],
    ] as [V3, V3, EdgeRef[], string, (r: EdgeRef) => boolean, typeof cById, SnapEdgeIndex][]) {
      const O: V3 = [X[0] - 7 * dir[0], X[1] - 7 * dir[1], X[2] - 7 * dir[2]];
      const t = edgeNear(edges, X, kind, keep);
      const sg = segOf(t.ref, t.k);
      const point = coreMid(O, dir, sg.ends[0], sg.ends[1]);
      const c: SnapRefineInput = { kind: 'axisEdge', point, segment: sg, first: O, ray: { origin: [0, 0, 100], dir: [0, 0, -1] }, line: { origin: O, dir } };
      const q = intersectAxis(c, id, ex);
      close(q, X, 1e-11);
      // 직선 위(지나는 점에서 방향으로 잰 자리)
      const s = (q![0] - O[0]) * dir[0] + (q![1] - O[1]) * dir[1] + (q![2] - O[2]) * dir[2];
      close(q, [O[0] + s * dir[0], O[1] + s * dir[1], O[2] + s * dir[2]], 1e-12);
      // 열린 후보: point는 직선 위에서 토막에 가장 가까운 점(커서와 상관없다) — 같은 답
      const along = (point[0] - O[0]) * dir[0] + (point[1] - O[1]) * dir[1] + (point[2] - O[2]) * dir[2];
      const onLine: V3 = [O[0] + along * dir[0], O[1] + along * dir[1], O[2] + along * dir[2]];
      expect(intersectAxis({ ...c, point: onLine, open: true }, id, ex)).toEqual(q);
      expect(refineSnap({ ...c, open: true }, id, ex)).toEqual(q);
    }
  });
});
