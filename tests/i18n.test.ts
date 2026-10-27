import { metadataForLanguage } from '../site/i18n.mjs';
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
  it('has no machine-translation leftovers: stray extra lines or wrong-sense words', () => {
    for (const {code} of languages.filter(item => item.code !== 'ko'))
      for (const [key, value] of Object.entries(catalogs[code])) {
        expect(value.split('\n').length, `${code}: ${key}`).toBe(key.split('\n').length);
        // 해석기(parser)를 통역사로, 그릴(draw)을 석쇠로, 자리(placement)를 맞춤으로 옮긴 말
        expect(value, `${code}: ${key}`).not.toMatch(/译员|Dolmetsch|Grill|grill|グリル|烤架|Justification/);
      }
    expect(translate('삼각화 못 한 면', 'en')).toBe('Faces that could not be triangulated');
    expect(translate('삼각형 1,234', 'en')).toBe('Triangles 1,234');
  });
  it('translates each line of a multi-line message, even when a trailing {0} would swallow the next line', () => {
    // 줄바꿈으로 이은 글: "…: {0}"의 {0}이 다음 줄까지 잡아 둘째 줄이 한국어로 남던 것(공용 번역기 맞춤)
    const tip = '그림을 저장하지 못했습니다: part.png\n최근 문서에서 지우기: part.step';
    for (const {code} of languages.filter(item => item.code !== 'ko')) expect(translate(tip, code), code).not.toMatch(/[가-힣]/);
    expect(translate(tip, 'en')).toBe(`${translate('그림을 저장하지 못했습니다: part.png', 'en')}\n${translate('최근 문서에서 지우기: part.step', 'en')}`);
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
  it.each(['en', 'ja', 'zh-CN', 'de'])('localizes toolbar and status refreshed by the initial languagechange event in %s', async code => {
    const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><button id="projection">원근</button><p id="status"></p><span class="docname">원근.step</span></div></body></html>', {url:languageUrl(metadataForLanguage('ko').url,code)});
    for (const name of ['window','document','Node','Element','HTMLAnchorElement','MutationObserver','location','history','localStorage','CustomEvent']) vi.stubGlobal(name,(dom.window as unknown as Record<string,unknown>)[name]);
    const root = document.getElementById('app')!;
    const projection = document.getElementById('projection')!;
    const status = document.getElementById('status')!;
    // App.onLanguageChange refreshes these after the first presentation pass.
    root.addEventListener('languagechange', () => {
      projection.textContent = '원근';
      projection.title = '지금 원근 투영 — 눌러서 평행 투영으로';
      status.replaceChildren(Object.assign(document.createElement('span'), {textContent:'STEP 파일을 열거나 끌어다 놓으세요'}));
    });
    dispose=await installLocalization(root);
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(projection.textContent).toBe(translate('원근',code));
    expect(projection.title).toBe(translate('지금 원근 투영 — 눌러서 평행 투영으로',code));
    expect(status.textContent).toBe(translate('STEP 파일을 열거나 끌어다 놓으세요',code));
    expect(root.querySelector('.docname')!.textContent).toBe('원근.step');
    dispose();dispose=undefined;dom.window.close();
  });
  it('switches actual sharing image URLs and native control names while preserving source data', async () => {
    const korean = metadataForLanguage('ko');
    const dom = new JSDOM(`<!doctype html><html><head><title>OpenCAD</title><meta property="og:image"><meta property="og:image:secure_url"><meta name="twitter:image"><script type="application/ld+json">{"@graph":[{"@type":"WebApplication"}]}</script></head><body><div id="app"><header class="titlebar"><button>열기</button></header><span class="docname">열기.skp</span></div></body></html>`, {url:languageUrl(korean.url,'en')+'?sample#view'});
    for (const name of ['window','document','Node','Element','HTMLAnchorElement','MutationObserver','location','history','localStorage','CustomEvent']) vi.stubGlobal(name,(dom.window as unknown as Record<string,unknown>)[name]);
    const root = document.getElementById('app')!;
    dispose=await installLocalization(root);
    const labels = {en:'Choose language', de:'Sprache wählen', ko:'언어 선택'};
    for (const code of ['en','de','ko'] as const) {
      if (code!=='en') {
        (document.querySelector(`.language-list [data-language="${code}"]`) as HTMLButtonElement).click();
        for (let i=0;i<4;i++) await new Promise(resolve=>setTimeout(resolve,0));
      }
      const image = code==='ko' ? korean.image.url : `https://gyutae-kim.github.io/assets/i18n/${code}/og/opencad.jpg`;
      for (const selector of ['meta[property="og:image"]','meta[property="og:image:secure_url"]','meta[name="twitter:image"]']) expect(document.querySelector(selector)!.getAttribute('content')).toBe(image);
      expect(JSON.parse(document.querySelector('script[type="application/ld+json"]')!.textContent!)['@graph'][0].image).toBe(image);
      expect(root.querySelector('.language-trigger')!.getAttribute('aria-label')).toBe(labels[code]);
      expect(root.querySelector('.docname')!.textContent).toBe('열기.skp');

    }
    dispose();dispose=undefined;dom.window.close();
  });

});
