/**
 * 두 점 측정 방향 잠금의 곡선 모서리 접선(DOM 없음 — 문서를 열 때 나눠 받는다: core.ts loadCurveTangents).
 *
 * 첫 측정 점이 B-rep 곡선 모서리(원·타원·B-스플라인 등 — 곧은 선이 아닌 EDGE_CURVE)의 끝 꼭짓점이고 커서 아래 점이 그 모서리 위
 * (다른 끝·가운데 점·꺾은선 꼭짓점 포함)면 Shift·↓·잠금 단추가 그 끝에서 곡선 안쪽으로 가는 접선 방향으로 잠근다
 * (코어 setMeasureInferenceLock({ direction, kind: 'parallel' })).
 * - 접선은 해석기가 B-rep 곡선의 1차 도함수(원·타원은 식, B-스플라인은 도함수)로 구해 모서리 표에 실은 끝 접선(tangents — brep.ts)을
 *   묶음 자리 변환(회전·균등 배율·거울)으로 옮긴 것이다. 화면용 꺾은선 첫 토막의 방향(현)이 아니다.
 * - 방향: 시작 꼭짓점이면 모서리 방향 그대로, 끝 꼭짓점이면 그 반대 — 늘 첫 점에서 곡선 쪽(커서가 있는 모서리 쪽)으로 나간다.
 *   한 바퀴 원처럼 두 끝이 모두 첫 점인 닫힌 모서리는 커서 아래 점이 꺾은선 길이로 앞 절반이면 시작 쪽, 뒤 절반이면 끝 쪽(거꾸로 도는 방향).
 * - "그 모서리 위": 커서 아래 점에서 그 모서리의 화면용 꺾은선(꼭짓점이 모두 곡선 위)까지가 허용치 안.
 * - 차례: 커서 아래가 방향 추론(축·나란함·수직 발)이면 코어 판정이 먼저, 그 밖의 점 붙잡기(끝점·가운데 점·교차점·모서리 위 점)가
 *   그 곡선 위면 접선이 먼저다(코어는 그때 꺾은선 첫 토막 방향으로 잠그려 한다). 다만 코어가 볼 잠금이 그 곡선의 첫 토막이 아닌
 *   다른 직선(반원판의 지름처럼 첫 점에서 곡선의 다른 끝으로 이어진 곧은 모서리)이면 코어 판정 그대로다.
 *   지금 잠글 것을 못 보면(커서가 떠남) 코어처럼 첫 점 뒤 마지막으로 본 것 — 접선이었으면 접선.
 * - 첫 점에 닿는 곡선 끝은 첫 점마다 한 번 장면에서 찾고(묶음마다 곡선 끝 상자로 먼저 거른다), 커서가 움직일 때는 그 몇 개만 본다.
 *
 * 첫 점이 곡선 모서리의 끝이 아닌 곳(코어 모서리 위 점·가운데 점, 앱의 곡선 가운데 점, 꺾은선 안쪽 꼭짓점 — 화면용 꺾은선 위)이고
 * 커서 아래 점이 같은 모서리 위면 그 점에서의 곡선 접선으로 잠근다(curvesThrough·curveTangentThrough).
 * - 접선: 첫 점에서 B-rep 곡선 위 가장 가까운 매개변수의 접선(방향만 — 첫 점이 꺾은선 위라 곡선에서 조금 떨어져 있어도). 원은 모서리 표
 *   params로 식, 타원·B-스플라인은 모서리 표 곡선 정의(curves — edgecurve.ts)로 타원은 매개변수 각에서, B-스플라인은 매듭 구간 표본에서 뉴턴.
 *   정의가 없으면(B-스플라인 기록 한도를 넘음·그 밖의 곡선·옛 결과) 꺾은선 꼭짓점 접선(이웃 두 토막의 2차 어림, 끝은 표의 끝 접선)을 토막 안에서 섞는다.
 * - 방향: 첫 점에서 커서 쪽(첫 점 → 커서와 내적이 양수). 커서가 접선에 수직이면(원의 맞은편) 꺾은선 길이로 커서가 앞이면 모서리 방향.
 * - 코어가 볼 잠금이 첫 점이 놓인 토막(꼭짓점이면 이웃 두 토막)의 현이 아닌 다른 직선이면 코어 판정 그대로(끝에서와 같다).
 *
 * 측정 붙잡기를 곡선 위로 다듬으면(코어 0.14.0 refine — curvesnap.ts) 첫 점·커서 아래 점이 화면용 꺾은선이 아니라 정확한 곡선 위에 온다.
 * 곡선 위 점은 꺾은선(현)에서 화살 높이만큼 비켜 있으므로, 꺾은선까지가 허용치 밖이어도 화살 높이 안(토막 길이의 반)이면 곡선 정의로
 * 그 곡선까지의 거리를 재서 허용치 안이면 그 모서리 위로 본다(곡선 정의가 없는 모서리는 꺾은선 거리만).
 * 다듬기는 이 조각의 curveSnap(curvesnap.ts)이 코어에 준다 — 이 조각과 함께 문서를 열 때 받는다.
 */
