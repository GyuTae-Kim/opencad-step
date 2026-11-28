/**
 * 215차: 수 틀의 1(README 「남은 일」 다국어 줄 — 공용 번역기에 복수형 규칙이 없다).
 * 수 틀 = 한국어 원문에서 자리 뒤에 셈 낱말이 붙은 틀(「{0}개」·「{0}쌍」·「{0}곳」·「{0}줄」·「{0}번」·「{0}종」·「{0}회」·「{0} 바이트」)과,
 * 한국어는 「삼각형 {1}」처럼 수를 뒤에 두는데 영어·독일어 값이 수를 복수 낱말 앞에 둔 틀(「{1} triangles」·「{1} Dreiecke」).
 * 1이 들어가면 영어·독일어가 「1 interfering pairs」·「1 Dreiecke」로 보였다. 수 자리마다(영어·독일어) 셋 가운데 하나여야 한다:
 * (가) 그 자리에 1을 넣은 통째 열쇠가 있다(「경고 1개」 1 warning — 번역층은 통째 열쇠를 틀보다 먼저 찾아, 한국어 화면 글·코드는 그대로),
 * (나) 값이 그 자리 바로 뒤에 낱말을 두지 않는다(「Pairs not listed: {0}.」 — 수를 끝에 두어 단·복수가 갈리지 않는 꼴; 215차에 열일곱 틀을 이 꼴로),
 * (다) ONE_OK에 까닭이 있다(코드가 1을 넣지 않음 — 한도·상한·둘 이상일 때만, 코드 글로 확인 — 또는 뒤 낱말이 단·복수 같음).
 * 새 수 틀이 셋 어디에도 들지 않으면 실패한다. 일본어·중국어는 수 꼴이 없어 보지 않는다.
 * 221차: 영어 괄호 s 꼴(「{0} type(s) of product」·「{0} time(s)」·「{0} semantic PMI(s)」 — 215차에 보고 둔 것)을 같은 꼴로(수 끝·1이 들지 않으니 복수 꼴만·형제 머리의 약어 꼴),
 * 영어·독일어 값에 괄호 복수 꼴이 다시 생기면 실패한다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SceneIssue } from 'opencad-viewer3d';
import { catalogs, translate } from '../site/i18n.mjs';
import { sceneIssueLines } from '../src/app/opennotice';

const ROOT = join(__dirname, '..');
const LANGS = ['en', 'de'] as const;
type Lang = (typeof LANGS)[number];
const EN = catalogs.en!;
const DE = catalogs.de!;

/** 한국어 원문에서 셈 낱말이 붙은 수 자리 */
const COUNTER = /\{(\d+)\} ?(?:개|쌍|곳|줄|번|종|회|바이트)/g;
/** 한국어는 「낱말 {n}」(수가 뒤) */
const AFTER_WORD = /[가-힣] \{(\d+)\}/g;
/** 영어 값이 그 자리 뒤에 복수 낱말(is·was·has는 동사), 독일어 값이 그 자리 뒤에 큰 글자 낱말 */
const enPlural = (n: string) => new RegExp(`\\{${n}\\} (?!is\\b|was\\b|has\\b)[a-z]+s\\b`);
const deNoun = (n: string) => new RegExp(`\\{${n}\\} [A-ZÄÖÜ][a-zäöüß]`);
/** (나)가 아닌 꼴: 그 자리 바로 뒤에 낱말 */
const wordAfter = (n: string) => new RegExp(`\\{${n}\\} ?[A-Za-zÄÖÜäöüß]`);

/** 열쇠의 수 자리 번호(없으면 수 틀이 아님) */
function countSlots(key: string): string[] {
  const out = new Set<string>();
  for (const m of key.matchAll(COUNTER)) out.add(m[1]!);
  for (const m of key.matchAll(AFTER_WORD)) if (!out.has(m[1]!) && (enPlural(m[1]!).test(EN[key]!) || deNoun(m[1]!).test(DE[key]!))) out.add(m[1]!);
  return [...out];
}

