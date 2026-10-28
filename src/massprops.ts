/**
 * B-rep 질량 속성(순수 계산, DOM 없음): 닫힌 입체의 부피·1차·2차 모멘트를 화면용 삼각형이 아니라 곡면과 모서리 곡선에서 구한다.
 *
 * 발산 정리로 입체 적분을 겉면 적분으로 바꾼다. q = x − c(c는 항목 상자 가운데 — 큰 좌표에서 자릿수를 잃지 않게), n은 바깥 법선:
 *   3V = ∮ q·n dA,  4∫q_i dV = ∮ q_i (q·n) dA,  5∫q_i q_j dV = ∮ q_i q_j (q·n) dA,  그리고 닫힘 확인 ∮ n dA(닫힌 겉면이면 0).
 * 이 13개 값을 "흐름 값(flux)"이라 부른다(FLUX개, 차례는 addFlux).
 *
 * 면마다 곡면 매개변수 (u,v)의 영역 D에서 ∬_D F du dv(F = f(q)·(q·N), N = S_u×S_v)를 구한다. 그린 정리로 경계 적분
 * ∮_∂D G dv(G(u,v) = ∫_{u_ref}^{u} F(s,v) ds)로 바꾼다(Sommariva–Vianello 2009의 매개변수 공간 가우스–그린 적분과 같은 생각).
 * - 안쪽 적분 G: 평면은 F가 u의 3차 다항식이라 3점 가우스로 정확하다. 원기둥·원뿔·구·원환은 S가 (cos u, sin u)의 일차식이고
 *   N도 일차식이라 F가 u의 4차 이하 삼각 다항식이다 — 등간격 9점 값으로 푸리에 계수를 구해 닫힌 식으로 적분한다(정확).
 * - 바깥 적분: 경계 토막이 모서리 곡선이면 곡선 매개변수 t의 8점 가우스로(곡선 위 점을 곡면에 되짚어 (u,v)·dv/dt),
 *   이음선·극선·정의역 끝처럼 매개변수 공간에서 곧은 토막은 (u,v) 직선 위 가우스로. 둘 다 각 π/8 넘는 토막은 나눈다.
 * 경계가 직선·원·타원이고 곡면 위에 있으면 반올림 오차 수준(1e-12 안팎)으로 맞는다. 곡선이 곡면에서 떨어져 있으면(B-스플라인 교선,
 * 꼭짓점이 곡선에서 먼 모서리의 꺾인 선) 떨어진 거리로 부피 어림 오차(bound)를 더한다.
 */
import type { V3 } from './math';
import { ConeSurface, CylinderSurface, PlaneSurface, SphereSurface, type Surface, TorusSurface } from './surfaces';
import type { Polygon, UV } from './tessellate';

/** 흐름 값 개수: [3V, 4Mx, 4My, 4Mz, 5Sxx, 5Syy, 5Szz, 5Sxy, 5Syz, 5Szx, ∮Nx, ∮Ny, ∮Nz] */
export const FLUX = 13;

/**
 * 항목(입체) 질량 속성 칸 개수(면 표 props): [V, Mx, My, Mz, Sxx, Syy, Szz, Sxy, Syz, Szx, cx, cy, cz, bound, how]
 * — 모멘트는 기준점 c(항목 좌표) 기준, bound는 부피 어림 오차(같은 단위³, 0이면 반올림 수준), how는 PROPS_* 값
 */
export const PROPS_LEN = 15;
/** props[14]: 화면용 삼각형으로 구했다(B-rep 적분을 못 했거나 삼각형과 크게 어긋나 버렸다) */
export const PROPS_TRIANGLES = 0;
/** props[14]: B-rep 곡면·모서리 곡선 적분 */
export const PROPS_BREP = 1;
/** props[14]: 시간 한도를 넘어 삼각형으로 구했다 */
export const PROPS_TIMEOUT = 2;

