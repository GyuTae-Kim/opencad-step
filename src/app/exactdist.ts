/**
 * 개체 측정의 최소 거리를 B-rep 곡면·곡선 위로 다듬기(40차 — 순수, DOM 없음, 곡선 접선 조각과 함께 문서를 열 때 받는다).
 *
 * 개체 측정은 해석적으로 못 재는 개체(B-스플라인·회전·밀기·띄운 곡면, 곡선 모서리)가 끼면 고른 면 삼각형·모서리 선분 사이 최소 거리(코어 closestBetween)와
 * 부품 사이 최소 거리(코어 closestPoints — 그물 삼각형)를 "≈"로 보인다. 이 모듈은 그 삼각형 답(두 점)에서 시작해 앱이 가진 정확한 정의로 다듬는다:
 * - 면: 평면(면 가운데·법선), 원기둥·원뿔·구·원환(면 표의 식 — 그물 좌표), 회전·밀기·B-스플라인·띄운 곡면(해석 워커가 남긴 곡면 정의 — facesurf.ts)
 * - 모서리: 곧은 모서리(두 끝), 원·타원·B-스플라인(모서리 표의 곡선 정의 — edgecurve.ts), 점(꼭짓점·가운데 점·누른 점·단면 위 점)
 * 두 개체의 매개변수(0~4개)로 거리 제곱의 반을 줄이는 뉴턴법(헤세 = 야코비 곱 + 잔차·2차 편도함수, 내려가지 않으면 가우스-뉴턴, 선 탐색,
 * 정의역 안으로 자르기). 시작은 삼각형 답의 두 점을 각 개체 위로 되짚은 매개변수와 그 뒤 번갈아 되짚기 몇 번이다.
 * 받는 조건(아니면 null — 삼각형 답 그대로 "≈"):
 * - 뉴턴이 멈춘 자리가 극소(정의역 안 매개변수의 기울기가 0, 끝에 걸린 매개변수는 기울기가 바깥쪽)이고, 두 점이 그 면의 잘린 경계 안(facesnap insideFace)
 * - 다듬은 거리가 삼각형 답보다 크지 않다(더 먼 자리로 가면 버린다 — 오목한 짝에서는 정확한 거리가 현보다 조금 클 수 있어 그때도 삼각형 답 그대로)
 * - 두 개체 모두 평면·곧은 모서리·점이면 다듬지 않는다(삼각형 답이 곧 정확한 답) · 시간 한도(기본 30 ms)를 넘으면 그만둔다
 */
import type { Mesh3d } from 'opencad-viewer3d/types';
import { nearestParam } from '../edgecurve';
import type { StepFaceTable } from '../scene';
import { edgeArc, toLocal, toWorld } from './curvesnap';
import { faceAt, faceDetails } from './faces';
import { insideFace, PARAMETRIC_KINDS, type FaceSurface, type FaceSurfaceLookup, type SnapFaceIndex } from './facesnap';
import type { SnapEdgeIndex } from './snap';

type V3 = [number, number, number];

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const scale = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const unit = (a: readonly number[]): V3 | null => {
  const l = norm(a);
  return l > 0 && Number.isFinite(l) ? [a[0]! / l, a[1]! / l, a[2]! / l] : null;
};
const finite = (v: readonly number[]): boolean => v.every(Number.isFinite);

/** 개체 위 한 자리(세계): 점, 1차 편도함수(매개변수마다), 2차 편도함수(1개: [tt], 2개: [uu, uv, vv]) */
export interface GeoEval {
  P: V3;
  D: V3[];
  H: V3[];
}

/** 다듬을 개체 한 쪽(세계 좌표, 매개변수 0~2개) */
export interface ExactGeo {
  dims: 0 | 1 | 2;
  /** 평면·곧은 모서리·점(삼각형 답이 곧 정확한 답) */
  flat: boolean;
  /** 세계 점 q에 가장 가까운 매개변수(hint는 앞 매개변수 — 못 구하면 null) */
  near(q: V3, hint?: readonly number[] | null): number[] | null;
  ev(x: readonly number[]): GeoEval | null;
  /** 정의역 안으로(주기면 그대로 두고, 아니면 자른다) */
  clamp(x: readonly number[]): number[];
  /** 매개변수 k가 정의역 끝에 걸렸으면 −1(아래 끝)·+1(위 끝), 아니면 0 */
  atBound(x: readonly number[], k: number): number;
  /** 잘린 면의 경계 안인지(tol: 그물 좌표 허용치 — 곡선·점은 늘 true) */
  inside(x: readonly number[], tol: number): boolean;
}

