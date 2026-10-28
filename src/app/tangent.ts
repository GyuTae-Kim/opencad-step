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
 */
import type { MeasureInferenceLock, MeasureResult, Viewer3d } from 'opencad-viewer3d';
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { StepEdgeTable } from '../scene';
import type { SnapEdgeIndex } from './snap';

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
  lo: V3;
  hi: V3;
}

const indexCache = new WeakMap<Float32Array, CurveIndex>();

function curveIndex(E: Float32Array, table: StepEdgeTable): CurveIndex {
  const hit = indexCache.get(E);
  if (hit && hit.table === table) return hit;
  const T = table.tangents!;
  const S = table.segStart;
  const list: number[] = [];
  const ends: number[] = [];
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let e = 0; e + 1 < S.length; e++) {
    const s0 = S[e]!;
    const s1 = S[e + 1]!;
    if (!(s1 > s0) || E.length < s1 * 6 || !Number.isFinite(T[e * NT]!) || !Number.isFinite(T[e * NT + 3]!)) continue;
    list.push(e);
    const a = s0 * 6;
    const b = (s1 - 1) * 6 + 3;
    for (const o of [a, b])
      for (let k = 0; k < 3; k++) {
        const v = E[o + k]!;
        ends.push(v);
        if (v < lo[k]!) lo[k] = v;
        if (v > hi[k]!) hi[k] = v;
      }
  }
  const out: CurveIndex = { table, edges: Int32Array.from(list), ends: Float64Array.from(ends), lo, hi };
  indexCache.set(E, out);
  return out;
}

/** 세계 점 → 그물 윤곽선 좌표(origin을 뺀 값)와 자리 변환 길이 배율. 변환이 퇴화했으면 null */
function toLocal(mesh: Mesh3d, a: ArrayLike<number>): { p: V3; scale: number } | null {
  const o = mesh.origin ?? [0, 0, 0];
  const m = mesh.matrix;
  if (!m) return { p: [a[0]! - o[0]!, a[1]! - o[1]!, a[2]! - o[2]!], scale: 1 };
  // 열 우선 4×4의 3×3 부분 역(여인수)
  const [m0, m1, m2, , m4, m5, m6, , m8, m9, m10] = m as unknown as number[];
  const c0 = m5! * m10! - m6! * m9!;
  const c1 = m6! * m8! - m4! * m10!;
  const c2 = m4! * m9! - m5! * m8!;
  const det = m0! * c0 + m1! * c1 + m2! * c2;
  if (!(Math.abs(det) > 1e-300)) return null;
  const x = a[0]! - m[12]!;
  const y = a[1]! - m[13]!;
  const z = a[2]! - m[14]!;
  const lx = (c0 * x + c1 * y + c2 * z) / det;
  const ly = ((m2! * m9! - m1! * m10!) * x + (m0! * m10! - m2! * m8!) * y + (m1! * m8! - m0! * m9!) * z) / det;
  const lz = ((m1! * m6! - m2! * m5!) * x + (m2! * m4! - m0! * m6!) * y + (m0! * m5! - m1! * m4!) * z) / det;
  return { p: [lx - o[0]!, ly - o[1]!, lz - o[2]!], scale: Math.cbrt(Math.abs(det)) || 1 };
}

/** 그물 윤곽선 좌표 → 세계 */
function toWorld(mesh: Mesh3d, x: number, y: number, z: number): V3 {
  const o = mesh.origin ?? [0, 0, 0];
  x += o[0]!;
  y += o[1]!;
  z += o[2]!;
  const m = mesh.matrix;
  return m ? [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!] : [x, y, z];
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

/** 곡선 끝의 세계 꺾은선(시작 꼭짓점 → 끝 꼭짓점) */
export function endPolyline(e: CurveEnd): V3[] {
  const E = e.mesh.edges!;
  const s0 = e.table.segStart[e.edge]!;
  const s1 = e.table.segStart[e.edge + 1]!;
  const pts: V3[] = [toWorld(e.mesh, E[s0 * 6]!, E[s0 * 6 + 1]!, E[s0 * 6 + 2]!)];
  for (let k = s0; k < s1; k++) pts.push(toWorld(e.mesh, E[k * 6 + 3]!, E[k * 6 + 4]!, E[k * 6 + 5]!));
  return pts;
}

/** 점 p에서 꺾은선까지 가장 가까운 거리와 그 자리의 꺾은선 길이(시작부터), 전체 길이 */
export function polylineNearest(pts: readonly V3[], p: ArrayLike<number>): { dist: number; s: number; total: number } {
  let best = { dist: Infinity, s: 0 };
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
    if (d < best.dist) best = { dist: d, s: acc + l * t };
    acc += l;
  }
  if (pts.length === 1) best = { dist: Math.hypot(p[0]! - pts[0]![0], p[1]! - pts[0]![1], p[2]! - pts[0]![2]), s: 0 };
  return { ...best, total: acc };
}

