/**
 * 코어 0.29.0 끌어온 점의 나란함·수직 선이 만나는 점(inference.trackDirs { meets }) — 앱 measureSnapOptions(곧은 모서리 거르기·곡선·곡면 다듬기 그대로)를
 * 실제 코어(가짜 DOM·WebGL2 뷰어에 포인터 사건)와 함께 보고, 만난 것에 따라 가른 이름(뷰어 조각 trackdir.ts trackDirMeetLabel)을 본다.
 * 장면은 원기둥(반지름 10, 높이 20 — 윗 테두리가 원 모서리, 옆면이 원기둥 면)과 그 옆 세로 삼각 판(y = −4, 꼭짓점 (20, −4, 10)·(26, −4, 4)·(26, −4, 16) — 곧은 모서리 셋).
 * - 첫 점 축: 첫 점(윗면 원 중심)을 찍고 기운 모서리 (20, −4, 10)→(26, −4, 4)를 지난 뒤 끌어온 점 P = (−18, 0, 24)에서 그 모서리와 나란한 선이 첫 점 X축과 만나는 (−14, 0, 20).
 *   만나는 점을 켜지 않으면 같은 자리가 첫 점 X축 위 점("X축 방향")이고, 켜면 "끌어온 점에서 모서리와 나란히 · X축 위" — 남은 좌표가 축 값 그대로, Shift가 X축에 잠근다, 결과 이름도
 * - 곧은 모서리: 첫 점 없이 P = (14, −4, 24)에서 그 모서리와 나란한 선이 판의 세로 모서리 x = 26과 만나는 (26, −4, 12) — "… · 모서리 위"
 * - 곡선 모서리: 판의 세로 모서리를 지난 뒤 원기둥 서쪽 윗면 높이의 P에서 그 모서리에 수직인 선(P에서 그 직선으로 내린 수직 — 수평선)이 윗 테두리 원과 만나는 점
 *   (꺾은선 현의 가운데 각 — 꼭짓점 붙잡기를 비켜):
 *   앱 refine('axisEdge' — 축 이름 없는 안내 선)이 원 위 교점으로 다듬는다(현 위 점이 아니다) — "끌어온 점에서 모서리에 수직 · 모서리 위"
 * - 곡면: 판의 다른 기운 모서리 (20, −4, 10)→(26, −4, 16)을 지난 뒤 P = (22, 2, 24)에서 그 모서리와 나란한 선이 원기둥 옆면을 뚫는 점:
 *   앱 refineFace('axisFace')가 원기둥 면 위 교점으로 다듬는다 — "… · 면 위"
 * - 두 끌어온 점의 안내 선끼리(34차 — 코어 0.30.0 meets { guides: true }): 기운 모서리 (20, −4, 10)→(26, −4, 4)를 지난 뒤 판 위 허공의 두 끌어온 점
 *   P = (14, −4, 30)·Q = (3.3, −4, 27.1)에서, P의 나란한 선과 Q의 수직인 선이 만나는 (10.1, −4, 33.9)와 P의 수직인 선과 Q의 나란한 선이 만나는 (7.2, −4, 23.2)
 *   (같은 평면 y = −4의 기운 사각형 구석) — "… · 다른 끌어온 점에서 수직인 선 위"·"… · 다른 끌어온 점에서 나란한 선 위", 잠글 방향이 없고 다듬지 않는다
 * 만나는 점 둘레를 크게 보아(카메라를 당겨) 다른 후보가 붙잡기 거리 밖이게 하고, 화면 좌표로 가리킬 때는 그물·선의 경계를 정확히 가리키지 않게 조금 비킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureInference, type MeasureResult, type MeasureTrackDirOptions } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex, stepFaceIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, isTrackDir, measureSnapOptions, snapPair, TRACK_PARALLEL_LABEL, TRACK_PERPENDICULAR_LABEL } from '../../src/app/snap';
import { curveSnap } from '../../src/app/curvesnap';
import { straightEdgeFilter, trackDirMeet, trackDirMeetLabel, trackDirMeetPlace } from '../../src/app/trackdir';
import { languages, translate } from '../../site/i18n.mjs';
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

const scene = stepToScene(axisStep());
const ex = stepEdgeIndex(scene)!;
const fx = stepFaceIndex(scene);
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const along = (p: readonly number[], d: readonly number[], t: number): V3 => [p[0]! + d[0]! * t, p[1]! + d[1]! * t, p[2]! + d[2]! * t];
const R2 = Math.SQRT1_2;
/** 기운 곧은 모서리 TRI → LOW, TRI → HIGH의 방향 */
const E_LOW: V3 = [R2, 0, -R2];
const E_HIGH: V3 = [R2, 0, R2];

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}

