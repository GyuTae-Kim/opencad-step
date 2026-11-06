// @vitest-environment jsdom
/**
 * 34차: 메뉴 자리는 번역층(i18n.ts — 문서 변화 관찰자가 붙인 뒤 마이크로태스크로 글을 바꾼다)이 바꾼 글의 폭으로 다시 놓는다.
 * 375px 독일어 화면에서 오른쪽 끝 단추(앱 설정)의 메뉴가 한국어 폭(최소 180px)으로 놓여 번역 뒤(206px) 화면 밖으로 18px 나갔다.
 * jsdom에는 배치가 없어 메뉴 폭은 가장 긴 항목 글 길이로 흉내 낸다(글자당 9px, 최소 180px).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMenu, openMenu, openMenuAt } from '../../src/app/menu';

const LONG = 'Anzeigeeinstellungen…';
let observer: MutationObserver | null = null;
const saved: { w?: PropertyDescriptor; h?: PropertyDescriptor; iw?: PropertyDescriptor } = {};

beforeAll(() => {
  saved.w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  saved.h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  saved.iw = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains('menu')) return 0;
      const longest = Math.max(0, ...[...this.querySelectorAll('.menu-label')].map((e) => (e.textContent ?? '').length));
      return Math.max(180, longest * 9 + 40);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 100 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
});
afterAll(() => {
  observer?.disconnect();
  if (saved.w) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', saved.w);
  if (saved.h) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', saved.h);
  if (saved.iw) Object.defineProperty(window, 'innerWidth', saved.iw);
});

/** 화면 오른쪽 끝(left 340)의 단추 */
function anchorAt(left: number): HTMLButtonElement {
  const a = document.createElement('button');
  a.getBoundingClientRect = () => ({ left, right: left + 28, top: 8, bottom: 36, width: 28, height: 28, x: left, y: 8, toJSON: () => ({}) }) as DOMRect;
  document.body.append(a);
  return a;
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const menuEl = () => document.querySelector('.menu') as HTMLElement;

describe('메뉴 자리: 번역 뒤 폭으로 다시 놓기', () => {
  it('한국어 그대로면 그 폭으로(오른쪽 끝 단추 → 화면 오른쪽 8px 안쪽)', async () => {
    const a = anchorAt(340);
    openMenu(a, [{ label: '표시 설정…', run: () => {} }], '앱 설정');
    expect(menuEl().style.left).toBe(`${375 - 180 - 8}px`);
    await settle();
    expect(menuEl().style.left).toBe(`${375 - 180 - 8}px`);
    closeMenu();
  });

  it('번역층이 붙인 뒤 글을 길게 바꾸면 그 폭으로 다시 놓아 화면 안에 둔다(단추 아래 메뉴·화면 점 메뉴)', async () => {
    // 앱 번역층처럼: 메뉴가 붙으면 관찰자가 마이크로태스크로 항목 글을 바꾼다
    observer = new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) if (n instanceof HTMLElement) for (const l of n.querySelectorAll('.menu-label')) if (l.textContent === '표시 설정…') l.textContent = LONG;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const w = LONG.length * 9 + 40;
    expect(w).toBeGreaterThan(180);
    expect(375 - w - 8).toBeGreaterThan(8);
    const a = anchorAt(340);
    openMenu(a, [{ label: '표시 설정…', run: () => {} }], '앱 설정');
    // 붙인 때는 아직 한국어 폭
    expect(menuEl().style.left).toBe(`${375 - 180 - 8}px`);
    await settle();
    expect(menuEl().querySelector('.menu-label')!.textContent).toBe(LONG);
    expect(menuEl().style.left).toBe(`${375 - w - 8}px`);
    closeMenu();
    // 화면 점 메뉴(작업 메뉴 — 오른쪽 끝 가까이에서 연 것)도: 보이지 않는 기준점의 자리는 그 style 값(jsdom에는 배치가 없다)
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (!(this instanceof HTMLElement) || !this.classList.contains('menu-point')) return rect.call(this);
      const x = parseFloat(this.style.left), y = parseFloat(this.style.top);
      return { left: x, right: x + 1, top: y, bottom: y + 1, width: 1, height: 1, x, y, toJSON: () => ({}) } as DOMRect;
    };
    try {
      openMenuAt(370, 300, [{ label: '표시 설정…', run: () => {} }], '작업 메뉴');
      expect(menuEl().style.left).toBe(`${375 - 180 - 8}px`);
      await settle();
      expect(menuEl().style.left).toBe(`${375 - w - 8}px`);
      closeMenu();
    } finally {
      Element.prototype.getBoundingClientRect = rect;
    }
    // 닫은 메뉴는 다시 놓지 않는다(다음 메뉴를 건드리지 않게)
    openMenu(anchorAt(20), [{ label: '홈 뷰', run: () => {} }], '표준 뷰');
    closeMenu();
    await settle();
    expect(document.querySelector('.menu')).toBeNull();
  });
});

