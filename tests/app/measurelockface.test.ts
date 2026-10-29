/**
 * 코어 0.19.0 잠근 선이 모서리·면과 만나는 점(lockEdges·lockFaces)과 축이 면을 뚫는 점 다듬기(refineFace)를 실제 코어(opencad-viewer3d) 판정과 함께 본다
 * (가짜 DOM·WebGL2 뷰어에 포인터 사건).
 * - 원기둥(반지름 10, 높이 20 — 윗 테두리 이음 꼭짓점 30°)과 세로 삼각 판(y = −4, 꼭짓점 (20, −4, 10)) — 0.18.0 시험(measureaxis.test.ts)과 같은 장면
 *   · 이음 꼭짓점에서 X축으로 잠그면 그 축이 맞은편 테두리와 만나는 점: 원 위(1e-9 — refine 'axisEdge'가 잠근 축에도), "잠근 X축 · 모서리 위"
 *   · 판 꼭짓점에서 X축으로 잠그면 그 축이 옆면을 뚫는 점: 원기둥 위(1e-9 — refineFace), "잠근 X축 · 면 위". 잠그지 않은 첫 점 축도 곡면 위
 *   · 축이 아닌 방향으로 잠근 선은 다듬지 않는다(꺾은선 위, "잠근 방향 · 모서리 위")
 *   · 두 선택을 끄면 0.18.0 그대로(잠근 선 위 커서에 가까운 점), 잠그지 않았을 때는 켜도 끈 것과 같다
 * - 위가 B-스플라인 곡면인 지붕 블록과 매단 삼각 판: 판 꼭짓점의 Z축이 지붕을 뚫는 점 — 해석 워커가 남긴 곡면 정의(facesurf.ts — 구조화 복제 뒤 되살림)로 곡면 위
 * - 옆면이 민 곡면(원을 z로)인 원기둥: 판 꼭짓점 X축이 옆면을 뚫는 점이 반지름 위
 * 화면 좌표로 가리킬 때는 그물 경계(테두리)를 정확히 가리키지 않고 면 안쪽으로 조금 비킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult } from 'opencad-viewer3d';
import type { Scene3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepToSceneDeferred } from '../../src/scene';
import { stepEdgeIndex, stepFaceIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, lockMeet, MEASURE_INFERENCE, measureSnapOptions, snapPair, trackMark } from '../../src/app/snap';
import { curveSnap } from '../../src/app/curvesnap';
import type { FaceSurfaceLookup } from '../../src/app/facesnap';
import { packFaceSurfaces, reviveFaceSurfaces } from '../../src/facesurf';
import { StepText, type P3 } from '../stepText';
import { type FakeElement, installDom } from './fakeview';
import { cylinderRim, RIM_H, RIM_R, type V3 } from './curvescene';
import { extrudedCylinder, hangingPlate, roofBlock, roofZ } from './facescene';

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
  return w.bytes('lockface.stp');
}

const scene = stepToScene(axisStep());
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-9): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};
const SEAM: V3 = [RIM_R * c30, RIM_R * s30, RIM_H];
/** 0.18.0 꼴(잠근 선 교차를 끈 것) */
const OFF = Object.freeze({ ...MEASURE_INFERENCE, lockEdges: false, lockFaces: false });

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}

/** faces = 면 표를 곡선 붙잡기에 줄지(refineFace), surfaces = 면 표에 식이 없는 곡면 정의 */
function view(s: Scene3d = scene, o: { faces?: boolean; surfaces?: FaceSurfaceLookup | null; inference?: typeof MEASURE_INFERENCE | typeof OFF } = {}): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(s);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  const e = stepEdgeIndex(s);
  const f = o.faces === false ? null : stepFaceIndex(s);
  v.setMeasureSnap({ ...measureSnapOptions(s.meshes, e, circleCenters(s.meshes, e), curveSnap(s.meshes, e, f, o.surfaces ?? null)), inference: o.inference ?? MEASURE_INFERENCE });
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
const inside = (X: V3): V3 => {
  const l = Math.hypot(X[0], X[1]);
  return [X[0] - (0.04 * X[0]) / l, X[1] - (0.04 * X[1]) / l, X[2]];
};
/** 앱(app.ts onMeasure)처럼 결과에 찍은 점의 축 위 점 종류·잠근 선 교차를 붙인다 */
function result(v: Viewer3d, m: MeasureResult) {
  const pts = v.measurePoints;
  const tB = m.snapB === 'axis' ? trackMark({ ...pts[1]!, direction: pts[1]!.direction ?? m.directionB }) : false;
  const meet = m.lockedB ? lockMeet(pts[1]) : null;
  return { ...m, ...(pts[1]?.refined ? { refinedB: true } : {}), ...(tB ? { trackB: tB } : {}), ...(meet ? { lockMeetB: meet } : {}) };
}

