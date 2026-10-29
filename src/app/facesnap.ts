/**
 * 축이 면을 뚫는 점을 B-rep 곡면 위로(코어 0.19.0 setMeasureSnap의 refineFace — 'axisFace', DOM 없음, 곡선 붙잡기 조각과 함께 받는다).
 *
 * 코어는 축(첫 점 축·끌어온 축·잠근 축)이 그물 면을 뚫는 점을 곡면을 나눈 삼각형의 평면에서 구한다. 그 삼각형의 B-rep 면을 면 표(그물 id·삼각형 번호 → 면)로 찾아
 * 축 직선과 그 면의 정확한 곡면이 만나는 점(코어 점에 가장 가까운 것)을 돌려준다.
 * - 원기둥·원뿔·구: 면 표의 식(반지름·반각·축·중심)으로 이차식을 푼다. 원환: 곡면까지 부호 거리의 뉴턴법(코어 점에서 시작)
 * - B-스플라인·회전·밀기·띄운 곡면: 면 표에 식이 없어 해석 워커가 남긴 곡면 정의(lookup — facesurf.ts가 되살린 곡면)로 (u, v, 직선 매개변수) 세 값 뉴턴법
 *   (곡면의 점·편도함수·되짚기는 해석기·질량 속성과 같은 계산). 정의를 아직 받지 않았거나 없으면 null
 * - 평면·다각형·삼각형 면은 null(삼각형 위 점이 곧 면 위 점이다)
 * - 잘린 면의 경계 안인지: 해석기는 면을 매개변수 공간 경계 다각형 안에서 삼각화하고 경계 꼭짓점을 모서리 위에 둔다. 교점의 접평면에 그 면의 삼각형을 펼쳐
 *   교점이 어느 삼각형 안(허용치 tol — 교점과 코어 점 사이의 두 배, 곧 곡면이 삼각형에서 벗어난 만큼)인지 본다. 경계 밖이면 null(코어 점 그대로)
 * 결과는 넘긴 값과 면 표·그물·곡면 정의로만 정해진다(커서 광선을 쓰지 않는다 — 코어가 커서 광선을 빼고 기억한다).
 * 직선은 line.origin·line.dir만 읽는다(코어 0.20.0부터 축이 아닌 잠근 선은 line.axis가 없다 — 같은 계산으로 다듬는다).
 */
import type { SnapRefineFaceInput } from 'opencad-viewer3d';
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { StepFaceTable } from '../scene';
import { dirToLocal, toLocal, toWorld } from './curvesnap';
import { faceAt } from './faces';

type V3 = [number, number, number];

/** 면 고르기용 표(doc.ts FaceIndex와 같은 꼴) */
export interface SnapFaceIndex {
  kinds: readonly string[];
  tables: readonly StepFaceTable[];
  tableOf: ReadonlyMap<string, number>;
}

/** 면 표에 식이 없는 곡면의 계산(surfaces.ts Surface — 점·편도함수, 점에서 (u, v) 되짚기, 정의역 — 무한하면 다시 풀기의 매개변수 격자를 쓰지 않는다) */
export interface ParamSurface {
  derivs(u: number, v: number): [V3, V3, V3];
  project(p: V3, hint?: readonly [number, number] | null): [number, number];
  readonly u0?: number;
  readonly u1?: number;
  readonly v0?: number;
  readonly v1?: number;
  readonly periodU?: number;
  readonly periodV?: number;
}

/** 면 하나의 곡면 정의: 형상 항목 좌표의 곡면과, 그물 좌표로 옮기는 배율 k·항목 묶음 원점 origin(그물 좌표 = (항목 좌표 − origin)·k) */
export interface FaceSurface {
  surf: ParamSurface;
  k: number;
  origin: readonly [number, number, number];
}

/** (면 표 번호, 면 번호) → 곡면 정의. 아직 받지 않았으면 undefined, 없으면 null */
export type FaceSurfaceLookup = (table: number, face: number) => FaceSurface | null | undefined;

