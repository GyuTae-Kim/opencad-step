/**
 * 코어 0.15.0 다듬기(app/curvesnap.ts — 순수 계산): 교차점('intersection')을 두 B-rep 모서리 곡선의 3D 교차점으로, 열린 수직 발(open)을 곡선 위 발로.
 * 기댓값은 시험 장면(crossscene.ts)을 지을 때 정한 점(정수 좌표·식)으로 따로 둔다.
 * - 곧은 모서리 × 원(식), 다른 평면의 원 × 원(식), 원 × B-스플라인(가우스-뉴턴) — 1e-9
 * - 같은 평면의 곧은 모서리 × 원(이차식), 비켜 지나가는 둘·같은 모서리·함께 쓰는 꼭짓점·두 곧은 모서리는 null
 * - 결과는 두 토막·코어 점으로만 정해진다(커서 광선·첫 점이 달라도 같다), 'intersection'을 한 곡선 위 점으로 풀지 않는다
 * - 멀리 떨어진 첫 점: 꺾은선 토막에 내린 발이 모두 토막 밖이어도 열린 후보(토막 끝)에서 원 위 발과 거리가 정확하다
 */
import { describe, expect, it } from 'vitest';
import type { SnapRefineInput, SnapSegment } from 'opencad-viewer3d';
import { looseIntersection, openFoot, perpendicularFoot, segmentIntersection } from 'opencad-viewer3d/inference';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToScene, type StepEdgeTable } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { intersectEdges, refineSnap, toWorld } from '../../src/app/curvesnap';
import type { SnapEdgeIndex } from '../../src/app/snap';
import { StepText } from '../stepText';
import { crossStep, FAR, FAR_FOOT, LINE_X, RIM_H, RIM_R, RING_C, RING_R, RING_X, SPL_CP, SPL_U, SPL_X, splAt } from './crossscene';
import type { V3 } from './curvescene';

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};

/** 장면의 모서리 하나: 그물·표·번호·종류와 세계 꺾은선 */
interface EdgeRef {
  mesh: Mesh3d;
  table: StepEdgeTable;
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
      out.push({ mesh, table, e, kind: ex.kinds[table.kinds[e]!]!, s0, poly });
    }
  }
  return out;
}

/** 꺾은선 토막 k와 점 p 사이 거리 */
const segDist = (a: V3, b: V3, p: readonly number[]): number => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const t = Math.min(1, Math.max(0, ((p[0]! - a[0]) * u[0]! + (p[1]! - a[1]) * u[1]! + (p[2]! - a[2]) * u[2]!) / (u[0]! ** 2 + u[1]! ** 2 + u[2]! ** 2)));
  return dist([a[0] + t * u[0]!, a[1] + t * u[1]!, a[2] + t * u[2]!], p);
};

/** 모서리 ref에서 점 p에 가장 가까운 토막 */
function segNear(ref: EdgeRef, p: readonly number[]): { ref: EdgeRef; k: number; d: number } {
  let best = { ref, k: 0, d: Infinity };
  for (let k = 0; k + 1 < ref.poly.length; k++) {
    const d = segDist(ref.poly[k]!, ref.poly[k + 1]!, p);
    if (d < best.d) best = { ref, k, d };
  }
  return best;
}

/** 점 p에 가장 가까운 모서리(종류 kind)의 가장 가까운 토막 */
function edgeNear(edges: readonly EdgeRef[], p: readonly number[], kind: string): { ref: EdgeRef; k: number } {
  let best: { ref: EdgeRef; k: number; d: number } | null = null;
  for (const ref of edges) {
    if (ref.kind !== kind) continue;
    const s = segNear(ref, p);
    if (!best || s.d < best.d) best = s;
  }
  expect(best, `${kind} 모서리`).toBeTruthy();
  return best!;
}