/** meets: true = 앱 그대로(0.30.0 { guides: true }), 'plain' = 0.29.0 만나는 점만(meets: true), false = 만나는 점 없이 */
function view(meets: boolean | 'plain' = true): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  // 앱(app.ts syncMeasureSnap)처럼: 곡선 붙잡기(모서리·면 표)와 뷰어 조각의 곧은 모서리 거르기
  const o = measureSnapOptions(scene.meshes, ex, circleCenters(scene.meshes, ex), curveSnap(scene.meshes, ex, fx), false, straightEdgeFilter(ex));
  const inf = o.inference as MeasureInference;
  const td = inf.trackDirs as MeasureTrackDirOptions;
  expect(td.meets).toEqual({ guides: true });
  v.setMeasureSnap(meets === true ? o : { ...o, inference: { ...inf, trackDirs: { ...td, meets: meets === 'plain' } } });
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
const clickAt = (w: View, p: readonly number[], dx = 0.37, dy = -0.29): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x + dx, q.y + dy, 0);
  ptr(w, 'pointerdown', q.x + dx, q.y + dy, 1);
  ptr(w, 'pointerup', q.x + dx, q.y + dy, 0);
  w.v.renderNow();
};
/** 만나는 점 둘레를 크게 본다(다른 붙잡기 후보가 붙잡기 거리 10화소 밖이게) */
const zoomTo = (w: View, p: readonly number[], k = 0.3): void => {
  const c = w.v.getCamera();
  w.v.setCamera({ ...c, target: [p[0]!, p[1]!, p[2]!], distance: c.distance * k });
  w.v.renderNow();
};
const sameSeg = (e: readonly (readonly number[])[] | undefined, a: V3, b: V3): boolean =>
  !!e && ((dist(e[0]!, a) < 1e-4 && dist(e[1]!, b) < 1e-4) || (dist(e[0]!, b) < 1e-4 && dist(e[1]!, a) < 1e-4));
const hangul = /[가-힣]/;

