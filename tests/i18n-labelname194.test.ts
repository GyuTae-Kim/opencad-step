/**
 * 194차: 이름 안의 보이는 글(WCAG 2.5.3 Label in Name)이 번역 뒤에도 맞는지 — 193차 감사 표에서 같은 칸의 보이는 글과 화면 읽기 이름(aria-label)이
 * 다른 원문 열쇠인 짝을 모두 모아, 다섯 언어 모두 이름 번역이 보이는 글 번역을 품는지 본다(대소문자는 가리지 않음 — 음성 명령 「○○ 누르기」).
 * 한국어 원문은 맞는데 두 열쇠를 따로 옮겨 번역 뒤에만 어긋나던 자리를 사전 값만 고쳤다(원문·코드는 그대로 — README 개발 절 194차 문단):
 * - 분해 방향 「가로」·「세로」(영어 Horiz.·Vert. ↔ Screen horizontal·vertical, 독일어 Quer·Hoch ↔ Bildschirm waagerecht·senkrecht):
 *   이름을 보이는 글로 시작하게 — 193차 「가로세로」의 Both (screen plane)·Beide (Bildschirmebene) 꼴
 * - 고른 부품 카드 「여러 개」(영어 Multiple ↔ Multi-select, 독일어 Mehrere ↔ Mehrfachauswahl): 이름 열쇠는 메뉴 항목·말풍선이 함께 쓰는 용어라
 *   그대로 두고, 보이는 글을 그 용어의 앞머리로 — 일본어 複数 ⊂ 複数選択 꼴
 * - 분해 거리 칸 「거리」(독일어 Entfernung ↔ Verschiebeweg·Zu verschiebender Weg): 보이는 글은 측정이 함께 쓰는 용어라 그대로 두고, 이름 넷을 같은 낱말로
 * 206차: 그 「거리」 열쇠를 측정(3D 보기 위 글자·아래 띠 머리·상태 막대·CSV·개체 측정 결과)과 함께 써서 독일어에서 측정 결과 이름·알림·말풍선(Abstand)과
 * 측정 글자·띠 머리·상태 막대(Entfernung)가 갈렸다 — 분해 쪽만 새 원문으로 갈랐다(README 개발 절 206차 문단): 거리 칸 이름표는 칸 이름의 앞머리
 * 「옮긴 거리」(끈 뒤·끄는 동안)·「옮길 거리」(끌기 없이 연 빈 칸), 끄는 동안 거리 글의 첫 줄도 「옮긴 거리」, 측정 쪽 「거리」·「거리 {0} {1}」·「거리 {0}{1}」은 독일어 Abstand
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
  ['옮긴 거리', '옮긴 거리(숫자)'], // 분해 거리 칸(끈 뒤 — 206차부터 이름표가 이름의 앞머리)
  ['옮길 거리', '옮길 거리(숫자)'], // 끌기 없이 연 빈 칸 — 축 하나
  ['옮길 거리', '옮길 거리(가로; 세로)'], // 화면 평면
  ['옮길 거리', '옮길 거리(ΔX; ΔY; ΔZ)'], // 사방
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
    // 거리(206차): 측정이 쓰는 「거리」는 독일어 측정 낱말 Abstand, 거리 칸 이름표(옮긴·옮길 거리)와 거리 칸 알림은 분해 낱말 Entfernung
    expect(catalogs.de!['거리']).toBe('Abstand');
    expect(catalogs.de!['옮긴 거리']).toBe('Entfernung');
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
    expect(bar).toContain("const DIST_LABELS = { drag: '옮긴 거리', fresh: '옮길 거리' } as const;");
    expect(bar).toContain("this.distKey = h('span', { class: 'explode-distance-key' }, DIST_LABELS.drag);");
    expect(bar).toContain('const label = s.fresh ? DIST_LABELS.fresh : DIST_LABELS.drag;');
    // 223차: 레이어 탭 본문은 panel.ts에서 뷰어 조각의 panelview.ts로 옮겨 원문도 그 파일에
    expect(src('panelview.ts')).toContain("'aria-label': `${nm} 레이어 보이기`");
    expect(src('panelview.ts')).toContain("addRow(NO_LAYER, '(레이어 없음)'");
    expect(src('treeview.ts')).toContain("'aria-label': `${isolateText(g.name)} 보이기`");
  });
});

describe('측정 「거리」와 분해 거리 칸 이름표를 다른 열쇠로(206차 — 독일어 측정 Abstand ↔ 분해 Entfernung, WCAG 3.1.2·2.5.3·2.4.6)', () => {
  const LABELS = ['옮긴 거리', '옮길 거리'] as const;
  /** 열쇠에 「거리」가 든 글 가운데 분해 쪽(거리 칸 이름표·이름·말풍선·못 읽음 알림·그 칸을 여는 메뉴 — explodebar·explodetool) */
  const EXPLODE = /^(옮긴|옮길) 거리|^거리를 읽지 못했습니다|^거리로 옮기기|거리 하나로는|단위를 붙인 거리/;
  /** 휴대폰 320 위 띠 안 폭(196차 손셈)과 거리 칸의 이름표 밖 폭(칸 76 + 틈 4·4 + 단위 「mm」 12), 이름표 12px 보통 글(라틴 6·그 밖 12px) */
  const INNER = 200;
  const REST = 96;
  const textW = (s: string) => [...s].reduce((a, ch) => a + (ch <= 'ɏ' ? 6 : 12), 0);

  it('거리 칸 이름표는 다섯 언어 모두 그 꼴의 이름·말풍선에 들고(독일어 밖은 앞머리), 측정 「거리」와 다른 값이며 휴대폰 띠 안에 든다', () => {
    const keys = (label: string) => Object.keys(catalogs.en!).filter((k) => k.startsWith(label) && k !== label);
    expect(LABELS.map((label) => keys(label).length)).toEqual([4, 6]);
    for (const lang of LANGS)
      for (const label of LABELS) {
        const v = translate(label, lang);
        expect(v, `${lang}: ${label}`).not.toMatch(lang === 'ko' ? /^$/ : /[가-힣]/);
        expect(v, `${lang}: ${label}`).not.toBe(translate('거리', lang));
        for (const key of keys(label)) {
          const n = translate(key, lang).toLowerCase();
          // 독일어 이름 머리(Verschobene·Zu verschiebende Entfernung)는 휴대폰 띠 안을 넘어 이름표는 그 끝 낱말
          if (lang === 'de') expect(n, `${lang}: ${key}`).toContain(v.toLowerCase());
          else expect(n.startsWith(v.toLowerCase()), `${lang}: ${key} ⊃ ${v}`).toBe(true);
        }
        expect(textW(v) + REST, `${lang}: ${v}`).toBeLessThanOrEqual(INNER);
      }
    expect(textW(catalogs.de!['옮길 거리(숫자)']!.replace(/ \(.*$/, '')) + REST).toBeGreaterThan(INNER);
  });

  it('독일어: 열쇠에 「거리」가 든 값은 분해 쪽이면 Entfernung, 측정 쪽(측정 글자·아래 띠·상태 막대·CSV·개체 측정·알림·말풍선·사이트 설명)이면 Abstand', () => {
    const all = Object.entries(catalogs.de!).filter(([key]) => key.includes('거리'));
    const explode = all.filter(([key]) => EXPLODE.test(key));
    const measure = all.filter(([key]) => !EXPLODE.test(key));
    expect([explode.length, measure.length]).toEqual([20, 27]);
    for (const [key, value] of explode) {
      expect(value, key).toMatch(/Entfernung/);
      expect(value, key).not.toMatch(/abst[aä]nd/i);
    }
    for (const [key, value] of measure) {
      expect(value, key).toMatch(/abst[aä]nd/i);
      expect(value, key).not.toMatch(/Entfernung/);
    }
    // 상태 막대 틀(단위 있음·없음)과 다른 세 언어는 그대로
    expect([translate('거리 12.3 mm', 'de'), translate('거리 12.3', 'de')]).toEqual(['Abstand 12.3 mm', 'Abstand 12.3']);
    expect((['en', 'ja', 'zh-CN'] as const).map((lang) => catalogs[lang]!['거리'])).toEqual(['Distance', '距離', '距离']);
  });

  it('새 열쇠·바꾼 값은 그대로이고 한글이 없으며, 거꾸로 찾으면 제 원문(독일어 두 이름표는 같은 칸의 두 상태라 같은 Entfernung)', () => {
    const fixed: [key: string, lang: (typeof LANGS)[number], value: string][] = [
      ['옮긴 거리', 'en', 'Moved distance'],
      ['옮길 거리', 'en', 'Distance to move'],
      ['옮긴 거리', 'ja', '移動距離'],
      ['옮길 거리', 'ja', '移動する距離'],
      ['옮긴 거리', 'zh-CN', '移动距离'],
      ['옮길 거리', 'zh-CN', '要移动的距离'],
      ['옮긴 거리', 'de', 'Entfernung'],
      ['옮길 거리', 'de', 'Entfernung'],
      ['거리', 'de', 'Abstand'],
      ['거리 {0} {1}', 'de', 'Abstand {0} {1}'],
      ['거리 {0}{1}', 'de', 'Abstand {0}{1}'],
    ];
    const all = (['en', 'ja', 'zh-CN', 'de'] as const).flatMap((lang) => Object.values(catalogs[lang]!));
    for (const [key, lang, value] of fixed) {
      expect(catalogs[lang]![key], `${lang}: ${key}`).toBe(value);
      expect(value, `${lang}: ${key}`).not.toMatch(/[가-힣]/);
      expect((value.match(/\{\d+\}/g) ?? []).sort(), `${lang}: ${key}`).toEqual((key.match(/\{\d+\}/g) ?? []).sort());
      const twin = lang === 'de' && value === 'Entfernung';
      expect(all.filter((v) => v === value).length, `${lang}: ${value}`).toBe(twin ? 2 : 1);
      if (twin) expect(LABELS as readonly string[], value).toContain(sourceMessage(value));
      else expect(sourceMessage(value), `${lang}: ${value}`).toBe(key);
    }
    const keys = Object.keys(catalogs.en!).sort();
    for (const lang of ['ja', 'zh-CN', 'de'] as const) expect(Object.keys(catalogs[lang]!).sort(), lang).toEqual(keys);
  });
});
