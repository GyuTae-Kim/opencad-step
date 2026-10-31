// @vitest-environment jsdom
// 분해 손질 끌기 손짓(36차 — 코어 0.32.0 포인터 맡기 훅, jsdom에 실제 코어 Viewer3d): 옮기기를 켜고 바로 끌기(마우스·손가락 — 코어가 끌기 시작에서 묻는다),
// 손가락 길게 눌러 잡기(정밀 조준 모듈의 길게 누르기와 함께), 코어 궤도·이동·누르기와 겹치지 않는지, 둘째 손가락(코어가 돌려받아 핀치)·다른 포인터·취소·Esc,
// 측정 중 정밀 조준이 그대로인지(처리기는 그 모듈이 보내는 합성 누르기에도 묻는다 — 맡지 않는다).
// 누르는 자리는 상자 면 안쪽(경계·구석을 정확히 가리키지 않는다)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PointerClaimHandler, PointerClaimQuery, Viewer3d } from 'opencad-viewer3d';
import { TOUCH_DRAG_START_PX } from 'opencad-viewer3d/pointer';
import { boxMesh } from 'opencad-viewer3d/synth';
import { AIM_HOLD_MS, HOLD_MENU_MS, TouchAim, touchPointerEvent } from '../../src/app/aim';
import { ExplodeDrag, TOUCH_DRAG_PX } from '../../src/app/explodedrag';
import { jsdomViewer } from './jsdomview';