const segOf = (ref: EdgeRef, k: number): SnapSegment => ({ kind: 'edge', id: ref.mesh.id, index: ref.s0 + k, raw: ref.s0 + k, ends: [ref.poly[k]!, ref.poly[k + 1]!] });

/**
 * 두 토막의 교차점 다듬기 입력: 꺾은선끼리 만나면 코어 교차점(segmentIntersection), 조금 비켜 지나가면 넓힌 교차(looseIntersection —
 * 가장 가까운 두 점의 가운데, open)
 */
function crossInput(a: { ref: EdgeRef; k: number }, b: { ref: EdgeRef; k: number }, ray: { origin: V3; dir: V3 } = { origin: [0, 0, 100], dir: [0, 0, -1] }): SnapRefineInput {
  const sa = segOf(a.ref, a.k);
  const sb = segOf(b.ref, b.k);
  const x = segmentIntersection(sa.ends[0], sa.ends[1], sb.ends[0], sb.ends[1], 1e-9);
  if (x) return { kind: 'intersection', point: x, segment: sa, other: sb, first: null, ray };
  const m = looseIntersection(sa.ends[0], sa.ends[1], sb.ends[0], sb.ends[1], 1e-12, 10);
  expect(m, '두 토막이 가까이 지나간다').toBeTruthy();
  return { kind: 'intersection', point: m!, segment: sa, other: sb, first: null, ray, open: true };
}

const scene = stepToScene(crossStep());
const ex = stepEdgeIndex(scene)!;
const byId = new Map(scene.meshes.map((m) => [m.id, m] as const));
const edges = edgesOf(scene.meshes, ex);
/** 원기둥 윗 테두리 원(높이 20, 반지름 10)과 세로 원판 테두리(중심 RING_C) */
const RIM = edges.find((r) => r.kind === 'circle' && r.poly[0]![2] === RIM_H && Math.abs(Math.hypot(r.poly[0]![0], r.poly[0]![1]) - RIM_R) < 1e-5)!;
const RING = edges.find((r) => r.kind === 'circle' && Math.abs(dist(r.poly[0]!, RING_C) - RING_R) < 1e-5)!;
const rimAt = (p: readonly number[]) => segNear(RIM, p);

