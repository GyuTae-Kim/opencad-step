/**
 * 두 점 측정 붙잡기 점을 B-rep 곡선 위로(코어 0.14.0·0.15.0 setMeasureSnap의 refine — DOM 없음, 곡선 접선 잠금 조각과 함께 문서를 열 때 받는다).
 *
 * 코어 측정 붙잡기는 화면용 꺾은선(윤곽선) 토막 위의 점을 고른다. 그 토막이 곡선 모서리(원·타원·B-스플라인 — 모서리 표에 곡선 정의가 있는 것)의
 * 것이면 정확한 곡선 위로 옮긴 세계 점을 돌려준다. 직선 모서리·곡선 정의가 없는 모서리·선 형상 묶음은 null(코어 점 그대로).
 * - 꺾은선 꼭짓점은 곡선 위 점이다(해석기가 곡선 매개변수 t_i의 점으로 나눈다 — 두 끝은 STEP 꼭짓점). 모서리마다 꼭짓점의 곡선 매개변수를
 *   처음 쓸 때 구해 둔다: 두 끝은 모서리 표 기록의 값(원·타원은 해석기가 구한 틀 각, B-스플라인은 모서리 구간 ta·tb), 안쪽은 원·타원이면 틀 각(atan2)을
 *   모서리 방향으로 펼쳐서, B-스플라인이면 표본에서 가장 가까운 매개변수다. 토막 k는 곡선 매개변수 [T[k], T[k+1]]의 현이다.
 * - 수직 발('perpendicular'): 첫 점 F에서 곡선으로 내린 발. 토막 k 둘레(앞뒤 두 토막씩)의 곡선에서 (C − F)·C′ = 0인 매개변수 가운데
 *   코어 발(현 위)에 가장 가까운 것. 없으면 null. 코어 0.15.0의 열린 수직 발(open — 첫 점에서 꺾은선 토막에 내린 발이 토막 밖이라 코어 점이
 *   토막 끝)도 같은 계산이다: 곡선 위 발은 그 토막 끝 둘레에 있고, 답은 종류·토막·첫 점만으로 정해진다
 * - 모서리 위 점('onEdge'): 커서 광선에 가장 가까운 곡선 위 점. 같은 둘레에서 광선까지 거리의 극소(모서리 끝으로 나가면 그 끝) 가운데 코어 점에 가장 가까운 것
 * - 코어 가운데 점('midpoint'): 그 토막 두 끝 매개변수의 가운데(원은 그 호의 길이 가운데와 같다). STEP은 코어 가운데 점을 끄므로 지금은 오지 않는다
 * - 교차점('intersection' — 0.15.0, 코어 교차점과 넓힌 교차): 두 토막의 모서리 곡선의 3D 교차점(intersectEdges)
 * - 축과 선분의 교차('axisEdge' — 0.18.0, 첫 점 축·끌어온 축): 축 직선(line)과 그 토막의 모서리 곡선의 교차(intersectAxis — 곧은 모서리·원·타원은 식,
 *   B-스플라인은 반복). 돌려주는 점은 축 직선 위다
 * - 그 밖의 종류(코어가 뒤에 더할 것)는 null
 * - 앱이 주는 곡선 가운데 점(pointsFor — 앱 점이라 코어가 다듬지 않는다)은 곡선 길이 가운데(curveMidpoint): 원은 각 가운데, 타원·B-스플라인은 길이 적분
 * 결과는 넘긴 값과 모서리 표·그물로만 정해진다(같은 입력에 같은 점 — 코어가 앞 결과를 다시 쓴다). 문서가 바뀌면 앱이 setMeasureSnap을 다시 준다.
 */
import type { SnapRefineInput, SnapSegment } from 'opencad-viewer3d';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { arcCuts, arcMidParam, bsplineEval, bsplineSamples, type CurveEval, edgeCurve, type EdgeCurve, ellipseEval, nearestParam, rtsafe } from '../edgecurve';
import type { StepEdgeTable } from '../scene';
import { edgeAt } from './edges';
import type { CurveSnap, SnapEdgeIndex } from './snap';

type V3 = [number, number, number];

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

// ── 자리 변환(묶음 origin·자리 matrix — 회전·균등 배율·거울) ──

/** 열 우선 4×4의 3×3 부분으로 M·v = (x, y, z)를 푼다(여인수). 퇴화했으면 null */
function solve3(m: ArrayLike<number>, x: number, y: number, z: number): { v: V3; det: number } | null {
  const [m0, m1, m2, , m4, m5, m6, , m8, m9, m10] = m as unknown as number[];
  const c0 = m5! * m10! - m6! * m9!;
  const c1 = m6! * m8! - m4! * m10!;
  const c2 = m4! * m9! - m5! * m8!;
  const det = m0! * c0 + m1! * c1 + m2! * c2;
  if (!(Math.abs(det) > 1e-300)) return null;
  const lx = (c0 * x + c1 * y + c2 * z) / det;
  const ly = ((m2! * m9! - m1! * m10!) * x + (m0! * m10! - m2! * m8!) * y + (m1! * m8! - m0! * m9!) * z) / det;
  const lz = ((m1! * m6! - m2! * m5!) * x + (m2! * m4! - m0! * m6!) * y + (m0! * m5! - m1! * m4!) * z) / det;
  return { v: [lx, ly, lz], det };
}

/** 세계 점 → 그물 윤곽선 좌표(origin을 뺀 값 — 모서리 표 곡선 정의와 같은 좌표)와 자리 변환 길이 배율. 변환이 퇴화했으면 null */
export function toLocal(mesh: Mesh3d, a: ArrayLike<number>): { p: V3; scale: number } | null {
  const o = mesh.origin ?? [0, 0, 0];
  const m = mesh.matrix;
  if (!m) return { p: [a[0]! - o[0]!, a[1]! - o[1]!, a[2]! - o[2]!], scale: 1 };
  const s = solve3(m, a[0]! - m[12]!, a[1]! - m[13]!, a[2]! - m[14]!);
  if (!s) return null;
  return { p: [s.v[0] - o[0]!, s.v[1] - o[1]!, s.v[2] - o[2]!], scale: Math.cbrt(Math.abs(s.det)) || 1 };
}

/** 그물 윤곽선 좌표 → 세계 */
export function toWorld(mesh: Mesh3d, x: number, y: number, z: number): V3 {
  const o = mesh.origin ?? [0, 0, 0];
  x += o[0]!;
  y += o[1]!;
  z += o[2]!;
  const m = mesh.matrix;
  return m ? [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!] : [x, y, z];
}

