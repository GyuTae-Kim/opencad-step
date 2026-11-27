// @vitest-environment jsdom
/**
 * 173차: 끄는 동작의 한 점 대안(WCAG 2.5.7 — 끌어서만 되는 기능은 끌지 않는 한 점 포인터로도 되어야 한다).
 * 패널 폭(넓은 화면)·아래 시트 높이(좁은 화면) 손잡이는 끌어야만 크기가 바뀌었고, 끌지 않는 길은 두 번 누르기(기본 크기) 하나뿐이었다
 * (화살표 키는 키보드라 2.5.7의 한 점 포인터 대안이 아님). 이제 끌지 않고 한 번 누르면 기본 크기 ↔ 가장 큰 크기를 오간다 — 두 번 누르기를 깨지 않게
 * 두 번 누르기 시간(450ms — 코어 DOUBLE_CLICK_MS)을 기다리고, 그 안 둘째 누르기는 기본(손가락 두 번 두드리기도). 끌기·화살표는 그대로
 * 186차(WCAG 4.1.2 이름·역할·값): 초점을 받는 손잡이(role=separator)는 값이 꼭 드는데 aria-valuenow·min·max가 없었다 — 이제 지금 크기가
 * 쓸 수 있는 범위(가장 작을 때 0 ~ 가장 클 때 100)의 어디인지 정수로 두고, 크기가 바뀌는 모든 길에서 함께 바뀐다
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampPanelWidth, clampSheetHeight, PanelResizer } from '../../src/app/resize';

const KEY_W = 'opencad-step.panelWidth';
const KEY_H = 'opencad-step.sheetHeight';

/** 포인터 사건(jsdom에는 PointerEvent가 없을 수 있어 MouseEvent에 pointerId·pointerType을 덧붙인다) */
function ptr(type: string, x: number, y: number, pointerType: string): MouseEvent {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  return e;
}

/**
 * 손잡이와 패널(그려진 크기 = 손잡이가 정한 값, 없으면 스타일시트 기본 320px 폭·300px 높이, 숨은 패널은 0), 작업 영역 높이 700px.
 * stored: 처음 저장소 값, hidden: 손잡이를 만들 때 패널이 숨어 있음(앱은 문서를 열기 전 패널을 숨긴다), flip: 좁은 화면 미디어 질의를 바꿔 알림
 */
