// @vitest-environment jsdom
/**
 * 나무 조각(src/app/treeview.ts — 49차): 큰 조립의 제품 나무·부품별 보이기 표를 보이는 줄만 만드는 가상 목록.
 * jsdom에는 배치가 없으므로 패널 본문(스크롤 상자)은 높이 280px, 나무 목록은 본문 위에서 120px 아래, 표 목록은 300px 아래에 있다고 흉내 낸다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupInfo } from 'opencad-viewer3d';
import { createDoc, type ProductNode, type StepDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import { siblingInfo, type TreeView } from '../../src/app/treeview';
import { Fmt } from '../../src/app/display';

const VIEW = 280;
const TREE_TOP = 120;
const GRID_TOP = 300;
/** 아래 띠(고른 것)가 보이면 본문이 그만큼 줄어든다 */
const FOOT = 58;
const viewOf = (body: Element) => (body.parentElement?.querySelector<HTMLElement>('.panel-foot')?.hidden === false ? VIEW - FOOT : VIEW);

/** 뿌리 → 모듈 mods개 → 모듈마다 부품 per개(자리 이름 p1…) */
function bigDoc(mods = 40, per = 100): StepDoc {
  let k = 0;
  const part = (m: number, p: number): ProductNode => ({ name: `part-${m}-${p}`, productId: `pp-${m}-${p}`, instance: `p${p}`, meshIds: [`mesh-${k++}`], children: [] });
  const mod = (m: number): ProductNode => ({ name: `mod-${m}`, productId: `mod-${m}`, instance: `m${m}`, meshIds: [], children: Array.from({ length: per }, (_, p) => part(m, p + 1)) });
  const products = [{ name: 'asm', productId: 'asm', meshIds: [], children: Array.from({ length: mods }, (_, m) => mod(m + 1)) }];
  return createDoc('big.stp', 1, { scene: { meshes: [], lines: [], meta: { products } }, ms: 1 } as unknown as ParseResult);
}

function host(d: StepDoc, groups: GroupInfo[] = []) {
  const calls: string[] = [];
  const h = new Proxy(
    {
      measuring: false,
      measureKind: 'points',
      touch: false,
      multiPick: false,
      fmt: new Fmt('mm'),
      isVisible: () => true,
      groups: () => groups,
      selectKey: (k: string | null) => {
        calls.push(`select ${k}`);
        d.selKey = k;
      },
      setItemsVisible: (ids: readonly string[], on: boolean) => calls.push(`visible ${ids.length} ${on}`),
      setGroupVisible: (name: string, on: boolean) => calls.push(`group ${name} ${on}`),
    } as Record<string, unknown>,
    { get: (t, k) => (k in t ? t[k as string] : () => calls.push(String(k))) },
  ) as unknown as PanelHost;
  return { host: h, calls };
}

