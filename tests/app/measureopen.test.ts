/**
 * 코어 0.20.0: 축·잠근 선이 꺾은선 토막과 3D로 만나지 않고 그 활꼴(현과 곡선 사이)만 지날 때의 열린 교차(refine 'axisEdge', open)와
 * 축이 아닌 잠근 선(앱이 정한 방향·곡선 접선 — SnapRefineLine.axis 없음)의 다듬기를 실제 코어(opencad-viewer3d) 판정과 함께 본다
 * (가짜 DOM·WebGL2 뷰어에 포인터 사건). 앱 다듬기(curvesnap.ts intersectAxis)는 line.origin·line.dir만 읽는다.
 * 장면(직접 만든 작은 STEP):
 * - z = 0 평면의 원판 A(반지름 10, 이음 꼭짓점 30° — 그 접선이 세계 축이 아니다)·원판 B(중심 (4, 20), 반지름 6)
 * - 기울여 놓은 원판 C(반지름 10)·타원 판·B-스플라인 판(자리 변환 — Z축이 곡선 평면을 비스듬히 뚫는다. 곡선 평면에 수직인 축이면 첫 점에서 곡선으로
 *   내린 수직 발이 곧 그 자리라 수직 발 붙잡기가 먼저 이긴다)
 * - 곡선 위 점(한 토막의 두 끝 매개변수 가운데 — 현에서 처짐만큼 바깥) 위 6에 아래 꼭짓점이 놓인 매단 삼각 판 셋과, 원판 A 위 G = (3, −2, 8)의 판
 * 확인하는 것:
 * - 판 꼭짓점의 Z축이 곡선 평면을 뚫는 자리: 코어 교차가 없는 자리(현과 처짐만큼 떨어짐)를 곡선 위로 — "Z축 · 모서리 위", 앱 refine이 open으로 불린다
 * - 잠근 Z축도 같은 자리("잠근 Z축 · 모서리 위"), G에서 원판 A 위 점 쪽으로 잠근 축이 아닌 선도 그 원 위 점으로("잠근 방향 · 모서리 위")
 * - 원판 A 이음 꼭짓점에서 원의 접선으로 잠근 선(TangentLock)이 원판 B 테두리와 만나는 점: 원 위(1e-9), "잠근 접선 · 모서리 위"
 * - 곡선 붙잡기를 주지 않으면 그 자리에 모서리 교차가 없다(0.19.0과 같은 꼴)
 * 화면 좌표로 가리킬 때는 선·그물 경계를 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult, type SnapRefineInput } from 'opencad-viewer3d';
import type { Mesh3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex, stepFaceIndex } from '../../src/app/doc';
import { circleCenters, type CurveSnap, hoverSnapLabel, lockMeet, measureSnapOptions, snapPair, trackMark, type SnapEdgeIndex } from '../../src/app/snap';
import { curveSnap, toWorld } from '../../src/app/curvesnap';
import { TangentLock } from '../../src/app/tangent';
import { StepText, type P3 } from '../stepText';
import { type FakeElement, installDom } from './fakeview';
import { bsAt, bsplinePlate, bsTangentAt, bsWorld, ELL_A, ELL_B, ELL_C, ellAt, ellipsePlate, footParam, type V3 } from './curvescene';
import { hangingPlate } from './facescene';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

const R_A = 10;
const B_C: V3 = [4, 20, 0];
const R_B = 6;
/** 원판 A 이음 꼭짓점(30°)과 그 자리에서 원이 도는 쪽 접선 — 세계 축이 아니다 */
const SEAM_A: V3 = [R_A * Math.cos(Math.PI / 6), R_A * Math.sin(Math.PI / 6), 0];
const TAN_A: V3 = [-Math.sin(Math.PI / 6), Math.cos(Math.PI / 6), 0];
const H = 6;
const G: V3 = [3, -2, 8];

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (v: readonly number[]): V3 => {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
};
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
const segDist = (a: readonly number[], b: readonly number[], p: readonly number[]): number => {
  const u = sub(b, a);
  const t = Math.min(1, Math.max(0, dot(sub(p, a), u) / dot(u, u)));
  return dist([a[0]! + t * u[0], a[1]! + t * u[1], a[2]! + t * u[2]], p);
};

