// @vitest-environment jsdom
/**
 * 측정 거리 글상자가 3D 보기 위 앱 요소를 비켜 그리기(app/labelavoid.ts — 코어 0.13.0 setMeasureLabelAvoid의 rects).
 * - 요소 상자 → 캔버스 기준 사각형(숨긴 요소는 뺀다), 정밀 조준 자리와 합치기
 * - 3D 보기의 측정 띠·위 띠·단면 막대·코어 뷰 큐브만 고르고(알림·다른 곳의 띠는 빼고), 크기가 바뀌면 다시 알린다
 * - 코어 자리 고르기(placeMeasureLabel)에 넘기면: 휴대폰(375×700 캔버스)에서 띠·큐브 밑으로 들어가던 글상자가 비키고,
 *   겹치지 않던 자리는 그대로다(헤드리스에서 잰 띠·큐브·글상자 크기)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MeasureLabelAvoid, MeasureLabelRect } from 'opencad-viewer3d';
import { placeMeasureLabel, rectsOverlap } from 'opencad-viewer3d/measurelabel';
import { LABEL_AVOID_SELECTOR, LabelAvoid, mergeLabelAvoid, overlayRects } from '../../src/app/labelavoid';
import { aimLabelAvoid } from '../../src/app/aim';

const box = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) }) as DOMRect;

describe('글상자가 비킬 화면 사각형', () => {
  it('요소 상자를 캔버스 왼쪽 위 기준으로, 크기가 0인 것(숨긴 요소)·캔버스와 겹치지 않는 것은 뺀다', () => {
    const c = box(10, 86, 375, 700);
    const r = overlayRects(c, [box(20, 664, 355, 112), box(0, 0, 0, 0), box(301, 94, 76, 76), box(50, 50, 120, 0), box(10, 20, 300, 40)]);
    expect(r).toEqual([
      { x: 10, y: 578, width: 355, height: 112 },
      { x: 291, y: 8, width: 76, height: 76 },
    ]);
  });

  it('바깥쪽으로 정수에 맞추고(왼쪽·위 내림, 오른쪽·아래 올림) 캔버스 밖은 잘라 낸다', () => {
    const c = box(0, 86, 375, 700);
    expect(overlayRects(c, [box(9.703125, 664.015625, 355.59375, 111.984375)])).toEqual([{ x: 9, y: 578, width: 357, height: 112 }]);
    // 캔버스 아래로 넘친 알림 상자·왼쪽 위로 걸친 상자
    expect(overlayRects(c, [box(100, 740, 50, 80), box(-5, 80, 30, 20)])).toEqual([
      { x: 100, y: 654, width: 50, height: 46 },
      { x: 0, y: 0, width: 25, height: 14 },
    ]);
  });

  it('정밀 조준 자리와 합치기: 둘 다 없으면 null, 조준이 있으면 커서 둘레 반지름도', () => {
    const ui: MeasureLabelRect[] = [{ x: 10, y: 578, width: 355, height: 112 }];
    expect(mergeLabelAvoid([], null)).toBeNull();
    expect(mergeLabelAvoid(ui, null)).toEqual({ rects: ui });
    const aim = aimLabelAvoid({ x: 200, y: 300 }, { left: 0, top: 86 });
    expect(mergeLabelAvoid([], aim)).toEqual({ rects: aim.rects, pointerRadius: aim.pointerRadius });
    expect(mergeLabelAvoid(ui, aim)).toEqual({ rects: [...ui, ...aim.rects], pointerRadius: aim.pointerRadius });
  });
});

describe('LabelAvoid(3D 보기 요소를 지켜보다 코어에 알리기)', () => {
  let observers: { cb: () => void; els: Element[] }[] = [];
  const saved = globalThis.ResizeObserver;
  beforeEach(() => {
    observers = [];
    globalThis.ResizeObserver = class {
      readonly rec: { cb: () => void; els: Element[] };
      constructor(cb: () => void) {
        this.rec = { cb, els: [] };
        observers.push(this.rec);
      }
      observe(e: Element): void {
        this.rec.els.push(e);
      }
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = saved;
  });

  /** 앱 3D 보기 꼴: 코어 호스트(캔버스·뷰 큐브), 측정 띠·위 띠·단면 막대·알림 */
  function viewDom() {
    const view = document.createElement('section');
    view.className = 'view';
    const host = document.createElement('div');
    const wrap = document.createElement('div');
    const canvas = document.createElement('canvas');
    const cube = document.createElement('canvas');
    cube.className = 'v3d-cube';
    wrap.append(canvas, cube);
    host.append(wrap);
    const mk = (cls: string): HTMLElement => {
      const e = document.createElement('div');
      e.className = cls;
      return e;
    };
    const section = mk('section-bar');
    const top = mk('top-bars');
    const bar = mk('measure-bar');
    const toasts = mk('toasts');
    // 3D 보기 밖이 아닌 안쪽 깊은 곳의 같은 이름(측정 띠 안 요소 등)은 고르지 않는다
    bar.append(mk('measure-bar'));
    view.append(host, section, top, bar, toasts);
    const rects = new Map<Element, DOMRect>([
      [canvas, box(0, 86, 375, 700)],
      [cube, box(291, 94, 76, 76)],
      [section, box(0, 0, 0, 0)],
      [top, box(0, 0, 0, 0)],
      [bar, box(9.7, 664, 355.6, 112)],
      [toasts, box(12, 552, 351, 40)],
      [bar.firstElementChild!, box(20, 670, 30, 30)],
    ]);
    for (const e of rects.keys()) e.getBoundingClientRect = () => rects.get(e)!;
    const calls: (MeasureLabelAvoid | null)[] = [];
    const viewer = { canvas, setMeasureLabelAvoid: (a: MeasureLabelAvoid | readonly MeasureLabelRect[] | null) => void calls.push(a as MeasureLabelAvoid | null) };
    return { view, canvas, cube, section, bar, toasts, rects, calls, viewer };
  }

  it('측정 띠·위 띠·단면 막대·뷰 큐브만 지켜보고(알림 빼고), 만들 때 바로 알린다', () => {
    const d = viewDom();
    expect([...d.view.querySelectorAll(LABEL_AVOID_SELECTOR)].map((e) => e.className)).toEqual(['v3d-cube', 'section-bar', 'top-bars', 'measure-bar']);
    new LabelAvoid(d.viewer, d.view);
    expect(observers).toHaveLength(1);
    expect(observers[0]!.els).toContain(d.canvas);
    expect(observers[0]!.els).toContain(d.bar);
    expect(observers[0]!.els).not.toContain(d.toasts);
    expect(d.calls.at(-1)).toEqual({
      rects: [
        { x: 291, y: 8, width: 76, height: 76 },
        { x: 9, y: 578, width: 357, height: 112 },
      ],
    });
  });

  it('크기가 바뀌면(띠를 숨김·단면 막대가 나타남) 다시 알리고, 정밀 조준 자리와 합친다', () => {
    const d = viewDom();
    const la = new LabelAvoid(d.viewer, d.view);
    d.rects.set(d.bar, box(0, 0, 0, 0));
    d.rects.set(d.section, box(10, 96, 200, 36));
    observers[0]!.cb();
    expect(d.calls.at(-1)).toEqual({
      rects: [
        { x: 291, y: 8, width: 76, height: 76 },
        { x: 10, y: 10, width: 200, height: 36 },
      ],
    });
    const aim = aimLabelAvoid({ x: 180, y: 400 }, { left: 0, top: 86 });
    la.aim(aim);
    expect(d.calls.at(-1)).toEqual({ rects: [{ x: 291, y: 8, width: 76, height: 76 }, { x: 10, y: 10, width: 200, height: 36 }, ...aim.rects], pointerRadius: aim.pointerRadius });
    la.aim(null);
    expect(d.calls.at(-1)).not.toHaveProperty('pointerRadius');
    // 뷰 큐브를 끄고 단면 막대도 닫으면 끈다(null — 코어 기본 자리)
    d.rects.set(d.cube, box(0, 0, 0, 0));
    d.rects.set(d.section, box(0, 0, 0, 0));
    la.update();
    expect(d.calls.at(-1)).toBeNull();
  });

  it('ResizeObserver가 없는 브라우저에서도 만들 때 한 번 알린다', () => {
    globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver;
    const d = viewDom();
    new LabelAvoid(d.viewer, d.view);
    expect(d.calls).toHaveLength(1);
  });
});

