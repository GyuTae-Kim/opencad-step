/**
 * 두 점 측정 방향 잠금을 실제 코어(opencad-viewer3d 0.12.0 판정 — 0.13.0에서도 같다) 판정으로 본다: STEP 장면(Z축으로 30° 돌린 10 mm 정육면체 — 윗면 모서리가
 * 축과 나란하지 않다)과 앱의 붙잡기 선택(measureSnapOptions — 윤곽선, B-rep 모서리 끝점·가운데 점, 추론, Shift 잠금)을 가짜 DOM·WebGL2 뷰어에 주고
 * 포인터·키 사건을 넣는다. 10차에 앱이 메우던 우회(마지막으로 본 방향으로 잠근 뒤 그 점이 선 위인지 확인)를 걷어 내고 코어가 잠그므로
 * 그 우회가 지키던 경우를 코어로 다시 보고, 첫 점을 지나는 모서리를 따라 가리킨 적 없이 그 끝점·가운데 점에서 바로 Shift를 눌러도 잠그는지 본다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Viewer3d } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { arrowLock, circleCenters, hoverSnapLabel, lockName, measureSnapOptions, viewerLockHint } from '../../src/app/snap';
import { nextFrame } from '../../src/app/dom';
import { AIM_OFFSET_PX, AIM_RETICLE_RADIUS, aimLabelAvoid } from '../../src/app/aim';
import { cube, StepText } from '../stepText';
import { type FakeElement, installDom } from './fakeview';

type V3 = [number, number, number];

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

/** 10 mm 정육면체를 원점 둘레 Z축으로 30° 돌려 놓은 조립 */
function tiltScene() {
  const w = new StepText();
  const mm = w.context('mm');
  const part = w.product('tilt-cube', [cube(w, 10).solid], mm);
  const root = w.product('tilt', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  const a = Math.PI / 6;
  w.place(root, part, w.ax2([0, 0, 0], [0, 0, 1], [Math.cos(a), Math.sin(a), 0]), 'tilt-1');
  return stepToScene(w.bytes());
}

const c = Math.cos(Math.PI / 6);
const s = Math.sin(Math.PI / 6);
/** 윗면 꼭짓점: A(첫 점), 모서리로 이어진 A1·A2, 맞은편 A3. 바닥: A 바로 아래 B0, A1 아래 B1 */
const A: V3 = [0, 0, 10];
const A1: V3 = [10 * c, 10 * s, 10];
const A2: V3 = [-10 * s, 10 * c, 10];
const A3: V3 = [10 * c - 10 * s, 10 * s + 10 * c, 10];
const B0: V3 = [0, 0, 0];
const B1: V3 = [10 * c, 10 * s, 0];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
/** 단위 방향이 e와 같은 직선 방향인지(부호 무관) */
const sameLine = (d: readonly number[] | undefined, e: readonly number[]): boolean => !!d && Math.abs(Math.abs(d[0]! * e[0]! + d[1]! * e[1]! + d[2]! * e[2]!) - 1) < 1e-6;
/** 점 p에서 a를 지나는 단위 방향 e의 직선까지 거리 */
const lineDist = (p: readonly number[], a: readonly number[], e: readonly number[]): number => {
  const t = (p[0]! - a[0]!) * e[0]! + (p[1]! - a[1]!) * e[1]! + (p[2]! - a[2]!) * e[2]!;
  return Math.hypot(p[0]! - a[0]! - e[0]! * t, p[1]! - a[1]! - e[1]! * t, p[2]! - a[2]! - e[2]! * t);
};
const E1: V3 = [c, s, 0];
const E2: V3 = [-s, c, 0];

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}

/** 실제 코어 뷰어에 STEP 장면과 앱의 측정 붙잡기 선택을 주고 남동 등각으로 맞춘다(측정 모드) */
function view(): View {
  const scene = tiltScene();
  const ex = stepEdgeIndex(scene);
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  v.setMeasureSnap(measureSnapOptions(scene.meshes, ex, circleCenters(scene.meshes, ex)));
  return { v, canvas: v.canvas as unknown as FakeElement };
}