describe('분해 손질 끌기 손짓(코어 포인터 맡기 훅)', () => {
  let env: ReturnType<typeof jsdomViewer>;
  let v: Viewer3d;
  let canvas: HTMLCanvasElement;
  let layer: HTMLElement;
  let aim: TouchAim;
  let drag: ExplodeDrag;
  let direct: boolean;
  /** 앱이 누른 자리 부품을 받는지 */
  let accept: boolean;
  /** 측정 중(정밀 조준을 받을 때) */
  let measuring: boolean;
  let log: string[];
  let picks: number;
  /** 코어가 처리기에 물은 것(단계·포인터·종류·누른 포인터 수) */
  let asked: string[];

  const fire = (type: string, x: number, y: number, id = 1, pointerType = 'touch'): void => {
    canvas.dispatchEvent(touchPointerEvent(type, id, x, y, pointerType));
  };
  const mouse = (type: string, x: number, y: number, id = 1): void => fire(type, x, y, id, 'mouse');
  const cam = () => JSON.stringify(v.getCamera());

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    document.body.innerHTML = '';
    env = jsdomViewer();
    v = env.viewer;
    v.setScene({ name: 'drag', meshes: [boxMesh('box', [-10, -10, -10], [10, 10, 10], [0.7, 0.7, 0.7, 1])], lines: [], units: 'mm' });
    v.setView('front', false);
    v.fit(false);
    v.renderNow();
    canvas = v.canvas;
    layer = document.createElement('div');
    document.body.append(layer);
    direct = false;
    accept = true;
    measuring = false;
    log = [];
    picks = 0;
    asked = [];
    v.onPick(() => void picks++);
    // 처리기가 받는 물음을 적어 둔다(ExplodeDrag가 다는 처리기를 감싼다)
    const set = v.setPointerClaim.bind(v);
    v.setPointerClaim = (h) => {
      if (!h || typeof h === 'function') return set(h);
      const inner: PointerClaimHandler = h;
      set({
        claim: (q: PointerClaimQuery) => {
          const r = inner.claim(q);
          asked.push(`${q.phase} ${q.pointerId} ${q.pointerType} ${q.pointers}${r ? ' claim' : ''}`);
          return r;
        },
        move: (p) => inner.move?.(p),
        end: (p, why) => inner.end?.(p, why),
      });
    };
    // 앱처럼 정밀 조준 모듈을 먼저(뷰어를 만들 때), 끌기 손짓을 그다음(분해 조각을 받을 때) 단다 — 측정 밖이면 길게 누를 때 onHold
    aim = new TouchAim(canvas, {
      enabled: () => measuring,
      layer,
      onHold: (x, y, id) => drag.grab(x, y, id) || (log.push(`menu ${x},${y}`), true),
    });
    drag = new ExplodeDrag(v, {
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
    env.restore();
    vi.useRealTimers();
  });

  it('손가락 끌기 문턱은 코어와 같다', () => {
    expect(TOUCH_DRAG_PX).toBe(TOUCH_DRAG_START_PX);
  });

  it('옮기기를 켜고 부품을 마우스로 끌면: 끌기 시작 거리를 넘는 순간 코어가 묻고 앱이 맡아, 코어는 돌지도 고르지도 않는다', () => {
    direct = true;
    const c0 = cam();
    mouse('pointerdown', 400.3, 300.7);
    mouse('pointermove', 402.3, 301.7);
    expect(log).toEqual([]);
    mouse('pointermove', 406.3, 301.7);
    expect(log).toEqual(['start 400.3,300.7 mouse', 'move 406.3,301.7']);
    expect(asked).toEqual(['down 1 mouse 1', 'drag 1 mouse 1 claim']);
    expect(v.heldPointers).toEqual([1]);
    expect(drag.dragging).toBe(true);
    mouse('pointermove', 440.3, 330.7);
    mouse('pointerup', 440.3, 330.7);
    expect(log.slice(2)).toEqual(['move 440.3,330.7', 'end true']);
    expect(cam()).toBe(c0);
    expect(picks).toBe(0);
    expect(v.heldPointers).toEqual([]);
    expect(drag.dragging).toBe(false);
    // 그다음 끌기(옮기기를 끔)는 코어가 그대로 돌린다
    direct = false;
    mouse('pointerdown', 400.3, 300.7);
    mouse('pointermove', 440.3, 320.7);
    mouse('pointerup', 440.3, 320.7);
    expect(cam()).not.toBe(c0);
  });

  it('빈 곳(앱이 받지 않음)·옮기기를 끈 끌기는 코어가 돌려 보고, 움직이지 않고 떼면 코어의 누르기(고르기)', () => {
    direct = true;
    accept = false;
    let c = cam();
    mouse('pointerdown', 400.3, 300.7);
    mouse('pointermove', 410.3, 300.7);
    mouse('pointermove', 430.3, 305.7);
    mouse('pointerup', 430.3, 305.7);
    expect(log).toEqual(['start 400.3,300.7 mouse']);
    expect(cam()).not.toBe(c);
    c = cam();
    accept = true;
    direct = false;
    mouse('pointerdown', 400.3, 300.7);
    mouse('pointermove', 430.3, 305.7);
    mouse('pointerup', 430.3, 305.7);
    expect(log).toHaveLength(1);
    expect(cam()).not.toBe(c);
    c = cam();
    direct = true;
    mouse('pointerdown', 380.3, 290.7);
    mouse('pointermove', 382.3, 291.7);
    mouse('pointerup', 382.3, 291.7);
    expect(log).toHaveLength(1);
    expect(picks).toBe(1);
    expect(cam()).toBe(c);
  });

  it('마우스 오른쪽 단추 끌기는 맡지 않는다(코어의 이동)', () => {
    direct = true;
    const t0 = v.getCamera().target;
    const e = touchPointerEvent('pointerdown', 1, 400.3, 300.7, 'mouse');
    Object.defineProperty(e, 'button', { value: 2 });
    canvas.dispatchEvent(e);
    mouse('pointermove', 440.3, 300.7);
    mouse('pointerup', 440.3, 300.7);
    expect(log).toEqual([]);
    expect(v.getCamera().target).not.toEqual(t0);
  });

  it('옮기기를 켜고 손가락으로 끌면 손가락 문턱(10화소)에서 맡는다 — 정밀 조준 모듈의 길게 누르기도 그만둔다', () => {
    direct = true;
    const c0 = cam();
    fire('pointerdown', 400.3, 300.7);
    fire('pointermove', 406.3, 303.7);
    expect(log).toEqual([]);
    fire('pointermove', 411.3, 300.7);
    vi.advanceTimersByTime(HOLD_MENU_MS * 2);
    fire('pointermove', 450.3, 310.7);
    fire('pointerup', 450.3, 310.7);
    expect(log).toEqual(['start 400.3,300.7 touch', 'move 411.3,300.7', 'move 450.3,310.7', 'end true']);
    expect(cam()).toBe(c0);
    expect(picks).toBe(0);
  });

  it('손가락으로 길게 누르면(옮기기를 켜지 않아도) 그 부품을 잡고, 손가락 문턱 넘게 끌면 옮긴다 — 코어는 돌지 않는다', () => {
    const c0 = cam();
    fire('pointerdown', 400.3, 300.7);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    expect(log).toEqual(['start 400.3,300.7 touch']);
    expect(drag.dragging).toBe(true);
    // 정밀 조준 모듈이 코어에 보낸 취소는 우리 끌기를 끝내지 않고, 코어도 그 손가락을 맡기지 않았다
    expect(v.heldPointers).toEqual([]);
    fire('pointermove', 404.3, 305.7);
    expect(log).toHaveLength(1);
    fire('pointermove', 430.3, 340.7);
    fire('pointerup', 430.3, 340.7);
    expect(log.slice(1)).toEqual(['move 430.3,340.7', 'end true']);
    expect(cam()).toBe(c0);
    expect(picks).toBe(0);
    // 잡은 동안만 들었다 — 다음 손가락 끌기는 코어의 궤도(손가락은 문턱을 넘은 자리부터 돌린다)
    fire('pointerdown', 400.3, 300.7);
    fire('pointermove', 420.3, 300.7);
    fire('pointermove', 460.3, 310.7);
    fire('pointerup', 460.3, 310.7);
    expect(log).toHaveLength(3);
    expect(cam()).not.toBe(c0);
  });

  it('잡은 채 움직이지 않고 떼면 손질 없이 작업 메뉴(tap — 화면 좌표), 받을 부품이 없으면 예전처럼 길게 누를 때 작업 메뉴', () => {
    fire('pointerdown', 400.3, 300.7);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    fire('pointermove', 403.3, 304.7);
    fire('pointerup', 403.3, 304.7);
    expect(log).toEqual(['start 400.3,300.7 touch', 'end false', 'tap 400.3,300.7']);
    expect(picks).toBe(0);
    accept = false;
    log = [];
    fire('pointerdown', 360.3, 270.7);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    expect(log).toEqual(['start 360.3,270.7 touch', 'menu 360.3,270.7']);
    fire('pointerup', 360.3, 270.7);
    expect(log).toHaveLength(2);
    expect(picks).toBe(0);
  });

  it('길게 눌러 잡고 끄는 동안 둘째 손가락이 닿으면 끌기를 취소하고, 코어가 두 손가락 확대·이동을 한다', () => {
    const c0 = cam();
    fire('pointerdown', 400.3, 300.7);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    fire('pointermove', 430.3, 330.7);
    fire('pointerdown', 550.3, 200.7, 2);
    expect(log).toEqual(['start 400.3,300.7 touch', 'move 430.3,330.7', 'end false']);
    // 정밀 조준 모듈이 첫 손가락을 다시 알린 누르기와 둘째 손가락 — 둘 다 맡지 않는다
    expect(asked.slice(-2)).toEqual(['down 1 touch 1', 'down 2 touch 2']);
    expect(cam()).toBe(c0);
    fire('pointermove', 440.3, 345.7);
    fire('pointermove', 560.3, 180.7, 2);
    expect(cam()).not.toBe(c0);
    fire('pointerup', 560.3, 180.7, 2);
    fire('pointerup', 440.3, 345.7);
    expect(log).toHaveLength(3);
    expect(drag.dragging).toBe(false);
  });

  it('옮기기를 켜고 손가락으로 끄는 동안 둘째 손가락이 닿으면 코어가 첫 손가락을 돌려받아(핀치) 끌기는 앞 자리로', () => {
    direct = true;
    const c0 = cam();
    fire('pointerdown', 400.3, 300.7);
    fire('pointermove', 430.3, 300.7);
    expect(v.heldPointers).toEqual([1]);
    fire('pointerdown', 550.3, 200.7, 2);
    expect(log).toEqual(['start 400.3,300.7 touch', 'move 430.3,300.7', 'end false']);
    expect(v.heldPointers).toEqual([]);
    expect(cam()).toBe(c0);
    // 돌려받은 자리(430.3, 300.7)에서 두 손가락: 벌리면 확대
    fire('pointermove', 420.3, 310.7);
    fire('pointermove', 570.3, 180.7, 2);
    expect(cam()).not.toBe(c0);
    fire('pointerup', 570.3, 180.7, 2);
    fire('pointerup', 420.3, 310.7);
    expect(log).toHaveLength(3);
  });

  it('마우스로 끄는 동안 다른 포인터(손가락)가 누르면 끌기를 취소하고, 마우스는 뗄 때까지 코어에 넘기지 않는다', () => {
    direct = true;
    mouse('pointerdown', 400.3, 300.7);
    mouse('pointermove', 420.3, 300.7);
    fire('pointerdown', 300.3, 200.7, 5);
    expect(log).toEqual(['start 400.3,300.7 mouse', 'move 420.3,300.7', 'end false']);
    fire('pointerup', 300.3, 200.7, 5);
    const c = cam();
    mouse('pointermove', 470.3, 330.7);
    mouse('pointerup', 470.3, 330.7);
    expect(log).toHaveLength(3);
    expect(cam()).toBe(c);
    expect(v.heldPointers).toEqual([]);
  });

  it('Esc(cancel)·pointercancel은 끌기를 취소하고, 취소한 포인터는 뗄 때까지 코어에 넘기지 않는다', () => {
    direct = true;
    const c0 = cam();
    mouse('pointerdown', 400.3, 300.7);
    mouse('pointermove', 420.3, 300.7);
    drag.cancel();
    expect(log).toEqual(['start 400.3,300.7 mouse', 'move 420.3,300.7', 'end false']);
    mouse('pointermove', 460.3, 330.7);
    mouse('pointerup', 460.3, 330.7);
    expect(log).toHaveLength(3);
    expect(cam()).toBe(c0);
    expect(picks).toBe(0);
    log = [];
    direct = false;
    fire('pointerdown', 400.3, 300.7);
    vi.advanceTimersByTime(HOLD_MENU_MS);
    fire('pointermove', 430.3, 330.7);
    fire('pointercancel', 430.3, 330.7);
    expect(log).toEqual(['start 400.3,300.7 touch', 'move 430.3,330.7', 'end false']);
    expect(drag.dragging).toBe(false);
    expect(cam()).toBe(c0);
  });

  it('측정 중 정밀 조준(같은 pointerId로 코어에 미리 보기·누르기를 보낸다)은 그대로: 처리기는 묻기만 받고 맡지 않아 점을 찍는다', () => {
    measuring = true;
    direct = true;
    v.setMeasureMode(true);
    fire('pointerdown', 400.3, 360.7);
    vi.advanceTimersByTime(AIM_HOLD_MS);
    expect(aim.aiming).toBe(true);
    fire('pointermove', 405.3, 362.7);
    v.renderNow();
    fire('pointerup', 405.3, 362.7);
    v.renderNow();
    expect(aim.aiming).toBe(false);
    expect(v.measurePointCount).toBe(1);
    // 진짜 손가락 누르기와 십자선 자리에서 보낸 펜 누르기를 물었고, 하나도 맡지 않았다
    expect(asked).toEqual(['down 1 touch 1', 'down 1 pen 1']);
    expect(log).toEqual([]);
    // 마우스 누르기로도 찍는다(묻기만)
    mouse('pointerdown', 380.3, 280.7, 3);
    mouse('pointerup', 380.3, 280.7, 3);
    v.renderNow();
    expect(v.measurePointCount).toBe(2);
    expect(asked.at(-1)).toBe('down 3 mouse 1');
  });

  it('dispose하면 처리기를 떼어 그다음 끌기는 코어가 돌린다', () => {
    direct = true;
    drag.dispose();
    const c0 = cam();
    mouse('pointerdown', 400.3, 300.7);
    mouse('pointermove', 440.3, 300.7);
    mouse('pointerup', 440.3, 300.7);
    expect(log).toEqual([]);
    expect(cam()).not.toBe(c0);
  });
});