import type { MeasureInferenceLock, MeasureResult, Viewer3d } from 'opencad-viewer3d';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { edgeCurve, nearestOnCurve } from '../edgecurve';
import type { StepEdgeTable } from '../scene';
import { curveDistance, dirToWorld, toLocal, toWorld } from './curvesnap';
import type { SnapEdgeIndex } from './snap';

export { curveSnap } from './curvesnap';

type V3 = [number, number, number];

/** 모서리 표 접선 개수(brep.ts EDGE_TANGENTS) */
const NT = 6;

/** 첫 점에 닿는 곡선 모서리 끝: 그물, 모서리 표와 그 안 번호, 어느 끝(0 = 시작 꼭짓점, 1 = 끝 꼭짓점) */
export interface CurveEnd {
  mesh: Mesh3d;
  table: StepEdgeTable;
  edge: number;
  end: 0 | 1;
}

/** 같은 자리로 볼 허용치: 좌표 크기의 1e-6(장면 윤곽선이 float32라 생기는 반올림을 넉넉히 덮는다) */
export function pointTol(p: ArrayLike<number>): number {
  return 1e-6 * (1 + Math.max(Math.abs(p[0]!), Math.abs(p[1]!), Math.abs(p[2]!)));
}

/** 윤곽선 배열마다 곡선 모서리(접선을 아는 것)의 번호·두 끝(묶음 좌표, origin 빼기 전 그대로)과 그 상자 */
interface CurveIndex {
  table: StepEdgeTable;
  edges: Int32Array;
  /** 곡선 모서리마다 시작 xyz, 끝 xyz */
  ends: Float64Array;
  /** 곡선 모서리마다 꺾은선 상자(아래 xyz, 위 xyz — float32 꼭짓점 그대로라 정확하다) */
  boxes: Float32Array;
  /** 곡선 모서리마다 화살 높이 한도(가장 긴 토막의 반 — 곡선은 꺾은선에서 이보다 멀어지지 않는다) */
  sag: Float32Array;
  lo: V3;
  hi: V3;
  /** sag의 가장 큰 값 */
  maxSag: number;
}

const indexCache = new WeakMap<Float32Array, CurveIndex>();

function curveIndex(E: Float32Array, table: StepEdgeTable): CurveIndex {
  const hit = indexCache.get(E);
  if (hit && hit.table === table) return hit;
  const T = table.tangents!;
  const S = table.segStart;
  const list: number[] = [];
  const ends: number[] = [];
  const boxes: number[] = [];
  const sag: number[] = [];
  let maxSag = 0;
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let e = 0; e + 1 < S.length; e++) {
    const s0 = S[e]!;
    const s1 = S[e + 1]!;
    if (!(s1 > s0) || E.length < s1 * 6 || !Number.isFinite(T[e * NT]!) || !Number.isFinite(T[e * NT + 3]!)) continue;
    list.push(e);
    const a = s0 * 6;
    const b = (s1 - 1) * 6 + 3;
    for (const o of [a, b]) for (let k = 0; k < 3; k++) ends.push(E[o + k]!);
    const bl = [Infinity, Infinity, Infinity];
    const bh = [-Infinity, -Infinity, -Infinity];
    for (let o = a; o < s1 * 6; o += 3)
      for (let k = 0; k < 3; k++) {
        const v = E[o + k]!;
        if (v < bl[k]!) bl[k] = v;
        if (v > bh[k]!) bh[k] = v;
      }
    boxes.push(...bl, ...bh);
    let longest = 0;
    for (let q = s0; q < s1; q++) longest = Math.max(longest, Math.hypot(E[q * 6 + 3]! - E[q * 6]!, E[q * 6 + 4]! - E[q * 6 + 1]!, E[q * 6 + 5]! - E[q * 6 + 2]!));
    sag.push(longest / 2);
    if (longest / 2 > maxSag) maxSag = longest / 2;
    for (let k = 0; k < 3; k++) {
      if (bl[k]! < lo[k]) lo[k] = bl[k]!;
      if (bh[k]! > hi[k]) hi[k] = bh[k]!;
    }
  }
  const out: CurveIndex = { table, edges: Int32Array.from(list), ends: Float64Array.from(ends), boxes: Float32Array.from(boxes), sag: Float32Array.from(sag), lo, hi, maxSag };
  indexCache.set(E, out);
  return out;
}

/**
 * 시작이나 끝 꼭짓점이 세계 점 a(축마다 tol 안)인 곡선 모서리 끝(그물 차례, 많아야 limit개). 묶음마다 곡선 끝 상자로 먼저 거른다.
 * 모서리 표에 접선이 없으면(옛 결과) 빈 목록
 */