const G3: readonly (readonly [number, number])[] = [
  [-0.7745966692414834, 0.5555555555555556],
  [0, 0.8888888888888888],
  [0.7745966692414834, 0.5555555555555556],
];
const G8: readonly (readonly [number, number])[] = [
  [-0.9602898564975363, 0.1012285362903763],
  [-0.7966664774136267, 0.2223810344533745],
  [-0.525532409916329, 0.3137066458778873],
  [-0.1834346424956498, 0.362683783378362],
  [0.1834346424956498, 0.362683783378362],
  [0.525532409916329, 0.3137066458778873],
  [0.7966664774136267, 0.2223810344533745],
  [0.9602898564975363, 0.1012285362903763],
];
/** 토막을 나누는 각(라디안) */
const STEP_ANGLE = Math.PI / 8;
/** 삼각 다항식 안쪽 적분 표본 수(4차까지 정확) */
const NF = 9;
const SJ = Array.from({ length: NF }, (_, j) => (2 * Math.PI * j) / NF);
const CJ = SJ.map(Math.cos);
const SNJ = SJ.map(Math.sin);

/** out[0..12] += w · 피적분 값(q, N) */
export function addFlux(out: Float64Array, w: number, qx: number, qy: number, qz: number, nx: number, ny: number, nz: number): void {
  const qn = (qx * nx + qy * ny + qz * nz) * w;
  out[0]! += qn;
  out[1]! += qx * qn;
  out[2]! += qy * qn;
  out[3]! += qz * qn;
  out[4]! += qx * qx * qn;
  out[5]! += qy * qy * qn;
  out[6]! += qz * qz * qn;
  out[7]! += qx * qy * qn;
  out[8]! += qy * qz * qn;
  out[9]! += qz * qx * qn;
  out[10]! += nx * w;
  out[11]! += ny * w;
  out[12]! += nz * w;
}

/**
 * 삼각형 하나의 흐름 값(평평한 삼각형 — 정확): c를 꼭짓점으로 한 사면체로 3V·4M·5S를 더한다(N은 넓이 벡터).
 * 점은 c를 뺀 값
 */
export function addTriangleFlux(out: Float64Array, ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, sign = 1): void {
  const v6 = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) * sign;
  const sx = ax + bx + cx;
  const sy = ay + by + cy;
  const sz = az + bz + cz;
  // 3V = 3·v6/6, 4∫q = 4·(v6/6)·s/4, 5∫q qᵀ = 5·(v6/6)/20·(Σ p pᵀ + s sᵀ)
  out[0]! += v6 / 2;
  out[1]! += (v6 / 6) * sx;
  out[2]! += (v6 / 6) * sy;
  out[3]! += (v6 / 6) * sz;
  const k = v6 / 24;
  out[4]! += k * (ax * ax + bx * bx + cx * cx + sx * sx);
  out[5]! += k * (ay * ay + by * by + cy * cy + sy * sy);
  out[6]! += k * (az * az + bz * bz + cz * cz + sz * sz);
  out[7]! += k * (ax * ay + bx * by + cx * cy + sx * sy);
  out[8]! += k * (ay * az + by * bz + cy * cz + sy * sz);
  out[9]! += k * (az * ax + bz * bx + cz * cx + sz * sx);
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = cx - ax, wy = cy - ay, wz = cz - az;
  out[10]! += ((uy * wz - uz * wy) / 2) * sign;
  out[11]! += ((uz * wx - ux * wz) / 2) * sign;
  out[12]! += ((ux * wy - uy * wx) / 2) * sign;
}

/** 삼각형 묶음(xyz 배열·번호)의 흐름 값을 out에 더한다(점에서 c를 빼고) */
export function trianglesFlux(out: Float64Array, P: ArrayLike<number>, I: ArrayLike<number>, t0: number, t1: number, c: V3, sign = 1): void {
  for (let t = t0; t < t1; t++) {
    const a = I[t * 3]! * 3;
    const b = I[t * 3 + 1]! * 3;
    const d = I[t * 3 + 2]! * 3;
    addTriangleFlux(out, P[a]! - c[0], P[a + 1]! - c[1], P[a + 2]! - c[2], P[b]! - c[0], P[b + 1]! - c[1], P[b + 2]! - c[2], P[d]! - c[0], P[d + 1]! - c[1], P[d + 2]! - c[2], sign);
  }
}

