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
 *   회전 곡면(직선·원·타원·B-스플라인 윤곽)도 S − c와 N이 (cos u, sin u)의 일차식이라 같은 식으로 정확하다(revInner).
 *   원·타원을 민 곡면도 같다(extrInner).
 * - 바깥 적분: 경계 토막이 모서리 곡선이면 곡선 매개변수 t의 8점 가우스로(곡선 위 점을 곡면에 되짚어 (u,v)·dv/dt),
 *   이음선·극선·정의역 끝처럼 매개변수 공간에서 곧은 토막은 (u,v) 직선 위 가우스로. 둘 다 각 π/8 넘는 토막은 나눈다.
 * 경계가 직선·원·타원이고 곡면 위에 있으면 반올림 오차 수준(1e-12 안팎)으로 맞는다. 곡선이 곡면에서 떨어져 있으면(B-스플라인 교선,
 * 꼭짓점이 곡선에서 먼 모서리의 꺾인 선) 떨어진 거리로 부피 어림 오차(bound)를 더한다.
 *
 * B-스플라인 곡면과 B-스플라인 곡선을 민 곡면(splineFlux)은 매듭 구간마다 (u,v)의 다항식이다(비유리).
 * - 안쪽 적분 G: u 매듭에서 나눈 가우스(F가 u의 5p−1차 → ⌈5p/2⌉점, 정확). u 구간이 많으면 다 덮는 구간 적분의 누적 합을
 *   v 매듭 구간마다 v의 다항식(5q−1차)으로 체비쇼프 마디에 미리 구해 두고 무게중심 보간으로 쓴다(반올림 빼고 정확)
 * - 매개변수 공간 직선 토막: u·v 매듭을 지나는 곳에서 나눈 ⌈(5p+5q)/2⌉점 가우스(정확)
 * - 모서리 곡선 토막: 곡선 매듭(과 곡면 매듭을 둘까지 지나면 그 자리 — 할선법)에서 나눠 7–15점 가우스–크론로드, 둘이 어긋나면 반으로
 *   (곡선 t와 곡면 (u,v)의 대응이 거의 특이해도 맞게). 남은 차이와 곡선이 곡면에서 떨어진 거리를 어림 오차에 더한다.
 *   곡선 위 점은 토막 끝 (u,v) 사이 짐작에서 가우스–뉴턴으로 곧장 되짚는다(nearUV — 곡면에서 projTol보다 멀 때만 곡면의 되짚기·격자 짐작도)
 * - 유리(가중치) 곡면은 F가 유리 함수라 점을 더 쓰고, 점이 적은 규칙과의 차이를 어림 오차에 더한다
 */
import { BSplineCurve, CircleCurve, CompositeCurve, EllipseCurve, LineCurve, SurfaceMappedCurve, TrimmedCurve } from './curves';
import type { V3 } from './math';
import { Basis } from './nurbs';
import { BSplineSurface, ConeSurface, CylinderSurface, ExtrusionSurface, PlaneSurface, RevolutionSurface, SphereSurface, type Surface, TorusSurface } from './surfaces';
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
  /** 점과 1차 도함수를 함께(curves.ts Curve — 따로 구한 값과 같다) */
  pointD1?(t: number): [V3, V3];
}

/** 경계 곡선의 점과 1차 도함수(곡선이 한 번에 구하면 그것으로) */
function pointD1(c: BoundaryCurve, t: number): [V3, V3] {
  return c.pointD1 ? c.pointD1(t) : [c.point(t), c.d1(t)];
}

/** 경계 토막: 곡선 구간 t0 → t1(링을 도는 방향). linear면 3D 직선 */
export interface Seg {
  c: BoundaryCurve;
  t0: number;
  t1: number;
  linear: boolean;
  /** 토막의 시작·끝 다각형 점이 모서리 끝(꼭짓점)이다 — 곡선이 꼭짓점을 비껴 지나면 그 사이를 메운다(addCorner) */
  v0?: boolean;
  v1?: boolean;
}

/** 두 점 사이 직선(t 0 → 1) */
export function lineCurve(a: V3, b: V3): BoundaryCurve {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return { point: (t) => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t], d1: () => d };
}

/**
 * 곡면 적분하는 곡면: 평면·원기둥·원뿔·구·원환, 직선·원·타원·B-스플라인 윤곽의 회전 곡면, B-스플라인 곡면,
 * 원·타원·B-스플라인 곡선을 민 곡면(곧은 선을 민 평면은 삼각형 그대로가 정확해 뺀다)
 */
export function integrableSurface(s: Surface): boolean {
  if (s instanceof RevolutionSurface) {
    const c = s.c;
    return c instanceof LineCurve || c instanceof CircleCurve || c instanceof EllipseCurve || c instanceof BSplineCurve;
  }
  if (s instanceof BSplineSurface) return s.ns.nu > s.ns.bu.p && s.ns.nv > s.ns.bv.p;
  if (s instanceof ExtrusionSurface) return !s.planar && (s.c instanceof CircleCurve || s.c instanceof EllipseCurve || (s.c instanceof BSplineCurve && s.c.nc.basis.n >= s.c.nc.basis.p));
  return s instanceof PlaneSurface || s instanceof CylinderSurface || s instanceof ConeSurface || s instanceof SphereSurface || s instanceof TorusSurface;
}

/** 매듭으로 나눈 조각 다항식 곡면(B-스플라인 곡면, B-스플라인 곡선을 민 곡면) — 경계 토막을 매듭에서 나눠 적분한다 */
export function splineSurface(s: Surface): boolean {
  return s instanceof BSplineSurface || (s instanceof ExtrusionSurface && s.c instanceof BSplineCurve);
}

