// @vitest-environment jsdom
/**
 * 53차 키보드만으로 쓰기(WAI-ARIA APG Tabs·Radio Group·Toolbar·Menu, WCAG 2.4.3 초점 차례):
 * - keynav.ts: 탭·라디오·도구 막대 화살표, Tab 멈춤 하나(roving tabindex), 띠·패널을 닫을 때 초점 돌려주기
 * - panel.ts: 탭을 고르면 다시 만든 고른 탭으로 초점, 탭 본문 aria-controls·Tab 멈춤, 보이기 상자를 바꿔 다시 그려도 초점 그대로, 아래 띠 알림 끄고 켜기
 * - menu.ts: Home·End(창 글쇠로 새지 않게), 화면 점 메뉴를 닫으면 연 때 초점이 있던 곳으로
 * 헤드리스 Chrome 점검(.runtime/r53 kbd53)에서 찾은 것을 jsdom으로 다시 본다(jsdom은 숨긴 칸의 초점을 스스로 떼지 않아, 숨기는 명령이 브라우저처럼 blur한다).
 * - app.ts 격리 띠(145차): 알림은 바뀌는 글 칸만, 띠의 버튼은 알림 영역 밖(53차 측정 띠 꼴)
 * - 단면·분해 막대(146차): 속 수(0~1000·0~100) 대신 옆에 보이는 값 글을 aria-valuetext로(NC 140차 꼴 — 번역층이 옮기지 않아 낱말 없이)
 * - 측정 띠 글 칸이 CSS로 숨는 화면(147차 — 넓은 화면·마우스의 면 고르기·고른 부품 카드): 패널 아래 띠가 알린다(SKP 152차 표 ⑤ 꼴)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { h, icon } from '../../src/app/dom';
import { installKeyNav, moveIndex } from '../../src/app/keynav';
import { closeMenu, openMenu, openMenuAt } from '../../src/app/menu';
import { createDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import { Panel, type PanelHost } from '../../src/app/panel';
import { Fmt } from '../../src/app/display';
import { SectionBar } from '../../src/app/sectionbar';
import type { SectionState, Viewer3d } from 'opencad-viewer3d';

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
});
