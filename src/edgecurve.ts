/**
 * 모서리 표의 곡선 정의와 곡선 위 가장 가까운 점(순수 계산, DOM 없음 — 워커가 싣고 화면이 읽는다).
 *
 * 측정 접선 잠금이 첫 점(곡선 모서리 위 아무 데 — 화면용 꺾은선 위라 곡선에서 조금 떨어질 수 있다)에서 B-rep 곡선의 접선을 구할 때 쓴다.
 * 붙잡은 점을 B-rep 곡선 위로 다듬거나(수직 발) 곡선 위 매개변수를 알 때도 같은 함수를 쓸 수 있다.
 *
 * 모서리 표 기록(curves[curveStart[e], curveStart[e+1]) — 형상 항목 좌표·단위, 좌표는 묶음 원점을 뺀 값):
 * - 원: 기록 없음. 모서리 표 params(반지름·원 평면 법선·중심)로 가장 가까운 점과 접선을 식으로 구한다
 * - 타원: [xx, xy, xz] — 틀 x축(단위, 첫 반지름 a 쪽). 두 반지름·법선·중심은 params
 * - B-스플라인: [차수 p, 조절점 수 n, 유리 1·아니면 0, 모서리 시작 매개변수 ta, 끝 tb, 주기(닫힌 곡선, 아니면 0),
 *   매듭 n+p+1개, 조절점 n개(유리면 x,y,z,w — 아니면 x,y,z)]. 기록이 BSPLINE_RECORD_MAX 수를 넘으면 싣지 않는다
 *   (화면은 꺾은선 꼭짓점으로 접선을 어림한다)
 * 가장 가까운 매개변수: 원은 식, 타원은 매개변수 각(atan2)에서, B-스플라인은 매듭 구간을 나눈 표본에서 시작해
 * 거리 제곱의 도함수가 0인 곳을 뉴턴(+ 부호가 바뀌는 구간이면 반 나눔)으로 찾는다.
 */
import type { V3 } from './math';
import { NurbsCurve } from './nurbs';

/** B-스플라인 기록 머리 수: 차수, 조절점 수, 유리, ta, tb, 주기 */
export const BSPLINE_HEAD = 6;
/**
 * B-스플라인 기록 한도(수의 개수, float64): 512개(4 KiB) — 비유리 3차면 조절점 125개, 유리 3차면 100개까지.
 * 넘는 모서리는 정의를 싣지 않는다(화면은 꺾은선 꼭짓점 접선으로 어림)
 */
export const BSPLINE_RECORD_MAX = 512;

export interface CircleDef {
  kind: 'circle';
  center: V3;
  /** 원 평면 법선(단위가 아니어도 된다) */
  normal: V3;
  r: number;
}

export interface EllipseDef {
  kind: 'ellipse';
  center: V3;
  normal: V3;
  /** 틀 x축(반지름 a 쪽 — a가 b보다 작을 수도 있다) */
  x: V3;
  a: number;
  b: number;
}

export interface BsplineDef {
  kind: 'bspline';
  degree: number;
  /** 매듭 n+p+1개 */
  knots: Float64Array;
  /** 조절점 xyz(유리면 xyzw)… */
  ctrl: Float64Array;
  rational: boolean;
  /** 모서리가 쓰는 매개변수 구간(시작·끝 — 끝이 작을 수 있고, 닫힌 곡선이면 매듭 구간을 넘을 수 있다) */
  ta: number;
  tb: number;
  /** 닫힌 곡선의 주기(아니면 0) */
  period: number;
}

export type EdgeCurve = CircleDef | EllipseDef | BsplineDef;

/** 곡선 위 가장 가까운 점: 매개변수, 점, 단위 접선(매개변수가 커지는 쪽), 거리 */
export interface CurveFoot {
  t: number;
  point: V3;
  tangent: V3;
  dist: number;
}

