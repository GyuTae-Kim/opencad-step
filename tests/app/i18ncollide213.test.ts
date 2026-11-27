// @vitest-environment jsdom
/**
 * 213차(WCAG 3.1.2 — 재발 막기): 같은 언어 사전 안에서 서로 다른 열쇠가 같은 값(빈칸을 모은 글)인 겹침.
 * 번역층의 거꾸로 찾기(site-kit core.mjs `sourceMessage`)는 모든 사전 값을 한 Map에 넣어 같은 값이면 **뒤 열쇠**로 되돌린다.
 * 앱 번역층(src/app/i18n.ts `value`)은 칸마다 원문 기록을 두어, 원문을 그린 뒤 언어를 바꾸거나 다시 그리는 길에서는 겹친 값이라도 제 원문으로 옮긴다(아래 jsdom).
 * 기록 없이 이미 옮긴 글이 들어오면(i18n.test 「pretranslated」 계약 — 정적 언어 쪽·옮긴 글을 베낀 칸) 이긴 열쇠의 번역이 나오므로,
 * 묶음 열쇠의 번역이 다른 언어에서 갈리고 뜻이 다르면 해가 있다 — 213차에 같은 사전 근거로 셋을 갈랐다(zh-CN 「숨김」 已隐藏·「압축 풀기」 解压, de 「압축 푸는 중」 Wird entpackt).
 * 남은 겹침은 KNOWN으로 고정한다: 목록 밖 새 겹침, 목록에 있는데 이제 안 겹침, 번역이 갈리는 언어가 바뀜 — 모두 실패(DWG 324차 꼴). 고쳤거나 새로 겹치면 표(README 개발 절 213차)를 보고 목록을 고친다.
 * 공용 규칙 9번(NC 201차 기호 열쇠 ':' 사고): 네 사전 열쇠는 한글이나 {n} 틀을 품는다(og 그림 주소 하나 뺌) — 맨 아래.
 * 214차: 쓰는 곳 0 열쇠를 뺀 만큼(i18n-unused201 — 본체·작성·소스 코드·코드·도면층·면 선택 등) 묶음이 줄고(37 → 23), 중국어·독일어 덮개 글 「읽는 중」을
 * 같은 단계 표 꼴(正在读取·Wird gelesen)로 바꿔 단계 이름 「읽기」와의 겹침도 풀렸다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { installLocalization } from '../../src/app/i18n';
import { sourceMessage, translate } from '../../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
/** 네 사전(파일 그대로 — 열쇠 차례가 거꾸로 찾기의 이김을 정한다) */
const CATALOG = Object.fromEntries(
  LANGS.map((l) => [l, JSON.parse(readFileSync(join(__dirname, '../../site/locales', `${l}.json`), 'utf8')) as Record<string, string>]),
) as Record<Lang, Record<string, string>>;
/** 번역층이 값을 견주는 꼴(core.mjs normalize) */
const norm = (v: string): string => v.replace(/\s+/g, ' ').trim();
const SLOT = /\{\d+\}/;
const OG = 'https://gyutae-kim.github.io/opencad-step/og-opencad.jpg';

type Group = { value: string; keys: string[] };
/** 같은 언어 안 겹친 값 묶음 — 열쇠는 사전 차례(거꾸로 찾기는 맨 뒤 열쇠로 되돌린다) */
function groups(lang: Lang): Group[] {
  const by = new Map<string, string[]>();
  for (const [key, value] of Object.entries(CATALOG[lang])) by.set(norm(value), [...(by.get(norm(value)) ?? []), key]);
  return [...by].filter(([, keys]) => keys.length > 1).map(([value, keys]) => ({ value, keys }));
}
/** 묶음 열쇠의 번역이 이긴 열쇠(맨 뒤)의 번역과 다른 다른 언어 — 옮긴 글로 들어와 언어를 바꾸면 다른 원문의 번역이 나오는 언어 */
function split(lang: Lang, g: Group): Lang[] {
  const win = g.keys[g.keys.length - 1]!;
  return LANGS.filter((o) => o !== lang && g.keys.some((k) => CATALOG[o][k] !== CATALOG[o][win]));
}