/** 면 표에 식이 있는 곡면 */
const ANALYTIC = new Set(['cylinder', 'cone', 'sphere', 'torus']);
/** 해석 워커의 곡면 정의로 푸는 곡면 */
export const PARAMETRIC_KINDS: ReadonlySet<string> = new Set(['revolution', 'extrusion', 'bspline', 'offset']);

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const addK = (a: readonly number[], b: readonly number[], k: number): V3 => [a[0]! + k * b[0]!, a[1]! + k * b[1]!, a[2]! + k * b[2]!];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!);
const unit = (a: readonly number[]): V3 | null => {
  const l = norm(a);
  return l > 0 && Number.isFinite(l) ? [a[0]! / l, a[1]! / l, a[2]! / l] : null;
};

/** 축 직선과 곡면의 교점(그물 좌표): 점 X(직선 위), 그 자리 곡면 법선 n(단위, 부호는 상관없다) */
export interface SurfaceHit {
  X: V3;
  n: V3;
}

/** A s² + B s + C = 0의 근 가운데 s0에 가장 가까운 것(없으면 null) */
function nearestRoot(A: number, B: number, C: number, s0: number): number | null {
  const scale = Math.max(Math.abs(A), Math.abs(B), Math.abs(C));
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  if (Math.abs(A) <= 1e-12 * scale) return Math.abs(B) > 1e-12 * scale ? -C / B : null;
  const D = B * B - 4 * A * C;
  if (!(D >= 0)) return null;
  // 근의 공식의 빼기 오차를 피하는 꼴
  const q = -0.5 * (B + (B < 0 ? -1 : 1) * Math.sqrt(D));
  const roots = [q / A];
  if (q !== 0) roots.push(C / q);
  let best: number | null = null;
  for (const s of roots) if (Number.isFinite(s) && (best === null || Math.abs(s - s0) < Math.abs(best - s0))) best = s;
  return best;
}

/**
 * 해석 곡면(면 표 매개변수 p = [r1, r2, 축 3, 원점 3], 그물 좌표)과 직선(O + s D, D 단위)의 교점 가운데 코어 점 P에 가장 가까운 것.
 * 원기둥 |d⊥| = r, 원뿔 |d⊥| = r1 + h tan r2(h = 축 방향 높이 — 원점이 반지름 r1인 자리), 구 |d| = r는 이차식, 원환 (|d⊥| − R)² + h² = r²는 뉴턴법
 */
export function analyticHit(kind: string, p: ArrayLike<number>, O: V3, D: V3, P: V3): SurfaceHit | null {
  const r1 = p[0]!;
  const r2 = p[1]!;
  const a = unit([p[2]!, p[3]!, p[4]!]);
  const o: V3 = [p[5]!, p[6]!, p[7]!];
  if (!a || !(r1 > 0)) return null;
  const w = sub(O, o);
  const s0 = dot(sub(P, O), D);
  const hD = dot(D, a);
  const h0 = dot(w, a);
  let s: number | null;
  if (kind === 'cylinder') s = nearestRoot(1 - hD * hD, 2 * (dot(w, D) - h0 * hD), dot(w, w) - h0 * h0 - r1 * r1, s0);
  else if (kind === 'sphere') s = nearestRoot(1, 2 * dot(w, D), dot(w, w) - r1 * r1, s0);
  else if (kind === 'cone') {
    const t = Math.tan(r2);
    if (!Number.isFinite(t)) return null;
    const rh = r1 + t * h0;
    s = nearestRoot(1 - hD * hD - t * t * hD * hD, 2 * (dot(w, D) - h0 * hD - t * hD * rh), dot(w, w) - h0 * h0 - rh * rh, s0);
  } else if (kind === 'torus') s = torusRoot(r1, r2, a, w, D, s0);
  else return null;
  if (s === null || !Number.isFinite(s)) return null;
  const X = addK(O, D, s);
  const d = sub(X, o);
  const h = dot(d, a);
  const perp = addK(d, a, -h);
  const rho = norm(perp);
  let n: V3 | null;
  if (kind === 'sphere') n = unit(d);
  else if (!(rho > 0)) n = null;
  else {
    const radial: V3 = [perp[0] / rho, perp[1] / rho, perp[2] / rho];
    if (kind === 'cylinder') n = radial;
    else if (kind === 'cone') n = unit(addK(radial, a, -Math.tan(r2)));
    else n = unit(addK(addK([0, 0, 0], radial, rho - r1), a, h));
  }
  return n ? { X, n } : null;
}