describe('잠근 선과 모서리의 교차(코어 0.19.0 lockEdges)', () => {
  it('이음 꼭짓점에서 X·Y축으로 잠그고 맞은편 테두리를 가리키면: 원 위(1e-9 — 잠근 축에도 refine axisEdge)·축 위 정확히, "잠근 X축 · 모서리 위", 결과도', () => {
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
      expect(v.setMeasureInferenceLock(axis)).toBe(true);
      const X: V3 = axis === 'x' ? [-Math.sqrt(RIM_R ** 2 - F[1] ** 2), F[1], F[2]] : [F[0], -Math.sqrt(RIM_R ** 2 - F[0] ** 2), F[2]];
      zoomAround(w, X, 1.5);
      hoverAt(w, inside(X));
      const h = v.measureHoverSnap!;
      expect(h.locked, axis).toBe(true);
      expect(h.snap).toBe('axis');
      expect(h.axis).toBe(axis);
      expect(h.segment?.kind).toBe('edge');
      expect(h.face).toBeUndefined();
      expect(h.refined).toBe(true);
      close(h.point, X);
      expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RIM_R)).toBeLessThan(1e-12);
      expect(h.point[axis === 'x' ? 1 : 0]).toBe(F[axis === 'x' ? 1 : 0]);
      expect(h.point[2]).toBe(F[2]);
      expect(hoverSnapLabel(h)).toBe(`잠근 ${axis.toUpperCase()}축 · 모서리 위`);
      clickAt(w, inside(X));
      const m = got[got.length - 1]!;
      expect(m.lockedB).toBe(true);
      expect(m.axisB).toBe(axis);
      expect(Math.abs(m.distance - dist(F, X))).toBeLessThan(1e-9);
      expect(snapPair(result(v, m))).toEqual(['끝점', `잠근 ${axis.toUpperCase()}축 · 모서리 위`]);
    }
    expect(got).toHaveLength(2);
  });

  it('축이 아닌 방향(1, 0.3, 0)으로 잠근 선이 테두리와 만나는 점: 꺾은선 위 그대로(다듬지 않음) — "잠근 방향 · 모서리 위"', () => {
    const w = view();
    const { v } = w;
    clickAt(w, SEAM);
    const F = v.measurePoints[0]!.point;
    const l = Math.hypot(1, 0.3);
    const d: V3 = [1 / l, 0.3 / l, 0];
    expect(v.setMeasureInferenceLock({ direction: d, kind: 'parallel' })).toBe(true);
    // F + t d가 원 위인 다른 근: t = −2 F·d(xy)
    const t = -2 * (F[0] * d[0] + F[1] * d[1]);
    const X: V3 = [F[0] + t * d[0], F[1] + t * d[1], F[2]];
    zoomAround(w, X, 1.5);
    hoverAt(w, inside(X));
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.snap).toBe('parallel');
    expect(h.segment).toBeTruthy();
    expect(h.refined).toBeUndefined();
    // 잠근 선 위, 원에서는 현의 화살 높이 안
    const q = [h.point[0] - F[0], h.point[1] - F[1], h.point[2] - F[2]];
    expect(Math.abs(q[0]! * d[1] - q[1]! * d[0])).toBeLessThan(1e-9);
    expect(RIM_R - Math.hypot(h.point[0], h.point[1])).toBeGreaterThan(-1e-9);
    expect(dist(h.point, X)).toBeLessThan(0.1);
    expect(hoverSnapLabel(h)).toBe('잠근 방향 · 모서리 위');
  });

  it('두 선택을 끄면 0.18.0 그대로(잠근 선 위 커서에 가까운 점 — 모서리·면이 실리지 않는다), 잠그지 않았을 때는 켜도 끈 것과 같다', () => {
    const off = view(scene, { inference: OFF });
    clickAt(off, SEAM);
    const F = off.v.measurePoints[0]!.point;
    off.v.setMeasureInferenceLock('x');
    const X: V3 = [-Math.sqrt(RIM_R ** 2 - F[1] ** 2), F[1], F[2]];
    zoomAround(off, X, 1.5);
    hoverAt(off, inside(X));
    const h = off.v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.segment).toBeUndefined();
    expect(h.face).toBeUndefined();
    expect(hoverSnapLabel(h)).toBe('X축 방향 · 잠금');
    // 잠그지 않음: 첫 점 뒤 여러 자리에서 켠 것과 끈 것이 같다(첫 점 축 교차·면 다듬기는 둘 다 켜져 있다)
    const on = view();
    const off2 = view(scene, { inference: OFF });
    for (const w of [on, off2]) clickAt(w, SEAM);
    const side: V3 = [RIM_R * Math.cos(-Math.PI / 12), RIM_R * Math.sin(-Math.PI / 12), 12];
    for (const p of [inside(X), side, [0.3, 0.2, RIM_H] as V3, [22, -4, 10] as V3, inside([RIM_R, 0, RIM_H])]) {
      hoverAt(on, p);
      hoverAt(off2, p);
      expect(on.v.measureHoverSnap, `${p}`).toEqual(off2.v.measureHoverSnap);
    }
  });
});

