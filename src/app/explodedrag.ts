/**
 * 분해 손질 끌기(분해 조각 안 — 뷰어에 단다): 부품을 끌어 분해 자리를 바꾸는 손짓만 다루고, 무엇을 얼마나 옮길지는 앱이 정한다(start·move·end).
 *
 * - 바로 끌기(direct — 분해 막대의 "옮기기"를 켰을 때, 마우스 왼쪽 단추·펜·손가락): 코어 0.32.0 포인터 맡기 훅(setPointerClaim)으로 받는다.
 *   코어는 캔버스를 누를 때마다 묻고('down' — 여기서는 맡지 않아 그냥 누르기의 고르기·두 번 눌러 맞춰 보기는 코어가 한다), 한 포인터만 누른 채
 *   끌기 시작 거리(마우스·펜 4화소, 손가락 10화소)를 넘는 순간('drag' — 코어가 궤도·이동을 시작하기 바로 전) 한 번 더 묻는다. 그때 앱에 누른 자리를
 *   묻고(start) 앱이 받으면 그 포인터는 뗄 때까지 앱 것이다(코어는 궤도·고르기를 하지 않고 움직임·떼기만 넘긴다). 받지 않으면(빈 곳·덜 벌어진 부품)
 *   코어가 그대로 돌려 본다. 끄는 동안 둘째 손가락이 닿으면 코어가 첫 손가락을 돌려받아(end 'pinch') 두 손가락 이동·확대를 하고, 끌기는 앞 자리로 돌아간다.
 * - 길게 눌러 잡기(grab — 손가락, 옮기기를 켜지 않아도): 정밀 조준 모듈의 길게 누르기(HOLD_MENU_MS — 측정·면 고르기 밖이면 작업 메뉴)에서 앱이 부른다.
 *   그 손가락은 정밀 조준 모듈이 코어에서 떼어 내고(합성 pointercancel) 움직임·떼기를 코어로 보내지 않는다 — 그 모듈은 같은 pointerId로 코어에 측정 미리 보기를
 *   보내는 길이라 코어 맡기로 바꾸지 않는다(코어 README). 그래서 잡은 동안만 캔버스 부모의 캡처 단계에서 그 손가락을 듣는다(정밀 조준 모듈 다음).
 *   손가락 끌기 문턱(10화소)을 넘게 움직이면 끌고, 움직이지 않고 떼면 tap(앱은 작업 메뉴)을 부른다. 둘째 손가락이 닿으면 정밀 조준 모듈이 첫 손가락을
 *   코어에 다시 알리고(그 누르기도 코어가 'down'으로 묻는다) 끌기는 앞 자리로 돌아간다.
 * - 끄는 동안 캔버스를 새로 누르면(둘째 손가락, 마우스로 끄는 중 손가락 등 — 코어의 'down' 물음) 끌기를 취소한다. pointercancel·cancel()(Esc)도 끌기를 취소하고,
 *   그 포인터는 뗄 때까지 코어에 넘기지 않는다(바로 끌기는 코어가 맡긴 채 두고, 길게 눌러 잡은 손가락은 정밀 조준 모듈이 막는다).
 * 좌표는 캔버스 기준 CSS 화소(코어 pick과 같다). tap만 화면 좌표(작업 메뉴 자리).
 */
import type { HeldPointer, PointerClaimHandler, PointerClaimQuery, PointerHoldEnd, Viewer3d } from 'opencad-viewer3d';

/** 길게 눌러 잡은 손가락을 끌기로 보는 거리(화소 — 코어 TOUCH_DRAG_START_PX와 같다, 시험이 본다) */
export const TOUCH_DRAG_PX = 10;

export interface ExplodeDragOptions {
  /** 바로 끌기(옮기기 단추가 켜짐) */
  direct: () => boolean;
  /** 끌기 시작: 누른 자리(캔버스 좌표)의 부품을 끌 수 있으면 앱이 손질을 열고 true */
  start: (x: number, y: number, pointerType: string) => boolean;
  /** 끄는 동안 포인터 자리(캔버스 좌표) */
  move: (x: number, y: number) => void;
  /** 끌기 끝: commit이면 남기고, 아니면 앞 자리로 */
  end: (commit: boolean) => void;
  /** 길게 눌러 잡은 손가락을 움직이지 않고 뗐을 때(화면 좌표 — 앱은 작업 메뉴) */
  tap?: (x: number, y: number) => void;
}

interface Active {
  id: number;
  /** 정밀 조준 모듈의 길게 누르기로 잡았는지(캔버스 부모에서 듣는다) — 아니면 코어가 맡긴 바로 끌기 */
  hold: boolean;
  /** 누른 자리(캔버스 좌표), 길게 눌러 잡았으면 화면 좌표도(tap) */
  x0: number;
  y0: number;
  sx: number;
  sy: number;
  moved: boolean;
  /** 취소한 뒤에는 뗄 때까지 삼키기만 한다 */
  live: boolean;
}