/** 원환(큰 반지름 R, 작은 반지름 r, 축 a, w = 직선 시작 − 중심)과 직선의 교점 매개변수: 곡면까지 부호 거리 g(s) = √((ρ − R)² + h²) − r의 뉴턴법(s0에서) */
function torusRoot(R: number, r: number, a: V3, w: V3, D: V3, s0: number): number | null {
  if (!(r > 0)) return null;
  const size = R + r;
  let s = s0;
  for (let it = 0; it < 40; it++) {
    const d = addK(w, D, s);
    const h = dot(d, a);
    const perp = addK(d, a, -h);
    const rho = norm(perp);
    if (!(rho > 0)) return null;
    const e = rho - R;
    const q = Math.hypot(e, h);
    if (!(q > 0)) return null;
    const g = q - r;
    if (Math.abs(g) <= 1e-14 * size) return s;
    // ∇g = (e/q)(d⊥/ρ) + (h/q) a
    const gp = (e / q) * (dot(perp, D) / rho) + (h / q) * dot(a, D);
    if (!(Math.abs(gp) > 1e-9)) return null;
    let step = g / gp;
    // 한 번에 작은 반지름보다 멀리 가지 않는다(다른 쪽 고리로 건너뛰지 않게)
    if (Math.abs(step) > r) step = Math.sign(step) * r;
    s -= step;
    if (Math.abs(step) <= 1e-15 * (size + Math.abs(s))) return s;
  }
  return null;
}

/**
 * paramHit의 다시 풀기: 코어 점을 되짚은 (u, v)에서 수렴하지 않으면 다른 시작점에서 다시 푼다(refineFaceHit이 준다).
 * 극점(한 매개변수 줄이 한 점으로 모인 자리 — 돔 꼭대기·모서리 둥글림 끝) 둘레에서는 코어 점의 되짚기가 극점 (u, v)로 가 v가 정해지지 않고
 * 야코비가 퇴화해(∂v = 0) 뉴턴이 멈춘다. 삼각형 꼭짓점·매개변수 격자는 극점에서 떨어진 (u, v)를 준다
 */
export interface ParamRetry {
  /** 다른 시작점(그물 좌표 — 코어 점이 놓인 삼각형의 꼭짓점). 그 점을 곡면에 되짚은 (u, v)와 직선에 내린 자리에서 */
  starts: readonly V3[];
  /** 받는 교점은 코어 점에서 이 거리(그물 좌표) 안이어야 한다 — 다른 시작점이 데려가는 먼 근을 받지 않게(그 삼각형의 가장 긴 변) */
  reach: number;
}

/** 다시 풀 때 쓰는 매개변수 격자(칸 가운데 GRID × GRID — 극점 줄 위가 아니다)에서 코어 점에 가까운 칸 수 */
const GRID = 8;
const GRID_SEEDS = 3;

/** 매개변수 t에서 dt만큼 갈 때 정의역 [a, b] 안에 머무는 걸음 비율(경계까지의 0.9배, 주기·무한·정의역 밖이면 1) */
function room(t: number, dt: number, a: number | undefined, b: number | undefined, period: number | undefined): number {
  if ((period ?? 0) > 0 || a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b) || t < a || t > b || dt === 0) return 1;
  const left = dt > 0 ? b - t : t - a;
  return Math.min(1, (0.9 * left) / Math.abs(dt)) || 1;
}

