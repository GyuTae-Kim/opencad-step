/**
 * 두 점 측정 붙잡기 점을 B-rep 곡선 위로(코어 0.14.0 setMeasureSnap의 refine — DOM 없음, 곡선 접선 잠금 조각과 함께 문서를 열 때 받는다).
 *
 * 코어 측정 붙잡기는 화면용 꺾은선(윤곽선) 토막 위의 점을 고른다. 그 토막이 곡선 모서리(원·타원·B-스플라인 — 모서리 표에 곡선 정의가 있는 것)의
 * 것이면 정확한 곡선 위로 옮긴 세계 점을 돌려준다. 직선 모서리·곡선 정의가 없는 모서리·선 형상 묶음은 null(코어 점 그대로).
 * - 꺾은선 꼭짓점은 곡선 위 점이다(해석기가 곡선 매개변수 t_i의 점으로 나눈다 — 두 끝은 STEP 꼭짓점). 모서리마다 꼭짓점의 곡선 매개변수를
 *   처음 쓸 때 구해 둔다: 두 끝은 모서리 표 기록의 값(원·타원은 해석기가 구한 틀 각, B-스플라인은 모서리 구간 ta·tb), 안쪽은 원·타원이면 틀 각(atan2)을
 *   모서리 방향으로 펼쳐서, B-스플라인이면 표본에서 가장 가까운 매개변수다. 토막 k는 곡선 매개변수 [T[k], T[k+1]]의 현이다.
 * - 수직 발('perpendicular'): 첫 점 F에서 곡선으로 내린 발. 토막 k 둘레(앞뒤 두 토막씩)의 곡선에서 (C − F)·C′ = 0인 매개변수 가운데
 *   코어 발(현 위)에 가장 가까운 것. 없으면 null
 * - 모서리 위 점('onEdge'): 커서 광선에 가장 가까운 곡선 위 점. 같은 둘레에서 광선까지 거리의 극소(모서리 끝으로 나가면 그 끝) 가운데 코어 점에 가장 가까운 것
 * - 코어 가운데 점('midpoint'): 그 토막 두 끝 매개변수의 가운데(원은 그 호의 길이 가운데와 같다). STEP은 코어 가운데 점을 끄므로 지금은 오지 않는다
 * - 앱이 주는 곡선 가운데 점(pointsFor — 앱 점이라 코어가 다듬지 않는다)은 곡선 길이 가운데(curveMidpoint): 원은 각 가운데, 타원·B-스플라인은 길이 적분
 * 결과는 넘긴 값과 모서리 표·그물로만 정해진다(같은 입력에 같은 점 — 코어가 앞 결과를 다시 쓴다). 문서가 바뀌면 앱이 setMeasureSnap을 다시 준다.
 */
import type { SnapRefineInput } from 'opencad-viewer3d';
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
  return { def, ev: fr.ev, n, param, vertex };
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

/** 다듬기 입력(묶음 좌표): 종류, 코어 점, 토막 번호(모서리 안), 첫 점, 커서 광선 */
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

/**
 * 코어 refine 입력 → 다듬은 세계 점(직선·곡선 정의 없음·선 형상·못 찾으면 null). 토막의 두 끝이 그물 윤곽선 꼭짓점과 맞지 않으면
 * (분해·다른 자리 등 장면이 어긋남) 다듬지 않는다
 */
export function refineSnap(c: SnapRefineInput, meshes: ReadonlyMap<string, Mesh3d>, ex: SnapEdgeIndex): V3 | null {
  const sg = c.segment;
  if (sg.kind !== 'edge') return null;
  const mesh = meshes.get(sg.id);
  const ti = ex.tableOf.get(sg.id);
  const table = ti === undefined ? undefined : ex.tables[ti];
  const E = mesh?.edges;
  if (!mesh || !table || !E) return null;
  const e = edgeAt(table, sg.raw);
  if (e < 0) return null;
  const arc = edgeArc(E, table, e, ex.kinds);
  if (!arc) return null;
  const k = sg.raw - table.segStart[e]!;
  const va = arc.vertex(k);
  const vb = arc.vertex(k + 1);
  const wa = toWorld(mesh, va[0], va[1], va[2]);
  const wb = toWorld(mesh, vb[0], vb[1], vb[2]);
  const tol = (q: readonly number[]): number => 4e-6 * (1 + Math.max(Math.abs(q[0]!), Math.abs(q[1]!), Math.abs(q[2]!)));
  if (dist(wa, sg.ends[0]) > tol(wa) || dist(wb, sg.ends[1]) > tol(wb)) return null;
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