describe('교차점 다듬기(intersectEdges — 두 모서리 곡선의 3D 교차)', () => {
  it('시험 장면: 세 교차점은 원 위이고 테두리 꺾은선(현)은 그 점을 비켜 지나간다(코어 교차점이 아니라 넓힌 교차)', () => {
    expect(RIM && RING).toBeTruthy();
    for (const X of [LINE_X, RING_X, SPL_X]) expect(Math.abs(Math.hypot(X[0], X[1]) - RIM_R)).toBe(0);
    expect(dist(RING_X, RING_C)).toBe(RING_R);
    expect(dist(splAt(SPL_U), SPL_X)).toBeLessThan(1e-14);
    // 교차점은 꺾은선 꼭짓점이 아니다(그러면 꼭짓점 붙잡기가 맡는다)
    for (const ref of edges) for (const p of ref.poly) for (const X of [LINE_X, RING_X, SPL_X]) expect(dist(p, X)).toBeGreaterThan(0.05);
    const rim = rimAt(LINE_X);
    expect(rim.ref.poly).toHaveLength(51);
    expect(segDist(rim.ref.poly[rim.k]!, rim.ref.poly[rim.k + 1]!, LINE_X)).toBeGreaterThan(1e-3);
  });

  it('곧은 모서리 × 원(식 — 직선이 원 평면을 지나는 점): (6, −8, 20) 1e-9, 토막 차례를 바꿔도 같다', () => {
    const line = edgeNear(edges, LINE_X, 'line');
    const rim = rimAt(LINE_X);
    const c = crossInput(line, rim);
    close(intersectEdges(c, byId, ex), LINE_X, 1e-12);
    close(refineSnap(crossInput(rim, line), byId, ex), LINE_X, 1e-12);
  });

  it('원 × 원(식 — 다른 평면: 두 평면이 만나는 직선과 원): (8, −6, 20) 1e-9', () => {
    const rim = rimAt(RING_X);
    const ring = segNear(RING, RING_X);
    expect(ring.ref.mesh.id).not.toBe(rim.ref.mesh.id);
    close(refineSnap(crossInput(rim, ring), byId, ex), RING_X, 1e-12);
    close(refineSnap(crossInput(ring, rim), byId, ex), RING_X, 1e-12);
  });

  it('원 × B-스플라인(가우스-뉴턴 — 커서 둘레 표본에서 거리의 극소로 시작): (0, −10, 20) 1e-9', () => {
    const rim = rimAt(SPL_X);
    const spl = edgeNear(edges, SPL_X, 'bspline');
    close(refineSnap(crossInput(rim, spl), byId, ex), SPL_X, 1e-12);
    close(refineSnap(crossInput(spl, rim), byId, ex), SPL_X, 1e-12);
  });

  it('결과는 두 토막과 코어 점으로만 정해진다(커서 광선·첫 점·열린 후보 표시가 달라도 같다)', () => {
    const c = crossInput(rimAt(SPL_X), edgeNear(edges, SPL_X, 'bspline'));
    const a = refineSnap(c, byId, ex);
    expect(refineSnap({ ...c, ray: { origin: [50, -50, 50], dir: [-0.6, 0.6, -0.52915026] }, first: FAR }, byId, ex)).toEqual(a);
    const { open: _open, ...closed } = c;
    expect(refineSnap(closed, byId, ex)).toEqual(a);
  });

  it("'intersection'을 한 곡선 위 점으로 풀지 않는다: 둘째 토막이 없으면 null, 모르는 종류도 null", () => {
    const c = crossInput(rimAt(SPL_X), edgeNear(edges, SPL_X, 'bspline'));
    const { other: _o, ...one } = c;
    expect(refineSnap(one, byId, ex)).toBeNull();
    expect(refineSnap({ ...c, kind: 'tangent' as never }, byId, ex)).toBeNull();
    // 같은 토막을 모서리 위 점으로 물으면 곡선 위 점(커서 광선에 가장 가까운) — 교차점과 다르다
    const onEdge = refineSnap({ ...one, kind: 'onEdge', ray: { origin: [1.5, -9, 100], dir: [0, 0, -1] } }, byId, ex);
    expect(onEdge).toBeTruthy();
    expect(dist(onEdge!, SPL_X)).toBeGreaterThan(0.1);
  });

  it('같은 모서리·함께 쓰는 꼭짓점에서 만나는 두 모서리·두 곧은 모서리·비켜 지나가는 두 곡선은 null', () => {
    // 같은 모서리(테두리 원의 이웃 두 토막)
    const rim = rimAt(SPL_X);
    const same: SnapRefineInput = { ...crossInput(rim, edgeNear(edges, SPL_X, 'bspline')), other: segOf(rim.ref, rim.k + 2) };
    expect(refineSnap(same, byId, ex)).toBeNull();
    // B-스플라인과 그 판의 곧은 모서리(P3 → Q)는 P3에서 만난다(끝점 붙잡기가 맡는다)
    const spl = edgeNear(edges, SPL_CP[3]!, 'bspline');
    const lineQ = edgeNear(edges, [0, -20, 28], 'line');
    expect(spl.k).toBe(spl.ref.poly.length - 2);
    const atP3: SnapRefineInput = { kind: 'intersection', point: SPL_CP[3]!, segment: segOf(spl.ref, spl.k), other: segOf(lineQ.ref, lineQ.k), first: null, ray: { origin: [0, 0, 0], dir: [1, 0, 0] } };
    expect(refineSnap(atP3, byId, ex)).toBeNull();
    // 두 곧은 모서리(삼각 판 빗변과 밑변): 꺾은선이 곧 모서리
    const tri = edges.filter((r) => r.kind === 'line' && r.mesh.id === edgeNear(edges, LINE_X, 'line').ref.mesh.id);
    const tl: SnapRefineInput = { ...atP3, point: tri[0]!.poly[0]!, segment: segOf(tri[0]!, 0), other: segOf(tri[2]!, 0) };
    expect(refineSnap(tl, byId, ex)).toBeNull();
    // 세로 원판 테두리와 B-스플라인: 3D로 만나지 않는다
    const ring = segNear(RING, RING_X);
    const far: SnapRefineInput = { ...atP3, point: [0, -8, 20], segment: segOf(ring.ref, ring.k), other: segOf(spl.ref, 8) };
    expect(refineSnap(far, byId, ex)).toBeNull();
  });
});

