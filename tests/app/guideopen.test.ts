/**
 * 36차: 끌어온 점 안내 선의 열린 교차 — 코어 0.31.0 trackDirs { meets: { open } }(곡선 모서리 꺾은선의 활꼴만 지나 현과 만나지 않는 선)와
 * 0.32.0 { openFaces }(곡면을 나눈 삼각형을 비켜 가며 곡면만 뚫는 선). 앱 measureSnapOptions(곧은 모서리 거르기·곡선·곡면 다듬기 그대로)와 실제 코어(가짜 DOM).
 * 장면은 trackmeet.test.ts와 같은 원기둥(반지름 10, 높이 20 — 윗 테두리가 원 모서리, 옆면이 원기둥 면)과 세로 삼각 판(y = −4).
 * 기준은 판의 세로 곧은 모서리 x = 26, y = −4. 끌어온 점 P(높이 h)에서 그 모서리에 수직인 안내 선은 P와 F = (26, −4, h)를 지나는 수평선이다.
 * F에서 원에 닿을락 말락 지나게(원 중심에서 거리 d가 한 토막의 현과 원 사이 — 두 교점이 그 토막 각 안) P를 고르면 그 선은 윗 테두리 꺾은선의 현·옆면 삼각형과
 * 만나지 않고 원(원기둥)과만 두 번 만난다.
 * - 윗 테두리(h = 20): 켜면 원 위 교점(앱 refine 'axisEdge' 열린 후보)으로 다듬어 "끌어온 점에서 모서리에 수직 · 모서리 위", 0.30.0 꼴({ guides })이면 그 자리는 만나는 점이 아니다
 * - 옆면(h = 10): 켜면 원기둥 면 위 교점(앱 refineFace 'axisFace' 열린 후보)으로 "… · 면 위", 끄면 아니다
 * 교점 둘레를 크게 보아(현·삼각형과 교점 사이가 여러 화소) 가리키고, 화면 좌표는 조금 비킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureInference, type MeasureTrackDirOptions } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex, stepFaceIndex } from '../../src/app/doc';
import { circleCenters, measureSnapOptions, TRACK_PARALLEL_LABEL, TRACK_PERPENDICULAR_LABEL } from '../../src/app/snap';
import { curveSnap } from '../../src/app/curvesnap';
import { straightEdgeFilter, trackDirMeet, trackDirMeetLabel } from '../../src/app/trackdir';
import { StepText, type P3 } from '../stepText';
import { type FakeElement, installDom } from './fakeview';
import { cylinderRim, RIM_H, RIM_R, type V3 } from './curvescene';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

const c30 = Math.cos(Math.PI / 6);
const s30 = Math.sin(Math.PI / 6);
const TRI: V3 = [20, -4, 10];
const LOW: V3 = [26, -4, 4];
const HIGH: V3 = [26, -4, 16];

function axisStep(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const cyl = w.product('rim-cylinder', [cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])], mm);
  const p: P3[] = [TRI, LOW, HIGH];
  const V = p.map((q) => w.vertex(q));
  const es = p.map((q, i) => w.edge(V[i]!, V[(i + 1) % 3]!, w.line(q, p[(i + 1) % 3]!)));
  const face = w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], w.plane(TRI, [0, -1, 0], [1, 0, 0]));
  const tri = w.product('side-plate', [w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`)], mm, 'SHAPE_REPRESENTATION');
  const root = w.product('axis', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  w.place(root, cyl, w.ax2([0, 0, 0]), 'cyl-1');
  w.place(root, tri, w.ax2([0, 0, 0]), 'tri-1');
  return w.bytes('axis.stp');
}

/**
 * 37차 키 큰 원기둥(반지름 30, 높이 400 — 옆면 칸 하나가 바닥에서 꼭대기까지, 이음매 9°라 남쪽 칸이 −90°를 가운데에 둔다)과
 * 기준 판(y = −80, 곧은 모서리 TA → TB가 (1, 0, −1) 방향)
 */
const TALL_R = 30;
const TALL_H = 400;
const TALL_Z = 200;
const TALL_SEAM = (9 * Math.PI) / 180;
const TA: V3 = [60, -80, 240];
const TB: V3 = [80, -80, 220];
const TC: V3 = [80, -80, 260];