/**
 * (다) 까닭 목록: 코드가 1을 넣지 않는 틀(src — 그 조건·상수가 코드에 그대로 있는지 본다)과 뒤 낱말이 단·복수 같은 틀.
 * only가 있으면 그 언어만 비킨다(다른 언어는 (가)·(나)를 지켜야 한다).
 */
const ONE_OK: Record<string, { why: string; src?: [string, string]; only?: Lang }> = {
  'PMI {0}개': { why: '약어 PMI — 「{0} PMI」는 단·복수 같음' },
  '표현 PMI {0}개': { why: '약어 PMI — 「{0} presentation PMI」·「{0} Darstellungs-PMI」' },
  '의미 PMI {0}개': { why: '약어 PMI — 「{0} semantic PMI」(221차 — 같은 탭 형제 머리 「{0} presentation PMI」 꼴, 전에는 PMI(s))·「{0} semantische PMI」' },
  'ZIP 안에 STEP 파일(.stp·.step·.p21)이 없습니다. 들어 있는 파일: {0} 외 {1}개': { why: '「and {1} more」·「und {1} weitere」 — 단·복수 같음' },
  '외 {0}개': { why: '「Plus {0} more」·「und {0} weitere」 — 단·복수 같음' },
  'ZIP 안 STEP 파일 {0}개 가운데 가장 큰 {1}을(를) 열었습니다(나머지: {2}{3}).': { why: '후보가 둘 이상일 때만', src: ['src/archive.ts', 'if (cands.length > 1) {'] },
  '{0} ({1} 바이트)': { why: '정보 탭의 연 STEP 파일 크기 — 머리만으로도 1바이트를 넘음', src: ['src/app/infoview.ts', '(${fmtCount(d.size)} 바이트)'] },
  '파일 크기 {0} 바이트': { why: '상태 막대 말풍선의 연 STEP 파일 크기(위와 같음)', src: ['src/app/doc.ts', 'title: `파일 크기 ${fmtCount(d.size)} 바이트`'] },
  '{0}줄 가운데 처음 {1}줄만 보입니다. 더 보거나, 접거나, 위 칸에서 이름으로 거르십시오.': {
    why: '줄이 잘렸을 때만 — {1}은 TREE_LIMIT의 배수, {0}은 그보다 큼',
    src: ['src/app/doc.ts', 'export const TREE_LIMIT = 50000;'],
  },
  '고른 것이 많아 형상 {0}개 가운데 {1}개만 담았습니다.': {
    why: '담은 수 < 고른 수일 때만 — {1}은 1,500자 안에 든 나무 자리 낱말(깊이마다 두세 자)이 가리키는 수라 1이려면 나무 깊이가 수백 단계',
    src: ['src/app/selink.ts', 'export const SEL_MAX_CHARS = 1500;'],
  },
  '이 부품이 모형에 {0}번 놓였습니다': { why: '두 번 이상 놓인 부품의 ×n 칩에만(221차 — 그래서 영어는 복수 꼴 times만, 전에는 time(s))', src: ['src/app/treeview.ts', "n > 1 ? h('span', { class: 'chip', title: `이 부품이 모형에 ${n}번 놓였습니다` }"] },
  '조립 자리가 {0}개를 넘어 나머지는 놓지 않았다(같은 하위 조립을 층마다 거듭 쓴 파일일 수 있음)': { why: '상수 MAX_PLACEMENTS', src: ['src/scene.ts', 'export const MAX_PLACEMENTS = 250_000;'] },
  '조립 자리가 {0}개를 넘어 앞부분만 보입니다 — 같은 하위 조립을 층마다 거듭 쓴 파일일 수 있습니다(패널의 "정보" 탭).': {
    why: '경고 글에서 읽은 MAX_PLACEMENTS',
    src: ['src/app/opennotice.ts', '/^조립 자리가 (\\d+)개를 넘어/.exec(w)'],
  },
  '처음 {0}개만 보입니다.': { why: '상수 LIMIT 300', src: ['src/app/infoview.ts', 'const LIMIT = 300;'] },
};