// ── 자리 변환(그물 좌표 → 세계) ──

/** 그물 좌표 방향(길이 그대로) → 세계(자리 변환 3×3 — 이동 없음) */
function linear(mesh: Mesh3d, v: readonly number[]): V3 {
  const m = mesh.matrix;
  return m ? [m[0]! * v[0]! + m[4]! * v[1]! + m[8]! * v[2]!, m[1]! * v[0]! + m[5]! * v[1]! + m[9]! * v[2]!, m[2]! * v[0]! + m[6]! * v[1]! + m[10]! * v[2]!] : [v[0]!, v[1]!, v[2]!];
}

/** 그물 좌표 계산(점·편도함수) → 세계 */
function evToWorld(mesh: Mesh3d, P: readonly number[], D: readonly (readonly number[])[], H: readonly (readonly number[])[]): GeoEval | null {
  const out = { P: toWorld(mesh, P[0]!, P[1]!, P[2]!), D: D.map((d) => linear(mesh, d)), H: H.map((h) => linear(mesh, h)) };
  return finite(out.P) && out.D.every(finite) && out.H.every(finite) ? out : null;
}

// ── 점·곧은 모서리 ──

/** 점 하나(세계) */
export function pointGeo(p: readonly number[]): ExactGeo {
  const P: V3 = [p[0]!, p[1]!, p[2]!];
  return { dims: 0, flat: true, near: () => [], ev: () => ({ P, D: [], H: [] }), clamp: () => [], atBound: () => 0, inside: () => true };
}

/** 곧은 선분 a–b(세계, 매개변수 0~1) */
export function segmentGeo(a: readonly number[], b: readonly number[]): ExactGeo {
  const A: V3 = [a[0]!, a[1]!, a[2]!];
  const E = sub(b, a);
  const l2 = dot(E, E);
  const cl = (t: number) => Math.min(1, Math.max(0, t));
  return {
    dims: 1,
    flat: true,
    near: (q) => [l2 > 0 ? cl(dot(sub(q, A), E) / l2) : 0],
    ev: (x) => ({ P: add(A, scale(E, x[0]!)), D: [E], H: [[0, 0, 0]] }),
    clamp: (x) => [cl(x[0]!)],
    atBound: (x) => (x[0]! <= 0 ? -1 : x[0]! >= 1 ? 1 : 0),
    inside: () => true,
  };
}

// ── 면 ──

/** 매개변수 곡면(그물 좌표): 점·편도함수, 2차 편도함수, 되짚기, 정의역 */
interface LocalSurface {
  derivs(u: number, v: number): [V3, V3, V3];
  hess(u: number, v: number): [V3, V3, V3];
  project(q: V3, hint: readonly number[] | null): [number, number] | null;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  periodU: number;
  periodV: number;
}

/** 축 a에 수직인 단위 두 축 */
function frameOf(a: V3): [V3, V3] {
  const e = Math.abs(a[0]) < 0.9 ? ([1, 0, 0] as V3) : ([0, 1, 0] as V3);
  const e1 = unit(sub(e, scale(a, dot(e, a))))!;
  return [e1, cross(a, e1)];
}

const TAU = 2 * Math.PI;

/** 점·편도함수로 가우스-뉴턴 되짚기(시작 (u, v)에서 — 해석 곡면의 첫 짐작을 다듬는다) */
function footNewton(s: Pick<LocalSurface, 'derivs'>, q: V3, u: number, v: number, clampV: (v: number) => number): [number, number] {
  let [S, Su, Sv] = s.derivs(u, v);
  let d2 = dot(sub(S, q), sub(S, q));
  for (let it = 0; it < 30; it++) {
    const r = sub(q, S);
    const a = dot(Su, Su);
    const b = dot(Su, Sv);
    const c = dot(Sv, Sv);
    const det = a * c - b * b;
    if (!(det > 1e-300)) break;
    const ru = dot(Su, r);
    const rv = dot(Sv, r);
    let du = (c * ru - b * rv) / det;
    let dv = (a * rv - b * ru) / det;
    let ok = false;
    for (let k = 0; k < 20 && !ok; k++) {
      const nu = u + du;
      const nv = clampV(v + dv);
      const nd = s.derivs(nu, nv);
      const e = dot(sub(nd[0], q), sub(nd[0], q));
      if (e <= d2) {
        ok = true;
        const moved = Math.abs(nu - u) + Math.abs(nv - v);
        u = nu;
        v = nv;
        [S, Su, Sv] = nd;
        d2 = e;
        if (moved < 1e-15 * (1 + Math.abs(u) + Math.abs(v))) return [u, v];
      } else {
        du *= 0.5;
        dv *= 0.5;
      }
    }
    if (!ok) break;
  }
  return [u, v];
}