/** 묶음 좌표 방향 → 세계 단위 방향(자리 변환의 3×3). 못 구하면 null */
export function dirToWorld(mesh: Mesh3d, tx: number, ty: number, tz: number): V3 | null {
  const m = mesh.matrix;
  const d: V3 = m ? [m[0]! * tx + m[4]! * ty + m[8]! * tz, m[1]! * tx + m[5]! * ty + m[9]! * tz, m[2]! * tx + m[6]! * ty + m[10]! * tz] : [tx, ty, tz];
  return unitOf(d);
}

/** 세계 방향 → 묶음 좌표 단위 방향(자리 변환 3×3의 역). 못 구하면 null */
export function dirToLocal(mesh: Mesh3d, d: ArrayLike<number>): V3 | null {
  const m = mesh.matrix;
  if (!m) return unitOf([d[0]!, d[1]!, d[2]!]);
  const s = solve3(m, d[0]!, d[1]!, d[2]!);
  return s ? unitOf(s.v) : null;
}

function unitOf(d: readonly number[]): V3 | null {
  const l = Math.hypot(d[0]!, d[1]!, d[2]!);
  return l > 0 && Number.isFinite(l) ? [d[0]! / l, d[1]! / l, d[2]! / l] : null;
}

// ── 모서리 곡선과 꺾은선 꼭짓점 매개변수 ──

/** 곡선 모서리 하나(묶음 좌표): 곡선 정의·계산기, 꺾은선 토막 수와 꼭짓점 매개변수(처음 쓸 때 채운다) */
export interface EdgeArc {
  def: EdgeCurve;
  /** 점·1·2차 도함수(원·타원은 틀 각 — 원의 틀 x축은 기록의 것, 옛 결과는 중심에서 시작 꼭짓점 쪽) */
  ev: CurveEval;
  /** 꺾은선 토막 수(꼭짓점은 n + 1개) */
  n: number;
  /** 꼭짓점 i(0 = 시작, n = 끝)의 곡선 매개변수 — 모서리 방향으로 단조(늘거나 준다) */
  param(i: number): number;
  /** 꼭짓점 i(묶음 좌표, float32 윤곽선 그대로) */
  vertex(i: number): V3;
  /** 원·타원의 틀(묶음 좌표 — 매개변수 각 t의 점 = 중심 + a cos t X + b sin t Y) */
  conic?: { X: V3; Y: V3; a: number; b: number };
}

const arcCache = new WeakMap<Float32Array, { table: StepEdgeTable; arcs: Map<number, EdgeArc | null> }>();

/** 그물 윤곽선 E·모서리 표의 모서리 e 곡선(곡선 정의가 없거나 직선이면 null — 윤곽선 배열마다 모서리별로 한 번 만든다) */
export function edgeArc(E: Float32Array, table: StepEdgeTable, e: number, kinds: readonly string[]): EdgeArc | null {
  let c = arcCache.get(E);
  if (!c || c.table !== table) arcCache.set(E, (c = { table, arcs: new Map() }));
  let a = c.arcs.get(e);
  if (a === undefined) c.arcs.set(e, (a = makeArc(E, table, e, kinds)));
  return a;
}

const TAU = 2 * Math.PI;
const modTau = (x: number): number => ((x % TAU) + TAU) % TAU;
/** (−π, π]로 감기 */
const wrapPi = (x: number): number => {
  const r = modTau(x);
  return r > Math.PI ? r - TAU : r;
};

function makeArc(E: Float32Array, table: StepEdgeTable, e: number, kinds: readonly string[]): EdgeArc | null {
  const s0 = table.segStart[e];
  const s1 = table.segStart[e + 1];
  if (s0 === undefined || s1 === undefined || !(s1 > s0) || E.length < s1 * 6) return null;
  const def = edgeCurve(table, e, kinds);
  if (!def) return null;
  const n = s1 - s0;
  const vertex = (i: number): V3 => {
    const o = i < n ? (s0 + i) * 6 : (s1 - 1) * 6 + 3;
    return [E[o]!, E[o + 1]!, E[o + 2]!];
  };
  const T = new Float64Array(n + 1).fill(NaN);
  if (def.kind === 'bspline') {
    const ev = bsplineEval(def);
    T[0] = def.ta;
    T[n] = def.tb;
    // 안쪽 꼭짓점: 표본(처음 쓸 때 한 번 계산) 가운데 가장 가까운 것의 이웃 사이에서 다듬는다
    let ts: number[] | null = null;
    let pts: Float64Array | null = null;
    const param = (i: number): number => {
      if (!Number.isNaN(T[i]!)) return T[i]!;
      if (!ts) {
        ts = bsplineSamples(def) ?? [def.ta];
        pts = new Float64Array(ts.length * 3);
        for (let j = 0; j < ts.length; j++) pts.set(ev(ts[j]!)[0], j * 3);
      }
      const q = vertex(i);
      let best = 0;
      let bd = Infinity;
      for (let j = 0; j < ts.length; j++) {
        const d = (pts![j * 3]! - q[0]) ** 2 + (pts![j * 3 + 1]! - q[1]) ** 2 + (pts![j * 3 + 2]! - q[2]) ** 2;
        if (d < bd) {
          bd = d;
          best = j;
        }
      }
      return (T[i] = nearestParam(ev, q, ts.slice(Math.max(0, best - 1), best + 2)));
    };
    return { def, ev, n, param, vertex };
  }
  // 원·타원: 틀 각(원은 a = b = 반지름). 기록이 있으면 틀 x축과 두 끝 매개변수가 해석기 값 그대로(정확), 옛 결과의 원은
  // x축 = 중심에서 시작 꼭짓점 쪽이고 두 끝은 윤곽선 꼭짓점(float32)의 각
  const P0 = vertex(0);
  const a = def.kind === 'circle' ? def.r : def.a;
  const b = def.kind === 'circle' ? def.r : def.b;
  const fr = ellipseEval({ center: def.center, normal: def.normal, x: def.kind === 'circle' ? (def.x ?? sub(P0, def.center)) : def.x, a, b });
  if (!fr) return null;
  const { X, Y } = fr;
  const angle = (q: readonly number[]): number => {
    const d = sub(q, def.center);
    return Math.atan2(dot(d, Y) / b, dot(d, X) / a);
  };
  const known = def.ta !== undefined && def.tb !== undefined;
  const t0 = known ? def.ta! : angle(P0);
  T[0] = t0;
  // 모서리 방향: 시작 꼭짓점에서 다음 꼭짓점으로 각이 느는 쪽이면 +1
  const sgn = known ? Math.sign(def.tb! - t0) : wrapPi(angle(vertex(1)) - t0) < 0 ? -1 : 1;
  // 끝: 닫힌 모서리(한 바퀴 원·타원 — 끝 꼭짓점이 시작과 같다)면 한 바퀴, 아니면 모서리 방향으로 잰 각
  const closed = dist(vertex(n), P0) <= 1e-7 * (1 + Math.hypot(P0[0], P0[1], P0[2]));
  T[n] = known ? def.tb! : t0 + sgn * (closed ? TAU : modTau(sgn * (angle(vertex(n)) - t0)));
  const param = (i: number): number => {
    if (Number.isNaN(T[i]!)) T[i] = t0 + sgn * modTau(sgn * (angle(vertex(i)) - t0));
    return T[i]!;
  };
  return { def, ev: fr.ev, n, param, vertex, conic: { X, Y, a, b } };
}