describe('축이 면을 뚫는 점을 곡면 위로(코어 0.19.0 refineFace·lockFaces)', () => {
  const X: V3 = [Math.sqrt(RIM_R ** 2 - 16), -4, 10];
  it('판 꼭짓점의 X축(잠그지 않은 첫 점 축)이 원기둥 옆면을 뚫는 점: 원기둥 위(1e-9)·축 위 정확히, "X축 · 면 위". 면 표를 주지 않으면 삼각형 위 점', () => {
    for (const faces of [true, false]) {
      const w = view(scene, { faces });
      const { v } = w;
      clickAt(w, TRI);
      const F = v.measurePoints[0]!.point;
      zoomAround(w, X, 1.5);
      hoverAt(w, [X[0], X[1], X[2] + 0.05]);
      const h = v.measureHoverSnap!;
      expect(h.snap).toBe('axis');
      expect(h.face?.id).toBeTruthy();
      expect(h.point[1]).toBe(F[1]);
      expect(h.point[2]).toBe(F[2]);
      expect(hoverSnapLabel(h)).toBe('X축 · 면 위');
      if (faces) {
        expect(h.refined).toBe(true);
        expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RIM_R)).toBeLessThan(1e-9);
        close(h.point, X);
      } else {
        expect(h.refined).toBeUndefined();
        expect(RIM_R - Math.hypot(h.point[0], h.point[1])).toBeGreaterThan(1e-4);
      }
    }
  });

  it('판 꼭짓점에서 X축으로 잠그고 옆면을 가리키면: 잠근 축이 옆면을 뚫는 점 — 원기둥 위(1e-9), "잠근 X축 · 면 위", 결과 거리도 그 점까지', () => {
    const w = view();
    const { v } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, TRI);
    const F = v.measurePoints[0]!.point;
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    zoomAround(w, X, 1.5);
    hoverAt(w, [X[0], X[1], X[2] + 0.05]);
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.face?.id).toBeTruthy();
    expect(h.segment).toBeUndefined();
    expect(h.refined).toBe(true);
    close(h.point, X);
    expect(h.point[1]).toBe(F[1]);
    expect(h.point[2]).toBe(F[2]);
    expect(hoverSnapLabel(h)).toBe('잠근 X축 · 면 위');
    clickAt(w, [X[0], X[1], X[2] + 0.05]);
    const m = got[got.length - 1]!;
    expect(m.lockedB).toBe(true);
    expect(m.dy).toBe(0);
    expect(m.dz).toBe(0);
    expect(Math.abs(m.distance - dist(F, X))).toBeLessThan(1e-9);
    expect(snapPair(result(v, m))).toEqual(['끝점', '잠근 X축 · 면 위']);
  });

  it('지붕(B-스플라인 곡면): 매단 판 꼭짓점의 Z축이 지붕을 뚫는 점 — 워커가 남긴 곡면 정의(복제 뒤 되살림)로 곡면 위(1e-9), 정의가 없으면 삼각형 위', () => {
    const A = 12;
    const B = 8;
    const P: V3 = [4.3, 3.1, 11];
    const w0 = new StepText();
    const mm = w0.context('mm');
    const roof = w0.product('roof', [roofBlock(w0, A, B)], mm);
    const plate = w0.product('plate', [hangingPlate(w0, P)], mm, 'SHAPE_REPRESENTATION');
    const root = w0.product('roof-axis', [w0.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
    w0.place(root, roof, w0.ax2([0, 0, 0]), 'roof-1');
    w0.place(root, plate, w0.ax2([0, 0, 0]), 'plate-1');
    const { scene: s, surfaces } = stepToSceneDeferred(w0.bytes('roof.stp'));
    expect(surfaces).toBeTruthy();
    const look = reviveFaceSurfaces(structuredClone(packFaceSurfaces(surfaces)));
    expect(look).toBeTruthy();
    for (const withDef of [true, false]) {
      const w = view(s, { surfaces: withDef ? look : null });
      const { v } = w;
      clickAt(w, P);
      const F = v.measurePoints[0]!.point;
      close(F, P, 1e-5);
      // 첫 점은 그물 꼭짓점(float32)이라 그 자리의 지붕 높이
      const Z: V3 = [F[0], F[1], roofZ(F[0] / A, F[1] / B)];
      zoomAround(w, Z, 1);
      hoverAt(w, [Z[0] + 0.04, Z[1], roofZ((Z[0] + 0.04) / A, Z[1] / B)]);
      const h = v.measureHoverSnap!;
      expect(h.snap, `${withDef}`).toBe('axis');
      expect(h.axis).toBe('z');
      expect(h.face?.id).toBeTruthy();
      expect(h.point[0]).toBe(F[0]);
      expect(h.point[1]).toBe(F[1]);
      if (withDef) {
        expect(h.refined).toBe(true);
        expect(Math.abs(h.point[2] - Z[2])).toBeLessThan(1e-9);
      } else {
        expect(h.refined).toBeUndefined();
        expect(Math.abs(h.point[2] - Z[2])).toBeLessThan(0.1);
      }
    }
  });

  it('민 곡면(원을 z로 민 옆면) 원기둥: 판 꼭짓점 X축이 옆면을 뚫는 점이 반지름 위(1e-9)', () => {
    const w0 = new StepText();
    const mm = w0.context('mm');
    const cyl = w0.product('xcyl', [extrudedCylinder(w0, RIM_R, RIM_H)], mm);
    const plate = w0.product('plate', [hangingPlate(w0, TRI)], mm, 'SHAPE_REPRESENTATION');
    const root = w0.product('xcyl-axis', [w0.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
    w0.place(root, cyl, w0.ax2([0, 0, 0]), 'xcyl-1');
    w0.place(root, plate, w0.ax2([0, 0, 0]), 'plate-1');
    const { scene: s, surfaces } = stepToSceneDeferred(w0.bytes('xcyl.stp'));
    const look = reviveFaceSurfaces(structuredClone(packFaceSurfaces(surfaces)));
    const w = view(s, { surfaces: look });
    const { v } = w;
    clickAt(w, TRI);
    zoomAround(w, X, 1.5);
    hoverAt(w, [X[0], X[1], X[2] + 0.05]);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.face?.id).toBeTruthy();
    expect(h.refined).toBe(true);
    close(h.point, X);
  });
});
