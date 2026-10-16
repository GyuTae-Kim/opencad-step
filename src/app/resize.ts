/**
 * 패널 크기 바꾸기: 넓은 화면은 패널 왼쪽 가장자리를 끌어 폭(--panel-w)을, 좁은 화면(아래 시트)은 위 가장자리를 끌어
 * 높이(--sheet-h)를 바꾼다. 화살표 키로도(16px씩), 두 번 누르면 기본값. 고른 크기는 이 브라우저에 기억한다.
 */

export const PANEL_MIN = 240;
export const PANEL_MAX = 720;
export const SHEET_MIN = 120;
const KEY_W = 'opencad-step.panelWidth';
const KEY_H = 'opencad-step.sheetHeight';

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
  private drag: { id: number; start: number; size: number } | null = null;

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

  /** 기본 크기로 */
  reset(): void {
    const n = this.isNarrow;
    this.root.style.removeProperty(n ? '--sheet-h' : '--panel-w');
    try {
      this.store?.removeItem(n ? KEY_H : KEY_W);
    } catch {
      /* 무시 */
    }
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0) return;
    e.preventDefault();
    this.drag = { id: e.pointerId, start: this.isNarrow ? e.clientY : e.clientX, size: this.size() };
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
    this.apply(this.size(), true);
  }

  private key(e: KeyboardEvent): void {
    const n = this.isNarrow;
    const grow = n ? 'ArrowUp' : 'ArrowLeft';
    const shrink = n ? 'ArrowDown' : 'ArrowRight';
    if (e.key !== grow && e.key !== shrink && e.key !== 'Home') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Home') return this.reset();
    this.apply(this.size() + (e.key === grow ? 16 : -16), true);
  }
}