// ── 다듬기 ──

/** 토막 k 둘레로 볼 앞뒤 토막 수와 토막마다 나눌 표본 수 */
const AROUND = 2;
const PER_SEG = 8;

/** 토막 k 둘레(앞뒤 AROUND 토막) 매개변수 표본(모서리 방향 차례)과 그 첫·끝이 모서리 끝인지 */
function windowParams(arc: EdgeArc, k: number): { ts: number[]; startEnd: boolean; endEnd: boolean } {
  const i0 = Math.max(0, k - AROUND);
  const i1 = Math.min(arc.n, k + 1 + AROUND);
  const ts: number[] = [];
  for (let i = i0; i < i1; i++) {
    const a = arc.param(i);
    const b = arc.param(i + 1);
    for (let j = 0; j < PER_SEG; j++) ts.push(a + ((b - a) * j) / PER_SEG);
  }
  ts.push(arc.param(i1));
  return { ts, startEnd: i0 === 0, endEnd: i1 === arc.n };
}

/**
 * 표본 ts(단조) 사이에서 g = 0인 매개변수들: 이웃 표본에서 g의 부호가 바뀌면 그 사이 근(rtsafe — g가 음수인 쪽을 lo로).
 * minOnly면 매개변수가 커지는 쪽으로 g가 음수 → 양수인 것(거리 극소)만
 */
function rootsIn(ts: readonly number[], gh: (t: number) => readonly [number, number], minOnly: boolean): number[] {
  const g = ts.map((t) => gh(t)[0]);
  const out: number[] = [];
  for (let j = 0; j < ts.length; j++) {
    if (g[j] === 0) {
      out.push(ts[j]!);
      continue;
    }
    if (j + 1 >= ts.length || g[j + 1] === 0 || !(g[j]! * g[j + 1]! < 0)) continue;
    const [neg, pos] = g[j]! < 0 ? [ts[j]!, ts[j + 1]!] : [ts[j + 1]!, ts[j]!];
    if (minOnly && !(neg < pos)) continue;
    out.push(rtsafe(gh, neg, pos));
  }
  return out;
}

/** 후보 매개변수 가운데 곡선 위 점이 q에 가장 가까운 것의 점(없으면 null) */
function nearestTo(ev: CurveEval, ts: readonly number[], q: readonly number[]): V3 | null {
  let best: V3 | null = null;
  let bd = Infinity;
  for (const t of ts) {
    const C = ev(t)[0];
    const d = dist(C, q);
    if (d < bd) {
      bd = d;
      best = [C[0], C[1], C[2]];
    }
  }
  return best;
}

/**
 * 모서리 끝이 제한된 거리 극소인지: 끝 매개변수 te에서 안쪽(other 쪽)으로 가면 거리가 는다(g = d(거리²/2)/dt의 부호가 안쪽 방향과 같다)
 */
const endIsMin = (gte: number, te: number, other: number): boolean => gte === 0 || Math.sign(other - te) * gte > 0;

/**
 * 다듬기 입력(묶음 좌표): 종류, 코어 점, 토막 번호(모서리 안), 첫 점, 커서 광선. 한 곡선으로 푸는 종류('perpendicular'·'midpoint'·'onEdge')만
 * 답하고 그 밖(교차점은 두 곡선 — intersectEdges, 모르는 종류)은 null
 */
export interface ArcRefineInput {
  kind: SnapRefineInput['kind'];
  point: readonly number[];
  k: number;
  first: readonly number[] | null;
  ray: { origin: readonly number[]; dir: readonly number[] };
}

/** 묶음 좌표에서 다듬은 곡선 위 점(규칙은 머리글). 못 구하면 null */
export function refineOnArc(arc: EdgeArc, c: ArcRefineInput): V3 | null {
  const { ev } = arc;
  const k = c.k;
  if (!(k >= 0 && k < arc.n)) return null;
  if (c.kind === 'midpoint') {
    const t = 0.5 * (arc.param(k) + arc.param(k + 1));
    if (!Number.isFinite(t)) return null;
    const C = ev(t)[0];
    return [C[0], C[1], C[2]];
  }
  const w = windowParams(arc, k);
  if (!w.ts.every(Number.isFinite)) return null;
  if (c.kind === 'perpendicular') {
    const F = c.first;
    if (!F) return null;
    const gh = (t: number): [number, number] => {
      const [C, D, A] = ev(t);
      const r = sub(C, F);
      return [dot(D, r), dot(A, r) + dot(D, D)];
    };
    return nearestTo(ev, rootsIn(w.ts, gh, false), c.point);
  }
  if (c.kind !== 'onEdge') return null;
  // 모서리 위 점: 커서 광선(o, 단위 d)까지 거리의 극소
  const o = c.ray.origin;
  const d = c.ray.dir;
  const gh = (t: number): [number, number] => {
    const [C, D, A] = ev(t);
    const r = sub(C, o);
    const s = dot(r, d);
    const q: V3 = [r[0] - s * d[0]!, r[1] - s * d[1]!, r[2] - s * d[2]!];
    const dd = dot(D, d);
    return [dot(q, D), dot(D, D) - dd * dd + dot(q, A)];
  };
  const cands = rootsIn(w.ts, gh, true);
  const ts = w.ts;
  const m = ts.length - 1;
  if (w.startEnd && endIsMin(gh(ts[0]!)[0], ts[0]!, ts[m]!)) cands.push(ts[0]!);
  if (w.endEnd && endIsMin(gh(ts[m]!)[0], ts[m]!, ts[0]!)) cands.push(ts[m]!);
  return nearestTo(ev, cands, c.point);
}

/**
 * 묶음 좌표 점 q에서 모서리 곡선까지 가장 가까운 점: 꺾은선 토막 k(q에 가까운 토막) 둘레(앞뒤 두 토막씩)에서 거리의 극소(모서리 끝 포함)
 * 가운데 가장 가까운 것. 곡선 위 점은 꺾은선(현)에서 화살 높이만큼 비켜 있어 꺾은선 거리로는 그 모서리 위인지 알 수 없을 때 쓴다
 */
