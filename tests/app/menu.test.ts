// @vitest-environment jsdom
/**
 * 34차: 메뉴 자리는 번역층(i18n.ts — 문서 변화 관찰자가 붙인 뒤 마이크로태스크로 글을 바꾼다)이 바꾼 글의 폭으로 다시 놓는다.
 * 375px 독일어 화면에서 오른쪽 끝 단추(앱 설정)의 메뉴가 한국어 폭(최소 180px)으로 놓여 번역 뒤(206px) 화면 밖으로 18px 나갔다.
 * jsdom에는 배치가 없어 메뉴 폭은 가장 긴 항목 글 길이로 흉내 낸다(글자당 9px, 최소 180px).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeMenu, menuOpen, openMenu, openMenuAt, type MenuItem } from '../../src/app/menu';

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

/**
 * 159차: 초점이 Tab·누르기 없이 메뉴 밖으로 가면(앱이 옮김 — Ctrl·⌘+F 거르기 칸, 화면 읽기 프로그램이 옮김) 닫는다(초점은 옮겨 간 칸 그대로).
 * 전에는 열린 채 남아 메뉴의 문서 캡처 키 듣기가 그 칸의 Esc(닫고 연 곳으로)·↑↓·Home·End(메뉴 항목으로)를 먼저 가져갔다(NC 152차·SKP 162차 꼴)
 */
