/**
 * 코어 0.27.0 끌어온 점에서 모서리와 나란히·수직(inference.trackDirs)과 0.28.0 기준 선분 거르기(trackDirs { edge }) — 앱 measureSnapOptions가 주는
 * straightEdgeFilter(곧은 B-rep 모서리만)를 실제 코어(가짜 DOM·WebGL2 뷰어에 포인터 사건)와 함께 본다.
 * 장면은 원기둥(반지름 10, 높이 20 — 윗 테두리가 원 모서리)과 그 옆 세로 삼각 판(y = −4, 꼭짓점 (20, −4, 10)·(26, −4, 4)·(26, −4, 16) — 곧은 모서리 셋).
 * - 기운 곧은 모서리 (20, −4, 10)→(26, −4, 4)를 지난 뒤 끌어온 점 P = (20, −4, 24)에서 그 모서리와 나란한 선 위: snap 'parallel'·trackFrom P·edge가 그 모서리,
 *   "끌어온 점에서 모서리와 나란히". P에서 그 모서리 직선으로 내린 수직 위: 'perpendicular', "끌어온 점에서 모서리에 수직"
 * - 그 뒤 원기둥 윗 테두리(원을 나눈 현)를 지나도 기준이 그 곧은 모서리로 남는다. 거르지 않으면(trackDirs: true — 0.27.0) 기준이 현으로 바뀌어 같은 자리에 붙지 않는다
 * - 첫 점을 찍은 뒤 끌어온 점의 나란함으로 찍은 둘째 점: 결과 이름이 "끌어온 점에서 모서리와 나란히"(찍은 점의 trackFrom — 앱 onMeasure처럼)
 * - 잠근 동안(Shift·화살표)에는 보지 않는다(코어 규칙) — 잠근 선 위 점
 * - 코어 0.29.0 첫 점 나란함의 기준 거르기(parallelEdge — 같은 함수): 첫 점의 "모서리와 나란히"도 원기둥 테두리 현을 지난 뒤 기운 곧은 모서리 기준이 남는다
 *   (거르기를 빼면 현이 기준이 된다). 같은 선분은 두 거르기에 한 번만 묻는다
 * 화면 좌표로 가리킬 때는 그물·선의 경계를 정확히 가리키지 않게 조금 비킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureInference, type MeasureResult, type MeasureTrackDirOptions, type TrackDirEdgeFilter } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, isTrackDir, MEASURE_INFERENCE, measureSnapOptions, snapPair, TRACK_PARALLEL_LABEL, TRACK_PERPENDICULAR_LABEL } from '../../src/app/snap';
import { curveSnap } from '../../src/app/curvesnap';
import { straightEdgeFilter } from '../../src/app/trackdir';
import { translate } from '../../site/i18n.mjs';
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

function axisStep(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const cyl = w.product('rim-cylinder', [cylinderRim(w, RIM_R, RIM_H, [c30, s30, 0])], mm);
  const p: P3[] = [TRI, LOW, [26, -4, 16]];
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
const along = (p: V3, d: V3, t: number): V3 => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
/** 기운 곧은 모서리 TRI → LOW의 방향 */
const E: V3 = [Math.SQRT1_2, 0, -Math.SQRT1_2];
/** 끌어온 점(빈 곳) */
const P: V3 = [20, -4, 24];
/** P에서 모서리 직선으로 내린 수직의 방향(발 (13, −4, 17) 쪽) */
const FOOT_DIR: V3 = [-Math.SQRT1_2, 0, -Math.SQRT1_2];
/** 기운 모서리 위 1/3 자리(가운데 점·끝점 붙잡기를 비켜) */
const ON_EDGE = along(TRI, E, Math.hypot(6, 6) / 3);
/** 원기둥 윗 테두리(원 모서리 — 꺾은선 현) 위 자리 */
const ON_RIM: V3 = [RIM_R * Math.cos(-0.7), RIM_R * Math.sin(-0.7), RIM_H];