/** 경계 곡선(모서리 곡선 또는 두 점 사이 직선) */
export interface BoundaryCurve {
  point(t: number): V3;
  d1(t: number): V3;
}

/** 경계 토막: 곡선 구간 t0 → t1(링을 도는 방향). linear면 3D 직선 */
export interface Seg {
  c: BoundaryCurve;
  t0: number;
  t1: number;
  linear: boolean;
}

/** 두 점 사이 직선(t 0 → 1) */
export function lineCurve(a: V3, b: V3): BoundaryCurve {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return { point: (t) => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t], d1: () => d };
}

/** 정확히 적분할 수 있는 곡면(평면·원기둥·원뿔·구·원환) */
export function integrableSurface(s: Surface): boolean {
  return s instanceof PlaneSurface || s instanceof CylinderSurface || s instanceof ConeSurface || s instanceof SphereSurface || s instanceof TorusSurface;
}

/** 곡면 계산기: 안쪽 적분 G(u,v)를 out에 w배로 더한다 */
interface Inner {
  readonly plane: boolean;
  /** v가 각(구·원환)인지 */
  readonly angularV: boolean;
  add(out: Float64Array, w: number, u: number, v: number): void;
}

/** 평면 S = o + uX + vY: F는 u의 3차 다항식 → 3점 가우스 */
function planeInner(s: PlaneSurface, c: V3, uref: number): Inner {
  const { o, x: X, y: Y } = s.f;
  const nx = X[1] * Y[2] - X[2] * Y[1];
  const ny = X[2] * Y[0] - X[0] * Y[2];
  const nz = X[0] * Y[1] - X[1] * Y[0];
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  return {
    plane: true,
    angularV: false,
    add(out, w, u, v) {
      const h = (u - uref) / 2;
      if (h === 0) return;
      const m = (u + uref) / 2;
      for (const [x, gw] of G3) {
        const s0 = m + h * x;
        addFlux(out, w * gw * h, ox + X[0] * s0 + Y[0] * v, oy + X[1] * s0 + Y[1] * v, oz + X[2] * s0 + Y[2] * v, nx, ny, nz);
      }
    },
  };
}

/**
 * 회전 곡면 S = o + ρ(v)(cos u X + sin u Y) + ζ(v) Z: F는 u의 4차 이하 삼각 다항식 →
 * G(u,v) = Σ_j W_j(u)·F(s_j, v), W_j(u) = (u − u_ref)/9 + (2/9) Σ_{m=1..4} [sin m(u − s_j) − sin m(u_ref − s_j)]/m (s_j = 2πj/9 — 정확)
 */
