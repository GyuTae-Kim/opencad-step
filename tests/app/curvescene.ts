/**
 * 곡선 모서리 접선 시험용 합성 STEP(직접 만든 작은 자료): 원기둥 윗 테두리 원(이음 꼭짓점 30°), 타원 호(틀이 30° 돈 타원의 π/6 → π),
 * 3차 B-스플라인(조절점 넷) 모서리를 하나씩. B-스플라인 판은 Z축으로 90° 돌려 (−20, −30, 0)에 놓아 자리 변환도 거친다.
 * 해석적 접선(원·타원은 식, B-스플라인은 끝 조절점 차)을 함께 낸다.
 */
import { r, StepText, type P3 } from '../stepText';

export type V3 = [number, number, number];

const c30 = Math.cos(Math.PI / 6);
const s30 = Math.sin(Math.PI / 6);
const unit = (v: readonly number[]): V3 => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};

/** 원기둥: 반지름 10, 높이 20, 원 틀의 x축 = (cos30°, sin30°, 0) — 윗 테두리 이음 꼭짓점 RIM */
export const RIM_R = 10;
export const RIM_H = 20;
export const RIM: V3 = [RIM_R * c30, RIM_R * s30, RIM_H];
/** 테두리 원 위 각 t(틀 기준)의 점 */
export const rimAt = (t: number): V3 => [RIM_R * Math.cos(t + Math.PI / 6), RIM_R * Math.sin(t + Math.PI / 6), RIM_H];
/** 이음 꼭짓점에서 원이 도는 쪽(시작) 접선 = 틀의 y축, 거꾸로 도는 쪽 = 그 반대 */
export const RIM_TANGENT: V3 = [-s30, c30, 0];

/** 타원: 중심 (40, 0, 0), 틀 x축 30°, 긴·짧은 반지름 12·6, 호 t ∈ [π/6, π] */
export const ELL_C: V3 = [40, 0, 0];
export const ELL_A = 12;
export const ELL_B = 6;
const EX: V3 = [c30, s30, 0];
const EY: V3 = [-s30, c30, 0];
export const ellAt = (t: number): V3 => [0, 1, 2].map((k) => ELL_C[k]! + ELL_A * Math.cos(t) * EX[k]! + ELL_B * Math.sin(t) * EY[k]!) as V3;
export const ELL_T0 = Math.PI / 6;
export const ELL_T1 = Math.PI;
export const ELL_START = ellAt(ELL_T0);
export const ELL_END = ellAt(ELL_T1);
/** 타원 호 시작에서 호 쪽 접선(t가 커지는 쪽): −a sin t X + b cos t Y */
export const ellTangent = (t: number): V3 => unit([0, 1, 2].map((k) => -ELL_A * Math.sin(t) * EX[k]! + ELL_B * Math.cos(t) * EY[k]!));

/** B-스플라인(판 좌표): 3차, 조절점 넷, 끝 매듭 겹침(끝점 = 끝 조절점, 끝 접선 = 끝 조절점 차) */
export const BS_CP: P3[] = [
  [0, 0, 0],
  [2, 6, 0],
  [9, 7, 0],
  [12, 0, 0],
];
/** 판 자리: Z축으로 90° 돌려 (−20, −30, 0)에(남동 등각에서 원기둥에 가리지 않게) — 판 좌표 (x, y) → 세계 (−20 − y, −30 + x) */
export const bsWorld = (p: readonly number[]): V3 => [-20 - p[1]!, -30 + p[0]!, p[2]!];
const bsDir = (d: readonly number[]): V3 => unit([-d[1]!, d[0]!, d[2]!]);
export const BS_START = bsWorld(BS_CP[0]!);
export const BS_END = bsWorld(BS_CP[3]!);
/** 시작에서 곡선 쪽 접선 P1 − P0, 끝에서 곡선 쪽 접선 P2 − P3(세계) */
export const BS_T0 = bsDir([BS_CP[1]![0] - BS_CP[0]![0], BS_CP[1]![1] - BS_CP[0]![1], 0]);
export const BS_T1 = bsDir([BS_CP[2]![0] - BS_CP[3]![0], BS_CP[2]![1] - BS_CP[3]![1], 0]);
/** 3차 베지어(매듭 0,0,0,0,1,1,1,1) 위 점(판 좌표 → 세계) */
export const bsAt = (u: number): V3 => {
  const b = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3];
  return bsWorld([0, 1, 2].map((k) => b.reduce((s, w, i) => s + w * BS_CP[i]![k]!, 0)));
};