export function curveEndsAt(meshes: readonly Mesh3d[], ex: SnapEdgeIndex | null, a: ArrayLike<number>, tol = pointTol(a), limit = 16): CurveEnd[] {
  const out: CurveEnd[] = [];
  if (!ex) return out;
  for (const mesh of meshes) {
    const ti = ex.tableOf.get(mesh.id);
    const table = ti === undefined ? undefined : ex.tables[ti];
    const E = mesh.edges;
    if (!table?.tangents || !E) continue;
    const c = curveIndex(E, table);
    if (!c.edges.length) continue;
    const L = toLocal(mesh, a);
    if (!L) continue;
    const t = tol / L.scale;
    const [x, y, z] = L.p;
    if (x < c.lo[0] - t || x > c.hi[0] + t || y < c.lo[1] - t || y > c.hi[1] + t || z < c.lo[2] - t || z > c.hi[2] + t) continue;
    for (let k = 0; k < c.edges.length; k++) {
      for (const end of [0, 1] as const) {
        const o = k * 6 + end * 3;
        if (Math.abs(c.ends[o]! - x) <= t && Math.abs(c.ends[o + 1]! - y) <= t && Math.abs(c.ends[o + 2]! - z) <= t) {
          out.push({ mesh, table, edge: c.edges[k]!, end });
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

/** 곡선 끝(이나 모서리)의 세계 꺾은선(시작 꼭짓점 → 끝 꼭짓점) */
export function endPolyline(e: Pick<CurveEnd, 'mesh' | 'table' | 'edge'>): V3[] {
  const E = e.mesh.edges!;
  const s0 = e.table.segStart[e.edge]!;
  const s1 = e.table.segStart[e.edge + 1]!;
  const pts: V3[] = [toWorld(e.mesh, E[s0 * 6]!, E[s0 * 6 + 1]!, E[s0 * 6 + 2]!)];
  for (let k = s0; k < s1; k++) pts.push(toWorld(e.mesh, E[k * 6 + 3]!, E[k * 6 + 4]!, E[k * 6 + 5]!));
  return pts;
}

/** 점 p에서 꺾은선까지 가장 가까운 거리와 그 자리의 꺾은선 길이(시작부터)·토막 번호, 전체 길이 */
export function polylineNearest(pts: readonly V3[], p: ArrayLike<number>): { dist: number; s: number; seg: number; total: number } {
  let best = { dist: Infinity, s: 0, seg: 0 };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    const l2 = dx * dx + dy * dy + dz * dz;
    const l = Math.sqrt(l2);
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0]! - a[0]) * dx + (p[1]! - a[1]) * dy + (p[2]! - a[2]) * dz) / l2)) : 0;
    const d = Math.hypot(p[0]! - a[0] - dx * t, p[1]! - a[1] - dy * t, p[2]! - a[2] - dz * t);
    if (d < best.dist) best = { dist: d, s: acc + l * t, seg: i - 1 };
    acc += l;
  }
  if (pts.length === 1) best = { dist: Math.hypot(p[0]! - pts[0]![0], p[1]! - pts[0]![1], p[2]! - pts[0]![2]), s: 0, seg: 0 };
  return { ...best, total: acc };
}

/**
 * 커서 아래 점 p에서 모서리(e)까지 거리와 그 자리 꺾은선 길이: 꺾은선까지가 tol 밖이어도 화살 높이 한도(가장 긴 토막의 반) 안이고
 * 곡선 정의가 있으면(kinds를 주면) 곡선까지 거리(곡선 위로 다듬은 점). 꺾은선 길이(s)는 꺾은선에서 가장 가까운 자리
 */
export function edgeNearest(
  e: Pick<CurveEnd, 'mesh' | 'table' | 'edge'>,
  poly: readonly V3[],
  p: ArrayLike<number>,
  tol: number,
  kinds?: readonly string[] | null,
): { dist: number; s: number; total: number } {
  const n = polylineNearest(poly, p);
  if (n.dist <= tol || !kinds || !(n.dist <= tol + halfLongest(poly))) return n;
  const c = curveDistance(e.mesh, e.table, e.edge, kinds, p, n.seg);
  return c !== null && c < n.dist ? { ...n, dist: c } : n;
}

/** 꺾은선에서 가장 긴 토막의 반(곡선이 꺾은선에서 멀어지는 화살 높이의 한도) */
function halfLongest(poly: readonly V3[]): number {
  let m = 0;
  for (let i = 1; i < poly.length; i++) m = Math.max(m, Math.hypot(poly[i]![0] - poly[i - 1]![0], poly[i]![1] - poly[i - 1]![1], poly[i]![2] - poly[i - 1]![2]));
  return m / 2;
}

/** 곡선 끝에서 곡선 안쪽으로 가는 세계 단위 접선(시작이면 시작 접선, 끝이면 끝 접선의 반대). 못 구하면 null */
export function endTangent(e: Pick<CurveEnd, 'mesh' | 'table' | 'edge'> & { end?: 0 | 1 }, end: 0 | 1 = e.end ?? 0): V3 | null {
  const T = e.table.tangents;
  if (!T) return null;
  const o = e.edge * NT + end * 3;
  const sgn = end ? -1 : 1;
  const tx = T[o]! * sgn;
  const ty = T[o + 1]! * sgn;
  const tz = T[o + 2]! * sgn;
  return dirToWorld(e.mesh, tx, ty, tz);
}

