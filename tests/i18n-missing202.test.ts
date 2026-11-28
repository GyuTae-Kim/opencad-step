/**
 * 202차: 원문이 바뀐 뒤 새 열쇠가 없던 화면 글(README 개발 절 202차 문단).
 * - 속성 탭 안내(panel.ts renderProps — #19에서 「… 누르거나 "여러 개 고르기"를 켜면 …」으로 바뀜)의 열쇠가 사전에 없어 다른 언어 화면에서 한국어로 남았다.
 *   옛 원문 열쇠의 번역에 바뀐 몫만 더해 새 원문 열쇠로 옮기고, 쓰는 곳이 없어진 옛 열쇠는 뺐다(같은 사전 낱말 — 「여러 개 고르기」·모델 트리).
 * - 재발 막기: index.html <main> 정적 소개 글(빌드가 태그 사이 글 마디마다 옮긴다 — 줄을 나눈 글은 빈칸을 하나로 모은 한 열쇠)이
 *   네 사전 열쇠에 모두 있는지 빌드 없이 본다. check:i18n은 빌드한 dist만 읽어, 201차에 그 열쇠를 뺀 것이 PR CI에서야 걸렸다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const ROOT = join(__dirname, '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');
const HANGUL = /[가-힣]/;

/** 속성 탭 안내 — 지금 원문과 #19 앞 옛 원문. 222차: 속성 탭 본문을 panel.ts renderProps에서 뷰어 조각의 propsview.ts로 옮겨 원문도 그 파일에 */
const PROPS_SRC = 'src/app/propsview.ts';
const HINT = '부품을 고르면(3D에서 누르거나 모델 트리에서) 그 부품의 속성을 보입니다. Ctrl·⌘·Shift를 누른 채 누르거나 "여러 개 고르기"를 켜면 여러 개를 고릅니다.';
const OLD_HINT = '부품을 고르면(3D에서 누르거나 모델 트리에서) 그 부품의 속성을 보입니다. Ctrl·⌘·Shift를 누른 채 누르면 여러 개를 고릅니다.';

/**
 * index.html <main>의 글 마디 — 빌드(opencad-site-kit localizeHtml)와 같이 태그 사이 글을 하나씩, script·style·주석 안은 빼고,
 * check:i18n처럼 [data-static-languages] 안도 뺀다. 번역층(normalize)처럼 빈칸을 하나로 모은다.
 */
function staticIntroTexts(html: string): string[] {
  const start = html.indexOf('<main');
  const main = html.slice(start, html.indexOf('</main>', start));
  const body = main
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(\w+)\b[^>]*\bdata-static-languages\b[^>]*>[\s\S]*?<\/\1>/g, '');
  const decode = (text: string): string =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return body
    .split(/<[^>]*>/)
    .map((text) => decode(text).replace(/\s+/g, ' ').trim())
    .filter((text) => HANGUL.test(text));
}

describe('원문이 바뀐 뒤 새 열쇠가 없던 화면 글(202차)', () => {
  it('속성 탭 안내의 지금 원문은 네 사전에 열쇠가 있어 한글이 남지 않고, 같은 사전의 「여러 개 고르기」·모델 트리 낱말을 쓴다', () => {
    expect(read(PROPS_SRC)).toContain(`'${HINT}'`);
    for (const lang of LANGS) {
      const catalog = catalogs[lang]!;
      const value = catalog[HINT];
      expect(value, lang).toBeTruthy();
      expect(value, lang).not.toMatch(HANGUL);
      expect(translate(HINT, lang), lang).toBe(value);
      for (const term of ['여러 개 고르기', '모델 트리']) expect(value!.toLowerCase(), `${lang} ${term}`).toContain(catalog[term]!.toLowerCase());
    }
  });

  it('옛 원문 열쇠는 네 사전과 앱 원문에서 빠지고, 새 값은 같은 언어의 다른 값과 겹치지 않아 거꾸로 찾으면 제 원문이다', () => {
    for (const f of ['src/app/panel.ts', PROPS_SRC]) expect(read(f), f).not.toContain(OLD_HINT);
    for (const lang of LANGS) {
      const catalog = catalogs[lang]!;
      expect(catalog[OLD_HINT], lang).toBeUndefined();
      const value = catalog[HINT] ?? '';
      expect(Object.values(catalog).filter((v) => v === value), lang).toHaveLength(1);
      expect(sourceMessage(value), lang).toBe(HINT);
    }
  });

  it('index.html <main> 정적 소개 글은 빈칸을 모으면 네 사전에 그대로의 열쇠가 있다(빌드 없이 — check:i18n 「untranslated static introduction」을 먼저 잡음)', () => {
    const texts = staticIntroTexts(read('index.html'));
    expect(texts.length).toBeGreaterThan(5);
    // 여러 줄로 나눈 소개 문단도 한 글 마디(201차가 놓친 꼴)
    expect(texts.some((text) => text.startsWith('STEP(ISO 10303-21') && text.endsWith('저장할 수 있습니다.'))).toBe(true);
    for (const lang of LANGS) {
      const catalog = catalogs[lang]!;
      expect(texts.filter((text) => !catalog[text]), lang).toEqual([]);
      expect(texts.map((text) => translate(text, lang)).filter((text) => HANGUL.test(text)), lang).toEqual([]);
    }
  });
});
