/**
 * 코어 0.18.0 첫 점 축과 모서리의 교차(axisEdges)·축이 면을 뚫는 점(axisFaces)·축 교차 다듬기('axisEdge')를 실제 코어(opencad-viewer3d) 판정과 함께 본다
 * (가짜 DOM·WebGL2 뷰어에 포인터 사건). 장면은 원기둥(반지름 10, 높이 20 — 윗 테두리 이음 꼭짓점 30°)과 그 옆 세로 삼각 판(y = −4, 꼭짓점 (20, −4, 10)).
 * - 첫 점 = 테두리 이음 꼭짓점: 그 X·Y축이 윗 테두리 원과 만나는 맞은편 자리 — 꺾은선(현)이 아니라 원 위(1e-9), 축 위 정확히, "X축 · 모서리 위"
 * - 곡선 붙잡기를 주지 않으면(조각을 받기 전) 같은 후보가 꺾은선 위 점, 두 선택을 끄면 후보가 없고(0.17.0 그대로), 첫 점 전에는 켜도 같다
 * - 끌어온 축(0.17.0 track)과 테두리의 교차도 원 위로 다듬는다(0.18.0에서 바뀐 기본 동작)
 * - 첫 점 = 삼각 판 꼭짓점 (20, −4, 10): 그 X축이 원기둥 옆면을 뚫는 점 — "X축 · 면 위", 축 위 정확히, 원기둥을 나눈 삼각형 위 점(곡면에서 조금 안쪽)
 * 화면 좌표로 가리킬 때는 그물 경계(테두리)를 정확히 가리키지 않고 윗면 안쪽으로 조금 비킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, MEASURE_INFERENCE, measureSnapOptions, snapPair, trackMark } from '../../src/app/snap';
import { curveSnap } from '../../src/app/curvesnap';
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
/** 삼각 판의 첫 점 꼭짓점 */
const TRI: V3 = [20, -4, 10];

function axisStep(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const cyl = w.product('rim-cylinder', [cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])], mm);
  const p: P3[] = [TRI, [26, -4, 4], [26, -4, 16]];
  const V = p.map((q) => w.vertex(q));
  const es = p.map((q, i) => w.edge(V[i]!, V[(i + 1) % 3]!, w.line(q, p[(i + 1) % 3]!)));
  const face = w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], w.plane(TRI, [0, -1, 0], [1, 0, 0]));
  const tri = w.product('side-plate', [w.add('FACE_BASED_SURFACE_MODEL', `'',(#${w.add('CONNECTED_FACE_SET', `'',(#${face})`)})`)], mm, 'SHAPE_REPRESENTATION');
  const root = w.product('axis', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  w.place(root, cyl, w.ax2([0, 0, 0]), 'cyl-1');
  w.place(root, tri, w.ax2([0, 0, 0]), 'tri-1');
  return w.bytes('axis.stp');
}

const scene = stepToScene(axisStep());
const ex = stepEdgeIndex(scene)!;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
/** 테두리 이음 꼭짓점(첫 점) */
const SEAM: V3 = [RIM_R * c30, RIM_R * s30, RIM_H];
/** 0.17.0 꼴(두 선택을 끈 것) */
const OFF = Object.freeze({ ...MEASURE_INFERENCE, axisEdges: false, axisFaces: false });

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}

function view(withCurve = true, inference: typeof MEASURE_INFERENCE | typeof OFF = MEASURE_INFERENCE): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  v.setMeasureSnap({ ...measureSnapOptions(scene.meshes, ex, circleCenters(scene.meshes, ex), withCurve ? curveSnap(scene.meshes, ex) : null), inference });
  return { v, canvas: v.canvas as unknown as FakeElement };
}

const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const q = w.v.project(p, { occlusion: true })!;
  expect(q.onScreen && q.visible, `보이는 점 ${p}`).toBe(true);
  return { x: q.x, y: q.y };
};
const hoverAt = (w: View, p: readonly number[]): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x + 3, q.y + 2, 0);
  ptr(w, 'pointermove', q.x, q.y, 0);
  w.v.renderNow();
};
const clickAt = (w: View, p: readonly number[]): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x, q.y, 0);
  ptr(w, 'pointerdown', q.x, q.y, 1);
  ptr(w, 'pointerup', q.x, q.y, 0);
  w.v.renderNow();
};
const zoomAround = (w: View, p: readonly number[], r: number): void => {
  const a = w.v.project([p[0]! - r, p[1]! - r, p[2]!])!;
  const b = w.v.project([p[0]! + r, p[1]! + r, p[2]!])!;
  const c = at(w, p);
  const half = Math.max(4, Math.hypot(a.x - b.x, a.y - b.y) / 2);
  w.v.zoomToRect(c.x - half, c.y - half, c.x + half, c.y + half, false);
  w.v.renderNow();
};
/** 테두리 위 점 X에서 원 중심 쪽으로 0.04 들어간 윗면 위 자리(그물 경계를 정확히 가리키지 않게) */
const inside = (X: V3): V3 => {
  const l = Math.hypot(X[0], X[1]);
  return [X[0] - (0.04 * X[0]) / l, X[1] - (0.04 * X[1]) / l, X[2]];
};
/** 앱(app.ts onMeasure)처럼 결과에 찍은 점의 축 위 점 종류를 붙인다 */
function result(v: Viewer3d, m: MeasureResult) {
  const pts = v.measurePoints;
  const tB = m.snapB === 'axis' ? trackMark({ ...pts[1]!, direction: pts[1]!.direction ?? m.directionB }) : false;
  return { ...m, ...(pts[1]?.refined ? { refinedB: true } : {}), ...(tB ? { trackB: tB } : {}) };
}