/**
 * 51차: 아래에 다 들어가지 않으면 더 넓은 쪽으로 펴고, 그 쪽도 모자라면 그 높이까지 펴고 메뉴 안에서 굴린다(가장자리 8px, 기준과 4px).
 * 전에는 위아래 모두 모자라면 위쪽이 더 넓어도 아래로 폈다(320×568에서 3D 보기 아래쪽을 길게 눌러 연 작업 메뉴가 다섯 줄쯤만 보임)
 */
describe('메뉴 자리: 위아래 고르기', () => {
  let mh = 100;
  const savedH = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => mh });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 568 });
  });
  afterAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 100 });
    if (savedH) Object.defineProperty(window, 'innerHeight', savedH);
  });
  /** 화면 점(client 좌표)의 작업 메뉴: 보이지 않는 기준점의 자리는 그 style 값 */
  function at(y: number, h: number): { top: number; maxH: string } {
    mh = h;
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (!(this instanceof HTMLElement) || !this.classList.contains('menu-point')) return rect.call(this);
      const x = parseFloat(this.style.left), top = parseFloat(this.style.top);
      return { left: x, right: x + 1, top, bottom: top + 1, width: 1, height: 1, x, y: top, toJSON: () => ({}) } as DOMRect;
    };
    try {
      openMenuAt(100, y, [{ label: '맞춰 보기', run: () => {} }], '작업 메뉴');
      return { top: parseFloat(menuEl().style.top), maxH: menuEl().style.maxHeight };
    } finally {
      closeMenu();
      Element.prototype.getBoundingClientRect = rect;
    }
  }

  it('아래에 다 들어가면 아래(위가 더 넓어도)', () => {
    // 누른 자리 300: 아래 568 − 301 − 12 = 255, 위 288
    expect(at(300, 200)).toEqual({ top: 305, maxH: '' });
  });

  it('아래가 모자라고 위에 다 들어가면 위', () => {
    expect(at(300, 280)).toEqual({ top: 300 - 4 - 280, maxH: '' });
  });

  it('위아래 모두 모자라면 더 넓은 쪽 — 위가 넓으면 위로 펴고 위 가장자리 8px까지(메뉴 안에서 굴림)', () => {
    // 519px 메뉴(11줄), 누른 자리 322(320×568 3D 보기 가운데쯤): 위 310 > 아래 233 → 위로 310px
    expect(at(322, 519)).toEqual({ top: 8, maxH: '310px' });
  });

  it('위아래 모두 모자라고 아래가 넓으면 아래로 펴고 아래 가장자리 8px까지', () => {
    // 누른 자리 200: 위 188, 아래 568 − 201 − 12 = 355
    expect(at(200, 519)).toEqual({ top: 205, maxH: '355px' });
  });

  it('단추 아래 메뉴도 같은 규칙(화면 아래쪽 단추 — 분해 막대 등)', () => {
    mh = 300;
    const a = document.createElement('button');
    a.getBoundingClientRect = () => ({ left: 10, right: 54, top: 470, bottom: 514, width: 44, height: 44, x: 10, y: 470, toJSON: () => ({}) }) as DOMRect;
    document.body.append(a);
    openMenu(a, [{ label: '사방', run: () => {} }], '분해 방향');
    expect([menuEl().style.top, menuEl().style.maxHeight]).toEqual([`${470 - 4 - 300}px`, '']);
    closeMenu();
    a.remove();
  });
});
