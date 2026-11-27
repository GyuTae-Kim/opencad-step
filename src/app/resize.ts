/**
 * 패널 크기 바꾸기: 넓은 화면은 패널 왼쪽 가장자리를 끌어 폭(--panel-w)을, 좁은 화면(아래 시트)은 위 가장자리를 끌어
 * 높이(--sheet-h)를 바꾼다. 화살표 키로도(16px씩), 두 번 누르면 기본값. 고른 크기는 이 브라우저에 기억한다.
 * 173차(WCAG 2.5.7 끄는 동작): 끌지 않고 한 번 누르면 기본 크기 ↔ 가장 큰 크기 — 크기가 바뀌면 손잡이가 옮겨 가 두 번 누르기의 둘째가
 * 다른 곳에 떨어지므로 두 번 누르기 시간(TAP_WAIT_MS)을 기다리고, 그 안 둘째 누르기는 기본(손가락 두 번 두드리기도).
 * 186차(WCAG 4.1.2): 초점을 받는 separator라 값(aria-valuenow·min·max)을 둔다 — value.
 */

export const PANEL_MIN = 240;
export const PANEL_MAX = 720;
export const SHEET_MIN = 120;
const KEY_W = 'opencad-step.panelWidth';
const KEY_H = 'opencad-step.sheetHeight';
/** 끌지 않은 누르기 뒤 둘째 누르기를 기다리는 시간(ms — 코어 DOUBLE_CLICK_MS와 같다) */
const TAP_WAIT_MS = 450;

/** 패널 폭 자르기: 240~720px, 창 폭의 70%를 넘지 않게 */
export function clampPanelWidth(w: number, viewportW: number): number {
  const max = Math.max(PANEL_MIN, Math.min(PANEL_MAX, Math.floor(viewportW * 0.7)));
  return Math.round(Math.min(max, Math.max(PANEL_MIN, w)));
}

