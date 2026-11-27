/**
 * 194차: 이름 안의 보이는 글(WCAG 2.5.3 Label in Name)이 번역 뒤에도 맞는지 — 193차 감사 표에서 같은 칸의 보이는 글과 화면 읽기 이름(aria-label)이
 * 다른 원문 열쇠인 짝을 모두 모아, 다섯 언어 모두 이름 번역이 보이는 글 번역을 품는지 본다(대소문자는 가리지 않음 — 음성 명령 「○○ 누르기」).
 * 한국어 원문은 맞는데 두 열쇠를 따로 옮겨 번역 뒤에만 어긋나던 자리를 사전 값만 고쳤다(원문·코드는 그대로 — README 개발 절 194차 문단):
 * - 분해 방향 「가로」·「세로」(영어 Horiz.·Vert. ↔ Screen horizontal·vertical, 독일어 Quer·Hoch ↔ Bildschirm waagerecht·senkrecht):
 *   이름을 보이는 글로 시작하게 — 193차 「가로세로」의 Both (screen plane)·Beide (Bildschirmebene) 꼴
 * - 고른 부품 카드 「여러 개」(영어 Multiple ↔ Multi-select, 독일어 Mehrere ↔ Mehrfachauswahl): 이름 열쇠는 메뉴 항목·말풍선이 함께 쓰는 용어라
 *   그대로 두고, 보이는 글을 그 용어의 앞머리로 — 일본어 複数 ⊂ 複数選択 꼴
 * - 분해 거리 칸 「거리」(독일어 Entfernung ↔ Verschiebeweg·Zu verschiebender Weg): 보이는 글은 측정이 함께 쓰는 용어라 그대로 두고, 이름 넷을 같은 낱말로
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['ko', 'en', 'ja', 'zh-CN', 'de'] as const;
/** 파일 글 이름(옮기지 않음 — ftext.ts isolateText처럼 방향 가둠 글자로 감쌈) */
const FILE_NAME = '\u{2068}Part-7\u{2069}';

/** 같은 칸의 보이는 글 ↔ 화면 읽기 이름(서로 다른 원문 열쇠) — 193차 감사 표의 짝 모두 */
const PAIRS: [visible: string, name: string][] = [
  ['여러 개', '여러 개 고르기'], // 고른 부품 카드 버튼(app.ts selMulti)
  ['작업', '작업 메뉴'], // 고른 부품 카드 버튼(selMore)
  ['GitHub', 'GitHub 소스 코드'], // 머리 막대 링크
  ['가로', '화면 가로'], // 분해 방향 버튼(explodebar sx)
  ['세로', '화면 세로'], // sy
  ['가로세로', '가로세로(화면 평면)'], // sp(193차)
  ['분해', '분해 정도'], // 분해 막대 이름표 ↔ 분해 정도 밀대
  ['거리', '옮긴 거리(숫자)'], // 분해 거리 칸(끈 뒤)
  ['거리', '옮길 거리(숫자)'], // 끌기 없이 연 빈 칸 — 축 하나
  ['거리', '옮길 거리(가로; 세로)'], // 화면 평면
  ['거리', '옮길 거리(ΔX; ΔY; ΔZ)'], // 사방
  ['(레이어 없음)', '(레이어 없음) 레이어 보이기'], // 레이어 표 보이기 상자(어느 레이어에도 들지 않은 줄)
  [FILE_NAME, `${FILE_NAME} 레이어 보이기`], // 파일 레이어 줄 — 틀 「{0} 레이어 보이기」
  [FILE_NAME, `${FILE_NAME} 보이기`], // 부품별 보이기 줄 — 틀 「{0} 보이기」
];

/** 고친 사전 값(이것뿐 — 원문 열쇠·다른 언어는 그대로) */
const FIXED: [key: string, lang: 'en' | 'de', value: string][] = [
  ['화면 가로', 'en', 'Horiz. (screen horizontal)'],
  ['화면 세로', 'en', 'Vert. (screen vertical)'],
  ['여러 개', 'en', 'Multi'],
  ['화면 가로', 'de', 'Quer (Bildschirm waagerecht)'],
  ['화면 세로', 'de', 'Hoch (Bildschirm senkrecht)'],
  ['여러 개', 'de', 'Mehrfach'],
  ['옮긴 거리(숫자)', 'de', 'Verschobene Entfernung (Zahl)'],
  ['옮길 거리(숫자)', 'de', 'Zu verschiebende Entfernung (Zahl)'],
  ['옮길 거리(가로; 세로)', 'de', 'Zu verschiebende Entfernung (horizontal; vertikal)'],
  ['옮길 거리(ΔX; ΔY; ΔZ)', 'de', 'Zu verschiebende Entfernung (ΔX; ΔY; ΔZ)'],
];