/** 곡면 정의역(유한하면)의 GRID × GRID 칸 가운데 가운데 점이 p에 가까운 차례로 count개 */
function gridSeeds(surf: ParamSurface, p: V3, count: number): [number, number][] {
  const { u0, u1, v0, v1 } = surf;
  if (u0 === undefined || u1 === undefined || v0 === undefined || v1 === undefined || ![u0, u1, v0, v1].every(Number.isFinite) || !(u1 > u0) || !(v1 > v0)) return [];
  const all: [number, number, number][] = [];
  for (let i = 0; i < GRID; i++)
    for (let j = 0; j < GRID; j++) {
      const u = u0 + ((u1 - u0) * (i + 0.5)) / GRID;
      const v = v0 + ((v1 - v0) * (j + 0.5)) / GRID;
      const d = norm(sub(surf.derivs(u, v)[0], p));
      if (Number.isFinite(d)) all.push([d, u, v]);
    }
  all.sort((a, b) => a[0] - b[0]);
  return all.slice(0, count).map(([, u, v]) => [u, v]);
}

/**
 * 곡면 정의(항목 좌표)와 그물 좌표 직선의 교점: 항목 좌표로 옮겨 (u, v, s) 뉴턴법 — F = S(u, v) − (O + s D) = 0, 야코비 [S_u, S_v, −D].
 * 시작은 코어 점을 곡면에 되짚은 (u, v)와 그 점의 직선 매개변수. 늘면 걸음을 반씩, 더 줄지 않을 때까지(도함수가 차분인 곡면도 다가간다).
 * |F|가 항목 크기의 1e-9 안이면 받는다. 수렴하지 않고 retry가 있으면 그 시작점(삼각형 꼭짓점), 그다음 매개변수 격자에서 코어 점에 가까운 칸 셋의
 * 가운데에서 차례로 다시 풀어, 코어 점에서 retry.reach 안인 첫 교점을 받는다(코어 점에서 수렴한 답은 그대로다)
 */
export function paramHit(fs: FaceSurface, O: V3, D: V3, P: V3, retry: ParamRetry | null = null): SurfaceHit | null {
  const k = fs.k;
  if (!(k > 0)) return null;
  const toItem = (q: V3): V3 => [q[0] / k + fs.origin[0], q[1] / k + fs.origin[1], q[2] / k + fs.origin[2]];
  const Oi = toItem(O);
  const Pi = toItem(P);
  const size = Math.max(1, norm(Pi));
  const tol = 1e-15 * size;
  const F = (uu: number, vv: number, ss: number): { f: V3; e: number; Su: V3; Sv: V3 } | null => {
    const [S, Su, Sv] = fs.surf.derivs(uu, vv);
    const f = sub(S, addK(Oi, D, ss));
    const e = norm(f);
    return Number.isFinite(e) ? { f, e, Su, Sv } : null;
  };
  /** (u, v, s)에서 뉴턴 — 받을 만큼 줄면 그 교점(그물 좌표)과 법선, 아니면 null */
  const solve = (u: number, v: number, s: number, inside = false): SurfaceHit | null => {
    let cur = F(u, v, s);
    if (!cur) return null;
    for (let it = 0; it < 40 && cur.e > tol; it++) {
      const { f, Su, Sv } = cur;
      const nD: V3 = [-D[0], -D[1], -D[2]];
      // 3×3 [Su Sv −D] Δ = −f (크라머)
      const det = dot(Su, cross(Sv, nD));
      if (!(Math.abs(det) > 1e-300)) return null;
      const rhs: V3 = [-f[0], -f[1], -f[2]];
      const du = dot(rhs, cross(Sv, nD)) / det;
      const dv = dot(Su, cross(rhs, nD)) / det;
      const ds = dot(Su, cross(Sv, rhs)) / det;
      let moved = false;
      // 다시 풀 때는 정의역 밖으로 나가는 걸음을 경계까지 남은 거리의 0.9배로 줄인다(정의역 밖은 경계 값으로 잘려 뉴턴이 멈춘다 — 극점 둘레)
      const w0 = inside ? Math.min(1, room(u, du, fs.surf.u0, fs.surf.u1, fs.surf.periodU), room(v, dv, fs.surf.v0, fs.surf.v1, fs.surf.periodV)) : 1;
      for (let j = 0, w = w0; j < 20; j++, w *= 0.5) {
        const nx = F(u + w * du, v + w * dv, s + w * ds);
        if (nx && nx.e < cur.e) {
          u += w * du;
          v += w * dv;
          s += w * ds;
          cur = nx;
          moved = true;
          break;
        }
      }
      if (!moved) break;
    }
    if (!(cur.e <= 1e-9 * size)) return null;
    const n = unit(cross(cur.Su, cur.Sv));
    if (!n) return null;
    const Xi = addK(Oi, D, s);
    return { X: [(Xi[0] - fs.origin[0]) * k, (Xi[1] - fs.origin[1]) * k, (Xi[2] - fs.origin[2]) * k], n };
  };
  /** 항목 좌표 점 q를 곡면에 되짚은 (u, v)와 직선에 내린 자리에서 */
  const from = (q: V3, inside = false): SurfaceHit | null => {
    let uv: [number, number];
    try {
      uv = fs.surf.project(q);
    } catch {
      return null;
    }
    return solve(uv[0], uv[1], dot(sub(q, Oi), D), inside);
  };
  const hit = from(Pi);
  if (hit || !retry || !(retry.reach > 0)) return hit;
  const near = (h: SurfaceHit | null): SurfaceHit | null => (h && norm(sub(h.X, P)) <= retry.reach ? h : null);
  for (const q of retry.starts) {
    const h = near(from(toItem(q), true));
    if (h) return h;
  }
  let seeds: [number, number][];
  try {
    seeds = gridSeeds(fs.surf, Pi, GRID_SEEDS);
  } catch {
    return null;
  }
  for (const [u, v] of seeds) {
    const h = near(solve(u, v, dot(sub(fs.surf.derivs(u, v)[0], Oi), D), true));
    if (h) return h;
  }
  return null;
}