const ptr = (w: View, type: string, x: number, y: number, buttons: number, shiftKey: boolean): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const q = w.v.project(p, { occlusion: true })!;
  expect(q.onScreen && q.visible, `보이는 점 ${p}`).toBe(true);
  return { x: q.x, y: q.y };
};
/** 세계 점 자리로 커서를 한 번에 옮기고(그 사이를 지나지 않는다) 그린다 */
const hoverAt = (w: View, p: readonly number[], shift = false): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x, q.y, 0, shift);
  w.v.renderNow();
};
const clickAt = (w: View, p: readonly number[], shift = false): void => {
  const q = at(w, p);
  ptr(w, 'pointermove', q.x, q.y, 0, shift);
  ptr(w, 'pointerdown', q.x, q.y, 1, shift);
  ptr(w, 'pointerup', q.x, q.y, 0, shift);
  w.v.renderNow();
};
const key = (k: string) => ({ key: k, code: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: k === 'Shift', repeat: false, preventDefault() {}, stopPropagation() {} }) as unknown as KeyboardEvent;
/** 앱처럼 창 키를 코어에 넘겨 Shift를 누르고 뗀다 */
const shiftDown = (w: View): void => {
  w.v.handleKey(key('Shift'));
  w.v.renderNow();
};
const shiftUp = (w: View): void => {
  w.v.handleKeyUp(key('Shift'));
  w.v.renderNow();
};
/** 첫 점(윗면 꼭짓점 A)을 찍은 새 뷰어 */
function fromA(): View {
  const w = view();
  clickAt(w, A);
  expect(w.v.measurePointCount).toBe(1);
  expect(dist(w.v.measurePoints[0]!.point, A)).toBeLessThan(1e-4);
  return w;
}

