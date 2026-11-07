// @vitest-environment jsdom
/**
 * 파일 글 도우미(ftext.ts — 59차): 길이 한도·제어 문자·방향 가둠, 그리고 화면 번역층이 파일 글을 사전으로 바꾸지 않는지
 * (사전 열쇠와 같은 이름 — "블록"·"평행"·"(이름 없음)" — 을 네 언어 화면에서 원문 그대로, 화면 글은 옮김).
 * 보이지 않는 글자는 \u{…}로 적는다(FSI U+2068 · PDI U+2069 · RLO U+202E).
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipText, FILE_TEXT_MAX, fileSpan, isolateText } from '../../src/app/ftext';
import { installLocalization } from '../../src/app/i18n';
import { languageUrl, metadataForLanguage, translate } from '../../site/i18n.mjs';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const FSI = '\u{2068}';
const PDI = '\u{2069}';
const RLO = '\u{202e}';

describe('파일 글 화면 글로', () => {
  it('한도 안은 그대로, 넘으면 앞부분 + …(서로게이트 짝을 가르지 않는다)', () => {
    expect(clipText('받침판')).toBe('받침판');
    const long = 'W'.repeat(40_000);
    expect(clipText(long)).toBe(`${'W'.repeat(FILE_TEXT_MAX)}…`);
    // 한도 끝 글자가 BMP 밖(이모지 — 짝 둘)이면 짝 앞에서 자른다
    const emoji = `${'a'.repeat(FILE_TEXT_MAX - 1)}\u{1f600}tail`;
    expect(clipText(emoji)).toBe(`${'a'.repeat(FILE_TEXT_MAX - 1)}…`);
    expect(clipText('abcdef', 3)).toBe('abc…');
    // 조각마다 가둔 글(경로)을 가운데서 자르면 열린 가둠을 닫고 "…"
    expect(clipText(`${FSI}ab${PDI} › ${FSI}cdef${PDI}`, 9)).toBe(`${FSI}ab${PDI} › ${FSI}c${PDI}…`);
  });

  it('제어 문자(C0·DEL)는 보이는 기호(U+2400 묶음)로, 탭·줄바꿈과 다른 글자는 그대로', () => {
    expect(clipText('a\u{0}b\u{7}c\u{1b}d\u{7f}e')).toBe('a\u{2400}b\u{2407}c\u{241b}d\u{2421}e');
    expect(clipText('a\tb\nc\r\nd')).toBe('a\tb\nc\r\nd');
    const odd = `\u{5e9}\u{5dc}\u{5d5}\u{5dd} ${RLO} abc \ud800`;
    expect(clipText(odd)).toBe(odd);
  });

  it('섞이는 글은 FSI…PDI로 가두고(빈 글은 그대로), 요소는 글로만(HTML로 읽지 않음)·번역하지 않음·말풍선도 한도', () => {
    expect(isolateText(`abc${RLO}`)).toBe(`${FSI}abc${RLO}${PDI}`);
    expect(isolateText('')).toBe('');
    expect(isolateText('W'.repeat(5000)).length).toBe(FILE_TEXT_MAX + 3);
    const s = fileSpan('<img src=x onerror=alert(1)>', 'v', 'T'.repeat(3000));
    expect(s.className).toBe('ftext v');
    expect(s.getAttribute('translate')).toBe('no');
    expect(s.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(s.childElementCount).toBe(0);
    expect(s.title.length).toBe(FILE_TEXT_MAX + 1);
    expect(fileSpan('a').hasAttribute('title')).toBe(false);
  });

  it('번역기(틀 {0})는 갇힌 파일 글을 사전 열쇠로 보지 않고 틀에 그대로 끼운다', () => {
    // 갇히지 않은 이름은 사전 열쇠와 같으면 바뀌었다(58차까지 — 예제 자리 이름 "블록-1" → "Block-1")
    expect(translate('블록-1', 'en')).toBe('Block-1');
    expect(translate(isolateText('블록-1'), 'en')).toBe(isolateText('블록-1'));
    expect(translate(`고른 것: ${isolateText('블록')} · ${isolateText('평행')}`, 'en')).toBe(`Selected: ${isolateText('블록')} · ${isolateText('평행')}`);
    expect(translate(`${isolateText('평행')} 숨기기`, 'en')).toBe(`Hide ${isolateText('평행')}`);
  });
});

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  vi.unstubAllGlobals();
});

describe('화면 번역층과 파일 글(영어·독일어·일본어·중국어)', () => {
  it.each(['en', 'de', 'ja', 'zh-CN'])('%s: 사전 열쇠와 같은 파일 이름은 원문 그대로, 화면 글은 옮긴다', async (code) => {
    const dom = new JSDOM('<!doctype html><html><head><title>OpenCAD</title></head><body><div id="app"><header class="titlebar"></header><div id="host"></div></div></body></html>', { url: languageUrl(metadataForLanguage('ko').url, code) });
    for (const name of ['window', 'document', 'Node', 'Element', 'HTMLAnchorElement', 'MutationObserver', 'location', 'history', 'localStorage', 'CustomEvent']) vi.stubGlobal(name, (dom.window as unknown as Record<string, unknown>)[name]);
    const root = document.getElementById('app')!;
    const host = document.getElementById('host')!;
    // 패널 아래 띠·상태 막대·눈 단추·정보 줄과 같은 꼴: 화면 글 + 파일 글(요소 또는 갇힌 글)
    const foot = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = '고른 제품 ';
    const dim = document.createElement('span');
    dim.className = 'dim';
    dim.append(' · ', fileSpan('(이름 없음)'));
    foot.append(b, fileSpan('블록'), dim);
    const status = document.createElement('div');
    status.append(`고른 것: ${isolateText('받침판')} · ${isolateText('평행')}`);
    const eye = document.createElement('button');
    eye.setAttribute('aria-label', `${isolateText('면')} 숨기기`);
    eye.title = '숨기기';
    const info = document.createElement('div');
    const k = document.createElement('span');
    k.className = 'k';
    k.textContent = '작성자';
    info.append(k, fileSpan('모름', 'v', '모름'));
    host.append(foot, status, eye, info);
    dispose = await installLocalization(root);
    // 파일 글: 원문 그대로
    expect([...foot.querySelectorAll('.ftext')].map((e) => e.textContent)).toEqual(['블록', '(이름 없음)']);
    expect(info.querySelector('.ftext')!.textContent).toBe('모름');
    expect(info.querySelector('.ftext')!.getAttribute('title')).toBe('모름');
    expect(status.textContent).toBe(`${translate('고른 것: {0}', code).replace('{0}', '')}${isolateText('받침판')} · ${isolateText('평행')}`);
    expect(eye.getAttribute('aria-label')).toBe(translate('{0} 숨기기', code).replace('{0}', isolateText('면')));
    // 화면 글: 옮김
    expect(b.textContent!.trim()).toBe(translate('고른 제품', code));
    expect(eye.title).toBe(translate('숨기기', code));
    expect(k.textContent).toBe(translate('작성자', code));
    expect(k.textContent).not.toMatch(/[가-힣]/);
    dom.window.close();
  });
});