interface View {
  v: Viewer3d;
  canvas: FakeElement;
  asked: number;
}

/** 'app' = 앱 붙잡기 선택 그대로, true = 거르지 않음(trackDirs: true — 0.27.0), 'noParallelEdge' = 첫 점 나란함 거르기만 뺌(0.28.0) */
function view(trackDirs: 'app' | true | 'noParallelEdge' = 'app'): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  // 앱(app.ts syncMeasureSnap)처럼 뷰어 조각의 거르기를 넘긴다
  const o = measureSnapOptions(scene.meshes, ex, circleCenters(scene.meshes, ex), curveSnap(scene.meshes, ex), false, straightEdgeFilter(ex));
  const w: View = { v, canvas: v.canvas as unknown as FakeElement, asked: 0 };
  const inf = o.inference as MeasureInference;
  const td = inf.trackDirs as MeasureTrackDirOptions & { edge: TrackDirEdgeFilter };
  const edge = td.edge;
  // 첫 점 나란함의 기준 거르기도 같은 함수(코어 0.29.0 parallelEdge — 같은 선분은 한 번만 묻는다)
  expect(inf.parallelEdge).toBe(edge);
  // 앱 거르기를 부른 횟수를 센다(커서가 새 선분을 지날 때만 불린다 — 코어 0.28.0). 감싼 함수도 둘에 같은 것을 준다
  const count: TrackDirEdgeFilter = (s, i) => (w.asked++, edge(s, i));
  const counted: MeasureInference = { ...inf, parallelEdge: count, trackDirs: { ...td, edge: count } };
  v.setMeasureSnap({ ...o, inference: trackDirs === true ? { ...MEASURE_INFERENCE, trackDirs: true } : trackDirs === 'noParallelEdge' ? { ...counted, parallelEdge: null } : counted });
  return w;
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
const clickAt = (w: View, p: readonly number[], dx = 0.37, dy = -0.29): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x + dx, q.y + dy, 0);
  ptr(w, 'pointerdown', q.x + dx, q.y + dy, 1);
  ptr(w, 'pointerup', q.x + dx, q.y + dy, 0);
  w.v.renderNow();
};
/** 기준 선분(h.edge)이 기운 곧은 모서리 TRI–LOW인지(끝점 차례는 상관없다) */
const isTiltedEdge = (e: readonly (readonly number[])[] | undefined): boolean =>
  !!e && ((dist(e[0]!, TRI) < 1e-4 && dist(e[1]!, LOW) < 1e-4) || (dist(e[0]!, LOW) < 1e-4 && dist(e[1]!, TRI) < 1e-4));