/**
 * 그물 좌표 점 X(법선 n)가 면 f의 삼각형 안인지: 삼각형마다 X의 접평면에 펼쳐(n에 수직인 두 축으로 내린 2D 좌표) X가 그 안인지(변까지 tol만큼 바깥도 안).
 * X에서 먼 삼각형(가장 가까운 꼭짓점이 가장 긴 변 + tol보다 먼 것)과 접평면에 비스듬한 삼각형(법선 사이 cos < 0.3 — 닫힌 곡면의 뒤쪽 등)은 보지 않는다
 */
export function insideFace(mesh: Mesh3d, table: Pick<StepFaceTable, 'triStart'>, f: number, X: V3, n: V3, tol: number): boolean {
  const t0 = table.triStart[f];
  const t1 = table.triStart[f + 1];
  const P = mesh.positions;
  const I = mesh.indices;
  if (t0 === undefined || t1 === undefined || !(t1 > t0) || !I) return false;
  const e: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unit(addK(e, n, -dot(e, n)));
  if (!e1) return false;
  const e2 = cross(n, e1);
  const vx = (i: number): V3 => [P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!];
  for (let t = t0; t < t1; t++) {
    const A = vx(I[t * 3]!);
    const B = vx(I[t * 3 + 1]!);
    const C = vx(I[t * 3 + 2]!);
    const ab = sub(B, A);
    const ac = sub(C, A);
    const nt = cross(ab, ac);
    const area2 = norm(nt);
    if (!(area2 > 0)) continue;
    if (Math.abs(dot(nt, n)) < 0.3 * area2) continue;
    const reach = Math.max(norm(ab), norm(ac), norm(sub(C, B))) + tol;
    const a = sub(A, X);
    const b = sub(B, X);
    const c = sub(C, X);
    if (Math.min(norm(a), norm(b), norm(c)) > reach) continue;
    const q = [
      [dot(a, e1), dot(a, e2)],
      [dot(b, e1), dot(b, e2)],
      [dot(c, e1), dot(c, e2)],
    ] as const;
    // 2D 넓이 부호(펼친 삼각형의 도는 쪽)
    const s2 = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]);
    if (s2 === 0) continue;
    const sg = s2 > 0 ? 1 : -1;
    let inside = true;
    for (let i = 0; i < 3 && inside; i++) {
      const p0 = q[i]!;
      const p1 = q[(i + 1) % 3]!;
      const ex = p1[0] - p0[0];
      const ey = p1[1] - p0[1];
      const l = Math.hypot(ex, ey);
      if (!(l > 0)) continue;
      // 원점(X)이 변 p0 → p1의 안쪽으로 얼마나 들었는지(바깥이면 음수)
      const dIn = (sg * (ex * -p0[1] - ey * -p0[0])) / l;
      if (dIn < -tol) inside = false;
    }
    if (inside) return true;
  }
  return false;
}