/**
 * 첫 점 a에 닿는 곡선 끝(ends — curveEndsAt) 가운데 커서 아래 점 p가 그 모서리 위에 있는 것의 a 쪽 단위 접선(a에서 곡선 쪽).
 * p가 a 자리거나 어느 모서리 위도 아니면 null. 여럿이면 p에 가장 가까운 모서리. 두 끝이 모두 a인 닫힌 모서리는 p가 놓인 쪽 끝(꺾은선 길이 절반으로 가른다)
 */
export function curveTangentAt(ends: readonly CurveEnd[], a: ArrayLike<number>, p: ArrayLike<number>, kinds: readonly string[] | null = null): V3 | null {
  return curveTangentPick(ends, a, p, kinds)?.dir ?? null;
}

/**
 * curveTangentAt과 같고 그 끝의 첫 꺾은선 토막(현 — 코어가 이 곡선에서 잠그려 하는 방향, a에서 곡선 쪽 단위 벡터)도 준다.
 * 현을 못 구하면(토막 길이 0) chord는 dir과 같다. kinds(모서리 종류 이름)를 주면 곡선 위로 다듬은 p도 그 모서리 위로 본다(edgeNearest)
 */
export function curveTangentPick(ends: readonly CurveEnd[], a: ArrayLike<number>, p: ArrayLike<number>, kinds: readonly string[] | null = null): TangentPick | null {
  if (!ends.length) return null;
  if (Math.hypot(p[0]! - a[0]!, p[1]! - a[1]!, p[2]! - a[2]!) <= 4 * pointTol(a)) return null;
  const tolP = 4 * pointTol(p);
  let best: { e: CurveEnd; poly: V3[]; dist: number; s: number; total: number } | null = null;
  for (const e of ends) {
    const poly = endPolyline(e);
    const n = edgeNearest(e, poly, p, tolP, kinds);
    if (!(n.dist <= tolP)) continue;
    if (!best || n.dist < best.dist) best = { e, poly, ...n };
  }
  if (!best) return null;
  const b = best;
  const both = ends.some((o) => o.mesh === b.e.mesh && o.edge === b.e.edge && o.end !== b.e.end);
  const end = both ? (b.s <= b.total / 2 ? 0 : 1) : b.e.end;
  const dir = endTangent(b.e, end);
  if (!dir) return null;
  // 그 끝의 첫 토막(끝 꼭짓점 → 곡선 쪽 이웃 꼭짓점)
  const k = b.poly.length - 1;
  const [q0, q1] = end ? [b.poly[k]!, b.poly[k - 1]!] : [b.poly[0]!, b.poly[1]!];
  const chord = (q1 && unitTo(q0, q1)) ?? dir;
  return { dir, chord, chords: [chord] };
}

/** 고른 접선: 단위 방향과 첫 점에서 코어가 이 곡선에서 잠그려 할 현(첫 토막 — 꼭짓점이면 이웃 두 토막) */
export interface TangentPick {
  dir: V3;
  /** 첫 현(현을 못 구하면 dir) */
  chord: V3;
  chords: V3[];
}

/** a → b 단위 방향(길이 0이면 null) */
function unitTo(a: readonly number[], b: readonly number[]): V3 | null {
  const d = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const l = Math.hypot(d[0]!, d[1]!, d[2]!);
  return l > 0 && Number.isFinite(l) ? [d[0]! / l, d[1]! / l, d[2]! / l] : null;
}

/** 첫 점이 곡선 모서리의 끝이 아닌 곳(화면용 꺾은선 위)에 놓인 그 모서리 */
export interface CurveOn {
  mesh: Mesh3d;
  table: StepEdgeTable;
  edge: number;
  /** 세계 꺾은선(시작 꼭짓점 → 끝 꼭짓점) */
  poly: V3[];
  /** 첫 점이 놓인 토막(poly[seg] → poly[seg+1])과 그 안 비율(꼭짓점이면 seg = 그 꼭짓점, f = 0) */
  seg: number;
  f: number;
  /** 첫 점이 꺾은선 안쪽 꼭짓점이면 그 번호, 아니면 -1 */
  vertex: number;
  /** 첫 점 자리의 꺾은선 길이(시작부터) */
  s: number;
  /** 첫 점(세계) */
  at: V3;
}

/**
 * 세계 점 a가 끝이 아닌 곳에 놓인 곡선 모서리(그물 차례, 많아야 limit개): a에서 그 모서리 꺾은선까지가 tol 안이고 두 끝 꼭짓점에서는 tol 밖.
 * 꺾은선까지가 tol 밖이어도 화살 높이 한도(그 모서리의 가장 긴 토막의 반) 안이면 곡선 정의로 곡선까지 거리를 재서 tol 안이면 넣는다
 * (곡선 위로 다듬은 측정 점 — 토막·비율·꼭짓점은 꺾은선에서 가장 가까운 자리). 묶음마다 곡선 꺾은선 상자(화살 높이 한도만큼 넓힘)로 먼저 거른다.
 * 모서리 표에 접선이 없으면(옛 결과) 빈 목록
 */