describe('끌어온 점 나란함·수직 선이 만나는 점(코어 0.29.0 trackDirs { meets })', () => {
  it('첫 점 X축과 만나는 점: 켜지 않으면 첫 점 X축 위 점, 켜면 "끌어온 점에서 모서리와 나란히 · X축 위"(남은 좌표가 축 값 그대로, Shift가 X축에 잠근다)', () => {
    const P: V3 = [-18, 0, 24];
    const on = view();
    const off = view(false);
    for (const w of [on, off]) {
      clickAt(w, [0.5, 0.3, RIM_H]);
      expect(w.v.measurePointCount).toBe(1);
      hoverAt(w, along(TRI, E_LOW, Math.hypot(6, 6) / 3));
      expect(w.v.setMeasureTrackPoints([P])).toBe(1);
    }
    const F = on.v.measurePoints[0]!.point;
    expect(dist(F, [0, 0, RIM_H])).toBeLessThan(1e-6);
    // P에서 기운 모서리와 나란한 선이 첫 점 X축(y = F.y, z = F.z)과 만나는 점
    const M: V3 = [P[0] + (P[2] - F[2]!), F[1]!, F[2]!];
    for (const w of [on, off]) {
      zoomTo(w, M);
      hoverAt(w, M);
    }
    const g = off.v.measureHoverSnap!;
    expect(g.snap).toBe('axis');
    expect(g.trackFrom).toBeUndefined();
    expect(hoverSnapLabel(g)).toBe('X축 방향');
    const h = on.v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toEqual(P);
    expect(h.axis).toBe('x');
    expect(h.direction).toEqual([1, 0, 0]);
    expect(sameSeg(h.edge, TRI, LOW), `기준 ${JSON.stringify(h.edge)}`).toBe(true);
    // 세계 축과 만나면 남은 좌표는 축 값 그대로(셈 오차 없이), 점은 안내 선 위
    expect(h.point[1]).toBe(F[1]);
    expect(h.point[2]).toBe(F[2]);
    expect(dist(h.point, M)).toBeLessThan(1e-9);
    expect(isTrackDir(h)).toBe(true);
    expect(trackDirMeet(h)).toBe('x');
    expect(trackDirMeetLabel(h)).toBe(`${TRACK_PARALLEL_LABEL} · X축 위`);
    expect(translate(trackDirMeetLabel(h)!, 'en')).toBe('Parallel to edge from tracked point · On X axis');
    expect(translate(trackDirMeetLabel(h)!, 'de')).toBe('Parallel zur Kante vom verfolgten Punkt · Auf X-Achse');
    // Shift·잠금 단추: 그 축에 잠근다(코어 measureHoverLock)
    expect(on.v.measureHoverLock?.kind).toBe('axis');
    expect(on.v.measureHoverLock?.axis).toBe('x');
    // 찍으면 결과 이름도(앱 onMeasure처럼 찍은 점에서 이름을 골라 snapPair에 넘긴다)
    const got: MeasureResult[] = [];
    on.v.onMeasure((m) => m && got.push(m));
    clickAt(on, M);
    expect(got).toHaveLength(1);
    const pts = on.v.measurePoints;
    expect(dist(pts[1]!.point, M)).toBeLessThan(1e-9);
    const mB = trackDirMeetLabel(pts[1]);
    expect(mB).toBe(`${TRACK_PARALLEL_LABEL} · X축 위`);
    expect(snapPair({ ...got[0]!, trackB: isTrackDir(pts[1]), ...(mB ? { trackMeetB: mB } : {}) })![1]).toBe(mB);
    expect(got[0]!.distance).toBeCloseTo(14, 9);
  });

  it('곧은 모서리와 만나는 점(첫 점 없이): "끌어온 점에서 모서리와 나란히 · 모서리 위" — 커서가 그 모서리 위여도 기준은 앞 모서리 그대로', () => {
    const P: V3 = [14, -4, 24];
    const w = view();
    hoverAt(w, along(TRI, E_LOW, Math.hypot(6, 6) / 3));
    w.v.setMeasureTrackPoints([P]);
    // P + t·E_LOW가 x = 26과 만나는 점
    const M: V3 = [26, -4, P[2] - (26 - P[0])];
    zoomTo(w, M);
    hoverAt(w, M);
    const h = w.v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toEqual(P);
    expect(h.segment?.kind).toBe('edge');
    expect(sameSeg(h.segment!.ends as V3[], LOW, HIGH), `만난 선분 ${JSON.stringify(h.segment?.ends)}`).toBe(true);
    expect(sameSeg(h.edge, TRI, LOW), `기준 ${JSON.stringify(h.edge)}`).toBe(true);
    expect(dist(h.point, M)).toBeLessThan(1e-5);
    expect(trackDirMeet(h)).toBe('edge');
    expect(trackDirMeetLabel(h)).toBe(`${TRACK_PARALLEL_LABEL} · 모서리 위`);
    expect(translate(trackDirMeetLabel(h)!, 'ja')).toBe('追跡点からエッジに平行 · エッジ上');
  });

  it('곡선 모서리(윗 테두리 원)와 만나는 점: 앱 refine이 원 위 교점으로 다듬는다 — "끌어온 점에서 모서리에 수직 · 모서리 위"', () => {
    // 만나는 점 M: 윗 테두리 꺾은선에서 150° 둘레 현의 가운데 각의 원 위 점(꺾은선 꼭짓점 붙잡기를 비켜). 끌어온 점 P는 판의 세로 모서리 x = 26으로 내린 발
    // F = (26, −4, 20)에서 M을 지나 원 밖으로 — P에서 그 직선으로 내린 수직(윗면 높이의 수평선)이 M에서 원과 만난다
    const angs = new Set<number>();
    for (const m of scene.meshes) {
      const E = m.edges!;
      const o = m.origin ?? [0, 0, 0];
      for (let i = 0; i + 2 < E.length; i += 3) if (Math.abs(E[i + 2]! + o[2]! - RIM_H) < 1e-4) angs.add(Math.atan2(E[i + 1]! + o[1]!, E[i]! + o[0]!));
    }
    const sorted = [...angs].sort((a, b) => a - b);
    const k = sorted.findIndex((a) => a > (150 * Math.PI) / 180);
    expect(k).toBeGreaterThan(0);
    const th = (sorted[k - 1]! + sorted[k]!) / 2;
    const M: V3 = [RIM_R * Math.cos(th), RIM_R * Math.sin(th), RIM_H];
    const F: V3 = [26, -4, RIM_H];
    const P: V3 = along(F, [M[0] - F[0], M[1] - F[1], 0], 1.2);
    const w = view();
    // 판의 세로 모서리 x = 26(가운데 점을 비켜)
    hoverAt(w, [26, -4, 13.3]);
    w.v.setMeasureTrackPoints([P]);
    zoomTo(w, M);
    hoverAt(w, M);
    const h = w.v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.trackFrom).toEqual(P);
    expect(h.segment?.kind).toBe('edge');
    // 현 위 점이 아니라 원 위 교점(앱 다듬기)
    expect(h.refined).toBe(true);
    expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RIM_R)).toBeLessThan(1e-9);
    expect(dist(h.point, M)).toBeLessThan(1e-6);
    expect(sameSeg(h.edge, LOW, HIGH)).toBe(true);
    expect(trackDirMeetLabel(h)).toBe(`${TRACK_PERPENDICULAR_LABEL} · 모서리 위`);
    // 상태 막대·측정 띠는 이 이름을 먼저 쓴다(만나는 점이 아니면 hoverSnapLabel — 30차까지 이름)
    expect(hoverSnapLabel(h)).toBe(TRACK_PERPENDICULAR_LABEL);
  });

  it('곡면(원기둥 옆면)을 뚫는 점: 앱 refineFace가 원기둥 면 위 교점으로 다듬는다 — "끌어온 점에서 모서리와 나란히 · 면 위"', () => {
    const P: V3 = [22, 2, 24];
    const w = view();
    hoverAt(w, along(TRI, E_HIGH, Math.hypot(6, 6) / 3));
    w.v.setMeasureTrackPoints([P]);
    // P − t·E_HIGH가 원기둥 x² + y² = 100을 뚫는 바깥 점(y = 2)
    const x = Math.sqrt(RIM_R * RIM_R - P[1] * P[1]);
    const M: V3 = [x, P[1], P[2] - (P[0] - x)];
    zoomTo(w, M);
    hoverAt(w, M);
    const h = w.v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toEqual(P);
    expect(h.face).toBeDefined();
    expect(h.refined).toBe(true);
    expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RIM_R)).toBeLessThan(1e-9);
    expect(dist(h.point, M)).toBeLessThan(1e-6);
    expect(trackDirMeet(h)).toBe('face');
    expect(trackDirMeetLabel(h)).toBe(`${TRACK_PARALLEL_LABEL} · 면 위`);
    expect(translate(trackDirMeetLabel(h)!, 'zh-CN')).toBe('从追踪点平行于边 · 在面上');
  });

  it('만난 것 가르기·이름(순수): 첫 점 축 > 첫 점의 나란함 > 다른 끌어온 점의 축 > 모서리 > 면, 끌어온 점 안내가 아니면 null, 모든 이름이 네 언어로 옮겨진다', () => {
    const base = { snap: 'parallel' as const, trackFrom: [1, 2, 3] };
    expect(trackDirMeet({ ...base, axis: 'z', direction: [0, 0, 1] })).toBe('z');
    expect(trackDirMeet({ ...base, direction: [0.6, 0.8, 0] })).toBe('parallel');
    expect(trackDirMeet({ ...base, trackOther: { axis: 'y' } })).toBe('track-y');
    expect(trackDirMeet({ ...base, segment: {} })).toBe('edge');
    expect(trackDirMeet({ ...base, face: {} })).toBe('face');
    // 그 선 위 점(0.27.0)·잠근 점·첫 점의 나란함(trackFrom 없음)·축 위 점은 만나는 점이 아니다
    expect(trackDirMeet(base)).toBeNull();
    expect(trackDirMeet({ ...base, locked: true, axis: 'x' })).toBeNull();
    expect(trackDirMeet({ snap: 'parallel', direction: [1, 0, 0], segment: {} })).toBeNull();
    expect(trackDirMeet({ snap: 'axis', axis: 'x', trackFrom: [0, 0, 0], segment: {} })).toBeNull();
    expect(trackDirMeetLabel(null)).toBeNull();
    expect(trackDirMeetLabel({ ...base, snap: 'perpendicular', trackOther: { axis: 'y' } })).toBe(`${TRACK_PERPENDICULAR_LABEL} · 끌어온 점 Y축 위`);
    expect(trackDirMeetLabel({ ...base, direction: [0.6, 0.8, 0] })).toBe(`${TRACK_PARALLEL_LABEL} · 시작점에서 나란한 선 위`);
    const places = (['x', 'y', 'z', 'parallel', 'track-x', 'track-y', 'track-z', 'edge', 'face'] as const).map(trackDirMeetPlace);
    for (const { code } of languages.filter((l) => l.code !== 'ko'))
      for (const snap of [TRACK_PARALLEL_LABEL, TRACK_PERPENDICULAR_LABEL])
        for (const place of places) expect(translate(`${snap} · ${place}`, code), `${code}: ${snap} · ${place}`).not.toMatch(hangul);
    expect(translate(`${TRACK_PERPENDICULAR_LABEL} · 시작점에서 나란한 선 위`, 'en')).toBe('Perpendicular to edge from tracked point · On parallel from start point');
    // 34차: 두 끌어온 점의 안내 선끼리(trackGuide — 다른 만난 것보다 먼저 가른다)
    expect(trackDirMeet({ ...base, trackGuide: { kind: 'perpendicular' } })).toBe('guide-perpendicular');
    expect(trackDirMeet({ ...base, snap: 'perpendicular', trackGuide: { kind: 'parallel' } })).toBe('guide-parallel');
    expect(trackDirMeet({ snap: 'parallel', trackGuide: { kind: 'parallel' } })).toBeNull();
    for (const { code } of languages.filter((l) => l.code !== 'ko'))
      for (const snap of [TRACK_PARALLEL_LABEL, TRACK_PERPENDICULAR_LABEL])
        for (const place of (['guide-parallel', 'guide-perpendicular'] as const).map(trackDirMeetPlace))
          expect(translate(`${snap} · ${place}`, code), `${code}: ${snap} · ${place}`).not.toMatch(hangul);
  });
});

