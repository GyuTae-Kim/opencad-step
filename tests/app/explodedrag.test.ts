// @vitest-environment jsdom
// 분해 손질 끌기 손짓(35차, 가짜 DOM): 옮기기를 켜고 바로 끌기(마우스·손가락), 손가락 길게 눌러 잡기(정밀 조준 모듈의 길게 누르기와 함께),
// 코어 궤도·누르기와 겹치지 않는지, 둘째 손가락·취소·Esc
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAG_START_PX, dragStarted, TOUCH_DRAG_START_PX } from 'opencad-viewer3d/pointer';
import { HOLD_MENU_MS, TouchAim, touchPointerEvent } from '../../src/app/aim';
import { DRAG_PX, ExplodeDrag, relayEvent, TOUCH_DRAG_PX } from '../../src/app/explodedrag';

const RECT = { left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;

/** 코어(Viewer3d) 포인터 처리를 줄인 가짜: 한 포인터는 끌기 문턱(마우스·펜 4, 손가락 10화소)을 넘으면 궤도, 움직이지 않고 떼면 누르기, 두 손가락은 확대·이동 */
function fakeCore(canvas: HTMLElement) {
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { mode: 'orbit' | 'touch'; sx: number; sy: number; type: string; moved: boolean } | null = null;
  const st = { clicks: [] as { x: number; y: number }[], orbits: 0, pinches: 0, cancels: 0, pointers };
  const on = (type: string, fn: (e: PointerEvent) => void): void => canvas.addEventListener(type, fn as EventListener);
  on('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag = pointers.size === 1 ? { mode: 'orbit', sx: e.clientX, sy: e.clientY, type: e.pointerType, moved: false } : { mode: 'touch', sx: 0, sy: 0, type: 'touch', moved: true };
  });
  on('pointermove', (e) => {
    if (!drag || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag.mode === 'touch') {
      st.pinches++;
      return;
    }
    if (!drag.moved && !dragStarted(e.clientX - drag.sx, e.clientY - drag.sy, drag.type)) return;
    drag.moved = true;
    st.orbits++;
  });
  const up = (e: PointerEvent, cancel: boolean): void => {
    if (cancel) st.cancels++;
    const had = pointers.delete(e.pointerId);
    if (!had || !drag) return;
    if (drag.mode === 'orbit' && !cancel && !drag.moved) st.clicks.push({ x: e.clientX, y: e.clientY });
    if (!pointers.size) drag = null;
  };
  on('pointerup', (e) => up(e, false));
  on('pointercancel', (e) => up(e, true));
  return st;
}