export function nearestOnArc(arc: EdgeArc, q: readonly number[], k: number): { point: V3; dist: number } | null {
  if (!(k >= 0 && k < arc.n)) return null;
  const w = windowParams(arc, k);
  if (!w.ts.every(Number.isFinite)) return null;
  const { ev } = arc;
  const gh = (t: number): [number, number] => {
    const [C, D, A] = ev(t);
    const r = sub(C, q);
    return [dot(D, r), dot(A, r) + dot(D, D)];
  };
  const cands = rootsIn(w.ts, gh, true);
  const ts = w.ts;
  const m = ts.length - 1;
  cands.push(ts[0]!, ts[m]!);
  const p = nearestTo(ev, cands, q);
  return p ? { point: p, dist: dist(p, q) } : null;
}

// ── 그물·모서리 표에서 ──

/** 세계 점 p에서 그물 mesh의 모서리 e 곡선까지 거리(세계 단위, 꺾은선 토막 k 둘레). 곡선 정의가 없거나 못 구하면 null */
export function curveDistance(mesh: Mesh3d, table: StepEdgeTable, e: number, kinds: readonly string[], p: ArrayLike<number>, k: number): number | null {
  const E = mesh.edges;
  const L = E ? toLocal(mesh, p) : null;
  const arc = E && L ? edgeArc(E, table, e, kinds) : null;
  const r = arc && L ? nearestOnArc(arc, L.p, k) : null;
  return r && L ? r.dist * L.scale : null;
}

/** 모서리 곡선마다 곡선 길이 가운데 점(묶음 좌표 — 같은 부품의 여러 자리가 함께 쓴다) */
const midCache = new WeakMap<EdgeArc, V3 | null>();

/**
 * 그물 mesh의 모서리 e 곡선 길이 가운데 점(세계 — 원은 각 가운데, 타원·B-스플라인은 길이 적분). 두 끝 매개변수는 모서리 표 기록의 값
 * (원·타원은 해석기가 구한 두 끝 꼭짓점의 각, B-스플라인은 모서리 구간)이라 곡선 위 정확한 가운데다. 기록이 없는 옛 결과의 원·타원만
 * 윤곽선 꼭짓점(float32)에서 각을 구해 그 정밀도를 따른다. 곡선 정의가 없거나 못 구하면 null
 */
export function curveMidpoint(mesh: Mesh3d, table: StepEdgeTable, e: number, kinds: readonly string[]): V3 | null {
  const E = mesh.edges;
  const arc = E ? edgeArc(E, table, e, kinds) : null;
  if (!arc) return null;
  let m = midCache.get(arc);
  if (m === undefined) {
    const a = arc.param(0);
    const b = arc.param(arc.n);
    const t = arc.def.kind === 'circle' ? 0.5 * (a + b) : arcMidParam(arc.ev, arcCuts(arc.def, a, b));
    const C = Number.isFinite(t) ? arc.ev(t)[0] : null;
    midCache.set(arc, (m = C && C.every(Number.isFinite) ? [C[0], C[1], C[2]] : null));
  }
  if (!m) return null;
  const w = toWorld(mesh, m[0], m[1], m[2]);
  return w.every(Number.isFinite) ? w : null;
}

/** 코어가 넘긴 윤곽선 토막의 그물·모서리 표·모서리 번호와 모서리 안 토막 번호 k, 모서리 꼭짓점(묶음 좌표 float32 — 0 = 시작 … n = 끝) */
export interface EdgeHit {
  mesh: Mesh3d;
  table: StepEdgeTable;
  E: Float32Array;
  e: number;
  k: number;
  n: number;
  vertex(i: number): V3;
}

/** 토막 → 모서리. 선 형상·모르는 그물이거나 토막의 두 끝이 그물 윤곽선 꼭짓점과 맞지 않으면(분해·다른 자리 등 장면이 어긋남) null */
export function edgeHit(sg: SnapSegment, meshes: ReadonlyMap<string, Mesh3d>, ex: SnapEdgeIndex): EdgeHit | null {
  if (sg.kind !== 'edge') return null;
  const mesh = meshes.get(sg.id);
  const ti = ex.tableOf.get(sg.id);
  const table = ti === undefined ? undefined : ex.tables[ti];
  const E = mesh?.edges;
  if (!mesh || !table || !E) return null;
  const e = edgeAt(table, sg.raw);
  if (e < 0) return null;
  const s0 = table.segStart[e]!;
  const s1 = table.segStart[e + 1]!;
  if (!(s1 > s0) || E.length < s1 * 6) return null;
  const n = s1 - s0;
  const vertex = (i: number): V3 => {
    const o = i < n ? (s0 + i) * 6 : (s1 - 1) * 6 + 3;
    return [E[o]!, E[o + 1]!, E[o + 2]!];
  };
  const k = sg.raw - s0;
  const wa = toWorld(mesh, ...vertex(k));
  const wb = toWorld(mesh, ...vertex(k + 1));
  const tol = (q: readonly number[]): number => 4e-6 * (1 + Math.max(Math.abs(q[0]!), Math.abs(q[1]!), Math.abs(q[2]!)));
  if (dist(wa, sg.ends[0]) > tol(wa) || dist(wb, sg.ends[1]) > tol(wb)) return null;
  return { mesh, table, E, e, k, n, vertex };
}

// ── 두 모서리 곡선의 교차점(코어 0.15.0 'intersection') ──

/** 매개변수 곡선(세계): 점·1·2차 도함수와 매개변수 범위(free면 자르지 않는다) — 두 곡선 가우스-뉴턴이 쓴다 */
interface Track {
  ev: CurveEval;
  lo: number;
  hi: number;
  free: boolean;
}

/** 원·타원의 세계 틀: 중심, 단위 틀 축 X·Y, 반지름 a·b(각 t의 점 = c + a cos t X + b sin t Y — 묶음 좌표의 틀 각과 같은 t) */
interface Conic {
  c: V3;
  X: V3;
  Y: V3;
  a: number;
  b: number;
}

/**
 * 교차점을 풀 모서리 하나(세계 좌표). ev는 곡선(곧은 모서리는 시작 → 끝 꼭짓점 직선, 매개변수 [0, 1]), lo·hi는 모서리 범위,
 * free = 한 바퀴가 모두 모서리인 닫힌 주기 곡선(매개변수를 구간으로 자르지 않는다)
 */
