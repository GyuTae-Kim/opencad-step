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
