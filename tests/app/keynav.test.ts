// @vitest-environment jsdom
/**
 * 53차 키보드만으로 쓰기(WAI-ARIA APG Tabs·Radio Group·Toolbar·Menu, WCAG 2.4.3 초점 차례):
 * - keynav.ts: 탭·라디오·도구 막대 화살표, Tab 멈춤 하나(roving tabindex), 띠·패널을 닫을 때 초점 돌려주기
 * - panel.ts: 탭을 고르면 다시 만든 고른 탭으로 초점, 탭 본문 aria-controls·Tab 멈춤, 보이기 상자를 바꿔 다시 그려도 초점 그대로, 아래 띠 알림 끄고 켜기
 * - menu.ts: Home·End(창 글쇠로 새지 않게), 화면 점 메뉴를 닫으면 연 때 초점이 있던 곳으로 — 188차: Tab·Shift+Tab으로 닫아도 연 곳으로(기본 이동은 그 자리에서)
 * 헤드리스 Chrome 점검(.runtime/r53 kbd53)에서 찾은 것을 jsdom으로 다시 본다(jsdom은 숨긴 칸의 초점을 스스로 떼지 않아, 숨기는 명령이 브라우저처럼 blur한다).
 * - app.ts 격리 띠(145차): 알림은 바뀌는 글 칸만, 띠의 버튼은 알림 영역 밖(53차 측정 띠 꼴) — 180차: 이름 칸 글은 말풍선에도(말줄임된 이름을 다시 봄)
 * - 단면·분해 막대(146차): 속 수(0~1000·0~100) 대신 옆에 보이는 값 글을 aria-valuetext로(NC 140차 꼴 — 번역층이 옮기지 않아 낱말 없이)
 * - 측정 띠 글 칸이 CSS로 숨는 화면(147차 — 넓은 화면·마우스의 면 고르기·고른 부품 카드): 패널 아래 띠가 알린다(SKP 152차 표 ⑤ 꼴)
 * - app.ts 진행 카드(157차): 숨어 있던 카드를 보일 때 단계 칸(알림 칸)은 빈 채로 한 번 그린 뒤 첫 글을 넣는다 — 189차: 카드가 숨을 때 「취소」에 있던 초점은 3D 보기·「파일 열기」로
 * - 손잡이(187차): 패널 크기 손잡이는 크기를 바꾸는 패널을 aria-controls로(APG 창 가르개), 3D 보기 위 단면 손잡이는 끌기만 받는 꾸밈(aria-hidden — 값은 단면 막대 밀대)
 *   — 200차: 도구 막대 「패널」 버튼도 열고 닫는 그 패널을 aria-controls로(상태는 183차 결정대로 눌림만)
 * - 도구 막대(199차): 「고른 부품 보기」에 초점을 둔 채 Esc로 고르기를 풀어 그 단추가 흐려지면 초점은 막대의 Tab 멈춤(첫 쓸 수 있는 단추)으로
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { h, icon } from '../../src/app/dom';
import { installKeyNav, moveIndex } from '../../src/app/keynav';
import { controlOf, isTextTarget, routeKey } from '../../src/app/keys';
import { closeMenu, openMenu, openMenuAt } from '../../src/app/menu';
import { createDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import { Panel, type PanelHost } from '../../src/app/panel';
import { Fmt } from '../../src/app/display';
import { SectionBar } from '../../src/app/sectionbar';
import { PanelResizer } from '../../src/app/resize';
import { Toolbar, type ToolbarHost } from '../../src/app/toolbar';
import type { SectionState, Viewer3d } from 'opencad-viewer3d';
import { translate } from '../../site/i18n.mjs';

const key = (el: Element, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  return e;
};
const settle = () => new Promise((r) => setTimeout(r, 0));
let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
  closeMenu();
  document.body.innerHTML = '';
});

function button(attrs: Record<string, string>, text = ''): HTMLButtonElement {
  const b = document.createElement('button');
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  b.textContent = text;
  return b;
}

describe('moveIndex: 화살표 → 차례(끝에서 돌아감)', () => {
  it('탭은 ←·→·Home·End, 라디오는 ←·↑·→·↓, 도구 막대는 ←·→만', () => {
    expect(moveIndex('tab', 'ArrowRight', 4, 5)).toBe(0);
    expect(moveIndex('tab', 'ArrowLeft', 0, 5)).toBe(4);
    expect(moveIndex('tab', 'Home', 3, 5)).toBe(0);
    expect(moveIndex('tab', 'End', 1, 5)).toBe(4);
    expect(moveIndex('tab', 'ArrowDown', 1, 5)).toBe(-1);
    expect(moveIndex('radio', 'ArrowDown', 1, 2)).toBe(0);
    expect(moveIndex('radio', 'ArrowUp', 0, 3)).toBe(2);
    expect(moveIndex('tool', 'ArrowRight', 2, 3)).toBe(0);
    // 도구 막대의 Home·End는 앱의 홈 뷰 글쇠로 남긴다
    expect(moveIndex('tool', 'Home', 2, 3)).toBe(-1);
    expect(moveIndex('tool', 'ArrowDown', 0, 3)).toBe(-1);
    expect(moveIndex('tab', 'ArrowRight', -1, 3)).toBe(-1);
  });
});

describe('installKeyNav: 탭·라디오·도구 막대', () => {
  it('탭: →로 다음 탭에 초점을 옮기고 고르며(자동 활성), Home·End, 기본 동작을 막아 앱 창 글쇠(홈 뷰)로 새지 않는다', () => {
    const root = document.createElement('div');
    const list = document.createElement('div');
    list.setAttribute('role', 'tablist');
    const picked: string[] = [];
    const tabs = ['a', 'b', 'c'].map((k, i) => {
      const t = button({ role: 'tab', 'aria-selected': String(i === 0), tabindex: i ? '-1' : '0' }, k);
      t.addEventListener('click', () => {
        picked.push(k);
        for (const x of list.children) x.setAttribute('aria-selected', String(x === t));
      });
      list.append(t);
      return t;
    });
    root.append(list);
    document.body.append(root);
    dispose = installKeyNav(root);
    let leaked = 0;
    window.addEventListener('keydown', (e) => !e.defaultPrevented && leaked++, { once: true });
    tabs[0]!.focus();
    expect(key(tabs[0]!, 'ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(tabs[1]);
    expect(picked).toEqual(['b']);
    key(tabs[1]!, 'End');
    expect(document.activeElement).toBe(tabs[2]);
    key(tabs[2]!, 'ArrowRight');
    expect(document.activeElement).toBe(tabs[0]);
    key(tabs[0]!, 'Home');
    // 이미 고른 탭이면 다시 누르지 않는다
    expect(picked).toEqual(['b', 'c', 'a']);
    expect(leaked).toBe(0);
    // 수식 글쇠와 함께면 받지 않는다(Alt+→ 등 브라우저 글쇠)
    expect(key(tabs[0]!, 'ArrowRight', { altKey: true }).defaultPrevented).toBe(false);
  });

  it('라디오: ↓로 다음 라디오를 고르고, Tab 멈춤은 고른 라디오 하나(aria-checked가 바뀌면 맞춘다 — 숨은 띠 안이어도)', async () => {
    const root = document.createElement('div');
    const g = document.createElement('div');
    g.setAttribute('role', 'radiogroup');
    const rs = ['points', 'entities'].map((k) => {
      const r = button({ role: 'radio', 'aria-checked': String(k === 'points') }, k);
      r.addEventListener('click', () => {
        for (const x of g.children) x.setAttribute('aria-checked', String(x === r));
      });
      g.append(r);
      return r;
    });
    root.append(g);
    document.body.append(root);
    dispose = installKeyNav(root);
    expect(rs.map((r) => r.tabIndex)).toEqual([0, -1]);
    rs[0]!.focus();
    key(rs[0]!, 'ArrowDown');
    await settle();
    expect(document.activeElement).toBe(rs[1]);
    expect(rs.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(rs.map((r) => r.tabIndex)).toEqual([-1, 0]);
    // 띠를 숨긴 채 앱이 고른 것을 바꿔도 고른 것이 멈춤
    g.hidden = true;
    rs[0]!.click();
    await settle();
    expect(rs.map((r) => r.tabIndex)).toEqual([0, -1]);
  });

  it('도구 막대: Tab 멈춤은 하나, ←·→는 흐린 단추를 건너뛰고, 흐려진 멈춤은 첫 쓸 수 있는 단추로, 메뉴 단추는 ↓로 연다', async () => {
    const root = document.createElement('div');
    const tb = document.createElement('nav');
    tb.setAttribute('role', 'toolbar');
    let opened = 0;
    const bs = ['fit', 'focus', 'views', 'measure'].map((k) => {
      const b = button({ 'data-tool': k }, k);
      tb.append(b);
      return b;
    });
    bs[1]!.disabled = true;
    bs[2]!.setAttribute('aria-haspopup', 'menu');
    bs[2]!.addEventListener('click', () => opened++);
    root.append(tb);
    document.body.append(root);
    dispose = installKeyNav(root);
    expect(bs.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    bs[0]!.focus();
    key(bs[0]!, 'ArrowRight');
    expect(document.activeElement).toBe(bs[2]);
    expect(bs.map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(key(bs[2]!, 'ArrowDown').defaultPrevented).toBe(true);
    expect(opened).toBe(1);
    key(bs[2]!, 'ArrowLeft');
    expect(document.activeElement).toBe(bs[0]);
    key(bs[0]!, 'ArrowLeft');
    expect(document.activeElement).toBe(bs[3]);
    // 멈춤 단추가 흐려지면(문서를 다시 여는 동안 등) 첫 쓸 수 있는 단추로
    bs[3]!.blur();
    bs[3]!.disabled = true;
    await settle();
    expect(bs.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    // 도구 막대의 Home은 앱 홈 뷰 글쇠로 넘긴다
    expect(key(bs[0]!, 'Home').defaultPrevented).toBe(false);
  });
});

describe('installKeyNav: 띠·패널을 닫으면 초점 돌려주기(WCAG 2.4.3)', () => {
  function app() {
    const root = document.createElement('div');
    root.innerHTML =
      '<nav class="toolbar" role="toolbar"><button data-tool="measure">측정</button><button data-tool="panel">패널</button></nav>' +
      '<section class="view"><div class="viewer-host"><canvas tabindex="0"></canvas></div>' +
      '<div class="measure-bar"><button class="end">측정 끝내기</button><input class="num"></div></section>' +
      '<aside class="panel"><div role="tablist"><button role="tab" aria-selected="true">제품</button></div><button class="close">패널 닫기</button><button class="redraw">모두 펼치기</button></aside>';
    document.body.append(root);
    dispose = installKeyNav(root);
    return root;
  }

  it('측정 띠의 끝내기를 누르면 띠가 숨고 초점이 3D 보기로(브라우저가 숨긴 단추의 초점을 아직 떼지 않았어도)', async () => {
    const root = app();
    const bar = root.querySelector<HTMLElement>('.measure-bar')!;
    const end = bar.querySelector<HTMLButtonElement>('.end')!;
    end.addEventListener('click', () => (bar.hidden = true));
    end.focus();
    end.click();
    // Chrome은 숨긴 단추의 초점을 다음 그리기 때 뗀다 — 그 전에도 보이지 않으면 잃은 것으로 본다
    expect(document.activeElement).toBe(end);
    await settle();
    expect(document.activeElement).toBe(root.querySelector('canvas'));
  });

  it('띠 안 칸에서 Enter로 칸을 떠나도(blur) 3D 보기로, 명령이 스스로 초점을 옮겼으면 그대로', async () => {
    const root = app();
    const num = root.querySelector<HTMLInputElement>('.num')!;
    num.addEventListener('keydown', (e) => e.key === 'Enter' && num.blur());
    num.focus();
    key(num, 'Enter');
    await settle();
    expect(document.activeElement).toBe(root.querySelector('canvas'));
    const end = root.querySelector<HTMLButtonElement>('.end')!;
    const other = root.querySelector<HTMLButtonElement>('[data-tool=measure]')!;
    end.addEventListener('click', () => other.focus());
    end.focus();
    end.click();
    await settle();
    expect(document.activeElement).toBe(other);
  });

  it('패널 닫기 → 도구 막대의 패널 단추, 패널이 그대로인데 다시 그려 초점을 잃으면 고른 탭으로', async () => {
    const root = app();
    const panel = root.querySelector<HTMLElement>('.panel')!;
    const close = panel.querySelector<HTMLButtonElement>('.close')!;
    close.addEventListener('click', () => {
      panel.hidden = true;
      close.blur();
    });
    const redraw = panel.querySelector<HTMLButtonElement>('.redraw')!;
    redraw.addEventListener('click', () => redraw.blur());
    redraw.focus();
    redraw.click();
    await settle();
    expect(document.activeElement).toBe(panel.querySelector('[role=tab]'));
    close.focus();
    close.click();
    await settle();
    expect(document.activeElement).toBe(root.querySelector('[data-tool=panel]'));
  });

  it('126차: 측정 띠 "다시 재기"처럼 누른 결과 그 단추가 흐려지면(disabled) 초점이 3D 보기로, 흐려지지 않으면 그 단추에 그대로', async () => {
    const root = app();
    const bar = root.querySelector<HTMLElement>('.measure-bar')!;
    const clear = button({ type: 'button', class: 'clear' }, '다시 재기');
    const keep = button({ type: 'button', class: 'keep' }, '맞춰 보기');
    bar.prepend(clear, keep);
    // 앱의 다시 재기: 찍은 점과 결과를 지우면 지울 것이 없어 흐려진다
    clear.addEventListener('click', () => (clear.disabled = true));
    // 키보드: Enter keydown 뒤 브라우저가 누르기(click)를 낸다
    clear.focus();
    key(clear, 'Enter');
    clear.click();
    // jsdom은 흐려진 단추의 초점을 떼지 않는다(브라우저는 focus fixup으로 문서로 — 흐려진 요소는 초점 자리가 아님)
    expect(document.activeElement).toBe(clear);
    await settle();
    expect(document.activeElement).toBe(root.querySelector('canvas'));
    // 누른 단추가 그대로 쓸 수 있으면 초점은 그 단추에 남는다
    keep.focus();
    keep.click();
    await settle();
    expect(document.activeElement).toBe(keep);
  });

  it('199차: 도구 막대 「고른 부품 보기」에 초점을 둔 채 Esc로 고르기를 풀어 그 단추가 흐려지면 초점은 막대의 Tab 멈춤(첫 쓸 수 있는 단추 — 전체 보기)으로, 막대 밖이거나 흐려지지 않은 단추면 그대로', async () => {
    let sel = true;
    const state = { hasDoc: true, get hasSelection() { return sel; }, projection: 'perspective', renderMode: 'shaded', gridOn: false, cubeOn: false, axesOn: false,
      measuring: false, panelOpen: false, pickUnit: 'part', multiPick: false, sectionAxis: null, sectionOn: false } as Record<string, unknown>;
    const tb = new Toolbar(new Proxy(state, { get: (t, k) => (k in t ? t[k as string] : () => {}) }) as unknown as ToolbarHost);
    const root = document.createElement('div');
    root.innerHTML = '<section class="view"><div class="viewer-host"><canvas tabindex="0"></canvas></div></section>';
    root.prepend(tb.el);
    document.body.append(root);
    dispose = installKeyNav(root);
    // app.ts onKey(창 bubble): Esc → clearSelection → selectionChanged → toolbar.refresh()(고른 것이 없으면 「고른 부품 보기」가 흐려진다 — H 숨기기도 같은 길)
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      sel = false;
      tb.refresh();
    };
    window.addEventListener('keydown', esc);
    try {
      const tool = (k: string) => tb.el.querySelector<HTMLButtonElement>(`[data-tool=${k}]`)!;
      const stops = () => [...tb.el.querySelectorAll<HTMLButtonElement>(':scope > button')].filter((b) => b.tabIndex === 0);
      tool('focus').focus();
      key(tool('focus'), 'Escape');
      expect(tool('focus').disabled).toBe(true);
      // jsdom은 흐려진 단추의 초점을 떼지 않는다(브라우저는 focus fixup으로 문서로 — 전에는 다음 Tab이 처음부터)
      expect(document.activeElement).toBe(tool('focus'));
      await settle();
      expect(document.activeElement).toBe(tool('fit'));
      expect(stops()).toEqual([tool('fit')]);
      // 초점이 막대 밖(3D 보기)이면 그 단추가 흐려져도 그대로
      sel = true;
      tb.refresh();
      const canvas = root.querySelector<HTMLElement>('canvas')!;
      canvas.focus();
      key(canvas, 'Escape');
      await settle();
      expect(tool('focus').disabled).toBe(true);
      expect(document.activeElement).toBe(canvas);
      // 막대 안이어도 흐려지지 않은 단추(측정)는 그대로
      sel = true;
      tb.refresh();
      tool('measure').focus();
      key(tool('measure'), 'Escape');
      await settle();
      expect(tool('focus').disabled).toBe(true);
      expect(document.activeElement).toBe(tool('measure'));
    } finally {
      window.removeEventListener('keydown', esc);
    }
  });
});

const host = () =>
  new Proxy({ measuring: false, measureKind: 'points', touch: false, multiPick: false, fmt: new Fmt('mm'), isVisible: () => true, groups: () => [] } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => {}),
  }) as unknown as PanelHost;
const layeredDoc = () =>
  createDoc('l.stp', 1, {
    scene: { meshes: [], lines: [], meta: { products: [], layers: [{ name: 'L1', meshIds: ['m1'] }, { name: 'L2', meshIds: ['m2'] }], pmi: { presentations: [] } } },
    ms: 1,
  } as unknown as ParseResult);

describe('패널 탭(APG Tabs)과 본문 다시 그리기', () => {
  it('Tab 멈춤은 고른 탭 하나, 탭은 본문을 aria-controls로 가리키고, 키보드로 탭을 고르면 새로 만든 고른 탭에 초점이 남는다', () => {
    const panel = new Panel(host());
    document.body.append(panel.el);
    panel.show(layeredDoc());
    panel.setOpen(true);
    const tabs = () => [...panel.el.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1, -1, -1]);
    const body = panel.el.querySelector<HTMLElement>('[role=tabpanel]')!;
    expect(tabs().every((t) => t.getAttribute('aria-controls') === body.id)).toBe(true);
    const layers = tabs().find((t) => t.id === 'tab-layers')!;
    layers.focus();
    layers.click();
    // 탭 줄을 새로 만들었다 — 옛 단추는 떨어지고 새 고른 탭에 초점
    expect(layers.isConnected).toBe(false);
    expect(document.activeElement?.id).toBe('tab-layers');
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(body.getAttribute('aria-labelledby')).toBe('tab-layers');
    // 본문이 글로 시작하는 정보 탭은 본문이 Tab 멈춤, 상자가 있는 탭은 아니다
    expect(body.hasAttribute('tabindex')).toBe(false);
    panel.setTab('info');
    expect(body.tabIndex).toBe(0);
  });

  it('153차: 속성·정보 탭 본문(Tab 멈춤 스크롤 영역)에 초점이 있으면 굴리는 키(Home·End·Page·↑↓)는 앱 창 글쇠(홈 뷰·뷰어)로 가지 않는다', () => {
    const panel = new Panel(host());
    document.body.append(panel.el);
    panel.show(layeredDoc());
    panel.setOpen(true);
    dispose = installKeyNav(document.body);
    // app.ts onKey와 같은 판정(창 bubble — 기본 동작을 막은 키는 건너뜀, 홈 뷰는 늘 기본 동작을 막음)
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/window\.addEventListener\('keydown', \(ev\) => this\.onKey\(ev\)\);/);
    expect(app).toMatch(/if \(ev\.defaultPrevented\) return;\n\s*const action = routeKey\(\{ [^\n]*inText: isTextTarget\(ev\.target\), control: controlOf\(ev\.target\)/);
    const routed: (string | null)[] = [];
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      const a = routeKey({ key: e.key, inText: isTextTarget(e.target), control: controlOf(e.target), hasDoc: true });
      routed.push(a);
      if (a === 'home') e.preventDefault();
    };
    addEventListener('keydown', onKey);
    try {
      const scroll = ['Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown'];
      for (const tab of ['props', 'info'] as const) {
        panel.setTab(tab);
        const body = panel.el.querySelector<HTMLElement>('[role=tabpanel]')!;
        body.focus();
        expect(document.activeElement, tab).toBe(body);
        routed.length = 0;
        // 아무도 기본 동작(본문 굴리기)을 막지 않는다 — 전에는 Home이 3D 보기를 홈 뷰로 돌리고 본문은 맨 위로 가지 않았다
        for (const k of scroll) expect(key(body, k).defaultPrevented, `${tab} ${k}`).toBe(false);
        expect(routed, tab).toEqual(scroll.map(() => null));
        // 본문이 쓰지 않는 키는 그대로 앱 것
        routed.length = 0;
        key(body, 'h');
        key(body, 'Escape');
        expect(routed, tab).toEqual(['hide', 'escape']);
      }
      // 탭 줄의 Home은 그대로 길잡이가 받는다(첫 탭 — 창 글쇠로 새지 않음, 53차 차례)
      routed.length = 0;
      const sel = panel.el.querySelector<HTMLElement>('[role=tab][aria-selected=true]')!;
      sel.focus();
      expect(key(sel, 'Home').defaultPrevented).toBe(true);
      expect(routed).toEqual([]);
      expect(document.activeElement?.id).toBe('tab-tree');
    } finally {
      removeEventListener('keydown', onKey);
    }
  });

  it('레이어 보이기 상자를 바꿔 본문을 다시 그려도 같은 차례의 새 상자에 초점이 남는다', () => {
    const panel = new Panel(host());
    document.body.append(panel.el);
    panel.show(layeredDoc());
    panel.setOpen(true);
    panel.setTab('layers');
    const boxes = () => [...panel.el.querySelectorAll<HTMLInputElement>('.panel-body input[type=checkbox]')];
    expect(boxes().length).toBeGreaterThanOrEqual(2);
    const second = boxes()[1]!;
    second.focus();
    panel.onVisibility();
    expect(second.isConnected).toBe(false);
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it('아래 띠는 3D 보기 위 띠가 보이는 동안 알리지 않는다(aria-live off)', () => {
    const panel = new Panel(host());
    document.body.append(panel.el);
    const foot = panel.el.querySelector<HTMLElement>('.panel-foot')!;
    expect(foot.getAttribute('aria-live')).toBe('polite');
    panel.footLive(false);
    expect(foot.getAttribute('aria-live')).toBe('off');
    panel.footLive(true);
    expect(foot.getAttribute('aria-live')).toBe('polite');
  });

  it('145차: 격리 띠는 알림 영역이 아니고 이름표·이름 칸만 알리며, 「격리 풀기」 버튼은 어느 알림 영역에도 들지 않는다(53차 측정 띠 꼴)', () => {
    // app.ts 원문에서 격리 띠를 만드는 줄을 잘라 실제 h·icon으로 돌린다(앱 전체는 시험에서 띄우지 않는다)
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const code = /this\.isoText = h\([\s\S]*?this\.isoBar = h\([^\n]*\n/.exec(app)?.[0];
    expect(code).toBeTruthy();
    const self: Record<string, unknown> = { unisolate: () => {} };
    new Function('h', 'icon', code!).call(self, h, icon);
    const bar = self.isoBar as HTMLElement;
    const label = self.isoLabel as HTMLElement;
    const name = self.isoText as HTMLElement;
    const LIVE = '[role=status], [role=alert], [role=log], [aria-live]:not([aria-live=off])';
    expect(bar.matches(LIVE)).toBe(false);
    expect(label.getAttribute('role')).toBe('status');
    expect(name.getAttribute('role')).toBe('status');
    const regions = [...bar.querySelectorAll<HTMLElement>(LIVE)];
    expect(regions).toEqual([label, name]);
    for (const r of regions) {
      expect(r.querySelector('button')).toBeNull();
      expect(r.parentElement!.closest(LIVE)).toBeNull();
    }
    const off = bar.querySelector('button')!;
    expect(off.textContent).toContain('격리 풀기');
    expect(off.closest(LIVE)).toBeNull();
  });

  it('180차: 격리 띠 이름 칸은 넣은 글을 말풍선(title)에도 두어 말줄임된 이름을 다시 볼 수 있다(README 55차 「말풍선에 전체」, 59차 상태 막대 꼴)', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const make = /this\.isoText = h\([\s\S]*?this\.isoBar = h\([^\n]*\n/.exec(app)?.[0];
    // 원문 syncIsolate 몸통을 가짜 this로 돌린다(TS 단언 `d!.`만 지움)
    const body = /\n {2}private syncIsolate\(\): void \{\n([\s\S]*?)\n {2}\}\n/.exec(app)?.[1]?.replace(/\bd!\./g, 'd.');
    expect(make).toBeTruthy();
    expect(body).toBeTruthy();
    let refreshed = 0;
    const self: Record<string, unknown> = { unisolate: () => {}, toolbar: { refresh: () => refreshed++ }, doc: null };
    new Function('h', 'icon', make!).call(self, h, icon);
    const sync = () => new Function(body!).call(self);
    const bar = self.isoBar as HTMLElement;
    const name = self.isoText as HTMLElement;
    const long = '\u{2068}Gehäuseunterteil mit Befestigungslaschen\u{2069} · \u{2068}Exemplar 12\u{2069}';
    self.doc = { vis: { isolated: new Set([1]) }, dim: null, isoLabel: long };
    sync();
    expect(bar.hidden).toBe(false);
    expect(name.textContent).toBe(long);
    expect(name.title).toBe(long);
    // 209차(WCAG 3.1.2): 이름 칸은 번역하는 칸 — 묶음 이름표(「부품 3개」)·몸체(「… · 바디 2」)는 화면 글이라 translate="no"면 다른 언어에서 한국어로 남았다.
    // 파일 글 조각은 selectionName이 FSI…PDI로 가둬 번역층이 그대로 끼운다(고른 부품 카드 이름과 같은 꼴 — tests/app/filecells209.test.ts)
    expect(name.getAttribute('translate')).toBeNull();
    // 흐리게로 다른 이름을 고르면 말풍선도 그 이름
    self.doc = { vis: { isolated: null }, dim: new Set([2]), isoLabel: '부품 3개' };
    sync();
    expect(name.textContent).toBe('부품 3개');
    expect(name.title).toBe('부품 3개');
    // 풀면 띠가 숨고 글·말풍선이 함께 빈다
    self.doc = { vis: { isolated: null }, dim: null, isoLabel: '부품 3개' };
    sync();
    expect(bar.hidden).toBe(true);
    expect(name.textContent).toBe('');
    expect(name.title).toBe('');
    expect(refreshed).toBe(3);
  });
});

describe('146차: 막대(input range)의 화면 읽기 값 — 속 수 대신 옆에 보이는 값 글(NC 140차 꼴)', () => {
  it('단면 위치 막대(0~1000)는 값 글의 축 글자·위치·단위를 읽고, 끌기·키·축·뒤집기·면 단면·단위가 바뀌면 함께 바뀐다(낱말 「위치」·뒤집음은 넣지 않음)', () => {
    let at: { axis: SectionState['axis']; flip: boolean; t: number } = { axis: 'x', flip: false, t: 0.625 };
    // 장면 범위 −40~40: 위치 = −40 + t × 80
    const st = () => ({ axis: at.axis, flip: at.flip, position: -40 + at.t * 80, min: -40, max: 40, t: at.t }) as SectionState;
    // 코어처럼: 위치를 옮기면 onSectionChange 알림 → 앱 syncSection → 막대 sync
    const viewer = {
      section: null,
      canvas: document.createElement('canvas'),
      setSectionPosition: (t: number) => {
        at = { ...at, t };
        bar.sync(st());
      },
    } as unknown as Viewer3d;
    const host = { viewerRef: viewer, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: () => {} };
    const bar = new SectionBar(host);
    document.body.append(bar.el);
    const slider = bar.el.querySelector<HTMLInputElement>('.section-slider')!;
    const read = () => [slider.value, slider.getAttribute('aria-valuetext')];
    // 막대 옆에 보이는 값 글: 이름표 · 숫자 칸 · 단위
    const shown = () => [...bar.el.querySelectorAll<HTMLElement>('.section-lbl, .section-num, .section-unit')].map((e) => (e instanceof HTMLInputElement ? e.value : e.textContent));
    bar.sync(st());
    expect([...read(), shown()]).toEqual(['625', 'X = 10 mm', ['X =', '10', 'mm']]);
    // 끌기·키(막대에 초점 — sync는 막대 값을 건드리지 않고, 값 글은 새 상태로)
    slider.focus();
    slider.value = '250';
    slider.dispatchEvent(new Event('input'));
    expect(read()).toEqual(['250', 'X = -20 mm']);
    slider.blur();
    // 다른 축·뒤집기(버튼 → 코어 알림): 뒤집음은 뒤집기 버튼 눌림이 알리고 값 글에는 없음
    at = { axis: 'y', flip: true, t: 0.53125 };
    bar.sync(st());
    expect([...read(), shown()]).toEqual(['531', 'Y = 2.5 mm', ['Y =', '2.5', 'mm']]);
    // 면 단면: 이름표 「위치」는 번역층이 옮기지 않는 속성이라 빼고 위치·단위만
    at = { axis: null, flip: false, t: 0.75 };
    bar.sync(st());
    expect([...read(), shown()]).toEqual(['750', '20 mm', ['위치', '20', 'mm']]);
    // 표시 단위·자리 수 바꿈(앱 refreshFmt → syncSection): 인치 장면을 mm·소수 한 자리로, 단위를 모르는 장면은 수만
    host.fmt = new Fmt('inch', { unit: 'mm', decimals: 1, quality: 'normal' });
    at = { axis: 'z', flip: false, t: 0.5625 };
    bar.sync(st());
    expect([...read(), shown()]).toEqual(['563', 'Z = 127 mm', ['Z =', '127', 'mm']]);
    host.fmt = new Fmt('' as never);
    bar.sync(st());
    expect([...read(), shown()]).toEqual(['563', 'Z = 5', ['Z =', '5', '']]);
  });

  it('분해 정도 막대(0~100)는 옆 값 글(「50%」)을 읽고, 끌기·키와 다른 길(켜고 끄기·접기·문서 바꿈 — 모두 syncExplode)에서 함께 바뀐다', () => {
    // app.ts 원문에서 분해 막대·값 글을 만드는 줄과 막대 맞추기(syncExplode) 몸통을 잘라 실제 h로 돌린다(앱 전체는 시험에서 띄우지 않는다)
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const make = /this\.explodeSlider = h\([\s\S]*?this\.explodeValue = h\([^\n]*\n/.exec(app)?.[0];
    const body = /private syncExplode\(\): void \{\n([\s\S]*?)\n {2}\}\n/.exec(app)?.[1];
    expect([!!make, !!body]).toEqual([true, true]);
    const doc = { explode: 0 };
    const sync = () => new Function(body!).call(self);
    const self: Record<string, unknown> = {
      doc,
      explodeOpen: true,
      explodeBar: document.createElement('div'),
      explodeUi: null,
      tweakTool: null,
      hostEl: document.createElement('div'),
      toolbar: { refresh: () => {} },
      // 앱 setExplode처럼: 문서의 분해 정도를 바꾸고 막대를 맞춘다
      setExplode: (k: number) => {
        doc.explode = k;
        sync();
      },
    };
    new Function('h', make!).call(self, h);
    const slider = self.explodeSlider as HTMLInputElement;
    const value = self.explodeValue as HTMLElement;
    document.body.append(slider, value);
    const read = () => [slider.value, value.textContent, slider.getAttribute('aria-valuetext')];
    doc.explode = 0.5;
    sync();
    expect(read()).toEqual(['50', '50%', '50%']);
    // 끌기·키(막대에 초점): input → setExplode → 막대 맞추기
    slider.focus();
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));
    expect([doc.explode, ...read()]).toEqual([0.3, '30', '30%', '30%']);
    slider.blur();
    // 다른 길(측정을 켜 접기·문서 바꿈·손질 다시 그리기 등)도 같은 syncExplode
    doc.explode = 0.123;
    sync();
    expect(read()).toEqual(['12', '12%', '12%']);
  });
});

/**
 * 187차(WCAG 4.1.2 이름·역할·값 — 186차 남은 일 둘, 한 규칙 「값·관계 속성 빠짐」):
 * - 패널 폭·시트 높이 손잡이(role=separator, 초점·키·값 — 186차)는 APG 창 가르개처럼 크기를 바꾸는 주 패널을 aria-controls로 가리켜야 하는데 관계가 없었다
 *   (손잡이가 패널 첫 자식이라 자리로만 드러남). 패널(aside)에 겹치지 않는 id를 두고 손잡이가 그 id를 가리킨다.
 * - 3D 보기 위 단면 손잡이는 role=slider인데 값이 없고 Tab 멈춤·키도 없어(끌기만) 가상 커서가 만나면 값 없는 조작 못 하는 슬라이더였다.
 *   같은 값(단면 위치)은 단면 막대 밀대가 키로 바꾸고 이름·값 글을 나르니, 손잡이는 끌기 덧그림처럼 꾸밈(aria-hidden — 조준 십자선·분해 거리 글상자 꼴)으로 숨기고
 *   aria-hidden 요소가 초점을 받지 않게 tabindex도 뺀다. 끌기·말풍선은 그대로
 */