interface Side extends Track {
  h: EdgeHit;
  /** 곡선 모서리(곧은 모서리는 null) */
  arc: EdgeArc | null;
  /** 모서리 두 끝 꼭짓점 */
  ends: [V3, V3];
  /** 커서 둘레(토막 k 앞뒤 두 토막) 매개변수 표본, 오름차순 */
  ts: number[];
  /** 토막 길이와 토막 끝의 float32 묶음 좌표 크기(자리 배율을 곱한 것) — 허용치 */
  len: number;
  mag: number;
  line: { a: V3; d: V3 } | null;
  circle: { c: V3; n: V3; r: number } | null;
  /** 원·타원이면 세계 틀(0.18.0 축 직선과의 교차 — 식) */
  conic: Conic | null;
}

/** 자리 변환의 길이 배율(회전·균등 배율·거울) */
function scaleOf(mesh: Mesh3d): number {
  const m = mesh.matrix;
  if (!m) return 1;
  const det = m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) + m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!);
  return Math.cbrt(Math.abs(det)) || 1;
}

function sideOf(sg: SnapSegment, meshes: ReadonlyMap<string, Mesh3d>, ex: SnapEdgeIndex): Side | null {
  const h = edgeHit(sg, meshes, ex);
  if (!h) return null;
  const { mesh } = h;
  const m = mesh.matrix;
  const W = (p: readonly number[]): V3 => toWorld(mesh, p[0]!, p[1]!, p[2]!);
  const lin = (v: readonly number[]): V3 =>
    m ? [m[0]! * v[0]! + m[4]! * v[1]! + m[8]! * v[2]!, m[1]! * v[0]! + m[5]! * v[1]! + m[9]! * v[2]!, m[2]! * v[0]! + m[6]! * v[1]! + m[10]! * v[2]!] : [v[0]!, v[1]!, v[2]!];
  const sc = scaleOf(mesh);
  const ends: [V3, V3] = [W(h.vertex(0)), W(h.vertex(h.n))];
  const va = h.vertex(h.k);
  const vb = h.vertex(h.k + 1);
  const len = dist(W(va), W(vb));
  const mag = Math.max(...va.map(Math.abs), ...vb.map(Math.abs)) * sc;
  if (ex.kinds[h.table.kinds[h.e]!] === 'line') {
    const a = ends[0];
    const d = sub(ends[1], a);
    const ev: CurveEval = (t) => [[a[0] + t * d[0], a[1] + t * d[1], a[2] + t * d[2]], d, [0, 0, 0]];
    return { h, arc: null, ends, ev, lo: 0, hi: 1, free: false, ts: [0, 1], len, mag, line: { a, d }, circle: null, conic: null };
  }
  const arc = edgeArc(h.E, h.table, h.e, ex.kinds);
  if (!arc) return null;
  const t0 = arc.param(0);
  const t1 = arc.param(h.n);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  const def = arc.def;
  const turn = def.kind === 'bspline' ? def.period : TAU;
  const free = turn > 0 && Math.abs(Math.abs(t1 - t0) - turn) <= 1e-9 * turn;
  const ev: CurveEval = (t) => {
    const [C, D, A] = arc.ev(t);
    return [W(C), lin(D), lin(A)];
  };
  const w = windowParams(arc, h.k);
  if (!w.ts.every(Number.isFinite)) return null;
  const n = def.kind === 'circle' ? dirToWorld(mesh, def.normal[0], def.normal[1], def.normal[2]) : null;
  const circle = def.kind === 'circle' && n ? { c: W(def.center), n, r: def.r * sc } : null;
  // 원·타원 틀(묶음 좌표의 단위 틀 축을 세계로 — 자리 변환은 회전·균등 배율·거울이라 직교·같은 각이다)
  const cn = arc.conic;
  const X = cn ? dirToWorld(mesh, cn.X[0], cn.X[1], cn.X[2]) : null;
  const Y = cn ? dirToWorld(mesh, cn.Y[0], cn.Y[1], cn.Y[2]) : null;
  const conic = cn && X && Y && def.kind !== 'bspline' ? { c: W(def.center), X, Y, a: cn.a * sc, b: cn.b * sc } : null;
  return { h, arc, ends, ev, lo: Math.min(t0, t1), hi: Math.max(t0, t1), free, ts: w.ts.sort((x, y) => x - y), len, mag, line: null, circle, conic };
}

/** 세계 점 X가 모서리 범위 안인지(곧은 모서리는 두 끝 사이, 원·타원 호는 두 끝 각 사이 — 허용치 slack만큼 넓혀). B-스플라인은 늘 참(반복이 구간 안에 머문다) */
function onSide(s: Side, X: V3, slack: number): boolean {
  if (s.line) {
    const dd = dot(s.line.d, s.line.d);
    const t = dot(sub(X, s.line.a), s.line.d) / dd;
    const e = slack / Math.sqrt(dd);
    return t >= -e && t <= 1 + e;
  }
  const def = s.arc!.def;
  const cn = s.arc!.conic;
  if (s.free || !cn || def.kind === 'bspline') return true;
  const L = toLocal(s.h.mesh, X);
  if (!L) return false;
  const d = sub(L.p, def.center);
  const th = Math.atan2(dot(d, cn.Y) / cn.b, dot(d, cn.X) / cn.a);
  const e = slack / (Math.min(cn.a, cn.b) * L.scale);
  // th를 2π씩 옮겨 [lo − e, hi + e]에 드는 것이 있는지
  return th + Math.ceil((s.lo - e - th) / TAU) * TAU <= s.hi + e;
}

/** 원 위에서 P에 가장 가까운 점(P를 원 평면에 내린 자리의 반지름 방향 — P가 원의 축 위면 null) */
function onCircle(c: { c: V3; n: V3; r: number }, P: readonly number[]): V3 | null {
  const d = sub(P, c.c);
  const h = dot(d, c.n);
  const q: V3 = [d[0] - h * c.n[0], d[1] - h * c.n[1], d[2] - h * c.n[2]];
  const l = Math.hypot(q[0], q[1], q[2]);
  return l > 0 ? [c.c[0] + (q[0] * c.r) / l, c.c[1] + (q[1] * c.r) / l, c.c[2] + (q[2] * c.r) / l] : null;
}

const addK = (a: readonly number[], b: readonly number[], k: number): V3 => [a[0]! + k * b[0]!, a[1]! + k * b[1]!, a[2]! + k * b[2]!];
const crossV = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** 두 곡선 위 점 짝(교차점 후보 — 둘 사이가 허용치 안이면 그 가운데가 교차점) */
type Pair = [V3, V3];

/**
 * 직선과 원(식): 직선이 원 평면을 지나는 점과 그 점에서 가장 가까운 원 위 점. 직선이 원 평면 위에 놓이면 평면 안의 두 교점(이차식).
 * 짝은 [직선 위, 원 위]
 */