/**
 * 둔 까닭 — 같은 명령: 같은 버튼의 보이는 글·이름이나 같은 명령의 짧은·긴 이름 · 안 그림: 두 열쇠 모두 앱 화면에 쓰는 곳 0(코어 개발 화면만)
 * · 그리는 쪽이 이김: 한쪽은 화면에 안 나오고 거꾸로 찾기가 그리는 쪽으로 감 · 틀: 거꾸로 찾기는 통째 글만 맞춰 채운 틀 글은 되돌리지 않음
 * · 네 언어 같음 · 같은 뜻 · 설계(206차 분해 거리 칸 두 상태 — i18n-labelname194 twin) · 근거 없음: 해가 있지만 같은 사전에 가를 낱말이 없어 둠(보고 둔 것)
 */
type Why = '같은 명령' | '안 그림' | '그리는 쪽이 이김' | '틀' | '네 언어 같음' | '같은 뜻' | '설계' | '근거 없음';
/** 남긴 겹침: [같은 값, 열쇠(사전 차례), 번역이 갈리는 다른 언어, 둔 까닭] */
const KNOWN: Record<Lang, [value: string, keys: string[], split: Lang[], why: Why][]> = {
  en: [
    ['Actions', ['작업', '작업 메뉴'], ['ja', 'zh-CN'], '같은 명령'],
    ['All', ['모두', '전체'], ['ja'], '안 그림'],
    // 214차: 「작성」(Author — 작성자 안의 조각)·「본체」(Body — 예제 레이어 이름, 거꾸로 찾기에서 바디를 이기던 것)·「면 선택」(Select faces)은 쓰는 곳 0이라 뺐다
    ['Look at', ['정면', '정면으로 보기'], ['ja', 'de'], '같은 명령'],
    // 타원 모서리 긴·짧은 반지름 ↔ 원환 면 큰·작은 반지름(ja 長半径·大半径, de Große Halbachse·Großer Radius) — en 사전에 semi-axis 꼴이 없음(205차 보고 둔 것)
    ['Major radius', ['긴 반지름', '큰 반지름'], ['ja', 'zh-CN', 'de'], '근거 없음'],
    ['Major radius {0}', ['긴 반지름 {0}', '큰 반지름 {0}'], ['ja', 'zh-CN', 'de'], '틀'],
    ['Minor radius', ['작은 반지름', '짧은 반지름'], ['ja', 'zh-CN', 'de'], '근거 없음'],
    // 밀도 고르기 빈 항목 ↔ 회전 없음(ja 選択しない·なし, de Keiner·Keine)
    ['None', ['고르지 않음', '없음'], ['ja', 'zh-CN', 'de'], '근거 없음'],
    ['Selected: {0}', ['고른 것: {0}', '가상 커서 알림 — 골랐습니다: {0}'], ['ja', 'zh-CN'], '틀'],
  ],
  ja: [
    ['配置数', ['놓인 수', '자리'], ['en', 'zh-CN', 'de'], '같은 뜻'],
    // 나무 눈 버튼·작업 메뉴 숨기기(할 일) ↔ 레이어 칩 숨김(상태) — ja 사전은 상태도 非表示(칩 말풍선 「非表示にした」)
    ['非表示', ['숨기기', '숨김'], ['en', 'zh-CN', 'de'], '근거 없음'],
  ],
  'zh-CN': [
    ['全部', ['모두', '전체'], ['ja'], '안 그림'],
    // 단면 축 메뉴 끔 ↔ 대화 상자 닫기 — zh 사전은 끔·끄기를 모두 关闭(关闭剖面·剖面关闭·全部关闭)
    ['关闭', ['끔', '닫기'], ['en', 'ja', 'de'], '근거 없음'],
    // 214차: 「도면층」(图层)·「소스 코드」·「코드」(源代码)·「면 선택」(选择面)은 쓰는 곳 0이라 뺐고, 덮개 글 「읽는 중」은 正在读取로(단계 이름 「읽기」 读取와 갈림)
    ['图层 {0}', ['레이어 {0}', '레이어 {0}개'], ['en', 'ja', 'de'], '틀'],
    ['多选', ['여러 개', '여러 개 고르기'], ['en', 'ja', 'de'], '같은 명령'],
    // 바디·솔리드·STEP 엔티티 수 — zh 사전에서 STEP 개체는 实体·对象가 섞여 가를 근거가 서지 않음(214차에 쓰는 곳 0인 「본체」만 뺌)
    ['实体', ['바디', '솔리드', '엔티티'], ['en', 'ja', 'de'], '근거 없음'],
    ['正视', ['정면', '정면으로 보기'], ['ja', 'de'], '같은 명령'],
    ['线框', ['와이어', '와이어프레임'], ['en', 'ja', 'de'], '그리는 쪽이 이김'],
    ['缩放到所选', ['고른 것으로 맞춰 보기', '맞춰 보기'], ['en', 'ja', 'de'], '같은 명령'],
  ],
  de: [
    ['Aktionen', ['작업', '작업 메뉴'], ['ja', 'zh-CN'], '같은 명령'],
    ['Alle', ['모두', '전체'], ['ja'], '안 그림'],
    ['Ausgewählt: {0}', ['고른 것: {0}', '가상 커서 알림 — 골랐습니다: {0}'], ['ja', 'zh-CN'], '틀'],
    ['Entfernung', ['옮긴 거리', '옮길 거리'], ['en', 'ja', 'zh-CN'], '설계'],
    // 측정 넓이 ↔ 면 — 208차와 같이 같은 사전에 넓이 낱말 근거가 없음
    ['Fläche', ['넓이', '면'], ['en', 'ja', 'zh-CN'], '근거 없음'],
    // 214차: 「본체」(Körper)·「도면층」(Layer)·「소스 코드」·「코드」(Quellcode)·「면 선택」은 쓰는 곳 0이라 뺐고, 덮개 글 「읽는 중」은 Wird gelesen으로(단계 이름 「읽기」 Lesen과 갈림)
  ],
};
const known = (lang: Lang, g: Group) => KNOWN[lang].find(([value, keys]) => value === g.value && keys.join('\n') === g.keys.join('\n'));
const byValue = <T extends [string, ...unknown[]]>(a: T, b: T): number => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

