// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Viewer3d } from 'opencad-viewer3d';
import type { Scene3d } from 'opencad-viewer3d/types';
import { closeMenu } from '../../src/app/menu';
import { isLineMode, profilesFor, RENDER_MODES, showAxes, Toolbar, type ToolbarHost } from '../../src/app/toolbar';
import { translate } from '../../site/i18n.mjs';
import { drawLog } from './fakeview';
import { jsdomViewer } from './jsdomview';

function host(): ToolbarHost & { calls: string[] } {
  const calls: string[] = [];
  const call = (name: string) => () => {
    calls.push(name);
  };
  return {
    calls,
    hasDoc: true,
    hasSelection: false,
    projection: 'perspective',
    renderMode: 'shadedEdges',
    gridOn: true,
    cubeOn: false,
    axesOn: true,
    measuring: false,
    panelOpen: false,
    pickUnit: 'part',
    multiPick: false,
    sectionAxis: null,
    sectionOn: false,
    hiddenEdges: false,
    profiles: false,
    partColors: false,
    ambientOcclusion: false,
    explodeOpen: false,
    fit: call('fit'),
    goHome: call('home'),
    setHome: call('setHome'),
    fitSelection: call('fitSelection'),
    setView: call('setView'),
    setProjection: (p) => calls.push(`proj ${p}`),
    setRenderMode: (m) => calls.push(`mode ${m}`),
    toggleHiddenEdges: call('hiddenEdges'),
    toggleProfiles: call('profiles'),
    togglePartColors: call('partColors'),
    toggleAmbientOcclusion: call('ao'),
    toggleExplode: call('explode'),
    toggleGrid: call('grid'),
    toggleCube: call('cube'),
    toggleAxes: call('axes'),
    toggleMeasure: call('measure'),
    setPickUnit: (u) => calls.push(`unit ${u}`),
    toggleMultiPick: call('multi'),
    setSectionAxis: call('section'),
    savePng: call('png'),
    exportItems: () => [{ label: 'STL', run: () => calls.push('stl') }],
    togglePanel: call('panel'),
  };
}

const button = (tb: Toolbar, label: string): HTMLButtonElement =>
  [...tb.el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.querySelector('.btn-label')?.textContent === label)!;