/** 215차에 값만 바꿔 수를 끝에 둔 틀(영어 15·독일어 17 — 제품 틀은 독일어만, 형상 틀은 독일어만). 221차: 제품 틀 영어도 수 끝 꼴(전에는 type(s)·instance(s) — ONE_OK에서 뺌) */
const FIXED = [
  'PMI 글자(ANNOTATION_TEXT 등) {0}개는 그리지 못했다(글이 비었거나 배치가 없음)',
  '간섭 {0}쌍을 찾았습니다(안에 든 것 {1}쌍 포함).',
  '곡면 품질을 바꿔 다시 삼각화했습니다(삼각형 {0}개).',
  '끝이 없는 곡선(LINE 등) {0}개는 그리지 않았다',
  '문법 오류로 건너뛴 문장 {0}개',
  '선 형상 묶음 안의 곡면 {0}개는 그리지 않았다(경계가 없는 곡면)',
  '시간 한도로 {0}쌍은 겹친 부피를 구하지 못했습니다.',
  '제품 {0}종, 놓인 형상 {1}개',
  '형상 {0}개',
  '이 문서 나무에 없는 손질 {0}개는 건너뛰었습니다.',
  '맞지 않는 손질 {0}개는 건너뛰었습니다.',
  '값이 범위를 벗어난 손질 {0}개는 건너뛰었습니다.',
  '3D 보기가 좌표가 잘못된 정점 {0}개를 쓰는 도형을 그리지 않았다(형상 {1}개)',
  '3D 보기가 없는 정점을 가리키는 삼각형 {0}개를 그리지 않았다(형상 {1}개)',
  '3D 보기에서 id가 겹친 형상 {0}개는 고르기가 한 항목만 본다',
  '· #{0} · 삼각형 {1}',
  '· #{0} · 선분 {1}',
];

/** 이 열쇠에서 (가)·(나)·(다) 어디에도 들지 않는 「언어 {n}」(withList false면 (다)를 보지 않는다) */
function unhandled(key: string, withList = true): string[] {
  const ok = withList ? ONE_OK[key] : undefined;
  const out: string[] = [];
  for (const n of countSlots(key))
    for (const lang of LANGS) {
      if (ok && (!ok.only || ok.only === lang)) continue;
      const catalog = catalogs[lang]!;
      if (catalog[key.replace(`{${n}}`, '1')] !== undefined) continue;
      if (!wordAfter(n).test(catalog[key]!)) continue;
      out.push(`${lang} {${n}}`);
    }
  return out;
}

const templates = Object.keys(EN).filter((k) => countSlots(k).length);
/** 「1 낱말」(앞이 수·소수점·쉼표가 아닌 1 뒤에 빈칸과 낱말) */
const ONE_WORD = /(?:^|[^\d.,])1 [A-Za-zÄÖÜäöüß]/;