export function curvesThrough(meshes: readonly Mesh3d[], ex: SnapEdgeIndex | null, a: ArrayLike<number>, tol = 4 * pointTol(a), limit = 8): CurveOn[] {
  const out: CurveOn[] = [];
  if (!ex) return out;
  for (const mesh of meshes) {
    const ti = ex.tableOf.get(mesh.id);
    const table = ti === undefined ? undefined : ex.tables[ti];
    const E = mesh.edges;
    if (!table?.tangents || !E) continue;
    const c = curveIndex(E, table);
    if (!c.edges.length) continue;
    const L = toLocal(mesh, a);
    if (!L) continue;
    const t = tol / L.scale;
    const [x, y, z] = L.p;
    const g = t + c.maxSag;
    if (x < c.lo[0] - g || x > c.hi[0] + g || y < c.lo[1] - g || y > c.hi[1] + g || z < c.lo[2] - g || z > c.hi[2] + g) continue;
    const B = c.boxes;
    for (let k = 0; k < c.edges.length; k++) {
      const b = k * 6;
      const w = t + c.sag[k]!;
      if (x < B[b]! - w || x > B[b + 3]! + w || y < B[b + 1]! - w || y > B[b + 4]! + w || z < B[b + 2]! - w || z > B[b + 5]! + w) continue;
      const e = c.edges[k]!;
      const s0 = table.segStart[e]!;
      const s1 = table.segStart[e + 1]!;
      let best = Infinity;
      let seg = -1;
      let f = 0;
      let segLen = 0;
      for (let q = s0; q < s1; q++) {
        const o = q * 6;
        const dx = E[o + 3]! - E[o]!;
        const dy = E[o + 4]! - E[o + 1]!;
        const dz = E[o + 5]! - E[o + 2]!;
        const l2 = dx * dx + dy * dy + dz * dz;
        const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - E[o]!) * dx + (y - E[o + 1]!) * dy + (z - E[o + 2]!) * dz) / l2)) : 0;
        const d = Math.hypot(x - E[o]! - dx * u, y - E[o + 1]! - dy * u, z - E[o + 2]! - dz * u);
        if (d < best) {
          best = d;
          seg = q - s0;
          f = u;
          segLen = Math.sqrt(l2);
        }
      }
      // 꺾은선 밖이면 곡선 위 점인지(곡선 정의로 잰 거리)
      if (!(best <= t) && !(best <= w && (curveDistance(mesh, table, e, ex.kinds, a, seg) ?? Infinity) <= tol)) continue;
      const n = s1 - s0;
      let vertex = f * segLen <= t ? seg : (1 - f) * segLen <= t ? seg + 1 : -1;
      // 모서리 끝(두 끝이 모두 첫 점인 닫힌 모서리의 이음 꼭짓점 포함)은 curveEndsAt이 맡는다
      if (vertex === 0 || vertex === n) continue;
      if (vertex < 0 && closeTo(E, s0 * 6, x, y, z, t)) continue;
      if (vertex < 0 && closeTo(E, (s1 - 1) * 6 + 3, x, y, z, t)) continue;
      if (vertex > 0) {
        seg = vertex;
        f = 0;
      }
      const poly = endPolyline({ mesh, table, edge: e });
      let sa = 0;
      for (let i = 1; i <= seg; i++) sa += Math.hypot(poly[i]![0] - poly[i - 1]![0], poly[i]![1] - poly[i - 1]![1], poly[i]![2] - poly[i - 1]![2]);
      if (f > 0) sa += f * Math.hypot(poly[seg + 1]![0] - poly[seg]![0], poly[seg + 1]![1] - poly[seg]![1], poly[seg + 1]![2] - poly[seg]![2]);
      out.push({ mesh, table, edge: e, poly, seg, f, vertex: Math.max(-1, vertex), s: sa, at: [a[0]!, a[1]!, a[2]!] });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 윤곽선 꼭짓점(E[o..o+2])이 (x, y, z)에서 t 안인지 */
const closeTo = (E: Float32Array, o: number, x: number, y: number, z: number, t: number): boolean => Math.hypot(E[o]! - x, E[o + 1]! - y, E[o + 2]! - z) <= t;

/** 모서리 위 첫 점의 접선(모서리 방향 세계 단위)과 곡선 정의로 구했는지 — CurveOn마다 한 번 */
const onTangents = new WeakMap<CurveOn, { dir: V3; exact: boolean } | null>();

/**
 * 첫 점(on.at)에서의 곡선 접선(모서리 방향 — 첫 점이 놓인 토막의 현과 같은 쪽, 세계 단위). 곡선 정의가 있으면 B-rep 곡선 위 가장 가까운
 * 매개변수의 접선(exact), 없으면 꺾은선 꼭짓점 접선의 어림. 못 구하면 null
 */