/** 코어 점이 놓인 삼각형(그물 삼각형 번호 t)의 세 꼭짓점과 가장 긴 변 — paramHit 다시 풀기. 없으면 null */
function triangleRetry(mesh: Mesh3d, t: number): ParamRetry | null {
  const I = mesh.indices;
  const P = mesh.positions;
  if (!I || !(t >= 0) || (t + 1) * 3 > I.length) return null;
  const starts = [0, 1, 2].map((c): V3 => {
    const q = I[t * 3 + c]! * 3;
    return [P[q]!, P[q + 1]!, P[q + 2]!];
  });
  const [a, b, c] = starts as [V3, V3, V3];
  const reach = Math.max(norm(sub(b, a)), norm(sub(c, b)), norm(sub(a, c)));
  return starts.every((s) => s.every(Number.isFinite)) && reach > 0 ? { starts, reach } : null;
}

/**
 * 코어 refineFace 입력 → 축 직선과 그 면의 B-rep 곡면의 교점(세계, 축 직선 위 점). 평면·다각형·삼각형 면, 면 표가 없는 그물, 단면의 채운 면(삼각형 번호 −1),
 * 곡면 정의를 아직 받지 않은 곡면, 교점이 없거나 그 면의 경계 밖이면 null(규칙은 머리글). 곡면 정의로 푸는 면은 코어 점에서 수렴하지 않으면
 * 그 삼각형 꼭짓점·매개변수 격자에서 다시 푼다(paramHit retry — 코어 점에서 그 삼각형의 가장 긴 변 안인 교점만)
 */
export function refineFaceHit(c: SnapRefineFaceInput, meshes: ReadonlyMap<string, Mesh3d>, fx: SnapFaceIndex, lookup: FaceSurfaceLookup | null = null): V3 | null {
  const mesh = meshes.get(c.face.id);
  const ti = fx.tableOf.get(c.face.id);
  const table = ti === undefined ? undefined : fx.tables[ti];
  if (!mesh || !table || ti === undefined) return null;
  const f = faceAt(table, c.face.index);
  if (f < 0) return null;
  const kind = fx.kinds[table.kinds[f]!] ?? '';
  const analytic = ANALYTIC.has(kind);
  if (!analytic && !(lookup && PARAMETRIC_KINDS.has(kind))) return null;
  const P = toLocal(mesh, c.point);
  const O = toLocal(mesh, c.line.origin);
  const D = dirToLocal(mesh, c.line.dir);
  if (!P || !O || !D) return null;
  let hit: SurfaceHit | null;
  if (analytic) hit = analyticHit(kind, table.params.subarray(f * 8, f * 8 + 8), O.p, D, P.p);
  else {
    const fs = lookup!(ti, f);
    hit = fs ? paramHit(fs, O.p, D, P.p, triangleRetry(mesh, c.face.index)) : null;
  }
  if (!hit) return null;
  const mag = Math.max(Math.abs(hit.X[0]), Math.abs(hit.X[1]), Math.abs(hit.X[2]));
  const tol = 2 * Math.hypot(hit.X[0] - P.p[0], hit.X[1] - P.p[1], hit.X[2] - P.p[2]) + 1e-6 * (1 + mag);
  if (!insideFace(mesh, table, f, hit.X, hit.n, tol)) return null;
  const w = toWorld(mesh, hit.X[0], hit.X[1], hit.X[2]);
  return w.every(Number.isFinite) ? w : null;
}