function lineCircle(l: { a: V3; d: V3 }, c: { c: V3; n: V3; r: number }, tol: number): Pair[] {
  const out: Pair[] = [];
  const push = (P: V3): void => {
    const Q = onCircle(c, P);
    if (Q) out.push([P, Q]);
  };
  const dl = Math.hypot(l.d[0], l.d[1], l.d[2]);
  const un = dot(l.d, c.n);
  if (Math.abs(un) > 1e-9 * dl) {
    push(addK(l.a, l.d, dot(sub(c.c, l.a), c.n) / un));
    return out;
  }
  if (Math.abs(dot(sub(l.a, c.c), c.n)) > tol) return out;
  const f = addK(l.a, l.d, dot(sub(c.c, l.a), l.d) / (dl * dl));
  const g = sub(f, c.c);
  const h = Math.sqrt(Math.max(0, c.r * c.r - dot(g, g))) / dl;
  push(addK(f, l.d, h));
  if (h > 0) push(addK(f, l.d, -h));
  return out;
}

/**
 * 원 둘(식): 두 평면이 만나는 직선과 원 1의 두 교점(원 1 위·평면 2 위)에서 가장 가까운 원 2 위 점. 같은 평면이면 평면 안 두 원의 교점,
 * 나란한 다른 평면·같은 중심은 없다. 짝은 [원 1 위, 원 2 위]
 */
function circleCircle(c1: { c: V3; n: V3; r: number }, c2: { c: V3; n: V3; r: number }, tol: number): Pair[] {
  const m = crossV(c1.n, c2.n);
  const mm = dot(m, m);
  let f: V3;
  let u: V3;
  if (mm > 1e-18) {
    // 두 평면 n·x = h 위의 점: (h1 (n2 × m) + h2 (m × n1)) / |m|²
    const h1 = dot(c1.n, c1.c);
    const h2 = dot(c2.n, c2.c);
    const p0 = addK(addK([0, 0, 0], crossV(c2.n, m), h1 / mm), crossV(m, c1.n), h2 / mm);
    u = [m[0] / Math.sqrt(mm), m[1] / Math.sqrt(mm), m[2] / Math.sqrt(mm)];
    f = addK(p0, u, dot(sub(c1.c, p0), u));
  } else {
    const d = sub(c2.c, c1.c);
    if (Math.abs(dot(d, c1.n)) > tol) return [];
    const dl = Math.hypot(d[0], d[1], d[2]);
    if (!(dl > tol)) return [];
    const e: V3 = [d[0] / dl, d[1] / dl, d[2] / dl];
    f = addK(c1.c, e, (c1.r * c1.r - c2.r * c2.r + dl * dl) / (2 * dl));
    u = crossV(c1.n, e);
  }
  const g = sub(f, c1.c);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - dot(g, g)));
  const out: Pair[] = [];
  for (const s of h > 0 ? [h, -h] : [0]) {
    const X = addK(f, u, s);
    const P = onCircle(c1, X);
    const Q = onCircle(c2, X);
    if (P && Q) out.push([P, Q]);
  }
  return out;
}

/**
 * 두 매개변수 가우스-뉴턴: F(s, t) = A(s) − B(t)의 제곱을 줄인다(정규 방정식 [A′·A′, −A′·B′; −A′·B′, B′·B′] Δ = −[A′·F, −B′·F],
 * 늘면 걸음을 반씩). 매개변수는 모서리 구간 안으로(닫힌 주기 곡선은 그대로). 만나는 두 곡선이면 두 차례로 줄어 교차점에 닿고,
 * 비켜 지나가면 가장 가까운 두 점에 머문다. 두 접선이 나란해지면(접하는 자리) 멈춘다
 */
function closestOnPair(A: Track, B: Track, s: number, t: number): Pair {
  const fit = (x: Track, v: number): number => (x.free ? v : Math.min(x.hi, Math.max(x.lo, v)));
  let [P, DA] = A.ev(s);
  let [Q, DB] = B.ev(t);
  let F = sub(P, Q);
  let f2 = dot(F, F);
  for (let it = 0; it < 64 && f2 > 0; it++) {
    const a11 = dot(DA, DA);
    const a12 = -dot(DA, DB);
    const a22 = dot(DB, DB);
    const g1 = dot(DA, F);
    const g2 = -dot(DB, F);
    const det = a11 * a22 - a12 * a12;
    if (!(det > 1e-14 * a11 * a22)) break;
    const ds = (-g1 * a22 + g2 * a12) / det;
    const dt = (-g2 * a11 + g1 * a12) / det;
    let moved = false;
    for (let k = 0, w = 1; k < 30; k++, w *= 0.5) {
      const ns = fit(A, s + w * ds);
      const nt = fit(B, t + w * dt);
      const ea = A.ev(ns);
      const eb = B.ev(nt);
      const nF = sub(ea[0], eb[0]);
      const n2 = dot(nF, nF);
      if (n2 < f2) {
        moved = ns !== s || nt !== t;
        [s, t, P, DA, Q, DB, F, f2] = [ns, nt, ea[0], ea[1], eb[0], eb[1], nF, n2];
        break;
      }
    }
    if (!moved) break;
  }
  return [[P[0], P[1], P[2]], [Q[0], Q[1], Q[2]]];
}

/**
 * 두 곡선(어느 하나가 타원·B-스플라인 — 곧은 모서리 하나는 섞여도 된다)의 교차점 후보: 곡선 하나(곧은 모서리가 있으면 다른 쪽)의 커서 둘레 표본마다
 * 다른 곡선까지 거리(곧은 모서리는 투영, 곡선은 그 커서 둘레 표본 가운데 가장 가까운 것)를 재고, 그 거리의 극소 세 곳에서 가우스-뉴턴. 짝은 [A 위, B 위]
 */
function curvePairs(A: Side, B: Side): Pair[] {
  const swap = !!A.line;
  const S = swap ? B : A;
  const T = swap ? A : B;
  const PT = T.line ? null : T.ts.map((t) => T.ev(t)[0]);
  const tt: number[] = [];
  const d: number[] = [];
  for (const s of S.ts) {
    const p = S.ev(s)[0];
    let tb = 0;
    let q: readonly number[];
    if (T.line) {
      const { a, d: v } = T.line;
      tb = Math.min(1, Math.max(0, dot(sub(p, a), v) / dot(v, v)));
      q = addK(a, v, tb);
    } else {
      let j = 0;
      for (let i = 1; i < PT!.length; i++) if (dist(p, PT![i]!) < dist(p, PT![j]!)) j = i;
      tb = T.ts[j]!;
      q = PT![j]!;
    }
    tt.push(tb);
    d.push(dist(p, q));
  }
  const mins: number[] = [];
  for (let i = 0; i < d.length; i++) if ((i === 0 || d[i]! <= d[i - 1]!) && (i === d.length - 1 || d[i]! <= d[i + 1]!)) mins.push(i);
  mins.sort((x, y) => d[x]! - d[y]!);
  return mins.slice(0, 3).map((i) => {
    const [p, q] = closestOnPair(S, T, S.ts[i]!, tt[i]!);
    return swap ? [q, p] : [p, q];
  });
}

