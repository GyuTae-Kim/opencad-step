/**
 * 204차: 분해·격리·단면 묶음(분해 막대·손질 파일 ⋯ 메뉴·분해 방향·거리 칸·격리 띠·단면 막대·단면 손잡이·단면 위치 칸·면으로 자르기) 화면 글을
 * 네 언어로 대조해 고친 것(README 개발 절 204차 문단 — 원문·코드는 그대로, 사전 값만):
 * - 오역: 도구 막대 단면 말풍선 끝 「위치 끌기·뒤집기」를 위치를 뒤집는 말로 옮김(영어 flip positions·독일어 Positionen … umdrehen — 뒤집는 것은
 *   잘라 내는 쪽: 단면 막대 버튼 이름으로), 독일어 분해 끄기 「zurück an Ort」(말이 안 됨 — an Ort und Stelle), 일본어 단면 끄기 「断面のオフ」
 *   (분해 끄기와 같은 「…をオフ」로), 일본어 줄표(+쪽 뒤집기 말풍선의 붙임표 「-」·조립 단계별 말풍선의 빈칸 없는 「—」 → 같은 사전의 「 — 」)
 * - 한 기능 한 낱말(보이는 글이 이김 — 음성 조작 2.5.3): 작업 버튼 말풍선의 「이것만 보기」(영어 show only·독일어 Nur dies anzeigen ↔ 작업 메뉴 항목
 *   Isolate·Isolieren), 독일어 거리 칸 말풍선 여섯·「거리로 옮기기…」(Verschiebeweg·Zu verschiebender Weg·Abstand ↔ 칸 이름표 Entfernung —
 *   194차는 이름 넷만 맞춤), 중국어 가로; 세로 성분(水平; 垂直 ↔ 분해 방향 버튼·끄는 동안 거리 글 横向·纵向), 일본어 단면 막대·단면 메뉴 이름과
 *   위치 칸(断面の表示·断面の位置 ↔ 도구 막대 말풍선 머리 断面表示·밀대 断面位置)
 * - 빠진 번역: 없음 — 묶음 원문(분해 네 파일·단면 막대의 작은따옴표 글은 원문 파일에서 읽고, 틀 글은 실제 꼴 값을 끼운 글)이
 *   네 언어 모두 한글 없이 옮겨지는지로 굳힌다(틀 자리 값은 옮기지 않으니 한국어 화면 글이 자리 값이 되면 여기서 걸린다)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const HANGUL = /[가-힣]/;
const read = (file: string): string => readFileSync(join(__dirname, '../src/app', file), 'utf8');

/** 분해 막대·손질·거리 칸·단면 막대(손잡이 포함) — 화면 글을 모두 이 파일들이 만든다 */
const BUNDLE = ['explodebar.ts', 'explodetool.ts', 'explodetweak.ts', 'sectionbar.ts'];
/** 앱 쪽 묶음 글(격리 띠·분해 막대 머리·면 띠 자르기·작업 메뉴·도구 막대 단면 메뉴·알림) — 원문 파일에 그대로 있는지도 본다 */
const APP: Record<string, string[]> = {
  'app.ts': [
    '격리 풀기 (I)',
    '격리 풀기',
    '이것만 보기',
    '나머지 흐리게',
    '분해 정도',
    '분해 끄기(제자리로)',
    '분해 보기',
    '분해',
    '고른 것으로 할 일(숨기기·이것만 보기 등)',
    '고른 면으로 자르기',
    '자르기',
    '분해를 접고 제자리 형상에서 자릅니다.',
    '분해 보기를 받지 못했습니다.',
    '분해 보기 동안은 측정·면 고르기를 끕니다(제자리 형상으로 잽니다).',
    '끌어 옮긴 부품이 많아 손질은 링크에 담지 못했습니다 — 받는 쪽은 손질 없이 벌립니다.',
    '이 면으로는 자를 평면을 정할 수 없습니다(평면이거나 축이 있는 면만).',
    '주소의 보기(카메라·단면·고른 것·분해)를 적용했습니다.',
    '보기 링크를 복사했습니다(카메라·단면·고른 것·분해 — 파일은 담지 않으니 받는 사람도 같은 파일을 여십시오).',
  ],
  'ctxmenu.ts': ['격리 풀기', '이것만 보기', '나머지 흐리게', '이 면으로 자르기', '축을 지나게 자르기'],
  'toolbar.ts': [
    '단면',
    '단면 보기: 축(X·Y·Z)에 수직인 평면으로 잘라 봅니다 — 위치 끌기·뒤집기는 3D 보기 위 막대에서',
    '단면 보기',
    '단면 면',
    '끔',
    'X 단면(YZ 평면)',
    'Y 단면(ZX 평면)',
    'Z 단면(XY 평면)',
    '분해 보기',
  ],
};