describe('같은 평면의 곧은 모서리 × 원과 비켜 지나가는 것(합성 작은 장면)', () => {
  // 바닥 원판(반지름 10, z = 0)과 같은 평면의 삼각 판 둘 — 하나는 밑변이 원을 (±√96, 2, 0)에서 가로지르고, 하나는 원에서 0.001 떨어져 지나간다.
  // 세로 삼각 판 둘 — 하나는 원 평면을 원 위 (−6, −8, 0)에서, 하나는 원에서 0.001 밖 (10.001, 0, 0)에서 지난다
  const w = new StepText();
  const mm = w.context('mm');
  const model = (face: number): number => w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
  const tri = (name: string, p: V3[], z: V3): { pd: number; rep: number; origin: number } => {
    const V = p.map((q) => w.vertex(q));
    const es = p.map((q, i) => w.edge(V[i]!, V[(i + 1) % 3]!, w.line(q, p[(i + 1) % 3]!)));
    return w.product(name, [model(w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], w.plane(p[0]!, z)))], mm, 'SHAPE_REPRESENTATION');
  };
  const V0 = w.vertex([10, 0, 0]);
  const disc = w.face([w.bound(w.loop([w.oe(w.edge(V0, V0, w.circle([0, 0, 0], 10)), true)]))], w.plane([0, 0, 0]));
  const parts = [
    w.product('disc', [model(disc)], mm, 'SHAPE_REPRESENTATION'),
    tri('chord', [[-14, 2, 0], [14, 2, 0], [0, 16, 0]], [0, 0, 1]),
    tri('miss', [[-3, 10.001, 0], [3, 10.001, 0], [0, 14, 0]], [0, 0, 1]),
    tri('pierce', [[-3, -4, -10], [-9, -12, 10], [-9, -12, -10]], [0.8, -0.6, 0]),
    tri('graze', [[10.001, 0, -5], [10.001, 0, 5], [16, 0, 5]], [0, 1, 0]),
  ];
  const root = w.product('flat', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  parts.forEach((p, i) => w.place(root, p, w.ax2([0, 0, 0]), `p-${i}`));
  const flat = stepToScene(w.bytes('flat.stp'));
  const fx = stepEdgeIndex(flat)!;
  const fById = new Map(flat.meshes.map((m) => [m.id, m] as const));
  const fe = edgesOf(flat.meshes, fx);
  const at = (p: V3, q: V3): SnapRefineInput => crossInput(edgeNear(fe, p, 'circle'), edgeNear(fe, q, 'line'));

  it('원 평면 위 곧은 모서리: 평면 안 두 교점 가운데 코어 점에 가까운 것(1e-9)', () => {
    const r = Math.sqrt(96);
    close(refineSnap(at([r, 2, 0], [r, 2, 0]), fById, fx), [r, 2, 0], 1e-12);
    close(refineSnap(at([-r, 2, 0], [-r, 2, 0]), fById, fx), [-r, 2, 0], 1e-12);
  });

  it('원 평면을 원 위에서 지나는 곧은 모서리는 그 점, 원에서 0.001 떨어져 지나가면(같은 평면·평면을 지나는 것 모두) null', () => {
    close(refineSnap(at([-6, -8, 0], [-6, -8, 0]), fById, fx), [-6, -8, 0], 1e-12);
    expect(refineSnap(at([0, 10, 0], [0, 10.001, 0]), fById, fx)).toBeNull();
    expect(refineSnap(at([10, 0, 0], [10.001, 0, 0]), fById, fx)).toBeNull();
  });
});