describe('두 끌어온 점의 안내 선끼리 만나는 점(34차 — 코어 0.30.0 trackDirs { meets: { guides: true } })', () => {
  const P: V3 = [14, -4, 30];
  const Q: V3 = [3.3, -4, 27.1];
  // P + a·E_LOW = Q + b·E_HIGH(같은 평면 y = −4): P의 나란한 선과 Q의 수직인 선(Q에서 그 모서리 직선으로 내린 수직 — E_HIGH 방향)
  const M1: V3 = [10.1, -4, 33.9];
  // P의 수직인 선과 Q의 나란한 선
  const M2: V3 = [7.2, -4, 23.2];
  const near = (d: readonly number[] | undefined, e: V3): boolean => !!d && Math.abs(Math.abs(d[0]! * e[0] + d[1]! * e[1] + d[2]! * e[2]) - 1) < 1e-9;
  /**
   * 구석 둘레를 크게, 등각이 아닌 카메라로 본다: 남동 등각에서는 E_HIGH가 보는 방향과 Y축이 이루는 평면 안이라 Q + t·E_HIGH가 Q의 Y축과 화면에서 겹쳐
   * (끌어온 축이 먼저 — 다른 3D 점) 구석을 가리키는지 알 수 없다
   */
  const aim = (w: View, p: V3): void => {
    const c = w.v.getCamera();
    w.v.setCamera({ ...c, target: [...p], distance: c.distance * 0.3, yaw: 0.5, pitch: 0.45 });
    w.v.renderNow();
  };
  const setup = (meets: boolean | 'plain'): View => {
    const w = view(meets);
    // 기준: 기운 곧은 모서리 TRI → LOW(가운데 점을 비켜)
    hoverAt(w, along(TRI, E_LOW, Math.hypot(6, 6) / 3));
    // 앞(더 최근)이 P
    expect(w.v.setMeasureTrackPoints([P, Q])).toBe(2);
    return w;
  };

  it('P의 나란한 선과 Q의 수직인 선이 만나는 구석: 켜면 그 점에 붙고 "끌어온 점에서 모서리와 나란히 · 다른 끌어온 점에서 수직인 선 위", 0.29.0 만나는 점만이면 한 안내 선 위 점', () => {
    const on = setup(true);
    const plain = setup('plain');
    for (const w of [on, plain]) {
      aim(w, M1);
      hoverAt(w, M1, 2.37, -1.29);
    }
    const h = on.v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toEqual(P);
    expect(h.trackGuide?.from).toEqual(Q);
    expect(h.trackGuide?.kind).toBe('perpendicular');
    expect(near(h.trackGuide?.dir, E_HIGH)).toBe(true);
    expect(sameSeg(h.edge, TRI, LOW), `기준 ${JSON.stringify(h.edge)}`).toBe(true);
    // 정확한 직선끼리라 다듬지 않고, 첫 점을 지나는 선이 아니라 잠글 방향이 없다
    expect(h.refined).toBeFalsy();
    expect(h.direction).toBeUndefined();
    expect(h.axis).toBeUndefined();
    expect(dist(h.point, M1)).toBeLessThan(1e-9);
    expect(isTrackDir(h)).toBe(true);
    expect(trackDirMeet(h)).toBe('guide-perpendicular');
    const label = trackDirMeetLabel(h);
    expect(label).toBe(`${TRACK_PARALLEL_LABEL} · 다른 끌어온 점에서 수직인 선 위`);
    expect(translate(label!, 'en')).toBe('Parallel to edge from tracked point · On perpendicular from other tracked point');
    expect(translate(label!, 'ja')).toBe('追跡点からエッジに平行 · 別の追跡点からの垂線上');
    expect(translate(label!, 'zh-CN')).toBe('从追踪点平行于边 · 在另一追踪点的垂线上');
    expect(translate(label!, 'de')).toBe('Parallel zur Kante vom verfolgten Punkt · Auf Senkrechte vom anderen verfolgten Punkt');
    // 0.29.0 만나는 점만(guides 없이)이면 커서 둘레 안내 선 위 점(구석이 아니다) — 이름도 안내 이름 그대로
    const g = plain.v.measureHoverSnap!;
    expect(g.trackGuide).toBeUndefined();
    expect(isTrackDir(g)).toBe(true);
    expect(dist(g.point, M1)).toBeGreaterThan(1e-6);
    expect(trackDirMeetLabel(g)).toBeNull();
  });

  it('P의 수직인 선과 Q의 나란한 선이 만나는 구석을 둘째 점으로 찍으면 결과 이름도 "끌어온 점에서 모서리에 수직 · 다른 끌어온 점에서 나란한 선 위"', () => {
    const w = setup(true);
    // 첫 점: 원기둥 윗면 가운데 둘레(구석들과 먼 자리)
    clickAt(w, [0.5, 0.3, RIM_H]);
    expect(w.v.measurePointCount).toBe(1);
    hoverAt(w, along(TRI, E_LOW, Math.hypot(6, 6) / 3));
    w.v.setMeasureTrackPoints([P, Q]);
    aim(w, M2);
    hoverAt(w, M2, 2.37, -1.29);
    const h = w.v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.trackFrom).toEqual(P);
    expect(h.trackGuide?.kind).toBe('parallel');
    expect(near(h.trackGuide?.dir, E_LOW)).toBe(true);
    expect(dist(h.point, M2)).toBeLessThan(1e-9);
    const got: MeasureResult[] = [];
    w.v.onMeasure((m) => m && got.push(m));
    clickAt(w, M2, 2.37, -1.29);
    expect(got).toHaveLength(1);
    const pts = w.v.measurePoints;
    expect(dist(pts[1]!.point, M2)).toBeLessThan(1e-9);
    expect(pts[1]!.trackGuide?.kind).toBe('parallel');
    const mB = trackDirMeetLabel(pts[1]);
    expect(mB).toBe(`${TRACK_PERPENDICULAR_LABEL} · 다른 끌어온 점에서 나란한 선 위`);
    expect(snapPair({ ...got[0]!, trackB: isTrackDir(pts[1]), ...(mB ? { trackMeetB: mB } : {}) })![1]).toBe(mB);
    expect(got[0]!.distance).toBeCloseTo(dist(pts[0]!.point, M2), 9);
  });
});