describe('번역 뒤에도 화면 읽기 이름이 보이는 글을 품는다(194차 — WCAG 2.5.3)', () => {
  it('짝마다 다섯 언어 모두 이름 번역이 보이는 글 번역을 품는다', () => {
    const misses: string[] = [];
    for (const [visible, name] of PAIRS)
      for (const lang of LANGS) {
        const v = translate(visible, lang);
        const n = translate(name, lang);
        expect(n, `${lang}: ${name}`).not.toMatch(lang === 'ko' ? /^$/ : /[가-힣]/);
        if (!n.toLowerCase().includes(v.toLowerCase())) misses.push(`${lang}: ${v} → ${n}`);
      }
    expect(misses).toEqual([]);
  });

  it('고친 값은 보이는 글로 시작하고(가로·세로·여러 개), 네 사전에 하나뿐이며 거꾸로 찾으면 제 원문이다', () => {
    for (const [key, lang, value] of FIXED) expect(catalogs[lang]![key], `${lang}: ${key}`).toBe(value);
    for (const lang of ['en', 'de'] as const) {
      expect(translate('화면 가로', lang).startsWith(translate('가로', lang)), lang).toBe(true);
      expect(translate('화면 세로', lang).startsWith(translate('세로', lang)), lang).toBe(true);
      expect(translate('여러 개 고르기', lang).startsWith(translate('여러 개', lang)), lang).toBe(true);
    }
    const all = (['en', 'ja', 'zh-CN', 'de'] as const).flatMap((lang) => Object.values(catalogs[lang]!).map((v) => v.toLowerCase()));
    for (const [key, lang, value] of FIXED) {
      expect(all.filter((v) => v === value.toLowerCase()).length, `${lang}: ${value}`).toBe(1);
      expect(sourceMessage(value), `${lang}: ${value}`).toBe(key);
    }
  });

  it('근거: 이름 쪽 용어·보이는 글 쪽 용어는 그대로이고 같은 사전이 그 낱말을 쓴다', () => {
    // 「여러 개 고르기」는 메뉴 항목·말풍선·끝내기·고르기 단위 도움말이 함께 쓰는 용어 — 그대로(일본어는 보이는 글 複数가 이름 複数選択의 앞머리)
    expect((['en', 'ja', 'zh-CN', 'de'] as const).map((lang) => catalogs[lang]!['여러 개 고르기'])).toEqual(['Multi-select', '複数選択', '多选', 'Mehrfachauswahl']);
    for (const lang of ['en', 'de'] as const) {
      const term = catalogs[lang]!['여러 개 고르기']!;
      const uses = Object.entries(catalogs[lang]!).filter(([key]) => key.includes('여러 개 고르기'));
      // 202차: 속성 탭 안내(「… "여러 개 고르기"를 켜면 …」)의 지금 원문 열쇠가 더해져 일곱
      expect(uses.length, lang).toBe(7);
      for (const [key, value] of uses) expect(value.toLowerCase(), `${lang}: ${key}`).toContain(term.toLowerCase());
    }
    expect(catalogs.ja!['여러 개 고르기']!.startsWith(catalogs.ja!['여러 개']!)).toBe(true);
    // 분해 방향: 193차 「가로세로」와 같은 꼴(보이는 글 + 괄호에 화면 쪽 뜻)
    expect(catalogs.en!['가로세로(화면 평면)']).toBe('Both (screen plane)');
    expect(catalogs.de!['가로세로(화면 평면)']).toBe('Beide (Bildschirmebene)');
    // 거리: 보이는 글 Entfernung은 측정·알림이 함께 쓰는 용어 — 그대로, 거리 칸 알림도 같은 낱말
    expect(catalogs.de!['거리']).toBe('Entfernung');
    expect(catalogs.de!['거리를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오(음수는 반대쪽, 25mm처럼 단위를 붙여도 됩니다).']).toMatch(/^Die Entfernung /);
  });

  it('짝은 실제로 같은 칸의 보이는 글과 이름이다(앱 원문 — 코드는 바꾸지 않음)', () => {
    const src = (file: string) => readFileSync(join(__dirname, '../src/app', file), 'utf8');
    const app = src('app.ts');
    const bar = src('explodebar.ts');
    expect(app).toContain("'aria-label': '여러 개 고르기' }, icon('multi', 16), h('span', {}, '여러 개'))");
    expect(app).toContain("'aria-label': '작업 메뉴', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, icon('more', 16), h('span', {}, '작업'))");
    expect(app).toContain("'aria-label': 'GitHub 소스 코드' }, icon('code'), h('span', { class: 'btn-label' }, 'GitHub'))");
    expect(app).toContain("'aria-label': '분해 정도' })");
    expect(app).toContain("h('span', { class: 'explode-label' }, '분해')");
    expect(bar).toMatch(/\['sx', '가로', `[^`]+`, '화면 가로', screen\]/);
    expect(bar).toMatch(/\['sy', '세로', `[^`]+`, '화면 세로', screen\]/);
    expect(bar).toMatch(/\['sp', '가로세로', `[^`]+`, '가로세로\(화면 평면\)', screen\]/);
    expect(bar).toContain("const DIST_NAME = '옮긴 거리(숫자)';");
    for (const line of ["line: '옮길 거리(숫자)',", "sp: '옮길 거리(가로; 세로)',", "free: '옮길 거리(ΔX; ΔY; ΔZ)',"]) expect(bar).toContain(line);
    expect(bar).toContain("h('span', { class: 'explode-distance-key' }, '거리')");
    expect(src('panel.ts')).toContain("'aria-label': `${nm} 레이어 보이기`");
    expect(src('panel.ts')).toContain("addRow(NO_LAYER, '(레이어 없음)'");
    expect(src('treeview.ts')).toContain("'aria-label': `${isolateText(g.name)} 보이기`");
  });
});