/** 곡선 끝에서 곡선 안쪽으로 가는 세계 단위 접선(시작이면 시작 접선, 끝이면 끝 접선의 반대). 못 구하면 null */
export function endTangent(e: CurveEnd, end: 0 | 1 = e.end): V3 | null {
  const T = e.table.tangents;
  if (!T) return null;
  const o = e.edge * NT + end * 3;
  const sgn = end ? -1 : 1;
  const tx = T[o]! * sgn;
  const ty = T[o + 1]! * sgn;
  const tz = T[o + 2]! * sgn;
  const m = e.mesh.matrix;
  const d: V3 = m ? [m[0]! * tx + m[4]! * ty + m[8]! * tz, m[1]! * tx + m[5]! * ty + m[9]! * tz, m[2]! * tx + m[6]! * ty + m[10]! * tz] : [tx, ty, tz];
  const l = Math.hypot(d[0], d[1], d[2]);
  if (!(l > 0) || !Number.isFinite(l)) return null;
  return [d[0] / l, d[1] / l, d[2] / l];
}

/**
 * 첫 점 a에 닿는 곡선 끝(ends — curveEndsAt) 가운데 커서 아래 점 p가 그 모서리 위에 있는 것의 a 쪽 단위 접선(a에서 곡선 쪽).
 * p가 a 자리거나 어느 모서리 위도 아니면 null. 여럿이면 p에 가장 가까운 모서리. 두 끝이 모두 a인 닫힌 모서리는 p가 놓인 쪽 끝(꺾은선 길이 절반으로 가른다)
 */
export function curveTangentAt(ends: readonly CurveEnd[], a: ArrayLike<number>, p: ArrayLike<number>): V3 | null {
  return curveTangentPick(ends, a, p)?.dir ?? null;
}

/**
 * curveTangentAt과 같고 그 끝의 첫 꺾은선 토막(현 — 코어가 이 곡선에서 잠그려 하는 방향, a에서 곡선 쪽 단위 벡터)도 준다.
 * 현을 못 구하면(토막 길이 0) chord는 dir과 같다
 */
export function curveTangentPick(ends: readonly CurveEnd[], a: ArrayLike<number>, p: ArrayLike<number>): { dir: V3; chord: V3 } | null {
  if (!ends.length) return null;
  if (Math.hypot(p[0]! - a[0]!, p[1]! - a[1]!, p[2]! - a[2]!) <= 4 * pointTol(a)) return null;
  const tolP = 4 * pointTol(p);
  let best: { e: CurveEnd; poly: V3[]; dist: number; s: number; total: number } | null = null;
  for (const e of ends) {
    const poly = endPolyline(e);
    const n = polylineNearest(poly, p);
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
  const c = q1 ? [q1[0] - q0[0], q1[1] - q0[1], q1[2] - q0[2]] : [0, 0, 0];
  const l = Math.hypot(c[0]!, c[1]!, c[2]!);
  return { dir, chord: l > 0 ? [c[0]! / l, c[1]! / l, c[2]! / l] : dir };
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

  /** 첫 점 a에서 커서 아래 점 p가 놓인 곡선 모서리의 접선과 그 끝의 첫 토막(첫 점마다 닿는 곡선 끝을 한 번 찾아 둔다) */
  pick(a: ArrayLike<number>, p: ArrayLike<number>): { dir: V3; chord: V3 } | null {
    const s = this.scene();
    if (!s?.ex) return null;
    const key = `${a[0]},${a[1]},${a[2]}`;
    if (this.endsSrc !== s.ex || this.endsKey !== key) {
      this.endsSrc = s.ex;
      this.endsKey = key;
      this.ends = curveEndsAt(s.meshes, s.ex, a);
    }
    return this.ends.length ? curveTangentPick(this.ends, a, p) : null;
  }

  /** 첫 점 a에서 커서 아래 점 p가 놓인 곡선 모서리의 접선 */
  at(a: ArrayLike<number>, p: ArrayLike<number>): V3 | null {
    return this.pick(a, p)?.dir ?? null;
  }

  /**
   * 커서 아래에서 잠글 접선: 끝점을 잡는 중이고 잠그지 않았으며, 커서 아래 점이 방향 추론이 아니고 첫 점에 닿는 곡선 위면 그 접선.
   * 코어가 볼 잠금(measureHoverLock)이 그 곡선의 첫 토막(현)이 아닌 다른 직선이면 코어 판정을 둔다 — 반원판처럼 곡선의 다른 끝이
   * 첫 점에서 곧은 모서리로도 이어지면 그 끝에서는 곧은 모서리 방향(코어 0.12.0 모서리 끝 잠금)
   */
  now(v: TangentViewer): V3 | null {
    if (!v.measureMode || v.measurePointCount !== 1 || v.measureInferenceLock) return null;
    const hv = v.measureHoverSnap;
    if (!hv || (hv.snap && INFERRED.has(hv.snap))) return null;
    const first = v.measurePoints[0];
    const t = first ? this.pick(first.point, hv.point) : null;
    if (!t) return null;
    const core = v.measureHoverLock;
    return core && !sameLine(core.direction, t.chord, CHORD_SAME) ? null : t.dir;
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
    this.endsKey = '';
    this.endsSrc = null;
  }
}