export class ExplodeDrag {
  private readonly canvas: HTMLElement;
  private readonly trap: HTMLElement;
  private active: Active | null = null;
  /** 길게 눌러 잡은 손가락 듣기(잡은 동안만) */
  private unlisten: (() => void) | null = null;
  /** 길게 눌러 잡은 바로 뒤 정밀 조준 모듈이 코어에 보내는 pointercancel은 우리 끌기를 끝내지 않는다(그 손가락이 움직이기 전까지) */
  private skipCancel = false;
  private readonly handler: PointerClaimHandler = {
    claim: (q) => this.claim(q),
    move: (p) => {
      const a = this.active;
      if (a && !a.hold && a.live && p.pointerId === a.id) this.opts.move(p.x, p.y);
    },
    end: (p, why) => this.released(p, why),
  };

  constructor(
    private readonly viewer: Pick<Viewer3d, 'canvas' | 'setPointerClaim'>,
    private readonly opts: ExplodeDragOptions,
  ) {
    this.canvas = viewer.canvas;
    this.trap = this.canvas.parentElement ?? this.canvas;
    viewer.setPointerClaim(this.handler);
  }

  /** 부품을 끄는 중인지(잡은 뒤 움직이기 전도) */
  get dragging(): boolean {
    return !!this.active?.live;
  }

  /**
   * 길게 눌러 잡기(정밀 조준 모듈의 길게 누르기에서 — 화면 좌표와 그 손가락): 앱이 그 자리 부품을 받으면 true.
   * 그 손가락은 정밀 조준 모듈이 코어에서 떼어 낸다(true를 돌려주면)
   */
  grab(x: number, y: number, pointerId: number): boolean {
    if (this.active) return false;
    const r = this.canvas.getBoundingClientRect();
    const cx = x - r.left;
    const cy = y - r.top;
    if (!this.opts.start(cx, cy, 'touch')) return false;
    this.active = { id: pointerId, hold: true, x0: cx, y0: cy, sx: x, sy: y, moved: false, live: true };
    this.skipCancel = true;
    this.listen();
    return true;
  }

  /** 끌기 취소(Esc·밖에서): 앞 자리로 되돌리고, 그 포인터는 뗄 때까지 코어에 넘기지 않는다 */
  cancel(): void {
    const a = this.active;
    if (!a?.live) return;
    a.live = false;
    this.opts.end(false);
  }

  dispose(): void {
    this.drop();
    this.viewer.setPointerClaim(null);
  }

  /** 코어의 물음: 끄는 동안 새 누르기면 끌기를 취소하고, 바로 끌기는 한 포인터 끌기 시작에서만 맡는다 */
  private claim(q: PointerClaimQuery): boolean {
    const a = this.active;
    if (q.phase === 'down') {
      if (a) {
        this.cancel();
        // 길게 눌러 잡은 손가락은 정밀 조준 모듈이 코어에 다시 알린다(둘째 손가락) — 더 듣지 않는다
        if (a.hold) this.drop();
      }
      return false;
    }
    if (a || q.pointers !== 1 || (q.pointerType !== 'touch' && q.button !== 0) || !this.opts.direct() || !this.opts.start(q.x, q.y, q.pointerType)) return false;
    this.active = { id: q.pointerId, hold: false, x0: q.x, y0: q.y, sx: 0, sy: 0, moved: true, live: true };
    // 맡은 그 사건에는 코어가 move를 부르지 않는다 — 그 자리는 물음의 at
    this.opts.move(q.at.x, q.at.y);
    return true;
  }

  /** 코어가 맡긴 포인터가 끝났다: 떼면 남기고, 취소·둘째 손가락(코어가 돌려받아 핀치)·처리기를 바꿈은 앞 자리로 */
  private released(p: HeldPointer, why: PointerHoldEnd): void {
    const a = this.active;
    if (!a || a.hold || p.pointerId !== a.id) return;
    this.active = null;
    if (a.live) this.opts.end(why === 'up');
  }

  private listen(): void {
    const t = this.trap;
    const move = (e: Event): void => this.heldMove(e as PointerEvent);
    const up = (e: Event): void => this.heldUp(e as PointerEvent, false);
    const cancel = (e: Event): void => this.heldUp(e as PointerEvent, true);
    t.addEventListener('pointermove', move, true);
    t.addEventListener('pointerup', up, true);
    t.addEventListener('pointercancel', cancel, true);
    this.unlisten = () => {
      t.removeEventListener('pointermove', move, true);
      t.removeEventListener('pointerup', up, true);
      t.removeEventListener('pointercancel', cancel, true);
    };
  }

  /** 길게 눌러 잡기를 끝낸다(듣기를 떼고 잊는다) */
  private drop(): void {
    this.unlisten?.();
    this.unlisten = null;
    this.active = null;
    this.skipCancel = false;
  }

  private heldMove(e: PointerEvent): void {
    const a = this.active;
    if (!a?.hold || e.pointerId !== a.id) return;
    this.skipCancel = false;
    if (!a.live) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (!a.moved) {
      if (Math.hypot(x - a.x0, y - a.y0) < TOUCH_DRAG_PX) return;
      a.moved = true;
    }
    this.opts.move(x, y);
  }

  private heldUp(e: PointerEvent, cancel: boolean): void {
    const a = this.active;
    if (!a?.hold || e.pointerId !== a.id) return;
    if (cancel && this.skipCancel) {
      this.skipCancel = false;
      return;
    }
    this.drop();
    if (!a.live) return;
    if (cancel || !a.moved) {
      this.opts.end(false);
      if (!cancel) this.opts.tap?.(a.sx, a.sy);
      return;
    }
    this.opts.end(true);
  }
}