/** 배치 흉내: 패널 본문의 스크롤 자리와 그에 따른 목록 자리 */
let scrollTop = 0;
beforeEach(() => {
  scrollTop = 0;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const at = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 300, width: 300, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
    if (this.classList.contains('panel-body')) return at(0, viewOf(this));
    if (this.classList.contains('tree')) return at(TREE_TOP - scrollTop, parseFloat(this.style.height) || 0);
    if (this.getAttribute('role') === 'rowgroup') return at(GRID_TOP - scrollTop, parseFloat(this.style.height) || 0);
    return at(0, 0);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function mount(d: StepDoc, groups: GroupInfo[] = []) {
  const { host: hst, calls } = host(d, groups);
  const panel = new Panel(hst);
  panel.kit = TV;
  document.body.append(panel.el);
  const body = panel.el.querySelector<HTMLElement>('.panel-body')!;
  Object.defineProperty(body, 'clientHeight', { configurable: true, get: () => viewOf(body) });
  Object.defineProperty(body, 'scrollTop', { configurable: true, get: () => scrollTop, set: (v: number) => void (scrollTop = Math.max(0, v)) });
  panel.show(d);
  const tree = () => (panel as unknown as { tree: TreeView }).tree;
  const rows = () => [...panel.el.querySelectorAll<HTMLElement>('.tree-row')];
  const row = (key: string) => panel.el.querySelector<HTMLElement>(`.tree-row[data-key="${key}"]`);
  const key = (k: string, el: Element = document.activeElement!) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const scroll = (y: number) => {
    scrollTop = y;
    tree().list.update();
  };
  return { panel, body, calls, tree, rows, row, key, scroll };
}

describe('형제 차례(aria-setsize·aria-posinset)', () => {
  it('깊이 우선 줄에서 부모·형제 차례·형제 수', () => {
    const { parent, pos, size } = siblingInfo([0, 1, 2, 2, 1, 2, 0].map((depth) => ({ depth })));
    expect([...parent]).toEqual([-1, 0, 1, 1, 0, 4, -1]);
    expect([...pos]).toEqual([1, 1, 1, 2, 2, 1, 2]);
    expect([...size]).toEqual([2, 2, 2, 2, 2, 1, 2]);
  });
});

describe('제품 나무 가상 목록', () => {
  it('4,041줄 나무: 보이는 줄과 여유 줄만 만들고, 목록 높이는 줄 수 × 줄 높이, 3,000줄 한도 없이 끝까지', () => {
    const d = bigDoc();
    const { panel, rows, row } = mount(d);
    const list = panel.el.querySelector<HTMLElement>('.tree')!;
    expect(list.getAttribute('role')).toBe('tree');
    expect(list.style.height).toBe(`${4041 * 28}px`);
    // 화면 280px = 10줄 + 앞뒤 여유(8줄 이상) — 처음 몇십 줄만
    expect(rows().length).toBeGreaterThan(10);
    expect(rows().length).toBeLessThan(40);
    expect(panel.el.querySelector('.tree-more')).toBeNull();
    // 줄은 제자리(top = 차례 × 28px), 차례대로
    expect(rows().map((r) => Number(r.dataset.i))).toEqual(rows().map((_, i) => i));
    expect(row('0/0/0')!.style.top).toBe(`${2 * 28}px`);
    // 스크린 리더: 깊이·형제 수·형제 가운데 차례(화면 밖 줄이 없어도 구조를 읽는다)
    const aria = (k: string) => ['aria-level', 'aria-setsize', 'aria-posinset'].map((a) => row(k)!.getAttribute(a));
    expect(aria('0')).toEqual(['1', '1', '1']);
    expect(aria('0/0')).toEqual(['2', '40', '1']);
    expect(aria('0/0/5')).toEqual(['3', '100', '6']);
    expect(row('0/0')!.getAttribute('aria-expanded')).toBe('true');
    // 탭 멈춤은 한 줄(첫 줄)과 그 눈 단추
    expect(rows().filter((r) => r.tabIndex === 0).map((r) => r.dataset.key)).toEqual(['0']);
    expect(row('0')!.querySelector('.eye')!.getAttribute('tabindex')).toBe('0');
    expect(row('0/0')!.querySelector('.eye')!.getAttribute('tabindex')).toBe('-1');
  });

  it('스크롤하면 그 자리 줄을 만들고 지나간 줄은 지운다(탭 멈춤 줄은 남긴다)', () => {
    const d = bigDoc();
    const { rows, row, scroll } = mount(d);
    const first = row('0/0/3');
    expect(first).not.toBeNull();
    scroll(50_000);
    const idx = rows().map((r) => Number(r.dataset.i));
    // 보이는 첫 줄 차례 = (50,000 − 120) / 28 ≈ 1,781
    const at = Math.floor((50_000 - TREE_TOP) / 28);
    expect(idx).toContain(at);
    expect(idx).toContain(at + 9);
    expect(row('0/0/3')).toBeNull();
    expect(first!.isConnected).toBe(false);
    // 탭 멈춤 줄(첫 줄)은 화면 밖이어도 남아 Tab으로 들어올 수 있다, DOM 차례도 지킨다
    expect(idx[0]).toBe(0);
    expect(idx.slice(1).every((v, i) => v > idx[i]!)).toBe(true);
    expect(rows().length).toBeLessThan(45);
    // 다시 위로
    scroll(0);
    expect(row('0/0/3')).not.toBeNull();
  });

  it('글쇠: ↓↑·Home·End는 화면 밖 줄이면 스크롤해 만든 뒤 초점, →는 펼친 줄의 첫 자식, ←는 부모·접기', () => {
    const d = bigDoc();
    const { body, row, key, rows } = mount(d);
    row('0')!.focus();
    key('End');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0/39/99');
    // 마지막 줄이 화면 아래 끝에 오게 스크롤했다(줄 위 = 120 + 4,040 × 28)
    expect(body.scrollTop).toBe(TREE_TOP + 4040 * 28 + 28 - VIEW);
    expect(rows().filter((r) => r.tabIndex === 0).map((r) => r.dataset.key)).toEqual(['0/39/99']);
    key('ArrowUp');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0/39/98');
    key('Home');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0');
    expect(body.scrollTop).toBe(TREE_TOP);
    key('ArrowDown');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0/0');
    key('ArrowRight');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0/0/0');
    key('ArrowLeft');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0/0');
    // 펼친 줄에서 ← = 접기(다시 그려도 초점은 그 줄에), 줄 수가 100 줄어든다
    key('ArrowLeft');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0/0');
    expect(row('0/0')!.getAttribute('aria-expanded')).toBe('false');
    expect(row('0/1')!.style.top).toBe(`${2 * 28}px`);
    expect(row('0/0')!.tabIndex).toBe(0);
    key('ArrowRight');
    expect(row('0/0')!.getAttribute('aria-expanded')).toBe('true');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0/0');
    // ↑ 첫 줄 위는 이름 거르기 칸
    key('Home');
    key('ArrowUp');
    expect(document.activeElement!.classList.contains('tree-filter')).toBe(true);
    // 거르기 칸에서 ↓ = 첫 줄
    key('ArrowDown');
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0');
  });

  it('초점이 든 줄은 화면 밖으로 스크롤해도 남고, Enter·Space는 고르기(눈 단추의 Enter는 단추 그대로)', () => {
    const d = bigDoc();
    const { panel, row, key, scroll, calls } = mount(d);
    row('0/0/2')!.focus();
    const el = document.activeElement;
    scroll(80_000);
    expect(el!.isConnected).toBe(true);
    expect(document.activeElement).toBe(el);
    key('Enter');
    expect(calls).toContain('select 0/0/2');
    // 고르기만 바뀌면(앱이 패널에 알린다) 줄은 그대로(다시 그리지 않음), 표시만
    panel.onSelection();
    expect(row('0/0/2')).toBe(el);
    expect(el!.classList.contains('sel')).toBe(true);
    calls.length = 0;
    const eye = row('0/0/2')!.querySelector<HTMLElement>('.eye')!;
    key('Enter', eye);
    expect(calls).toEqual([]);
  });

  it('3D에서 고른 줄이 화면 밖이면 그 줄로 스크롤해 만든다(펼침이 그대로면 다시 그리지 않음, 처음 나타나는 아래 띠 뒤에 숨지 않게)', () => {
    const d = bigDoc();
    const { panel, body, row } = mount(d);
    const top = row('0');
    expect(panel.el.querySelector<HTMLElement>('.panel-foot')!.hidden).toBe(true);
    d.selKey = '0/30/50';
    panel.onSelection(true);
    expect(row('0')).toBe(top);
    const sel = row('0/30/50')!;
    expect(sel.classList.contains('sel')).toBe(true);
    expect(sel.getAttribute('aria-selected')).toBe('true');
    // 차례 1 + 30 × 101 + 1 + 50 = 3,082 — 그 줄 아래가 (아래 띠가 나타나 줄어든) 화면 아래 끝
    expect(panel.el.querySelector<HTMLElement>('.panel-foot')!.hidden).toBe(false);
    expect(body.scrollTop).toBe(TREE_TOP + 3082 * 28 + 28 - (VIEW - FOOT));
    // 이미 보이면 그대로
    d.selKey = '0/30/49';
    panel.onSelection(true);
    expect(body.scrollTop).toBe(TREE_TOP + 3082 * 28 + 28 - (VIEW - FOOT));
  });

  it('이름 거르기: 맞는 마디와 조상만 줄로(형제 수도 거른 줄로), ↓로 첫 줄', async () => {
    const d = bigDoc();
    const { panel, rows, row } = mount(d);
    const input = panel.el.querySelector<HTMLInputElement>('.tree-filter')!;
    input.focus();
    input.value = 'p77';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 220));
    expect(panel.el.querySelector('.filter-info')!.textContent).toBe('맞는 마디 40개 (조상 마디와 함께 보입니다)');
    expect(panel.el.querySelector<HTMLElement>('.tree')!.style.height).toBe(`${81 * 28}px`);
    expect(row('0/0')!.getAttribute('aria-setsize')).toBe('40');
    expect(row('0/0/76')!.classList.contains('match')).toBe(true);
    expect(row('0/0/76')!.getAttribute('aria-setsize')).toBe('1');
    expect(rows().length).toBeLessThan(81);
    // 초점이 거르기 칸에 남고, ↓로 첫 줄
    expect(document.activeElement).toBe(panel.el.querySelector('.tree-filter'));
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect((document.activeElement as HTMLElement).dataset.key).toBe('0');
  });

  it('Ctrl·⌘+F(50차): 나무가 보이면 거르기 칸으로(글 고름), 칸에서 한 번 더 누르면 브라우저 찾기, 패널이 닫혔거나 다른 탭·Shift·Alt면 가로채지 않음', () => {
    const d = bigDoc();
    const { panel, row } = mount(d);
    const find = (target: Element, o: KeyboardEventInit = { ctrlKey: true }) => {
      const ev = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ...o });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const input = () => panel.el.querySelector<HTMLInputElement>('.tree-filter')!;
    // 칸에 단축키를 알린다(화면 읽기 프로그램·말풍선)
    expect(input().getAttribute('aria-keyshortcuts')).toBe('Control+F Meta+F');
    expect(input().title).toContain('Ctrl·⌘+F');
    // 패널이 닫혀 있으면(휴대폰 시트를 닫음 등) 브라우저 찾기 그대로
    panel.setOpen(false);
    expect(find(document.body)).toBe(false);
    panel.setOpen(true);
    input().value = 'p7';
    // 나무 줄에 초점이 있어도, 문서 어디서나: 거르기 칸으로 옮기고 글을 고른다
    row('0/0/1')!.focus();
    expect(find(document.activeElement!)).toBe(true);
    expect(document.activeElement).toBe(input());
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, 2]);
    // 칸에서 한 번 더: 가로채지 않는다(브라우저 찾기)
    expect(find(input())).toBe(false);
    // ⌘+F(맥)도, Shift·Alt가 붙으면(다른 찾기 단축키) 건드리지 않는다
    expect(find(document.body, { metaKey: true })).toBe(true);
    expect(find(document.body, { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(find(document.body, { ctrlKey: true, altKey: true })).toBe(false);
    expect(find(document.body, {})).toBe(false);
    // 다른 탭으로 바꾸면(거르기 칸이 DOM에서 빠짐) 브라우저 찾기 그대로
    panel.setTab('info');
    expect(input()).toBeNull();
    expect(find(document.body)).toBe(false);
  });

  it('Ctrl·⌘+F(51차): 다른 글 칸(단면 위치·분해 거리 등)에 초점이 있으면 가로채지 않고, 칸으로 초점을 옮기지 못하면(모달 뒤 inert 등) 막지 않는다', () => {
    const d = bigDoc();
    const { panel, row } = mount(d);
    const find = (target: Element) => {
      const ev = new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true, ctrlKey: true });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const input = () => panel.el.querySelector<HTMLInputElement>('.tree-filter')!;
    panel.setOpen(true);
    // 단면 위치(숫자)·분해 거리(글)·글 상자: 쳐 넣던 칸을 떠나면 값이 걸리므로 그 칸에서는 브라우저 찾기
    for (const make of [
      () => Object.assign(document.createElement('input'), { type: 'number', className: 'section-num' }),
      () => Object.assign(document.createElement('input'), { type: 'text', className: 'explode-num' }),
      () => document.createElement('textarea'),
    ]) {
      const f = make();
      document.body.append(f);
      f.focus();
      expect(find(f)).toBe(false);
      expect(document.activeElement).toBe(f);
      f.remove();
    }
    // 밀대는 글 칸이 아니라 그대로 거르기 칸으로
    const slider = Object.assign(document.createElement('input'), { type: 'range' });
    document.body.append(slider);
    slider.focus();
    expect(find(slider)).toBe(true);
    expect(document.activeElement).toBe(input());
    slider.remove();
    // 칸에 초점이 가지 않으면(모달 대화 상자가 열려 패널이 inert — jsdom에는 inert가 없어 focus를 막아 흉내) 막지 않아 브라우저 찾기가 열린다
    row('0/0/1')!.focus();
    const stuck = vi.spyOn(input(), 'focus').mockImplementation(() => {});
    expect(find(document.body)).toBe(false);
    expect(document.activeElement).toBe(row('0/0/1'));
    stuck.mockRestore();
    expect(find(document.body)).toBe(true);
  });

  it('눈 단추로 숨기면(다시 그림) 초점이 새 줄의 눈 단추로 돌아온다', () => {
    const d = bigDoc();
    const { panel, row, calls } = mount(d);
    const eye = row('0/0/1')!.querySelector<HTMLElement>('.eye')!;
    eye.focus();
    eye.click();
    expect(calls).toContain('visible 1 false');
    panel.onVisibility();
    expect(eye.isConnected).toBe(false);
    expect(document.activeElement).toBe(row('0/0/1')!.querySelector('.eye'));
  });
});