const ACTIONS = '고른 것으로 할 일(숨기기·이것만 보기 등)';
const SECTION_TIP = '단면 보기: 축(X·Y·Z)에 수직인 평면으로 잘라 봅니다 — 위치 끌기·뒤집기는 3D 보기 위 막대에서';
/** 분해 거리 칸 말풍선(끈 뒤 셋·끌기 없이 연 빈 칸 셋 — explodebar DIST_TITLES·FRESH_TITLES)과 이름(DIST_NAME·FRESH_NAMES) */
const DIST_TIPS = [
  '옮긴 거리 — 수를 쳐 넣고 Enter를 누르면 이번 끌기를 그 거리로 맞춥니다(음수는 반대쪽)',
  '옮긴 거리 — 수를 쳐 넣고 Enter를 누르면 이번 끌기를 그 거리로 맞춥니다(가로; 세로 두 수도 됩니다)',
  '옮긴 거리 — 수를 쳐 넣고 Enter를 누르면 이번 끌기를 그 거리로 맞춥니다(ΔX; ΔY; ΔZ 세 수도 됩니다)',
  '옮길 거리 — 수를 쳐 넣고 Enter를 누르면 고른 것을 지금 분해 방향으로 그만큼 옮깁니다(음수는 반대쪽)',
  '옮길 거리 — 가로; 세로 두 수를 쳐 넣고 Enter를 누르면 고른 것을 그만큼 옮깁니다',
  '옮길 거리 — ΔX; ΔY; ΔZ 세 수를 쳐 넣고 Enter를 누르면 고른 것을 그만큼 옮깁니다',
] as const;
const DIST_NAMES = ['옮긴 거리(숫자)', '옮길 거리(숫자)', '옮길 거리(가로; 세로)', '옮길 거리(ΔX; ΔY; ΔZ)'];
/** 분해 거리 칸의 거리 낱말(206차 — 독일어는 측정 쪽 Abstand와 다른 Entfernung, 작은 글자로) */
const DIST_WORD: Record<(typeof LANGS)[number], string> = { en: 'distance', ja: '距離', 'zh-CN': '距离', de: 'entfernung' };
const TYPED_SP = '거리를 읽지 못했습니다 — 수 하나(끈 방향으로 옮길 거리)나 가로; 세로 두 수를 쳐 넣으십시오.';
const FRESH_SP = '거리를 읽지 못했습니다 — 가로; 세로 두 수를 쳐 넣으십시오.';
const STAGE_TIP = '조립 단계별: 바깥 조립부터 벌립니다 — 하위 조립을 통째로 먼저 떼고, 더 밀면 그 안의 부품을 벌립니다';

/** 작은따옴표 글·틀 글 가운데 한글이 든 것(주석 줄·줄 끝 주석 밖). 틀의 ${…}은 실제 꼴 값(분해 방향 말풍선 꼬리 AIM·축 글자·수)으로 */
function bundleTexts(file: string, aim: string): string[] {
  const out: string[] = [];
  for (const raw of read(file).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    const code = raw.replace(/\s\/\/\s.*$/, '');
    for (const m of code.matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (HANGUL.test(m[1]!)) out.push(m[1]!);
    for (const m of code.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
      const text = m[1]!.replace(/\$\{([^}]*)\}/g, (_, e: string) => (e === 'AIM' ? aim : /toUpperCase|\bax\b/.test(e) ? 'X' : '2'));
      if (HANGUL.test(text)) out.push(text);
    }
  }
  return [...new Set(out)];
}