export function throughTangent(on: CurveOn, kinds: readonly string[]): { dir: V3; exact: boolean } | null {
  if (onTangents.has(on)) return onTangents.get(on)!;
  const P = on.poly;
  const v = on.vertex;
  const ref = v > 0 ? unitTo(P[v - 1]!, P[v + 1]!) : unitTo(P[on.seg]!, P[on.seg + 1]!);
  let dir: V3 | null = null;
  let exact = false;
  const def = edgeCurve(on.table, on.edge, kinds);
  if (def) {
    const L = toLocal(on.mesh, on.at);
    const foot = L ? nearestOnCurve(def, L.p) : null;
    if (foot && foot.tangent.every(Number.isFinite)) {
      dir = dirToWorld(on.mesh, foot.tangent[0], foot.tangent[1], foot.tangent[2]);
      exact = !!dir;
    }
  }
  dir ??= approxTangent(on);
  const out = dir && ref ? { dir: dot3(dir, ref) < 0 ? neg3(dir) : dir, exact } : null;
  onTangents.set(on, out);
  return out;
}

const dot3 = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const neg3 = (a: readonly number[]): V3 => [-a[0]!, -a[1]!, -a[2]!];

/**
 * 꺾은선 꼭짓점 접선의 어림(곡선 정의가 없을 때): 안쪽 꼭짓점 i는 이웃 두 토막 길이 h1·h2로 2차 어림 h1²(P[i+1]−P[i]) + h2²(P[i]−P[i−1]),
 * 두 끝은 모서리 표의 끝 접선. 첫 점이 토막 안이면 두 끝 꼭짓점 접선을 비율로 섞는다. 모서리 방향 세계 단위
 */
export function approxTangent(on: Pick<CurveOn, 'mesh' | 'table' | 'edge' | 'poly' | 'seg' | 'f' | 'vertex'>): V3 | null {
  const P = on.poly;
  const n = P.length - 1;
  const at = (i: number): V3 | null => {
    if (i <= 0) return endTangent(on, 0);
    if (i >= n) {
      const t = endTangent(on, 1);
      return t && neg3(t);
    }
    const h1 = Math.hypot(P[i]![0] - P[i - 1]![0], P[i]![1] - P[i - 1]![1], P[i]![2] - P[i - 1]![2]);
    const h2 = Math.hypot(P[i + 1]![0] - P[i]![0], P[i + 1]![1] - P[i]![1], P[i + 1]![2] - P[i]![2]);
    const d = [0, 1, 2].map((k) => h1 * h1 * (P[i + 1]![k]! - P[i]![k]!) + h2 * h2 * (P[i]![k]! - P[i - 1]![k]!));
    return unitTo([0, 0, 0], d);
  };
  if (on.vertex > 0) return at(on.vertex);
  const t0 = at(on.seg);
  const t1 = at(on.seg + 1);
  if (!t0 || !t1) return t0 ?? t1;
  const f = on.f;
  return unitTo([0, 0, 0], [0, 1, 2].map((k) => (1 - f) * t0[k]! + f * t1[k]!));
}

/**
 * 첫 점 a가 끝이 아닌 곳에 놓인 곡선 모서리(ons — curvesThrough) 가운데 커서 아래 점 p가 그 모서리 위에 있는 것(여럿이면 p에 가장 가까운 것)의
 * a에서의 접선(커서 쪽 — a → p와 내적이 양수, 수직이면 꺾은선 길이로 p가 앞이면 모서리 방향)과 a가 놓인 토막의 현(꼭짓점이면 이웃 두 토막).
 * p가 a 자리거나 어느 모서리 위도 아니면 null
 */
export function curveTangentThrough(ons: readonly CurveOn[], a: ArrayLike<number>, p: ArrayLike<number>, kinds: readonly string[]): (TangentPick & { exact: boolean }) | null {
  if (!ons.length) return null;
  const w: V3 = [p[0]! - a[0]!, p[1]! - a[1]!, p[2]! - a[2]!];
  const wl = Math.hypot(w[0], w[1], w[2]);
  if (wl <= 4 * pointTol(a)) return null;
  const tolP = 4 * pointTol(p);
  let best: { on: CurveOn; dist: number; s: number } | null = null;
  for (const on of ons) {
    const nr = edgeNearest(on, on.poly, p, tolP, kinds);
    if (nr.dist <= tolP && (!best || nr.dist < best.dist)) best = { on, dist: nr.dist, s: nr.s };
  }
  if (!best) return null;
  const on = best.on;
  const t = throughTangent(on, kinds);
  if (!t) return null;
  const k = dot3(t.dir, w);
  const ahead = Math.abs(k) > 1e-9 * wl ? k > 0 : best.s >= on.s;
  const P = on.poly;
  const v = on.vertex;
  const chords = (v > 0 ? [unitTo(P[v - 1]!, P[v]!), unitTo(P[v]!, P[v + 1]!)] : [unitTo(P[on.seg]!, P[on.seg + 1]!)]).filter((c): c is V3 => !!c);
  const dir = ahead ? t.dir : neg3(t.dir);
  return { dir, chord: chords[0] ?? dir, chords, exact: t.exact };
}