/** 반지름 rad, 높이 h 원기둥(z축): 원 틀의 x축을 x로 — 이음 꼭짓점과 이음선이 그 방향에 온다 */
function cylinderRim(w: StepText, rad: number, h: number, x: P3): number {
  const p0: P3 = [rad * x[0], rad * x[1], 0];
  const p1: P3 = [rad * x[0], rad * x[1], h];
  const V0 = w.vertex(p0);
  const V1 = w.vertex(p1);
  const C0 = w.edge(V0, V0, w.circle([0, 0, 0], rad, [0, 0, 1], x));
  const C1 = w.edge(V1, V1, w.circle([0, 0, h], rad, [0, 0, 1], x));
  const L = w.edge(V0, V1, w.line(p0, p1));
  const bottom = w.face([w.bound(w.loop([w.oe(C0, false)]))], w.plane([0, 0, 0]), false);
  const top = w.face([w.bound(w.loop([w.oe(C1, true)]))], w.plane([0, 0, h]));
  const surf = w.add('CYLINDRICAL_SURFACE', `'',#${w.ax2([0, 0, 0], [0, 0, 1], x)},${r(rad)}`);
  const side = w.face([w.bound(w.loop([w.oe(C0, true), w.oe(L, true), w.oe(C1, false), w.oe(L, false)]))], surf);
  return w.solid([bottom, top, side], 'rim-cylinder');
}

/** 타원 판: 타원 호(π/6 → π) + 끝 → 중심 → 시작 직선 둘(위에서 볼 때 반시계, 법선 +Z) */
function ellipsePlate(w: StepText): number {
  const V0 = w.vertex(ELL_START);
  const V1 = w.vertex(ELL_END);
  const VC = w.vertex(ELL_C);
  const ell = w.add('ELLIPSE', `'',#${w.ax2(ELL_C, [0, 0, 1], EX)},${r(ELL_A)},${r(ELL_B)}`);
  const arc = w.edge(V0, V1, ell);
  const l1 = w.edge(V1, VC, w.line(ELL_END, ELL_C));
  const l2 = w.edge(VC, V0, w.line(ELL_C, ELL_START));
  const face = w.face([w.bound(w.loop([w.oe(arc, true), w.oe(l1, true), w.oe(l2, true)]))], w.plane(ELL_C));
  return w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
}

/** B-스플라인 판(판 좌표): 곡선 P0 → P3(위로 부푼 쪽) + P3 → (12,−4) → (0,−4) → P0 직선 셋(시계 — 법선 −Z) */
function bsplinePlate(w: StepText): number {
  const Q: P3 = [12, -4, 0];
  const R: P3 = [0, -4, 0];
  const V0 = w.vertex(BS_CP[0]!);
  const V3v = w.vertex(BS_CP[3]!);
  const VQ = w.vertex(Q);
  const VR = w.vertex(R);
  const cps = BS_CP.map((p) => `#${w.pt(p)}`).join(',');
  const bs = w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',3,(${cps}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.`);
  const e0 = w.edge(V0, V3v, bs);
  const e1 = w.edge(V3v, VQ, w.line(BS_CP[3]!, Q));
  const e2 = w.edge(VQ, VR, w.line(Q, R));
  const e3 = w.edge(VR, V0, w.line(R, BS_CP[0]!));
  const face = w.face([w.bound(w.loop([w.oe(e0, true), w.oe(e1, true), w.oe(e2, true), w.oe(e3, true)]))], w.plane([0, 0, 0], [0, 0, -1]));
  return w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
}

/** 세 부품 조립 STEP 바이트 */
export function curveStep(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const cyl = w.product('rim-cylinder', [cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])], mm);
  const ell = w.product('ellipse-plate', [ellipsePlate(w)], mm, 'SHAPE_REPRESENTATION');
  const bsp = w.product('bspline-plate', [bsplinePlate(w)], mm, 'SHAPE_REPRESENTATION');
  const root = w.product('curves', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  w.place(root, cyl, w.ax2([0, 0, 0]), 'cyl-1');
  w.place(root, ell, w.ax2([0, 0, 0]), 'ell-1');
  w.place(root, bsp, w.ax2([-20, -30, 0], [0, 0, 1], [0, 1, 0]), 'bsp-1');
  return w.bytes('curves.stp');
}