describe('분해 손질 끌기 손짓', () => {
  let wrap: HTMLElement;
  let canvas: HTMLCanvasElement;
  let layer: HTMLElement;
  let core: ReturnType<typeof fakeCore>;
  let aim: TouchAim;
  let drag: ExplodeDrag;
  let direct: boolean;
  /** 앱이 누른 자리 부품을 받는지 */
  let accept: boolean;
  let log: string[];

  const fire = (type: string, x: number, y: number, id = 1, pointerType = 'touch'): void => {
    canvas.dispatchEvent(touchPointerEvent(type, id, x, y, pointerType));
  };
  const mouse = (type: string, x: number, y: number): void => fire(type, x, y, 1, 'mouse');

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    wrap = document.createElement('div');
    canvas = document.createElement('canvas');
    wrap.append(canvas);
    layer = document.createElement('div');
    document.body.append(wrap, layer);
    canvas.getBoundingClientRect = () => RECT;
    layer.getBoundingClientRect = () => RECT;
    core = fakeCore(canvas);
    direct = false;
    accept = true;
    log = [];
    // 앱처럼 정밀 조준 모듈을 먼저(뷰어를 만들 때), 끌기 손짓을 그다음(분해 조각을 받을 때) 단다 — 측정 밖이라 길게 누르면 onHold
    aim = new TouchAim(canvas, {
      enabled: () => false,
      layer,
      onHold: (x, y) => drag.grab(x, y) || (log.push(`menu ${x},${y}`), true),
    });
    drag = new ExplodeDrag(canvas, {
      direct: () => direct,
      start: (x, y, type) => (log.push(`start ${x},${y} ${type}`), accept),
      move: (x, y) => log.push(`move ${x},${y}`),
      end: (commit) => log.push(`end ${commit}`),
      tap: (x, y) => log.push(`tap ${x},${y}`),
    });
  });

  afterEach(() => {
    drag.dispose();
    aim.dispose();
    vi.useRealTimers();
  });

  it('문턱·보내는 사건 꼴은 코어·정밀 조준 모듈과 같다', () => {
    expect([DRAG_PX, TOUCH_DRAG_PX]).toEqual([DRAG_START_PX, TOUCH_DRAG_START_PX]);
    for (const type of ['pointerdown', 'pointercancel']) {
      const a = relayEvent(type, 3, 12, 34, 'touch') as PointerEvent;
      const b = touchPointerEvent(type, 3, 12, 34) as PointerEvent;
      expect([a.type, a.pointerId, a.pointerType, a.clientX, a.clientY, a.bubbles, a.cancelable, a.button, a.buttons]).toEqual([b.type, b.pointerId, b.pointerType, b.clientX, b.clientY, b.bubbles, b.cancelable, b.button, b.buttons]);
    }
  });

  it('옮기기를 켜고 부품을 마우스로 끌면: 끌기 문턱을 넘는 사건에서 누른 자리를 묻고, 코어는 그 포인터를 잊어 돌지도 누르지도 않는다', () => {
    direct = true;
    mouse('pointerdown', 100, 120);
    mouse('pointermove', 102, 121);
    expect(log).toEqual([]);
    mouse('pointermove', 106, 121);
    expect(log).toEqual(['start 100,120 mouse', 'move 106,121']);
    expect(core.cancels).toBe(1);
    expect(core.pointers.size).toBe(0);
    mouse('pointermove', 140, 150);
    mouse('pointerup', 140, 150);
    expect(log.slice(2)).toEqual(['move 140,150', 'end true']);
    expect(core.orbits).toBe(0);
    expect(core.clicks).toEqual([]);
    expect(drag.dragging).toBe(false);
  });

  it('빈 곳(앱이 받지 않음)·옮기기를 끈 끌기는 코어가 그대로 돌려 보고, 움직이지 않고 떼면 코어의 누르기(고르기)', () => {
    direct = true;
    accept = false;
    mouse('pointerdown', 100, 120);
    mouse('pointermove', 110, 120);
    mouse('pointermove', 130, 125);
    mouse('pointerup', 130, 125);
    expect(log).toEqual(['start 100,120 mouse']);
    expect(core.orbits).toBe(2);
    accept = true;
    direct = false;
    mouse('pointerdown', 100, 120);
    mouse('pointermove', 130, 125);
    mouse('pointerup', 130, 125);
    expect(log).toHaveLength(1);
    expect(core.orbits).toBe(3);
    direct = true;
    mouse('pointerdown', 50, 60);
    mouse('pointermove', 52, 61);
    mouse('pointerup', 52, 61);
    expect(log).toHaveLength(1);
    expect(core.clicks).toEqual([{ x: 52, y: 61 }]);
  });

  it('마우스 가운데·오른쪽 단추는 끌지 않는다(코어의 이동)', () => {
    direct = true;
    const e = touchPointerEvent('pointerdown', 1, 100, 100, 'mouse');
    Object.defineProperty(e, 'button', { value: 2 });
    canvas.dispatchEvent(e);
    mouse('pointermove', 140, 100);
    expect(log).toEqual([]);
  });

  it('옮기기를 켜고 손가락으로 끌면 손가락 문턱(10화소)에서 — 정밀 조준 모듈의 길게 누르기도 그만둔다', () => {
    direct = true;
    fire('pointerdown', 100, 200);
    fire('pointermove', 106, 203);
    expect(log).toEqual([]);
    fire('pointermove', 111, 200);
    vi.advanceTimersByTime(HOLD_MENU_MS * 2);
    fire('pointermove', 150, 210);
    fire('pointerup', 150, 210);
    expect(log).toEqual(['start 100,200 touch', 'move 111,200', 'move 150,210', 'end true']);
    expect(core.orbits).toBe(0);
    expect(core.clicks).toEqual([]);
  });

  it('손가락으로 길게 누르면(옮기기를 켜지 않아도) 그 부품을 잡고, 손가락 문턱 넘게 끌면 옮긴다 — 코어는 돌지 않는다', () => {
    fire('pointerdown', 100, 200);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    expect(log).toEqual(['start 100,200 touch']);
    expect(drag.dragging).toBe(true);
    // 정밀 조준 모듈이 코어에 보낸 취소는 우리 끌기를 끝내지 않는다
    expect(core.cancels).toBe(1);
    fire('pointermove', 104, 205);
    expect(log).toHaveLength(1);
    fire('pointermove', 130, 240);
    fire('pointerup', 130, 240);
    expect(log.slice(1)).toEqual(['move 130,240', 'end true']);
    expect(core.orbits).toBe(0);
    expect(core.clicks).toEqual([]);
  });

  it('잡은 채 움직이지 않고 떼면 손질 없이 작업 메뉴(tap), 받을 부품이 없으면 예전처럼 길게 누를 때 작업 메뉴', () => {
    fire('pointerdown', 100, 200);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    fire('pointermove', 103, 204);
    fire('pointerup', 103, 204);
    expect(log).toEqual(['start 100,200 touch', 'end false', 'tap 100,200']);
    expect(core.clicks).toEqual([]);
    accept = false;
    log = [];
    fire('pointerdown', 60, 70);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    expect(log).toEqual(['start 60,70 touch', 'menu 60,70']);
    fire('pointerup', 60, 70);
    expect(log).toHaveLength(2);
  });

  it('잡거나 끄는 동안 둘째 손가락이 닿으면 끌기를 취소하고 두 손가락 확대·이동을 코어에 넘긴다(길게 눌러 잡기·바로 끌기 모두)', () => {
    fire('pointerdown', 100, 200);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    fire('pointermove', 130, 230);
    fire('pointerdown', 250, 100, 2);
    expect(log).toEqual(['start 100,200 touch', 'move 130,230', 'end false']);
    expect(core.pointers.size).toBe(2);
    fire('pointermove', 135, 235);
    expect(core.pinches).toBeGreaterThan(0);
    fire('pointerup', 250, 100, 2);
    fire('pointerup', 135, 235);
    expect(log).toHaveLength(3);

    direct = true;
    log = [];
    const pinches = core.pinches;
    fire('pointerdown', 100, 200);
    fire('pointermove', 130, 200);
    fire('pointerdown', 250, 100, 2);
    expect(log).toEqual(['start 100,200 touch', 'move 130,200', 'end false']);
    expect(core.pointers.get(1)).toEqual({ x: 130, y: 200 });
    fire('pointermove', 131, 205);
    expect(core.pinches).toBeGreaterThan(pinches);
    expect(core.orbits).toBe(0);
  });

  it('Esc(cancel)·pointercancel은 끌기를 취소하고, 취소한 포인터는 뗄 때까지 코어에 넘기지 않는다', () => {
    direct = true;
    mouse('pointerdown', 100, 120);
    mouse('pointermove', 120, 120);
    drag.cancel();
    expect(log).toEqual(['start 100,120 mouse', 'move 120,120', 'end false']);
    mouse('pointermove', 160, 130);
    mouse('pointerup', 160, 130);
    expect(log).toHaveLength(3);
    expect(core.orbits).toBe(0);
    expect(core.clicks).toEqual([]);
    log = [];
    fire('pointerdown', 100, 200);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    fire('pointermove', 130, 230);
    fire('pointercancel', 130, 230);
    expect(log).toEqual(['start 100,200 touch', 'move 130,230', 'end false']);
    expect(drag.dragging).toBe(false);
  });
});