/** 이 모듈이 쓰는 뷰어 기능(시험에서 가짜로 바꿀 수 있게) */
export type TangentViewer = Pick<Viewer3d, 'measureMode' | 'measurePointCount' | 'measurePoints' | 'measureHoverSnap' | 'measureHoverLock' | 'measureInferenceLock' | 'setMeasureInferenceLock'>;

/** 접선 잠금이 찾을 장면(그물과 모서리 표 색인) */
export interface TangentScene {
  meshes: readonly Mesh3d[];
  ex: SnapEdgeIndex | null;
}

/** 방향 추론 붙잡기(첫 점을 지나는 선 위의 점): 곡선 접선보다 코어 판정이 먼저 */
const INFERRED = new Set(['axis', 'parallel', 'perpendicular']);
/** 같은 직선 방향(부호 무시)으로 볼 단위 벡터 내적 — 잠금 방향은 코어가 float64로 단위화한 값이라 아주 가깝다 */
const sameLine = (a: readonly number[], b: readonly number[], min = 1 - 1e-9): boolean => Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) >= min;
/** 코어 잠금이 곡선의 첫 토막(현)인지 볼 내적: 같은 float32 윤곽선 꼭짓점에서 구한 방향이라 거의 같고, 축과 나란한 토막은 코어가 축 방향으로 바꾼다(각 1e-4 라디안 안) */
const CHORD_SAME = 1 - 5e-9;

/**
 * 곡선 접선 잠금의 앱 쪽 상태: 코어 측정 모드가 잠금 상태와 판정을 가지고, 이것은 곡선 끝에서 접선으로 잠그는 손잡이만 둔다.
 * Shift는 앱이 창 keydown 캡처 단계에서 코어보다 먼저 shiftDown을 불러 잠그고(코어는 잠금이 있으면 Shift를 넘긴다), 떼면 shiftUp이 푼다
 * (코어는 제가 Shift로 잠근 것만 푼다). ↓·잠금 단추는 lockNow. 둘째 점을 찍거나 측정을 지우면 코어가 잠금을 푼다
 */
export class TangentLock {
  private ends: CurveEnd[] = [];
  /** 첫 점이 끝이 아닌 곳에 놓인 곡선 모서리(그 첫 점에서 처음 쓸 때 찾는다) */
  private through: CurveOn[] | null = null;
  private endsKey = '';
  private endsSrc: object | null = null;
  /** 앱이 접선으로 잠근 방향(코어 잠금이 이것과 같은 방향의 'api' 나란함 잠금이면 접선 잠금) */
  private tangent: V3 | null = null;
  /** 접선 잠금을 Shift로 걸었는지(떼면 푼다) */
  private shift = false;
  /** 첫 점 뒤 마지막으로 본 잠글 것이 접선이었으면 그 방향(코어 방향을 보면 지운다 — 코어의 "마지막으로 본 방향"과 같은 차례) */
  private seen: V3 | null = null;
  /** seen·접선 결과를 맞춘 첫 점(바뀌면 잊는다) */
  private firstKey = '';
  /** 접선 잠금으로 찍은 둘째 점을 결과에서 알아보려고 남기는 방향(다른 잠금·첫 점이 바뀌면 지운다) */
  private resultDir: V3 | null = null;

  constructor(private readonly scene: () => TangentScene | null) {}

  /**
   * 첫 점 a에서 커서 아래 점 p가 놓인 곡선 모서리의 접선과 코어가 그 곡선에서 잠그려 할 현: a가 그 곡선의 끝이면 끝 접선,
   * 끝이 아닌 곳이면 a에서의 곡선 접선(첫 점마다 닿는 곡선 끝·지나는 곡선 모서리를 한 번 찾아 둔다)
   */
  pick(a: ArrayLike<number>, p: ArrayLike<number>): TangentPick | null {
    const s = this.scene();
    if (!s?.ex) return null;
    const key = `${a[0]},${a[1]},${a[2]}`;
    if (this.endsSrc !== s.ex || this.endsKey !== key) {
      this.endsSrc = s.ex;
      this.endsKey = key;
      this.ends = curveEndsAt(s.meshes, s.ex, a);
      this.through = null;
    }
    const e = this.ends.length ? curveTangentPick(this.ends, a, p, s.ex.kinds) : null;
    if (e) return e;
    this.through ??= curvesThrough(s.meshes, s.ex, a);
    return this.through.length ? curveTangentThrough(this.through, a, p, s.ex.kinds) : null;
  }

  /** 첫 점 a에서 커서 아래 점 p가 놓인 곡선 모서리의 접선 */
  at(a: ArrayLike<number>, p: ArrayLike<number>): V3 | null {
    return this.pick(a, p)?.dir ?? null;
  }