describe('메뉴: 밖 초점에 닫기(159차)', () => {
  it('단추 아래 메뉴: 항목·연 단추로 가는 초점은 열린 채(같은 단추를 다시 누르면 닫는 차례 그대로), 밖 칸으로 가면 닫고 초점은 그 칸 — 그 칸의 Esc·↑↓·Home·End는 칸 것', () => {
    const a = anchorAt(20);
    let ran = 0;
    const items = [
      { label: '홈 뷰', run: () => ran++ },
      { label: '정면', run: () => ran++ },
    ];
    a.addEventListener('click', () => openMenu(a, items, '표준 뷰'));
    const field = document.createElement('input');
    field.type = 'search';
    document.body.append(field);
    try {
      a.click();
      const bs = [...menuEl().querySelectorAll<HTMLButtonElement>('.menu-item')];
      expect(document.activeElement).toBe(bs[0]);
      bs[1]!.focus();
      // 연 단추를 누르면 mousedown이 click보다 먼저 초점을 준다 — 그 초점에 닫으면 뒤 click이 메뉴를 다시 연다
      a.focus();
      expect([menuOpen(), a.getAttribute('aria-expanded')]).toEqual([true, 'true']);
      a.click();
      expect(menuOpen()).toBe(false);
      a.click();
      expect(menuOpen()).toBe(true);
      // 앱·화면 읽기 프로그램이 Tab·누르기 없이 초점을 밖 칸으로
      field.focus();
      expect(document.querySelector('.menu')).toBeNull();
      expect(a.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(field);
      for (const k of ['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
        const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
        field.dispatchEvent(e);
        expect([k, e.defaultPrevented, document.activeElement === field]).toEqual([k, false, true]);
      }
      expect(ran).toBe(0);
    } finally {
      closeMenu();
      field.remove();
      a.remove();
    }
  });

  it('화면 점 메뉴(작업 메뉴·겹친 것 목록): 연 자리에서 누르면 초점을 받는 칸(나무 줄·3D 보기 — 길게 누르기를 뗀 손가락의 초점)은 메뉴 쪽, 그 칸을 누르면 전처럼 닫고, 다른 칸으로 가면 닫고 onClose', () => {
    const row = document.createElement('div');
    row.tabIndex = -1;
    const name = document.createElement('span');
    name.textContent = '부품';
    row.append(name);
    const other = document.createElement('button');
    document.body.append(row, other);
    // jsdom에는 배치가 없어 그 자리 요소를 흉내 낸다(기준점은 pointer-events:none, 메뉴는 그 자리 4px 아래·위라 덮지 않는다)
    const doc = document as unknown as { elementFromPoint?: (x: number, y: number) => Element | null };
    const saved = doc.elementFromPoint;
    doc.elementFromPoint = (x, y) => (x === 50 && y === 60 ? name : null);
    let closed = 0;
    try {
      openMenuAt(50, 60, [{ label: '숨기기', run: () => {} }], '작업 메뉴', () => closed++);
      expect(document.activeElement?.classList.contains('menu-item')).toBe(true);
      row.focus();
      expect([menuOpen(), closed]).toEqual([true, 0]);
      row.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect([menuOpen(), closed, document.querySelector('.menu-point')]).toEqual([false, 1, null]);
      // 겹친 것 목록 꼴: 고르지 않고 닫히면 onClose(미리 강조 되돌리기 — ctxmenu.ts openPickList)
      openMenuAt(50, 60, [{ label: '앞 부품', run: () => {} }], '겹친 것 고르기', () => closed++);
      other.focus();
      expect([menuOpen(), closed, document.querySelector('.menu-point')]).toEqual([false, 2, null]);
      expect(document.activeElement).toBe(other);
    } finally {
      closeMenu();
      if (saved) doc.elementFromPoint = saved;
      else delete doc.elementFromPoint;
      row.remove();
      other.remove();
    }
  });
});

/**
 * 183차(WCAG 4.1.2 — 펼침 버튼 감사): 여러 개 고르기 띠 「작업」은 메뉴 버튼(aria-haspopup=menu)인데 작업 메뉴를 버튼 자리 화면 점에 열어(openMenuAt)
 * menu.ts가 aria-expanded를 보이지 않는 기준점에 두었다 — 메뉴가 열려도 버튼은 펼침이 아니었다(APG Menu Button: 메뉴가 보이면 aria-expanded=true)
 */
describe('메뉴: 화면 점 메뉴를 연 버튼의 펼침(183차)', () => {
  it('연 버튼(owner)을 주면 열 때 true, 닫는 모든 길(Esc·바깥 누르기·Tab·항목 고르기·창 폭·다른 메뉴)에서 false — 항목이 같은 자리에 다시 연 하위 메뉴도 그 버튼 것, 버튼 없이 연 메뉴는 건드리지 않음', () => {
    const owner = document.createElement('button');
    owner.setAttribute('aria-haspopup', 'menu');
    owner.setAttribute('aria-expanded', 'false');
    const outside = document.createElement('button');
    document.body.append(owner, outside);
    const other = anchorAt(10);
    const exp = () => owner.getAttribute('aria-expanded');
    const key = (k: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const open = (items: MenuItem[] = [{ label: '숨기기', run: () => {} }]) => openMenuAt(50, 60, items, '작업 메뉴', undefined, owner);
    try {
      owner.focus();
      open();
      expect([menuOpen(), exp()]).toEqual([true, 'true']);
      key('Escape');
      expect([menuOpen(), exp(), document.activeElement === owner]).toEqual([false, 'false', true]);
      open();
      outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect([menuOpen(), exp()]).toEqual([false, 'false']);
      open();
      key('Tab');
      expect([menuOpen(), exp()]).toEqual([false, 'false']);
      open();
      menuEl().querySelector<HTMLButtonElement>('.menu-item')!.click();
      expect([menuOpen(), exp()]).toEqual([false, 'false']);
      open();
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
      window.dispatchEvent(new Event('resize'));
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
      expect([menuOpen(), exp()]).toEqual([false, 'false']);
      open();
      openMenu(other, [{ label: '홈 뷰', run: () => {} }], '표준 뷰');
      expect([menuOpen(), exp(), other.getAttribute('aria-expanded')]).toEqual([true, 'false', 'true']);
      closeMenu();
      // 작업 메뉴 「불투명도…」·손가락 기기 「그 밖의 작업…」(ctxmenu.ts — 같은 자리에 openMenuAt): 하위 메뉴도 이 버튼이 펼친 것(도구 막대 「보기 설정 → 내보내기…」와 같은 끝 상태)
      open([{ label: '불투명도…', run: () => void openMenuAt(50, 60, [{ label: '50%', run: () => {} }], '불투명도') }]);
      menuEl().querySelector<HTMLButtonElement>('.menu-item')!.click();
      expect([menuEl()?.getAttribute('aria-label'), exp()]).toEqual(['불투명도', 'true']);
      key('Escape');
      expect([menuOpen(), exp()]).toEqual([false, 'false']);
      // 버튼 없이 연 화면 점 메뉴(3D 보기 오른쪽 누르기·길게 누르기·나무 줄)는 그 버튼을 건드리지 않는다
      openMenuAt(50, 60, [{ label: '숨기기', run: () => {} }], '작업 메뉴');
      expect([menuOpen(), exp()]).toEqual([true, 'false']);
      closeMenu();
    } finally {
      closeMenu();
      owner.remove();
      outside.remove();
      other.remove();
    }
  });

  it('「작업」 버튼은 처음 aria-expanded=false인 메뉴 버튼이고 작업 메뉴를 자기를 연 버튼으로 넘겨 연다(app.ts 원문 — 앱 전체는 시험에서 띄우지 않는다, 169차 꼴)', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const made = /this\.selMore = h\('button', \{([^}]*)\}/.exec(app)?.[1] ?? '';
    expect([made.includes("'aria-haspopup': 'menu'"), made.includes("'aria-expanded': 'false'")]).toEqual([true, true]);
    const click = /this\.selMore\.addEventListener\('click', \(\) => \{([\s\S]*?)\n {4}\}\);/.exec(app)?.[1] ?? '';
    expect(click).toMatch(/this\.openContextMenu\([^)]*, this\.selMore\);/);
    const open = /\n {2}openContextMenu\(([^)]*)\): void \{([\s\S]*?)\n {2}\}/.exec(app);
    expect(open?.[1]).toBe('clientX: number, clientY: number, owner?: HTMLElement');
    expect(open?.[2]).toContain("openMenuAt(clientX, clientY, items, '작업 메뉴', undefined, owner)");
  });
});
