/**
 * 측정 붙잡기 교차점·멀리서 내린 수직 발 시험용 합성 STEP(직접 만든 작은 자료 — 코어 0.15.0 열린 후보와 교차점 다듬기):
 * 원기둥(반지름 10, 높이 20 — curvescene.ts와 같은 원기둥)의 윗 테두리 원과 3D로 한 점에서 만나는 모서리 셋, 멀리 떨어진 작은 판 하나.
 * - 곧은 모서리: 세로 삼각 판의 빗변 (3, −4, 10) → (12, −16, 40)이 테두리 원 평면을 원 위 점 (6, −8, 20)에서 지난다(꼭짓점은 float32로 정확한 정수)
 * - 원: 세로 원판(중심 (12, −9, 20), 반지름 5, 법선 (0.6, 0.8, 0) — 원기둥 축을 품은 평면)의 테두리가 테두리 원과 (8, −6, 20)에서 만난다
 * - B-스플라인: x = 0 평면의 3차 베지어(조절점 (0,−4,13) (0,−7,24) (0, −17.67, 17.47) (0,−16,28) — z가 늘기만 한다)가 u = 0.4에서 테두리 원 위 점
 *   (0, −10, 20)을 지난다(셋째 조절점을 그렇게 정한다 — 반올림만큼)
 * 교차점은 어느 모서리의 가운데 점·꺾은선 꼭짓점도 아니고(빗변의 ⅓ 자리, 베지어의 0.4 자리), 먼 판 꼭짓점에서 그 모서리로 내린 발도 아니다
 * (같으면 그 앞 차례의 붙잡기가 이긴다)
 * - 먼 판(z = 0): 꼭짓점 FAR (50, 0, 0)에서 테두리 원으로 내린 발은 (10, 0, 20), 거리 √2000. 테두리 꺾은선(30° + 7.2°·i — 50토막)에서 그 발은
 *   1.2° 꼭짓점과 −6° 꼭짓점 사이 0.83 자리라, 반지름 50에서 내린 발은 모든 토막에서 토막 밖이다(토막 가운데에서 0.72°보다 멀면 밖).
 *   z = 0이라 세로 원판으로 내린 발이 그 교차점에 오지 않는다(같은 높이면 원판 테두리의 먼 쪽 끝이 곧 교차점이다)
 * 세 교차점과 먼 발은 남동 등각에서 보이는 앞쪽(0° … −90°)에 서로 떨어져 있고, 테두리 꺾은선 꼭짓점과 겹치지 않는다.
 */
import { cylinderRim, type V3 } from './curvescene';
import { StepText, type P3 } from '../stepText';

const c30 = Math.cos(Math.PI / 6);
const s30 = Math.sin(Math.PI / 6);

export const RIM_R = 10;
export const RIM_H = 20;
/** 곧은 모서리(삼각 판 빗변)의 두 끝과 테두리 원과 만나는 점 */
export const LINE_A: V3 = [3, -4, 10];
export const LINE_B: V3 = [12, -16, 40];
export const LINE_X: V3 = [6, -8, 20];
/** 세로 원판: 중심·반지름·법선과 테두리 원과 만나는 점 */
export const RING_C: V3 = [12, -9, 20];
export const RING_R = 5;
export const RING_N: V3 = [0.6, 0.8, 0];
export const RING_X: V3 = [8, -6, 20];
/**
 * B-스플라인(x = 0 평면 3차 베지어)과 테두리 원과 만나는 점: u = 0.4에서 (27 P0 + 54 P1 + 36 P2 + 8 P3) / 125 = (0, −10, 20)이 되게 P2를 정한다
 * (해석기가 3차 B-스플라인 매듭 구간을 셋으로 나눠 시작하므로 ⅓·½ 같은 자리는 꺾은선 꼭짓점이 된다 — 0.4는 꼭짓점이 아니다)
 */