/**
 * 코어 교차점(0.15.0 'intersection' — 꺾은선 두 토막의 교차점이나 조금 비켜 지나가는 두 토막의 넓힌 교차점) → 두 B-rep 모서리 곡선의 3D 교차점(세계).
 * - 두 토막이 모두 윤곽선이어야 한다. 곧은 모서리는 그 두 끝 꼭짓점(float32 윤곽선)을 잇는 직선, 곡선은 모서리 표 정의. 둘 다 곧으면
 *   꺾은선이 곧 모서리라 코어 점이 정확하다(null). 같은 모서리, 곡선 정의가 없는 모서리도 null
 * - 직선·원끼리는 식(lineCircle·circleCircle), 타원·B-스플라인이 끼면 커서 둘레 표본에서 시작하는 두 매개변수 가우스-뉴턴(curvePairs)
 * - 허용치 tol = 1e-6 × (두 토막 길이 합 + 토막 끝 묶음 좌표 크기): 두 곡선 위 점 사이가 이보다 멀면 3D로 만나지 않는 것(null). 받은 점은 두 점의 가운데이고,
 *   두 모서리 범위(곧은 모서리는 두 끝 사이, 호는 두 끝 각 사이) 안이어야 한다. 후보가 여럿이면 코어 점에 가장 가까운 것
 * - 두 모서리가 함께 쓰는 꼭짓점(끝 꼭짓점끼리 tol 안)에서 만나면 null(끝점 붙잡기가 이미 정확하다 — 그 꼭짓점에서 두 토막 길이 합의 1e-4 안)
 * 결과는 두 토막·코어 점으로만 정해진다(커서 광선·첫 점을 쓰지 않는다 — 열린 후보의 기억 약속)
 */
export function intersectEdges(c: SnapRefineInput, meshes: ReadonlyMap<string, Mesh3d>, ex: SnapEdgeIndex): V3 | null {
  const o = c.other;
  if (!o) return null;
  const A = sideOf(c.segment, meshes, ex);
  const B = A && sideOf(o, meshes, ex);
  if (!A || !B || (A.line && B.line) || (A.h.mesh === B.h.mesh && A.h.e === B.h.e)) return null;
  const tol = 1e-6 * (A.len + B.len + Math.max(A.mag, B.mag));
  let pairs: Pair[];
  if (A.line && B.circle) pairs = lineCircle(A.line, B.circle, tol);
  else if (A.circle && B.line) pairs = lineCircle(B.line, A.circle, tol).map(([p, q]): Pair => [q, p]);
  else if (A.circle && B.circle) pairs = circleCircle(A.circle, B.circle, tol);
  else pairs = curvePairs(A, B);
  let best: V3 | null = null;
  let bd = Infinity;
  for (const [P, Q] of pairs) {
    if (!(dist(P, Q) <= tol) || !onSide(A, P, tol) || !onSide(B, Q, tol)) continue;
    const X: V3 = [0.5 * (P[0] + Q[0]), 0.5 * (P[1] + Q[1]), 0.5 * (P[2] + Q[2])];
    const d = dist(X, c.point);
    if (d < bd) [bd, best] = [d, X];
  }
  if (!best || !best.every(Number.isFinite)) return null;
  const near = Math.max(tol, 1e-4 * (A.len + B.len));
  for (const a of A.ends) for (const b of B.ends) if (dist(a, b) <= tol && dist(best, a) <= near) return null;
  return best;
}

// ── 축 직선과 모서리 곡선의 교차(코어 0.18.0 'axisEdge') ──

/** 축 직선(지나는 점 a, 단위 방향 d — 매개변수 s의 점 = a + s d) */
interface Line3 {
  a: V3;
  d: V3;
}

/** 축 직선과 곧은 모서리(a + t g, t ∈ [0, 1] — 범위는 onSide가 본다)의 가장 가까운 두 점(식). 나란하면 없다. 짝은 [직선 위, 모서리 위] */
function axisLine(L: Line3, a: V3, g: V3): Pair[] {
  const w = sub(L.a, a);
  const b = dot(L.d, g);
  const c = dot(g, g);
  const den = c - b * b;
  if (!(den > 1e-12 * c)) return [];
  const p = dot(L.d, w);
  const e = dot(g, w);
  return [[addK(L.a, L.d, (b * e - c * p) / den), addK(a, g, (e - b * p) / den)]];
}

/**
 * 축 직선과 원·타원(식): 직선이 곡선 평면을 지나는 점과, 직선을 평면에 내린 그림자가 곡선과 만나는 두 점((u/a)² + (v/b)² = 1의 이차식 —
 * 직선이 평면 위에 놓일 때의 교점, 닿을락 말락이면 가장 가까운 자리 하나). 곡선 위 짝은 그 점의 틀 각 atan2(v/b, u/a)의 점이라,
 * 직선 위 점이 곡선 위가 아니면 둘이 떨어진다(허용치로 거른다). 짝은 [직선 위, 곡선 위]
 */
function axisConic(L: Line3, k: Conic): Pair[] {
  const n = crossV(k.X, k.Y);
  const r = sub(L.a, k.c);
  const u0 = dot(r, k.X);
  const v0 = dot(r, k.Y);
  const du = dot(L.d, k.X);
  const dv = dot(L.d, k.Y);
  const dw = dot(L.d, n);
  const out: Pair[] = [];
  const push = (s: number): void => {
    if (!Number.isFinite(s)) return;
    const t = Math.atan2((v0 + s * dv) / k.b, (u0 + s * du) / k.a);
    out.push([addK(L.a, L.d, s), addK(addK(k.c, k.X, k.a * Math.cos(t)), k.Y, k.b * Math.sin(t))]);
  };
  if (Math.abs(dw) > 1e-12) push(-dot(r, n) / dw);
  const ia = 1 / (k.a * k.a);
  const ib = 1 / (k.b * k.b);
  const A = du * du * ia + dv * dv * ib;
  if (!(A > 1e-24)) return out;
  const B = 2 * (u0 * du * ia + v0 * dv * ib);
  const C = u0 * u0 * ia + v0 * v0 * ib - 1;
  const D = B * B - 4 * A * C;
  if (!(D > 0)) {
    push(-B / (2 * A));
    return out;
  }
  // 근의 공식의 빼기 오차를 피하는 꼴
  const q = -0.5 * (B + (B < 0 ? -1 : 1) * Math.sqrt(D));
  push(q / A);
  if (q !== 0) push(C / q);
  return out;
}

