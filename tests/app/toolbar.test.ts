// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeMenu } from '../../src/app/menu';
import { isLineMode, profilesFor, Toolbar, type ToolbarHost } from '../../src/app/toolbar';
import { translate } from '../../site/i18n.mjs';

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
    faceMode: false,
    sectionAxis: null,
    sectionOn: false,
    hiddenEdges: false,
    profiles: false,
    partColors: false,
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
    toggleExplode: call('explode'),
    toggleGrid: call('grid'),
    toggleCube: call('cube'),
    toggleAxes: call('axes'),
    toggleMeasure: call('measure'),
    toggleFaceMode: call('face'),
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

  it('보기·측정 단추만 좁은 화면에 남기고, 나머지는 wide-only', () => {
    const tb = new Toolbar(host());
    const wide = [...tb.el.querySelectorAll('button.wide-only .btn-label')].map((e) => e.textContent);
    expect(wide).toEqual(['고른 부품 보기', '원근', '음영 + 모서리', '격자', '뷰 큐브', '좌표축', '내보내기']);
    const narrow = [...tb.el.querySelectorAll('button:not(.wide-only) .btn-label')].map((e) => e.textContent);
    expect(narrow).toEqual(['전체 보기', '표준 뷰', '보기 설정', '단면', '면 고르기', '측정', '패널']);
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
    expect(items.map((b) => [b.querySelector('.menu-label')!.textContent, b.getAttribute('role'), b.getAttribute('aria-checked'), b.disabled])).toEqual([
      ['고른 부품 보기', 'menuitem', null, true],
      ['원근 투영', 'menuitemradio', 'true', false],
      ['평행 투영', 'menuitemradio', 'false', false],
      ['음영', 'menuitemradio', 'false', false],
      ['음영 + 모서리', 'menuitemradio', 'true', false],
      ['와이어프레임', 'menuitemradio', 'false', false],
      ['X-ray', 'menuitemradio', 'false', false],
      ['숨은선 제거', 'menuitemradio', 'false', false],
      ['단색', 'menuitemradio', 'false', false],
      // 숨은 모서리 점선은 숨은선 모드에서만
      ['숨은 모서리 점선', 'menuitemcheckbox', 'false', true],
      ['외곽선 강조', 'menuitemcheckbox', 'false', false],
      ['부품 색 구분', 'menuitemcheckbox', 'false', false],
      ['분해 보기', 'menuitemcheckbox', 'false', false],
      ['격자', 'menuitemcheckbox', 'true', false],
      ['뷰 큐브', 'menuitemcheckbox', 'false', false],
      ['좌표축', 'menuitemcheckbox', 'true', false],
      ['PNG 저장', 'menuitem', null, false],
      ['내보내기…', 'menuitem', null, false],
    ]);
    expect(menu.querySelectorAll('.menu-sep[role=separator]')).toHaveLength(6);
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

  it('표준 뷰 메뉴: 홈 뷰(Home)와 "지금 보기를 홈 뷰로", 면 단면이면 단면 단추가 켜짐 · "단면 면"', () => {
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
      ['부품 색 구분', 'true', false],
      ['분해 보기', 'false', false],
    ]);
    items[6]!.click();
    mode.click();
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')][9]!.click();
    mode.click();
    [...document.querySelectorAll<HTMLButtonElement>('.menu-item')][5]!.click();
    expect(h.calls).toEqual(['hiddenEdges', 'explode', 'mode monochrome']);
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

describe('도구 막대 말풍선 번역', () => {
  it('표준 뷰 단추의 단축키 안내가 다른 언어에서 한국어 없이', () => {
    document.body.innerHTML = '';
    const tb = new Toolbar(host());
    document.body.append(tb.el);
    const title = button(tb, '표준 뷰').title;
    expect(title).toMatch(/^표준 뷰 \(1 앞 · 2 뒤 · .* · 7 남동 등각\)$/);
    for (const lang of ['en', 'ja', 'zh-CN', 'de']) expect(translate(title, lang), lang).not.toMatch(/[가-힣]/);
    expect(translate(title, 'en')).toBe('Standard Views (1 Front · 2 Back · 3 Left · 4 Right · 5 Top · 6 Bottom · 7 SE isometric)');
  });
});