/** 원기둥(반지름 rad, 높이 h, 이음매 각 seam)과 세로 삼각 판(꼭짓점 셋 — 판 법선 n, 첫 변이 기준 곧은 모서리) */
function cylPlateStep(rad: number, h: number, seam: number, p: P3[], n: P3): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const cyl = w.product('side-cylinder', [cylinderRim(w, rad, h, [Math.cos(seam), Math.sin(seam), 0])], mm);
  const V = p.map((q) => w.vertex(q));
  const es = p.map((q, i) => w.edge(V[i]!, V[(i + 1) % 3]!, w.line(q, p[(i + 1) % 3]!)));
  const e0 = [p[1]![0] - p[0]![0], p[1]![1] - p[0]![1], p[1]![2] - p[0]![2]];
  const l0 = Math.hypot(e0[0]!, e0[1]!, e0[2]!);
  const face = w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], w.plane(p[0]!, n, [e0[0]! / l0, e0[1]! / l0, e0[2]! / l0]));
  const plate = w.product('side-plate', [w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`)], mm, 'SHAPE_REPRESENTATION');
  const root = w.product('side', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  w.place(root, cyl, w.ax2([0, 0, 0]), 'cyl-1');
  w.place(root, plate, w.ax2([0, 0, 0]), 'plate-1');
  return w.bytes('side.stp');
}

/**
 * 37차 낮은 원기둥(반지름 30, 높이 60 — 앱이 50토막으로 나눈다, 이음매는 옆면 칸 하나가 기준 모서리에 수직인 각 φ를 가운데에 두게)과
 * 기준 판(곧은 모서리 LA → LB가 수평). 한 삼각형 위 곡면 조각을 두 번 스치는 안내 선(코어 요청 재현)
 */
const LOW_R = 30;
const LOW_H = 60;
const LOW_Z = 5;
// 기준 모서리는 정수 좌표(파일·float32에서 그대로 — 안내 선 방향이 정확하다): 방향 (18, 3, 0)/√333, 그 선의 법선 각 φ = atan2(3, 18) − 90°(약 −80.54°)
const LA: V3 = [60, -80, 30];
const LB: V3 = [78, -77, 30];
const LC: V3 = [78, -77, 50];
const LOW_E: V3 = [18 / Math.sqrt(333), 3 / Math.sqrt(333), 0];
const LOW_PHI = Math.atan2(3, 18) - Math.PI / 2;
// 앱이 50토막(7.2°)으로 나누므로 칸 [φ − 3.6°, φ + 3.6°]가 φ를 가운데에 두게
const LOW_SEAM = LOW_PHI - (3.6 * Math.PI) / 180 + (12 * 7.2 * Math.PI) / 180;

const scene = stepToScene(axisStep());
const ex = stepEdgeIndex(scene)!;
const fx = stepFaceIndex(scene);
const BASE = { scene, ex, fx };
const tallScene = stepToScene(cylPlateStep(TALL_R, TALL_H, TALL_SEAM, [TA, TB, TC], [0, -1, 0]));
const TALL = { scene: tallScene, ex: stepEdgeIndex(tallScene)!, fx: stepFaceIndex(tallScene) };
const lowScene = stepToScene(cylPlateStep(LOW_R, LOW_H, LOW_SEAM, [LA, LB, LC], [LOW_E[1], -LOW_E[0], 0]));
const LOWCYL = { scene: lowScene, ex: stepEdgeIndex(lowScene)!, fx: stepFaceIndex(lowScene) };
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}

/** app = 앱 그대로(36차 — { guides, open, openFaces }), guides = 35차 꼴({ guides: true }) */
function view(meets: 'app' | 'guides', { scene, ex, fx } = BASE): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  const o = measureSnapOptions(scene.meshes, ex, circleCenters(scene.meshes, ex), curveSnap(scene.meshes, ex, fx), false, straightEdgeFilter(ex));
  const inf = o.inference as MeasureInference;
  const td = inf.trackDirs as MeasureTrackDirOptions;
  expect(td.meets).toEqual({ guides: true, open: true, openFaces: true });
  v.setMeasureSnap(meets === 'app' ? o : { ...o, inference: { ...inf, trackDirs: { ...td, meets: { guides: true } } } });
  return { v, canvas: v.canvas as unknown as FakeElement };
}

const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const q = w.v.project(p)!;
  expect(q.onScreen, `화면 안 ${p}`).toBe(true);
  return { x: q.x, y: q.y };
};
const hoverAt = (w: View, p: readonly number[], dx = 0.37, dy = -0.29): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x + dx, q.y + dy, 0);
  w.v.renderNow();
};

/** 윗 테두리 꺾은선의 꼭짓점 각(원 위 — 오름차순). 37차: 장면·높이·반지름을 받는다(키 큰 원기둥) */
function rimAngles(sc = scene, h = RIM_H, rad = RIM_R): number[] {
  const angs = new Set<number>();
  for (const m of sc.meshes) {
    const E = m.edges;
    if (!E) continue;
    const o = m.origin ?? [0, 0, 0];
    for (let i = 0; i + 2 < E.length; i += 3) {
      const x = E[i]! + o[0]!, y = E[i + 1]! + o[1]!, z = E[i + 2]! + o[2]!;
      if (Math.abs(z - h) < 1e-4 && Math.abs(Math.hypot(x, y) - rad) < 1e-4) angs.add(Math.round(Math.atan2(y, x) * 1e9) / 1e9);
    }
  }
  return [...angs].sort((a, b) => a - b);
}

/**
 * F = (26, −4, h)에서 원에 닿을락 말락 지나는 수평 안내 선: 두 접선 각(only를 주면 그쪽만 — 옆면은 남동 등각에서 보이는 남쪽) 가운데 꼭짓점에서 먼 쪽,
 * 그 토막 [a, b] 안에서 교점 반각 w(토막 안 여유의 ⅓) → 중심 거리 d = R cos w, 선의 법선 각 θ(F·n = d), 교점 M(θ + w 쪽), 끌어온 점 P(원 건너편 — 선 위)
 */
function nearTangent(h: number, only?: 1 | -1): { P: V3; M: V3; n: number[]; a: number; b: number; d: number; th: number; w: number } {
  const angs = rimAngles();
  expect(angs.length).toBeGreaterThan(8);
  const F = [26, -4];
  const fl = Math.hypot(F[0]!, F[1]!);
  const phi = Math.atan2(F[1]!, F[0]!);
  let best: { th: number; a: number; b: number; m: number; s: number } | null = null;
  for (const s of only ? [only] : [1, -1]) {
    const th = phi + s * Math.acos(RIM_R / fl);
    const t = Math.atan2(Math.sin(th), Math.cos(th));
    let a = angs[angs.length - 1]! - 2 * Math.PI;
    let b = angs[0]!;
    for (let i = 0; i < angs.length; i++) {
      const lo = angs[i]!;
      const hi = i + 1 < angs.length ? angs[i + 1]! : angs[0]! + 2 * Math.PI;
      if (t >= lo && t < hi) [a, b] = [lo, hi];
    }
    const m = Math.min(t - a, b - t);
    if (!best || m > best.m) best = { th: t, a, b, m, s };
  }
  const w = best!.m / 3;
  const d = RIM_R * Math.cos(w);
  const th = phi + best!.s * Math.acos(d / fl);
  const n = [Math.cos(th), Math.sin(th)];
  const tg = [-n[1]!, n[0]!];
  const M: V3 = [d * n[0]! + RIM_R * Math.sin(w) * tg[0]!, d * n[1]! + RIM_R * Math.sin(w) * tg[1]!, h];
  // 선 위 F의 맞은편(원 중심에서 본 접점 F' = d·n을 지나 F에서 멀어지는 쪽)
  const foot = [d * n[0]!, d * n[1]!];
  const P: V3 = [foot[0]! + (foot[0]! - F[0]!) * 0.6, foot[1]! + (foot[1]! - F[1]!) * 0.6, h];
  // 두 교점이 그 토막 각 안이고 선이 현보다 바깥(중심 거리 d > 현의 그 각 거리)
  expect(th - w).toBeGreaterThan(best!.a);
  expect(th + w).toBeLessThan(best!.b);
  expect(d).toBeGreaterThan(RIM_R * Math.cos((best!.b - best!.a) / 2) / Math.cos(Math.max(Math.abs(th - w - (best!.a + best!.b) / 2), Math.abs(th + w - (best!.a + best!.b) / 2))));
  return { P, M, n, a: best!.a, b: best!.b, d, th, w };
}

/** 안내 선(P → F)에서 점까지 거리 */
const offGuide = (X: readonly number[], P: V3, h: number): number => {
  const F: V3 = [26, -4, h];
  const u = [F[0] - P[0], F[1] - P[1], F[2] - P[2]];
  const l = Math.hypot(u[0]!, u[1]!, u[2]!);
  const k = ((X[0]! - P[0]) * u[0]! + (X[1]! - P[1]) * u[1]! + (X[2]! - P[2]) * u[2]!) / (l * l);
  return dist(X, [P[0] + u[0]! * k, P[1] + u[1]! * k, P[2] + u[2]! * k]);
};

/** 교점 둘레를 크게(교점과 현 사이가 화소 여럿이게) */
function zoomTo(w: View, M: V3, chordMid: V3): void {
  const c = w.v.getCamera();
  let k = 0.02;
  for (let i = 0; i < 6; i++) {
    w.v.setCamera({ ...c, target: [...M], distance: c.distance * k });
    w.v.renderNow();
    const a = w.v.project(M)!, b = w.v.project(chordMid)!;
    if (Math.hypot(a.x - b.x, a.y - b.y) > 24) return;
    k /= 2;
  }
}

/** 윗 테두리 자리: 판의 세로 곧은 모서리를 기준으로, 끌어온 점 P의 수직인 안내 선 — 교점 둘레를 크게 본 뷰어 */
function edgeCase(): { M: V3; P: V3; open: (m: 'app' | 'guides') => View; onGuide: (X: readonly number[]) => number } {
  const g = nearTangent(RIM_H);
  const mid = (g.a + g.b) / 2;
  const half = (g.b - g.a) / 2;
  const chordMid: V3 = [RIM_R * Math.cos(half) * Math.cos(mid), RIM_R * Math.cos(half) * Math.sin(mid), RIM_H];
  return {
    M: g.M,
    P: g.P,
    onGuide: (X) => offGuide(X, g.P, RIM_H),
    open: (m) => {
      const w = view(m);
      // 기준: 판의 세로 곧은 모서리(가운데 점을 비켜)
      hoverAt(w, [26, -4, 13.3]);
      expect(w.v.setMeasureTrackPoints([g.P])).toBe(1);
      zoomTo(w, g.M, chordMid);
      return w;
    },
  };
}

/**
 * 옆면 자리: 기운 곧은 모서리 TRI → LOW(방향 (1, 0, −1)/√2)와 나란한 안내 선 y = −d(남쪽 −90° 둘레 — 옆면 삼각형 각 [a, b] 안)가 원기둥을
 * x = ±R sin w에서 두 번 스치듯 뚫고 그 사이는 삼각형과 곡면 사이다. 두 교점이 그 토막을 나눈 두 삼각형에 하나씩 오게(대각선을 사이에 두게) w는 토막 안 여유의 ⅔.
 * 끌어온 점 P는 그 선 위 원기둥 밖 위쪽. 남쪽 바깥에서 거의 수평으로 가까이 본다(선과 삼각형 사이가 반 화소보다 넓게 — 37차 코어 0.33.0부터는 꼭짓점이 눈 뒤인
 * 삼각형도 커서 둘레 삼각형으로 모으므로 옆면 삼각형이 모두 눈앞이어야 한다는 전제는 없다. 꼭짓점이 눈 뒤인 자리는 아래 tallCase)
 */
function faceCase(): { M: V3; P: V3; open: (m: 'app' | 'guides') => View; onGuide: (X: readonly number[]) => number } {
  const angs = rimAngles();
  const lo = Math.max(...angs.filter((t) => t < -Math.PI / 2));
  const hi = Math.min(...angs.filter((t) => t > -Math.PI / 2));
  const w = (Math.min(-Math.PI / 2 - lo, hi + Math.PI / 2) * 2) / 3;
  expect(w).toBeGreaterThan((0.8 * Math.PI) / 180);
  const d = RIM_R * Math.cos(w);
  const E: V3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  const P: V3 = [-15 * E[0], -d, 10 - 15 * E[2]];
  const M: V3 = [RIM_R * Math.sin(w), -d, 10 - RIM_R * Math.sin(w)];
  const onGuide = (X: readonly number[]): number => {
    const k = (X[0]! - P[0]) * E[0] + (X[1]! - P[1]) * E[1] + (X[2]! - P[2]) * E[2];
    return dist(X, [P[0] + E[0] * k, P[1] + E[1] * k, P[2] + E[2] * k]);
  };
  expect(onGuide(M)).toBeLessThan(1e-12);
  return {
    M,
    P,
    onGuide,
    open: (m) => {
      const v = view(m);
      // 기준: 기운 곧은 모서리 TRI → LOW(가운데 점을 비켜)
      hoverAt(v, [TRI[0] + 2, TRI[1], TRI[2] - 2]);
      expect(v.v.setMeasureTrackPoints([P])).toBe(1);
      const c = v.v.getCamera();
      v.v.setCamera({ ...c, target: [...M], distance: 4, yaw: 0.35, pitch: 0.2 });
      v.v.renderNow();
      return v;
    },
  };
}

/**
 * 37차 키 큰 칸 자리(코어 0.33.0 — 원근으로 아주 가까이 확대해 꼭짓점이 눈 뒤인 삼각형도 커서 둘레 삼각형으로 모은다): 키 큰 원기둥의 남쪽(−90°) 옆면 칸 [lo, hi]를
 * 기준 판 모서리 TA → TB(방향 (1, 0, −1)/√2)와 나란한 안내 선 y = −d가 높이 TALL_Z 둘레에서 x = ±R sin w로 두 번 스치듯 뚫는다(w는 칸 안 여유의 ⅔ — faceCase와 같은 꼴,
 * 칸이 −90°를 가운데에 두어 두 교점에서 선과 칸 사이가 같다). 두 교점은 칸을 나눈 두 삼각형에 하나씩 든다.
 * 남쪽 조금 동쪽 위에서 거리 22로 내려다보면 그 칸 삼각형의 위 꼭짓점(z 400)은 눈 뒤, 아래 꼭짓점(z 0)은 눈앞이다(0.32.0까지는 그 칸을 모으지 않아 붙지 않았다)
 */
function tallCase(): { M1: V3; M2: V3; P: V3; corners: V3[]; open: (m: 'app' | 'guides', target: V3) => View; onGuide: (X: readonly number[]) => number } {
  const angs = rimAngles(tallScene, TALL_H, TALL_R);
  const lo = Math.max(...angs.filter((t) => t < -Math.PI / 2));
  const hi = Math.min(...angs.filter((t) => t > -Math.PI / 2));
  expect(Math.abs(lo + hi + Math.PI), '남쪽 칸이 −90°를 가운데에').toBeLessThan(1e-6);
  const w = (Math.min(-Math.PI / 2 - lo, hi + Math.PI / 2) * 2) / 3;
  expect(w).toBeGreaterThan((0.8 * Math.PI) / 180);
  const d = TALL_R * Math.cos(w);
  const xi = TALL_R * Math.sin(w);
  const E: V3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
  const P: V3 = [-15 * E[0], -d, TALL_Z - 15 * E[2]];
  const M1: V3 = [-xi, -d, TALL_Z + xi];
  const M2: V3 = [xi, -d, TALL_Z - xi];
  const onGuide = (X: readonly number[]): number => {
    const k = (X[0]! - P[0]) * E[0] + (X[1]! - P[1]) * E[1] + (X[2]! - P[2]) * E[2];
    return dist(X, [P[0] + E[0] * k, P[1] + E[1] * k, P[2] + E[2] * k]);
  };
  for (const M of [M1, M2]) expect(onGuide(M)).toBeLessThan(1e-12);
  const corners = [lo, hi].flatMap((a): V3[] => [
    [TALL_R * Math.cos(a), TALL_R * Math.sin(a), 0],
    [TALL_R * Math.cos(a), TALL_R * Math.sin(a), TALL_H],
  ]);
  return {
    M1,
    M2,
    P,
    corners,
    onGuide,
    open: (m, target) => {
      const v = view(m, TALL);
      // 기준: 판의 기운 곧은 모서리 TA → TB(가운데 점을 비켜)
      hoverAt(v, [TA[0] + 6, TA[1], TA[2] - 6]);
      expect(v.v.setMeasureTrackPoints([P])).toBe(1);
      v.v.setCamera({ ...v.v.getCamera(), target: [...target], distance: 22, yaw: 0.25, pitch: 0.29, projection: 'perspective' });
      v.v.renderNow();
      return v;
    },
  };
}

/**
 * 37차 한 삼각형 위 곡면 조각을 두 번 스치는 안내 선(코어 0.33.0 README "STEP 선택 요청" 재현): 낮은 원기둥의 옆면 칸 [lo, hi](φ 가운데)를
 * 기준 모서리 LA → LB와 나란한 수평 안내 선(칸의 현과 거의 나란 — 법선 각 φ, 중심 거리 d = R cos w)이 높이 LOW_Z에서 φ ± w로 두 번 스치듯 뚫는다(w는 칸 반각의 ½ —
 * 선과 칸 사이가 반 화소보다 넓게). 칸 바닥 가까이라(높이 60 가운데 5) 두 교점이 칸을 나눈 한 삼각형(아래 변 전체를 가진 쪽)에 다 든다.
 * 칸이 모두 눈앞이게(가까운 면 자르기와 섞이지 않게) 거리 15에서 본다
 */
function lowCase(): { Ms: [V3, V3]; P: V3; corners: V3[]; open: (target: V3) => View; onGuide: (X: readonly number[]) => number } {
  const angs = rimAngles(lowScene, LOW_H, LOW_R);
  const mid = LOW_PHI;
  const lo = Math.max(...angs.filter((t) => t < mid));
  const hi = Math.min(...angs.filter((t) => t > mid));
  // 이음매 방향을 파일에 적으며 반올림하므로 가운데는 거의(두 교점이 칸 안 여유를 넉넉히 두면 된다)
  expect(Math.abs(lo + hi - 2 * mid), '옆면 칸이 φ를 가운데에').toBeLessThan(1e-4);
  const w = Math.min(mid - lo, hi - mid) / 2;
  const d = LOW_R * Math.cos(w);
  const xi = LOW_R * Math.sin(w);
  const n: V3 = [Math.cos(mid), Math.sin(mid), 0];
  const E = LOW_E;
  const at0: V3 = [d * n[0], d * n[1], LOW_Z];
  const Ms: [V3, V3] = [
    [at0[0] - xi * E[0], at0[1] - xi * E[1], LOW_Z],
    [at0[0] + xi * E[0], at0[1] + xi * E[1], LOW_Z],
  ];
  const P: V3 = [at0[0] - 15 * E[0], at0[1] - 15 * E[1], LOW_Z];
  const onGuide = (X: readonly number[]): number => {
    const k = (X[0]! - P[0]) * E[0] + (X[1]! - P[1]) * E[1] + (X[2]! - P[2]) * E[2];
    return dist(X, [P[0] + E[0] * k, P[1] + E[1] * k, P[2] + E[2] * k]);
  };
  for (const M of Ms) expect(Math.abs(Math.hypot(M[0], M[1]) - LOW_R)).toBeLessThan(1e-9);
  const corners = [lo, hi].flatMap((a): V3[] => [
    [LOW_R * Math.cos(a), LOW_R * Math.sin(a), 0],
    [LOW_R * Math.cos(a), LOW_R * Math.sin(a), LOW_H],
  ]);
  return {
    Ms,
    P,
    corners,
    onGuide,
    open: (target) => {
      const v = view('app', LOWCYL);
      // 기준: 판의 수평 곧은 모서리 LA → LB(가운데 점을 비켜)
      hoverAt(v, [LA[0] + 6 * E[0], LA[1] + 6 * E[1], LA[2]]);
      expect(v.v.setMeasureTrackPoints([P])).toBe(1);
      v.v.setCamera({ ...v.v.getCamera(), target: [...target], distance: 15, yaw: Math.PI / 18, pitch: 0.25, projection: 'perspective' });
      v.v.renderNow();
      return v;
    },
  };
}

describe('안내 선의 열린 교차(코어 0.31.0 open·0.32.0 openFaces)', () => {
  it('윗 테두리 원의 한 토막 활꼴만 지나는 안내 선: 켜면 원 위 교점으로 다듬어 "끌어온 점에서 모서리에 수직 · 모서리 위", 35차 꼴이면 만나는 점이 아니다', () => {
    const g = edgeCase();
    const res = (['app', 'guides'] as const).map((m) => {
      const w = g.open(m);
      hoverAt(w, g.M);
      return w.v.measureHoverSnap;
    });
    const h = res[0]!;
    expect(h.snap).toBe('perpendicular');
    expect(h.trackFrom).toEqual(g.P);
    expect(h.segment?.kind).toBe('edge');
    expect(h.refined).toBe(true);
    expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RIM_R)).toBeLessThan(1e-9);
    expect(Math.abs(h.point[2] - RIM_H)).toBeLessThan(1e-9);
    expect(g.onGuide(h.point)).toBeLessThan(1e-9);
    expect(dist(h.point, g.M)).toBeLessThan(1e-6);
    expect(trackDirMeet(h)).toBe('edge');
    expect(trackDirMeetLabel(h)).toBe(`${TRACK_PERPENDICULAR_LABEL} · 모서리 위`);
    // 35차 꼴: 같은 자리가 원 위 만나는 점이 아니다(안내 선과 현이 만나지 않는다)
    const o = res[1];
    expect(o && trackDirMeet(o) === 'edge' && o.refined).toBeFalsy();
  });

  it('원기둥 옆면 삼각형을 비켜 가며 곡면만 뚫는 안내 선: 켜면 원기둥 면 위 교점으로 "끌어온 점에서 모서리와 나란히 · 면 위", 35차 꼴이면 만나는 점이 아니다', () => {
    const { M, P, onGuide, open } = faceCase();
    const res = (['app', 'guides'] as const).map((m) => {
      const v = open(m);
      hoverAt(v, M);
      return v.v.measureHoverSnap;
    });
    const h = res[0]!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toEqual(P);
    expect(h.face).toBeDefined();
    expect(h.refined).toBe(true);
    expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RIM_R)).toBeLessThan(1e-9);
    expect(onGuide(h.point)).toBeLessThan(1e-9);
    expect(dist(h.point, M)).toBeLessThan(1e-6);
    expect(trackDirMeet(h)).toBe('face');
    expect(trackDirMeetLabel(h)).toBe(`${TRACK_PARALLEL_LABEL} · 면 위`);
    const o = res[1];
    expect(o && trackDirMeet(o) === 'face' && o.refined).toBeFalsy();
  });

  it('두 자리 둘레 화면 격자(25 × 25, 1.37화소 칸 — 경계를 비킨 자리): 35차 꼴과 견주어 바뀐 자리는 모두 그 안내 선 위·원(원기둥) 위 다듬은 교점이다', () => {
    for (const [name, g] of [['edge', edgeCase()], ['face', faceCase()]] as const) {
      const on = g.open('app');
      const off = g.open('guides');
      const c = at(on, g.M);
      let changed = 0;
      for (let iy = -12; iy <= 12; iy++)
        for (let ix = -12; ix <= 12; ix++) {
          const x = c.x + ix * 1.37 + 0.211, y = c.y + iy * 1.37 - 0.173;
          for (const w of [on, off]) {
            ptr(w, 'pointermove', x, y, 0);
            w.v.renderNow();
          }
          const a = on.v.measureHoverSnap, b = off.v.measureHoverSnap;
          if (JSON.stringify(a) === JSON.stringify(b)) continue;
          changed++;
          const k = `${name} ${ix},${iy}`;
          expect(a, k).toBeTruthy();
          // 윗 테두리 높이의 안내 선은 원기둥 옆면도 같은 원 위 점에서 스친다 — 면의 열린 교차가 이길 수 있다(같은 점)
          expect(name === 'edge' ? ['edge', 'face'] : ['face'], k).toContain(trackDirMeet(a!));
          if (name === 'edge') expect(Math.abs(a!.point[2] - RIM_H), k).toBeLessThan(1e-9);
          expect(a!.refined, k).toBe(true);
          expect(a!.trackFrom, k).toEqual(g.P);
          expect(Math.abs(Math.hypot(a!.point[0], a!.point[1]) - RIM_R), k).toBeLessThan(1e-9);
          expect(g.onGuide(a!.point), k).toBeLessThan(1e-9);
        }
      // 교점 둘레(붙잡기 거리 안)에서는 바뀐다
      expect(changed, name).toBeGreaterThan(20);
    }
  });
});

describe('37차 아주 가까이 확대한 키 큰 원기둥 옆면 칸(코어 0.33.0 — 꼭짓점이 눈 뒤인 삼각형도 모은다)', () => {
  it('전제: 그 칸 삼각형의 위 꼭짓점(z 400)은 눈 뒤, 아래 꼭짓점(z 0)은 눈앞이고 두 교점은 화면 안, 칸을 나눈 두 삼각형에 하나씩이다', () => {
    const g = tallCase();
    const tris = new Set<number>();
    for (const M of [g.M1, g.M2]) {
      const w = g.open('app', M);
      for (const c of g.corners) expect(w.v.project(c)!.behind, `${M[0]} ${c}`).toBe(c[2] > 0);
      at(w, g.M1);
      at(w, g.M2);
      const q = at(w, M);
      const p = w.v.pick(q.x + 0.37, q.y - 0.29);
      expect(p?.kind, `${M[0]}`).toBe('mesh');
      tris.add(p!.index);
      w.v.dispose();
    }
    expect(tris.size).toBe(2);
  });

  it('두 교점 모두 원기둥 면 위 교점으로 다듬어 "끌어온 점에서 모서리와 나란히 · 면 위", 35차 꼴이면 만나는 점이 아니다', () => {
    const g = tallCase();
    for (const M of [g.M1, g.M2]) {
      const res = (['app', 'guides'] as const).map((m) => {
        const w = g.open(m, M);
        hoverAt(w, M);
        const h = w.v.measureHoverSnap;
        w.v.dispose();
        return h;
      });
      const h = res[0]!;
      const k = `${M[0]}`;
      expect(h.snap, k).toBe('parallel');
      expect(h.trackFrom, k).toEqual(g.P);
      expect(h.face, k).toBeDefined();
      expect(h.refined, k).toBe(true);
      expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - TALL_R), k).toBeLessThan(1e-9);
      expect(g.onGuide(h.point), k).toBeLessThan(1e-9);
      expect(dist(h.point, M), k).toBeLessThan(1e-6);
      expect(trackDirMeet(h), k).toBe('face');
      expect(trackDirMeetLabel(h), k).toBe(`${TRACK_PARALLEL_LABEL} · 면 위`);
      const o = res[1];
      expect(o && trackDirMeet(o) === 'face' && o.refined, k).toBeFalsy();
    }
  });

  it('두 교점 둘레 화면 격자(21 × 21, 1.37화소 칸 — 경계를 비킨 자리): 35차 꼴과 견주어 바뀐 자리는 모두 그 안내 선 위·원기둥 위 그 교점이다(엉뚱한 자리 0)', () => {
    const g = tallCase();
    for (const M of [g.M1, g.M2]) {
      const on = g.open('app', M);
      const off = g.open('guides', M);
      const c = at(on, M);
      let changed = 0;
      for (let iy = -10; iy <= 10; iy++)
        for (let ix = -10; ix <= 10; ix++) {
          const x = c.x + ix * 1.37 + 0.211, y = c.y + iy * 1.37 - 0.173;
          for (const w of [on, off]) {
            ptr(w, 'pointermove', x, y, 0);
            w.v.renderNow();
          }
          const a = on.v.measureHoverSnap, b = off.v.measureHoverSnap;
          if (JSON.stringify(a) === JSON.stringify(b)) continue;
          changed++;
          const k = `${M[0]} ${ix},${iy}`;
          expect(a, k).toBeTruthy();
          expect(trackDirMeet(a!), k).toBe('face');
          expect(a!.refined, k).toBe(true);
          expect(a!.trackFrom, k).toEqual(g.P);
          expect(Math.abs(Math.hypot(a!.point[0], a!.point[1]) - TALL_R), k).toBeLessThan(1e-9);
          expect(g.onGuide(a!.point), k).toBeLessThan(1e-9);
          expect(dist(a!.point, M), k).toBeLessThan(1e-6);
        }
      expect(changed, `${M[0]}`).toBeGreaterThan(20);
      on.v.dispose();
      off.v.dispose();
    }
  });
});

describe('37차 한 삼각형 위 곡면 조각을 두 번 스치는 안내 선(코어 요청 재현 — 0.33.0은 무게중심 쪽 교점만, 41차 코어 0.35.0부터 두 교점 다)', () => {
  it('두 교점이 한 삼각형에 다 들면 무게중심 쪽 교점도, 다른 교점도 원기둥 면 위 정확한 교점으로 붙는다(0.35.0 칸 둘째 힌트 — 앱 refineFace가 그 둘레 힌트로 푼다)', () => {
    const g = lowCase();
    // 전제: 칸 꼭짓점이 모두 눈앞, 두 교점이 같은 삼각형
    const tris: number[] = [];
    let tri: [V3, V3, V3] | null = null;
    for (const M of g.Ms) {
      const w = g.open(M);
      for (const c of g.corners) expect(w.v.project(c)!.behind, `${c}`).toBe(false);
      const q = at(w, M);
      const p = w.v.pick(q.x + 0.37, q.y - 0.29)!;
      expect(p.kind).toBe('mesh');
      tris.push(p.index);
      const m = lowScene.meshes.find((x) => x.id === p.id)!;
      const o = m.origin ?? [0, 0, 0];
      tri = [0, 1, 2].map((k) => {
        const i = m.indices![p.index * 3 + k]! * 3;
        return [m.positions[i]! + o[0]!, m.positions[i + 1]! + o[1]!, m.positions[i + 2]! + o[2]!] as V3;
      }) as [V3, V3, V3];
      w.v.dispose();
    }
    expect(tris[0]).toBe(tris[1]);
    // 그 삼각형은 칸의 아래 변 전체를 가진다(꼭짓점 둘이 바닥)
    expect(tri!.filter((c) => Math.abs(c[2]) < 1e-6).length).toBe(2);
    // 코어 힌트(무게중심을 선에 내린 발)에 가까운 교점이 붙는 쪽
    const cen = [0, 1, 2].map((k) => (tri![0][k]! + tri![1][k]! + tri![2][k]!) / 3);
    const s = (cen[0]! - g.P[0]) * LOW_E[0] + (cen[1]! - g.P[1]) * LOW_E[1] + (cen[2]! - g.P[2]) * LOW_E[2];
    const foot: V3 = [g.P[0] + LOW_E[0] * s, g.P[1] + LOW_E[1] * s, g.P[2] + LOW_E[2] * s];
    const [near, far] = dist(g.Ms[0], foot) < dist(g.Ms[1], foot) ? g.Ms : [g.Ms[1], g.Ms[0]];
    const res = [near, far].map((M) => {
      const w = g.open(M);
      hoverAt(w, M);
      const h = w.v.measureHoverSnap;
      w.v.dispose();
      return h;
    });
    const h = res[0]!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toEqual(g.P);
    expect(trackDirMeet(h)).toBe('face');
    expect(h.refined).toBe(true);
    expect(dist(h.point, near)).toBeLessThan(1e-6);
    expect(g.onGuide(h.point)).toBeLessThan(1e-9);
    expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - LOW_R)).toBeLessThan(1e-9);
    // 다른 교점: 0.33.0은 둘째 힌트를 두지 않아 붙지 않았다. 0.35.0은 칸의 두 휘는 변으로 두 교점이 다 그 삼각형 위인 것을 어림해 둘째 힌트를 두고,
    // 앱 refineFace가 그 힌트로 그 교점을 풀어 같은 "면 위" 만나는 점이 된다 — 원기둥 위(반지름 1e-9)·그 안내 선 위·그 교점 자리
    const o = res[1]!;
    expect(o.snap).toBe('parallel');
    expect(o.trackFrom).toEqual(g.P);
    expect(trackDirMeet(o)).toBe('face');
    expect(o.refined).toBe(true);
    expect(o.face?.index).toBe(tris[0]);
    expect(Math.abs(Math.hypot(o.point[0], o.point[1]) - LOW_R)).toBeLessThan(1e-9);
    expect(Math.abs(o.point[2] - LOW_Z)).toBeLessThan(1e-9);
    expect(g.onGuide(o.point)).toBeLessThan(1e-9);
    expect(dist(o.point, far)).toBeLessThan(1e-6);
    expect(dist(o.point, h.point)).toBeGreaterThan(0.1);
    expect(trackDirMeetLabel(o)).toBe(`${TRACK_PARALLEL_LABEL} · 면 위`);
    // 앱 refineFace는 그 교점 둘레 힌트로 그 교점을 정확히 푼다(코어가 둘째 힌트를 주면 이 함수가 그 점을 낸다)
    const opt = measureSnapOptions(lowScene.meshes, LOWCYL.ex, circleCenters(lowScene.meshes, LOWCYL.ex), curveSnap(lowScene.meshes, LOWCYL.ex, LOWCYL.fx), false, straightEdgeFilter(LOWCYL.ex));
    const m = lowScene.meshes.find((x) => x.id === h.face!.id)!;
    expect(m).toBeDefined();
    const hint: V3 = [far[0] + 0.2 * LOW_E[0], far[1] + 0.2 * LOW_E[1], far[2]];
    const r = opt.refineFace!({ kind: 'axisFace', open: true, face: { id: h.face!.id, index: tris[0]!, normal: h.face!.normal }, point: hint, line: { origin: g.P, dir: LOW_E } } as never);
    expect(r).not.toBeNull();
    expect(dist(r!, far)).toBeLessThan(1e-9);
  });
});

describe('42차 보통 거리에서 이웃 칸을 얕게 뚫는 안내 선(코어 0.36.0 — 0.35.0은 안내 선 위 커서 자리)', () => {
  it('거리 40에서 기준 모서리와 나란한 안내 선이 칸 현과 약 7°로 이웃 칸을 얕게 뚫는 교점을 가리키면 원기둥 위 다듬은 교점("· 면 위")', () => {
    // 낮은 원기둥, 높이 10: φ 칸 반각의 두 배로 스치는 선(φ 칸 현과 나란 — 두 교점은 이웃 칸에 들고 그 칸의 현과는 7.2°쯤으로 얕게 만난다)
    const angs = rimAngles(lowScene, LOW_H, LOW_R);
    const lo = Math.max(...angs.filter((t) => t < LOW_PHI));
    const hi = Math.min(...angs.filter((t) => t > LOW_PHI));
    const w = 2 * Math.min(LOW_PHI - lo, hi - LOW_PHI);
    const z = 10;
    const d = LOW_R * Math.cos(w);
    const xi = LOW_R * Math.sin(w);
    const n: V3 = [Math.cos(LOW_PHI), Math.sin(LOW_PHI), 0];
    const at0: V3 = [d * n[0], d * n[1], z];
    const M: V3 = [at0[0] + xi * LOW_E[0], at0[1] + xi * LOW_E[1], z];
    const P: V3 = [at0[0] - 15 * LOW_E[0], at0[1] - 15 * LOW_E[1], z];
    expect(Math.abs(Math.hypot(M[0], M[1]) - LOW_R)).toBeLessThan(1e-9);
    const v = view('app', LOWCYL);
    hoverAt(v, [LA[0] + 6 * LOW_E[0], LA[1] + 6 * LOW_E[1], LA[2]]);
    expect(v.v.setMeasureTrackPoints([P])).toBe(1);
    v.v.setCamera({ ...v.v.getCamera(), target: [...M], distance: 40, yaw: Math.PI / 18, pitch: 0.25, projection: 'perspective' });
    v.v.renderNow();
    hoverAt(v, M);
    const h = v.v.measureHoverSnap!;
    v.v.dispose();
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toEqual(P);
    expect(trackDirMeet(h)).toBe('face');
    expect(h.refined).toBe(true);
    // 원기둥 위(반지름 1e-9)·높이·그 안내 선 위·그 교점 자리
    expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - LOW_R)).toBeLessThan(1e-9);
    expect(Math.abs(h.point[2] - z)).toBeLessThan(1e-9);
    const k = (h.point[0] - P[0]) * LOW_E[0] + (h.point[1] - P[1]) * LOW_E[1];
    expect(dist(h.point, [P[0] + LOW_E[0] * k, P[1] + LOW_E[1] * k, z])).toBeLessThan(1e-9);
    expect(dist(h.point, M)).toBeLessThan(1e-6);
    expect(trackDirMeetLabel(h)).toBe(`${TRACK_PARALLEL_LABEL} · 면 위`);
  });
});