/**
 * 해석 곡면(면 표 매개변수 p = [r1, r2, 축 3, 원점 3], 그물 좌표): 원기둥 (θ, h), 원뿔 (θ, h — 반지름 r1 + h tan r2), 구 (θ, φ), 원환 (θ, φ — 큰 반지름 r1, 작은 r2)
 */
function analyticSurface(kind: string, p: ArrayLike<number>): LocalSurface | null {
  const r1 = p[0]!;
  const r2 = p[1]!;
  const a = unit([p[2]!, p[3]!, p[4]!]);
  const o: V3 = [p[5]!, p[6]!, p[7]!];
  if (!a || !(r1 > 0) || !finite(o)) return null;
  const [e1, e2] = frameOf(a);
  const w = (t: number): V3 => add(scale(e1, Math.cos(t)), scale(e2, Math.sin(t)));
  const w1 = (t: number): V3 => add(scale(e1, -Math.sin(t)), scale(e2, Math.cos(t)));
  const ang = (d: V3) => Math.atan2(dot(d, e2), dot(d, e1));
  const Z: V3 = [0, 0, 0];
  const inf = { u0: -Infinity, u1: Infinity, v0: -Infinity, v1: Infinity, periodU: TAU, periodV: 0 };
  if (kind === 'cylinder' || kind === 'cone') {
    const tn = kind === 'cone' ? Math.tan(r2) : 0;
    if (!Number.isFinite(tn)) return null;
    const rho = (h: number) => r1 + h * tn;
    const s: LocalSurface = {
      ...inf,
      derivs: (t, h) => [add(add(o, scale(a, h)), scale(w(t), rho(h))), scale(w1(t), rho(h)), add(a, scale(w(t), tn))],
      hess: (t, h) => [scale(w(t), -rho(h)), scale(w1(t), tn), Z],
      project: (q) => {
        const d = sub(q, o);
        const t0 = ang(d);
        const h0 = dot(d, a);
        return kind === 'cylinder' ? [t0, h0] : footNewton(s, q, t0, h0, (v) => v);
      },
    };
    return s;
  }
  if (kind === 'sphere') {
    const lat = (v: number) => Math.min(Math.PI / 2, Math.max(-Math.PI / 2, v));
    return {
      ...inf,
      v0: -Math.PI / 2,
      v1: Math.PI / 2,
      derivs: (t, f) => [add(o, scale(add(scale(w(t), Math.cos(f)), scale(a, Math.sin(f))), r1)), scale(w1(t), r1 * Math.cos(f)), scale(add(scale(w(t), -Math.sin(f)), scale(a, Math.cos(f))), r1)],
      hess: (t, f) => [scale(w(t), -r1 * Math.cos(f)), scale(w1(t), -r1 * Math.sin(f)), scale(add(scale(w(t), Math.cos(f)), scale(a, Math.sin(f))), -r1)],
      project: (q) => {
        const d = sub(q, o);
        const h = dot(d, a);
        return [ang(d), lat(Math.atan2(h, norm(sub(d, scale(a, h)))))];
      },
    };
  }
  if (kind === 'torus') {
    if (!(r2 > 0)) return null;
    return {
      ...inf,
      periodV: TAU,
      derivs: (t, f) => {
        const R = r1 + r2 * Math.cos(f);
        return [add(add(o, scale(w(t), R)), scale(a, r2 * Math.sin(f))), scale(w1(t), R), add(scale(w(t), -r2 * Math.sin(f)), scale(a, r2 * Math.cos(f)))];
      },
      hess: (t, f) => [scale(w(t), -(r1 + r2 * Math.cos(f))), scale(w1(t), -r2 * Math.sin(f)), add(scale(w(t), -r2 * Math.cos(f)), scale(a, -r2 * Math.sin(f)))],
      project: (q) => {
        const d = sub(q, o);
        const h = dot(d, a);
        return [ang(d), Math.atan2(h, norm(sub(d, scale(a, h))) - r1)];
      },
    };
  }
  return null;
}