describe('첫 점 축과 원 모서리의 교차(코어 0.18.0 axisEdges + refine axisEdge)', () => {
  it('이음 꼭짓점의 X·Y축이 윗 테두리와 만나는 맞은편 자리: 원 위(1e-9)·축 위 정확히, "X축 · 모서리 위", 찍은 거리도 그 점까지', () => {
    const w = view();
    const { v } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    for (const axis of ['x', 'y'] as const) {
      v.clearMeasure();
      v.fit(false);
      v.renderNow();
      clickAt(w, SEAM);
      expect(v.measurePointCount).toBe(1);
      const F = v.measurePoints[0]!.point;
      close(F, SEAM, 1e-5);
      // 맞은편 교점: X축이면 (−√(100 − y²), y, 20), Y축이면 (x, −√(100 − x²), 20)
      const X: V3 = axis === 'x' ? [-Math.sqrt(RIM_R ** 2 - F[1] ** 2), F[1], F[2]] : [F[0], -Math.sqrt(RIM_R ** 2 - F[0] ** 2), F[2]];
      zoomAround(w, X, 1.5);
      hoverAt(w, inside(X));
      const h = v.measureHoverSnap!;
      expect(h.snap, axis).toBe('axis');
      expect(h.axis).toBe(axis);
      expect(h.trackFrom).toBeUndefined();
      expect(h.face).toBeUndefined();
      expect(h.segment?.kind).toBe('edge');
      expect(h.refined).toBe(true);
      close(h.point, X);
      expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RIM_R)).toBeLessThan(1e-12);
      // 축 위 정확히(남은 두 좌표가 첫 점과 같다)
      expect(h.point[axis === 'x' ? 1 : 0]).toBe(F[axis === 'x' ? 1 : 0]);
      expect(h.point[2]).toBe(F[2]);
      expect(hoverSnapLabel(h)).toBe(`${axis.toUpperCase()}축 · 모서리 위`);
      clickAt(w, inside(X));
      const m = got[got.length - 1]!;
      expect(m.snapB).toBe('axis');
      expect(m.axisB).toBe(axis);
      expect(Math.abs(m.distance - dist(F, X))).toBeLessThan(1e-9);
      expect(m[axis === 'x' ? 'dy' : 'dx']).toBe(0);
      expect(m.dz).toBe(0);
      expect(v.measurePoints[1]!.refined).toBe(true);
      expect(snapPair(result(v, m))).toEqual(['끝점', `${axis.toUpperCase()}축 · 모서리 위`]);
    }
    expect(got).toHaveLength(2);
  });

  it('곡선 붙잡기를 주지 않으면 같은 후보가 꺾은선(현) 위 점, 두 선택을 끄면 후보가 없다(0.17.0 그대로)', () => {
    for (const [curve, inf] of [
      [false, MEASURE_INFERENCE],
      [true, OFF],
    ] as const) {
      const w = view(curve, inf);
      const { v } = w;
      clickAt(w, SEAM);
      const F = v.measurePoints[0]!.point;
      const X: V3 = [-Math.sqrt(RIM_R ** 2 - F[1] ** 2), F[1], F[2]];
      zoomAround(w, X, 1.5);
      hoverAt(w, inside(X));
      const h = v.measureHoverSnap!;
      expect(h.refined).toBeUndefined();
      if (inf === OFF) {
        expect(h.segment).toBeUndefined();
        expect(hoverSnapLabel(h)).not.toMatch(/모서리 위|면 위/);
        continue;
      }
      expect(h.snap).toBe('axis');
      expect(h.segment).toBeTruthy();
      expect(hoverSnapLabel(h)).toBe('X축 · 모서리 위');
      // 현 위 점이라 원 안쪽(화살 높이만큼)
      expect(RIM_R - Math.hypot(h.point[0], h.point[1])).toBeGreaterThan(1e-4);
    }
  });

  it('첫 점 전에는 두 선택을 켜도 커서 아래 점이 0.17.0 꼴과 같다', () => {
    const on = view();
    const off = view(true, OFF);
    const side: V3 = [RIM_R * Math.cos(-Math.PI / 12), RIM_R * Math.sin(-Math.PI / 12), 12];
    for (const p of [inside([-Math.sqrt(75), 5, RIM_H]), side, [0.3, 0.2, RIM_H] as V3, [22, -4, 10] as V3, inside([RIM_R, 0, RIM_H])]) {
      hoverAt(on, p);
      hoverAt(off, p);
      expect(on.v.measureHoverSnap, `${p}`).toEqual(off.v.measureHoverSnap);
    }
  });

  it('끌어온 축(0.17.0 track)과 테두리의 교차도 원 위로(0.18.0 refine axisEdge): 이음 꼭짓점에 머문 뒤 그 X축 — "끌어온 점에서 X축 · 모서리 위"', () => {
    const w = view();
    const { v } = w;
    hoverAt(w, SEAM);
    vi.advanceTimersByTime(600);
    v.renderNow();
    expect(v.measureTrackPoints).toHaveLength(1);
    const T = v.measureTrackPoints[0]!;
    const X: V3 = [-Math.sqrt(RIM_R ** 2 - T[1] ** 2), T[1], T[2]];
    zoomAround(w, X, 1.5);
    hoverAt(w, inside(X));
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.trackFrom).toBeTruthy();
    expect(h.segment).toBeTruthy();
    expect(h.refined).toBe(true);
    close(h.point, X);
    expect(h.point[1]).toBe(T[1]);
    expect(h.point[2]).toBe(T[2]);
    expect(hoverSnapLabel(h)).toBe('끌어온 점에서 X축 · 모서리 위');
  });
});

