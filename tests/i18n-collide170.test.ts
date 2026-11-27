/**
 * 170차: 다른 일을 하는 두 원문이 한 언어 사전에서 같은 값인 것(169차 일관된 식별 감사 — WCAG 2.4.6 이름표가 무엇을 하는지 알려 줌, SKP 174차 꼴)을
 * 그 언어 값만 같은 사전 안의 다른 맞는 낱말로 갈랐다(원문·코드·짝의 다른 쪽은 그대로 — README 개발 절 170차 문단).
 * - 휴대폰 도구 막대 「보기 설정」(투영·격자 등 메뉴)과 앱 설정 「표시 설정…」(단위·곡면 품질 대화 상자): ja 表示設定 → ビュー設定
 *   (이 사전은 3D 보기·카메라의 「보기」를 ビュー로 옮긴다 — 3Dビュー·ビューリンク·保存されたビュー)
 * - 도구 막대 「단면」(축 단면 메뉴)과 면 띠 「자르기」(고른 면으로 바로 자름): en Section → Cut(이 사전의 자르다 — Cut face·Cut with a plane).
 *   같은 명령의 작업 메뉴·띠 말풍선(「이 면으로 자르기」·「축을 지나게 자르기」·「고른 면으로 자르기」)도 Cut으로 — 띠 이름을 품어 같은 일은 같은 이름(3.2.4)
 * 짝마다 언어마다 다른 값이고 번역층의 거꾸로 찾기(sourceMessage — 같은 값이면 뒤 열쇠가 이긴다)가 제 원문으로 돌아오는지,
 * 고친 값이 근거 줄과 같은 낱말인지 본다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];

/** 다른 일을 하는 원문 짝(한 화면에 함께 나온다) */
const PAIRS: [a: string, b: string][] = [
  ['보기 설정', '표시 설정'],
  ['보기 설정', '표시 설정…'],
  ['단면', '자르기'],
];