/** 시트 높이 자르기: 120px 이상, 3D 보기가 120px은 남게 */
export function clampSheetHeight(h: number, workspaceH: number): number {
  const max = Math.max(SHEET_MIN, workspaceH - 120);
  return Math.round(Math.min(max, Math.max(SHEET_MIN, h)));
}

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export class PanelResizer {
  readonly el: HTMLElement;
  /** set: 누를 때 사용자가 고른 크기였는지, again: 한 번 누른 뒤 기다리던 중 다시 눌렀는지(173차) */
  private drag: { id: number; start: number; size: number; set: boolean; again: boolean } | null = null;
  /** 끌지 않고 한 번 누른 뒤 기다리는 크기 바꾸기(173차) */
  private tap: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly panel: HTMLElement,
    private readonly workspace: HTMLElement,
    private readonly narrow: MediaQueryList | null,
    private readonly store: Store | null,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'panel-resizer';
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'separator');
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    this.el.addEventListener('pointerup', (e) => this.up(e));
    this.el.addEventListener('pointercancel', (e) => this.up(e));
    this.el.addEventListener('dblclick', () => this.reset());
    this.el.addEventListener('keydown', (e) => this.key(e));
    this.narrow?.addEventListener('change', () => this.sync());
    // 숨었던 패널이 열림(문서를 열기 전에는 숨어 되살린 크기를 잴 수 없다)·창 크기(상한이 바뀜)는 코드가 지나지 않아 크기 알림으로 값을 다시
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this.value());
      ro.observe(panel);
      ro.observe(workspace);
    }
    this.restore();
    this.sync();
  }

  private get isNarrow(): boolean {
    return !!this.narrow?.matches;
  }

  /** 방향에 맞는 접근성 속성 */
  private sync(): void {
    const n = this.isNarrow;
    this.el.setAttribute('aria-orientation', n ? 'horizontal' : 'vertical');
    this.el.setAttribute('aria-label', n ? '패널 높이 바꾸기(끌기·위아래 화살표, 두 번 누르면 기본)' : '패널 폭 바꾸기(끌기·좌우 화살표, 두 번 누르면 기본)');
    this.el.title = n ? '끌어서 시트 높이 바꾸기 · 두 번 누르면 기본' : '끌어서 패널 폭 바꾸기 · 두 번 누르면 기본';
    this.value();
  }

  /**
   * 손잡이 값: 지금 크기가 쓸 수 있는 범위(가장 작을 때 0 ~ 가장 클 때 100)의 어디인지 정수 비율. ARIA 기본 범위 0~100이라 화소와 달리
   * 데스크톱(값 수)과 휴대폰(범위 비율 %) 화면 읽기가 같은 수로 읽고 새 글(aria-valuetext)이 들지 않는다. 크기를 바꾸는 apply·reset·sync와 크기 알림이 부른다
   */
  private value(): void {
    const n = this.isNarrow;
    const lo = n ? SHEET_MIN : PANEL_MIN;
    const hi = n ? clampSheetHeight(Infinity, this.workspace.getBoundingClientRect().height) : clampPanelWidth(Infinity, window.innerWidth);
    const t = hi > lo ? (this.size() - lo) / (hi - lo) : 0;
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    this.el.setAttribute('aria-valuenow', String(Math.round(Math.min(1, Math.max(0, t)) * 100)));
  }

  private size(): number {
    const r = this.panel.getBoundingClientRect();
    return this.isNarrow ? r.height : r.width;
  }

  private apply(px: number, save: boolean): void {
    if (this.isNarrow) {
      const h = clampSheetHeight(px, this.workspace.getBoundingClientRect().height);
      this.root.style.setProperty('--sheet-h', `${h}px`);
      if (save) this.save(KEY_H, h);
    } else {
      const w = clampPanelWidth(px, window.innerWidth);
      this.root.style.setProperty('--panel-w', `${w}px`);
      if (save) this.save(KEY_W, w);
    }
    this.value();
  }

  private save(k: string, v: number): void {
    try {
      this.store?.setItem(k, String(v));
    } catch {
      /* 저장소를 못 쓰면 이번 창에서만 */
    }
  }

  private restore(): void {
    try {
      const w = Number(this.store?.getItem(KEY_W));
      if (w > 0) this.root.style.setProperty('--panel-w', `${clampPanelWidth(w, window.innerWidth)}px`);
      const h = Number(this.store?.getItem(KEY_H));
      if (h > 0) this.root.style.setProperty('--sheet-h', `${h}px`);
    } catch {
      /* 무시 */
    }
  }

  /** 기다리던 한 번 누르기를 거둔다(있었으면 true) */
  private stopTap(): boolean {
    const t = this.tap;
    if (t !== null) clearTimeout(t);
    this.tap = null;
    return t !== null;
  }

  /** 기본 크기로 */
  reset(): void {
    this.stopTap();
    const n = this.isNarrow;
    this.root.style.removeProperty(n ? '--sheet-h' : '--panel-w');
    try {
      this.store?.removeItem(n ? KEY_H : KEY_W);
    } catch {
      /* 무시 */
    }
    this.value();
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    const n = this.isNarrow;
    this.drag = { id: e.pointerId, start: n ? e.clientY : e.clientX, size: this.size(), set: !!this.root.style.getPropertyValue(n ? '--sheet-h' : '--panel-w'), again: this.stopTap() };
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* 무시 */
    }
    this.el.classList.add('active');
    document.body.classList.add('resizing');
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const pos = this.isNarrow ? e.clientY : e.clientX;
    // 패널은 오른쪽(또는 아래)에 있으므로 왼쪽(위)으로 끌면 커진다
    this.apply(d.size + (d.start - pos), false);
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = null;
    this.el.classList.remove('active');
    document.body.classList.remove('resizing');
    // 173차: 끌지 않은 누르기(코어 끌기 시작 거리 — 마우스·펜 4px, 손가락 10px 안). 둘째 누르기면 기본, 아니면 기다린 뒤 기본 크기 ↔ 가장 크게
    if (e.type === 'pointerup' && Math.abs((this.isNarrow ? e.clientY : e.clientX) - d.start) < (e.pointerType === 'touch' ? 10 : 4)) {
      if (d.again) return this.reset();
      this.tap = setTimeout(() => {
        this.tap = null;
        if (d.set) this.reset();
        else this.apply(Infinity, true);
      }, TAP_WAIT_MS);
      return;
    }
    this.apply(this.size(), true);
  }

  private key(e: KeyboardEvent): void {
    const n = this.isNarrow;
    const grow = n ? 'ArrowUp' : 'ArrowLeft';
    const shrink = n ? 'ArrowDown' : 'ArrowRight';
    if (e.key !== grow && e.key !== shrink && e.key !== 'Home') return;
    e.preventDefault();
    e.stopPropagation();
    this.stopTap();
    if (e.key === 'Home') return this.reset();
    this.apply(this.size() + (e.key === grow ? 16 : -16), true);
  }
}