describe('부품별 보이기 표 가상 목록', () => {
  const groups = (n: number): GroupInfo[] => Array.from({ length: n }, (_, i) => ({ name: `부품 이름이 아주 긴 묶음-${i + 1}`, count: i + 1, visible: i % 3 !== 0 }) as GroupInfo);

  it('2,000줄 표: ARIA table(행 수·행 차례), 보이는 줄만, 고르기 상자에 초점이 들면 다음 줄도 만든다', () => {
    const d = bigDoc(2, 3);
    const { panel, calls } = mount(d, groups(2000));
    const grid = panel.el.querySelector<HTMLElement>('.vgrid')!;
    expect(grid.getAttribute('role')).toBe('table');
    expect(grid.getAttribute('aria-rowcount')).toBe('2001');
    const head = grid.querySelector('.vgrid-head')!;
    expect([...head.querySelectorAll('[role=columnheader]')].map((x) => x.textContent)).toEqual(['부품', '자리']);
    const body = grid.querySelector<HTMLElement>('[role=rowgroup]')!;
    const shown = () => [...body.querySelectorAll<HTMLElement>('[role=row]')];
    expect(body.style.height).toBe(`${2000 * 26}px`);
    expect(shown().length).toBeLessThan(30);
    expect(shown()[0]!.getAttribute('aria-rowindex')).toBe('2');
    expect(shown()[0]!.classList.contains('off')).toBe(true);
    expect(shown()[0]!.querySelector('[role=cell].num')!.textContent).toBe('1');
    // 긴 이름은 말줄임 — 전체 이름은 말풍선
    expect(shown()[1]!.querySelector('span[title]')!.getAttribute('title')).toBe('부품 이름이 아주 긴 묶음-2');
    const last = shown().at(-1)!;
    const n = Number(last.dataset.i);
    last.querySelector<HTMLInputElement>('input')!.focus();
    expect(shown().some((r) => Number(r.dataset.i) === n + 1)).toBe(true);
    const cb = last.querySelector<HTMLInputElement>('input')!;
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
    expect(calls.at(-1)).toBe(`group 부품 이름이 아주 긴 묶음-${n + 1} ${cb.checked}`);
  });
});