describe('분해·격리·단면 묶음 화면 글의 네 언어 번역(204차)', () => {
  it('묶음 원문(틀은 실제 값을 끼운 꼴)이 네 언어 모두 한글 없이 옮겨진다 — 빠진 번역 없음', () => {
    const aim = /const AIM = '([^']*)'/.exec(read('explodebar.ts'))?.[1];
    expect(aim).toMatch(HANGUL);
    // AIM 상수 글은 혼자 화면에 나오지 않는다(화면 방향 세 말풍선의 꼬리로만 — 이어 붙인 글을 본다)
    const texts = BUNDLE.flatMap((file) => bundleTexts(file, aim!)).filter((text) => text !== aim);
    expect(texts.length).toBeGreaterThanOrEqual(85);
    for (const [file, list] of Object.entries(APP)) for (const text of list) expect(read(file), `${file}: ${text}`).toContain(`'${text}'`);
    expect(read('toolbar.ts')).toContain('`단면 ${a.toUpperCase()}`');
    for (const lang of LANGS)
      for (const text of [...texts, ...Object.values(APP).flat(), '단면 X']) {
        const out = translate(text, lang);
        expect(out, `${lang}: ${text}`).not.toMatch(HANGUL);
        expect(out, `${lang}: ${text}`).not.toBe(text);
      }
  });

  it('한 기능의 말풍선·이름·메뉴 항목이 그 버튼·칸의 보이는 글과 같은 낱말이다', () => {
    const src = read('explodebar.ts');
    for (const key of [...DIST_TIPS, ...DIST_NAMES]) expect(src, key).toContain(`'${key}'`);
    const comps = Object.keys(catalogs.en!).filter((key) => key.includes('가로; 세로'));
    expect(comps.sort()).toEqual([FRESH_SP, TYPED_SP, DIST_TIPS[1], DIST_TIPS[4], '옮길 거리(가로; 세로)'].sort());
    for (const lang of LANGS) {
      const c = catalogs[lang]!;
      const has = (key: string, word: string): void =>
        expect(c[key]!.toLowerCase(), `${lang}: ${key} ⊃ ${word}`).toContain(translate(word, lang).toLowerCase());
      // 작업 버튼 말풍선은 작업 메뉴 항목 이름(숨기기·이것만 보기)으로
      has(ACTIONS, '숨기기');
      has(ACTIONS, '이것만 보기');
      // 분해 거리 칸(206차 — 측정이 쓰는 「거리」와 열쇠를 가름): 이름표 「옮긴 거리」(끈 뒤)가 끌기 말풍선 셋·이름에, 「옮길 거리」(끌기 없이 연 빈 칸)가
      // 빈 칸 말풍선 셋·이름 셋에, 두 이름표가 함께 품는 분해 거리 낱말이 그 칸을 여는 메뉴 항목에
      for (const key of [...DIST_TIPS.slice(0, 3), DIST_NAMES[0]!]) has(key, '옮긴 거리');
      for (const key of [...DIST_TIPS.slice(3), ...DIST_NAMES.slice(1)]) has(key, '옮길 거리');
      for (const text of [c['거리로 옮기기…']!, translate('옮긴 거리', lang), translate('옮길 거리', lang)]) expect(text.toLowerCase(), `${lang}: ${text}`).toContain(DIST_WORD[lang]);
      // 단면 막대 이름(도구 막대 단면 메뉴 이름)이 도구 막대 말풍선의 머리, 단면 위치 밀대 이름이 숫자 칸 이름의 머리·못 읽음 알림에
      expect(c[SECTION_TIP]!.startsWith(c['단면 보기']!), `${lang}: ${c[SECTION_TIP]}`).toBe(true);
      expect(c['단면 위치(숫자)']!.startsWith(c['단면 위치']!), `${lang}: ${c['단면 위치(숫자)']}`).toBe(true);
      has('단면 위치를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오.', '단면 위치');
      // 뒤집기 버튼 말풍선 둘(+쪽·−쪽)은 부호만 다르다
      expect(translate('+X 쪽을 잘라 냅니다 — 눌러서 뒤집기', lang), lang).toBe(translate('−X 쪽을 잘라 냅니다 — 눌러서 뒤집기', lang).replace('−X', '+X'));
    }
    // 일본어·중국어: 쳐 넣는 가로; 세로 성분 이름이 분해 방향 버튼 글(끄는 동안 거리 글의 이름도 같은 열쇠)
    for (const lang of ['ja', 'zh-CN'] as const) {
      const pair = `${translate('가로', lang)}; ${translate('세로', lang)}`;
      for (const key of comps) expect(catalogs[lang]![key], `${lang}: ${key}`).toContain(pair);
    }
  });

  it('고친 값은 그대로이고 네 사전 어디에도 하나뿐이라 거꾸로 찾으면 제 원문으로 돌아오며, 같은 사전의 근거 낱말을 쓴다', () => {
    const fixed: [key: string, lang: (typeof LANGS)[number], value: string][] = [
      [ACTIONS, 'en', 'Actions for the selection (hide, isolate, and more)'],
      [SECTION_TIP, 'en', 'Section view: Cut with a plane perpendicular to the axis (X·Y·Z) — drag the position and flip the side being cut in the bar above the 3D view'],
      ['단면 끄기', 'ja', '断面をオフ'],
      ['단면 보기', 'ja', '断面表示'],
      ['단면 위치(숫자)', 'ja', '断面位置（数値）'],
      ['+{0} 쪽을 잘라 냅니다 — 눌러서 뒤집기', 'ja', '+{0} 側をカットします — 押して反転'],
      [STAGE_TIP, 'ja', 'アセンブリ段階ごと: 外側のアセンブリから広げます — まずサブアセンブリを丸ごと離し、さらに動かすとその中の部品を広げます'],
      [DIST_TIPS[1], 'zh-CN', '移动距离 — 输入数值并按 Enter，将本次拖动设为该距离（也可输入横向; 纵向两个数）'],
      [DIST_TIPS[4], 'zh-CN', '要移动的距离 — 输入横向; 纵向两个数并按 Enter，将所选内容移动相应距离'],
      ['옮길 거리(가로; 세로)', 'zh-CN', '要移动的距离（横向; 纵向）'],
      [TYPED_SP, 'zh-CN', '无法读取距离 — 请输入一个数（沿拖动方向移动的距离），或横向; 纵向两个数。'],
      [FRESH_SP, 'zh-CN', '无法读取距离 — 请输入横向; 纵向两个数。'],
      [ACTIONS, 'de', 'Aktionen für die Auswahl (Ausblenden, Isolieren usw.)'],
      [SECTION_TIP, 'de', 'Schnittansicht: Mit einer Ebene senkrecht zur Achse (X·Y·Z) schneiden – Position ziehen und Schnittseite umdrehen in der Leiste über der 3D-Ansicht'],
      ['분해 끄기(제자리로)', 'de', 'Explosion aus (zurück an Ort und Stelle)'],
      [DIST_TIPS[0], 'de', 'Verschobene Entfernung — Zahl eingeben und Enter drücken, um dieses Ziehen auf diese Strecke zu setzen (negativ = Gegenrichtung)'],
      [DIST_TIPS[1], 'de', 'Verschobene Entfernung — Zahl eingeben und Enter drücken, um dieses Ziehen auf diese Strecke zu setzen (auch zwei Zahlen: horizontal; vertikal)'],
      [DIST_TIPS[2], 'de', 'Verschobene Entfernung — Zahl eingeben und Enter drücken, um dieses Ziehen auf diese Strecke zu setzen (auch drei Zahlen: ΔX; ΔY; ΔZ)'],
      [DIST_TIPS[3], 'de', 'Zu verschiebende Entfernung — Zahl eingeben und Enter drücken, um die Auswahl um diese Strecke in der aktuellen Explosionsrichtung zu verschieben (negativ = Gegenrichtung)'],
      [DIST_TIPS[4], 'de', 'Zu verschiebende Entfernung — zwei Zahlen eingeben (horizontal; vertikal) und Enter drücken, um die Auswahl um diesen Betrag zu verschieben'],
      [DIST_TIPS[5], 'de', 'Zu verschiebende Entfernung — drei Zahlen eingeben (ΔX; ΔY; ΔZ) und Enter drücken, um die Auswahl um diesen Betrag zu verschieben'],
      ['거리로 옮기기…', 'de', 'Um Entfernung verschieben…'],
    ];
    const all = LANGS.flatMap((lang) => Object.values(catalogs[lang]!));
    for (const [key, lang, value] of fixed) {
      expect(catalogs[lang]![key], `${lang}: ${key}`).toBe(value);
      expect(value, `${lang}: ${key}`).not.toMatch(HANGUL);
      expect((value.match(/\{\d+\}/g) ?? []).sort(), `${lang}: ${key}`).toEqual((key.match(/\{\d+\}/g) ?? []).sort());
      expect(all.filter((v) => v === value).length, `${lang}: ${value}`).toBe(1);
      expect(sourceMessage(value), `${lang}: ${value}`).toBe(key);
    }
    // 근거 줄: 뒤집는 것은 잘라 내는 쪽(단면 막대 뒤집기 버튼 이름 — 127차 시험이 굳힌 독일어 Schnittseite umdrehen)
    for (const lang of ['en', 'de'] as const) {
      expect(catalogs[lang]![SECTION_TIP]!.toLowerCase(), lang).toContain(catalogs[lang]!['잘라 내는 쪽 뒤집기']!.toLowerCase());
      expect(catalogs[lang]![SECTION_TIP], lang).not.toMatch(/flip positions|Positionen/);
    }
    // 일본어 끄기는 「…をオフ」(분해 끄기와 같은 꼴), 독일어 제자리는 an Ort und Stelle(다른 언어: back in place·元の位置·原位)
    for (const key of ['단면 끄기', '분해 끄기(제자리로)']) expect(catalogs.ja![key], key).toMatch(/^\S+をオフ/);
    expect(['en', 'ja', 'zh-CN'].map((lang) => catalogs[lang]!['분해 끄기(제자리로)'])).toEqual(['Turn off explode (back in place)', '分解をオフ（元の位置へ）', '关闭爆炸（回到原位）']);
    expect(catalogs.de!['분해 끄기(제자리로)']).not.toMatch(/an Ort\)/);
  });
});