/**
 * 축 직선과 그 밖의 곡선(B-스플라인 — 반복): 모서리의 커서 둘레 표본마다 축 직선까지 거리를 재고, 그 거리의 극소 세 곳에서
 * 두 매개변수 가우스-뉴턴(closestOnPair — 직선 쪽은 자르지 않는다). 짝은 [직선 위, 곡선 위]
 */
function axisCurve(L: Line3, S: Side): Pair[] {
  const line: Track = { ev: (s) => [addK(L.a, L.d, s), L.d, [0, 0, 0]], lo: -Infinity, hi: Infinity, free: true };
  const ss: number[] = [];
  const d: number[] = [];
  for (const t of S.ts) {
    const p = S.ev(t)[0];
    const s = dot(sub(p, L.a), L.d);
    ss.push(s);
    d.push(dist(p, addK(L.a, L.d, s)));
  }
  const mins: number[] = [];
  for (let i = 0; i < d.length; i++) if ((i === 0 || d[i]! <= d[i - 1]!) && (i === d.length - 1 || d[i]! <= d[i + 1]!)) mins.push(i);
  mins.sort((x, y) => d[x]! - d[y]!);
  return mins.slice(0, 3).map((i) => {
    const [q, p] = closestOnPair(S, line, S.ts[i]!, ss[i]!);
    return [p, q];
  });
}

/**
 * 코어 축과 선분의 교차(0.18.0 'axisEdge' — 첫 점 축·끌어온 축이 꺾은선 토막과 만나는 점) → 축 직선(c.line)과 그 토막의 B-rep 모서리 곡선의 교차(세계, 축 직선 위 점).
 * - 곧은 모서리는 두 끝 꼭짓점(float32 윤곽선)을 잇는 직선과의 가장 가까운 두 점, 원·타원은 식(axisConic), B-스플라인은 반복(axisCurve)
 * - 허용치 tol = 1e-6 × (토막 길이 + 토막 끝 묶음 좌표 크기)(교차점과 같다): 직선 위 점과 곡선 위 점 사이가 이보다 멀면 만나지 않는 것.
 *   곡선 위 점이 모서리 범위(곧은 모서리는 두 끝 사이, 호는 두 끝 각 사이) 안이어야 하고, 축이 지나는 점(첫 점·끌어온 점) 자리는 뺀다
 *   (그 점이 곡선 위라서 만나는 것 — 코어도 뺀다). 후보가 여럿(평면 위 직선과 원의 두 교점 등)이면 코어 점에 가장 가까운 것
 * - 돌려주는 점은 직선 위 점이다(세계 축이면 지나는 점과 남은 두 좌표가 정확히 같다 — 코어 acceptOnLine이 다시 축 위로 내려도 그대로)
 * 결과는 토막·코어 점·축 직선으로만 정해진다(커서 광선·첫 점을 쓰지 않는다 — 코어가 커서 광선을 빼고 기억한다)
 */
export function intersectAxis(c: SnapRefineInput, meshes: ReadonlyMap<string, Mesh3d>, ex: SnapEdgeIndex): V3 | null {
  const l = c.line;
  const d = l ? unitOf(l.dir) : null;
  if (!l || !d || !l.origin.every(Number.isFinite)) return null;
  const S = sideOf(c.segment, meshes, ex);
  if (!S) return null;
  const L: Line3 = { a: [l.origin[0], l.origin[1], l.origin[2]], d };
  const tol = 1e-6 * (S.len + S.mag);
  const pairs = S.line ? axisLine(L, S.line.a, S.line.d) : S.conic ? axisConic(L, S.conic) : axisCurve(L, S);
  let best: V3 | null = null;
  let bd = Infinity;
  for (const [P, Q] of pairs) {
    if (!(dist(P, Q) <= tol) || !onSide(S, Q, tol) || dist(P, L.a) <= tol) continue;
    const e = dist(P, c.point);
    if (e < bd) [bd, best] = [e, P];
  }
  return best && best.every(Number.isFinite) ? best : null;
}

/**
 * 코어 refine 입력 → 다듬은 세계 점. 수직 발(열린 후보 포함)·모서리 위 점·코어 가운데 점은 그 토막의 곡선 위로(refineOnArc), 교차점은 두 모서리 곡선의
 * 교차점(intersectEdges), 축과 선분의 교차(0.18.0 'axisEdge')는 축 직선과 모서리 곡선의 교차(intersectAxis — 곧은 모서리도).
 * 모르는 종류, 직선·곡선 정의 없음·선 형상·못 찾으면 null. 토막의 두 끝이 그물 윤곽선 꼭짓점과 맞지 않으면
 * (분해·다른 자리 등 장면이 어긋남) 다듬지 않는다
 */
export function refineSnap(c: SnapRefineInput, meshes: ReadonlyMap<string, Mesh3d>, ex: SnapEdgeIndex): V3 | null {
  if (c.kind === 'intersection') return intersectEdges(c, meshes, ex);
  if (c.kind === 'axisEdge') return intersectAxis(c, meshes, ex);
  if (c.kind !== 'perpendicular' && c.kind !== 'midpoint' && c.kind !== 'onEdge') return null;
  const h = edgeHit(c.segment, meshes, ex);
  const arc = h ? edgeArc(h.E, h.table, h.e, ex.kinds) : null;
  if (!h || !arc) return null;
  const { mesh, k } = h;
  const P = toLocal(mesh, c.point);
  const F = c.first ? toLocal(mesh, c.first) : null;
  const O = toLocal(mesh, c.ray.origin);
  const D = dirToLocal(mesh, c.ray.dir);
  if (!P || !O || !D || (c.first && !F)) return null;
  const q = refineOnArc(arc, { kind: c.kind, point: P.p, k, first: F?.p ?? null, ray: { origin: O.p, dir: D } });
  if (!q) return null;
  const w = toWorld(mesh, q[0], q[1], q[2]);
  return w.every(Number.isFinite) ? w : null;
}

/** 장면의 곡선 붙잡기(코어 refine과 앱 곡선 가운데 점). 모서리 표가 없으면 null */
export function curveSnap(meshes: readonly Mesh3d[], ex: SnapEdgeIndex | null): CurveSnap | null {
  if (!ex) return null;
  const byId = new Map(meshes.map((m) => [m.id, m] as const));
  return {
    refine: (c) => refineSnap(c, byId, ex),
    mid: (mesh, table, e) => curveMidpoint(mesh, table, e, ex.kinds),
  };
}