describe('축이 면을 뚫는 점(코어 0.18.0 axisFaces)', () => {
  it('삼각 판 꼭짓점의 X축이 원기둥 옆면을 뚫는 점: "X축 · 면 위", 축 위 정확히, 원기둥을 나눈 삼각형 위(곡면에서 화살 높이 안쪽)', () => {
    const w = view();
    const { v } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, TRI);
    const F = v.measurePoints[0]!.point;
    close(F, TRI, 1e-6);
    const X: V3 = [Math.sqrt(RIM_R ** 2 - 16), -4, 10];
    zoomAround(w, X, 1.5);
    // 뚫는 점 둘레 옆면 위(위로 0.05 비켜)
    hoverAt(w, [X[0], X[1], X[2] + 0.05]);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.axis).toBe('x');
    expect(h.face?.id).toBeTruthy();
    expect(h.direction).toEqual([1, 0, 0]);
    expect(h.trackFrom).toBeUndefined();
    expect(h.refined).toBeUndefined();
    expect(h.point[1]).toBe(F[1]);
    expect(h.point[2]).toBe(F[2]);
    // 곡면을 나눈 삼각형 위 점: 원기둥에서 화살 높이(반지름의 1%)보다 가깝고, 원기둥 안쪽이다
    const off = RIM_R - Math.hypot(h.point[0], h.point[1]);
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(0.1);
    expect(dist(h.point, X)).toBeLessThan(0.1);
    expect(hoverSnapLabel(h)).toBe('X축 · 면 위');
    clickAt(w, [X[0], X[1], X[2] + 0.05]);
    const m = got[got.length - 1]!;
    expect(m.snapB).toBe('axis');
    expect(v.measurePoints[1]!.face).toBeTruthy();
    expect(m.dy).toBe(0);
    expect(m.dz).toBe(0);
    expect(snapPair(result(v, m))).toEqual(['끝점', 'X축 · 면 위']);
  });
});