describe('도구 막대: 좁은 화면(휴대폰) 한 줄과 보기 설정 메뉴', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
  });
  afterEach(() => {
    closeMenu();
    vi.restoreAllMocks();
  });

  it('보기·측정 버튼만 좁은 화면에 남기고, 나머지는 wide-only', () => {
    const tb = new Toolbar(host());
    const wide = [...tb.el.querySelectorAll('button.wide-only .btn-label')].map((e) => e.textContent);
    expect(wide).toEqual(['고른 부품 보기', '원근', '음영 + 모서리', '격자', '뷰 큐브', '좌표축', '내보내기']);
    const narrow = [...tb.el.querySelectorAll('button:not(.wide-only) .btn-label')].map((e) => e.textContent);
    expect(narrow).toEqual(['전체 보기', '표준 뷰', '보기 설정', '단면', '부품 고르기', '측정', '패널']);
    expect(button(tb, '보기 설정').classList.contains('narrow-only')).toBe(true);
    expect(button(tb, '보기 설정').getAttribute('aria-haspopup')).toBe('menu');
  });

  it('보기 설정 메뉴: 구분선·쓸 수 없음·하나 고르기·켜고 끄기, 창 높이만 바뀌면 닫지 않는다', () => {
    const h = host();
    const tb = new Toolbar(h);
    document.body.append(tb.el);
    const more = button(tb, '보기 설정');
    more.click();
    const menu = document.querySelector<HTMLElement>('.menu')!;
    expect(menu.getAttribute('aria-label')).toBe('보기 설정');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const items = [...menu.querySelectorAll<HTMLButtonElement>('.menu-item')];
    // 51차: 그리기 모드(여섯 모드와 그리기 선택 넷)는 "그리기 모드…" 하나로(고르면 같은 자리에 그리기 모드 메뉴) — 열여덟 항목 → 아홉
    expect(items.map((b) => [b.querySelector('.menu-label')!.textContent, b.getAttribute('role'), b.getAttribute('aria-checked'), b.disabled])).toEqual([
      ['고른 부품 보기', 'menuitem', null, true],
      ['원근 투영', 'menuitemradio', 'true', false],
      ['평행 투영', 'menuitemradio', 'false', false],
      ['그리기 모드…', 'menuitem', null, false],
      ['격자', 'menuitemcheckbox', 'true', false],
      ['뷰 큐브', 'menuitemcheckbox', 'false', false],
      ['좌표축', 'menuitemcheckbox', 'true', false],
      ['PNG 저장', 'menuitem', null, false],
      ['내보내기…', 'menuitem', null, false],
    ]);
    expect(menu.querySelectorAll('.menu-sep[role=separator]')).toHaveLength(4);
    // 첫 초점은 고른 항목(쓸 수 없는 것은 건너뛴다)
    expect(document.activeElement?.textContent).toContain('원근 투영');

    // 휴대폰 주소 막대(높이만 바뀜)에는 닫지 않고, 폭이 바뀌면 닫는다
    window.dispatchEvent(new Event('resize'));
    expect(document.querySelector('.menu')).not.toBeNull();
    Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(document.querySelector('.menu')).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');

    more.click();
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')].find((b) => b.textContent?.includes('뷰 큐브'))!.click();
    more.click();
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')].find((b) => b.textContent?.includes('평행 투영'))!.click();
    expect(h.calls).toEqual(['cube', 'proj orthographic']);
    expect(document.querySelector('.menu')).toBeNull();
  });

  it('보기 설정의 "그리기 모드…": 같은 버튼 자리에 그리기 모드 메뉴(넓은 화면 버튼과 같은 열 항목)를 다시 열고, 고르면 닫는다', () => {
    const h = { ...host(), renderMode: 'hiddenLine' as const };
    const tb = new Toolbar(h);
    document.body.append(tb.el);
    const more = button(tb, '보기 설정');
    more.focus();
    more.click();
    const item = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')].find((b) => b.textContent === '그리기 모드…')!;
    item.focus();
    item.click();
    const menu = document.querySelector<HTMLElement>('.menu')!;
    expect(menu.getAttribute('aria-label')).toBe('그리기 모드');
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const items = [...menu.querySelectorAll<HTMLButtonElement>('.menu-item')];
    expect(items.map((b) => [b.querySelector('.menu-label')!.textContent, b.getAttribute('aria-checked'), b.disabled])).toEqual([
      ['음영', 'false', false],
      ['음영 + 모서리', 'false', false],
      ['와이어프레임', 'false', false],
      ['X-ray', 'false', false],
      ['숨은선 제거', 'true', false],
      ['단색', 'false', false],
      ['숨은 모서리 점선', 'false', false],
      ['외곽선 강조', 'true', true],
      ['주변 가림', 'false', true],
      ['부품 색 구분', 'false', false],
      ['분해 보기', 'false', false],
    ]);
    // 키보드로 열었으면 초점은 새 메뉴의 고른 항목(숨은선 제거)
    expect(document.activeElement?.textContent).toContain('숨은선 제거');
    items[10]!.click();
    expect(h.calls).toEqual(['explode']);
    expect(document.querySelector('.menu')).toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('화살표 키는 쓸 수 없는 항목을 건너뛴다', () => {
    const tb = new Toolbar(host());
    document.body.append(tb.el);
    button(tb, '보기 설정').click();
    const key = (k: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('ArrowUp');
    expect(document.activeElement?.textContent).toContain('내보내기…');
    key('ArrowDown');
    expect(document.activeElement?.textContent).toContain('원근 투영');
  });

  it('표준 뷰 메뉴: 홈 뷰(Home)와 "지금 보기를 홈 뷰로", 면 단면이면 단면 버튼이 켜짐 · "단면 면"', () => {
    const h = host();
    const tb = new Toolbar(h);
    document.body.append(tb.el);
    button(tb, '표준 뷰').click();
    const labels = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')].map((b) => b.querySelector('.menu-label')!.textContent);
    expect(labels[0]).toBe('홈 뷰');
    expect(labels[labels.length - 1]).toBe('지금 보기를 홈 뷰로');
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')][0]!.click();
    button(tb, '표준 뷰').click();
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')].at(-1)!.click();
    expect(h.calls).toEqual(['home', 'setHome']);
    const on = { ...host(), sectionOn: true };
    const tb2 = new Toolbar(on);
    const sec = [...tb2.el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.querySelector('.btn-label')?.textContent?.startsWith('단면'))!;
    expect(sec.querySelector('.btn-label')!.textContent).toBe('단면 면');
    expect(sec.getAttribute('aria-pressed')).toBe('true');
  });

  it('그리기 모드 메뉴: 숨은선 제거·단색과 그리기 선택(숨은 모서리 점선은 숨은선 모드에서만, 외곽선은 숨은선 모드에서 켜진 채 잠김, 부품 색·분해)', () => {
    const h = { ...host(), renderMode: 'hiddenLine' as const, partColors: true };
    const tb = new Toolbar(h);
    document.body.append(tb.el);
    const mode = button(tb, '숨은선 제거');
    expect(mode).toBeDefined();
    mode.click();
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')];
    expect(items.map((b) => [b.querySelector('.menu-label')!.textContent, b.getAttribute('aria-checked'), b.disabled])).toEqual([
      ['음영', 'false', false],
      ['음영 + 모서리', 'false', false],
      ['와이어프레임', 'false', false],
      ['X-ray', 'false', false],
      ['숨은선 제거', 'true', false],
      ['단색', 'false', false],
      ['숨은 모서리 점선', 'false', false],
      ['외곽선 강조', 'true', true],
      ['주변 가림', 'false', true],
      ['부품 색 구분', 'true', false],
      ['분해 보기', 'false', false],
    ]);
    items[6]!.click();
    mode.click();
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')][10]!.click();
    mode.click();
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')][5]!.click();
    expect(h.calls).toEqual(['hiddenEdges', 'explode', 'mode monochrome']);
  });

  it('62차 주변 가림: 음영 계열에서만 켜고 끈다(켠 값은 와이어프레임·X-ray·숨은선에서 끈 채 잠김 — 코어가 그리지 않는다)', () => {
    const ao = (renderMode: 'shaded' | 'shadedEdges' | 'monochrome' | 'wireframe' | 'xray' | 'hiddenLine', ambientOcclusion: boolean) => {
      document.body.innerHTML = '';
      const h = { ...host(), renderMode, ambientOcclusion };
      const tb = new Toolbar(h);
      document.body.append(tb.el);
      button(tb, RENDER_MODES.find(([m]) => m === renderMode)![1]).click();
      const item = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')].find((b) => b.querySelector('.menu-label')!.textContent === '주변 가림')!;
      const out = [item.getAttribute('aria-checked'), item.disabled];
      if (!item.disabled) item.click();
      closeMenu();
      return [...out, h.calls.join()];
    };
    expect(ao('shadedEdges', false)).toEqual(['false', false, 'ao']);
    expect(ao('shaded', true)).toEqual(['true', false, 'ao']);
    expect(ao('monochrome', true)).toEqual(['true', false, 'ao']);
    expect(ao('wireframe', true)).toEqual(['false', true, '']);
    expect(ao('xray', true)).toEqual(['false', true, '']);
    expect(ao('hiddenLine', true)).toEqual(['false', true, '']);
  });

  it('선 모드(와이어프레임·숨은선)는 1화소 외곽선을 늘 켜고 "외곽선 강조"를 잠근다 — 다른 모드는 사용자 값(기본 굵기)', () => {
    expect((['wireframe', 'hiddenLine'] as const).map(isLineMode)).toEqual([true, true]);
    expect((['shaded', 'shadedEdges', 'xray', 'monochrome'] as const).map(isLineMode)).toEqual([false, false, false, false]);
    expect(profilesFor('wireframe', false)).toEqual({ width: 1 });
    expect(profilesFor('hiddenLine', true)).toEqual({ width: 1 });
    expect(profilesFor('shadedEdges', true)).toBe(true);
    expect(profilesFor('xray', false)).toBe(false);
    const h = { ...host(), renderMode: 'wireframe' as const };
    const tb = new Toolbar(h);
    document.body.append(tb.el);
    button(tb, '와이어프레임').click();
    const item = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')].find((b) => b.querySelector('.menu-label')!.textContent === '외곽선 강조')!;
    expect([item.getAttribute('aria-checked'), item.disabled]).toEqual(['true', true]);
  });
});

describe('고르기 메뉴: 단위(부품·바디·면·모서리)와 여러 개 고르기', () => {
  afterEach(() => closeMenu());

  it('단위 하나 고르기와 여러 개 고르기 켜고 끄기, 버튼 글·아이콘·켜짐이 단위를 따른다', () => {
    document.body.innerHTML = '';
    const h = host();
    const tb = new Toolbar(h);
    document.body.append(tb.el);
    const pick = button(tb, '부품 고르기');
    expect(pick.getAttribute('aria-haspopup')).toBe('menu');
    expect(pick.classList.contains('on')).toBe(false);
    expect(pick.dataset.icon ?? 'pick').toBe('pick');
    pick.click();
    const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')];
    expect(items.map((b) => [b.querySelector('.menu-label')!.textContent, b.getAttribute('role'), b.getAttribute('aria-checked'), b.disabled])).toEqual([
      ['부품', 'menuitemradio', 'true', false],
      ['바디', 'menuitemradio', 'false', false],
      ['면·모서리', 'menuitemradio', 'false', false],
      ['여러 개 고르기', 'menuitemcheckbox', 'false', false],
    ]);
    items[1]!.click();
    pick.click();
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')][3]!.click();
    expect(h.calls).toEqual(['unit body', 'multi']);

    // 몸체 단위: 단추 글·아이콘이 바뀌고 켜짐
    const body = { ...host(), pickUnit: 'body' as const };
    const tb2 = new Toolbar(body);
    const b2 = button(tb2, '바디 고르기');
    expect(b2.dataset.icon).toBe('body');
    expect(b2.classList.contains('on')).toBe(true);
    // 면·모서리(예전 면 고르기): 여러 개 고르기는 쓸 수 없다
    const face = { ...host(), pickUnit: 'face' as const };
    const tb3 = new Toolbar(face);
    document.body.append(tb3.el);
    const b3 = button(tb3, '면 고르기');
    expect(b3.dataset.icon).toBe('face');
    b3.click();
    const fi = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')];
    expect(fi[2]!.getAttribute('aria-checked')).toBe('true');
    expect(fi[3]!.disabled).toBe(true);
    // 여러 개 고르기만 켜도 켜짐
    expect(button(new Toolbar({ ...host(), multiPick: true }), '부품 고르기').classList.contains('on')).toBe(true);
  });
});

describe('도구 막대 말풍선 번역', () => {
  it('표준 뷰 버튼의 단축키 안내가 다른 언어에서 한국어 없이', () => {
    document.body.innerHTML = '';
    const tb = new Toolbar(host());
    document.body.append(tb.el);
    const title = button(tb, '표준 뷰').title;
    expect(title).toMatch(/^표준 뷰 \(1 앞 · 2 뒤 · .* · 7 남동 등각\)$/);
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) expect(translate(title, lang), lang).not.toMatch(/[가-힣]/);
    expect(translate(title, 'en')).toBe('Standard Views (1 Front · 2 Back · 3 Left · 4 Right · 5 Top · 6 Bottom · 7 SE isometric)');
  });
});