function setup(narrow: boolean, opts: { stored?: Record<string, string>; hidden?: boolean } = {}) {
  document.body.replaceChildren();
  const root = document.createElement('div');
  const workspace = document.createElement('main');
  const panel = document.createElement('aside');
  panel.hidden = !!opts.hidden;
  workspace.append(panel);
  root.append(workspace);
  document.body.append(root);
  const px = (k: string, d: number) => parseFloat(root.style.getPropertyValue(k)) || d;
  panel.getBoundingClientRect = () => (panel.hidden ? { width: 0, height: 0 } : { width: px('--panel-w', 320), height: px('--sheet-h', 300) }) as DOMRect;
  workspace.getBoundingClientRect = () => ({ width: 1024, height: 700 }) as DOMRect;
  const m = new Map<string, string>(Object.entries(opts.stored ?? {}));
  const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  let onChange = () => {};
  const q = { matches: narrow, addEventListener: (_: string, f: () => void) => void (onChange = f) };
  const flip = (n: boolean) => {
    q.matches = n;
    onChange();
  };
  const mq = q as unknown as MediaQueryList;
  const r = new PanelResizer(root, panel, workspace, mq, store);
  panel.prepend(r.el);
  const el = r.el;
  // 넓은 화면은 가로(clientX), 시트는 세로(clientY) 자리로 끈다
  const at = (v: number): [number, number] => (narrow ? [200, v] : [v, 300]);
  const down = (v: number, t = 'mouse') => el.dispatchEvent(ptr('pointerdown', ...at(v), t));
  const move = (v: number, t = 'mouse') => el.dispatchEvent(ptr('pointermove', ...at(v), t));
  const up = (v: number, t = 'mouse') => el.dispatchEvent(ptr('pointerup', ...at(v), t));
  const tap = (v: number, t = 'mouse') => {
    down(v, t);
    up(v, t);
  };
  const val = () => root.style.getPropertyValue(narrow ? '--sheet-h' : '--panel-w');
  return { el, m, down, move, up, tap, val, panel, workspace, flip };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('173차: 패널·시트 크기 손잡이의 끌지 않는 한 점 대안(WCAG 2.5.7)', () => {
  it('넓은 화면: 끌지 않고 한 번 누르면 두 번 누르기 시간(450ms) 뒤 기본 → 가장 넓게, 다시 한 번이면 기본 — 고른 크기를 기억한다', () => {
    vi.useFakeTimers();
    const s = setup(false);
    const max = clampPanelWidth(1e9, window.innerWidth);
    s.tap(500);
    // 두 번 누르기를 기다리는 동안은 그대로(전에는 누른 자리 크기를 사용자 크기로 저장만 했다)
    expect(s.val()).toBe('');
    vi.advanceTimersByTime(449);
    expect(s.val()).toBe('');
    vi.advanceTimersByTime(1);
    expect(s.val()).toBe(`${max}px`);
    expect(s.m.get(KEY_W)).toBe(String(max));
    s.tap(500);
    vi.advanceTimersByTime(450);
    expect(s.val()).toBe('');
    expect(s.m.has(KEY_W)).toBe(false);
  });

  it('두 번 누르면(450ms 안) 기본 — 첫 누르기는 크기를 바꾸지 않고, dblclick이 오지 않는 손가락 두 번 두드리기도 같다', () => {
    vi.useFakeTimers();
    const s = setup(false);
    s.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(s.val()).toBe('336px');
    s.tap(500);
    expect(s.val()).toBe('336px');
    vi.advanceTimersByTime(120);
    s.tap(501);
    s.el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(s.val()).toBe('');
    vi.advanceTimersByTime(1000);
    expect(s.val()).toBe('');
    expect(s.m.has(KEY_W)).toBe(false);
    // 손가락(브라우저가 dblclick을 보내지 않아도)
    s.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(s.val()).toBe('336px');
    s.tap(500, 'touch');
    vi.advanceTimersByTime(200);
    s.tap(503, 'touch');
    expect(s.val()).toBe('');
    vi.advanceTimersByTime(1000);
    expect(s.val()).toBe('');
    expect(s.m.has(KEY_W)).toBe(false);
  });

  it('끌면 전과 같이 끈 크기(누르기로 보지 않음), 손가락 10px 안 떨림은 누르기, 한 번 누른 뒤 곧 끌면 기다리던 바꾸기는 거둔다', () => {
    vi.useFakeTimers();
    const s = setup(false);
    // 마우스로 왼쪽 50px 끌기 — 넓어진다(전과 같음)
    s.down(500);
    s.move(450);
    s.up(450);
    expect(s.val()).toBe('370px');
    expect(s.m.get(KEY_W)).toBe('370');
    vi.advanceTimersByTime(1000);
    expect(s.val()).toBe('370px');
    // 손가락 6px 떨림(코어 손가락 끌기 시작 거리 10px 안)은 누르기 — 사용자 크기였으니 기다린 뒤 기본
    s.down(500, 'touch');
    s.move(494, 'touch');
    s.up(494, 'touch');
    vi.advanceTimersByTime(450);
    expect(s.val()).toBe('');
    // 한 번 누른 뒤 450ms 안에 끌면 그 끌기만 남는다
    s.tap(500);
    vi.advanceTimersByTime(100);
    s.down(500);
    s.move(400);
    s.up(400);
    vi.advanceTimersByTime(1000);
    expect(s.val()).toBe('420px');
    expect(s.m.get(KEY_W)).toBe('420');
  });

  it('좁은 화면 아래 시트: 손가락으로 손잡이를 한 번 누르면 기다린 뒤 가장 높게(3D 보기 120px 남김), 다시 누르면 기본 — 시트 높이 열쇠에 기억한다', () => {
    vi.useFakeTimers();
    const s = setup(true);
    const max = clampSheetHeight(1e9, 700);
    expect(max).toBe(580);
    s.tap(400, 'touch');
    vi.advanceTimersByTime(450);
    expect(s.val()).toBe('580px');
    expect(s.m.get(KEY_H)).toBe('580');
    s.tap(120, 'touch');
    vi.advanceTimersByTime(450);
    expect(s.val()).toBe('');
    expect(s.m.has(KEY_H)).toBe(false);
  });
});

describe('186차: 패널·시트 크기 손잡이 값(WCAG 4.1.2 — 초점을 받는 separator의 aria-valuenow·min·max)', () => {
  // 숨었던 패널이 열리거나 창 크기가 바뀌는 것은 코드가 지나지 않아 ResizeObserver(패널·작업 영역)가 알린다 — 시험에서는 그 알림을 손으로 보낸다
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
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });
  const resized = () => observers.forEach((o) => o.cb());
  /** [지금 값, 최소, 최대] */
  const aria = (el: HTMLElement) => [el.getAttribute('aria-valuenow'), el.getAttribute('aria-valuemin'), el.getAttribute('aria-valuemax')];
  const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

  it('넓은 화면: 되살린 폭은 숨었던 패널이 열릴 때 값이 되고, 화살표·끌기(끄는 동안도)·Home·한 번 누르기·두 번 누르기·창 폭에 함께 바뀐다', () => {
    vi.useFakeTimers();
    // 창 폭 1024px: 폭 240 ~ min(720, 1024 × 0.7) = 716px(476px 범위), 저장해 둔 폭 500px — 손잡이를 만들 때 패널은 숨어 있다
    const s = setup(false, { stored: { [KEY_W]: '500' }, hidden: true });
    expect(s.val()).toBe('500px');
    expect(s.el.hasAttribute('aria-valuenow')).toBe(true);
    expect(aria(s.el).slice(1)).toEqual(['0', '100']);
    expect(observers.flatMap((o) => o.els)).toEqual(expect.arrayContaining([s.panel, s.workspace]));
    // 문서를 열어 패널이 열림: (500 − 240) / 476 = 54.6%
    s.panel.hidden = false;
    resized();
    expect(aria(s.el)).toEqual(['55', '0', '100']);
    key(s.el, 'ArrowLeft');
    expect(s.val()).toBe('516px');
    expect(aria(s.el)).toEqual(['58', '0', '100']);
    key(s.el, 'ArrowRight');
    expect(aria(s.el)).toEqual(['55', '0', '100']);
    // 왼쪽으로 100px 끌기 — 끄는 동안도 값이 따라온다
    s.down(600);
    s.move(500);
    expect(s.val()).toBe('600px');
    expect(aria(s.el)).toEqual(['76', '0', '100']);
    s.up(500);
    expect(aria(s.el)).toEqual(['76', '0', '100']);
    // Home(기본 320px): 80 / 476 = 16.8%
    key(s.el, 'Home');
    expect(s.val()).toBe('');
    expect(aria(s.el)).toEqual(['17', '0', '100']);
    // 173차 한 번 누르기: 기다리는 동안 그대로, 450ms 뒤 가장 넓게(100), 다시 한 번이면 기본
    s.tap(500);
    expect(aria(s.el)).toEqual(['17', '0', '100']);
    vi.advanceTimersByTime(450);
    expect(s.val()).toBe('716px');
    expect(aria(s.el)).toEqual(['100', '0', '100']);
    s.tap(500);
    vi.advanceTimersByTime(450);
    expect(s.val()).toBe('');
    expect(aria(s.el)).toEqual(['17', '0', '100']);
    // 두 번 누르기(기본)
    key(s.el, 'ArrowLeft');
    expect(aria(s.el)).toEqual(['20', '0', '100']);
    s.el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(aria(s.el)).toEqual(['17', '0', '100']);
    // 창 폭 800px: 상한이 560px로 — 같은 320px 폭이 80 / 320 = 25%
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    resized();
    expect(aria(s.el)).toEqual(['25', '0', '100']);
  });

  it('좁은 화면 시트: 처음 값과 화살표·끌기·Home 뒤 값, 넓은 ↔ 좁은 화면을 오가면 같은 손잡이가 그 꼴(폭·높이)의 값으로', () => {
    // 작업 영역 높이 700px: 시트 120 ~ 580px(460px 범위), 처음 300px — (300 − 120) / 460 = 39.1%
    const s = setup(true);
    expect(aria(s.el)).toEqual(['39', '0', '100']);
    key(s.el, 'ArrowUp');
    expect(s.val()).toBe('316px');
    expect(aria(s.el)).toEqual(['43', '0', '100']);
    // 위로 50px 끌기
    s.down(400);
    s.move(350);
    expect(s.val()).toBe('366px');
    expect(aria(s.el)).toEqual(['53', '0', '100']);
    s.up(350);
    expect(aria(s.el)).toEqual(['53', '0', '100']);
    // 넓은 화면으로: 같은 요소가 폭(기본 320px — 창 폭 1024px에서 17%)의 값으로, 다시 좁은 화면이면 끌어 둔 시트 높이의 값으로
    s.flip(false);
    expect(s.el.getAttribute('aria-orientation')).toBe('vertical');
    expect(aria(s.el)).toEqual(['17', '0', '100']);
    s.flip(true);
    expect(s.el.getAttribute('aria-orientation')).toBe('horizontal');
    expect(aria(s.el)).toEqual(['53', '0', '100']);
    key(s.el, 'Home');
    expect(s.val()).toBe('');
    expect(aria(s.el)).toEqual(['39', '0', '100']);
  });
});
