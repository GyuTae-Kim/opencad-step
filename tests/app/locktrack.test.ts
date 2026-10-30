/**
 * 코어 0.21.0 잠근 선과 끌어온 축의 교차(inference.lockTracks)와 0.23.0 반투명 그물 너머 측정(throughTranslucent)을 실제 코어(가짜 DOM·WebGL2 뷰어)와 함께 본다.
 * - 정육면체(한 변 10) 위 오른쪽 뒤 꼭짓점 F = (10, 10, 10)에서 X축으로 잠그고 끌어온 점을 둔다(빈 곳 — 커서 아래 형상이 없는 자리)
 *   · 끌어온 점 (15, 3, 10)의 Y축과 잠근 X축이 만나는 (15, 10, 10): 잠근 선 위(y·z는 첫 점 그대로), trackOther = { from, axis: 'y' },
 *     "잠근 X축 · 끌어온 점 Y축 위", 찍은 결과도
 *   · 좌표를 함께 쓰지 않는 끌어온 점 (13, 4, 7): 잠근 축 위 나란한 자리 (13, 10, 10), trackFrom, "잠근 X축 · 끌어온 점과 나란히"
 *   · lockTracks를 끄면 0.20.0 그대로(잠근 선 위 커서에 가까운 점, "X축 방향 · 잠금")
 * - 앞의 작은 상자(반투명으로 그린다)와 그 뒤 큰 상자: 반투명 보기 선택(measureSnapOptions의 through)을 주면 측정 점이 뒤 상자 면에 붙고,
 *   주지 않거나 앞 상자가 불투명하면 예전처럼 앞 상자 면
 * 화면 좌표로 가리킬 때는 그물 경계를 정확히 가리키지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d, type MeasureResult } from 'opencad-viewer3d';
import type { Scene3d } from 'opencad-viewer3d/types';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex, stepFaceIndex } from '../../src/app/doc';
import { circleCenters, hoverSnapLabel, lockMeet, MEASURE_INFERENCE, measureSnapOptions, snapPair } from '../../src/app/snap';
import { curveSnap } from '../../src/app/curvesnap';
import { cube, StepText, type P3 } from '../stepText';
import { translate } from '../../site/i18n.mjs';
import { type FakeElement, installDom } from './fakeview';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

type V3 = [number, number, number];
const close = (a: readonly number[] | null | undefined, b: readonly number[], tol = 1e-12): void => {
  expect(a, `점 ${b}`).toBeTruthy();
  for (let k = 0; k < 3; k++) expect(Math.abs(a![k]! - b[k]!), `${a} ≈ ${b}`).toBeLessThan(tol);
};

/** 상자들(이름, 한 변, 놓는 자리) — 상자마다 따로 그물 */
function boxes(list: [string, number, P3][]): Scene3d {
  const w = new StepText();
  const mm = w.context('mm');
  const root = w.product('boxes', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  for (const [name, a, o] of list) w.place(root, w.product(name, [cube(w, a, o, name).solid], mm), w.ax2([0, 0, 0]), `${name}-1`);
  return stepToScene(w.bytes('boxes.stp'));
}

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(s: Scene3d, o: { inference?: object; through?: boolean } = {}): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(s);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  const e = stepEdgeIndex(s);
  v.setMeasureSnap({ ...measureSnapOptions(s.meshes, e, circleCenters(s.meshes, e), curveSnap(s.meshes, e, stepFaceIndex(s), null), !!o.through), inference: o.inference ?? MEASURE_INFERENCE });
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
  ptr(w, 'pointermove', q.x + 3, q.y + 2, 0);
  ptr(w, 'pointermove', q.x + dx, q.y + dy, 0);
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
const clickAt = (w: View, p: readonly number[], dx = 0.37, dy = -0.29): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x + dx, q.y + dy, 0);
  ptr(w, 'pointerdown', q.x + dx, q.y + dy, 1);
  ptr(w, 'pointerup', q.x + dx, q.y + dy, 0);
  w.v.renderNow();
};

