import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
import { installLocalization } from '../src/app/i18n';
import { catalogs, currentLanguage, languageUrl, languages, translate } from '../site/i18n.mjs';

let dispose: (() => void) | undefined;
afterEach(() => { dispose?.(); vi.unstubAllGlobals(); });
describe('language URLs and UI presentation', () => {
  it('keeps launch parameters and fragments, with explicit language URLs', () => {
    expect(currentLanguage('https://example.test/opencad-skp/ja/?sample#view')).toBe('ja');
    expect(currentLanguage('https://example.test/opencad-skp/?lang=de')).toBe('de');
    const url = new URL(languageUrl('https://gyutae-kim.github.io/opencad-skp/?sample&open=a.skp#view','en'));
    expect(url.pathname).toBe('/opencad-skp/en/'); expect(url.searchParams.has('sample')).toBe(true);
    expect(url.searchParams.get('open')).toBe('a.skp'); expect(url.hash).toBe('#view');
  });
  it('ships matching catalogs and preserves numbered parameters', () => {
    const keys = Object.keys(catalogs['en']).sort();
    for (const {code} of languages.filter(item => item.code !== 'ko')) {
      expect(Object.keys(catalogs[code]).sort()).toEqual(keys);
      for (const key of keys) expect((catalogs[code][key].match(/\{\d+\}/g) ?? []).sort()).toEqual((key.match(/\{\d+\}/g) ?? []).sort());
    }
    expect(translate('열기 ▾','en')).toBe('Open ▾');
    const template = Object.keys(catalogs.en).find(key => key.includes('{0}') && /[가-힣]/.test(key))!;
    const example = template.replace(/\{\d+\}/g, 'FILE_A.skp');
    expect(translate(example,'en')).toContain('FILE_A.skp');
    expect(translate(example,'en')).not.toBe(example);
  });
  it('translates every piece of a " · "-joined sentence, even when a short pattern would swallow the rest', () => {
    const hangul = /[가-힣]/;
    // "제품 번호 {0}"·"중심 {0}"·"시작 {0}"·"축 {0}"이 문장 끝까지 잡아 나머지가 한국어로 남던 줄(제품 나무 말풍선·고른 면 설명)
    const lines = ['제품 번호 P-100 · 형상 3개 · 선 형상 2개 · 두 번 누르면 이 부품으로 맞춰 봅니다', '중심 1, 2, 3 · 법선 0, 0, 1', '시작 0, 0, 0 · 끝 10, 0, 0',
      '반지름 5 mm · 축 0, 0, 1', '축 0, 0, 1 · 반지름 5 mm · 길이 30 mm'];
    for (const {code} of languages.filter(item => item.code !== 'ko'))
      for (const line of lines) expect(translate(line, code), `${code}: ${line}`).not.toMatch(hangul);
    expect(translate('중심 1, 2, 3 · 법선 0, 0, 1', 'en')).toBe('Center 1, 2, 3 · Normal 0, 0, 1');
    expect(translate('시작 0, 0, 0 · 끝 10, 0, 0', 'de')).toBe('Anfang 0, 0, 0 · Ende 10, 0, 0');
    expect(translate('제품 번호 P-100 · 형상 3개 · 두 번 누르면 이 부품으로 맞춰 봅니다', 'en')).toMatch(/^Product Number P-100 · /);
    // 잡은 값(파일의 이름)은 그대로: 이름에 " · "가 들어도 바꾸지 않는다
    expect(translate('부품 가나 · 다라', 'en')).toBe('Part 가나 · 다라');
    expect(translate('부품 가나 · 축 0, 0, 1', 'en')).toBe('Part 가나 · Axis 0, 0, 1');
    expect(translate('부품 Bracket · Rev 2', 'en')).toBe('Part Bracket · Rev 2');
  });
  it('updates dynamic UI and switches languages without changing document data or listeners', async () => {
    const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"><button>열기</button><span class="docname">열기</span></header><canvas></canvas><div class="anno-layer">열기</div><input value="열기" placeholder="열기"><div contenteditable="true">열기</div><div translate="no">열기</div><p id="status">열기</p></div></body></html>', {url:'https://gyutae-kim.github.io/opencad-skp/en/?sample#view'});
    for (const name of ['window','document','Node','Element','HTMLAnchorElement','MutationObserver','location','history','localStorage','CustomEvent']) vi.stubGlobal(name,(dom.window as unknown as Record<string,unknown>)[name]);
    const root = document.getElementById('app')!;
    const existing=document.createElement('p');existing.id='pretranslated';existing.textContent=translate('열기','en');root.append(existing);
    const canvas = root.querySelector('canvas');
    const button = root.querySelector('button')!; const clicked = vi.fn(); button.addEventListener('click',clicked);
    dispose=await installLocalization(root);
    expect(button.textContent).toBe(translate('열기','en'));
    expect(root.querySelector('.docname')!.textContent).toBe('열기'); expect(root.querySelector('input')!.value).toBe('열기');
    expect(root.querySelector('input')!.placeholder).toBe(translate('열기','en'));
    expect(root.querySelector('[contenteditable]')!.textContent).toBe('열기');
    expect(root.querySelector('.anno-layer')!.textContent).toBe('열기');
    const status = document.getElementById('status')!; status.textContent='닫기';
    await new Promise(resolve=>setTimeout(resolve,0)); expect(status.textContent).toBe(translate('닫기','en'));
    const dialog=document.createElement('div');dialog.textContent='닫기';document.body.append(dialog);
    await new Promise(resolve=>setTimeout(resolve,0));expect(dialog.textContent).toBe(translate('닫기','en'));
    const trigger=root.querySelector<HTMLButtonElement>('.language-trigger')!;
    trigger.click();expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu=document.querySelector<HTMLElement>('.language-list')!;
    expect(menu.hidden).toBe(false);expect(menu.querySelectorAll('[role=menuitemradio]')).toHaveLength(5);
    (menu.querySelector('[data-language=de]') as HTMLButtonElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(document.getElementById('pretranslated')!.textContent).toBe(translate('열기','de'));
    expect(document.documentElement.lang).toBe('de');expect(button.textContent).toBe(translate('열기','de'));
    expect(dialog.textContent).toBe(translate('닫기','de'));
    expect(location.search).toBe('?sample');expect(location.hash).toBe('#view');
    expect(menu.hidden).toBe(true);
    expect(menu.querySelector('[data-language=de]')!.getAttribute('aria-checked')).toBe('true');
    trigger.click();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    expect(menu.hidden).toBe(true);expect(document.activeElement).toBe(trigger);
    trigger.click();(menu.querySelector('[data-language=ko]') as HTMLButtonElement).click();
    await new Promise(resolve=>setTimeout(resolve,0));expect(button.textContent).toBe('열기');
    expect(root.querySelector('canvas')).toBe(canvas);button.click();expect(clicked).toHaveBeenCalledOnce();
    expect(root.querySelector('[translate="no"]:not(.language-control):not(.language-list)')!.textContent).toBe('열기');
    dispose();dispose=undefined;dom.window.close();
  });
});