/** 곡면 정의(facesurf — 형상 항목 좌표의 곡면, 그물 좌표 = (항목 좌표 − origin)·k) → 그물 좌표 곡면 */
function paramSurface(fs: FaceSurface): LocalSurface | null {
  const s = fs.surf as FaceSurface['surf'] & { hess?: (u: number, v: number) => [V3, V3, V3] };
  const k = fs.k;
  const o = fs.origin;
  if (!(k > 0) || !finite(o)) return null;
  const toMesh = (p: readonly number[]): V3 => [(p[0]! - o[0]) * k, (p[1]! - o[1]) * k, (p[2]! - o[2]) * k];
  const derivs = (u: number, v: number): [V3, V3, V3] => {
    const [P, Su, Sv] = s.derivs(u, v);
    return [toMesh(P), scale(Su, k), scale(Sv, k)];
  };
  return {
    u0: s.u0 ?? -Infinity,
    u1: s.u1 ?? Infinity,
    v0: s.v0 ?? -Infinity,
    v1: s.v1 ?? Infinity,
    periodU: s.periodU ?? 0,
    periodV: s.periodV ?? 0,
    derivs,
    hess: (u, v) => {
      if (s.hess) {
        const [uu, uv, vv] = s.hess(u, v);
        return [scale(uu, k), scale(uv, k), scale(vv, k)];
      }
      // 1차 편도함수의 중심 차분
      const span = (a: number, b: number) => (Number.isFinite(b - a) ? b - a : 1);
      const hu = Math.max(1e-9, span(s.u0 ?? 0, s.u1 ?? 1) * 1e-6);
      const hv = Math.max(1e-9, span(s.v0 ?? 0, s.v1 ?? 1) * 1e-6);
      const [, au, av] = derivs(u + hu, v);
      const [, bu, bv] = derivs(u - hu, v);
      const [, , cv] = derivs(u, v + hv);
      const [, , dv] = derivs(u, v - hv);
      return [scale(sub(au, bu), 1 / (2 * hu)), scale(sub(av, bv), 1 / (2 * hu)), scale(sub(cv, dv), 1 / (2 * hv))];
    },
    project: (q, hint) => {
      const uv = s.project([q[0] / k + o[0], q[1] / k + o[1], q[2] / k + o[2]], hint && hint.length === 2 ? [hint[0]!, hint[1]!] : null);
      return finite(uv) ? uv : null;
    },
  };
}

/** 그물 좌표 곡면 → 세계 개체(잘린 경계는 그 면의 삼각형 — insideFace) */
function surfaceGeo(mesh: Mesh3d, table: StepFaceTable, f: number, s: LocalSurface): ExactGeo {
  const clampK = (x: number, lo: number, hi: number, period: number) => (period > 0 ? x : Math.min(hi, Math.max(lo, x)));
  const clamp = (x: readonly number[]): number[] => [clampK(x[0]!, s.u0, s.u1, s.periodU), clampK(x[1]!, s.v0, s.v1, s.periodV)];
  return {
    dims: 2,
    flat: false,
    near: (q, hint) => {
      const L = toLocal(mesh, q);
      const uv = L ? s.project(L.p, hint ?? null) : null;
      return uv ? clamp(uv) : null;
    },
    ev: (x) => {
      const [P, Su, Sv] = s.derivs(x[0]!, x[1]!);
      return evToWorld(mesh, P, [Su, Sv], s.hess(x[0]!, x[1]!));
    },
    clamp,
    atBound: (x, k) => {
      const [lo, hi, per] = k === 0 ? [s.u0, s.u1, s.periodU] : [s.v0, s.v1, s.periodV];
      if (per > 0) return 0;
      return x[k]! <= lo ? -1 : x[k]! >= hi ? 1 : 0;
    },
    inside: (x, tol) => {
      const [P, Su, Sv] = s.derivs(x[0]!, x[1]!);
      const n = unit(cross(Su, Sv));
      return !!n && insideFace(mesh, table, f, P, n, tol);
    },
  };
}

/** 평면 면(세계 — 면 가운데 c·법선 n, 잘린 경계는 그 면의 삼각형) */
function planeGeo(mesh: Mesh3d, table: StepFaceTable, f: number, c: readonly number[], n: readonly number[]): ExactGeo | null {
  const N = unit(n);
  if (!N) return null;
  const [e1, e2] = frameOf(N);
  const C: V3 = [c[0]!, c[1]!, c[2]!];
  const Z: V3 = [0, 0, 0];
  return {
    dims: 2,
    flat: true,
    near: (q) => [dot(sub(q, C), e1), dot(sub(q, C), e2)],
    ev: (x) => ({ P: add(C, add(scale(e1, x[0]!), scale(e2, x[1]!))), D: [e1, e2], H: [Z, Z, Z] }),
    clamp: (x) => [x[0]!, x[1]!],
    atBound: () => 0,
    inside: (x, tol) => {
      const P = add(C, add(scale(e1, x[0]!), scale(e2, x[1]!)));
      const L = toLocal(mesh, P);
      const nl = unit(sub(toLocal(mesh, add(P, N))?.p ?? [NaN, NaN, NaN], L?.p ?? [NaN, NaN, NaN]));
      return !!L && !!nl && insideFace(mesh, table, f, L.p, nl, tol);
    },
  };
}