describe('잠근 선과 끌어온 축의 교차(코어 0.21.0 lockTracks)', () => {
  const s = boxes([['box', 10, [0, 0, 0]]]);
  const F: V3 = [10, 10, 10];

  it('끌어온 점 (12.5, 3, 10)의 Y축과 잠근 X축이 만나는 점: 잠근 선 위(y·z 첫 점 그대로), "잠근 X축 · 끌어온 점 Y축 위", 결과도', () => {
    const w = view(s);
    const { v } = w;
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, F, 0, 0);
    expect(v.measurePointCount).toBe(1);
    close(v.measurePoints[0]!.point, F);
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    const P: V3 = [12.5, 3, 10];
    expect(v.setMeasureTrackPoints([P])).toBe(1);
    const X: V3 = [12.5, 10, 10];
    hoverAt(w, X);
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.snap).toBe('axis');
    expect(h.axis).toBe('x');
    expect(h.trackOther).toEqual({ from: P, axis: 'y' });
    expect(h.trackFrom).toBeUndefined();
    expect(h.segment).toBeUndefined();
    expect(h.point[1]).toBe(F[1]);
    expect(h.point[2]).toBe(F[2]);
    close(h.point, X);
    expect(lockMeet(h)).toBe('y');
    expect(hoverSnapLabel(h)).toBe('잠근 X축 · 끌어온 점 Y축 위');
    clickAt(w, X);
    const m = got.at(-1)!;
    expect(m.lockedB).toBe(true);
    expect(Math.abs(m.distance - 2.5)).toBeLessThan(1e-12);
    // 앱(app.ts onMeasure)처럼: 결과에는 잠금만 실려 찍은 점의 trackOther로 가른다
    const meet = lockMeet(v.measurePoints[1]);
    expect(meet).toBe('y');
    // 첫 점은 윤곽선 끝점(측정 중 윤곽선도 고른다 — edges)
    expect(snapPair({ ...m, ...(meet ? { lockMeetB: meet } : {}) })).toEqual(['끝점', '잠근 X축 · 끌어온 점 Y축 위']);
  });

  it('좌표를 함께 쓰지 않는 끌어온 점 (13, 4, 7): 잠근 축 위 나란한 자리 (13, 10, 10), trackFrom, "잠근 X축 · 끌어온 점과 나란히"', () => {
    const w = view(s);
    const { v } = w;
    clickAt(w, F, 0, 0);
    v.setMeasureInferenceLock('x');
    const P: V3 = [13, 4, 7];
    v.setMeasureTrackPoints([P]);
    hoverAt(w, [13, 10, 10]);
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.trackFrom).toEqual(P);
    expect(h.trackOther).toBeUndefined();
    close(h.point, [13, 10, 10]);
    expect(lockMeet(h)).toBe('track');
    expect(hoverSnapLabel(h)).toBe('잠근 X축 · 끌어온 점과 나란히');
  });

  it('lockTracks를 끄면 0.20.0 그대로: 잠근 선 위 커서에 가까운 점("X축 방향 · 잠금"), 끌어온 축은 싣지 않는다', () => {
    const w = view(s, { inference: { ...MEASURE_INFERENCE, lockTracks: false } });
    const { v } = w;
    clickAt(w, F, 0, 0);
    v.setMeasureInferenceLock('x');
    v.setMeasureTrackPoints([[12.5, 3, 10]]);
    hoverAt(w, [12.5, 10, 10]);
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.trackOther).toBeUndefined();
    expect(h.trackFrom).toBeUndefined();
    expect(h.point[1]).toBe(F[1]);
    expect(h.point[2]).toBe(F[2]);
    // 커서를 0.37화소 비켰으니 정확히 12.5는 아니다(잠근 선 위 커서에 가까운 점)
    expect(Math.abs(h.point[0] - 12.5)).toBeGreaterThan(1e-6);
    expect(hoverSnapLabel(h)).toBe('X축 방향 · 잠금');
  });

  it('새 글은 4개 언어 사전에 있다(" · " 조각마다)', () => {
    const labels: string[] = [];
    for (const lock of ['X', 'Y', 'Z']) for (const a of ['X', 'Y', 'Z', null]) labels.push(`잠근 ${lock}축 · ${a ? `끌어온 점 ${a}축 위` : '끌어온 점과 나란히'}`);
    labels.push('잠근 방향 · 끌어온 점 Z축 위', '잠근 접선 · 끌어온 점 X축 위');
    for (const code of ['en', 'ja', 'zh-CN', 'de']) for (const l of labels) expect(translate(l, code), `${code}: ${l}`).not.toMatch(/[가-힣]/);
    expect(translate('잠근 X축 · 끌어온 점 Y축 위', 'en')).toBe('Locked X axis · On Y axis of tracked point');
    expect(translate('잠근 Z축 · 끌어온 점과 나란히', 'de')).toBe('Gesperrte Z-Achse · Ausgerichtet am verfolgten Punkt');
  });
});

describe('반투명 그물 너머 측정(코어 0.23.0 throughTranslucent — 앱은 반투명 보기일 때만 준다)', () => {
  // seIso 눈 방향 (1, −1, 1): 앞 상자(한 변 4, 가운데 (2, 2, 2)) 뒤로 그 방향을 거슬러 큰 상자
  const s = boxes([
    ['front', 4, [0, 0, 0]],
    ['back', 10, [-15, 9, -15]],
  ]);
  const front = s.meshes.find((m) => m.name === 'front' || m.id.includes('front')) ?? s.meshes[0]!;
  const back = s.meshes.find((m) => m !== front)!;
  // 앞 상자 윗면(눈에 보이는 면) 위 점
  const T: V3 = [1.3, 2.4, 4];

  it('앞 상자를 반투명으로 그리고 through를 주면 앞 상자 너머 뒤 상자 면에 붙고, 주지 않으면 앞 상자 윗면 그대로', () => {
    for (const through of [false, true]) {
      const w = view(s, { through });
      const { v } = w;
      v.setItemOpacity(front.id, 0.4);
      zoomAround(w, T, 1.5);
      hoverAt(w, T);
      const h = v.measureHoverSnap!;
      expect(h, `${through}`).toBeTruthy();
      if (!through) {
        expect(Math.abs(h.point[2] - 4)).toBeLessThan(1e-4);
        expect(v.pick(at(w, T).x + 0.37, at(w, T).y - 0.29)?.id).toBe(front.id);
      } else {
        // 뒤 상자 면 위(앞 상자 밖)
        expect(h.point[0] < 0 || h.point[1] > 4 || h.point[2] < 0).toBe(true);
        expect(v.pick(at(w, T).x + 0.37, at(w, T).y - 0.29, { throughTranslucent: true })?.id).toBe(back.id);
      }
    }
  });

  it('반투명이 아니면 through를 줘도 앞 상자 그대로(반투명 보기일 때만 차이)', () => {
    const w = view(s, { through: true });
    const { v } = w;
    zoomAround(w, T, 1.5);
    hoverAt(w, T);
    const h = v.measureHoverSnap!;
    expect(Math.abs(h.point[2] - 4)).toBeLessThan(1e-4);
  });
});