describe('측정 방향 잠금: 실제 코어 0.12.0 판정 + STEP 붙잡기 선택', () => {
  it('첫 점(모서리 끝)에서 따라 가리킨 적 없이 바로 그 모서리 다른 끝: Shift로 그 모서리 방향(모서리와 나란히), 떼면 푼다', () => {
    const w = fromA();
    const { v } = w;
    // 첫 점 뒤 커서를 A1로 한 번에(모서리 몸통을 지나지 않는다)
    hoverAt(w, A1);
    const h = v.measureHoverSnap!;
    expect(['endpoint', 'vertex']).toContain(h.snap);
    expect(h.direction).toBeUndefined();
    const hl = v.measureHoverLock!;
    expect(hl.kind).toBe('parallel');
    expect(sameLine(hl.direction, E1)).toBe(true);
    // 상태 막대: 잠글 방향이 있으니 Shift·화살표 안내
    expect(viewerLockHint(v)).toBe('Shift·화살표로 방향 잠금');
    expect(viewerLockHint(v, true)).toBeNull();
    shiftDown(w);
    const l = v.measureInferenceLock!;
    expect(l.source).toBe('shift');
    expect(lockName(l)).toBe('parallel');
    expect(sameLine(l.direction, E1)).toBe(true);
    expect(viewerLockHint(v)).toBe('모서리와 나란히 잠금');
    expect(hoverSnapLabel(v.measureHoverSnap)).toBe('모서리와 나란히 · 잠금');
    // 잠근 채 바닥 꼭짓점 B1(A1 바로 아래)을 가리키면 잠근 선으로 내린 자리 = A1
    hoverAt(w, B1, true);
    expect(v.measureHoverSnap!.locked).toBe(true);
    expect(dist(v.measureHoverSnap!.point, A1)).toBeLessThan(1e-3);
    shiftUp(w);
    expect(v.measureInferenceLock).toBeNull();
  });

  it('모서리 B-rep 가운데 점(앱 pointsFor)에서 바로 Shift: 그 모서리 방향', () => {
    for (const [far, e] of [
      [A1, E1],
      [A2, E2],
    ] as const) {
      const w = fromA();
      const { v } = w;
      hoverAt(w, lerp(A, far, 0.5));
      expect(v.measureHoverSnap!.snap).toBe('midpoint');
      expect(sameLine(v.measureHoverLock?.direction, e)).toBe(true);
      shiftDown(w);
      expect(lockName(v.measureInferenceLock)).toBe('parallel');
      expect(sameLine(v.measureInferenceLock!.direction, e)).toBe(true);
      shiftUp(w);
    }
  });

  it('세로 모서리 끝(A 바로 아래 B0)에서 바로 Shift: Z축으로 잠그고, 잠근 채 다른 바닥 꼭짓점을 찍으면 첫 점 바로 아래', () => {
    const w = fromA();
    const { v } = w;
    hoverAt(w, B0);
    expect(['endpoint', 'vertex']).toContain(v.measureHoverSnap!.snap);
    expect(v.measureHoverLock).toMatchObject({ kind: 'axis', axis: 'z' });
    shiftDown(w);
    expect(lockName(v.measureInferenceLock)).toBe('z');
    expect(viewerLockHint(v)).toBe('Z축으로 잠금');
    const got: { distance: number; lockedB?: boolean; axisB?: string }[] = [];
    v.onMeasure((m) => m && got.push(m));
    clickAt(w, B1, true);
    expect(got).toHaveLength(1);
    expect(got[0]!.distance).toBeCloseTo(10, 4);
    expect(got[0]!.lockedB).toBe(true);
    expect(got[0]!.axisB).toBe('z');
    // 두 점째에서 풀린다
    expect(v.measureInferenceLock).toBeNull();
    shiftUp(w);
  });

  it('첫 점을 지나지 않는 꼭짓점(맞은편 A3): 잠글 방향이 없어 화살표 안내만, Shift는 엉뚱한 방향으로 잠그지 않는다', () => {
    const w = fromA();
    const { v } = w;
    hoverAt(w, A3);
    expect(['endpoint', 'vertex']).toContain(v.measureHoverSnap!.snap);
    expect(v.measureHoverLock).toBeNull();
    expect(viewerLockHint(v)).toBe('화살표로 축 잠금');
    shiftDown(w);
    expect(v.measureInferenceLock).toBeNull();
    shiftUp(w);
    // 앞서 모서리 방향을 본 뒤라도 Shift는 지금 미리 보기만 본다
    hoverAt(w, A1);
    expect(v.measureHoverLock).not.toBeNull();
    hoverAt(w, A3);
    shiftDown(w);
    expect(v.measureInferenceLock).toBeNull();
    shiftUp(w);
  });

  it('단추·↓(setMeasureInferenceLock(true)): 본 방향이 없으면 실패, 커서가 캔버스를 떠난 뒤면 마지막으로 본 방향', () => {
    const w = fromA();
    const { v } = w;
    hoverAt(w, A3);
    expect(arrowLock('ArrowDown', v.measurePointCount, v.measureInferenceLock)).toBe(true);
    expect(v.setMeasureInferenceLock(true)).toBe(false);
    // 손가락 기기: 모서리 끝을 본 뒤 단추를 누르러 캔버스를 떠난다
    const u = fromA();
    hoverAt(u, A2);
    u.canvas.fire('pointerleave', {});
    u.v.renderNow();
    expect(u.v.measureHoverSnap).toBeNull();
    expect(u.v.setMeasureInferenceLock(true)).toBe(true);
    expect(lockName(u.v.measureInferenceLock)).toBe('parallel');
    expect(sameLine(u.v.measureInferenceLock!.direction, E2)).toBe(true);
    // 커서가 첫 점을 지나지 않는 꼭짓점 위에서도 단추는 마지막으로 본 방향을 잠그고 그 점을 잠근 선으로 내려 잰다(코어 규칙)
    const x = fromA();
    hoverAt(x, A1);
    hoverAt(x, A3);
    expect(x.v.setMeasureInferenceLock(true)).toBe(true);
    x.v.renderNow();
    const h = x.v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(lineDist(h.point, A, E1)).toBeLessThan(1e-6);
  });

  it('방향 추론 위(모서리 몸통 — 모서리와 나란히)면 그 방향, 화살표는 축(같은 키로 풀기)', () => {
    const w = fromA();
    const { v } = w;
    hoverAt(w, lerp(A, A1, 0.3));
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(sameLine(h.direction, E1)).toBe(true);
    expect(v.setMeasureInferenceLock(true)).toBe(true);
    expect(lockName(v.measureInferenceLock)).toBe('parallel');
    const up = arrowLock('ArrowUp', v.measurePointCount, v.measureInferenceLock);
    expect(up).toBe('z');
    expect(v.setMeasureInferenceLock(up as 'z')).toBe(true);
    expect(lockName(v.measureInferenceLock)).toBe('z');
    expect(arrowLock('ArrowUp', v.measurePointCount, v.measureInferenceLock)).toBe(false);
    v.setMeasureInferenceLock(false);
    expect(v.measureInferenceLock).toBeNull();
  });
});