/** 면 표가 있는 그물의 면 f → 개체(평면은 face가 준 가운데·법선 — 없으면 못 만든다). 곡면 정의를 아직 받지 않았거나 모르는 종류면 null */
export function faceGeo(mesh: Mesh3d, fx: SnapFaceIndex, f: number, lookup: FaceSurfaceLookup | null, plane?: { center: readonly number[]; normal: readonly number[] } | null): ExactGeo | null {
  const ti = fx.tableOf.get(mesh.id);
  const table = ti === undefined ? undefined : fx.tables[ti];
  if (!table || ti === undefined || !(f >= 0) || table.kinds[f] === undefined) return null;
  const kind = fx.kinds[table.kinds[f]!] ?? '';
  if (kind === 'plane') return plane ? planeGeo(mesh, table, f, plane.center, plane.normal) : null;
  const an = analyticSurface(kind, table.params.subarray(f * 8, f * 8 + 8));
  if (an) return surfaceGeo(mesh, table, f, an);
  if (!lookup || !PARAMETRIC_KINDS.has(kind)) return null;
  const fs = lookup(ti, f);
  const ps = fs ? paramSurface(fs) : null;
  return ps ? surfaceGeo(mesh, table, f, ps) : null;
}

// ── 곡선 모서리 ──

/** 그물의 모서리 e 곡선(원·타원·B-스플라인 — 매개변수는 모서리 구간) → 개체. 곡선 정의가 없으면 null */
export function edgeGeo(mesh: Mesh3d, ex: SnapEdgeIndex, e: number): ExactGeo | null {
  const ti = ex.tableOf.get(mesh.id);
  const table = ti === undefined ? undefined : ex.tables[ti];
  const arc = table && mesh.edges ? edgeArc(mesh.edges, table, e, ex.kinds) : null;
  if (!arc) return null;
  const ts: number[] = [];
  for (let i = 0; i <= arc.n; i++) ts.push(arc.param(i));
  if (!finite(ts)) return null;
  ts.sort((x, y) => x - y);
  const lo = ts[0]!;
  const hi = ts[ts.length - 1]!;
  const cl = (t: number) => Math.min(hi, Math.max(lo, t));
  return {
    dims: 1,
    flat: false,
    near: (q) => {
      const L = toLocal(mesh, q);
      const t = L ? nearestParam(arc.ev, L.p, ts) : NaN;
      return Number.isFinite(t) ? [cl(t)] : null;
    },
    ev: (x) => {
      const [C, D, A] = arc.ev(x[0]!);
      return evToWorld(mesh, C, [D], [A]);
    },
    clamp: (x) => [cl(x[0]!)],
    atBound: (x) => (x[0]! <= lo ? -1 : x[0]! >= hi ? 1 : 0),
    inside: () => true,
  };
}

// ── 뉴턴법 ──

/** n×n 일차 방정식(부분 피벗 가우스 소거, n ≤ 4). 특이하면 null */
function solveN(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (!(Math.abs(M[p]![c]!) > 1e-300)) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = c + 1; r < n; r++) {
      const k = M[r]![c]! / M[c]![c]!;
      for (let j = c; j <= n; j++) M[r]![j]! -= k * M[c]![j]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let j = r + 1; j < n; j++) s -= M[r]![j]! * x[j]!;
    x[r] = s / M[r]![r]!;
  }
  return x.every(Number.isFinite) ? x : null;
}

/** 2차 편도함수 표에서 (i, k) */
const hAt = (H: readonly V3[], dims: number, i: number, k: number): V3 => (dims === 1 ? H[0]! : H[i + k]!);

export interface ExactClosest {
  a: V3;
  b: V3;
  distance: number;
  /** 뉴턴 걸음 수 */
  steps: number;
}

/**
 * 두 개체 A·B 사이 가장 가까운 두 점: 삼각형 답(c.a는 A 위, c.b는 B 위 — 세계)에서 시작해 뉴턴법으로(머리글 규칙). size는 장면 크기(수렴 판정 기준),
 * deadline은 performance.now() 한도. 받지 못하면 null
 */
