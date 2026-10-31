/**
 * 분해 손질 끌기(분해 조각 안 — 뷰어 캔버스에 단다): 부품을 끌어 분해 자리를 바꾸는 손짓만 다루고, 무엇을 얼마나 옮길지는 앱이 정한다(start·move·end).
 *
 * 정밀 조준(aim.ts)처럼 코어(Viewer3d)는 고치지 않고 캔버스 부모의 캡처 단계에서 먼저 받는다(코어 듣기는 캔버스에 있다):
 * - 바로 끌기(direct — 분해 막대의 "옮기기"를 켰을 때, 마우스·펜·손가락): 누르기는 코어에 그대로 넘기고, 움직임이 코어의 끌기 시작 거리
 *   (dragStarted — 마우스·펜 4화소, 손가락 10화소)를 넘는 그 사건에서 앱에 누른 자리를 묻는다(start). 앱이 받으면 코어에 pointercancel을 보내
 *   그 포인터의 끌기(궤도)를 잊게 하고, 그 뒤 움직임·떼기는 코어로 보내지 않는다. 받지 않으면(빈 곳·덜 벌어진 부품) 코어가 그대로 돌려 본다.
 *   움직이지 않고 떼면 코어의 누르기(고르기·두 번 눌러 맞춰 보기)가 그대로다.
 * - 길게 눌러 잡기(grab — 손가락, 옮기기를 켜지 않아도): 정밀 조준 모듈의 길게 누르기(HOLD_MENU_MS — 측정·면 고르기 밖이면 작업 메뉴)에서 앱이 부른다.
 *   그 손가락은 정밀 조준이 코어에서 이미 떼어 냈다(움직임·떼기를 코어로 보내지 않는다). 손가락 끌기 문턱(10화소)을 넘게 움직이면 끌고,
 *   움직이지 않고 떼면 tap(앱은 작업 메뉴 — 예전 길게 누르기와 같은 것)을 부른다.
 * - 끄는 동안 둘째 손가락이 닿으면 끌기를 취소하고(end(false)) 첫 손가락을 지금 자리에서 다시 눌린 것으로 코어에 알려 두 손가락 확대·이동을 넘긴다
 *   (길게 눌러 잡은 손가락은 정밀 조준 모듈이 알린다). pointercancel·cancel()(Esc)도 끌기를 취소하고, 그 포인터는 뗄 때까지 코어에 넘기지 않는다.
 * 끌기 문턱과 보내는 사건 꼴은 코어 pointer 모듈·정밀 조준 모듈(aim.ts touchPointerEvent)과 같은 값을 여기 둔다 — 그 둘은 코어 조각에 있어
 * 가져오면 분해 조각과 코어 조각이 나눠 쓰는 조각이 하나 더 생긴다(시험이 값이 같은지 본다).
 */

/** 끌기 시작 거리(화소 — 코어 DRAG_START_PX·TOUCH_DRAG_START_PX) */
export const DRAG_PX = 4;
export const TOUCH_DRAG_PX = 10;

/** 코어에 보낼 포인터 사건(aim.ts touchPointerEvent와 같은 꼴 — PointerEvent가 없으면 MouseEvent에 pointerId·pointerType을 덧붙인다) */
export function relayEvent(type: string, pointerId: number, clientX: number, clientY: number, pointerType: string): MouseEvent {
  const init = { bubbles: true, cancelable: type !== 'pointercancel', composed: true, clientX, clientY, button: 0, buttons: type === 'pointerdown' ? 1 : 0, pointerId, pointerType, isPrimary: true };
  if (typeof PointerEvent === 'function') return new PointerEvent(type, init);
  const e = new MouseEvent(type, init);
  Object.defineProperty(e, 'pointerId', { value: pointerId });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  Object.defineProperty(e, 'isPrimary', { value: true });
  return e;
}

export interface ExplodeDragOptions {
  /** 바로 끌기(옮기기 단추가 켜짐) */
  direct: () => boolean;
  /** 끌기 시작: 누른 자리(화면 좌표)의 부품을 끌 수 있으면 앱이 손질을 열고 true */
  start: (x: number, y: number, pointerType: string) => boolean;
  /** 끄는 동안 포인터 자리(화면 좌표) */
  move: (x: number, y: number) => void;
  /** 끌기 끝: commit이면 남기고, 아니면 앞 자리로 */
  end: (commit: boolean) => void;
  /** 길게 눌러 잡은 손가락을 움직이지 않고 뗐을 때(화면 좌표 — 앱은 작업 메뉴) */
  tap?: (x: number, y: number) => void;
}

interface Active {
  id: number;
  type: string;
  /** 정밀 조준 모듈의 길게 누르기로 잡았는지(그 모듈이 코어에서 떼어 냈고, 둘째 손가락이면 그 모듈이 코어에 다시 알린다) */
  hold: boolean;
  x0: number;
  y0: number;
  moved: boolean;
  /** 취소한 뒤에는 뗄 때까지 삼키기만 한다 */
  live: boolean;
}