function rotInner(s: CylinderSurface | ConeSurface | SphereSurface | TorusSurface, c: V3, uref: number): Inner {
  const { o, x: X, y: Y, z: Z } = s.f;
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  // ρ, ρ', ζ, ζ'
  let profile: (v: number) => [number, number, number, number];
  if (s instanceof CylinderSurface) profile = (v) => [s.r, 0, v, 1];
  else if (s instanceof ConeSurface) profile = (v) => [s.r + v * s.t, s.t, v, 1];
  else if (s instanceof SphereSurface) profile = (v) => [s.r * Math.cos(v), -s.r * Math.sin(v), s.r * Math.sin(v), s.r * Math.cos(v)];
  else profile = (v) => [s.R + s.r * Math.cos(v), -s.r * Math.sin(v), s.r * Math.sin(v), s.r * Math.cos(v)];
  const angularV = s instanceof SphereSurface || s instanceof TorusSurface;
  const W = new Float64Array(NF);
  // 표본 방향(반지름 r_j·접선 t_j)과 u_ref 쪽 몫 Σ_m sin m(u_ref − s_j)/m은 면마다 한 번
  const R = new Float64Array(NF * 3);
  const T = new Float64Array(NF * 3);
  const REF = new Float64Array(NF);
  for (let j = 0; j < NF; j++) {
    const cj = CJ[j]!;
    const sj = SNJ[j]!;
    for (let k = 0; k < 3; k++) {
      R[j * 3 + k] = X[k]! * cj + Y[k]! * sj;
      T[j * 3 + k] = Y[k]! * cj - X[k]! * sj;
    }
    REF[j] = sinSeries(Math.sin(uref - SJ[j]!), Math.cos(uref - SJ[j]!));
  }
  return {
    plane: false,
    angularV,
    add(out, w, u, v) {
      const du = u - uref;
      const su = Math.sin(u);
      const cu = Math.cos(u);
      for (let j = 0; j < NF; j++) {
        // x = u − s_j: sin x·cos x를 덧셈 정리로(삼각 함수 호출을 줄인다)
        const sx = su * CJ[j]! - cu * SNJ[j]!;
        const cx = cu * CJ[j]! + su * SNJ[j]!;
        W[j] = du / NF + (2 / NF) * (sinSeries(sx, cx) - REF[j]!);
      }
      const [rho, drho, zeta, dzeta] = profile(v);
      for (let j = 0; j < NF; j++) {
        const rx = R[j * 3]!, ry = R[j * 3 + 1]!, rz = R[j * 3 + 2]!;
        const tx = T[j * 3]!, ty = T[j * 3 + 1]!, tz = T[j * 3 + 2]!;
        // S_u = ρ·t, S_v = ρ'·r + ζ'·Z
        const ux = rho * tx, uy = rho * ty, uz = rho * tz;
        const vx = drho * rx + dzeta * Z[0], vy = drho * ry + dzeta * Z[1], vz = drho * rz + dzeta * Z[2];
        addFlux(out, w * W[j]!, ox + rho * rx + zeta * Z[0], oy + rho * ry + zeta * Z[1], oz + rho * rz + zeta * Z[2], uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      }
    },
  };
}

/** Σ_{m=1..4} sin(m x)/m (sin x·cos x에서 배각 공식으로) */
function sinSeries(s1: number, c1: number): number {
  const s2 = 2 * s1 * c1;
  const c2 = c1 * c1 - s1 * s1;
  const s3 = s2 * c1 + c2 * s1;
  const s4 = 2 * s2 * c2;
  return s1 + s2 / 2 + s3 / 3 + s4 / 4;
}

function wrapNear(x: number, ref: number, P: number): number {
  return P > 0 ? x + Math.round((ref - x) / P) * P : x;
}

/**
 * 면 하나의 ∬_D F du dv(S_u×S_v 방향, 흐름 값 FLUX개)를 out에 더한다. polys는 tessellate.ts faceDomain의 다각형
 * (바깥 + 구멍, 점의 p는 경계 3D 점), seg(a, b)는 고리 토막 a → b의 경계 곡선(없으면 매개변수 공간 직선 — 이음선·극선·정의역 끝).
 * 고리 방향은 넓이 부호로 맞춘다(바깥 반시계, 구멍 시계). 돌려주는 값은 부피 어림 오차(곡선이 곡면에서 떨어진 만큼), 못 하면 NaN
 */
export function faceFlux(s: Surface, polys: readonly Polygon[], c: V3, seg: (a: UV, b: UV) => Seg | null, out: Float64Array, size = 1): number {
  if (!integrableSurface(s)) return NaN;
  let uref = 0;
  let n = 0;
  for (const pg of polys)
    for (const q of pg.outer) {
      uref += q.u;
      n++;
    }
  if (!n) return NaN;
  uref /= n;
  const inner = s instanceof PlaneSurface ? planeInner(s, c, uref) : rotInner(s as CylinderSurface, c, uref);
  const Pu = s.periodU;
  const Pv = s.periodV;
  /** 이보다 작은 v 변화는 0으로 본다(v가 일정한 곡선 — 원기둥 둘레 원 등 — 의 반올림 값) */
  const tinyV = 1e-13 * (inner.angularV ? 1 : size);
  /** 원기둥·원뿔: v 방향이 다항식이라 모선(u 일정한 직선)은 3점 가우스로 정확 */
  const polyV = s instanceof CylinderSurface || s instanceof ConeSurface;
  const tinyDev = 1e-12 * size;
  let bound = 0;
  /** 곡선 위 점 t의 (u,v)·dv/dt·곡면 점(u, v를 가까운 주기로) */
  const at = (sg: Seg, t: number, uNear: number, vNear: number) => {
    const X = sg.c.point(t);
    const D = sg.c.d1(t);
    let [u, v] = s.project(X);
    u = wrapNear(u, uNear, Pu);
    v = wrapNear(v, vNear, Pv);
    const [S, Su, Sv] = s.derivs(u, v);
    const A = Su[0] * Su[0] + Su[1] * Su[1] + Su[2] * Su[2];
    const B = Su[0] * Sv[0] + Su[1] * Sv[1] + Su[2] * Sv[2];
    const C = Sv[0] * Sv[0] + Sv[1] * Sv[1] + Sv[2] * Sv[2];
    const ru = Su[0] * D[0] + Su[1] * D[1] + Su[2] * D[2];
    const rv = Sv[0] * D[0] + Sv[1] * D[1] + Sv[2] * D[2];
    const det = A * C - B * B;
    const dvdt = det > 1e-12 * A * C && det > 0 ? (A * rv - B * ru) / det : C > 0 ? rv / C : 0;
    return { X, D, u, v, dvdt, dev: Math.hypot(X[0] - S[0], X[1] - S[1], X[2] - S[2]) };
  };
  const ring = (pts: readonly UV[], sign: number) => {
    const m = pts.length;
    for (let i = 0; i < m; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % m]!;
      const sg = a.p === b.p ? null : seg(a, b);
      const du = b.u - a.u;
      const dv = b.v - a.v;
      let nsub = inner.plane ? 1 : Math.max(1, Math.ceil(Math.abs(du) / STEP_ANGLE), inner.angularV ? Math.ceil(Math.abs(dv) / STEP_ANGLE) : 1);
      // 원기둥·원뿔 위 직선 모서리가 모선(u 일정)이고 곡면 위에 있으면 매개변수 공간 직선과 같다
      let ruling = false;
      if (sg && sg.linear && polyV && Math.abs(du) <= 1e-13) {
        const m = sg.c.point((sg.t0 + sg.t1) / 2);
        const S = s.point(a.u, (a.v + b.v) / 2);
        ruling = Math.hypot(m[0] - S[0], m[1] - S[1], m[2] - S[2]) <= tinyDev;
      }
      if (!sg || (sg.linear && inner.plane) || ruling) {
        // 매개변수 공간 직선(평면 위 직선 모서리·원기둥과 원뿔의 모선 포함)
        if (dv === 0) continue;
        if (ruling) nsub = 1;
        const rule = inner.plane || ruling ? G3 : G8;
        for (let k = 0; k < nsub; k++) {
          const f0 = k / nsub;
          const h = 1 / nsub / 2;
          for (const [x, gw] of rule) {
            const f = f0 + h * (1 + x);
            inner.add(out, sign * gw * h * dv, a.u + du * f, a.v + dv * f);
          }
        }
        continue;
      }
      // 곡선: t의 가우스, 점을 곡면에 되짚어 (u,v)와 dv/dt
      const T = sg.t1 - sg.t0;
      if (Math.abs(dv) <= tinyV) {
        // v가 일정한 곡선(원기둥·원뿔 둘레 원, 구·원환의 위도 원)은 ∮G dv 몫이 없다 — 가운데 점에서 v·dv/dt·곡면과의 거리를 보고 건너뛴다
        const mid = at(sg, sg.t0 + T / 2, a.u + du / 2, a.v);
        if (Math.abs(mid.v - a.v) <= tinyV && Math.abs(mid.dvdt * T) <= tinyV && mid.dev <= tinyDev) continue;
      }
      for (let k = 0; k < nsub; k++) {
        const h = T / nsub / 2;
        const tm = sg.t0 + T * (k / nsub) + h;
        for (const [x, gw] of G8) {
          const t = tm + h * x;
          const frac = (t - sg.t0) / (T || 1);
          const q = at(sg, t, a.u + du * frac, a.v + dv * frac);
          if (Math.abs(q.dvdt * T) > tinyV) inner.add(out, sign * gw * h * q.dvdt, q.u, q.v);
          // 곡선이 곡면에서 떨어진 거리 × |q| × 길이 / 3 — 부피 어림 오차
          if (q.dev > 0) bound += (Math.abs(gw * h) * q.dev * Math.hypot(q.X[0] - c[0], q.X[1] - c[1], q.X[2] - c[2]) * Math.hypot(q.D[0], q.D[1], q.D[2])) / 3;
        }
      }
    }
  };
  for (const pg of polys) {
    ring(pg.outer, signedArea(pg.outer) >= 0 ? 1 : -1);
    for (const hole of pg.holes) ring(hole, signedArea(hole) <= 0 ? 1 : -1);
  }
  return bound;
}