// 141차: 좌표축 버튼(말풍선 「좌표축 보이기」)이 왼쪽 아래 좌표축 표시만 끄고 격자의 장면 안 X·Y축선(좌표축 글자와 같은 축 색)은 남기던 것 —
// 코어 0.113.0 setAxesStyle hidden으로 둘을 함께(코어 앱 할 일 「좌표축 단추에서 둘을 함께 부른다」, SKP 좌표축 버튼과 같은 꼴)
describe('좌표축 버튼(141차 — 왼쪽 아래 좌표축 표시와 격자의 장면 안 X·Y축선을 함께)', () => {
  /** 세모 하나(x·y 0~10, z 0) — 격자 사각형이 세계 원점을 담아 X·Y축선이 둘 다 있다 */
  const scene = (): Scene3d => ({
    name: 'tri',
    units: 'mm',
    meshes: [{ id: 'a', positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]), color: [0.6, 0.6, 0.6, 1] }],
    lines: [],
  });
  /** 그리기 한 번의 GL 그리기 호출 수(가짜 WebGL2 기록 — 그리기 상태 줄은 뺌). 왼쪽 아래 좌표축 표시는 2D 덧그림이라 들지 않는다 */
  const draws = (v: Viewer3d): number => {
    const log = drawLog(v.canvas.getContext('webgl2'))!;
    log.draws = [];
    log.on = true;
    v.renderNow();
    log.on = false;
    return log.draws.filter((d) => d.startsWith('["draw')).length;
  };

  it('실제 코어: 끄면 격자를 켠 채로 장면 안 X·Y축선 그리기 둘만 빠지고, 격자 버튼을 껐다 켜도·새 장면에도 꺼진 채, 켜면 처음과 같은 그리기 수', () => {
    const { viewer: v, restore } = jsdomViewer();
    try {
      v.setScene(scene());
      v.fit(false);
      v.renderNow();
      expect([v.gridVisible, v.axesVisible, v.axesStyle]).toEqual([true, true, null]);
      const on = draws(v);
      expect(on).toBeGreaterThan(2);

      showAxes(v, false);
      expect([v.gridVisible, v.axesVisible, v.axesStyle?.hidden]).toEqual([true, false, true]);
      expect(draws(v)).toBe(on - 2);
      // 격자 버튼(F7)으로 껐다 켜도 축선은 좌표축 버튼을 따른다
      v.setGridVisible(false);
      v.setGridVisible(true);
      expect(draws(v)).toBe(on - 2);
      // 다른 문서를 열어도(새 장면) 꺼진 채 — 왼쪽 아래 표시(axesVisible)처럼 뷰어에 남는다
      v.setScene(scene());
      v.fit(false);
      v.renderNow();
      expect([v.axesVisible, v.axesStyle?.hidden]).toEqual([false, true]);
      expect(draws(v)).toBe(on - 2);

      showAxes(v, true);
      expect([v.gridVisible, v.axesVisible, v.axesStyle]).toEqual([true, true, null]);
      expect(draws(v)).toBe(on);
    } finally {
      restore();
    }
  });

  it('app.ts: 도구 막대 좌표축 버튼·보기 설정 → 좌표축(toggleAxes)은 showAxes 하나로 둘을 함께 — 코어 좌표축 함수를 따로 부르는 곳 없음', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const i = app.indexOf('\n  toggleAxes(): void {');
    expect(i).toBeGreaterThan(0);
    const body = app.slice(i, app.indexOf('\n  }\n', i));
    expect(body).toContain('showAxes(v, !v.axesVisible);');
    expect(body).toContain('this.toolbar.refresh();');
    expect(app).not.toMatch(/\.setAxesVisible\(|\.setAxesStyle\(/);
  });
});