describe('같은 언어 안 겹친 값 — 목록 고정(213차)', () => {
  it.each(LANGS)('%s: 겹친 값 묶음·열쇠·번역이 갈리는 언어가 목록과 같다', (lang) => {
    const got = groups(lang).map((g): [string, string[], Lang[]] => [g.value, g.keys, split(lang, g)]);
    expect(got.sort(byValue)).toEqual(KNOWN[lang].map(([value, keys, s]): [string, string[], Lang[]] => [value, keys, s]).sort(byValue));
  });

  it('가른 셋은 같은 사전 근거 낱말이고, 새 값은 네 사전에 하나뿐이라 거꾸로 찾으면 제 원문', () => {
    const zh = CATALOG['zh-CN'];
    const de = CATALOG.de;
    const fixed: [key: string, lang: Lang, value: string][] = [
      ['숨김', 'zh-CN', '已隐藏'],
      ['압축 풀기', 'zh-CN', '解压'],
      ['압축 푸는 중', 'de', 'Wird entpackt'],
    ];
    for (const [key, lang, value] of fixed) expect(CATALOG[lang][key], `${lang}: ${key}`).toBe(value);
    const all = LANGS.flatMap((lang) => Object.values(CATALOG[lang]).map(norm));
    for (const [key, lang, value] of fixed) {
      expect(all.filter((v) => v === value).length, `${lang}: ${key}`).toBe(1);
      expect(sourceMessage(value), `${lang}: ${value}`).toBe(key);
    }
    // zh 「숨김」(레이어 표 칩 — 파일이 숨긴 레이어의 상태): 같은 사전의 상태 글은 已(고른 것·잠금·완료·스냅 켬/끔). 할 일 「숨기기」는 隐藏 그대로
    expect([zh['고른 것'], zh['잠금'], zh['완료']]).toEqual(['已选', '已锁定', '已完成']);
    expect(Object.entries(zh).filter(([k]) => /^스냅 (켬|끔): /.test(k)).map(([, v]) => v.slice(0, 5))).toEqual(['吸附已开启', '吸附已关闭']);
    expect(zh['숨기기']).toBe('隐藏');
    // 단계 표(format.ts STAGES — 해석 일이 넘기는 단계 이름 → 여는 중 덮개 글): zh 단계 이름은 正在 없이, 덮개 글은 正在…; de 덮개 글은 「… wird/werden …」
    const stages = readFileSync(join(__dirname, '../../src/app/format.ts'), 'utf8');
    expect(stages).toContain("'압축 풀기': '압축 푸는 중',");
    expect(stages).toContain("읽기: '파일 읽는 중',");
    expect([zh['압축'], zh['읽기'], zh['구조'], zh['받기']]).toEqual(['压缩', '读取', '结构', '下载']);
    for (const k of ['파일 받는 중', '압축 푸는 중', '파일 읽는 중', '제품 구조 읽는 중']) expect(zh[k], k).toMatch(/^正在/);
    for (const k of ['파일 받는 중', '파일 읽는 중', '제품 구조 읽는 중', '곡면 삼각화 중', '결과 넘기는 중', '압축 푸는 중']) expect(de[k], k).toMatch(/\b(wird|Wird|werden)\b/);
    expect(de['압축을 풀었지만 STEP 글이 아닙니다. {0}']).toMatch(/^Entpackt, /);
    expect(de['압축 풀기']).toBe('Entpacken');
  });

  it('214차: 여는 중 덮개 글은 같은 단계 표 꼴(zh 「正在…」·de 「… wird/werden …」)이고, 「읽는 중」(단계 이름이 빌 때)도 단계 이름 「읽기」와 다른 값', () => {
    const zh = CATALOG['zh-CN'];
    const de = CATALOG.de;
    // 덮개 글: format.ts STAGES(+ 단계 이름이 빌 때 「읽는 중」)·app.ts 받기 진행·화면에 올리기
    expect(readFileSync(join(__dirname, '../../src/app/format.ts'), 'utf8')).toContain(": '읽는 중');");
    expect(readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8')).toContain("stage: '화면에 올리는 중'");
    const COVER = ['파일 받는 중', '파일 받는 중 ({0})', '압축 푸는 중', '파일 읽는 중', '제품 구조 읽는 중', '곡면 삼각화 중', '결과 넘기는 중', '화면에 올리는 중', '읽는 중'];
    for (const k of COVER) {
      expect(zh[k], k).toMatch(/^正在/);
      expect(de[k], k).toMatch(/\b(wird|Wird|werden)\b/);
    }
    // zh: 正在 + 단계 이름(「압축 푸는 중」 正在解压 = 正在 + 「압축 풀기」 解压와 같은 꼴), de: 「파일 읽는 중」 Datei wird gelesen의 주어 없는 꼴(213차 Wird entpackt 꼴)
    expect(zh['압축 푸는 중']).toBe(`正在${zh['압축 풀기']}`);
    expect(zh['읽는 중']).toBe(`正在${zh['읽기']}`);
    expect(de['파일 읽는 중']).toMatch(/ wird gelesen$/);
    expect(de['읽는 중']).toBe('Wird gelesen');
    const all = LANGS.flatMap((lang) => Object.values(CATALOG[lang]).map(norm));
    for (const v of [zh['읽는 중']!, de['읽는 중']!]) {
      expect(all.filter((x) => x === v).length, v).toBe(1);
      expect(sourceMessage(v), v).toBe('읽는 중');
    }
    // 영어·일본어는 같은 표 꼴 그대로(-ing·〜中)
    expect([CATALOG.en['읽는 중'], CATALOG.ja['읽는 중']]).toEqual(['Reading', '読み込み中']);
  });
});

/** 칸 글이 번역층을 지나도록 한 차례 넘기기 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
/** 언어 메뉴로 바꾸고(app 꼴 — changeLanguage), 문서 언어가 바뀔 때까지 */
async function switchTo(code: string): Promise<void> {
  (document.querySelector(`.language-list [data-language="${code}"]`) as HTMLButtonElement).click();
  for (let i = 0; i < 50 && document.documentElement.lang !== code; i++) await tick();
  await tick();
  expect(document.documentElement.lang).toBe(code);
}
/** 틀 열쇠의 자리를 수로 채움(채운 원문) */
const fill = (s: string) => s.replace(/\{\d+\}/g, '7');
const say = (k: string, code: string) => (code === 'ko' ? k : translate(k, code));

describe('겹친 열쇠를 그린 뒤 언어를 바꾸면(jsdom — 213차)', () => {
  beforeAll(async () => {
    // 번역층이 언어를 바꿀 때 기다리지 않고 받는 사전 조각을 미리(ci-guard 5번 — JSON이라 곁효과 없음)
    await Promise.all([import('../../site/locales/en.json'), import('../../site/locales/ja.json'), import('../../site/locales/zh-CN.json'), import('../../site/locales/de.json')]);
  });

  it.each(LANGS)('%s: 원문을 그린 칸은 언어를 바꾸고 다시 그려도 제 원문의 번역, 옮긴 글로 들어온 칸은 이긴 열쇠의 번역(갈리는 언어가 목록과 같음)', async (lang) => {
    const root = document.createElement('div');
    root.innerHTML = '<header class="titlebar"></header><div class="views"></div>';
    document.body.append(root);
    const views = root.querySelector('.views')!;
    const list = groups(lang);
    // 앱 길: 원문(한국어)을 글·말풍선에 그린 칸 — 틀 열쇠는 채운 원문
    const drawn: { el: HTMLElement; source: string }[] = [];
    for (const g of list)
      for (const k of g.keys) {
        const source = SLOT.test(k) ? fill(k) : k;
        const el = Object.assign(document.createElement('span'), { textContent: source, title: source });
        views.append(el);
        drawn.push({ el, source });
      }
    history.replaceState(null, '', `/?lang=${lang}`);
    const dispose = await installLocalization(root);
    try {
      for (const { el, source } of drawn) {
        expect(el.textContent, source).toBe(translate(source, lang));
        expect(el.title, source).toBe(translate(source, lang));
      }
      // 옮긴 글 길: 기록 없이 이미 옮긴 글(겹친 값)이 들어온 칸 — 번역층이 거꾸로 찾아 원문을 정한다
      const pre = list.map((g) => {
        const text = SLOT.test(g.value) ? fill(g.value) : g.value;
        const el = Object.assign(document.createElement('span'), { textContent: text, title: text });
        views.append(el);
        return { g, el, text };
      });
      // 212차 「통째 열쇠 = 틀 값」: 종류 이름 열쇠가 있는 PMI 통째 열쇠의 옮긴 글(겹침 아님 — 통째 열쇠로 되돌아 옴)
      const whole = Object.keys(CATALOG[lang]).filter((k) => /^PMI [가-힣]/.test(k) && CATALOG[lang][k.slice(4)] !== undefined);
      expect(whole.length).toBe(35);
      const pmi = whole.map((k) => {
        const el = Object.assign(document.createElement('span'), { textContent: CATALOG[lang][k]! });
        views.append(el);
        return { k, el };
      });
      await tick();
      for (const { g, el, text } of pre) {
        // 틀은 통째 글만 맞춰 채운 글은 되돌리지 않고(그대로), 통째 값은 사전 차례의 맨 뒤 열쇠로 되돌린다
        expect(sourceMessage(text), text).toBe(SLOT.test(g.value) ? text : g.keys[g.keys.length - 1]);
        expect(el.textContent, text).toBe(text);
      }
      for (const { k } of pmi) expect(sourceMessage(CATALOG[lang][k]!), k).toBe(k);
      const seen = new Map<Group, Set<Lang>>(list.map((g) => [g, new Set<Lang>()]));
      for (const code of ['ko', ...LANGS.filter((o) => o !== lang)]) {
        await switchTo(code);
        for (const { el, source } of drawn) {
          expect(el.textContent, `${code}: ${source}`).toBe(say(source, code));
          expect(el.title, `${code}: ${source}`).toBe(say(source, code));
        }
        for (const { g, el, text } of pre) {
          if (SLOT.test(g.value)) {
            // 채운 틀의 옮긴 글은 어느 열쇠로도 되돌지 않아 겹침과 상관없이 그대로(한글 없는 글)
            expect(el.textContent, `${code}: ${text}`).toBe(text);
            continue;
          }
          const win = g.keys[g.keys.length - 1]!;
          expect(el.textContent, `${code}: ${text}`).toBe(say(win, code));
          expect(el.title, `${code}: ${text}`).toBe(say(win, code));
          if (code !== 'ko' && g.keys.some((k) => translate(k, code) !== translate(win, code))) seen.get(g)!.add(code as Lang);
        }
        // 틀 묶음의 갈림은 채운 원문의 번역으로 센다(위 split과 같은 셈)
        for (const g of list.filter((x) => SLOT.test(x.value))) {
          const win = fill(g.keys[g.keys.length - 1]!);
          if (code !== 'ko' && g.keys.some((k) => translate(fill(k), code) !== translate(win, code))) seen.get(g)!.add(code as Lang);
        }
        for (const { k, el } of pmi) expect(el.textContent, `${code}: ${k}`).toBe(say(k, code));
        // 다시 그림: 앱이 같은 원문을 다시 넣어도 제 원문의 번역
        for (const { el, source } of drawn) {
          el.textContent = source;
          el.title = source;
        }
        await tick();
        for (const { el, source } of drawn) expect(el.textContent, `${code} 다시: ${source}`).toBe(say(source, code));
      }
      for (const g of list) {
        const entry = known(lang, g);
        expect(entry, `${lang}: 목록 밖 겹침 「${g.value}」 ← ${g.keys.join(' ‖ ')}`).toBeDefined();
        expect(LANGS.filter((o) => seen.get(g)!.has(o)), `${lang}: ${g.value}`).toEqual(entry![2]);
      }
    } finally {
      dispose();
      root.remove();
      history.replaceState(null, '', '/');
      document.documentElement.lang = 'ko';
    }
  });
});

describe('사전 열쇠는 한글이나 {n} 틀을 품는다(공용 규칙 9번 — 213차)', () => {
  it('네 사전 모두 한글도 틀도 없는 열쇠는 og 그림 주소 하나뿐이고, 한글 없는 틀 열쇠는 낱말 머리가 있는 「PMI {0}」뿐', () => {
    for (const lang of LANGS) {
      const keys = Object.keys(CATALOG[lang]);
      // NC 201차: 열쇠 ':'(zh 「：」)를 더하자 translate()가 앞뒤 빈칸을 뺀 열쇠로 값만 돌려줘 조각 잇기에서 영어 「: 」가 빈칸을 잃었다 — 기호 하나는 그 기호가 든 통째 원문·틀 열쇠로
      expect(keys.filter((k) => !/[가-힣]/.test(k) && !SLOT.test(k)), lang).toEqual([OG]);
      expect(CATALOG[lang][OG], lang).toMatch(/^https:\/\/gyutae-kim\.github\.io\/assets\/i18n\/[a-zA-Z-]+\/og\/opencad\.jpg$/);
      // 기호와 자리만인 틀(「{0}: {1}」 꼴)은 어떤 글이든 잡는다 — 한글 없는 틀은 목록으로
      expect(keys.filter((k) => !/[가-힣]/.test(k) && SLOT.test(k)), lang).toEqual(['PMI {0}']);
    }
  });
});