describe('멀리서 내린 열린 수직 발(코어 0.15.0 open — 지금 수직 발 계산 그대로)', () => {
  const rim = rimAt(FAR_FOOT);
  const poly = rim.ref.poly;

  it('먼 첫 점에서 꺾은선 토막에 내린 발은 모두 토막 밖 — 코어의 열린 후보는 토막 끝(발 쪽), 원 위 발은 그 끝 둘레', () => {
    for (let k = 0; k + 1 < poly.length; k++) expect(perpendicularFoot(FAR, poly[k]!, poly[k + 1]!, 1e-9)).toBeNull();
    const a = openFoot(FAR, poly[rim.k]!, poly[rim.k + 1]!, 1e-9)!;
    expect(a).toBeTruthy();
    expect([poly[rim.k], poly[rim.k + 1]]).toContainEqual(a);
    // 토막 끝(곡선 위 꼭짓점)은 원 위 발에서 반지름 10의 원 둘레로 수십 분의 1 떨어져 있다
    expect(dist(a, FAR_FOOT)).toBeGreaterThan(0.1);
  });

  it('열린 후보(point = 토막 끝)에서 원 위 발(10, 0, 20) 1e-9, 거리 √2000 1e-9 — 발 양쪽 토막·둘째 이웃 토막 모두', () => {
    let n = 0;
    for (let k = Math.max(0, rim.k - 2); k <= Math.min(poly.length - 2, rim.k + 2); k++) {
      const point = openFoot(FAR, poly[k]!, poly[k + 1]!, 1e-9)!;
      const c: SnapRefineInput = { kind: 'perpendicular', open: true, point, segment: segOf(rim.ref, k), first: FAR, ray: { origin: [60, -60, 60], dir: [-0.57735, 0.57735, -0.57735] } };
      const q = refineSnap(c, byId, ex);
      close(q, FAR_FOOT, 1e-12);
      expect(Math.abs(dist(FAR, q!) - Math.sqrt(2000))).toBeLessThan(1e-9);
      // 원 위이고, 첫 점 → 발이 그 자리 원 접선에 수직
      expect(Math.abs(Math.hypot(q![0], q![1]) - RIM_R)).toBeLessThan(1e-12);
      expect(q![2]).toBe(RIM_H);
      // 커서 광선이 달라도 같다(코어가 광선을 빼고 기억한다)
      expect(refineSnap({ ...c, ray: { origin: [0, 0, 100], dir: [0, 0, -1] } }, byId, ex)).toEqual(q);
      n++;
    }
    expect(n).toBe(5);
    // 맞은편 토막은 원 위 먼 쪽 발(첫 점에서 가장 먼 점 — 거리의 극대도 수직 발), 그 사이 토막은 둘레에 발이 없어 null(후보 없음)
    const kf = (rim.k + 25) % (poly.length - 1);
    const open = (k: number): SnapRefineInput => ({
      kind: 'perpendicular',
      open: true,
      point: openFoot(FAR, poly[k]!, poly[k + 1]!, 1e-9)!,
      segment: segOf(rim.ref, k),
      first: FAR,
      ray: { origin: [0, 0, 100], dir: [0, 0, -1] },
    });
    close(refineSnap(open(kf), byId, ex), [-10, 0, 20], 1e-12);
    expect(refineSnap(open((rim.k + 12) % (poly.length - 1)), byId, ex)).toBeNull();
  });
});