  /**
   * 커서 아래에서 잠글 접선: 끝점을 잡는 중이고 잠그지 않았으며, 커서 아래 점이 방향 추론이 아니고 첫 점에 닿는 곡선 위면 그 접선.
   * 코어가 볼 잠금(measureHoverLock)이 그 곡선의 첫 토막(현 — 첫 점이 곡선 끝이 아닌 곳이면 첫 점이 놓인 토막, 꼭짓점이면 이웃 두 토막)이
   * 아닌 다른 직선이면 코어 판정을 둔다 — 반원판처럼 곡선의 다른 끝이 첫 점에서 곧은 모서리로도 이어지면 그 끝에서는 곧은 모서리 방향
   * (코어 0.12.0 모서리 끝 잠금)
   */
  now(v: TangentViewer): V3 | null {
    if (!v.measureMode || v.measurePointCount !== 1 || v.measureInferenceLock) return null;
    const hv = v.measureHoverSnap;
    if (!hv || (hv.snap && INFERRED.has(hv.snap))) return null;
    const first = v.measurePoints[0];
    const t = first ? this.pick(first.point, hv.point) : null;
    if (!t) return null;
    const core = v.measureHoverLock;
    return core && !t.chords.some((c) => sameLine(core.direction, c, CHORD_SAME)) ? null : t.dir;
  }

  /** 코어 잠금이 앱이 건 접선 잠금인지 */
  locked(v: Pick<TangentViewer, 'measureInferenceLock'>): boolean {
    return this.isTangent(v.measureInferenceLock);
  }

  private isTangent(l: Pick<MeasureInferenceLock, 'kind' | 'direction' | 'source'> | null | undefined): boolean {
    return !!this.tangent && !!l && l.kind === 'parallel' && l.source === 'api' && sameLine(l.direction, this.tangent);
  }

  /** Shift 누름(코어보다 먼저): 커서 아래가 곡선 위면 그 접선으로 잠그고 true. 아니면 아무것도 하지 않는다(코어가 제 판정으로 잠근다) */
  shiftDown(v: TangentViewer): boolean {
    const t = this.now(v);
    if (!t || !this.lockTangent(v, t)) return false;
    this.shift = true;
    return true;
  }

  /** Shift 뗌·창 흐려짐: Shift로 건 접선 잠금이면 푼다(둘째 점을 찍어 코어가 이미 풀었으면 그대로). 무엇이 바뀌었으면 true */
  shiftUp(v: TangentViewer): boolean {
    if (!this.shift) return false;
    this.shift = false;
    if (this.locked(v)) {
      v.setMeasureInferenceLock(false);
      this.forget();
    }
    return true;
  }

  /** ↓·잠금 단추: 커서 아래 접선, 코어가 볼 방향, 지금 볼 것이 없으면 마지막으로 본 것(접선이었으면 접선, 아니면 코어). 잠갔으면 true */
  lockNow(v: TangentViewer): boolean {
    const t = this.now(v) ?? (v.measureHoverLock ? null : this.seen);
    if (t) return this.lockTangent(v, t);
    this.forget();
    return v.setMeasureInferenceLock(true);
  }

  private lockTangent(v: TangentViewer, t: V3): boolean {
    if (!v.setMeasureInferenceLock({ direction: t, kind: 'parallel' })) return false;
    this.tangent = [...t];
    this.resultDir = [...t];
    return true;
  }

  /** 접선 잠금 기록을 지운다(다른 잠금으로 바꾸거나 풀었다) */
  forget(): void {
    this.tangent = null;
    this.resultDir = null;
    this.shift = false;
  }

  /**
   * 커서 아래를 읽을 때마다: 첫 점 뒤 마지막으로 본 잠글 것(코어 lastLockable과 같은 차례)과 첫 점이 바뀌었는지.
   * 새 첫 점이면 접선 기록을 잊는다(결과를 보이는 동안은 남긴다)
   */
  track(v: TangentViewer): void {
    const pts = v.measureMode ? v.measurePoints : [];
    const key = pts.length ? pts[0]!.point.join(',') : '';
    if (key !== this.firstKey) {
      this.firstKey = key;
      this.seen = null;
      if (pts.length === 1) this.forget();
    }
    if (pts.length !== 1 || v.measureInferenceLock) return;
    const t = this.now(v);
    if (t) this.seen = t;
    else if (v.measureHoverLock) this.seen = null;
  }

  /** 측정 결과의 둘째 점을 접선 잠금으로 찍었는지(코어 결과는 나란함 — 이름만 접선 방향으로) */
  result(m: Pick<MeasureResult, 'lockedB' | 'snapB' | 'directionB'> | null | undefined): boolean {
    return !!m?.lockedB && m.snapB === 'parallel' && !!m.directionB && !!this.resultDir && sameLine(m.directionB, this.resultDir);
  }

  /** 측정을 끄거나 문서를 바꿨다 */
  reset(): void {
    this.forget();
    this.seen = null;
    this.firstKey = '';
    this.ends = [];
    this.through = null;
    this.endsKey = '';
    this.endsSrc = null;
  }
}