function signedArea(pts: readonly UV[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j]!.u - pts[i]!.u) * (pts[j]!.v + pts[i]!.v);
  return a / 2;
}

/**
 * 삼각형으로 구한 면이 모서리 곡선과 만나는 틈 메우기: 경계 꺾인 선 토막(a → b, 면 경계 방향)과 곡선 구간 사이의 좁은 띠
 * X(σ,τ) = (1−τ)·(a + σ(b − a)) + τ·C(t(σ))의 흐름 값을 더한다(법선 X_τ × X_σ — 띠의 경계가 곡선 a→b, 꺾인 선 b→a가 되게).
 * 이웃 면이 곡선으로 적분되면 이 띠가 없을 때 겉면이 닫히지 않는다
 */
export function addSliverFlux(out: Float64Array, a: V3, b: V3, cv: BoundaryCurve, ta: number, tb: number, c: V3, sign = 1): void {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
  const T = tb - ta;
  for (const [x, gs] of G8) {
    const sg = (1 + x) / 2;
    const t = ta + T * sg;
    const C = cv.point(t);
    const D = cv.d1(t);
    const px = a[0] + ex * sg, py = a[1] + ey * sg, pz = a[2] + ez * sg;
    // X_τ = C − P(σ)
    const tx = C[0] - px, ty = C[1] - py, tz = C[2] - pz;
    for (const [y, gt] of G3) {
      const tau = (1 + y) / 2;
      // X_σ = (1−τ)(b − a) + τ·C'(t)·T
      const sx = (1 - tau) * ex + tau * D[0] * T;
      const sy = (1 - tau) * ey + tau * D[1] * T;
      const sz = (1 - tau) * ez + tau * D[2] * T;
      const nx = ty * sz - tz * sy;
      const ny = tz * sx - tx * sz;
      const nz = tx * sy - ty * sx;
      addFlux(out, (sign * gs * gt) / 4, px + tau * tx - c[0], py + tau * ty - c[1], pz + tau * tz - c[2], nx, ny, nz);
    }
  }
}

/** 흐름 값(기준점 c) → props 칸 [V, M(3), S(6), c(3), bound, how] */
export function fluxToProps(f: ArrayLike<number>, c: V3, bound: number, how: number): Float64Array {
  const p = new Float64Array(PROPS_LEN);
  p[0] = f[0]! / 3;
  for (let k = 1; k <= 3; k++) p[k] = f[k]! / 4;
  for (let k = 4; k <= 9; k++) p[k] = f[k]! / 5;
  p[10] = c[0];
  p[11] = c[1];
  p[12] = c[2];
  p[13] = bound;
  p[14] = how;
  return p;
}