describe('정밀 조준 중 코어 거리 글상자(코어 0.13.0 setMeasureLabelAvoid — aim.ts가 넘기는 자리)', () => {
  type Box = { x: number; y: number; width: number; height: number };
  const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  /** 상자와 원(가운데 c, 반지름 r — 십자선)이 겹치는지 */
  const hitsCircle = (a: Box, c: { x: number; y: number }, r: number): boolean =>
    Math.hypot(Math.max(a.x, Math.min(c.x, a.x + a.width)) - c.x, Math.max(a.y, Math.min(c.y, a.y + a.height)) - c.y) < r;

  it('첫 점 가까이를 조준하면 기본 자리 글상자가 십자선에 걸리지만, 비킬 자리를 주면 십자선·손가락과 겹치지 않고, 끄면 기본 자리', () => {
    const w = fromA();
    const { v } = w;
    // 첫 점에서 화면으로 30화소 떨어진 모서리 위 점에 십자선(캔버스는 화면 (0, 0)에서 시작)
    const a = at(w, A);
    const b = at(w, A1);
    const q = at(w, lerp(A, A1, 30 / Math.hypot(b.x - a.x, b.y - a.y)));
    ptr(w, 'pointermove', q.x, q.y, 0, false);
    w.v.renderNow();
    const base = v.measureLabelRect!;
    expect(base).toBeTruthy();
    expect(hitsCircle(base, q, AIM_RETICLE_RADIUS)).toBe(true);
    const avoid = aimLabelAvoid({ x: q.x, y: q.y + AIM_OFFSET_PX }, { left: 0, top: 0 });
    v.setMeasureLabelAvoid(avoid);
    v.renderNow();
    const moved = v.measureLabelRect!;
    expect(hitsCircle(moved, q, AIM_RETICLE_RADIUS)).toBe(false);
    expect(overlap(moved, avoid.rects[0]!)).toBe(false);
    expect(v.measureLabelAvoid).toMatchObject({ pointerRadius: AIM_RETICLE_RADIUS });
    v.setMeasureLabelAvoid(null);
    v.renderNow();
    expect(v.measureLabelRect).toEqual(base);
  });
});

describe('nextFrame: 커서 아래 점 읽기를 코어 그리기 뒤로', () => {
  it('앞서 잡은 예약은 지우고 다시 잡아, 그사이 코어가 잡은 그리기 뒤에 한 번만 돈다', () => {
    const g = globalThis as Record<string, unknown>;
    const saved = [g.requestAnimationFrame, g.cancelAnimationFrame];
    const queue = new Map<number, FrameRequestCallback>();
    let id = 0;
    g.requestAnimationFrame = (cb: FrameRequestCallback) => (queue.set(++id, cb), id);
    g.cancelAnimationFrame = (n: number) => void queue.delete(n);
    try {
      const order: string[] = [];
      // 앱이 먼저 잡아 둔 읽기(Shift를 뗀 뒤 잠금 안내 고침) → 포인터 이동: 코어가 그리기를 잡고, 앱이 읽기를 다시 잡는다
      let app = nextFrame(0, () => order.push('읽기'));
      requestAnimationFrame(() => order.push('코어 그리기'));
      app = nextFrame(app, () => order.push('읽기'));
      for (const [, cb] of [...queue].sort((a, b) => a[0] - b[0])) cb(0);
      expect(order).toEqual(['코어 그리기', '읽기']);
      expect(app).toBe(3);
    } finally {
      [g.requestAnimationFrame, g.cancelAnimationFrame] = saved;
    }
  });
});