export function refineClosest(
  A: ExactGeo,
  B: ExactGeo,
  c: { a: readonly number[]; b: readonly number[]; distance: number },
  size: number,
  deadline = Infinity,
  trace: ((why: string) => void) | null = null,
): ExactClosest | null {
  const no = (why: string): null => (trace?.(why), null);
  if (A.flat && B.flat) return no('flat');
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const qa: V3 = [c.a[0]!, c.a[1]!, c.a[2]!];
  const qb: V3 = [c.b[0]!, c.b[1]!, c.b[2]!];
  const xa0 = A.near(qa);
  const xb0 = B.near(qb);
  if (!xa0 || !xb0) return no('near');
  let xa: number[] = xa0;
  let xb: number[] = xb0;
  // 번갈아 되짚기 몇 번(뉴턴 시작을 극소 둘레로)
  for (let i = 0; i < 4; i++) {
    const pa = A.ev(xa);
    const nb = pa ? B.near(pa.P, xb) : null;
    if (!nb) return no('near');
    xb = nb;
    const pb = B.ev(xb);
    const na = pb ? A.near(pb.P, xa) : null;
    if (!na) return no('near');
    xa = na;
  }
  const nA = A.dims;
  const n = nA + B.dims;
  const tiny = Math.max(size, 1e-300) * 1e-13;
  let ea = A.ev(xa);
  let eb = B.ev(xb);
  if (!ea || !eb) return no('ev');
  let r = sub(ea.P, eb.P);
  let f = 0.5 * dot(r, r);
  let steps = 0;
  let J: V3[] = [];
  let g: number[] = [];
  const grad = () => {
    J = [...ea!.D, ...eb!.D.map((d) => scale(d, -1))];
    g = J.map((j) => dot(r, j));
  };
  grad();
  const lr0 = () => Math.sqrt(2 * f) + size * 1e-9;
  /** 정의역 안 매개변수의 기울기가 0인지(끝에 걸린 것은 바깥쪽이면 된다) */
  const stationary = (k: number) =>
    g.every((gi, i) => {
      const b = i < nA ? A.atBound(xa, i) : B.atBound(xb, i - nA);
      const tol = k * (norm(J[i]!) + 1e-300) * lr0();
      return b === 0 ? Math.abs(gi) <= tol : b * gi <= tol;
    });
  let lambda = 1e-12;
  if (now() > deadline) return no('time');
  for (; steps < 100 && !stationary(1e-13); steps++) {
    if (now() > deadline) return no('time');
    // 헤세(야코비 곱 + 잔차·2차 편도함수)
    const H = J.map((ji, i) => J.map((jk, k) => {
      let h = dot(ji, jk);
      if (i < nA && k < nA) h += dot(r, hAt(ea!.H, nA, i, k));
      else if (i >= nA && k >= nA) h -= dot(r, hAt(eb!.H, B.dims, i - nA, k - nA));
      return h;
    }));
    // 정의역 끝에 걸려 바깥으로 나가려는 매개변수는 고정한다(그 행·열을 빼고 푼다 — 끝 위 극소에서 나머지가 제대로 수렴하게)
    const fixed = g.map((gi, i) => {
      const b = i < nA ? A.atBound(xa, i) : B.atBound(xb, i - nA);
      return b !== 0 && b * gi < 0;
    });
    // 레벤버그-마쿼트 감쇠: 나란한 원기둥 축처럼 극소가 한 점이 아닌(헤세가 특이한) 짝, 볼록하지 않은 자리에서도 걸음을 줄여 내려간다
    const scaleH = Math.max(...H.map((row, i) => Math.abs(row[i]!)), 1e-300);
    let moved = -1;
    for (let k = 0; k < 24 && moved < 0; k++, lambda *= 10) {
      const Hd = H.map((row, i) => row.map((h, j) => (fixed[i] || fixed[j] ? (i === j ? 1 : 0) : i === j ? h + lambda * (Math.abs(h) + 1e-9 * scaleH) : h)));
      const d = solveN(Hd, g.map((x, i) => (fixed[i] ? 0 : -x)));
      // 내려가는 쪽인지(매개변수 0~4개의 내적)
      if (!d || !(d.reduce((s, x, i) => s + x * g[i]!, 0) < 0)) continue;
      const na = A.clamp(xa.map((x, i) => x + d[i]!));
      const nb = B.clamp(xb.map((x, i) => x + d[nA + i]!));
      const fa = A.ev(na);
      const fb = B.ev(nb);
      if (!fa || !fb) continue;
      const nr = sub(fa.P, fb.P);
      const nf = 0.5 * dot(nr, nr);
      if (nf <= f) {
        moved = dist(fa.P, ea.P) + dist(fb.P, eb.P);
        xa = na;
        xb = nb;
        ea = fa;
        eb = fb;
        r = nr;
        f = nf;
        grad();
        lambda = Math.max(lambda / 100, 1e-12);
      }
    }
    // 내려가지 못했거나 거의 움직이지 않았다 — 멈춘 자리에서 극소인지 본다
    if (moved < 0 || moved <= tiny) break;
  }
  // 극소인지: 정의역 안 매개변수는 기울기가 0, 끝에 걸린 매개변수는 기울기가 바깥쪽(안으로 가면 커진다)
  if (n > 0 && !stationary(1e-8)) return no(`not stationary ${JSON.stringify(g)} steps ${steps}`);
  const distance = Math.sqrt(2 * f);
  // 더 먼 자리로 갔으면 버린다
  if (!(distance <= c.distance + tiny)) return no(`farther ${distance} > ${c.distance}`);
  // 잘린 면의 경계 안(허용치: 삼각형 답과 곡면 사이만큼의 두 배 — 현이 곡면에서 벗어난 만큼)
  const mag = Math.max(...ea.P.map(Math.abs), ...eb.P.map(Math.abs));
  const tolA = 2 * dist(A.ev(A.near(qa) ?? xa)?.P ?? qa, qa) + 1e-6 * (1 + mag);
  const tolB = 2 * dist(B.ev(B.near(qb) ?? xb)?.P ?? qb, qb) + 1e-6 * (1 + mag);
  if (!A.inside(xa, tolA)) return no('outside A');
  if (!B.inside(xb, tolB)) return no('outside B');
  return { a: ea.P, b: eb.P, distance, steps };
}