describe('끌어온 점에서 곧은 모서리와 나란히·수직(코어 0.27.0 trackDirs + 0.28.0 기준 선분 거르기)', () => {
  it('기운 곧은 모서리를 지난 뒤 끌어온 점에서 그 모서리와 나란한 선 위: "끌어온 점에서 모서리와 나란히", 수직인 선 위: "… 모서리에 수직"', () => {
    const w = view();
    const { v } = w;
    hoverAt(w, ON_EDGE);
    expect(v.measureHoverSnap?.segment?.kind).toBe('edge');
    expect(w.asked).toBe(1);
    // 같은 선분 위를 더 움직여도 다시 묻지 않는다
    hoverAt(w, ON_EDGE, 0.11, 0.07);
    expect(w.asked).toBe(1);
    expect(v.setMeasureTrackPoints([P])).toBe(1);
    const Q = along(P, E, 6);
    hoverAt(w, Q);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toEqual(P);
    expect(h.locked).toBeUndefined();
    expect(h.direction).toBeUndefined();
    expect(isTiltedEdge(h.edge), `기준 ${JSON.stringify(h.edge)}`).toBe(true);
    // 찍을 점은 P를 지나 모서리와 나란한 선 위(커서 광선에 가장 가까운 점)
    const t = (h.point[0] - P[0]) * E[0] + (h.point[1] - P[1]) * E[1] + (h.point[2] - P[2]) * E[2];
    expect(dist(h.point, along(P, E, t))).toBeLessThan(1e-9);
    expect(dist(h.point, Q)).toBeLessThan(0.1);
    expect(isTrackDir(h)).toBe(true);
    expect(hoverSnapLabel(h)).toBe(TRACK_PARALLEL_LABEL);
    expect(translate(hoverSnapLabel(h)!, 'ja')).toBe('追跡点からエッジに平行');
    // 수직: P에서 모서리 직선으로 내린 수직(발 쪽)
    const R = along(P, FOOT_DIR, 3);
    hoverAt(w, R);
    const g = v.measureHoverSnap!;
    expect(g.snap).toBe('perpendicular');
    expect(g.trackFrom).toEqual(P);
    expect(isTiltedEdge(g.edge)).toBe(true);
    const s = (g.point[0] - P[0]) * FOOT_DIR[0] + (g.point[2] - P[2]) * FOOT_DIR[2];
    expect(dist(g.point, along(P, FOOT_DIR, s))).toBeLessThan(1e-9);
    expect(hoverSnapLabel(g)).toBe(TRACK_PERPENDICULAR_LABEL);
    expect(translate(hoverSnapLabel(g)!, 'en')).toBe('Perpendicular to edge from tracked point');
  });

  it('원기둥 윗 테두리(원을 나눈 현)를 지나도 기준은 곧은 모서리 그대로 — 거르지 않으면(trackDirs: true) 현이 기준이 되어 같은 자리에 붙지 않는다', () => {
    const Q = along(P, E, 6);
    const app = view();
    const raw = view(true);
    for (const w of [app, raw]) {
      hoverAt(w, ON_EDGE);
      w.v.setMeasureTrackPoints([P]);
      hoverAt(w, ON_RIM);
      // 커서 아래는 테두리 현 위(윤곽선)
      expect(w.v.measureHoverSnap?.segment?.kind).toBe('edge');
      hoverAt(w, Q);
    }
    // 앱 거르기: 테두리 현은 받지 않아(곧은 모서리가 아니다) 앞 기준이 남는다
    expect(app.asked).toBe(2);
    const h = app.v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(isTiltedEdge(h.edge)).toBe(true);
    expect(hoverSnapLabel(h)).toBe(TRACK_PARALLEL_LABEL);
    // 거르지 않으면 기준이 현으로 바뀌어 P에서 그 현과 나란한 선은 Q를 지나지 않는다
    const r = raw.v.measureHoverSnap;
    expect(isTrackDir(r) && isTiltedEdge(r!.edge)).toBe(false);
    // 다시 곧은 모서리를 지나면 그것이 기준(거르지 않은 쪽도 같다)
    for (const w of [app, raw]) {
      hoverAt(w, ON_EDGE);
      hoverAt(w, Q);
      expect(isTrackDir(w.v.measureHoverSnap)).toBe(true);
      expect(isTiltedEdge(w.v.measureHoverSnap!.edge)).toBe(true);
    }
  });

  it('첫 점을 찍은 뒤 끌어온 점의 나란함으로 둘째 점을 찍으면 결과 이름도 "끌어온 점에서 모서리와 나란히"(찍은 점의 trackFrom), 잠근 동안에는 보지 않는다', () => {
    const w = view();
    const { v } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    // 첫 점: 원기둥 윗면 가운데 둘레(붙잡지 않은 면 위 점 — 첫 점의 축·나란함이 Q에서 멀다)
    clickAt(w, [0.5, 0.3, RIM_H]);
    expect(v.measurePointCount).toBe(1);
    hoverAt(w, ON_EDGE);
    v.setMeasureTrackPoints([P]);
    const Q = along(P, E, 6);
    hoverAt(w, Q);
    expect(v.measureHoverSnap?.snap).toBe('parallel');
    expect(v.measureHoverSnap?.trackFrom).toEqual(P);
    // 잠근 동안(X축): 잠근 선 위 점이 먼저이고 끌어온 점의 나란함·수직은 보지 않는다
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    hoverAt(w, Q, 0.21, -0.13);
    const l = v.measureHoverSnap!;
    expect(l.locked).toBe(true);
    expect(isTrackDir(l)).toBe(false);
    v.setMeasureInferenceLock(false);
    expect(v.measureInferenceLock).toBeNull();
    clickAt(w, Q);
    expect(got).toHaveLength(1);
    const m = got[0]!;
    expect(m.snapB).toBe('parallel');
    const pts = v.measurePoints;
    expect(pts[1]!.trackFrom).toEqual(P);
    // 앱(app.ts onMeasure)처럼: 결과에는 나란함만 실려 찍은 점의 trackFrom으로 가른다
    const tB = isTrackDir(pts[1]);
    expect(tB).toBe(true);
    expect(snapPair({ ...m, ...(tB ? { trackB: tB } : {}) })![1]).toBe(TRACK_PARALLEL_LABEL);
    // 가르지 않으면 첫 점의 나란함 이름이 된다(30차까지)
    expect(snapPair(m)![1]).toBe('모서리와 나란히');
  });

  it('첫 점의 "모서리와 나란히"도 곧은 모서리만 기준(코어 0.29.0 parallelEdge): 테두리 현을 지나도 기운 모서리 기준이 남고, 거르기를 빼면 현이 기준이 된다', () => {
    const app = view();
    const raw = view('noParallelEdge');
    // 첫 점: 원기둥 윗면 가운데 둘레(붙잡지 않은 면 위 점), 가리킬 자리: 첫 점에서 기운 모서리와 나란한 선 위(원기둥 위 빈 곳)
    const F: V3 = [0.5, 0.3, RIM_H];
    for (const w of [app, raw]) {
      clickAt(w, F);
      expect(w.v.measurePointCount).toBe(1);
      const f = w.v.measurePoints[0]!.point;
      hoverAt(w, ON_EDGE);
      hoverAt(w, ON_RIM);
      expect(w.v.measureHoverSnap?.segment?.kind).toBe('edge');
      hoverAt(w, along(f, E, -8));
    }
    const h = app.v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toBeUndefined();
    expect(isTiltedEdge(h.edge), `기준 ${JSON.stringify(h.edge)}`).toBe(true);
    // 첫 점은 윗면 위(가까운 윗 테두리 원 중심에 붙는다)
    const f = app.v.measurePoints[0]!.point as V3;
    expect(f[2]).toBeCloseTo(RIM_H, 6);
    expect(dist(h.point, along(f, E, -8))).toBeLessThan(0.2);
    expect(hoverSnapLabel(h)).toBe('모서리와 나란히');
    // 거르지 않으면(0.28.0) 테두리 현이 기준이 되어 그 자리는 기운 모서리와 나란한 선이 아니다
    const r = raw.v.measureHoverSnap;
    expect(r?.snap === 'parallel' && !r.trackFrom && isTiltedEdge(r.edge)).toBe(false);
    // 같은 함수를 끌어온 점의 기준 거르기에도 줬으므로 선분마다 한 번만 묻는다(기운 모서리·테두리 현)
    expect(app.asked).toBe(2);
    // Shift 잠금도 그 기준 방향
    expect(app.v.setMeasureInferenceLock(true)).toBe(true);
    const l = app.v.measureInferenceLock!;
    expect(l.kind).toBe('parallel');
    expect(Math.abs(l.direction[0] * E[0] + l.direction[1] * E[1] + l.direction[2] * E[2])).toBeGreaterThan(1 - 1e-9);
  });
});