describe('코어 자리 고르기에 넘기면(휴대폰 375×700 캔버스 — 헤드리스에서 잰 띠·큐브·글상자 크기)', () => {
  const view = { width: 375, height: 700 };
  const size = { width: 99.5, height: 40 };
  const bar = { x: 9.7, y: 578, width: 355.6, height: 112 };
  const cube = { x: 291, y: 8, width: 76, height: 76 };
  const avoid = { rects: [cube, bar] };
  const inView = (r: MeasureLabelRect): boolean => r.x >= 0 && r.y >= 0 && r.x + r.width <= view.width && r.y + r.height <= view.height;

  it('두 점 가운데가 띠 높이(띠 위 30화소·캔버스 아래 끝)거나 위 오른쪽(큐브 옆)이면 글상자가 띠·큐브를 비킨다', () => {
    for (const [at, seg] of [
      [[168.75, 608], [[140, 590], [197.5, 626]]],
      [[225, 688], [[200, 670], [250, 706]]],
      [[206.25, 70], [[180, 52], [232.5, 88]]],
    ] as [number[], [number[], number[]]][]) {
      const before = placeMeasureLabel(at, size, view, null, seg);
      expect(rectsOverlap(before, bar) || rectsOverlap(before, cube), `기본 자리가 가린다 ${at}`).toBe(true);
      const after = placeMeasureLabel(at, size, view, avoid, seg);
      expect(rectsOverlap(after, bar) || rectsOverlap(after, cube), `비킨 자리 ${JSON.stringify(after)}`).toBe(false);
      expect(inView(after)).toBe(true);
    }
  });

  it('겹치지 않던 자리(화면 가운데·위 왼쪽)는 그대로', () => {
    for (const at of [
      [150, 315],
      [112.5, 40],
    ]) {
      expect(placeMeasureLabel(at, size, view, avoid, null)).toEqual(placeMeasureLabel(at, size, view, null, null));
    }
  });
});