/** 곡면 계산기: 안쪽 적분 G(u,v)를 out에 w배로 더한다 */
interface Inner {
  readonly plane: boolean;
  /** v가 각(구·원환, 원·타원 윤곽의 회전 곡면)인지 */
  readonly angularV: boolean;
  /** 매개변수 공간 직선 토막을 나눌 v 값(회전 곡면 B-스플라인 윤곽의 매듭 — 구간마다 다항식이라 가우스가 정확), 없으면 빈 배열 */
  readonly vBreaks: readonly number[];
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
    vBreaks: [],
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
  // 표본 방향(반지름 r_j·접선 t_j)과 u_ref 쪽 몫은 면마다 한 번
  const R = new Float64Array(NF * 3);
  const T = new Float64Array(NF * 3);
  for (let j = 0; j < NF; j++) {
    const cj = CJ[j]!;
    const sj = SNJ[j]!;
    for (let k = 0; k < 3; k++) {
      R[j * 3 + k] = X[k]! * cj + Y[k]! * sj;
      T[j * 3 + k] = Y[k]! * cj - X[k]! * sj;
    }
  }
  const REF = fourierRef(uref);
  return {
    plane: false,
    angularV,
    vBreaks: [],
    add(out, w, u, v) {
      fourierWeights(W, u, uref, REF);
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

/**
 * 곡선을 축 둘레로 돌린 곡면 S = a0 + R_u q(v)(q = c(v) − a0, R_u는 축 ax 둘레 u 회전): S_u = R_u(ax × q), S_v = R_u q'이라
 * N = R_u((ax × q) × q')와 S − c는 (cos u, sin u)의 일차식이고 F는 u의 3차 이하 삼각 다항식이다 — rotInner와 같은 9점 몫으로 정확
 * (윤곽 곡선이 축과 한 평면에 있지 않아도 된다). v 쪽: 원·타원 윤곽은 각(π/8 토막), B-스플라인 윤곽은 매듭 구간마다 다항식이라
 * 매개변수 공간 직선 토막을 매듭에서 나눈다(3차 윤곽이면 F가 v의 14차 이하 — 8점 가우스로 정확)
 */
function revInner(s: RevolutionSurface, c: V3, uref: number): Inner {
  const { a0, ax } = s;
  const prof = s.c;
  const dx = a0[0] - c[0], dy = a0[1] - c[1], dz = a0[2] - c[2];
  const ax0 = ax[0], ax1 = ax[1], ax2 = ax[2];
  const W = new Float64Array(NF);
  const REF = fourierRef(uref);
  return {
    plane: false,
    angularV: prof instanceof CircleCurve || prof instanceof EllipseCurve,
    vBreaks: prof instanceof BSplineCurve ? prof.bp : [],
    add(out, w, u, v) {
      fourierWeights(W, u, uref, REF);
      // q = h·ax + e(축에 수직), f = ax × e: R_s q = h·ax + cos s·e + sin s·f, R_s(ax × q) = cos s·f − sin s·e
      const P = prof.point(v);
      const D = prof.d1(v);
      const qx = P[0] - a0[0], qy = P[1] - a0[1], qz = P[2] - a0[2];
      const h = qx * ax0 + qy * ax1 + qz * ax2;
      const ex = qx - h * ax0, ey = qy - h * ax1, ez = qz - h * ax2;
      const fx = ax1 * ez - ax2 * ey, fy = ax2 * ex - ax0 * ez, fz = ax0 * ey - ax1 * ex;
      const hd = D[0] * ax0 + D[1] * ax1 + D[2] * ax2;
      const edx = D[0] - hd * ax0, edy = D[1] - hd * ax1, edz = D[2] - hd * ax2;
      const fdx = ax1 * edz - ax2 * edy, fdy = ax2 * edx - ax0 * edz, fdz = ax0 * edy - ax1 * edx;
      for (let j = 0; j < NF; j++) {
        const cs = CJ[j]!;
        const sn = SNJ[j]!;
        const ux = cs * fx - sn * ex, uy = cs * fy - sn * ey, uz = cs * fz - sn * ez;
        const vx = hd * ax0 + cs * edx + sn * fdx, vy = hd * ax1 + cs * edy + sn * fdy, vz = hd * ax2 + cs * edz + sn * fdz;
        addFlux(
          out,
          w * W[j]!,
          dx + h * ax0 + cs * ex + sn * fx,
          dy + h * ax1 + cs * ey + sn * fy,
          dz + h * ax2 + cs * ez + sn * fz,
          uy * vz - uz * vy,
          uz * vx - ux * vz,
          ux * vy - uy * vx,
        );
      }
    },
  };
}

/**
 * 원·타원을 민 곡면 S = o + a cos u X + b sin u Y + v d: S − c와 N = S_u × d가 (cos u, sin u)의 일차식이라
 * F는 u의 4차 이하 삼각 다항식 — rotInner와 같은 9점 몫으로 정확(민 방향이 곡선 평면에 비스듬해도 된다)
 */
function extrInner(s: ExtrusionSurface, c: V3, uref: number): Inner {
  const cv = s.c as CircleCurve | EllipseCurve;
  const { o, x: X, y: Y } = cv.f;
  const a = cv instanceof CircleCurve ? cv.r : cv.a;
  const b = cv instanceof CircleCurve ? cv.r : cv.b;
  const d = s.d;
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const W = new Float64Array(NF);
  const REF = fourierRef(uref);
  return {
    plane: false,
    angularV: false,
    vBreaks: [],
    add(out, w, u, v) {
      fourierWeights(W, u, uref, REF);
      const px = ox + v * d[0], py = oy + v * d[1], pz = oz + v * d[2];
      for (let j = 0; j < NF; j++) {
        const cs = CJ[j]!;
        const sn = SNJ[j]!;
        const ux = b * cs * Y[0] - a * sn * X[0], uy = b * cs * Y[1] - a * sn * X[1], uz = b * cs * Y[2] - a * sn * X[2];
        addFlux(out, w * W[j]!, px + a * cs * X[0] + b * sn * Y[0], py + a * cs * X[1] + b * sn * Y[1], pz + a * cs * X[2] + b * sn * Y[2], uy * d[2] - uz * d[1], uz * d[0] - ux * d[2], ux * d[1] - uy * d[0]);
      }
    },
  };
}

/** u_ref 쪽 몫 Σ_m sin m(u_ref − s_j)/m(면마다 한 번) */
function fourierRef(uref: number): Float64Array {
  const REF = new Float64Array(NF);
  for (let j = 0; j < NF; j++) REF[j] = sinSeries(Math.sin(uref - SJ[j]!), Math.cos(uref - SJ[j]!));
  return REF;
}

/** W_j(u) = (u − u_ref)/9 + (2/9) Σ_{m=1..4} [sin m(u − s_j) − sin m(u_ref − s_j)]/m → W */
function fourierWeights(W: Float64Array, u: number, uref: number, REF: Float64Array): void {
  const du = u - uref;
  const su = Math.sin(u);
  const cu = Math.cos(u);
  for (let j = 0; j < NF; j++) {
    // x = u − s_j: sin x·cos x를 덧셈 정리로(삼각 함수 호출을 줄인다)
    const sx = su * CJ[j]! - cu * SNJ[j]!;
    const cx = cu * CJ[j]! + su * SNJ[j]!;
    W[j] = du / NF + (2 / NF) * (sinSeries(sx, cx) - REF[j]!);
  }
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
 * 모서리 곡선이 곡면에서 떨어진 곳의 부피 어림 오차(곡선 길이당, 떨어진 거리 d에 곱할 몫 π·d²): 두 이웃 면은 각자 곡선을 곡면에 되짚은
 * 자리에서 띠로 곡선까지 이어 겉면을 닫는다. 곡선과 두 곡면 사이 거리를 반지름으로 한 관(허용 오차 관) 안에서는 경계가 어디로 지나도
 * 같은 모형이라, 그 관의 단면 넓이 π·d²(면마다 제 거리로 — 둘을 더하면 큰 쪽 관보다 크다)를 곡선 길이로 적분해 어림 오차로 한다
 */
const TUBE = Math.PI;

/** 곡선 위 점 t를 곡면에 되짚은 값 */
interface Foot {
  /** 곡선 점과 도함수 */
  X: V3;
  D: V3;
  u: number;
  v: number;
  /** 곡면 점과 편도함수 */
  S: V3;
  Su: V3;
  Sv: V3;
  dudt: number;
  dvdt: number;
  /** 곡선 점과 곡면 점 사이 거리 */
  dev: number;
  /** 곡선이 곡면에서 떨어진 점이고 되짚기 사상의 정확한 도함수를 구했다 — 띠(addStrip)로 겉면을 닫는다 */
  off: boolean;
}

/** footOf 할 일: 되짚은 그대로(RAW), 곡선이 곡면에서 떨어졌으면 가장 가까운 점으로 다듬은 (u,v)까지(POS), 그 점에서 되짚기 사상의 도함수까지(EXACT) */
const RAW = 0;
const POS = 1;
const EXACT = 2;

/**
 * 곡선 점 X(도함수 D)를 되짚은 (u,v)에서 곡면 점·dv/dt. 곡선이 곡면 위면 최소 제곱 [S_u S_v](u′, v′) ≈ D가 곧 도함수다.
 * 곡선이 곡면에서 tinyDev보다 떨어져 있으면(mode ≥ POS) 되짚은 점을 뉴턴법(2차 편도함수)으로 가장 가까운 점까지 다듬고 — 가우스–뉴턴
 * 되짚기는 정의역 끝에 걸리면 덜 맞아 t를 따라 들쭉날쭉하다 — (mode = EXACT) 가장 가까운 점 조건 r·S_u = r·S_v = 0(r = X − S)을
 * t로 미분한 [S_u·S_u − r·S_uu, S_u·S_v − r·S_uv; S_u·S_v − r·S_uv, S_v·S_v − r·S_vv](u′, v′) = (D·S_u, D·S_v)를 푼다(off) —
 * 최소 제곱 값은 이 사상의 도함수가 아니라서, 그래야 ∮G dv가 되짚은 곡선(면 조각의 실제 경계) 위 선적분이 된다.
 * 정의역 끝에 걸린 매개변수는 고정이다(그 방향 도함수 0). 다듬기가 안 되거나 야코비안이 특이하면 off = false(되짚은 그대로와 최소 제곱 값 —
 * 부르는 쪽이 떨어진 거리로 1차 어림 오차를 더한다)
 */
function footOf(s: Surface, X: V3, D: V3, u: number, v: number, tinyDev: number, mode: number, at: readonly [V3, V3, V3] = s.derivs(u, v)): Foot {
  const [S, Su, Sv] = at;
  const A = Su[0] * Su[0] + Su[1] * Su[1] + Su[2] * Su[2];
  const B = Su[0] * Sv[0] + Su[1] * Sv[1] + Su[2] * Sv[2];
  const C = Sv[0] * Sv[0] + Sv[1] * Sv[1] + Sv[2] * Sv[2];
  const ru = Su[0] * D[0] + Su[1] * D[1] + Su[2] * D[2];
  const rv = Sv[0] * D[0] + Sv[1] * D[1] + Sv[2] * D[2];
  const det = A * C - B * B;
  const dvdt = det > 1e-12 * A * C && det > 0 ? (A * rv - B * ru) / det : C > 0 ? rv / C : 0;
  const dev = Math.hypot(X[0] - S[0], X[1] - S[1], X[2] - S[2]);
  const raw: Foot = { X, D, u, v, S, Su, Sv, dudt: 0, dvdt, dev, off: false };
  if (mode === RAW || !(dev > tinyDev)) return raw;
  const f = polishFoot(s, X, u, v, dev, tinyDev);
  if (!f) return raw;
  const [S2, Su2, Sv2, Suu, Suv, Svv] = f.d;
  const rx = X[0] - S2[0], ry = X[1] - S2[1], rz = X[2] - S2[2];
  const out: Foot = { X, D, u: f.u, v: f.v, S: S2, Su: Su2, Sv: Sv2, dudt: 0, dvdt: 0, dev: Math.hypot(rx, ry, rz), off: false };
  if (mode !== EXACT) return out;
  const A2 = dot3(Su2, Su2);
  const C2 = dot3(Sv2, Sv2);
  const a = A2 - (rx * Suu[0] + ry * Suu[1] + rz * Suu[2]);
  const b = dot3(Su2, Sv2) - (rx * Suv[0] + ry * Suv[1] + rz * Suv[2]);
  const cc = C2 - (rx * Svv[0] + ry * Svv[1] + rz * Svv[2]);
  const pu = dot3(Su2, D);
  const pv = dot3(Sv2, D);
  if (f.cu && f.cv) out.off = true;
  else if (f.cu || f.cv) {
    const k = f.cu ? cc : a;
    if (k > 1e-12 * (f.cu ? C2 : A2) && Number.isFinite(k)) {
      out.dudt = f.cu ? 0 : pu / k;
      out.dvdt = f.cu ? pv / k : 0;
      out.off = true;
    }
  } else {
    const dj = a * cc - b * b;
    if (dj > 1e-12 * Math.abs(a * cc) && dj > 0 && Number.isFinite(dj)) {
      out.dudt = (cc * pu - b * pv) / dj;
      out.dvdt = (a * pv - b * pu) / dj;
      out.off = true;
    }
  }
  return out.off ? out : raw;
}

function dot3(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * 점 X에 가장 가까운 곡면 점을 (u,v)에서 뉴턴법으로 다듬는다(거리 제곱의 기울기 −(r·S_u, r·S_v), 헤세 행렬 [S_u·S_u − r·S_uu, …]).
 * 주기가 아닌 매개변수가 정의역 끝이면 고정하고 다른 쪽만. 거리 dev의 1e-10까지(반올림 여유) 맞으면 그 점과 [S, S_u, S_v, S_uu, S_uv, S_vv],
 * 여섯 번 안에 안 되면 null
 */
function polishFoot(s: Surface, X: V3, u: number, v: number, dev: number, tinyDev: number): { u: number; v: number; d: [V3, V3, V3, V3, V3, V3]; cu: boolean; cv: boolean } | null {
  const fixU = !(s.periodU > 0);
  const fixV = !(s.periodV > 0);
  let cu = fixU && (u <= s.u0 || u >= s.u1);
  let cv = fixV && (v <= s.v0 || v >= s.v1);
  const tol = 1e-10 * dev + 1e-3 * tinyDev;
  for (let it = 0; it < 6; it++) {
    const d = s.derivs2(u, v);
    const [S, Su, Sv, Suu, Suv, Svv] = d;
    const rx = X[0] - S[0], ry = X[1] - S[1], rz = X[2] - S[2];
    const gu = rx * Su[0] + ry * Su[1] + rz * Su[2];
    const gv = rx * Sv[0] + ry * Sv[1] + rz * Sv[2];
    const A = dot3(Su, Su);
    const C = dot3(Sv, Sv);
    if ((cu || Math.abs(gu) <= tol * Math.sqrt(A)) && (cv || Math.abs(gv) <= tol * Math.sqrt(C))) return { u, v, d, cu, cv };
    const a = A - (rx * Suu[0] + ry * Suu[1] + rz * Suu[2]);
    const b = dot3(Su, Sv) - (rx * Suv[0] + ry * Suv[1] + rz * Suv[2]);
    const cc = C - (rx * Svv[0] + ry * Svv[1] + rz * Svv[2]);
    let du = 0;
    let dv = 0;
    if (cu) dv = gv / cc;
    else if (cv) du = gu / a;
    else {
      const dj = a * cc - b * b;
      if (!(dj > 0)) return null;
      du = (cc * gu - b * gv) / dj;
      dv = (a * gv - b * gu) / dj;
    }
    if (!Number.isFinite(du) || !Number.isFinite(dv)) return null;
    u += du;
    v += dv;
    if (fixU && (u <= s.u0 || u >= s.u1)) {
      u = Math.min(Math.max(u, s.u0), s.u1);
      cu = true;
    }
    if (fixV && (v <= s.v0 || v >= s.v1)) {
      v = Math.min(Math.max(v, s.v0), s.v1);
      cv = true;
    }
  }
  return null;
}

/** nearUV 결과: 되짚은 (u,v), 그 곡면 점·편도함수 [S, S_u, S_v], 곡선 점까지 거리 */
interface Near {
  u: number;
  v: number;
  d: [V3, V3, V3];
  dist: number;
}

/**
 * 곡선 위 점 X를 짐작 (u, v)에서 곡면에 되짚는다(조각 다항식 곡면 적분 — 곡선을 따라 촘촘히 되짚어 짐작이 가깝다).
 * Surface.refineUV와 같은 가우스–뉴턴 걸음(정의역 절반 한도, 주기가 아닌 매개변수는 정의역 안으로, 거리가 줄지 않으면 반씩 여덟 번까지)과
 * 같은 멈춤(걸음이 매개변수 크기의 1e-15배 아래)이지만, 걸음 크기를 새 점을 구하기 전에 보고, 곡면 위 걸음이 tinyDev보다 짧은데 거리가
 * 줄지 않으면(반올림 수준 — 그 자리가 이미 가장 가까운 점) 반씩 줄여 다시 구하지 않고 멈춘다. 마지막 점의 [S, S_u, S_v]를 함께 돌려준다
 * (footOf가 같은 점을 다시 구하지 않게)
 */
function nearUV(s: Surface, X: V3, u: number, v: number, tinyDev: number): Near {
  const pu = s.periodU > 0;
  const pv = s.periodV > 0;
  const lu = Number.isFinite(s.u1 - s.u0) ? (s.u1 - s.u0) / 2 : Infinity;
  const lv = Number.isFinite(s.v1 - s.v0) ? (s.v1 - s.v0) / 2 : Infinity;
  if (!pu) u = Math.min(Math.max(u, s.u0), s.u1);
  if (!pv) v = Math.min(Math.max(v, s.v0), s.v1);
  let d = s.derivs(u, v);
  let d2 = dist2(d[0], X);
  for (let it = 0; it < 40; it++) {
    const [S, Su, Sv] = d;
    const rx = X[0] - S[0], ry = X[1] - S[1], rz = X[2] - S[2];
    const a = dot3(Su, Su);
    const b = dot3(Su, Sv);
    const c = dot3(Sv, Sv);
    const ru = Su[0] * rx + Su[1] * ry + Su[2] * rz;
    const rv = Sv[0] * rx + Sv[1] * ry + Sv[2] * rz;
    const det = a * c - b * b;
    let du: number;
    let dv: number;
    if (det > 1e-14 * a * c && det > 1e-300) {
      du = (c * ru - b * rv) / det;
      dv = (a * rv - b * ru) / det;
    } else {
      du = a > 1e-300 ? ru / a : 0;
      dv = c > 1e-300 ? rv / c : 0;
    }
    if (Math.abs(du) > lu) du = Math.sign(du) * lu;
    if (Math.abs(dv) > lv) dv = Math.sign(dv) * lv;
    let nu = pu ? u + du : Math.min(Math.max(u + du, s.u0), s.u1);
    let nv = pv ? v + dv : Math.min(Math.max(v + dv, s.v0), s.v1);
    if (Math.abs(nu - u) + Math.abs(nv - v) < 1e-15 * (1 + Math.abs(u) + Math.abs(v))) break;
    const mu = nu - u, mv = nv - v;
    const tiny = Math.hypot(Su[0] * mu + Sv[0] * mv, Su[1] * mu + Sv[1] * mv, Su[2] * mu + Sv[2] * mv) <= tinyDev;
    let nd: [V3, V3, V3] | null = null;
    for (let k = 0; k < 8; k++) {
      if (k) {
        du *= 0.5;
        dv *= 0.5;
        nu = pu ? u + du : Math.min(Math.max(u + du, s.u0), s.u1);
        nv = pv ? v + dv : Math.min(Math.max(v + dv, s.v0), s.v1);
      }
      const e = s.derivs(nu, nv);
      const e2 = dist2(e[0], X);
      if (e2 <= d2) {
        nd = e;
        d2 = e2;
        break;
      }
      if (tiny) break;
    }
    if (!nd) break;
    u = nu;
    v = nv;
    d = nd;
  }
  return { u, v, d, dist: Math.sqrt(d2) };
}

function dist2(a: V3, b: V3): number {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return x * x + y * y + z * z;
}

/**
 * 띠의 흐름 값 w·∫₀¹ F·(Y_τ × Y_t) dτ를 out에: 곡면 위 경계점 S(t)에서 곡선 점 X(t)까지 곧은 선분 Y(t,τ) = S + τ(X − S)
 * (Y_t = (1 − τ)(S_u u′ + S_v v′) + τ·D). 면 조각의 경계(되짚은 곡선)에서 모서리 곡선까지 이어, 이웃 면도 같은 곡선까지
 * 이으면 겉면이 닫힌다(면 경계 방향으로 도는 t에서 법선 Y_τ × Y_t가 면 법선 쪽 — addSliverFlux와 같은 방향).
 * F는 τ의 4차 이하라 3점 가우스로 정확
 */
function addStrip(out: Float64Array, w: number, f: Foot, c: V3): void {
  const { S, X, D, Su, Sv } = f;
  const rx = X[0] - S[0], ry = X[1] - S[1], rz = X[2] - S[2];
  const px = Su[0] * f.dudt + Sv[0] * f.dvdt;
  const py = Su[1] * f.dudt + Sv[1] * f.dvdt;
  const pz = Su[2] * f.dudt + Sv[2] * f.dvdt;
  for (const [y, gt] of G3) {
    const tau = (1 + y) / 2;
    const tx = (1 - tau) * px + tau * D[0];
    const ty = (1 - tau) * py + tau * D[1];
    const tz = (1 - tau) * pz + tau * D[2];
    addFlux(out, (w * gt) / 2, S[0] - c[0] + tau * rx, S[1] - c[1] + tau * ry, S[2] - c[2] + tau * rz, ry * tz - rz * ty, rz * tx - rx * tz, rx * ty - ry * tx);
  }
}

/** 띠로 닫은 점의 부피 어림 오차(가중치 |w| 곱하기 전): 관 단면 π·d² × |D| */
function tubeBound(f: Foot): number {
  return TUBE * f.dev * f.dev * Math.hypot(f.D[0], f.D[1], f.D[2]);
}

/**
 * 꼭짓점 둘레 메우기(곡선 토막의 시작 start 또는 끝): 다각형 점 pt(꼭짓점 p, 그 (u,v)의 곡면 점 S_V)와 그 끝의 곡선 점 X·되짚은 곡면 점 F가
 * 다르면(모서리 곡선이 꼭짓점을 조금 비껴 지나거나 곡선이 곡면에서 떨어졌다) 곡면 위 S_V ↔ F는 매개변수 공간 직선(line — ∮G dv)으로 잇고,
 * 네 점 조각(시작 S_V → p → X → F, 끝 X → p → S_V → F — 면 경계 방향)을 평평한 삼각형 둘로 더한다. 이웃 면(삼각형으로 구하는 면의 띠도)은
 * 같은 곡선 끝 X와 p 사이를 거꾸로 지나므로 그 토막이 지워져 겉면이 닫힌다. 돌려주는 값은 부피 어림 오차(조각 넓이 × 틈 —
 * 꼭짓점 둘레 허용 오차 안의 모양은 모른다), 메울 것이 없으면 −1
 */
function addCorner(out: Float64Array, s: Surface, pt: UV, f: Foot, start: boolean, sign: number, c: V3, tinyDev: number, line: (u0: number, v0: number, u1: number, v1: number) => void): number {
  const P = pt.p;
  const X = f.X;
  const F = f.S;
  const gap = Math.hypot(X[0] - P[0], X[1] - P[1], X[2] - P[2]);
  const SV = s.point(pt.u, pt.v);
  const fs = Math.hypot(F[0] - SV[0], F[1] - SV[1], F[2] - SV[2]);
  if (!(gap > tinyDev) && !(fs > tinyDev)) return -1;
  if (start) line(pt.u, pt.v, f.u, f.v);
  else line(f.u, f.v, pt.u, pt.v);
  const tri = (a: V3, b: V3, d: V3): number => {
    addTriangleFlux(out, a[0] - c[0], a[1] - c[1], a[2] - c[2], b[0] - c[0], b[1] - c[1], b[2] - c[2], d[0] - c[0], d[1] - c[1], d[2] - c[2], sign);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = d[0] - a[0], wy = d[1] - a[1], wz = d[2] - a[2];
    return Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  };
  const A = start ? tri(SV, P, X) + tri(SV, X, F) : tri(X, P, SV) + tri(X, SV, F);
  return A * Math.max(gap, fs);
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
  if (splineSurface(s)) return splineFlux(s, polys, c, seg, out, size, uref);
  const inner =
    s instanceof PlaneSurface ? planeInner(s, c, uref) : s instanceof RevolutionSurface ? revInner(s, c, uref) : s instanceof ExtrusionSurface ? extrInner(s, c, uref) : rotInner(s as CylinderSurface, c, uref);
  const Pu = s.periodU;
  const Pv = s.periodV;
  /** 이보다 작은 v 변화는 0으로 본다(v가 일정한 곡선 — 원기둥 둘레 원 등 — 의 반올림 값) */
  const tinyV = 1e-13 * (inner.angularV ? 1 : size);
  /** 원기둥·원뿔: v 방향이 다항식이라 모선(u 일정한 직선)은 3점 가우스로 정확 */
  const polyV = s instanceof CylinderSurface || s instanceof ConeSurface;
  const tinyDev = 1e-12 * size;
  let bound = 0;
  /** 곡선 위 점 t의 (u,v)·dv/dt·곡면 점(u, v를 가까운 주기로) */
  const at = (sg: Seg, t: number, uNear: number, vNear: number, mode = EXACT): Foot => {
    const [X, D] = pointD1(sg.c, t);
    let [u, v] = s.project(X);
    u = wrapNear(u, uNear, Pu);
    v = wrapNear(v, vNear, Pv);
    return footOf(s, X, D, u, v, tinyDev, mode);
  };
  /** 평면에서 떨어진 거리 */
  const planeDev = (X: V3): number => {
    const [u, v] = s.project(X);
    const S = s.point(u, v);
    return Math.hypot(X[0] - S[0], X[1] - S[1], X[2] - S[2]);
  };
  /** 매개변수 공간 직선 (au, av) → (bu, bv)의 ∮G dv: 토막 안의 v 매듭(주기면 주기만큼 옮긴 것도)에서 나눠 rule 가우스로 nsub 토막씩 */
  const paramLine = (au: number, av: number, bu: number, bv: number, sign: number, rule: readonly (readonly [number, number])[], nsub: number): void => {
    const du = bu - au;
    const dv = bv - av;
    if (dv === 0) return;
    // 비율 0 < f < 1
    const cuts = [0];
    if (inner.vBreaks.length) {
      const lo = Math.min(av, bv);
      const hi = Math.max(av, bv);
      for (const x0 of inner.vBreaks) {
        const n0 = Pv > 0 ? Math.ceil((lo - x0) / Pv) : 0;
        const n1 = Pv > 0 ? Math.floor((hi - x0) / Pv) : 0;
        for (let n = n0; n <= n1; n++) {
          const x = x0 + n * Pv;
          if (x > lo && x < hi) cuts.push((x - av) / dv);
        }
      }
      cuts.sort((x, y) => x - y);
    }
    cuts.push(1);
    for (let p = 0; p + 1 < cuts.length; p++) {
      const fa = cuts[p]!;
      const span = cuts[p + 1]! - fa;
      for (let k = 0; k < nsub; k++) {
        const f0 = fa + (span * k) / nsub;
        const h = span / nsub / 2;
        for (const [x, gw] of rule) {
          const f = f0 + h * (1 + x);
          inner.add(out, sign * gw * h * dv, au + du * f, av + dv * f);
        }
      }
    }
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
      // 평면 위 직선 모서리: 두 끝이 평면 위면 매개변수 공간 직선과 같다(떨어져 있으면 곡선처럼 되짚고 띠로 닫는다)
      const flatLine = !!sg && sg.linear && inner.plane && planeDev(sg.c.point(sg.t0)) <= tinyDev && planeDev(sg.c.point(sg.t1)) <= tinyDev;
      if (!sg || flatLine || ruling) {
        // 매개변수 공간 직선(평면 위 직선 모서리·원기둥과 원뿔의 모선 포함)
        if (dv === 0) continue;
        if (ruling) nsub = 1;
        paramLine(a.u, a.v, b.u, b.v, sign, inner.plane || ruling ? G3 : G8, nsub);
        continue;
      }
      // 곡선: t의 가우스, 점을 곡면에 되짚어 (u,v)와 dv/dt
      const T = sg.t1 - sg.t0;
      // 모서리 끝(꼭짓점)을 곡선이 비껴 지나면 그 사이를 메운다(꼭짓점 둘레 조각은 짧아 3점 가우스로 넉넉하다)
      const corner = (u0: number, v0: number, u1: number, v1: number) => paramLine(u0, v0, u1, v1, sign, G3, 1);
      if (sg.v0) bound += Math.max(0, addCorner(out, s, a, at(sg, sg.t0, a.u, a.v, POS), true, sign, c, tinyDev, corner));
      if (sg.v1) bound += Math.max(0, addCorner(out, s, b, at(sg, sg.t1, b.u, b.v, POS), false, sign, c, tinyDev, corner));
      if (Math.abs(dv) <= tinyV) {
        // v가 일정한 곡선(원기둥·원뿔 둘레 원, 구·원환의 위도 원)은 ∮G dv 몫이 없다 — 가운데 점에서 v·dv/dt·곡면과의 거리를 보고 건너뛴다
        const mid = at(sg, sg.t0 + T / 2, a.u + du / 2, a.v, RAW);
        if (Math.abs(mid.v - a.v) <= tinyV && Math.abs(mid.dvdt * T) <= tinyV && mid.dev <= tinyDev) continue;
      }
      for (let k = 0; k < nsub; k++) {
        const h = T / nsub / 2;
        const tm = sg.t0 + T * (k / nsub) + h;
        for (const [x, gw] of G8) {
          const t = tm + h * x;
          const frac = (t - sg.t0) / (T || 1);
          const q = at(sg, t, a.u + du * frac, a.v + dv * frac);
          const w = sign * gw * h;
          if (Math.abs(q.dvdt * T) > tinyV) inner.add(out, w * q.dvdt, q.u, q.v);
          if (q.off) {
            // 곡면 위 경계에서 곡선까지 띠로 닫고, 허용 오차 관의 부피를 어림 오차로
            addStrip(out, w, q, c);
            bound += Math.abs(gw * h) * tubeBound(q);
          }
          // 닫지 못한 틈: 곡선이 곡면에서 떨어진 거리 × |q| × 길이 / 3 — 부피 어림 오차
          else if (q.dev > 0) bound += (Math.abs(gw * h) * q.dev * Math.hypot(q.X[0] - c[0], q.X[1] - c[1], q.X[2] - c[2]) * Math.hypot(q.D[0], q.D[1], q.D[2])) / 3;
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

const RULES = new Map<number, Float64Array>();

/** n점 가우스–르장드르 [마디, 무게, …](구간 −1..1 — 르장드르 다항식 근을 뉴턴법으로, 2n−1차 다항식까지 정확) */
export function gaussRule(n: number): Float64Array {
  let r = RULES.get(n);
  if (r) return r;
  r = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 1;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = n === 1 ? 1 : (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / dp;
      x -= dx;
      if (Math.abs(dx) <= 1e-16) break;
    }
    r[2 * i] = x;
    r[2 * i + 1] = 2 / ((1 - x * x) * dp * dp);
  }
  RULES.set(n, r);
  return r;
}

/** 유리(가중치) 곡면의 안쪽 적분: 다항식이면 정확할 점 수보다 이만큼 더(값), 덜(어림 오차 비교) */
const RATIONAL_MORE = 8;
const RATIONAL_LESS = 4;

/**
 * u 방향 조각 다항식 곡면 계산기: S(u,v)를 u 기저 N_i(u)와 v마다 정해지는 동차 조절점 줄 Q_i(v)(와 ∂/∂v인 R_i(v))로 쓴다 —
 * B-스플라인 곡면은 Q_i = Σ_j N_j(v) P_ij, B-스플라인 곡선 C를 d로 민 곡면은 Q_i = C_i + v·d.
 * 비유리면 매듭 구간 안에서 F가 u의 다항식이라 안쪽 적분 G를 u 매듭에서 나눈 가우스로 정확히 구한다(u_ref도 매듭 — 다 덮는 구간은
 * 마디의 기저 값을 미리 구해 둔다). 유리면 F가 유리 함수라 점을 더 쓰고, 점이 적은 규칙과의 차이를 3V 성분 어림 오차로 돌려준다
 */
interface SplineInner {
  /** 직선 토막을 나눌 u·v 값(매듭)과 주기 */
  readonly uBreaks: readonly number[];
  readonly periodU: number;
  readonly vBreaks: readonly number[];
  readonly periodV: number;
  /** 매개변수 공간 직선 토막 가우스 점 수(비유리면 G가 그 위에서 이 점 수로 정확한 차수) */
  readonly nLine: number;
  readonly rational: boolean;
  /** v 크기(v가 일정한 곡선을 알아볼 기준) */
  readonly vScale: number;
  /** out += w·G(u,v). 돌려주는 값은 G 3V 성분의 어림 오차(w를 곱하기 전, 비유리면 0) */
  add(out: Float64Array, w: number, u: number, v: number): number;
}

/** v마다 조절점 줄 Q_i·R_i(i0..i1만)를 채운다 */
type Rows = (v: number, Q: Float64Array, R: Float64Array, i0: number, i1: number) => void;

/**
 * 비유리 곡면에서 다 덮는 u 구간 적분을 v 쪽으로 미리 구해 둘 때: v 매듭(정의역 안 서로 다른 값), v를 정의역 안으로(주기면 감고 아니면 자른다),
 * F의 v 차수(다 덮는 구간 적분은 v 매듭 구간마다 이 차수 이하의 다항식)
 */
interface VCache {
  vb: readonly number[];
  norm(v: number): number;
  deg: number;
}

/** u 구간이 이보다 많으면(비유리) 다 덮는 구간 적분의 누적 합을 v의 다항식으로 미리 구한다 */
const CACHE_SPANS = 3;

function splineInner(
  bu0: Basis,
  nu: number,
  rows: Rows,
  rational: boolean,
  periodU: number,
  c: V3,
  uHint: number,
  nIn: number,
  rest: Pick<SplineInner, 'vBreaks' | 'periodV' | 'nLine' | 'vScale'>,
  vc: VCache | null = null,
): SplineInner | null {
  // 기저 계산기는 곡면 계산(되짚기)과 버퍼를 나누지 않게 따로
  const bu = new Basis(bu0.p, bu0.U);
  const p = bu.p;
  const p1 = p + 1;
  const bp: number[] = [];
  for (let i = p; i <= bu.n + 1; i++) {
    const x = bu.U[i]!;
    if (!bp.length || x > bp[bp.length - 1]!) bp.push(x);
  }
  const K = bp.length - 1;
  if (K < 1 || !bp.every(Number.isFinite)) return null;
  const spanOf = new Int32Array(K);
  for (let k = 0; k < K; k++) spanOf[k] = bu.span((bp[k]! + bp[k + 1]!) / 2);
  const P = periodU > 0 ? periodU : 0;
  /** 늘인 매듭 j(주기면 주기만큼 옮긴 것, 아니면 0..K) */
  const brk = (j: number): number => (P > 0 ? bp[((j % K) + K) % K]! + Math.floor(j / K) * P : bp[j]!);
  const has = (j: number): boolean => P > 0 || (j >= 0 && j <= K);
  // u_ref: 면 u 평균에 가장 가까운 매듭
  let jref = 0;
  {
    let base = 0;
    let h = uHint;
    if (P > 0) {
      const m = Math.floor((uHint - bp[0]!) / P);
      base = m * K;
      h = uHint - m * P;
    }
    let best = Infinity;
    for (let k = 0; k <= K; k++) {
      const dd = Math.abs(bp[k]! - h);
      if (dd < best) {
        best = dd;
        jref = base + k;
      }
    }
  }
  const ruleA = gaussRule(rational ? nIn + RATIONAL_MORE : nIn);
  const ruleB = rational ? gaussRule(nIn + RATIONAL_LESS) : null;
  /** 다 덮는 구간 k의 마디마다 [N_0..N_p, N'_0..N'_p] */
  const pre = (rule: Float64Array): Float64Array => {
    const ng = rule.length / 2;
    const arr = new Float64Array(K * ng * 2 * p1);
    for (let k = 0; k < K; k++) {
      const m = (bp[k]! + bp[k + 1]!) / 2;
      const h = (bp[k + 1]! - bp[k]!) / 2;
      for (let g = 0; g < ng; g++) {
        bu.eval(spanOf[k]!, m + h * rule[2 * g]!, 1);
        arr.set(bu.ders.subarray(0, 2 * p1), (k * ng + g) * 2 * p1);
      }
    }
    return arr;
  };
  const preA = pre(ruleA);
  const preB = ruleB ? pre(ruleB) : null;
  const Q = new Float64Array(nu * 4);
  const R = new Float64Array(nu * 4);
  const cx = c[0], cy = c[1], cz = c[2];
  /** 마디 하나: out에 wt·F를 더하고 q·N을 돌려준다(B[off..]는 기저 값과 도함수) */
  const node = (out: Float64Array | null, wt: number, su: number, B: Float64Array, off: number): number => {
    let ax = 0, ay = 0, az = 0, aw = 0, bx = 0, by = 0, bz = 0, bw = 0, ex = 0, ey = 0, ez = 0, ew = 0;
    for (let k = 0; k <= p; k++) {
      const i = (su - p + k) * 4;
      const n0 = B[off + k]!;
      const n1 = B[off + p1 + k]!;
      const qx = Q[i]!, qy = Q[i + 1]!, qz = Q[i + 2]!, qw = Q[i + 3]!;
      ax += n0 * qx;
      ay += n0 * qy;
      az += n0 * qz;
      aw += n0 * qw;
      bx += n1 * qx;
      by += n1 * qy;
      bz += n1 * qz;
      bw += n1 * qw;
      ex += n0 * R[i]!;
      ey += n0 * R[i + 1]!;
      ez += n0 * R[i + 2]!;
      ew += n0 * R[i + 3]!;
    }
    if (rational) {
      // S = A/w, S_u = (A_u − w_u S)/w, S_v = (A_v − w_v S)/w
      const iw = 1 / aw;
      ax *= iw;
      ay *= iw;
      az *= iw;
      bx = (bx - bw * ax) * iw;
      by = (by - bw * ay) * iw;
      bz = (bz - bw * az) * iw;
      ex = (ex - ew * ax) * iw;
      ey = (ey - ew * ay) * iw;
      ez = (ez - ew * az) * iw;
    }
    const qx = ax - cx, qy = ay - cy, qz = az - cz;
    const nx = by * ez - bz * ey, ny = bz * ex - bx * ez, nz = bx * ey - by * ex;
    if (out) addFlux(out, wt, qx, qy, qz, nx, ny, nz);
    return qx * nx + qy * ny + qz * nz;
  };
  const tmpB = new Float64Array(2 * p1);
  /** 구간 k(늘인 번호)의 다항식으로 [a, b]를 w배 적분해 out에, 어림 오차(3V 성분)를 돌려준다 */
  const piece = (out: Float64Array, w: number, k: number, a: number, b: number, full: boolean): number => {
    const kk = P > 0 ? ((k % K) + K) % K : Math.min(K - 1, Math.max(0, k));
    const shift = P > 0 ? Math.floor(k / K) * P : 0;
    const su = spanOf[kk]!;
    const h = (b - a) / 2;
    const m = (a + b) / 2 - shift;
    const run = (rule: Float64Array, table: Float64Array | null, o: Float64Array | null): number => {
      const ng = rule.length / 2;
      let s = 0;
      for (let g = 0; g < ng; g++) {
        const gw = rule[2 * g + 1]!;
        let B: Float64Array;
        let off: number;
        if (full && table) {
          B = table;
          off = (kk * ng + g) * 2 * p1;
        } else {
          bu.eval(su, m + h * rule[2 * g]!, 1);
          tmpB.set(bu.ders.subarray(0, 2 * p1));
          B = tmpB;
          off = 0;
        }
        s += gw * node(o, w * gw * h, su, B, off);
      }
      return s * h;
    };
    const sa = run(ruleA, preA, out);
    if (!ruleB) return 0;
    return Math.abs(sa - run(ruleB, preB, null));
  };
  const uref = brk(jref);
  /** u 이하인 가장 큰 늘인 매듭 번호(주기가 아니고 정의역 앞이면 −1) */
  const locate = (u: number): number => {
    let m = 0;
    let r = u;
    if (P > 0) {
      m = Math.floor((u - bp[0]!) / P);
      r = u - m * P;
    } else if (u < bp[0]!) return -1;
    let lo = 0;
    let hi = P > 0 ? K - 1 : K;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (bp[mid]! <= r) lo = mid;
      else hi = mid - 1;
    }
    return m * K + lo;
  };
  // 누적 합 표: v 매듭 구간 l마다 체비쇼프 마디 s(deg+1개)에서 C_j(v_s) = Σ_{k<j} ∫_{구간 k} F(·, v_s) du(13성분, j = 0..K) —
  // C_j는 그 v 구간에서 deg차 이하 다항식이라 무게중심 보간이 (반올림 빼고) 정확하다
  const ns = vc ? vc.deg + 1 : 0;
  const XS = Float64Array.from({ length: ns }, (_, s) => Math.cos(((2 * s + 1) * Math.PI) / (2 * ns)));
  const WS = Float64Array.from({ length: ns }, (_, s) => (s % 2 ? -1 : 1) * Math.sin(((2 * s + 1) * Math.PI) / (2 * ns)));
  const tables = new Map<number, Float64Array>();
  const acc = new Float64Array(FLUX);
  const cumOf = (l: number): Float64Array => {
    let arr = tables.get(l);
    if (arr) return arr;
    arr = new Float64Array(ns * (K + 1) * FLUX);
    const va = vc!.vb[l]!;
    const vz = vc!.vb[l + 1]!;
    for (let s = 0; s < ns; s++) {
      rows((va + vz) / 2 + ((vz - va) / 2) * XS[s]!, Q, R, 0, nu - 1);
      acc.fill(0);
      for (let k = 0; k < K; k++) {
        piece(acc, 1, k, bp[k]!, bp[k + 1]!, true);
        arr.set(acc, (s * (K + 1) + k + 1) * FLUX);
      }
    }
    tables.set(l, arr);
    return arr;
  };
  const coef = new Float64Array(ns);
  /** out += w·(C_ja(v) − C_jb(v)) — 늘인 번호(주기면 C_{j+mK} = C_j + m·C_K) */
  const cumDiff = (out: Float64Array, w: number, v: number, ja: number, jb: number): void => {
    const vv = vc!.norm(v);
    const vb = vc!.vb;
    let l = 0;
    let hi = vb.length - 2;
    while (l < hi) {
      const mid = (l + hi + 1) >> 1;
      if (vb[mid]! <= vv) l = mid;
      else hi = mid - 1;
    }
    const arr = cumOf(l);
    const x = (2 * vv - vb[l]! - vb[l + 1]!) / (vb[l + 1]! - vb[l]!);
    let sum = 0;
    let exact = -1;
    for (let s = 0; s < ns; s++) {
      const d = x - XS[s]!;
      if (d === 0) {
        exact = s;
        break;
      }
      coef[s] = WS[s]! / d;
      sum += coef[s]!;
    }
    if (exact >= 0) {
      coef.fill(0);
      coef[exact] = 1;
      sum = 1;
    }
    const idx = (j: number): [number, number] => (P > 0 ? [((j % K) + K) % K, Math.floor(j / K)] : [Math.min(K, Math.max(0, j)), 0]);
    const [ia, ma] = idx(ja);
    const [ib, mb] = idx(jb);
    for (let s = 0; s < ns; s++) {
      const cs = (w * coef[s]!) / sum;
      if (!cs) continue;
      const oa = (s * (K + 1) + ia) * FLUX;
      const ob = (s * (K + 1) + ib) * FLUX;
      const oK = (s * (K + 1) + K) * FLUX;
      for (let k = 0; k < FLUX; k++) out[k]! += cs * (arr[oa + k]! - arr[ob + k]! + (ma - mb) * arr[oK + k]!);
    }
  };
  return {
    ...rest,
    uBreaks: bp,
    periodU: P,
    rational,
    add(out, w, u, v) {
      if (vc && !rational && K >= CACHE_SPANS) {
        // 다 덮는 구간은 누적 합 표에서, 마지막 조각만 그 구간 조절점 줄로 바로
        const lo = locate(u);
        if (u === uref) return 0;
        const jEnd = u > uref ? lo : P <= 0 && lo < 0 ? 0 : brk(lo) === u ? lo : lo + 1;
        if (jEnd !== jref) cumDiff(out, w, v, jEnd, jref);
        const k = u > uref ? jEnd : jEnd - 1;
        const kk = P > 0 ? ((k % K) + K) % K : Math.min(K - 1, Math.max(0, k));
        const su = spanOf[kk]!;
        rows(v, Q, R, su - p, su);
        if (u > uref) {
          if (u > brk(jEnd)) piece(out, w, jEnd, brk(jEnd), u, false);
        } else if (u < brk(jEnd)) piece(out, -w, jEnd - 1, u, brk(jEnd), false);
        return 0;
      }
      rows(v, Q, R, 0, nu - 1);
      let err = 0;
      let j = jref;
      if (u > uref) {
        while (has(j + 1) && brk(j + 1) <= u) {
          err += piece(out, w, j, brk(j), brk(j + 1), true);
          j++;
        }
        if (u > brk(j)) err += piece(out, w, j, brk(j), u, false);
      } else if (u < uref) {
        while (has(j - 1) && brk(j - 1) >= u) {
          err += piece(out, -w, j - 1, brk(j - 1), brk(j), true);
          j--;
        }
        if (u < brk(j)) err += piece(out, -w, j - 1, u, brk(j), false);
      }
      return err;
    },
  };
}

/** B-스플라인 곡면: Q_i(v) = Σ_j N_j(v) P_ij(동차), R_i = Σ_j N_j′(v) P_ij */
function bsplineSurfaceInner(s: BSplineSurface, c: V3, uHint: number): SplineInner | null {
  const ns = s.ns;
  const bv = new Basis(ns.bv.p, ns.bv.U);
  const q = bv.p;
  const q1 = q + 1;
  const { cw, nu, nv } = ns;
  const vb: number[] = [];
  for (let i = q; i <= bv.n + 1; i++) {
    const x = bv.U[i]!;
    if (!vb.length || x > vb[vb.length - 1]!) vb.push(x);
  }
  const Pv = s.periodV;
  const norm = (v: number): number => {
    if (Pv > 0 && (v < ns.v0 || v > ns.v1)) {
      const r = (v - ns.v0) % Pv;
      v = ns.v0 + (r < 0 ? r + Pv : r);
    }
    return Math.min(Math.max(v, ns.v0), ns.v1);
  };
  const rows: Rows = (v, Q, R, i0, i1) => {
    v = norm(v);
    const sv = bv.span(v);
    bv.eval(sv, v, 1);
    const D = bv.ders;
    Q.fill(0, i0 * 4, (i1 + 1) * 4);
    R.fill(0, i0 * 4, (i1 + 1) * 4);
    for (let i = i0; i <= i1; i++) {
      const o = i * 4;
      for (let b = 0; b <= q; b++) {
        const n0 = D[b]!;
        const n1 = D[q1 + b]!;
        const idx = (i * nv + sv - q + b) * 4;
        for (let k = 0; k < 4; k++) {
          const x = cw[idx + k]!;
          Q[o + k]! += n0 * x;
          R[o + k]! += n1 * x;
        }
      }
    }
  };
  const p = ns.bu.p;
  // F는 u의 5p−1차·v의 5q−1차 → 안쪽 ⌈5p/2⌉점, 직선 위 G는 5p+5q−1차 이하 → ⌈(5p+5q)/2⌉점
  return splineInner(
    ns.bu,
    nu,
    rows,
    ns.rational,
    s.periodU,
    c,
    uHint,
    Math.ceil((5 * p) / 2),
    {
      vBreaks: vb,
      periodV: Pv,
      nLine: Math.ceil((5 * p + 5 * q) / 2),
      vScale: Math.max(Math.abs(ns.v1 - ns.v0), 1e-300),
    },
    vb.length > 1 ? { vb, norm, deg: 5 * q - 1 } : null,
  );
}

/** B-스플라인 곡선을 민 곡면: Q_i(v) = C_i + v·d(동차 w_i(P_i + v d), w_i), R_i = (w_i d, 0) */
function extrusionSplineInner(s: ExtrusionSurface, c: V3, uHint: number, size: number): SplineInner | null {
  const nc = (s.c as BSplineCurve).nc;
  const nu = nc.cw.length / 4;
  const d = s.d;
  const R0 = new Float64Array(nu * 4);
  for (let i = 0; i < nu; i++) {
    const w = nc.cw[i * 4 + 3]!;
    R0[i * 4] = w * d[0];
    R0[i * 4 + 1] = w * d[1];
    R0[i * 4 + 2] = w * d[2];
  }
  const rows: Rows = (v, Q, R, i0, i1) => {
    for (let i = i0 * 4; i < (i1 + 1) * 4; i++) {
      Q[i] = nc.cw[i]! + v * R0[i]!;
      R[i] = R0[i]!;
    }
  };
  const p = nc.basis.p;
  // F는 u의 4p−1차·v의 3차 → 안쪽 2p점, 직선 위 G는 4p+3차 이하 → 2p+2점
  return splineInner(nc.basis, nu, rows, nc.rational, s.c.period, c, uHint, 2 * p, {
    vBreaks: [],
    periodV: 0,
    nLine: 2 * p + 2,
    vScale: Math.max(size / Math.max(Math.hypot(d[0], d[1], d[2]), 1e-300), 1e-300),
  });
}

/** 곡선 c의 t0와 t1 사이(끝 빼고)의 매듭 — 그 사이에서는 곡선이 매끄럽다(B-스플라인, 잘린·복합·곡면 위 곡선의 바탕) */
function curveKnots(c: BoundaryCurve, t0: number, t1: number, out: number[]): void {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const margin = 1e-12 * (hi - lo);
  if (!(hi - lo > 0)) return;
  if (c instanceof TrimmedCurve) {
    const k = c.tb - c.ta;
    if (!k) return;
    const tmp: number[] = [];
    curveKnots(c.basis, c.ta + k * lo, c.ta + k * hi, tmp);
    for (const x of tmp) out.push((x - c.ta) / k);
  } else if (c instanceof SurfaceMappedCurve) curveKnots(c.c2, lo, hi, out);
  else if (c instanceof CompositeCurve) {
    const n = c.segs.length;
    for (let k = Math.floor(lo); k <= Math.ceil(hi); k++) {
      if (k > lo + margin && k < hi - margin) out.push(k);
      const sg = c.segs[((k % n) + n) % n];
      if (!sg) continue;
      const tmp: number[] = [];
      curveKnots(sg, Math.max(lo, k) - k, Math.min(hi, k + 1) - k, tmp);
      for (const x of tmp) out.push(k + x);
    }
  } else if (c instanceof BSplineCurve) {
    const P = c.period;
    for (const x0 of c.bp) {
      const n0 = P > 0 ? Math.ceil((lo - x0) / P) : 0;
      const n1 = P > 0 ? Math.floor((hi - x0) / P) : 0;
      for (let m = n0; m <= n1; m++) {
        const x = x0 + m * P;
        if (x > lo + margin && x < hi - margin) out.push(x);
      }
    }
  }
}

/** lo < x < hi인 매듭 x(주기면 주기만큼 옮긴 것도) */
function crossings(a: number, b: number, breaks: readonly number[], P: number, out: number[]): void {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (const x0 of breaks) {
    const n0 = P > 0 ? Math.ceil((lo - x0) / P) : 0;
    const n1 = P > 0 ? Math.floor((hi - x0) / P) : 0;
    for (let m = n0; m <= n1; m++) {
      const x = x0 + m * P;
      if (x > lo && x < hi) out.push(x);
    }
  }
}

/**
 * 7점 가우스–15점 크론로드 마디(0과 양수 쪽, 큰 것부터)·무게(QUADPACK qk15): 15점은 22차, 그 가운데 홀수 번째 7점은 13차 다항식까지 정확.
 * 둘의 차이로 토막의 적분 오차를 어림한다
 */
export const KRONROD15: readonly (readonly [number, number, number])[] = [
  // [마디, 크론로드 무게, 가우스 무게(가우스 마디가 아니면 0)]
  [0.991455371120812639206854697526329, 0.02293532201052922496373200805897, 0],
  [0.949107912342758524526189684047851, 0.063092092629978553290700663189204, 0.129484966168869693270611432679082],
  [0.864864423359769072789712788640926, 0.104790010322250183839876322541518, 0],
  [0.741531185599394439863864773280788, 0.140653259715525918745189590510238, 0.27970539148927666790146777142378],
  [0.586087235467691130294144845693013, 0.16900472663926790282658342659855, 0],
  [0.405845151377397166906606412076961, 0.190350578064785409913256402421014, 0.381830050505118944950369775488975],
  [0.207784955007898467600689403773245, 0.204432940075298892414161999234649, 0],
  [0, 0.209482141084727828012999174891714, 0.417959183673469387755102040816327],
];
/** 곡선 토막을 반으로 나누는 깊이 한도 */
const KRONROD_DEPTH = 8;

/** 곡선 위 점 t와 그 (u,v) */
interface CurvePt {
  t: number;
  u: number;
  v: number;
}

/**
 * 조각 다항식 곡면(B-스플라인 곡면, B-스플라인 곡선을 민 곡면)의 faceFlux. 매개변수 공간 직선 토막은 u·v 매듭을 지나는 곳에서 나눠
 * nLine점 가우스(비유리면 정확), 모서리 곡선 토막은 곡선 매듭과 (u,v)가 곡면 매듭을 지나는 곳(곡선 위 되짚은 좌표가 매듭 값이 되는 t —
 * 할선법)에서 나눠 가우스로 적분한다. 나눈 토막 안에서는 피적분 함수가 매끄럽다. 유리 곡면은 안쪽 적분·직선 토막의 어림 오차를 더한다
 */
function splineFlux(s: Surface, polys: readonly Polygon[], c: V3, seg: (a: UV, b: UV) => Seg | null, out: Float64Array, size: number, uHint: number): number {
  const inner = s instanceof BSplineSurface ? bsplineSurfaceInner(s, c, uHint) : extrusionSplineInner(s as ExtrusionSurface, c, uHint, size);
  if (!inner) return NaN;
  const Pu = inner.periodU;
  const Pv = inner.periodV;
  const tinyV = 1e-13 * inner.vScale;
  const tinyDev = 1e-12 * size;
  const ruleL = gaussRule(inner.rational ? inner.nLine + RATIONAL_MORE : inner.nLine);
  const ruleE = inner.rational ? gaussRule(inner.nLine + RATIONAL_LESS) : null;
  /** 곡선 토막 7–15점 차이의 받아들일 한도(3V 몫): 토막 값의 1e-12, 아주 작은 토막은 항목 크기³의 1e-15 */
  const tolAbs = 1e-15 * size * size * size;
  const uSpan = inner.uBreaks[inner.uBreaks.length - 1]! - inner.uBreaks[0]!;
  const tmp = new Float64Array(FLUX);
  let bound = 0;
  /**
   * 곡선 위 점 t를 되짚은 값(exact: 곡선이 곡면에서 떨어졌으면 되짚기 사상의 정확한 도함수까지 — 매듭 찾기에는 (u,v)만).
   * 짐작 (uNear, vNear)에서 nearUV로 되짚고, 곡면에서 projTol보다 멀면 곡면의 되짚기(격자 짐작 등)도 해 가까운 쪽 — s.project(X, 짐작)과 같은 판단
   */
  const at = (sg: Seg, t: number, uNear: number, vNear: number, mode = EXACT): Foot => {
    const [X, D] = pointD1(sg.c, t);
    const n = nearUV(s, X, uNear, vNear, tinyDev);
    let u = n.u;
    let v = n.v;
    let d = n.d;
    if (!(n.dist <= s.projTol)) {
      const [gu, gv] = s.project(X);
      const g = s.derivs(gu, gv);
      if (dist2(g[0], X) < n.dist * n.dist) {
        u = gu;
        v = gv;
        d = g;
      }
    }
    u = wrapNear(u, uNear, Pu);
    v = wrapNear(v, vNear, Pv);
    return footOf(s, X, D, u, v, tinyDev, mode, d);
  };
  const strip = new Float64Array(FLUX);
  /** G 3V 성분만 따로 구할 때(유리 곡면 직선 토막의 어림 오차) */
  const g0 = (u: number, v: number): number => {
    tmp.fill(0);
    inner.add(tmp, 1, u, v);
    return tmp[0]!;
  };
  /** 곡선 토막 A→B 안에서 되짚은 좌표(k: 0 u, 1 v)가 x인 점(일리노이 할선법) */
  const solve = (sg: Seg, A: CurvePt, B: CurvePt, x: number, k: number): CurvePt | null => {
    let ta = A.t;
    let tb = B.t;
    let fa = (k ? A.v : A.u) - x;
    let fb = (k ? B.v : B.u) - x;
    if (!(fa * fb < 0)) return null;
    const tol = 1e-13 * (k ? inner.vScale : uSpan || 1);
    let best: CurvePt | null = null;
    let side = 0;
    for (let it = 0; it < 30; it++) {
      const t = (ta * fb - tb * fa) / (fb - fa);
      const frac = (t - A.t) / (B.t - A.t);
      const q = at(sg, t, A.u + (B.u - A.u) * frac, A.v + (B.v - A.v) * frac, POS);
      const f = (k ? q.v : q.u) - x;
      best = { t, u: q.u, v: q.v };
      if (Math.abs(f) <= tol || Math.abs(tb - ta) <= 1e-15 * Math.abs(B.t - A.t)) break;
      if (f < 0 === fa < 0) {
        ta = t;
        fa = f;
        if (side === -1) fb /= 2;
        side = -1;
      } else {
        tb = t;
        fb = f;
        if (side === 1) fa /= 2;
        side = 1;
      }
    }
    return best;
  };
  /** 매개변수 공간 직선 (au, av) → (bu, bv)의 ∮G dv: u·v 매듭에서 나눠 nLine점 가우스(유리면은 점을 더 쓰고 적은 규칙과의 차이를 어림 오차에) */
  const paramLine = (au: number, av: number, bu: number, bv: number, sign: number): void => {
    const du = bu - au;
    const dv = bv - av;
    if (dv === 0) return;
    const xs: number[] = [];
    const cuts = [0, 1];
    crossings(au, bu, inner.uBreaks, Pu, xs);
    for (const x of xs) cuts.push((x - au) / du);
    xs.length = 0;
    crossings(av, bv, inner.vBreaks, Pv, xs);
    for (const x of xs) cuts.push((x - av) / dv);
    cuts.sort((x, y) => x - y);
    for (let p = 0; p + 1 < cuts.length; p++) {
      const f0 = cuts[p]!;
      const h = (cuts[p + 1]! - f0) / 2;
      if (!(h > 0)) continue;
      let sa = 0;
      for (let g = 0; g < ruleL.length; g += 2) {
        const f = f0 + h * (1 + ruleL[g]!);
        const wt = sign * ruleL[g + 1]! * h * dv;
        if (ruleE) {
          // 유리: G를 한 번 구해 out에 옮기고 3V 성분을 모은다
          tmp.fill(0);
          const e = inner.add(tmp, 1, au + du * f, av + dv * f);
          for (let k = 0; k < FLUX; k++) out[k]! += wt * tmp[k]!;
          sa += ruleL[g + 1]! * tmp[0]!;
          bound += (Math.abs(wt) * e) / 3;
        } else inner.add(out, wt, au + du * f, av + dv * f);
      }
      if (ruleE) {
        let sb = 0;
        for (let g = 0; g < ruleE.length; g += 2) sb += ruleE[g + 1]! * g0(au + du * (f0 + h * (1 + ruleE[g]!)), av + dv * (f0 + h * (1 + ruleE[g]!)));
        bound += (Math.abs(h * dv) * Math.abs(sa - sb)) / 3;
      }
    }
  };
  const ring = (pts: readonly UV[], sign: number) => {
    const m = pts.length;
    for (let i = 0; i < m; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % m]!;
      const sg = a.p === b.p ? null : seg(a, b);
      const du = b.u - a.u;
      const dv = b.v - a.v;
      if (!sg) {
        // 매개변수 공간 직선(이음선·극선·정의역 끝): u·v 매듭에서 나눈다
        paramLine(a.u, a.v, b.u, b.v, sign);
        continue;
      }
      // 모서리 곡선: 곡선 매듭과 곡면 매듭을 지나는 곳에서 나눠 t의 가우스(곡선 위 점을 곡면에 되짚어 (u,v)·dv/dt)
      const T = sg.t1 - sg.t0;
      if (!(Math.abs(T) > 0)) continue;
      // 모서리 끝(꼭짓점)을 곡선이 비껴 지나면 그 사이를 메우고, 곡선 토막은 되짚은 끝점부터 잰다(매듭 찾기)
      let A0: CurvePt = { t: sg.t0, u: a.u, v: a.v };
      let B0: CurvePt = { t: sg.t1, u: b.u, v: b.v };
      if (sg.v0) {
        const f = at(sg, sg.t0, a.u, a.v, POS);
        const e = addCorner(out, s, a, f, true, sign, c, tinyDev, (u0, v0, u1, v1) => paramLine(u0, v0, u1, v1, sign));
        if (e >= 0) {
          bound += e;
          A0 = { t: sg.t0, u: f.u, v: f.v };
        }
      }
      if (sg.v1) {
        const f = at(sg, sg.t1, b.u, b.v, POS);
        const e = addCorner(out, s, b, f, false, sign, c, tinyDev, (u0, v0, u1, v1) => paramLine(u0, v0, u1, v1, sign));
        if (e >= 0) {
          bound += e;
          B0 = { t: sg.t1, u: f.u, v: f.v };
        }
      }
      if (Math.abs(dv) <= tinyV) {
        const mid = at(sg, sg.t0 + T / 2, a.u + du / 2, a.v, RAW);
        if (Math.abs(mid.v - a.v) <= tinyV && Math.abs(mid.dvdt * T) <= tinyV && mid.dev <= tinyDev) continue;
      }
      const knots: number[] = [];
      curveKnots(sg.c, sg.t0, sg.t1, knots);
      knots.sort((x, y) => (T > 0 ? x - y : y - x));
      const cps: CurvePt[] = [A0];
      for (const t of knots) {
        const frac = (t - sg.t0) / T;
        const q = at(sg, t, a.u + du * frac, a.v + dv * frac, POS);
        cps.push({ t, u: q.u, v: q.v });
      }
      cps.push(B0);
      const all: CurvePt[] = [cps[0]!];
      for (let k = 0; k + 1 < cps.length; k++) {
        const A = cps[k]!;
        const B = cps[k + 1]!;
        const found: CurvePt[] = [];
        const xs: number[][] = [0, 1].map((dim) => {
          const o: number[] = [];
          crossings(dim ? A.v : A.u, dim ? B.v : B.u, dim ? inner.vBreaks : inner.uBreaks, dim ? Pv : Pu, o);
          return o;
        });
        // 곡면 매듭을 지나는 곳이 둘까지면 할선법으로 찾아 나눈다(많으면 매듭이 토막보다 촘촘하다 — 크론로드 어림이 꺾임을 잡아 나눈다)
        if (xs[0]!.length + xs[1]!.length <= 2)
          for (const dim of [0, 1])
            for (const x of xs[dim]!) {
              const q = solve(sg, A, B, x, dim);
              if (q && (q.t - A.t) * (B.t - q.t) > 0) found.push(q);
            }
        found.sort((x, y) => (T > 0 ? x.t - y.t : y.t - x.t));
        all.push(...found, B);
      }
      for (let k = 0; k + 1 < all.length; k++) curvePiece(sg, sign, T, all[k]!, all[k + 1]!, 0);
    }
  };
  const bufs = Array.from({ length: KRONROD_DEPTH + 1 }, () => new Float64Array(FLUX));
  /**
   * 곡선 토막 A→B(곡면 매듭·곡선 매듭 사이라 피적분 함수가 매끄럽다)를 7–15점 가우스–크론로드로. 곡선 t와 곡면 (u,v) 사이 대응이 거의
   * 특이하면(곡면 매개변수가 한쪽으로 몰림) 고정 점 수로는 덜 맞으므로, 둘이 어긋나면 반으로 나눠 다시 하고 깊이 한도에서는 차이를 어림 오차에 더한다
   */
  const curvePiece = (sg: Seg, sign: number, T: number, A: CurvePt, B: CurvePt, depth: number): void => {
    const h = (B.t - A.t) / 2;
    if (h === 0) return;
    const kb = bufs[depth]!.fill(0);
    let g7 = 0;
    let extra = 0;
    let mid: CurvePt = { t: A.t + h, u: (A.u + B.u) / 2, v: (A.v + B.v) / 2 };
    for (const [x0, wk, wg] of KRONROD15)
      for (const x of x0 ? [-x0, x0] : [0]) {
        const t = A.t + h * (1 + x);
        const frac = (1 + x) / 2;
        const q = at(sg, t, A.u + (B.u - A.u) * frac, A.v + (B.v - A.v) * frac);
        if (!x) mid = { t, u: q.u, v: q.v };
        if (Math.abs(q.dvdt * T) > tinyV) {
          tmp.fill(0);
          const e = inner.add(tmp, 1, q.u, q.v);
          const wt = sign * h * q.dvdt;
          for (let k = 0; k < FLUX; k++) kb[k]! += wk * wt * tmp[k]!;
          g7 += wg * wt * tmp[0]!;
          if (e) extra += Math.abs(wk * wt) * e;
        }
        if (q.off) {
          // 곡면 위 경계에서 곡선까지 띠로 닫는다(크론로드 어림에도 넣는다), 허용 오차 관의 부피를 어림 오차로(3배)
          strip.fill(0);
          addStrip(strip, sign * h, q, c);
          for (let k = 0; k < FLUX; k++) kb[k]! += wk * strip[k]!;
          g7 += wg * strip[0]!;
          extra += 3 * Math.abs(wk * h) * tubeBound(q);
        }
        // 닫지 못한 틈: 곡선이 곡면에서 떨어진 거리 × |q| × 길이 — 부피 어림 오차(3배)
        else if (q.dev > 0) extra += Math.abs(wk * h) * q.dev * Math.hypot(q.X[0] - c[0], q.X[1] - c[1], q.X[2] - c[2]) * Math.hypot(q.D[0], q.D[1], q.D[2]);
      }
    const err = Math.abs(kb[0]! - g7);
    if (err > Math.max(1e-12 * Math.abs(kb[0]!), tolAbs) && depth < KRONROD_DEPTH) {
      curvePiece(sg, sign, T, A, mid, depth + 1);
      curvePiece(sg, sign, T, mid, B, depth + 1);
      return;
    }
    for (let k = 0; k < FLUX; k++) out[k]! += kb[k]!;
    bound += (err + extra) / 3;
  };
  for (const pg of polys) {
    ring(pg.outer, signedArea(pg.outer) >= 0 ? 1 : -1);
    for (const hole of pg.holes) ring(hole, signedArea(hole) <= 0 ? 1 : -1);
  }
  return bound;
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
    const [C, D] = pointD1(cv, t);
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

/** 질량 속성(brep.ts FaceTableData.props) 단위 바꾸기: 부피·어림 오차 k³, 1차 모멘트 k⁴, 2차 모멘트 k⁵, 기준점 k */
export function scaleProps(p: Float64Array, k: number): Float64Array {
  const out = new Float64Array(p);
  out[0] = p[0]! * k ** 3;
  for (let i = 1; i <= 3; i++) out[i] = p[i]! * k ** 4;
  for (let i = 4; i <= 9; i++) out[i] = p[i]! * k ** 5;
  for (let i = 10; i <= 12; i++) out[i] = p[i]! * k;
  out[13] = p[13]! * k ** 3;
  return out;
}