/** 점과 1·2차 도함수 */
export type CurveEval = (t: number) => readonly [V3, V3, V3];

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (a: readonly number[]): V3 | null => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!);
  return l > 0 && Number.isFinite(l) ? [a[0]! / l, a[1]! / l, a[2]! / l] : null;
};
const finite3 = (a: readonly number[]): boolean => Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]);

// ── 기록 만들기(워커) ──

/** 타원 기록: 틀 x축 */
export function ellipseRecord(x: readonly number[]): number[] {
  return [x[0]!, x[1]!, x[2]!];
}

/**
 * B-스플라인 기록(NurbsCurve 그대로 — 매듭은 펼친 것, 조절점은 동차 좌표에서 되돌린 직교 좌표에서 origin을 뺀다).
 * 모서리 매개변수 구간 ta → tb, 닫힌 곡선이면 주기. 한도(max)를 넘으면 null
 */
export function bsplineRecord(nc: NurbsCurve, ta: number, tb: number, period: number, origin?: readonly number[] | null, max = BSPLINE_RECORD_MAX): number[] | null {
  const p = nc.basis.p;
  const U = nc.basis.U;
  const n = nc.cw.length / 4;
  const stride = nc.rational ? 4 : 3;
  const size = BSPLINE_HEAD + U.length + n * stride;
  if (size > max || U.length !== n + p + 1 || !Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  const out: number[] = [p, n, nc.rational ? 1 : 0, ta, tb, period > 0 ? period : 0];
  for (const u of U) out.push(u);
  const o = origin ?? [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const w = nc.cw[i * 4 + 3]! || 1;
    out.push(nc.cw[i * 4]! / w - o[0]!, nc.cw[i * 4 + 1]! / w - o[1]!, nc.cw[i * 4 + 2]! / w - o[2]!);
    if (stride === 4) out.push(w);
  }
  return out.every(Number.isFinite) ? out : null;
}

/** 기록 길이 배율 k(장면 단위로 바꿀 때 — 원·타원 params는 따로): 타원 축은 그대로, B-스플라인 조절점 좌표만 k배 */
export function scaleCurveRecords(curveStart: Uint32Array, curves: Float64Array, kinds: Uint8Array, kindNames: readonly string[], k: number): Float64Array {
  const out = new Float64Array(curves);
  for (let e = 0; e + 1 < curveStart.length; e++) {
    const s = curveStart[e]!;
    if (curveStart[e + 1]! <= s || kindNames[kinds[e]!] !== 'bspline') continue;
    const p = out[s]!;
    const n = out[s + 1]!;
    const stride = out[s + 2] ? 4 : 3;
    const c0 = s + BSPLINE_HEAD + n + p + 1;
    for (let i = 0; i < n; i++)
      for (let q = 0; q < 3; q++) {
        const j = c0 + i * stride + q;
        out[j] = out[j]! * k;
      }
  }
  return out;
}

// ── 기록 읽기(화면) ──

/** 곡선 정의를 읽을 모서리 표 칸(brep.ts EdgeTableData) */
export interface CurveTable {
  kinds: Uint8Array;
  params: Float64Array;
  curveStart?: Uint32Array;
  curves?: Float64Array;
}

/** 모서리 표 매개변수 개수(brep.ts EDGE_PARAMS) */
const NP = 8;

/** 모서리 e의 곡선 정의(형상 항목 좌표, 묶음 원점을 뺀 값). 직선·모르는 곡선·실리지 않은 정의(한도 넘음·옛 결과)는 null */
export function edgeCurve(table: CurveTable, e: number, kindNames: readonly string[]): EdgeCurve | null {
  const kind = kindNames[table.kinds[e]!];
  const P = table.params;
  const o = e * NP;
  if (kind === 'circle' || kind === 'ellipse') {
    const r = P[o]!;
    const normal: V3 = [P[o + 2]!, P[o + 3]!, P[o + 4]!];
    const center: V3 = [P[o + 5]!, P[o + 6]!, P[o + 7]!];
    if (!(r > 0) || !finite3(normal) || !finite3(center) || !unit(normal)) return null;
    if (kind === 'circle') return { kind, center, normal, r };
    const rec = record(table, e);
    if (!rec || rec.length !== 3) return null;
    const x: V3 = [rec[0]!, rec[1]!, rec[2]!];
    const b = P[o + 1]!;
    return finite3(x) && unit(x) && b > 0 ? { kind, center, normal, x, a: r, b } : null;
  }
  if (kind !== 'bspline') return null;
  const rec = record(table, e);
  if (!rec || rec.length < BSPLINE_HEAD) return null;
  const p = rec[0]!;
  const n = rec[1]!;
  const rational = rec[2] === 1;
  const stride = rational ? 4 : 3;
  if (!(p >= 1 && n >= 2 && Number.isInteger(p) && Number.isInteger(n)) || rec.length !== BSPLINE_HEAD + n + p + 1 + n * stride) return null;
  return {
    kind: 'bspline',
    degree: p,
    knots: rec.slice(BSPLINE_HEAD, BSPLINE_HEAD + n + p + 1),
    ctrl: rec.slice(BSPLINE_HEAD + n + p + 1),
    rational,
    ta: rec[3]!,
    tb: rec[4]!,
    period: rec[5]!,
  };
}

function record(table: CurveTable, e: number): Float64Array | null {
  const S = table.curveStart;
  const C = table.curves;
  if (!S || !C || e + 1 >= S.length) return null;
  const s = S[e]!;
  const t = S[e + 1]!;
  return t > s && t <= C.length ? C.subarray(s, t) : null;
}

// ── 가장 가까운 점 ──

/**
 * 원 위에서 p에 가장 가까운 점: 원 평면에 내린 자리의 반지름 방향. 접선 = 법선 × 반지름 방향(원 틀의 매개변수가 커지는 쪽).
 * ref(원 틀 x축)를 주면 t는 그 축에서 잰 각 [0, 2π), 아니면 NaN. p가 원의 축 위면(모든 점이 같은 거리) null
 */
export function nearestOnCircle(c: Pick<CircleDef, 'center' | 'normal' | 'r'>, p: readonly number[], ref?: readonly number[] | null): CurveFoot | null {
  const n = unit(c.normal);
  if (!n) return null;
  const d: V3 = [p[0]! - c.center[0], p[1]! - c.center[1], p[2]! - c.center[2]];
  const h = dot(d, n);
  const q: V3 = [d[0] - h * n[0], d[1] - h * n[1], d[2] - h * n[2]];
  const ql = Math.hypot(q[0], q[1], q[2]);
  if (!(ql > 1e-12 * (c.r + Math.hypot(d[0], d[1], d[2])))) return null;
  const u: V3 = [q[0] / ql, q[1] / ql, q[2] / ql];
  const point: V3 = [c.center[0] + c.r * u[0], c.center[1] + c.r * u[1], c.center[2] + c.r * u[2]];
  let t = NaN;
  if (ref) {
    const h2 = dot(ref, n);
    const ex = unit([ref[0]! - h2 * n[0], ref[1]! - h2 * n[1], ref[2]! - h2 * n[2]]);
    if (ex) {
      const ey = cross(n, ex);
      t = Math.atan2(dot(u, ey), dot(u, ex));
      if (t < 0) t += 2 * Math.PI;
    }
  }
  return { t, point, tangent: cross(n, u), dist: Math.hypot(p[0]! - point[0], p[1]! - point[1], p[2]! - point[2]) };
}

/** 타원 틀(법선 n, x축 X, Y = n × X)과 점·도함수 계산기 */
function ellipseEval(c: Pick<EllipseDef, 'center' | 'normal' | 'x' | 'a' | 'b'>): { X: V3; Y: V3; ev: CurveEval } | null {
  const n = unit(c.normal);
  if (!n) return null;
  const h = dot(c.x, n);
  const X = unit([c.x[0] - h * n[0], c.x[1] - h * n[1], c.x[2] - h * n[2]]);
  if (!X) return null;
  const Y = cross(n, X);
  const { a, b, center: o } = c;
  const ev: CurveEval = (t) => {
    const ca = Math.cos(t);
    const sa = Math.sin(t);
    return [
      [o[0] + a * ca * X[0] + b * sa * Y[0], o[1] + a * ca * X[1] + b * sa * Y[1], o[2] + a * ca * X[2] + b * sa * Y[2]],
      [-a * sa * X[0] + b * ca * Y[0], -a * sa * X[1] + b * ca * Y[1], -a * sa * X[2] + b * ca * Y[2]],
      [-a * ca * X[0] - b * sa * Y[0], -a * ca * X[1] - b * sa * Y[1], -a * ca * X[2] - b * sa * Y[2]],
    ];
  };
  return { X, Y, ev };
}

/**
 * 타원 위에서 p에 가장 가까운 점(t는 틀 x축에서 잰 매개변수 각 [0, 2π)). 원 평면에 내린 자리의 매개변수 각 atan2(v/b, u/a)에서 시작해
 * 그 둘레 표본(반 바퀴 양쪽)으로 거리 제곱의 도함수가 0인 곳을 찾는다. 곡선 위 점이면 시작값이 곧 답이다
 */
export function nearestOnEllipse(c: Pick<EllipseDef, 'center' | 'normal' | 'x' | 'a' | 'b'>, p: readonly number[]): CurveFoot | null {
  const e = ellipseEval(c);
  if (!e || !(c.a > 0) || !(c.b > 0)) return null;
  const d = [p[0]! - c.center[0], p[1]! - c.center[1], p[2]! - c.center[2]];
  const t0 = Math.atan2(dot(d, e.Y) / c.b, dot(d, e.X) / c.a);
  const ts: number[] = [];
  const N = 32;
  for (let k = 0; k <= N; k++) ts.push(t0 - Math.PI + (2 * Math.PI * k) / N);
  let t = nearestParam(e.ev, p, ts);
  t %= 2 * Math.PI;
  if (t < 0) t += 2 * Math.PI;
  return foot(e.ev, p, t);
}

/** B-스플라인 정의의 NurbsCurve(정의마다 한 번) */
const nurbsCache = new WeakMap<BsplineDef, NurbsCurve>();
function nurbsOf(c: BsplineDef): NurbsCurve {
  let nc = nurbsCache.get(c);
  if (!nc) {
    const n = c.knots.length - c.degree - 1;
    const stride = c.rational ? 4 : 3;
    const ctrl: V3[] = [];
    const w: number[] = [];
    for (let i = 0; i < n; i++) {
      ctrl.push([c.ctrl[i * stride]!, c.ctrl[i * stride + 1]!, c.ctrl[i * stride + 2]!]);
      w.push(c.rational ? c.ctrl[i * stride + 3]! : 1);
    }
    nc = new NurbsCurve(c.degree, c.knots, ctrl, c.rational ? w : null);
    nurbsCache.set(c, nc);
  }
  return nc;
}

/** B-스플라인 점·도함수 계산기(닫힌 곡선은 매개변수를 매듭 구간으로 감는다) */
export function bsplineEval(c: BsplineDef): CurveEval {
  const nc = nurbsOf(c);
  const P = c.period;
  return (t) => {
    if (P > 0) {
      let r = (t - nc.t0) % P;
      if (r < 0) r += P;
      t = nc.t0 + r;
    }
    const d = nc.evalDerivs(t, 2);
    return [d[0]!, d[1]!, d[2] ?? [0, 0, 0]];
  };
}

/**
 * B-스플라인 위에서 p에 가장 가까운 점(모서리 구간 ta…tb 안). 구간 안의 매듭 구간마다 max(4, 2p)개씩 나눈 표본(합 4096개까지)에서
 * 가장 가까운 몇 곳을 뉴턴으로 다듬는다. 닫힌 곡선은 t를 매듭 구간으로 감아 돌려준다
 */
export function nearestOnBspline(c: BsplineDef, p: readonly number[]): CurveFoot | null {
  const nc = nurbsOf(c);
  const ev = bsplineEval(c);
  const lo = Math.min(c.ta, c.tb);
  const hi = Math.max(c.ta, c.tb);
  if (!(hi > lo)) return null;
  // 매듭 경계(닫힌 곡선이면 주기만큼 민 것도)
  const P = c.period;
  const bps = nc.breakpoints();
  const marks = new Set<number>([lo, hi]);
  const shifts = P > 0 ? Math.ceil((hi - lo) / P) + 1 : 0;
  const base = P > 0 ? Math.floor((lo - nc.t0) / P) : 0;
  for (let s = 0; s <= shifts; s++) for (const k of bps) {
    const v = k + (base + s) * P;
    if (v > lo && v < hi) marks.add(v);
  }
  const edges = [...marks].sort((x, y) => x - y);
  const per = Math.max(4, 2 * c.degree, Math.ceil(64 / Math.max(1, edges.length - 1)));
  const each = Math.max(1, Math.min(per, Math.floor(4096 / Math.max(1, edges.length - 1))));
  const ts: number[] = [];
  for (let i = 0; i + 1 < edges.length; i++) for (let k = 0; k < each; k++) ts.push(edges[i]! + ((edges[i + 1]! - edges[i]!) * k) / each);
  ts.push(hi);
  let t = nearestParam(ev, p, ts);
  const f = foot(ev, p, t);
  if (P > 0) {
    t = nc.t0 + ((((t - nc.t0) % P) + P) % P);
    f.t = t;
  }
  return f;
}

/** 곡선 정의 위에서 p에 가장 가까운 점(원은 t 없음 — NaN) */
export function nearestOnCurve(c: EdgeCurve, p: readonly number[]): CurveFoot | null {
  if (c.kind === 'circle') return nearestOnCircle(c, p);
  if (c.kind === 'ellipse') return nearestOnEllipse(c, p);
  return nearestOnBspline(c, p);
}

/** 매개변수 t의 점·단위 접선과 p까지 거리 */
function foot(ev: CurveEval, p: readonly number[], t: number): CurveFoot {
  const [C, D] = ev(t);
  const u = unit(D) ?? [NaN, NaN, NaN];
  return { t, point: [C[0], C[1], C[2]], tangent: u, dist: Math.hypot(p[0]! - C[0], p[1]! - C[1], p[2]! - C[2]) };
}

/**
 * 곡선(ev) 위에서 q에 가장 가까운 매개변수: 오름차순 표본 ts(구간 [ts[0], ts[끝]] 안에서만 찾는다)의 거리 제곱 극소 몇 곳에서
 * g(t) = C'·(C − q)가 0인 곳을 다듬는다 — 이웃 표본 사이에서 g의 부호가 바뀌면 그 구간 안 뉴턴·반 나눔(매개변수 수의 반올림까지),
 * 아니면 거리가 줄 때만 받는 뉴턴. 구간 끝으로 나가려 하면 그 끝
 */
export function nearestParam(ev: CurveEval, q: readonly number[], ts: readonly number[]): number {
  const n = ts.length;
  if (!n) return NaN;
  const d2: number[] = [];
  const g: number[] = [];
  for (const t of ts) {
    const [C, D] = ev(t);
    const r = [C[0] - q[0]!, C[1] - q[1]!, C[2] - q[2]!];
    d2.push(dot(r, r));
    g.push(dot(D, r));
  }
  // 표본 거리 제곱의 극소(같으면 앞) 가운데 가까운 셋
  const mins: number[] = [];
  for (let i = 0; i < n; i++) if ((i === 0 || d2[i]! <= d2[i - 1]!) && (i === n - 1 || d2[i]! <= d2[i + 1]!)) mins.push(i);
  mins.sort((a, b) => d2[a]! - d2[b]!);
  let best = ts[mins[0] ?? 0]!;
  let bestD = Infinity;
  for (const i of mins.slice(0, 3)) {
    const t = refine(ev, q, ts, g, i);
    const [C] = ev(t);
    const d = (C[0] - q[0]!) ** 2 + (C[1] - q[1]!) ** 2 + (C[2] - q[2]!) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** 표본 i 둘레에서 g = 0인 곳 */
function refine(ev: CurveEval, q: readonly number[], ts: readonly number[], g: readonly number[], i: number): number {
  const n = ts.length;
  if (g[i] === 0) return ts[i]!;
  if (g[i]! < 0) {
    // 매개변수가 커지는 쪽으로 가까워진다
    if (i + 1 < n && g[i + 1]! > 0) return bracketed(ev, q, ts[i]!, ts[i + 1]!);
    if (i === n - 1) return ts[i]!;
  } else {
    if (i > 0 && g[i - 1]! < 0) return bracketed(ev, q, ts[i - 1]!, ts[i]!);
    if (i === 0) return ts[0]!;
  }
  return damped(ev, q, ts[i]!, ts[0]!, ts[n - 1]!);
}

/** g(lo) < 0 < g(hi)인 구간 안 근: 뉴턴이 구간 밖으로 나가거나 더디면 반 나눔(Numerical Recipes rtsafe 꼴) */
function bracketed(ev: CurveEval, q: readonly number[], lo: number, hi: number): number {
  const gh = (t: number): [number, number] => {
    const [C, D, A] = ev(t);
    const r = [C[0] - q[0]!, C[1] - q[1]!, C[2] - q[2]!];
    return [dot(D, r), dot(A, r) + dot(D, D)];
  };
  let xl = lo;
  let xh = hi;
  let t = 0.5 * (lo + hi);
  let dxOld = Math.abs(hi - lo);
  let dx = dxOld;
  let [f, df] = gh(t);
  for (let it = 0; it < 200; it++) {
    if (((t - xh) * df - f) * ((t - xl) * df - f) > 0 || Math.abs(2 * f) > Math.abs(dxOld * df)) {
      dxOld = dx;
      dx = 0.5 * (xh - xl);
      t = xl + dx;
      if (t === xl || t === xh) return t;
    } else {
      dxOld = dx;
      dx = f / df;
      const prev = t;
      t -= dx;
      if (t === prev) return t;
    }
    if (Math.abs(dx) <= 4e-16 * (1 + Math.abs(t))) return t;
    [f, df] = gh(t);
    if (f === 0) return t;
    if (f < 0) xl = t;
    else xh = t;
  }
  return t;
}

/** 부호가 바뀌는 구간을 못 찾았을 때: 거리 제곱이 줄 때만 받는 뉴턴(볼록하지 않으면 가우스-뉴턴 걸음), [lo, hi] 안 */
function damped(ev: CurveEval, q: readonly number[], t: number, lo: number, hi: number): number {
  const d2 = (C: readonly number[]): number => (C[0]! - q[0]!) ** 2 + (C[1]! - q[1]!) ** 2 + (C[2]! - q[2]!) ** 2;
  let [C, D, A] = ev(t);
  let d = d2(C);
  for (let it = 0; it < 64; it++) {
    const r = [C[0] - q[0]!, C[1] - q[1]!, C[2] - q[2]!];
    const gg = dot(D, r);
    const dd = dot(D, D);
    if (!(dd > 0)) break;
    let h = dot(A, r) + dd;
    if (!(h > 0)) h = dd;
    let step = -gg / h;
    let moved = false;
    for (let k = 0; k < 40; k++) {
      const nt = Math.min(hi, Math.max(lo, t + step));
      const e = ev(nt);
      const nd = d2(e[0]);
      if (nd < d) {
        moved = Math.abs(nt - t) > 1e-16 * (1 + Math.abs(t));
        t = nt;
        [C, D, A] = e;
        d = nd;
        break;
      }
      step *= 0.5;
    }
    if (!moved) break;
  }
  return t;
}