// ── 개체 측정에서 ──

/** 다듬기에 쓰는 문서 자료: 그물, 면·모서리 표, 곡면 정의(받기 전이면 undefined를 돌려주는 lookup — 그 면은 다듬지 않는다) */
export interface ExactScene {
  meshes: ReadonlyMap<string, Mesh3d>;
  faces: SnapFaceIndex | null;
  edges: SnapEdgeIndex | null;
  surfaces: FaceSurfaceLookup | null;
}

/** 누른 개체(entpick.ts Picked 가운데 쓰는 것) */
export interface ExactPick {
  meshId: string;
  what: string;
  point: readonly number[];
  face?: { face: number; center: readonly number[]; normal?: readonly number[] };
  edge?: { edge: number; kind: string; ends: readonly [readonly number[], readonly number[]] };
}

/** 누른 개체 → 다듬을 개체(삼각형 답을 낸 모양과 같은 것 — 면은 그 면, 모서리는 그 곡선, 꼭짓점·가운데 점·단면·점은 그 점). 못 만들면 null */
export function pickedGeo(p: ExactPick, s: ExactScene): ExactGeo | null {
  const mesh = s.meshes.get(p.meshId);
  if (p.what === 'face' && p.face) return mesh && s.faces ? faceGeo(mesh, s.faces, p.face.face, s.surfaces, p.face.normal ? { center: p.face.center, normal: p.face.normal } : null) : null;
  if (p.what === 'edge' && p.edge) {
    if (p.edge.kind === 'line') return segmentGeo(p.edge.ends[0], p.edge.ends[1]);
    return mesh && s.edges ? edgeGeo(mesh, s.edges, p.edge.edge) : null;
  }
  return pointGeo(p.point);
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 개체 측정 "최소 거리"(고른 면·모서리 삼각형 답 c)를 정확한 정의로(받지 못하면 null — 그대로 "≈"). size는 장면 크기, ms는 시간 한도 */
export function exactPicked(
  a: ExactPick,
  b: ExactPick,
  c: { a: readonly number[]; b: readonly number[]; distance: number },
  s: ExactScene,
  size: number,
  ms = 30,
  trace: ((why: string) => void) | null = null,
): ExactClosest | null {
  const A = pickedGeo(a, s);
  const B = pickedGeo(b, s);
  if (!A || !B) return trace?.(`no geo ${!!A} ${!!B}`), null;
  return refineClosest(A, B, c, size, clock() + ms, trace);
}

/** 그물의 그 점(세계)이 놓인 면들(점이 면 사이 모서리 위면 둘 이상 — 곡면 먼저) → 다듬을 개체들 */
function partFaceGeos(mesh: Mesh3d, s: ExactScene, p: readonly number[]): ExactGeo[] {
  const fx = s.faces;
  const ti = fx?.tableOf.get(mesh.id);
  const table = ti === undefined ? undefined : fx!.tables[ti];
  const L = toLocal(mesh, p);
  if (!fx || !table || !L) return [];
  const out: ExactGeo[] = [];
  for (const f of facesNear(mesh, table, L.p)) {
    const fp = fx.kinds[table.kinds[f]!] === 'plane' ? faceDetails(mesh, table, f, fx.kinds) : null;
    const g = faceGeo(mesh, fx, f, s.surfaces, fp?.normal ? { center: fp.center, normal: fp.normal } : null);
    if (g) out.push(g);
  }
  return out.sort((x, y) => Number(x.flat) - Number(y.flat));
}

/**
 * "부품 사이 최소 거리"(두 그물 삼각형 답 r — 코어 closestPoints)를 두 점이 놓인 면의 정확한 정의로(받지 못하면 null).
 * 점이 면 사이 모서리 위라 면이 둘 이상이면 짝마다 다듬어 가장 가까운 것
 */
export function exactParts(
  idA: string,
  idB: string,
  r: { a: readonly number[]; b: readonly number[]; distance: number },
  s: ExactScene,
  size: number,
  ms = 30,
  trace: ((why: string) => void) | null = null,
): ExactClosest | null {
  const end = clock() + ms;
  const ma = s.meshes.get(idA);
  const mb = s.meshes.get(idB);
  const As = ma ? partFaceGeos(ma, s, r.a) : [];
  const Bs = mb && clock() < end ? partFaceGeos(mb, s, r.b) : [];
  if (!As.length || !Bs.length) trace?.(`no geo ${As.length} ${Bs.length}`);
  let best: ExactClosest | null = null;
  for (const A of As)
    for (const B of Bs) {
      if (clock() > end) return best;
      const e = refineClosest(A, B, r, size, end, trace);
      if (e && (!best || e.distance < best.distance)) best = e;
    }
  return best;
}

/**
 * 그물 좌표 점 p에 가장 가까운 삼각형들의 면 번호(가장 가까운 거리에서 허용치 안 — 모서리·꼭짓점 위 점이면 그 둘레 면들, 면 표 — 못 찾으면 빈 목록, 넷까지)
 */
export function facesNear(mesh: Mesh3d, table: Pick<StepFaceTable, 'triStart'>, p: readonly number[]): number[] {
  const P = mesh.positions;
  const I = mesh.indices;
  const tris = I ? I.length / 3 : P.length / 9;
  // 코어 답은 float32 꼭짓점에서 나온 점이라 그 반올림만큼
  const tol = 1e-6 * (1 + Math.max(Math.abs(p[0]!), Math.abs(p[1]!), Math.abs(p[2]!)));
  let best = Infinity;
  const near: [number, number][] = [];
  const vx = (i: number): V3 => [P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!];
  for (let t = 0; t < tris; t++) {
    const a = vx(I ? I[t * 3]! : t * 3);
    const b = vx(I ? I[t * 3 + 1]! : t * 3 + 1);
    const c = vx(I ? I[t * 3 + 2]! : t * 3 + 2);
    // 둘레 구로 먼저 거른다
    const m: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const rad = Math.max(dist(m, a), dist(m, b), dist(m, c));
    const dm = dist(m, p) - rad;
    if (dm > Math.sqrt(best) + tol) continue;
    const d = Math.sqrt(pointTri2(p, a, b, c));
    if (d <= Math.sqrt(best) + tol) near.push([d, t]);
    if (d * d < best) best = d * d;
  }
  const lim = Math.sqrt(best) + tol;
  const faces: number[] = [];
  for (const [d, t] of near.sort((x, y) => x[0] - y[0]))
    if (d <= lim) {
      const f = faceAt(table, t);
      if (f >= 0 && !faces.includes(f)) faces.push(f);
    }
  return faces.slice(0, 4);
}

/** 점 p와 삼각형 abc 사이 거리 제곱(Ericson 5.1.5) */
function pointTri2(p: readonly number[], a: V3, b: V3, c: V3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  const q = (x: V3) => {
    const r = sub(p, x);
    return dot(r, r);
  };
  if (d1 <= 0 && d2 <= 0) return q(a);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return q(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return q(add(a, scale(ab, d1 / (d1 - d3))));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return q(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return q(add(a, scale(ac, d2 / (d2 - d6))));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return q(add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)))));
  const den = 1 / (va + vb + vc);
  return q(add(a, add(scale(ab, vb * den), scale(ac, vc * den))));
}
