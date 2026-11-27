// @vitest-environment jsdom
/**
 * 175차 랜드마크·블록 건너뛰기(WCAG 1.3.1·2.4.1 — WAI-ARIA APG Landmark Regions, HTML-AAM):
 * 앱 뿌리(#app) 바로 밑은 제목 막대 header(banner)·도구 막대 nav[role=toolbar]·작업 영역 main·상태 막대 footer(contentinfo)다.
 * 도구 막대는 명시 role(toolbar)이 nav의 암묵 역할(navigation)을 덮어 랜드마크가 아니고 어느 랜드마크에도 들지 않아,
 * 랜드마크로 옮겨 다니는 화면 읽기 사용자는 banner 다음 main으로 넘어가며 도구 막대를 듣지 못했다.
 * 이제 제목 막대 header가 aria-owns로 도구 막대를 품는다(도구 막대는 DOM에서 header 바로 다음이라 읽는 차례·Tab 차례·모양 그대로).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { installKeyNav } from '../../src/app/keynav';
import { Toolbar, type ToolbarHost } from '../../src/app/toolbar';

const APP = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
const PANEL = readFileSync(join(__dirname, '../../src/app/panel.ts'), 'utf8');

const noop = (): void => {};
const host: ToolbarHost = {
  hasDoc: true, hasSelection: false, projection: 'perspective', renderMode: 'shadedEdges', gridOn: true, cubeOn: false, axesOn: true,
  measuring: false, panelOpen: false, pickUnit: 'part', multiPick: false, sectionAxis: null, sectionOn: false, hiddenEdges: false,
  profiles: false, partColors: false, ambientOcclusion: false, explodeOpen: false,
  fit: noop, fitSelection: noop, setView: noop, goHome: noop, setHome: noop, setProjection: noop, setRenderMode: noop, toggleHiddenEdges: noop,
  toggleProfiles: noop, togglePartColors: noop, toggleAmbientOcclusion: noop, toggleExplode: noop, toggleGrid: noop, toggleCube: noop,
  toggleAxes: noop, toggleMeasure: noop, setPickUnit: noop, toggleMultiPick: noop, setSectionAxis: noop, savePng: noop, exportItems: () => [], togglePanel: noop,
};

/** body 밑 div(#app) 바로 밑 요소가 읽히는 랜드마크(HTML-AAM — 명시 role이 암묵 역할을 덮음, section은 이름이 있을 때만) */
const LANDMARKS = ['banner', 'main', 'contentinfo', 'navigation', 'complementary', 'region', 'search', 'form'];
function landmark(el: Element): string | null {
  const role = el.getAttribute('role');
  if (role) return LANDMARKS.includes(role) ? role : null;
  const implicit: Record<string, string> = { header: 'banner', footer: 'contentinfo', main: 'main', nav: 'navigation', aside: 'complementary' };
  if (el.localName === 'section') return el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') ? 'region' : null;
  return implicit[el.localName] ?? null;
}

/** 제목 막대 header의 aria-owns(app.ts 원문 — 없으면 null) */
function titleOwns(): string | null {
  const attrs = /const title = h\(\s*'header',\s*\{([^}]*)\}/.exec(APP);
  expect(attrs, '제목 막대 header').not.toBeNull();
  expect(attrs![1]).toMatch(/class: 'titlebar'/);
  return /'aria-owns': '([^']*)'/.exec(attrs![1]!)?.[1] ?? null;
}

let dispose: (() => void) | null = null;
afterEach(() => {
  dispose?.();
  dispose = null;
  document.body.innerHTML = '';
});

describe('175차: 앱 화면 영역과 랜드마크', () => {
  it('뿌리 바로 밑 보이는 칸은 모두 랜드마크이거나 랜드마크가 품는다 — 도구 막대(role=toolbar)는 제목 막대(banner)가 품고, 같은 종류 랜드마크 이름은 겹치지 않는다', () => {
    // 뿌리 차례(DOM·Tab 차례 — 그대로)와 랜드마크 요소
    expect(APP).toMatch(/root\.replaceChildren\(title, this\.toolbar\.el, workspace, status, this\.fileInput\);/);
    expect(APP).toMatch(/const workspace = h\('main', \{ class: 'workspace' \}, this\.viewEl, this\.panel\.el\);/);
    expect(APP).toMatch(/const status = h\('footer', \{ class: 'statusbar' \},/);
    const owns = titleOwns();
    const root = document.createElement('div');
    root.id = 'app';
    const header = document.createElement('header');
    if (owns) header.setAttribute('aria-owns', owns);
    const tb = new Toolbar(host);
    const file = document.createElement('input');
    file.type = 'file';
    file.hidden = true;
    root.append(header, tb.el, document.createElement('main'), document.createElement('footer'), file);
    document.body.append(root);
    const shown = [...root.children].filter((k) => !(k as HTMLElement).hidden);
    expect(shown.map(landmark)).toEqual(['banner', null, 'main', 'contentinfo']);
    const owners = (k: Element): (string | null)[] =>
      shown.filter((o) => landmark(o) && !!k.id && (o.getAttribute('aria-owns') ?? '').split(/\s+/).includes(k.id)).map(landmark);
    expect(shown.filter((k) => !landmark(k) && owners(k).length === 0).map((k) => k.className)).toEqual([]);
    expect(owners(tb.el)).toEqual(['banner']);
    // 같은 종류 랜드마크 이름(banner·main·contentinfo는 하나씩이라 이름 없음): region 「3D 보기」·「최근 문서」, complementary 「제품·정보 패널」
    expect(APP).toMatch(/h\('section', \{ class: 'view', 'aria-label': '3D 보기' \}/);
    expect(APP).toMatch(/h\('section', \{ class: 'recent', 'aria-labelledby': 'recent-title'/);
    expect(APP).toMatch(/h\('h3', \{ id: 'recent-title' \}, '최근 문서'\)/);
    expect(PANEL).toMatch(/h\('aside', \{ class: 'panel', 'aria-label': '제품·정보 패널'/);
    const regions = ['3D 보기', '최근 문서'];
    expect(new Set(regions).size).toBe(regions.length);
  });

  it('품은 도구 막대는 header 바로 다음 형제(읽는 차례 = 화면·Tab 차례)이고 role·이름·Tab 멈춤 하나(53차 길잡이)는 그대로', () => {
    const tb = new Toolbar(host);
    expect(tb.el.getAttribute('role')).toBe('toolbar');
    expect(tb.el.getAttribute('aria-label')).toBe('보기 도구');
    expect(tb.el.id).toBe('view-tools');
    const owns = titleOwns();
    expect(owns).toBe(tb.el.id);
    const root = document.createElement('div');
    const header = document.createElement('header');
    header.setAttribute('aria-owns', owns!);
    root.append(header, tb.el, document.createElement('main'));
    document.body.append(root);
    expect(header.nextElementSibling).toBe(tb.el);
    expect(document.getElementById(owns!)).toBe(tb.el);
    expect(document.querySelectorAll(`#${owns}`)).toHaveLength(1);
    dispose = installKeyNav(root);
    const buttons = [...tb.el.querySelectorAll<HTMLButtonElement>(':scope > button')];
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
  });
});