/** 부품 자리(STEP AXIS2_PLACEMENT_3D — 원점 o, z축, x축): 부품 좌표 ↔ 세계 */
class Frame {
  readonly x: V3;
  readonly y: V3;
  readonly z: V3;
  constructor(
    readonly o: P3,
    z: P3,
    x: P3,
  ) {
    this.z = unit(z);
    this.x = unit(x);
    this.y = cross(this.z, this.x);
  }
  toW(p: readonly number[]): V3 {
    return [0, 1, 2].map((k) => this.o[k]! + p[0]! * this.x[k]! + p[1]! * this.y[k]! + p[2]! * this.z[k]!) as V3;
  }
  toL(p: readonly number[]): V3 {
    const d = sub(p, this.o);
    return [dot(d, this.x), dot(d, this.y), dot(d, this.z)];
  }
}
const deg = (a: number): number => (a * Math.PI) / 180;
/** 원판 C: y축 둘레로 35° 기울여 (−32, 26, 4)에 */
const FR_C = new Frame([-32, 26, 4], [Math.sin(deg(35)), 0, Math.cos(deg(35))], [Math.cos(deg(35)), 0, -Math.sin(deg(35))]);
/** 타원 판: x축 둘레로 30° 기울이고 중심 (40, 0, 0)이 (40, −24, 3)에 오게 */
const FR_E = new Frame([0, -24, 3], [0, -Math.sin(deg(30)), Math.cos(deg(30))], [1, 0, 0]);
/** B-스플라인 판: 판 x축을 세계 y로(원래 자리처럼), z축을 x 쪽으로 25° 기울여 (−20, −30, 0)에 */
const FR_S = new Frame([-20, -30, 0], [Math.sin(deg(25)), 0, Math.cos(deg(25))], [0, 1, 0]);