describe('187차: 패널 크기 손잡이의 주 패널 관계·단면 손잡이 꾸밈', () => {
  it('패널 크기 손잡이(창 가르개)는 크기를 바꾸는 패널(aside)을 aria-controls로 가리키고, 그 id는 문서에 하나뿐이며 탭 본문 id와 다르다', () => {
    // app.ts 528~529와 같은 차례: 패널을 만든 뒤 손잡이를 만들어 패널 첫 자식으로
    const panel = new Panel(host());
    const root = document.createElement('div');
    const workspace = document.createElement('main');
    workspace.append(panel.el);
    root.append(workspace);
    document.body.append(root);
    const r = new PanelResizer(root, panel.el, workspace, null, null);
    panel.el.prepend(r.el);
    const id = r.el.getAttribute('aria-controls') ?? '';
    expect([r.el.getAttribute('role'), id !== '', document.getElementById(id) === panel.el, document.querySelectorAll(`[id="${id}"]`).length]).toEqual(['separator', true, true, 1]);
    expect(id).not.toBe(panel.el.querySelector('[role=tabpanel]')!.id);
  });

  it('200차: 도구 막대 「패널」 버튼도 열고 닫는 그 패널(aside)을 aria-controls로 가리키고, 상태는 눌림(aria-pressed)만 — 펼침은 두지 않는다(183차 결정)', () => {
    // app.ts 393~394·527~530과 같은 차례: 도구 막대를 만든 뒤 패널, 뿌리에 도구 막대와 작업 영역(그 안 패널 — 닫혀도 DOM에 늘 있음)
    let open = false;
    const state = { hasDoc: true, hasSelection: false, projection: 'perspective', renderMode: 'shaded', gridOn: false, cubeOn: false, axesOn: false,
      measuring: false, get panelOpen() { return open; }, pickUnit: 'part', multiPick: false, sectionAxis: null, sectionOn: false } as Record<string, unknown>;
    const tb = new Toolbar(new Proxy(state, { get: (t, k) => (k in t ? t[k as string] : () => {}) }) as unknown as ToolbarHost);
    const panel = new Panel(host());
    const workspace = document.createElement('main');
    workspace.append(panel.el);
    const root = document.createElement('div');
    root.append(tb.el, workspace);
    document.body.append(root);
    const btn = tb.el.querySelector<HTMLButtonElement>('[data-tool=panel]')!;
    const id = btn.getAttribute('aria-controls') ?? '';
    expect([id !== '', document.getElementById(id) === panel.el, document.querySelectorAll(`[id="${id}"]`).length]).toEqual([true, true, 1]);
    expect(id).not.toBe(panel.el.querySelector('[role=tabpanel]')!.id);
    // 넓은 화면 옆 패널·좁은 화면 시트는 같은 요소(styles.css 미디어 조건만)라 관계는 하나 — 열어 다시 맞춰도 관계 그대로, 상태는 눌림
    expect([panel.el.hidden, btn.getAttribute('aria-pressed'), btn.getAttribute('aria-expanded'), btn.getAttribute('aria-haspopup')]).toEqual([true, 'false', null, null]);
    open = true;
    tb.refresh();
    expect([btn.getAttribute('aria-pressed'), btn.getAttribute('aria-expanded'), btn.getAttribute('aria-controls')]).toEqual(['true', null, id]);
  });

  it('3D 보기 위 단면 손잡이는 화면 읽기에서 숨는 꾸밈이고 초점을 받지 않으며, 같은 값은 단면 막대 밀대가 이름·값 글로 나른다', () => {
    const viewer = { section: null, canvas: document.createElement('canvas') } as unknown as Viewer3d;
    const bar = new SectionBar({ viewerRef: viewer, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: () => {} });
    document.body.append(bar.handle, bar.el);
    const hd = bar.handle;
    expect([hd.getAttribute('aria-hidden'), hd.getAttribute('role'), hd.getAttribute('aria-label'), hd.getAttribute('tabindex')]).toEqual(['true', null, null, null]);
    // aria-hidden 안에 초점을 받는 칸이 없다(손잡이 자신도 — 보이게 두고 초점을 주어도 받지 않음)
    expect(hd.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').length).toBe(0);
    hd.hidden = false;
    hd.focus();
    expect(document.activeElement).toBe(document.body);
    // 같은 일(단면 위치)은 Tab 멈춤인 밀대가 키로 하고 이름·값 글을 나른다(146차)
    bar.sync({ axis: 'x', flip: false, position: 10, min: -40, max: 40, t: 0.625 } as SectionState);
    const slider = bar.el.querySelector<HTMLInputElement>('.section-slider')!;
    expect([slider.getAttribute('aria-label'), slider.getAttribute('aria-valuetext'), slider.tabIndex]).toEqual(['단면 위치', 'X = 10 mm', 0]);
  });
});

describe('147차: 측정 띠 글 칸이 CSS로 숨는 화면에서는 패널 아래 띠가 결과를 알린다(SKP 152차 표 ⑤ 꼴)', () => {
  it('넓은 화면·마우스의 면 고르기·고른 부품 카드는 띠가 숨어 패널 아래 띠 알림을 켜고, 띠가 보이는 화면(측정·여러 개·좁은 화면·손가락)은 53차대로 끈다', () => {
    // app.ts 원문 refreshBar의 아래 띠 알림 줄(인자)을 잘라 mode·좁은 화면·손가락 기기를 바꿔 셈한다(앱 전체는 시험에서 띄우지 않는다)
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const arg = /\n {4}this\.panel\.footLive\(([^\n]*)\);\n/.exec(app)?.[1];
    expect(arg).toBeTruthy();
    const live = (mode: string | null, narrow: boolean | null, touch: boolean): boolean =>
      new Function('mode', `return ${arg};`).call({ narrow: narrow === null ? null : { matches: narrow }, touch }, mode);
    const cases: [string | null, boolean | null, boolean][] = [
      [null, false, false],
      ['measure', false, false],
      ['multi', false, false],
      ['face', false, false],
      ['select', false, false],
      [null, true, false],
      ['measure', true, false],
      ['face', true, false],
      ['select', true, false],
      [null, false, true],
      ['face', false, true],
      ['select', false, true],
      // matchMedia가 없는 환경(앱 narrow null)은 넓은 화면처럼
      ['face', null, false],
    ];
    expect(cases.map(([m, n, t]) => live(m, n, t))).toEqual([true, false, false, true, true, true, false, false, false, true, false, false, true]);
    // 위 조건이 styles.css의 띠 보이기 규칙과 같은지: 기본은 숨김, 넓은 화면은 측정·여러 개만, 좁은 화면·손가락 기기는 모든 띠 — 앱의 미디어 질의 상수와 손가락 게터도
    const css = readFileSync(join(__dirname, '../../src/app/styles.css'), 'utf8');
    expect(/\n\.measure-bar \{[^}]*\n {2}display: none;/.test(css)).toBe(true);
    expect(css).toContain('\n.measure-bar.measuring:not([hidden]),\n.measure-bar.multi:not([hidden]) {\n  display: flex;\n}');
    expect(css).toContain('\n@media (max-width: 759.98px), (pointer: coarse) {\n  .measure-bar:not([hidden]) {\n    display: flex;\n  }');
    expect(app).toContain("\nconst NARROW = '(max-width: 759.98px)';");
    expect(app).toContain("\nconst COARSE = '(pointer: coarse)';");
    expect(app).toContain('get touch(): boolean {\n    return !!this.coarse?.matches;');
  });
});

/**
 * 157차(WAI-ARIA 알림 영역 — 영역은 글이 바뀌기 전부터 접근성 트리에 있어야 그 바뀜을 알린다): 진행 카드(.busy)는 hidden(display:none)이라 그 안 단계 칸(role=status)은
 * 카드가 숨은 동안 접근성 트리에 없다. 전에는 숨김을 푸는 같은 차례에 첫 단계 글(「파일 읽는 중…」)을 넣어 프로그램에 따라 읽지 않았다(뒤 단계는 보이는 칸이라 읽힘).
 * 이제 숨어 있던 카드를 보일 때는 단계 칸을 비운 채 한 번 그린 뒤(앱 nextPaint — rAF 뒤 타이머, 그 프레임 그리기가 끝난 뒤) 글을 넣는다
 */
describe('157차: 진행 카드 단계 칸의 첫 글은 카드가 빈 칸으로 한 번 그려진 뒤에', () => {
  it('숨은 카드를 보이는 차례에는 단계 칸이 비고 다음 그림 뒤에 첫 단계 글, 보이는 동안 바뀐 단계는 곧바로, 그사이 단계가 바뀌거나 카드를 닫으면 늦은 글은 넣지 않는다', async () => {
    // app.ts 원문에서 진행 카드를 만드는 줄과 setLoading 몸통을 잘라 실제 h로 돌린다(앱 전체는 시험에서 띄우지 않는다)
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const make = /this\.busyName = h\([\s\S]*?\n {4}\);\n/.exec(app)?.[0];
    const body = /private setLoading\(l: Loading \| null\): void \{\n([\s\S]*?)\n {2}\}\n/.exec(app)?.[1];
    expect([!!make, !!body]).toEqual([true, true]);
    const self: Record<string, unknown> = { loading: null, cancel: () => {}, updateStatus: () => {} };
    new Function('h', make!).call(self, h);
    const busy = self.busyEl as HTMLElement;
    const stage = self.busyStage as HTMLElement;
    document.body.append(busy);
    expect([stage.getAttribute('role'), busy.contains(stage)]).toEqual(['status', true]);
    // 앱 nextPaint 대신 시험이 그림 차례를 쥔다(풀 때 그린 뒤로 본다)
    const paints: (() => void)[] = [];
    const nextPaint = () => new Promise<void>((r) => paints.push(r));
    const paint = async () => {
      paints.splice(0).forEach((r) => r());
      await settle();
    };
    const set = (st: string | null, fraction = 0) =>
      new Function('l', 'clipText', 'fmtPercent', 'nextPaint', body!).call(
        self,
        st === null ? null : { name: 'a.step', fraction, stage: st },
        (s: string) => s,
        (f: number) => `${Math.round(f * 100)}%`,
        nextPaint,
      );
    const read = () => [busy.hidden, stage.textContent, paints.length];
    expect(read()).toEqual([true, '', 0]);
    // 숨은 카드를 보이는 차례: 칸은 빈 채로 보이고 글은 그림 뒤
    set('파일 읽는 중');
    expect(read()).toEqual([false, '', 1]);
    set('파일 읽는 중', 0.3);
    expect(read()).toEqual([false, '', 1]);
    await paint();
    expect(read()).toEqual([false, '파일 읽는 중…', 0]);
    // 번역층이 단계 글을 따로 옮기게 조각 둘(전과 같음)
    expect([...stage.childNodes].map((n) => n.textContent)).toEqual(['파일 읽는 중', '…']);
    // 보이는 동안 바뀐 단계는 곧바로(이미 있는 알림 칸의 바뀜)
    set('해석 중', 0.5);
    expect(read()).toEqual([false, '해석 중…', 0]);
    set(null);
    expect(read()).toEqual([true, '해석 중…', 0]);
    // 다시 열면 앞 열기의 끝 단계 글을 보이지 않고 비운다
    set('파일 읽는 중');
    expect(read()).toEqual([false, '', 1]);
    // 그림 전에 다음 단계가 오면 그 단계를 곧바로, 늦은 첫 단계 글은 넣지 않는다
    set('해석 중', 0.4);
    expect(read()).toEqual([false, '해석 중…', 1]);
    await paint();
    expect(read()).toEqual([false, '해석 중…', 0]);
    // 그림 전에 닫으면(취소) 늦은 글은 넣지 않는다
    set(null);
    set('파일 읽는 중');
    set(null);
    expect(read()).toEqual([true, '', 1]);
    await paint();
    expect(read()).toEqual([true, '', 0]);
  });
});

/**
 * 189차(WCAG 2.4.3 초점 차례): 파일을 여는 동안 진행 카드의 「취소」에 초점이 있을 때 카드가 숨으면(「취소」 누름·Esc — 앱 cancel, 다 열림·실패 — load 끝,
 * 모두 setLoading(null) 한 자리) 전에는 숨은 버튼과 함께 초점이 문서로 빠졌다(jsdom은 숨긴 칸의 초점을 떼지 않아 「취소」에 남는 것으로 본다).
 * 이제 숨긴 뒤 알림 칸이 쓰는 곳(166차)으로 — 앞 문서(다 연 새 문서)가 보이면 3D 보기, 문서 전이면 시작 화면 「파일 열기」. 초점이 카드 밖이면 옮기지 않는다
 */
describe('189차: 진행 카드가 숨을 때 「취소」에 있던 초점', () => {
  // 157차 꼴: app.ts 원문에서 진행 카드를 만드는 줄과 setLoading 몸통을 잘라 실제 h로 돌린다
  const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
  const make = /this\.busyName = h\([\s\S]*?\n {4}\);\n/.exec(app)?.[0];
  const body = /private setLoading\(l: Loading \| null\): void \{\n([\s\S]*?)\n {2}\}\n/.exec(app)?.[1];
  /** doc: 그때 연 문서가 있는지(앞 문서 — 다 열림이면 시험이 새 문서를 둔다) */
  const setup = (doc: boolean) => {
    expect([!!make, !!body]).toEqual([true, true]);
    const canvas = h('canvas', { tabindex: '0' });
    const startOpen = h('button', { type: 'button' }, '파일 열기');
    // 카드 밖의 다른 칸(머리 막대 「열기」 꼴)
    const other = h('button', { type: 'button' }, '열기');
    const self: Record<string, unknown> = { loading: null, updateStatus: () => {}, doc: doc ? {} : null, viewer: { canvas }, startOpen };
    const set = (st: string | null, fraction = 0): void =>
      new Function('l', 'clipText', 'fmtPercent', 'nextPaint', body!).call(
        self,
        st === null ? null : { name: 'a.step', fraction, stage: st },
        (s: string) => s,
        (f: number) => `${Math.round(f * 100)}%`,
        () => new Promise<void>(() => {}),
      );
    // 「취소」 버튼은 앱 cancel(여는 것을 멈추고 setLoading(null)) — Esc도 같은 cancel
    self.cancel = () => set(null);
    new Function('h', make!).call(self, h);
    const busy = self.busyEl as HTMLElement;
    document.body.append(other, canvas, startOpen, busy);
    const cancel = busy.querySelector<HTMLButtonElement>('.busy-actions button')!;
    const names = new Map<Element, string>([
      [canvas, '3D 보기'],
      [startOpen, '파일 열기'],
      [other, '열기'],
      [cancel, '취소'],
      [document.body, 'body'],
    ]);
    // [카드가 숨었는지, 초점 자리]
    const read = () => [busy.hidden, names.get(document.activeElement!) ?? '?'];
    return { self, set, cancel, canvas, startOpen, other, read };
  };

  it('「취소」에 초점이 있으면 취소 누름·다 열림·실패 뒤 앞 문서(다 연 새 문서)가 보이면 3D 보기, 문서 전이면 「파일 열기」로', () => {
    // 취소 누름 — 앞 문서가 남음
    let s = setup(true);
    s.set('파일 읽는 중');
    s.cancel.focus();
    expect(s.read()).toEqual([false, '취소']);
    s.cancel.click();
    expect(s.read()).toEqual([true, '3D 보기']);
    document.body.replaceChildren();
    // 취소 누름 — 처음 여는 파일(시작 화면)
    s = setup(false);
    s.set('해석 중', 0.4);
    s.cancel.focus();
    s.cancel.click();
    expect(s.read()).toEqual([true, '파일 열기']);
    document.body.replaceChildren();
    // 다 열림 — load가 새 문서를 보인 뒤 끝에서 카드를 숨긴다
    s = setup(false);
    s.set('화면에 올리는 중', 1);
    s.cancel.focus();
    s.self.doc = {};
    s.set(null);
    expect(s.read()).toEqual([true, '3D 보기']);
    document.body.replaceChildren();
    // 실패 — 앞 문서가 남으면 3D 보기, 처음 여는 파일이면 시작 화면 「파일 열기」(다시 열 자리)
    s = setup(true);
    s.set('해석 중', 0.7);
    s.cancel.focus();
    s.set(null);
    expect(s.read()).toEqual([true, '3D 보기']);
    document.body.replaceChildren();
    s = setup(false);
    s.set('파일 받는 중', 0.2);
    s.cancel.focus();
    s.set(null);
    expect(s.read()).toEqual([true, '파일 열기']);
  });

  it('초점이 카드 밖이면 숨겨도 옮기지 않고, 카드가 보인 채 단계·진행만 바뀌면 「취소」 그대로', () => {
    // 머리 막대 「열기」에 둔 채 취소·실패(앞 문서 있음·없음)와 다 열림
    let s = setup(true);
    s.other.focus();
    s.set('파일 읽는 중');
    s.set(null);
    expect(s.read()).toEqual([true, '열기']);
    document.body.replaceChildren();
    s = setup(false);
    s.other.focus();
    s.set('파일 읽는 중');
    s.set(null);
    expect(s.read()).toEqual([true, '열기']);
    s.set('해석 중', 0.6);
    s.self.doc = {};
    s.set(null);
    expect(s.read()).toEqual([true, '열기']);
    document.body.replaceChildren();
    // 시작 화면 「파일 열기」에 둔 채 다 열림 — 3D 보기로 옮기는 것은 updateAll 몫(53차), 카드를 숨기는 자리는 다시 옮기지 않는다
    s = setup(false);
    s.startOpen.focus();
    s.set('파일 읽는 중');
    s.self.doc = {};
    s.set(null);
    expect(s.read()).toEqual([true, '파일 열기']);
    document.body.replaceChildren();
    // 보인 채 단계·진행이 바뀜(다른 파일을 또 열어도 카드는 숨지 않고 0부터)
    s = setup(true);
    s.set('파일 읽는 중');
    s.cancel.focus();
    s.set('해석 중', 0.5);
    s.set('파일 읽는 중', 0);
    expect(s.read()).toEqual([false, '취소']);
  });
});

/**
 * 155차(WCAG 3.3.1 오류 알아보기·4.1.3 상태 알림): 단면 위치 숫자 칸(type=number)을 비우거나 읽지 못한 글(「-」·「1e」 — 브라우저가 값을 빈 글로 돌림)을 넣고
 * Enter·칸 떠남을 하면 전에는 `Number('')` = 0으로 단면을 0 위치로 말없이 옮겼다(칸에는 빈 칸이 남고 무엇이 틀렸는지 알리는 글 없음).
 * 이제 옮기지 않고 칸을 보이던 위치로 되돌린 뒤 알림 칸에 경고로 까닭을 알린다(분해 거리 칸 43차 꼴 — warn·5초). 범위 밖 수는 코어가 받는 값이라 그대로 옮긴다
 */
describe('155차: 단면 위치 숫자 칸에 받지 않는 값', () => {
  const MSG = '단면 위치를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오.';

  it('빈 칸·읽지 못한 글(Enter·칸 떠남)은 단면을 0으로 옮기지 않고 칸을 되돌려 경고로 알리고, 바른 수는 그대로 옮긴다', () => {
    const calls: number[] = [];
    const viewer = { section: null, canvas: document.createElement('canvas'), setSectionPosition: (p: number) => calls.push(p) } as unknown as Viewer3d;
    const told: unknown[][] = [];
    const bar = new SectionBar({ viewerRef: viewer, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: () => {}, toast: (...a: unknown[]) => told.push(a) });
    document.body.append(bar.el);
    bar.sync({ axis: 'z', flip: false, position: -12.5, min: -40, max: 10, t: 0.55 } as SectionState);
    const num = bar.el.querySelector<HTMLInputElement>('.section-num')!;
    expect(num.value).toBe('-12.5');
    num.focus();
    num.value = '';
    key(num, 'Enter');
    expect([calls, num.value, told]).toEqual([[], '-12.5', [[MSG, 'warn', 5000]]]);
    // 읽지 못한 글(type=number라 jsdom도 빈 글로 돌림)을 넣고 칸을 떠남
    num.value = 'abc';
    num.dispatchEvent(new Event('change'));
    expect([calls, num.value, told.length]).toEqual([[], '-12.5', 2]);
    num.value = '-30';
    key(num, 'Enter');
    num.value = '500';
    num.dispatchEvent(new Event('change'));
    expect([calls, told.length]).toEqual([[-30, 500], 2]);
  });

  it('알림 글은 네 언어로 옮긴다(같은 사전의 「단면 위치」·「거리를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오」 꼴)', () => {
    expect(translate(MSG, 'en')).toBe('Could not read the section position — type one number.');
    for (const l of ['ja', 'zh-CN', 'de']) expect(translate(MSG, l)).not.toMatch(/[가-힣]/);
  });
});

describe('메뉴(APG Menu): Home·End와 닫을 때 초점', () => {
  it('Home·End로 처음·끝 항목, 기본 동작을 막아 창의 Home(홈 뷰)으로 새지 않는다', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    anchor.focus();
    openMenu(anchor, ['가', '나', '다'].map((label) => ({ label, run: () => {} })), '메뉴');
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu .menu-item')];
    expect(document.activeElement).toBe(items[0]);
    expect(key(items[0]!, 'End').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[2]);
    expect(key(items[2]!, 'Home').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    key(items[0]!, 'Escape');
    expect(document.querySelector('.menu')).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it('화면 점 메뉴(작업 메뉴)를 Esc로 닫거나 항목을 고르면 연 때 초점이 있던 곳(나무 줄·3D 보기)으로', () => {
    const row = document.createElement('div');
    row.tabIndex = 0;
    document.body.append(row);
    row.focus();
    openMenuAt(10, 10, [{ label: '숨기기', run: () => {} }], '작업 메뉴');
    expect(document.activeElement?.classList.contains('menu-item')).toBe(true);
    key(document.activeElement!, 'Escape');
    expect(document.activeElement).toBe(row);
    let at: Element | null = null;
    openMenuAt(10, 10, [{ label: '숨기기', run: () => (at = document.activeElement) }], '작업 메뉴');
    document.querySelector<HTMLButtonElement>('.menu .menu-item')!.click();
    expect(at).toBe(row);
    // 메뉴 항목이 다음 메뉴를 열면(그 밖의 작업…) 그 메뉴도 같은 곳으로 돌려준다
    openMenuAt(10, 10, [{ label: '그 밖의 작업…', run: () => openMenuAt(10, 10, [{ label: '불투명도…', run: () => {} }], '그 밖의 작업') }], '작업 메뉴');
    document.querySelector<HTMLButtonElement>('.menu .menu-item')!.click();
    expect(document.querySelector('.menu')?.getAttribute('aria-label')).toBe('그 밖의 작업');
    key(document.activeElement!, 'Escape');
    expect(document.activeElement).toBe(row);
  });

  // 188차(WCAG 2.4.3 — 초점 잃음 감사): 메뉴는 body 끝에 붙어, Tab·Shift+Tab이 문서 캡처에서 메뉴를 지운 뒤 브라우저 기본 이동이 지운 자리(문서 끝)에서 떠났다 —
  // Tab은 문서 밖, Shift+Tab은 앱 끝 칸. 이제 Esc·항목처럼 연 곳에 초점을 준 뒤 기본 이동은 막지 않아 그 자리의 다음·앞 칸으로(APG Menu). jsdom은 Tab 이동을 하지 않아 닫힌 직후 초점만 본다
  it('Tab·Shift+Tab: 메뉴 안 초점이면 닫고 연 버튼(작업 메뉴는 연 때 초점 자리)으로 돌려준 뒤 기본 이동은 막지 않는다', () => {
    const anchor = button({}, '표준 뷰');
    const row = document.createElement('div');
    row.tabIndex = 0;
    document.body.append(anchor, row);
    const got: unknown[] = [];
    for (const shiftKey of [false, true]) {
      anchor.focus();
      openMenu(anchor, ['홈 뷰', '정면'].map((label) => ({ label, run: () => {} })), '표준 뷰');
      const inside = !!document.activeElement?.classList.contains('menu-item');
      const e = key(document.activeElement!, 'Tab', { shiftKey });
      got.push([inside, document.querySelector('.menu') === null, document.activeElement === anchor, e.defaultPrevented, anchor.getAttribute('aria-expanded')]);
    }
    row.focus();
    openMenuAt(10, 10, [{ label: '숨기기', run: () => {} }], '작업 메뉴');
    const inside = !!document.activeElement?.classList.contains('menu-item');
    const e = key(document.activeElement!, 'Tab');
    got.push([inside, document.querySelector('.menu') === null, document.activeElement === row, e.defaultPrevented]);
    expect(got).toEqual([
      [true, true, true, false, 'false'],
      [true, true, true, false, 'false'],
      [true, true, true, false],
    ]);
  });

  it('Tab: 초점이 메뉴 밖이면(항목이 모두 흐려 연 뒤에도 다른 칸) 닫기만 하고 초점은 그 칸 그대로', () => {
    const anchor = button({}, '보기 설정');
    const field = document.createElement('input');
    document.body.append(anchor, field);
    field.focus();
    openMenu(anchor, [{ label: '고른 부품 보기', disabled: true, run: () => {} }], '보기 설정');
    const before = [document.querySelector('.menu') !== null, document.activeElement === field];
    key(field, 'Tab');
    expect([...before, document.querySelector('.menu') === null, document.activeElement === field]).toEqual([true, true, true, true]);
  });
});