export class ExplodeDrag {
  private readonly trap: HTMLElement;
  private readonly off: (() => void)[] = [];
  /** 누르고 있는 손가락·포인터(화면 좌표) */
  private readonly presses = new Map<number, { x: number; y: number; type: string }>();
  /** 바로 끌기를 기다리는 누르기 */
  private pending: { id: number; type: string; x0: number; y0: number } | null = null;
  private active: Active | null = null;
  private relaying = false;
  /** 길게 눌러 잡은 손가락: 정밀 조준 모듈이 곧 코어에 보낼 pointercancel은 우리 끌기를 끝내지 않는다 */
  private heldCancel: number | null = null;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly opts: ExplodeDragOptions,
  ) {
    this.trap = canvas.parentElement ?? canvas;
    this.listen('pointerdown', (e) => this.onDown(e));
    this.listen('pointermove', (e) => this.onMove(e));
    this.listen('pointerup', (e) => this.onUp(e, false));
    this.listen('pointercancel', (e) => this.onUp(e, true));
  }

  /** 부품을 끄는 중인지(잡은 뒤 움직이기 전도) */
  get dragging(): boolean {
    return !!this.active?.live;
  }

  /**
   * 길게 눌러 잡기(정밀 조준 모듈의 길게 누르기에서): 누르고 있는 손가락이 하나뿐이고 앱이 그 자리 부품을 받으면 true.
   * 그 손가락은 정밀 조준 모듈이 코어에서 떼어 낸다(true를 돌려주면)
   */
  grab(x: number, y: number): boolean {
    if (this.active || this.presses.size !== 1) return false;
    const [id, p] = [...this.presses][0]!;
    if (p.type !== 'touch' || !this.opts.start(x, y, p.type)) return false;
    this.pending = null;
    this.active = { id, type: p.type, hold: true, x0: x, y0: y, moved: false, live: true };
    this.heldCancel = id;
    return true;
  }

  /** 끌기 취소(Esc·밖에서): 앞 자리로 되돌리고, 그 포인터는 뗄 때까지 코어에 넘기지 않는다 */
  cancel(): void {
    this.pending = null;
    const a = this.active;
    if (!a?.live) return;
    a.live = false;
    this.opts.end(false);
  }

  dispose(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    this.presses.clear();
    this.pending = null;
    this.active = null;
  }

  private listen(type: string, fn: (e: PointerEvent) => void): void {
    const h = (e: Event): void => {
      if (!this.relaying) fn(e as PointerEvent);
    };
    this.trap.addEventListener(type, h, true);
    this.off.push(() => this.trap.removeEventListener(type, h, true));
  }

  private onDown(e: PointerEvent): void {
    if (e.target !== this.canvas) return;
    const a = this.active;
    if (a && e.pointerId !== a.id) {
      // 둘째 포인터: 끌기를 그만두고 두 손가락 몸짓은 코어에(길게 눌러 잡은 손가락은 정밀 조준 모듈이 다시 알린다)
      const p = this.presses.get(a.id);
      this.active = null;
      if (a.live) this.opts.end(false);
      if (!a.hold && p && e.pointerType === 'touch') this.relay('pointerdown', a.id, p, a.type);
    }
    this.presses.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    this.pending = null;
    if (this.presses.size !== 1 || this.active || !this.opts.direct()) return;
    if (e.pointerType !== 'touch' && e.button !== 0) return;
    this.pending = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY };
  }

  private onMove(e: PointerEvent): void {
    // 정밀 조준 모듈은 잡은 바로 그때 pointercancel을 보낸다 — 그 뒤 움직임부터는 진짜 취소다
    this.heldCancel = null;
    const p = this.presses.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
    }
    const a = this.active;
    if (a && e.pointerId === a.id) {
      // 코어(궤도)로 보내지 않는다
      e.stopPropagation();
      if (!a.live) return;
      if (!a.moved) {
        if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < TOUCH_DRAG_PX) return;
        a.moved = true;
      }
      this.opts.move(e.clientX, e.clientY);
      return;
    }
    const q = this.pending;
    if (!q || e.pointerId !== q.id) return;
    if (Math.hypot(e.clientX - q.x0, e.clientY - q.y0) < (q.type === 'touch' ? TOUCH_DRAG_PX : DRAG_PX)) return;
    this.pending = null;
    // 코어가 이 사건에서 돌려 보기 시작한다 — 그 전에 누른 자리 부품을 끌 수 있는지 묻는다
    if (!this.opts.start(q.x0, q.y0, q.type)) return;
    e.stopPropagation();
    this.relay('pointercancel', q.id, { x: e.clientX, y: e.clientY }, q.type);
    this.active = { id: q.id, type: q.type, hold: false, x0: q.x0, y0: q.y0, moved: true, live: true };
    this.opts.move(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent, cancel: boolean): void {
    if (cancel && this.heldCancel === e.pointerId) {
      this.heldCancel = null;
      return;
    }
    if (this.heldCancel === e.pointerId) this.heldCancel = null;
    this.presses.delete(e.pointerId);
    if (this.pending?.id === e.pointerId) this.pending = null;
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this.active = null;
    // 코어는 이 포인터를 이미 잊었다(바로 끌기는 pointercancel, 길게 눌러 잡기는 정밀 조준 모듈이)
    if (!cancel) e.stopPropagation();
    if (!a.live) return;
    if (cancel || !a.moved) {
      this.opts.end(false);
      if (!cancel && a.hold) this.opts.tap?.(a.x0, a.y0);
      return;
    }
    this.opts.end(true);
  }

  private relay(type: string, id: number, at: { x: number; y: number }, pointerType: string): void {
    this.relaying = true;
    try {
      this.canvas.dispatchEvent(relayEvent(type, id, at.x, at.y, pointerType));
    } finally {
      this.relaying = false;
    }
  }
}