/** z = 0 평면의 원판(이음 꼭짓점 c + R x) — 열린 면 묶음 */
function disc(w: StepText, c: P3, rad: number, x: P3 = [1, 0, 0]): number {
  const V = w.vertex([c[0] + rad * x[0], c[1] + rad * x[1], c[2]]);
  const C = w.edge(V, V, w.circle(c, rad, [0, 0, 1], x));
  const face = w.face([w.bound(w.loop([w.oe(C, true)]))], w.plane(c));
  return w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`);
}

/** 원판 A·B(z = 0), 기울인 원판 C·타원 판·B-스플라인 판, plates가 있으면 그 꼭짓점마다 매단 삼각 판 */
function openStep(plates: readonly V3[] = []): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const root = w.product('open', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  const ax = (f: Frame): number => w.ax2(f.o, f.z, f.x);
  w.place(root, w.product('disc-a', [disc(w, [0, 0, 0], R_A, [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0])], mm, 'SHAPE_REPRESENTATION'), w.ax2([0, 0, 0]), 'disc-a');
  w.place(root, w.product('disc-b', [disc(w, B_C, R_B)], mm, 'SHAPE_REPRESENTATION'), w.ax2([0, 0, 0]), 'disc-b');
  w.place(root, w.product('disc-c', [disc(w, [0, 0, 0], R_A)], mm, 'SHAPE_REPRESENTATION'), ax(FR_C), 'disc-c');
  w.place(root, w.product('ellipse-plate', [ellipsePlate(w)], mm, 'SHAPE_REPRESENTATION'), ax(FR_E), 'ell-1');
  w.place(root, w.product('bspline-plate', [bsplinePlate(w)], mm, 'SHAPE_REPRESENTATION'), ax(FR_S), 'bsp-1');
  plates.forEach((p, i) => w.place(root, w.product(`plate-${i}`, [hangingPlate(w, p)], mm, 'SHAPE_REPRESENTATION'), w.ax2([0, 0, 0]), `plate-${i}`));
  return w.bytes('open.stp');
}

/** 곡선 모서리의 화면용 꺾은선(세계) */
function curvesOf(meshes: readonly Mesh3d[], ex: SnapEdgeIndex): { kind: string; poly: V3[] }[] {
  const out: { kind: string; poly: V3[] }[] = [];
  for (const mesh of meshes) {
    const ti = ex.tableOf.get(mesh.id);
    if (ti === undefined) continue;
    const table = ex.tables[ti]!;
    const E = mesh.edges!;
    for (let e = 0; e + 1 < table.segStart.length; e++) {
      const kind = ex.kinds[table.kinds[e]!]!;
      if (kind === 'line') continue;
      const s0 = table.segStart[e]!;
      const s1 = table.segStart[e + 1]!;
      const poly: V3[] = [toWorld(mesh, E[s0 * 6]!, E[s0 * 6 + 1]!, E[s0 * 6 + 2]!)];
      for (let s = s0; s < s1; s++) poly.push(toWorld(mesh, E[s * 6 + 3]!, E[s * 6 + 4]!, E[s * 6 + 5]!));
      out.push({ kind, poly });
    }
  }
  return out;
}

/** 곡선 위 점 X(세계)와 그 둘레 꺾은선(세계) */
interface Target {
  X: V3;
  gap: number;
  poly: V3[];
}

/** 꺾은선 토막마다 두 끝 매개변수 가운데의 곡선 위 점 가운데 처짐(현까지 거리)이 가장 큰 것(keep(가운데 매개변수)인 안쪽 토막만) */
function bestTarget(poly: V3[], param: (p: V3) => number, at: (t: number) => V3, keep: (t: number) => boolean): Target {
  let best: Target | null = null;
  for (let k = 1; k + 2 < poly.length; k++) {
    const tm = 0.5 * (param(poly[k]!) + param(poly[k + 1]!));
    if (!keep(tm)) continue;
    const X = at(tm);
    const gap = segDist(poly[k]!, poly[k + 1]!, X);
    if (!best || gap > best.gap) best = { X, gap, poly };
  }
  expect(best).toBeTruthy();
  return best!;
}

const base = stepToScene(openStep());
const baseCurves = curvesOf(base.meshes, stepEdgeIndex(base)!);
const circleIn = (f: Frame | null, c: V3, r: number) =>
  baseCurves.find((q) => q.kind === 'circle' && Math.abs(dist(f ? f.toL(q.poly[0]!) : q.poly[0]!, c) - r) < 1e-5 && (!f || Math.abs(f.toL(q.poly[0]!)[2]) < 1e-5))!;
const circA = circleIn(null, [0, 0, 0], R_A);
const circC = circleIn(FR_C, [0, 0, 0], R_A);
const ellCurve = baseCurves.find((c) => c.kind === 'ellipse')!;
const bsCurve = baseCurves.find((c) => c.kind === 'bspline')!;
const angleOf = (f: Frame | null) => (p: V3): number => {
  const q = f ? f.toL(p) : p;
  return Math.atan2(q[1], q[0]);
};
/** 원판(자리 f, 반지름 R_A) 위 각 want(도) 둘레 토막의 가운데 각 점 — 원은 꺾은선 꼭짓점이 고르게 놓여 현 가운데 방향이 곧 가운데 각 */
function circleTarget(poly: V3[], f: Frame | null, want: number): Target {
  const ang = angleOf(f);
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k + 1 < poly.length; k++) {
    const m: V3 = [(poly[k]![0] + poly[k + 1]![0]) / 2, (poly[k]![1] + poly[k + 1]![1]) / 2, (poly[k]![2] + poly[k + 1]![2]) / 2];
    const a = ang(m);
    const d = Math.abs(Math.atan2(Math.sin(a - deg(want)), Math.cos(a - deg(want))));
    if (d < bd) [bd, best] = [d, k];
  }
  const a = poly[best]!;
  const b = poly[best + 1]!;
  const th = ang([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  const L: V3 = [R_A * Math.cos(th), R_A * Math.sin(th), 0];
  const X = f ? f.toW(L) : L;
  return { X, gap: segDist(a, b, X), poly };
}
/** 판 좌표 → 원래 자리(bsWorld)의 세계 — curvescene.ts의 B-스플라인 식(bsAt)이 그 자리라 매개변수는 그대로 */
const plateOfBs = (p: readonly number[]): V3 => [p[1]! + 30, -20 - p[0]!, p[2]!];
const bsParam = (p: V3): number => footParam(bsAt, bsTangentAt, bsWorld(FR_S.toL(p)), 0, 1);
const bsAtW = (u: number): V3 => FR_S.toW(plateOfBs(bsAt(u)));
const CIRC = circleTarget(circC.poly, FR_C, -90);
const CIRC2 = circleTarget(circA.poly, null, -100);
const ELL = bestTarget(ellCurve.poly, (p) => {
  const d = sub(FR_E.toL(p), ELL_C);
  const c30 = Math.cos(Math.PI / 6);
  const s30 = Math.sin(Math.PI / 6);
  return Math.atan2((-s30 * d[0] + c30 * d[1]) / ELL_B, (c30 * d[0] + s30 * d[1]) / ELL_A);
}, (t) => FR_E.toW(ellAt(t)), (t) => t > 0.4 * Math.PI && t < 0.8 * Math.PI);
const BSP = bestTarget(bsCurve.poly, bsParam, bsAtW, (u) => u > 0.3 && u < 0.7);
const lift = (X: V3): V3 => [X[0], X[1], X[2] + H];
const scene = stepToScene(openStep([lift(CIRC.X), lift(ELL.X), lift(BSP.X), G]));
const fx = stepFaceIndex(scene);

interface View {
  v: Viewer3d;
  canvas: FakeElement;
  calls: SnapRefineInput[];
  tl: TangentLock;
}

/** curve = 곡선 붙잡기를 줄지(문서를 열 때 받는 조각 — 받기 전이면 없다). 앱 refine 호출을 calls에 남긴다 */
function view(curve = true): View {
  const x = stepEdgeIndex(scene)!;
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  const calls: SnapRefineInput[] = [];
  const cs = curve ? curveSnap(scene.meshes, x, fx) : null;
  const spy: CurveSnap | null = cs
    ? {
        ...cs,
        refine: (c) => {
          calls.push(c);
          return cs.refine(c);
        },
      }
    : null;
  v.setMeasureSnap(measureSnapOptions(scene.meshes, x, circleCenters(scene.meshes, x), spy));
  return { v, canvas: v.canvas as unknown as FakeElement, calls, tl: new TangentLock(() => ({ meshes: scene.meshes, ex: x })) };
}

const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[], occlusion = true): { x: number; y: number } => {
  const q = w.v.project(p, { occlusion })!;
  expect(q.onScreen && (!occlusion || q.visible), `보이는 점 ${p}`).toBe(true);
  return { x: q.x, y: q.y };
};
/** 세계 점 자리에서 (dx, dy) 화소 옆으로 커서를 옮기고 그린 뒤 앱처럼 커서 아래를 읽는다(접선 잠금 track) */
const hoverAt = (w: View, p: readonly number[], dx = 2, dy = 1): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x + dx + 3, q.y + dy + 2, 0);
  ptr(w, 'pointermove', q.x + dx, q.y + dy, 0);
  w.v.renderNow();
  w.tl.track(w.v);
};
const clickAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x + dx, q.y + dy, 0);
  ptr(w, 'pointerdown', q.x + dx, q.y + dy, 1);
  ptr(w, 'pointerup', q.x + dx, q.y + dy, 0);
  w.v.renderNow();
  w.tl.track(w.v);
};
/** 화면에서 X와 그 둘레 꺾은선(현)까지의 화소 거리 */
function gapPx(w: View, T: Target): number {
  const P = T.poly;
  let k = 0;
  for (let i = 1; i + 1 < P.length; i++) if (segDist(P[i]!, P[i + 1]!, T.X) < segDist(P[k]!, P[k + 1]!, T.X)) k = i;
  const a = P[k]!;
  const u = sub(P[k + 1]!, a);
  const t = Math.min(1, Math.max(0, dot(sub(T.X, a), u) / dot(u, u)));
  const q = w.v.project([a[0] + t * u[0], a[1] + t * u[1], a[2] + t * u[2]])!;
  const s = w.v.project(T.X)!;
  return Math.hypot(q.x - s.x, q.y - s.y);
}
/** 대상점을 X로, 보는 방향은 그대로 두고 거리만 바꾼다 */
function lookAt(w: View, X: V3, distance: number): void {
  w.v.setCamera({ ...w.v.getCamera(), target: [...X], distance });
  w.v.renderNow();
}
/** X를 화면 가운데에 두고 처짐이 화면에서 3~6화소가 되게 다가간다(원근 — 대상점 깊이의 배율은 거리에 반비례) */
function zoomTo(w: View, T: Target): number {
  let d = w.v.getCamera().distance;
  lookAt(w, T.X, d);
  let g = gapPx(w, T);
  for (let i = 0; i < 6 && !(g >= 3 && g <= 6); i++) {
    d *= g / 4.5;
    lookAt(w, T.X, d);
    g = gapPx(w, T);
  }
  return g;
}
/** 첫 점(매단 판의 아래 꼭짓점 — 끝점)을 찍고 X 둘레를 확대한 뷰 */
function fromPlate(T: Target, curve = true): { w: View; F: V3 } {
  const w = view(curve);
  clickAt(w, lift(T.X), 1, 0);
  expect(w.v.measurePointCount).toBe(1);
  const F = w.v.measurePoints[0]!.point as V3;
  close(F, lift(T.X), 1e-5);
  zoomTo(w, T);
  return { w, F };
}
/** 앱(app.ts onMeasure)처럼 결과에 찍은 점의 축 위 점 종류·잠근 선 교차를 붙인다 */
function result(v: Viewer3d, m: MeasureResult) {
  const pts = v.measurePoints;
  const tB = m.snapB === 'axis' ? trackMark({ ...pts[1]!, direction: pts[1]!.direction ?? m.directionB }) : false;
  const meet = m.lockedB ? lockMeet(pts[1]) : null;
  return { ...m, ...(pts[1]?.refined ? { refinedB: true } : {}), ...(tB ? { trackB: tB } : {}), ...(meet ? { lockMeetB: meet } : {}) };
}
/** 곡선에서 벗어난 정도: 원판 C(부품 좌표 반지름·평면), 타원 판(부품 좌표 식), B-스플라인(곡선까지 거리) */
const offCircleC = (p: readonly number[]): number => {
  const q = FR_C.toL(p);
  return Math.max(Math.abs(Math.hypot(q[0], q[1]) - R_A), Math.abs(q[2]));
};
const offEllipse = (p: readonly number[]): number => {
  const d = sub(FR_E.toL(p), ELL_C);
  const c30 = Math.cos(Math.PI / 6);
  const s30 = Math.sin(Math.PI / 6);
  return Math.max(Math.abs(Math.hypot((c30 * d[0] + s30 * d[1]) / ELL_A, (-s30 * d[0] + c30 * d[1]) / ELL_B) - 1) * ELL_B, Math.abs(d[2]));
};
const offBspline = (p: readonly number[]): number => dist(p, bsAtW(bsParam(p as V3)));

describe("축이 꺾은선 토막의 활꼴만 지날 때의 곡선 위 교차(코어 0.20.0 refine 'axisEdge' open)", () => {
  it('전제: 고른 곡선 위 점은 그 토막(현)에서 처짐만큼 바깥이고(처짐 1e-4 넘게), 확대하면 처짐이 3~6화소', () => {
    for (const T of [CIRC, ELL, BSP]) {
      expect(T.gap).toBeGreaterThan(1e-4);
      const { w } = fromPlate(T);
      const g = gapPx(w, T);
      expect(g, `${T.X}`).toBeGreaterThanOrEqual(3);
      expect(g).toBeLessThanOrEqual(6);
    }
    expect(offCircleC(CIRC.X)).toBeLessThan(1e-12);
    expect(offEllipse(ELL.X)).toBeLessThan(1e-12);
    expect(offBspline(BSP.X)).toBeLessThan(1e-12);
  });

  it('기울인 원판 C, 타원 호, B-스플라인 모서리: 판 꼭짓점의 Z축이 곡선 평면을 뚫는 자리를 곡선 위로 — 축 위 정확히, "Z축 · 모서리 위", 앱 refine이 open으로', () => {
    for (const [T, off] of [
      [CIRC, offCircleC],
      [ELL, offEllipse],
      [BSP, offBspline],
    ] as const) {
      const { w, F } = fromPlate(T);
      const { v, calls } = w;
      hoverAt(w, T.X);
      const h = v.measureHoverSnap!;
      expect(h.snap, `${T.X}`).toBe('axis');
      expect(h.axis).toBe('z');
      expect(h.locked).toBeUndefined();
      expect(h.segment?.kind).toBe('edge');
      expect(h.refined).toBe(true);
      expect(h.point[0]).toBe(F[0]);
      expect(h.point[1]).toBe(F[1]);
      // 곡선 위(첫 점이 float32 꼭짓점이라 그만큼), 현과는 처짐만큼 떨어져 있다
      expect(off(h.point)).toBeLessThan(5e-6);
      expect(dist(h.point, T.X)).toBeLessThan(1e-5);
      expect(T.gap).toBeGreaterThan(20 * 1e-5);
      expect(hoverSnapLabel(h)).toBe('Z축 · 모서리 위');
      const open = calls.filter((c) => c.kind === 'axisEdge' && c.open);
      expect(open.length).toBeGreaterThanOrEqual(1);
      expect(open[0]!.line).toMatchObject({ origin: F, axis: 'z' });
    }
  });

  it('찍으면 그 점까지(dx·dy 0), 커서를 조금 옮겨도 같은 선·토막이라 다시 부르지 않는다(코어 기억)', () => {
    const { w, F } = fromPlate(CIRC);
    const { v, calls } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    hoverAt(w, CIRC.X);
    const X = v.measureHoverSnap!.point;
    const n = calls.filter((c) => c.open).length;
    expect(n).toBeGreaterThanOrEqual(1);
    hoverAt(w, CIRC.X, 3, -1);
    expect(v.measureHoverSnap!.point).toEqual(X);
    expect(calls.filter((c) => c.open)).toHaveLength(n);
    clickAt(w, CIRC.X, 3, -1);
    const m = got[got.length - 1]!;
    expect(m.snapB).toBe('axis');
    expect(m.dx).toBe(0);
    expect(m.dy).toBe(0);
    expect(Math.abs(m.distance - (F[2] - X[2]))).toBeLessThan(1e-12);
    expect(snapPair(result(v, m))).toEqual(['끝점', 'Z축 · 모서리 위']);
  });

  it('잠근 Z축(lockEdges)도 같은 자리 — "잠근 Z축 · 모서리 위", 결과도', () => {
    const { w, F } = fromPlate(ELL);
    const { v } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    expect(v.setMeasureInferenceLock('z')).toBe(true);
    hoverAt(w, ELL.X);
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.snap).toBe('axis');
    expect(h.segment?.kind).toBe('edge');
    expect(h.refined).toBe(true);
    expect(h.point[0]).toBe(F[0]);
    expect(h.point[1]).toBe(F[1]);
    expect(offEllipse(h.point)).toBeLessThan(5e-6);
    expect(hoverSnapLabel(h)).toBe('잠근 Z축 · 모서리 위');
    clickAt(w, ELL.X, 2, 1);
    const m = got[got.length - 1]!;
    expect(m.lockedB).toBe(true);
    expect(Math.abs(m.distance - (F[2] - h.point[2]))).toBeLessThan(1e-12);
    expect(snapPair(result(v, m))).toEqual(['끝점', '잠근 Z축 · 모서리 위']);
  });

  it('곡선 붙잡기를 주지 않으면(조각을 받기 전) 그 자리에 모서리 교차가 없다 — 0.19.0과 같은 꼴', () => {
    for (const T of [CIRC, ELL, BSP]) {
      const { w } = fromPlate(T, false);
      hoverAt(w, T.X);
      const h = w.v.measureHoverSnap!;
      expect(h.refined).toBeUndefined();
      expect(hoverSnapLabel(h)).not.toBe('Z축 · 모서리 위');
    }
  });
});

describe('축이 아닌 잠근 선의 다듬기(코어 0.20.0 — SnapRefineLine.axis 없음)', () => {
  it('G에서 원판 A 위 점 쪽으로 잠근 선(앱이 정한 방향): 원 평면을 뚫는 그 원 위 점(1e-9 — 열린 교차), "잠근 방향 · 모서리 위"', () => {
    const w = view();
    const { v, calls } = w;
    clickAt(w, G, 1, 0);
    const F = v.measurePoints[0]!.point as V3;
    close(F, G, 1e-6);
    const d = unit(sub(CIRC2.X, F));
    expect(v.setMeasureInferenceLock({ direction: d, kind: 'parallel' })).toBe(true);
    expect(zoomTo(w, CIRC2)).toBeGreaterThan(1);
    hoverAt(w, CIRC2.X);
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.snap).toBe('parallel');
    expect(h.axis).toBeUndefined();
    expect(h.segment?.kind).toBe('edge');
    expect(h.refined).toBe(true);
    close(h.point, CIRC2.X);
    expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - R_A)).toBeLessThan(1e-9);
    expect(hoverSnapLabel(h)).toBe('잠근 방향 · 모서리 위');
    const c = calls.find((q) => q.kind === 'axisEdge' && q.line && !('axis' in q.line));
    expect(c).toBeTruthy();
    close(c!.line!.dir, d, 1e-12);
    expect(c!.line!.origin).toEqual(F);
  });

  it('원판 A 이음 꼭짓점에서 원의 접선으로 잠근 선(TangentLock)이 원판 B 테두리와 만나는 점: 원 위(1e-9)·잠근 선 위, "잠근 접선 · 모서리 위"', () => {
    const w = view();
    const { v, tl } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, SEAM_A);
    expect(v.measurePointCount).toBe(1);
    const F = v.measurePoints[0]!.point as V3;
    close(F, SEAM_A, 1e-6);
    // 이음 꼭짓점 둘레를 확대해 원 첫 토막 끝 꼭짓점을 가리키고 잠금 단추(lockNow) — 코어는 그 현 방향, 앱은 그 끝에서 원이 도는 쪽 접선(모서리 표 float32)
    lookAt(w, SEAM_A, 4);
    hoverAt(w, circA.poly[1]!, 0, 0);
    expect(v.measureHoverLock?.kind).toBe('parallel');
    expect(tl.now(v)).toBeTruthy();
    expect(tl.lockNow(v)).toBe(true);
    expect(tl.locked(v)).toBe(true);
    const l = v.measureInferenceLock!.direction;
    expect(dist(l, TAN_A)).toBeLessThan(1e-6);
    // 잠근 선 F + t l과 원판 B 테두리의 가까운 교점(평면 z = 0 — 이차식)
    const o = sub(F, B_C);
    const b = dot(o, l);
    const t = -b - Math.sqrt(b * b - (dot(o, o) - R_B * R_B));
    const X: V3 = [F[0] + t * l[0]!, F[1] + t * l[1]!, F[2] + t * l[2]!];
    expect(t).toBeGreaterThan(5);
    // 원판 B 꺾은선 꼭짓점이 붙잡기 거리 밖이 되게 다가가, 잠근 선 위 원판 B 안쪽(그물 경계를 정확히 가리키지 않게)을 가리킨다
    lookAt(w, X, 1);
    const In: V3 = [X[0] + 0.005 * l[0]!, X[1] + 0.005 * l[1]!, 0];
    hoverAt(w, In, 0, 0);
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.snap).toBe('parallel');
    expect(h.segment?.kind).toBe('edge');
    expect(h.refined).toBe(true);
    close(h.point, X);
    expect(Math.abs(dist(h.point, B_C) - R_B)).toBeLessThan(1e-9);
    expect(hoverSnapLabel(h, tl.locked(v))).toBe('잠근 접선 · 모서리 위');
    clickAt(w, In);
    const m = got[got.length - 1]!;
    expect(m.lockedB).toBe(true);
    expect(Math.abs(m.distance - Math.abs(t))).toBeLessThan(1e-9);
    expect(tl.result(m)).toBe(true);
    expect(snapPair({ ...result(v, m), tangentB: tl.result(m) })).toEqual(['끝점', '잠근 접선 · 모서리 위']);
  });
});