export const SPL_U = 0.4;
export const SPL_CP: V3[] = [
  [0, -4, 13],
  [0, -7, 24],
  [0, (-1250 + 27 * 4 + 54 * 7 + 8 * 16) / 36, (2500 - 27 * 13 - 54 * 24 - 8 * 28) / 36],
  [0, -16, 28],
];
export const SPL_X: V3 = [0, -10, 20];
/** 3차 베지어 위 점 */
export const splAt = (u: number): V3 => {
  const b = [(1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3];
  return [0, 1, 2].map((k) => b.reduce((s, w, i) => s + w * SPL_CP[i]![k]!, 0)) as V3;
};
/** 먼 판의 꼭짓점과 거기서 테두리 원으로 내린 발 */
export const FAR: V3 = [50, 0, 0];
export const FAR_FOOT: V3 = [10, 0, 20];

/** 조립 STEP 바이트 */
export function crossStep(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const surfaceModel = (face: number): number => w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);

  const cyl = w.product('rim-cylinder', [cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])], mm);

  // 세로 삼각 판: 빗변 A → B(⅓ 자리가 교차점 — 가운데 점과 겹치지 않게), B → C, C → A(법선 (0.8, 0.6, 0))
  const C: P3 = [12, -16, 10];
  const VA = w.vertex(LINE_A);
  const VB = w.vertex(LINE_B);
  const VC = w.vertex(C);
  const lAB = w.edge(VA, VB, w.line(LINE_A, LINE_B));
  const lBC = w.edge(VB, VC, w.line(LINE_B, C));
  const lCA = w.edge(VC, VA, w.line(C, LINE_A));
  const tri = w.face([w.bound(w.loop([w.oe(lAB, true), w.oe(lBC, true), w.oe(lCA, true)]))], w.plane(LINE_A, [0.8, 0.6, 0], [0, 0, 1]));
  const line = w.product('cross-line', [surfaceModel(tri)], mm, 'SHAPE_REPRESENTATION');

  // 세로 원판: 한 바퀴 원(이음 꼭짓점은 맨 위)
  const top: P3 = [RING_C[0], RING_C[1], RING_C[2] + RING_R];
  const VR = w.vertex(top);
  const ring = w.edge(VR, VR, w.circle(RING_C, RING_R, RING_N, [0, 0, 1]));
  const disc = w.face([w.bound(w.loop([w.oe(ring, true)]))], w.plane(RING_C, RING_N, [0, 0, 1]));
  const ringP = w.product('cross-ring', [surfaceModel(disc)], mm, 'SHAPE_REPRESENTATION');

  // B-스플라인 판(x = 0): 곡선 P0 → P3, P3 → R → Q → P0 곧은 모서리 셋(곡선은 y ∈ [−18, −4], z ∈ [13, 28] 안 — 법선 +x)
  const R: P3 = [0, -24, 28];
  const Q: P3 = [0, -24, 13];
  const V0 = w.vertex(SPL_CP[0]!);
  const V3v = w.vertex(SPL_CP[3]!);
  const VSR = w.vertex(R);
  const VQ = w.vertex(Q);
  const cps = SPL_CP.map((p) => `#${w.pt(p)}`).join(',');
  const bs = w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',3,(${cps}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.`);
  const e0 = w.edge(V0, V3v, bs);
  const e1 = w.edge(V3v, VSR, w.line(SPL_CP[3]!, R));
  const e2 = w.edge(VSR, VQ, w.line(R, Q));
  const e3 = w.edge(VQ, V0, w.line(Q, SPL_CP[0]!));
  const spl = w.face([w.bound(w.loop([w.oe(e0, true), w.oe(e1, true), w.oe(e2, true), w.oe(e3, true)]))], w.plane(SPL_CP[0]!, [1, 0, 0], [0, 1, 0]));
  const splP = w.product('cross-spline', [surfaceModel(spl)], mm, 'SHAPE_REPRESENTATION');

  // 먼 판(z = 0, 위에서 볼 때 반시계)
  const sq: P3[] = [FAR, [FAR[0] + 4, FAR[1], 0], [FAR[0] + 4, FAR[1] + 4, 0], [FAR[0], FAR[1] + 4, 0]];
  const VS = sq.map((p) => w.vertex(p));
  const es = sq.map((p, i) => w.edge(VS[i]!, VS[(i + 1) % 4]!, w.line(p, sq[(i + 1) % 4]!)));
  const pad = w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], w.plane(FAR));
  const padP = w.product('far-pad', [surfaceModel(pad)], mm, 'SHAPE_REPRESENTATION');

  const root = w.product('cross', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  w.place(root, cyl, w.ax2([0, 0, 0]), 'cyl-1');
  w.place(root, line, w.ax2([0, 0, 0]), 'line-1');
  w.place(root, ringP, w.ax2([0, 0, 0]), 'ring-1');
  w.place(root, splP, w.ax2([0, 0, 0]), 'spline-1');
  w.place(root, padP, w.ax2([0, 0, 0]), 'pad-1');
  return w.bytes('cross.stp');
}