describe('수 틀의 1 — 영어·독일어 단·복수(215차)', () => {
  it('수 틀마다 영어·독일어 수 자리는 1 통째 열쇠·수를 끝에 둔 값·까닭 목록 가운데 하나다(새 수 틀이 어디에도 들지 않으면 실패)', () => {
    expect(templates.length).toBeGreaterThan(50);
    expect(templates.map((k) => [k, unhandled(k)] as const).filter(([, u]) => u.length).map(([k, u]) => `${k} → ${u.join(', ')}`)).toEqual([]);
  });

  it('까닭 목록은 지금 수 틀만, 그 목록이 꼭 있어야 하는 것만(이제 (가)·(나)로 맞으면 뺄 것), 코드 근거가 그대로다', () => {
    for (const [key, ok] of Object.entries(ONE_OK)) {
      expect(templates, key).toContain(key);
      expect(unhandled(key, false).filter((u) => !ok.only || u.startsWith(ok.only)), key).not.toEqual([]);
      if (ok.src) expect(readFileSync(join(ROOT, ok.src[0]), 'utf8'), `${key}: ${ok.src[0]}`).toContain(ok.src[1]);
    }
    for (const key of FIXED) {
      expect(EN[key], key).toBeTruthy();
      expect(unhandled(key, false), key).toEqual([]);
    }
  });

  it('215차에 수 끝 꼴로 바꾼 틀: 1·2를 넣어 번역층을 부르면 영어·독일어에 「1 낱말」이 없고 수는 그대로다', () => {
    for (const key of FIXED)
      for (const n of [1, 2]) {
        const ko = key.replace(/\{\d+\}/g, String(n));
        for (const lang of LANGS) {
          const t = translate(ko, lang);
          expect(t, `${lang}: ${ko}`).not.toMatch(/[가-힣]/);
          expect(t, `${lang}: ${ko}`).toContain(String(n));
          if (n === 1 && !(lang === 'en' && ONE_OK[key])) expect(t, `${lang}: ${ko}`).not.toMatch(ONE_WORD);
        }
      }
    // 손셈: 간섭 알림(두 부품이 서로 안에 든 하나뿐), 아래 띠 고른 면·고른 모서리(삼각형 면·직선 모서리), 상태 막대 말풍선, 나무 줄 말풍선
    expect([translate('간섭 1쌍을 찾았습니다(안에 든 것 1쌍 포함).', 'en'), translate('간섭 1쌍을 찾았습니다(안에 든 것 1쌍 포함).', 'de')]).toEqual([
      'Interfering pairs found: 1 (including pairs where one part is inside the other: 1).',
      'Kollidierende Paare gefunden: 1 (davon Paare, bei denen ein Teil im anderen liegt: 1).',
    ]);
    expect(['· #12 · 삼각형 1', '· #12 · 선분 1'].flatMap((ko) => LANGS.map((lang) => translate(ko, lang)))).toEqual([
      '· #12 · Triangles 1',
      '· #12 · Dreiecke 1',
      '· #12 · Segments 1',
      '· #12 · Segmente 1',
    ]);
    expect(translate('시간 한도로 1쌍은 겹친 부피를 구하지 못했습니다.', 'en')).toBe('Pairs whose overlap volume was not computed because of the time limit: 1.');
    expect([translate('제품 1종, 놓인 형상 1개', 'en'), translate('제품 1종, 놓인 형상 1개', 'de')]).toEqual(['Product types: 1, placed instances: 1', 'Produkte: 1, platzierte Formen: 1']);
    expect([translate('형상 1개', 'de'), translate('형상 3개', 'de')]).toEqual(['Geometrien: 1', 'Geometrien: 3']);
    expect(translate('문법 오류로 건너뛴 문장 1개', 'en')).toBe('Statements skipped due to syntax errors: 1');
  });

  it('코어 장면 알림 경고 글(sceneIssueLines 직접 부르기): 정점·삼각형·같은 id가 1개·2개일 때 영어·독일어', () => {
    const issue = (code: SceneIssue['code'], id: string): SceneIssue => ({ code, action: code === 'duplicate-id' ? 'kept' : 'fixed', kind: 'mesh', id, count: 1 });
    const issues = (ids: string[]) => ids.flatMap((id) => [issue('positions', id), issue('indices', id), issue('duplicate-id', id)]);
    for (const [n, ids] of [[1, ['a']], [2, ['a', 'b']]] as const) {
      const lines = sceneIssueLines(issues([...ids]));
      expect(lines).toEqual([
        `3D 보기가 좌표가 잘못된 정점 ${n}개를 쓰는 도형을 그리지 않았다(형상 ${n}개)`,
        `3D 보기가 없는 정점을 가리키는 삼각형 ${n}개를 그리지 않았다(형상 ${n}개)`,
        `3D 보기에서 id가 겹친 형상 ${n}개는 고르기가 한 항목만 본다`,
      ]);
      expect(lines.map((l) => translate(l, 'en'))).toEqual([
        `Vertices with invalid coordinates whose primitives the 3D view did not draw: ${n} (geometry items: ${n})`,
        `Triangles referring to missing vertices that the 3D view did not draw: ${n} (geometry items: ${n})`,
        `Geometry items that share an id in the 3D view (picking sees only one of them): ${n}`,
      ]);
      expect(lines.map((l) => translate(l, 'de'))).toEqual([
        `Eckpunkte mit ungültigen Koordinaten, deren Primitive die 3D-Ansicht nicht gezeichnet hat: ${n} (Geometrien: ${n})`,
        `Dreiecke mit Verweis auf fehlende Eckpunkte, die die 3D-Ansicht nicht gezeichnet hat: ${n} (Geometrien: ${n})`,
        `Geometrien, die sich in der 3D-Ansicht eine ID teilen (die Auswahl erfasst nur eine davon): ${n}`,
      ]);
    }
  });

  it('1 통째 열쇠가 있는 수 틀(경고·간섭·줄 더 보기 등): 1이면 번역층이 통째 열쇠 값을, 2면 틀 값을 고른다', () => {
    const single = templates.filter((k) => (k.match(/\{\d+\}/g) ?? []).length === 1 && EN[k.replace(/\{\d+\}/, '1')] !== undefined);
    expect(single.length).toBeGreaterThanOrEqual(11);
    for (const key of single)
      for (const lang of LANGS) {
        const catalog = catalogs[lang]!;
        expect(translate(key.replace(/\{\d+\}/, '1'), lang), `${lang}: ${key}`).toBe(catalog[key.replace(/\{\d+\}/, '1')]);
        expect(translate(key.replace(/\{\d+\}/, '2'), lang), `${lang}: ${key}`).toBe(catalog[key]!.replace(/\{\d+\}/, '2'));
      }
  });

  it('221차: 영어·독일어 값에 괄호 복수 꼴(「type(s)」·「time(s)」·「PMI(s)」, 독일어 「Teil(e)」·「Datei(en)」 꼴)이 없다 — 215차 꼴(수 끝·1이 들지 않으면 복수 꼴·약어 그대로)로', () => {
    const PAREN: Record<Lang, RegExp> = { en: /[A-Za-z]\((?:s|es)\)/, de: /[A-Za-zÄÖÜäöüß]\((?:n|e|en|s|er|nen|es)\)/ };
    for (const lang of LANGS) expect(Object.entries(catalogs[lang]!).filter(([, v]) => PAREN[lang].test(v)).map(([k]) => k), lang).toEqual([]);
    // 221차에 고친 영어 셋(220차까지 괄호 s 꼴): 1·2를 넣은 번역
    expect(['의미 PMI 1개', '의미 PMI 2개', '이 부품이 모형에 2번 놓였습니다', '제품 1종, 놓인 형상 1개', '제품 2종, 놓인 형상 3개'].map((ko) => translate(ko, 'en'))).toEqual([
      '1 semantic PMI',
      '2 semantic PMI',
      // 227차: 부품 낱말은 같은 사전의 part, 원문처럼 끝 마침표 없음(i18n.test 56차 규칙 표·매개변수 시험이 함께 본다)
      'This part has been placed 2 times in the model',
      'Product types: 1, placed instances: 1',
      'Product types: 2, placed instances: 3',
    ]);
    // 같은 PMI 탭의 형제 머리(표현 PMI·의미 PMI)는 같은 꼴 — 영어·독일어
    expect(EN['의미 PMI {0}개']!.replace('semantic', 'presentation')).toBe(EN['표현 PMI {0}개']);
    expect([EN['의미 PMI {0}개'], DE['의미 PMI {0}개']].map((v) => v!.indexOf('{0}'))).toEqual([0, 0]);
  });

  it('227차: 아래 띠의 짝(고른 면 「· #{0} · 삼각형 {1}」·고른 모서리 「· #{0} · 선분 {1}」)은 네 언어 모두 낱말만 다른 같은 꼴 — 일본어 면 줄만 「三角形{1}」(빈칸 없음)이었다', () => {
    const WORDS: Record<string, [string, string]> = { en: ['Triangles', 'Segments'], ja: ['三角形', '線分'], 'zh-CN': ['三角形', '线段'], de: ['Dreiecke', 'Segmente'] };
    for (const [code, [tri, seg]] of Object.entries(WORDS)) {
      const c = catalogs[code]!;
      expect(c['· #{0} · 삼각형 {1}'], code).toContain(tri);
      expect(c['· #{0} · 삼각형 {1}']!.replace(tri, seg), code).toBe(c['· #{0} · 선분 {1}']);
    }
  });
});