describe('다른 일을 하는 원문 둘이 한 언어에서 같은 값이 되지 않게(170차)', () => {
  it('짝마다 네 언어 모두 다른 값이고, 옮긴 글을 거꾸로 찾으면 제 원문으로 돌아온다', () => {
    for (const [a, b] of PAIRS)
      for (const lang of LANGS) {
        const va = catalogs[lang]![a]!;
        const vb = catalogs[lang]![b]!;
        expect(va, `${lang}: ${a}`).toBeTruthy();
        expect(vb, `${lang}: ${b}`).toBeTruthy();
        expect(va, `${lang}: ${a} ↔ ${b}`).not.toBe(vb);
        expect(sourceMessage(va), `${lang}: ${va}`).toBe(a);
        expect(sourceMessage(vb), `${lang}: ${vb}`).toBe(b);
      }
  });

  it('고친 줄은 같은 사전의 맞는 낱말을 쓰고, 같은 명령의 영어 이름은 띠 이름을 품으며, 짝의 다른 쪽은 그대로다', () => {
    const fixed: [key: string, lang: Lang, value: string][] = [
      ['보기 설정', 'ja', 'ビュー設定'],
      ['자르기', 'en', 'Cut'],
      ['이 면으로 자르기', 'en', 'Cut at this face'],
      ['축을 지나게 자르기', 'en', 'Cut through the axis'],
      ['고른 면으로 자르기', 'en', 'Cut through the selected face'],
    ];
    for (const [key, lang, value] of fixed) expect(catalogs[lang]![key], `${lang}: ${key}`).toBe(value);
    // 새 값이 다른 열쇠의 값과 같지 않다(네 사전 어디에도 하나 — 거꾸로 찾기가 다른 열쇠로 가지 않게)
    const all = LANGS.flatMap((lang) => Object.values(catalogs[lang]!));
    for (const [key, lang, value] of fixed) {
      expect(all.filter((v) => v === value).length, `${lang}: ${key}`).toBe(1);
      expect(sourceMessage(value), `${lang}: ${value}`).toBe(key);
    }
    // 근거 줄: 같은 사전이 이 낱말을 쓴다
    const basis: [key: string, lang: Lang, has: string][] = [
      ['3D 보기', 'ja', '3Dビュー'],
      ['보기 링크 복사', 'ja', 'ビューリンク'],
      ['저장된 보기 {0}개', 'ja', '保存されたビュー'],
      ['잘린 면', 'en', 'Cut face'],
      ['잘라 내는 쪽 뒤집기', 'en', 'being cut'],
      ['단면 보기: 축(X·Y·Z)에 수직인 평면으로 잘라 봅니다 — 위치 끌기·뒤집기는 3D 보기 위 막대에서', 'en', 'Cut with a plane'],
    ];
    for (const [key, lang, has] of basis) expect(catalogs[lang]![key], `${lang}: ${key}`).toContain(has);
    // 영어에서 열쇠에 「자르기」가 든 글(면 띠 버튼·말풍선, 작업 메뉴 두 항목)은 모두 Cut — 같은 명령(sectionByFace)의 이름이 띠 이름을 품는다
    const cuts = Object.entries(catalogs.en!).filter(([key]) => key.includes('자르기'));
    expect(cuts.map(([key]) => key).sort()).toEqual(['고른 면으로 자르기', '이 면으로 자르기', '자르기', '축을 지나게 자르기']);
    for (const [key, value] of cuts) {
      expect(value, key).toMatch(/^Cut\b/);
      expect(value, key).not.toMatch(/Section/);
    }
    for (const menu of ['이 면으로 자르기', '축을 지나게 자르기', '고른 면으로 자르기']) expect(translate(menu, 'en'), menu).toContain(translate('자르기', 'en'));
    // 짝의 다른 쪽(앱 설정 「표시 설정」·도구 막대 「단면」)과 자른 결과의 이름(단면 띠 「면」 말풍선·도구 막대 「단면 면」)은 그대로
    expect(LANGS.map((lang) => catalogs[lang]!['표시 설정'])).toEqual(['Display settings', '表示設定', '显示设置', 'Anzeigeeinstellungen']);
    expect(LANGS.map((lang) => catalogs[lang]!['단면'])).toEqual(['Section', '断面', '剖面', 'Schnitt']);
    expect(catalogs.en!['고른 면(또는 축)으로 자른 단면']).toBe('Section through the selected face (or axis)');
    expect(catalogs.en!['단면 면']).toBe('Section (face)');
  });

  it('짝의 원문은 실제로 한 화면에 나오는 버튼·메뉴 이름이다(앱 원문)', () => {
    const src = (file: string) => readFileSync(join(__dirname, '../src/app', file), 'utf8');
    const toolbar = src('toolbar.ts');
    const app = src('app.ts');
    // 휴대폰 도구 막대 「보기 설정」 버튼(이름·말풍선·연 메뉴 이름)과 앱 설정 메뉴 「표시 설정…」 → 대화 상자 「표시 설정」
    expect(toolbar).toContain("this.add('sliders', '보기 설정', '보기 설정', () => openMenu(more.el, this.moreItems(more.el), '보기 설정'), undefined, 'narrow-only')");
    expect(app).toContain("{ label: '표시 설정…', run: () => this.showDisplaySettings() }");
    expect(app).toContain("openDialog('표시 설정', [unit, decimals, quality])");
    // 도구 막대 「단면」 버튼과 면 띠 「자르기」 버튼(말풍선 「고른 면으로 자르기」), 같은 명령의 작업 메뉴 두 항목
    expect(toolbar).toMatch(/setLabel\(section\.el, a \? `단면 \$\{a\.toUpperCase\(\)\}` : on \? '단면 면' : '단면'\)/);
    expect(app).toContain("title: '고른 면으로 자르기', 'aria-label': '자르기' }, icon('section', 16), h('span', {}, '자르기'))");
    expect(src('ctxmenu.ts')).toContain("label: f.normal ? '이 면으로 자르기' : '축을 지나게 자르기', run: () => H.sectionByFace(f)");
  });
});
