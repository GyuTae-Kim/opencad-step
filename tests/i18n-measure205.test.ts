/**
 * 205차: 측정 묶음(측정 띠·두 점 거리·개체 측정 거리·각·고른 면·모서리의 넓이·지름·반지름·방향 잠금·스냅 이름·측정 기록 CSV 복사·측정 안내·
 * 정밀 조준·가상 커서 도움말) 화면 글을 네 언어로 대조해 고친 것(README 개발 절 205차 문단 — 원문·코드는 그대로, 사전 값만):
 * - 오역: 다시 재기 말풍선 「찍은 점」(영어 picked·일본어 選んだ·중국어 已选 — 고르기와 섞임 → 이 사전의 찍다 place·置く·放置),
 *   개체 측정 결과 「누른 점 사이 거리」(일본어 クリックした·중국어 所点 — 손가락에서도 같은 열쇠라 기기 가리지 않는 選択·选), 측정 버튼 말풍선
 *   「…방향에 붙고」(영어 follows → snaps to), 독일어 개체 측정 안내 「중간점」(Mittelpunkt는 이 사전에서 「중심」 → 스냅 이름 Kantenmitte)
 * - 한 기능 한 낱말(보이는 글이 이김 — 음성 조작 2.5.3): 측정 버튼 말풍선의 일본어 計測(버튼 測定)·스냅 吸着/중국어 吸附(측정의 스냅은
 *   スナップ·捕捉), 개체 측정 안내의 독일어 Ecke(스냅 이름·측정 종류 말풍선 Eckpunkt — Ecke는 뷰 큐브 「구석」)·영어 end points(스냅 이름
 *   Endpoint), 아래 띠 머리 「고른 모서리」(일본어 選択した·독일어 Gewählte ↔ 같은 띠 머리 選んだ·Ausgewählt), 일본어 「B-스플라인 곡면」
 *   (サーフェス ↔ 이 사전의 곡면 曲面·B スプライン)
 * - 204차가 남긴 묶음 밖 일본어 조립 읽기 알림의 빈칸 없는 줄표 「—同じ」 → 같은 사전의 「 — 」
 * - 빠진 번역: 없음 — 묶음 원문(여덟 파일의 작은따옴표 글은 원문 파일에서 읽고, 틀 글은 실제 꼴 값(축 글자 X·Y·Z, 수)을 끼운 글,
 *   잠근 선 이름처럼 조각을 이어 붙인 글은 실제 짝)이 네 언어 모두 한글 없이 옮겨지는지로 굳힌다
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogs, sourceMessage, translate } from '../site/i18n.mjs';

const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
type Lang = (typeof LANGS)[number];
const HANGUL = /[가-힣]/;
const read = (file: string): string => readFileSync(join(__dirname, '../src/app', file), 'utf8');

/** 측정 띠 안내·결과, 스냅·잠금 이름, 가상 커서 도움말, 끌어온 점 만남 이름, 개체 측정 결과 이름, 면·모서리 종류 — 화면 글을 이 파일들이 만든다 */
const BUNDLE = ['measure.ts', 'snap.ts', 'keysnap.ts', 'trackdir.ts', 'entmeasure.ts', 'entpick.ts', 'faces.ts', 'edges.ts'];
/**
 * 혼자 화면에 나오지 않는 글: 가상 커서 알림 열쇠 앞머리(keysnap KEYED_PREFIX — 사전 열쇠를 만들 때만), 잠근 선 이름의 앞 조각
 * 「접선」·「방향」(snap.ts lockMeetLabel이 「잠근 … · …」 안에만 끼운다 — 실제 짝은 LOCK_MEET)
 */
const PARTS = ['가상 커서 알림 — ', '접선', '방향'];
/** 앱 쪽 측정 글(측정 띠·잠금 알림·손가락 도움말·측정 기록 CSV·길이 단위 설명·측정 버튼·아래 띠·CSV 머리) — 원문 파일에 그대로 있는지도 본다 */
const APP: Record<string, string[]> = {
  'app.ts': [
    '찍은 점과 결과 지우기',
    '다시 재기',
    '측정 종류',
    '두 점',
    '두 점 사이 거리와 dx·dy·dz',
    '개체',
    '면·모서리·꼭짓점 두 개 사이 거리·각(평행 면 거리, 구멍 축 거리 등)',
    '지금 방향 잠그기(다시 누르면 풀기)',
    '방향 잠금',
    '방향 잠금 풀기',
    '커서 아래 스냅할 점',
    '측정 끝내기',
    '한 손가락 끌기 회전 · 두 손가락 이동·확대 · 측정·면 고르기는 길게 눌러 정밀 조준',
    '분해 보기 동안은 측정·면 고르기를 끕니다(제자리 형상으로 잽니다).',
    '잠글 방향이 없습니다: 길게 눌러 조준하며 축·모서리와 나란한 방향에 맞춘 뒤 누르십시오',
    '잠글 방향이 없습니다: 커서를 축·모서리와 나란한 방향에 맞춘 뒤 누르십시오',
    '모서리 위 점',
    '면 위 점',
    '측정 기록 CSV',
    '측정 기록 CSV 복사',
    '외형 크기',
    '화면에 그리는 삼각형으로 잰 외형 크기입니다. 구멍·원기둥의 정확한 지름은 면 고르기로 확인하십시오.',
    '개체 측정',
    '측정: 두 점을 누르십시오',
    '측정(3D 보기 위 글자 포함)·면 정보·속성·단면 값에 씁니다.',
    '이 파일은 길이 단위를 모릅니다 — 값을 바꾸지 않고 그대로 보입니다.',
  ],
  'toolbar.ts': [
    '측정',
    '두 점 거리·dx·dy·dz 재기 — 축·모서리와 나란한 방향에 붙고 Shift·화살표로 방향 잠금 (Esc = 지우기)',
    '내보내기: PNG 그림(크게·투명 배경) · STL·OBJ(보이는 것·고른 것) · 측정 기록·PMI 표 CSV 복사 · 보기 링크 복사',
  ],
  'panel.ts': ['거리 ', '고른 모서리 ', '고른 면 ', '큰 반지름', '반지름', '중심', '축 위 점', '화면용 삼각형으로 잰 근삿값입니다(B-스플라인 등).'],
  'export.ts': ['순번', '종류', '값', '단위', '점 A', '점 B', '넓이', '둘레', '거리', '면', '모서리'],
};
/** 앱 쪽 틀 글(앞머리가 원문 파일에 있는지)과 실제 꼴 값을 끼운 글 */
const FILLED: [file: string, head: string, texts: string[]][] = [
  ['app.ts', '`거리 ${', ['거리 12.3 mm', '거리 12.3']],
  ['panel.ts', '`길이 ${', ['길이 12.3 mm']],
  ['panel.ts', '`반지름 ${', ['반지름 12.3 mm']],
  ['panel.ts', '`지름 ${', ['지름 24.6 mm']],
  ['panel.ts', '`긴 반지름 ${', ['긴 반지름 12.3 mm']],
  ['panel.ts', '`짧은 반지름 ${', ['짧은 반지름 6 mm']],
  ['panel.ts', '`호 각 ${', ['호 각 90°']],
  ['panel.ts', '`중심 ${', ['중심 (1, 2, 3)']],
  ['panel.ts', '`작은 반지름 ${', ['작은 반지름 3 mm']],
  ['panel.ts', '`반각 ${', ['반각 30°']],
  ['panel.ts', '`넓이 ${', ['넓이 ≈ 12 mm² · 둘레 ≈ 3 mm', '넓이 12 mm² · 둘레 3 mm']],
];
/** 조각을 이어 붙인 이름(snap.ts lockMeetLabel·hoverSnapLabel의 「… · 잠금」, trackdir.ts 만남 이름)의 실제 짝 */
const LOCK_MEET = ['X축', 'Y축', 'Z축', '접선', '방향'].flatMap((what) =>
  ['모서리 위', '면 위', '끌어온 점과 나란히', '끌어온 점 X축 위', '끌어온 점 Y축 위', '끌어온 점 Z축 위'].map((where) => `잠근 ${what} · ${where}`),
);
const JOINED = [
  ...LOCK_MEET,
  '끝점 · 잠금',
  'X축 방향 · 잠금',
  '접선 방향 · 잠금',
  '끌어온 점에서 모서리와 나란히 · X축 위',
  '끌어온 점에서 모서리에 수직 · 모서리 위',
  '모서리와 나란히 · 다른 끌어온 점에서 수직인 선 위',
  '끌어온 점에서 모서리와 나란히 · 시작점에서 나란한 선 위',
];

const AXES = ['X', 'Y', 'Z'];
/** 축 글자 자리(`toUpperCase`·`a` — 「X축」)가 있으면 X·Y·Z(둘이면 서로 다른 축 짝)로 모두, 그 밖의 자리는 수 */
function filled(body: string): string[] {
  const axis = (e: string): boolean => e === 'a' || /toUpperCase/.test(e);
  const slots = [...body.matchAll(/\$\{([^}]*)\}/g)].map((s) => s[1]!).filter(axis).length;
  const combos: string[][] = slots === 0 ? [[]] : slots === 1 ? AXES.map((a) => [a]) : AXES.flatMap((a) => AXES.filter((b) => b !== a).map((b) => [a, b]));
  return combos.map((combo) => {
    let i = 0;
    return body.replace(/\$\{([^}]*)\}/g, (_, e: string) => (axis(e) ? `${combo[i++]}${e === 'a' ? '축' : ''}` : '2'));
  });
}

/** 작은따옴표 글·틀 글 가운데 한글이 든 것(주석 줄·줄 끝 주석 밖). 「잠근 ${what} · ${where}」는 실제 짝(LOCK_MEET)으로 따로 */
function bundleTexts(file: string): string[] {
  const out: string[] = [];
  for (const raw of read(file).split('\n')) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    const code = raw.replace(/\s\/\/\s.*$/, '');
    for (const m of code.matchAll(/'((?:[^'\\]|\\.)*)'/g)) if (HANGUL.test(m[1]!)) out.push(m[1]!);
    for (const m of code.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
      if (/\$\{(?:what|where)\}/.test(m[1]!)) continue;
      for (const text of filled(m[1]!)) if (HANGUL.test(text)) out.push(text);
    }
  }
  return [...new Set(out)];
}

const TIP = '두 점 거리·dx·dy·dz 재기 — 축·모서리와 나란한 방향에 붙고 Shift·화살표로 방향 잠금 (Esc = 지우기)';
const ENT_SNAP = '개체 측정: 면·모서리·꼭짓점을 누르십시오(끝점·중간점에 붙습니다)';
const ENT_HINTS = [
  '개체 측정: 두 번째 면·모서리·꼭짓점을 누르십시오',
  '개체 측정: 두 번째 면·모서리·꼭짓점을 누르십시오 · Esc 지우기',
  '개체 측정: 면·모서리·꼭짓점을 누르십시오 · 길게 누르면 정밀 조준',
  ENT_SNAP,
];
/** 측정 안내 둘(마우스·손가락) — 「…가까우면 붙습니다」 */
const POINT_HINTS = [
  '측정: 모형 위 두 점을 누르십시오(꼭짓점·모서리 중간점·원 중심 가까우면 붙습니다) · 길게 누르면 정밀 조준',
  '측정: 모형 위 두 점을 누르십시오(꼭짓점·모서리 중간점·원 중심 가까우면 붙습니다). Esc = 지우기',
];
const PLACED = '찍은 점과 결과 지우기';
const PICKED = '누른 점 사이 거리';
const CAP_NOTICE = '조립 자리가 {0}개를 넘어 앞부분만 보입니다 — 같은 하위 조립을 층마다 거듭 쓴 파일일 수 있습니다(패널의 "정보" 탭).';

/** 이 사전의 측정 스냅 낱말(붙다)·근거(「커서 아래 스냅할 점」·「스냅할 점이 없습니다」의 낱말) */
const SNAP: Record<Lang, [verb: RegExp, noun: RegExp]> = {
  en: [/snaps to/, /snap/i],
  ja: [/スナップ/, /スナップ/],
  'zh-CN': [/捕捉/, /捕捉/],
  de: [/rastet/, /Fang/],
};
/** 이 사전의 찍다(「찍기(측정)·고르기」·「찍을 점이 없습니다」·「첫 점을 찍었습니다」) */
const PLACE: Record<Lang, RegExp> = { en: /place/i, ja: /置/, 'zh-CN': /放置/, de: /setz/i };
/** 기기 가리지 않는 누르다(상태 막대 「측정: 두 점을 누르십시오」 — 마우스·손가락 같은 열쇠)와 한쪽 기기만의 낱말(안내 열쇠가 기기마다 따로 쓰는 말) */
const NEUTRAL: Record<Lang, [word: RegExp, device: RegExp]> = {
  en: [/pick/i, /click|tap/i],
  ja: [/選択/, /クリック|タップ/],
  'zh-CN': [/选/, /单击|点击|点按|轻点/],
  de: [/wähl/i, /klick|tipp/i],
};
/** 「B-스플라인 모서리」 → 「B-스플라인 곡면」: 모서리 낱말을 이 사전의 곡면 낱말로 */
const SURFACE: Record<Lang, [edge: string, surface: string]> = { en: ['edge', 'surface'], ja: ['エッジ', '曲面'], 'zh-CN': ['边', '曲面'], de: ['Kante', 'Fläche'] };

describe('측정 묶음 화면 글의 네 언어 번역(205차)', () => {
  it('묶음 원문(틀은 실제 값을 끼운 꼴, 이어 붙인 이름은 실제 짝)이 네 언어 모두 한글 없이 옮겨진다 — 빠진 번역 없음', () => {
    expect(read('keysnap.ts')).toContain("KEYED_PREFIX = '가상 커서 알림 — '");
    expect(read('snap.ts')).toContain("tangent ? '접선' : '방향'");
    const texts = BUNDLE.flatMap((file) => bundleTexts(file)).filter((text) => !PARTS.includes(text));
    expect(texts.length).toBeGreaterThanOrEqual(110);
    for (const [file, list] of Object.entries(APP)) for (const text of list) expect(read(file), `${file}: ${text}`).toContain(`'${text}'`);
    for (const [file, head] of FILLED) expect(read(file), `${file}: ${head}`).toContain(head);
    const all = [...texts, ...Object.values(APP).flat(), ...FILLED.flatMap(([, , list]) => list), ...JOINED];
    for (const lang of LANGS)
      for (const text of all) {
        const out = translate(text, lang);
        expect(out, `${lang}: ${text}`).not.toMatch(HANGUL);
        expect(out, `${lang}: ${text}`).not.toBe(text);
      }
  });

  it('한 기능의 말풍선·안내·이름이 그 버튼·스냅 이름·같은 띠의 낱말과 같다', () => {
    for (const lang of LANGS) {
      const c = catalogs[lang]!;
      const low = (key: string): string => c[key]!.toLowerCase();
      // 측정 버튼 말풍선은 버튼 이름(측정)을 품는다
      expect(low(TIP), `${lang}: ${c[TIP]}`).toContain(low('측정'));
      // 측정의 스냅(붙다)은 한 낱말 — 근거: 커서 아래 스냅할 점·스냅할 점이 없습니다
      const [verb, noun] = SNAP[lang];
      for (const key of ['커서 아래 스냅할 점', '스냅할 점이 없습니다']) expect(c[key], `${lang}: ${key}`).toMatch(noun);
      for (const key of [TIP, ENT_SNAP, ...POINT_HINTS]) expect(c[key], `${lang}: ${key}`).toMatch(verb);
      expect(`${c[TIP]} ${c[ENT_SNAP]}`, lang).not.toMatch(/吸附|吸着/);
      // 개체 측정 안내의 개체 이름은 스냅 이름(꼭짓점·끝점·중간점)
      for (const key of ENT_HINTS) expect(low(key), `${lang}: ${key}`).toContain(translate('꼭짓점', lang).toLowerCase());
      for (const name of ['끝점', '중간점']) expect(low(ENT_SNAP), `${lang}: ${name}`).toContain(translate(name, lang).toLowerCase());
      // 찍다: 다시 재기 말풍선의 「찍은 점」이 이 사전의 찍기 낱말
      for (const key of ['찍기(측정)·고르기', '찍을 점이 없습니다', '첫 점을 찍었습니다. {0}: {1}', PLACED]) expect(c[key], `${lang}: ${key}`).toMatch(PLACE[lang]);
      // 개체 측정 결과 「누른 점」은 마우스·손가락이 같은 열쇠라 기기 가리지 않는 낱말
      const [word, device] = NEUTRAL[lang];
      for (const key of ['측정: 두 점을 누르십시오', PICKED]) expect(c[key], `${lang}: ${key}`).toMatch(word);
      expect(c[PICKED], lang).not.toMatch(device);
      // B-스플라인 곡면 = B-스플라인 모서리의 모서리 낱말을 곡면 낱말로
      const [edge, surface] = SURFACE[lang];
      expect(c['B-스플라인 곡면'], lang).toBe(c['B-스플라인 모서리']!.replace(edge, surface));
    }
    // 일본어 곡면 = 曲面(밀기·오프셋 곡면), 아래 띠 머리 「고른 …」은 일본어 選んだ·독일어 Ausgewählt 하나로
    for (const key of ['밀기 곡면', '오프셋 곡면']) expect(catalogs.ja![key], key).toContain('曲面');
    for (const key of ['고른 것', '고른 면', '고른 바디', '고른 제품', '고른 모서리']) {
      expect(catalogs.ja![key], `ja: ${key}`).toMatch(/^選んだ/);
      expect(catalogs.de![key], `de: ${key}`).toMatch(/^Ausgewählt/);
    }
    // 독일어 Ecke는 뷰 큐브 「구석」 — 꼭짓점이 아니다
    expect(catalogs.de!['뷰 큐브: 면·모서리·구석을 누르면 그 방향으로 봅니다']).toContain('Ecke');
  });

  it('고친 값은 그대로이고 네 사전 어디에도 하나뿐이라 거꾸로 찾으면 제 원문으로 돌아오며, 일본어 줄표는 앞뒤 빈칸', () => {
    const fixed: [key: string, lang: Lang, value: string][] = [
      [PLACED, 'en', 'Clear placed points and result'],
      [TIP, 'en', 'Measure the distance and dx, dy, dz between two points — snaps to axes and directions parallel to edges; Shift or arrow keys lock the direction (Esc = clear)'],
      [ENT_SNAP, 'en', 'Entity measurement: Click a face, edge or vertex (snaps to endpoints and midpoints)'],
      [PLACED, 'ja', '置いた点と結果を消去'],
      [PICKED, 'ja', '選択した点の間の距離'],
      [TIP, 'ja', '2 点間の距離と dx·dy·dz を測定 — 軸やエッジに平行な方向にスナップし、Shift・矢印キーで方向をロック（Esc = 消去）'],
      ['B-스플라인 곡면', 'ja', 'B スプライン曲面'],
      ['고른 모서리', 'ja', '選んだエッジ'],
      [CAP_NOTICE, 'ja', 'アセンブリの配置が {0}個を超えたため、最初の部分だけを表示しています — 同じサブアセンブリを階層ごとに繰り返し使ったファイルかもしれません（パネルの「情報」タブ）。'],
      [PLACED, 'zh-CN', '清除已放置的点和结果'],
      [PICKED, 'zh-CN', '所选两点间距离'],
      [TIP, 'zh-CN', '测量两点间距离及 dx·dy·dz — 捕捉到轴或与边平行的方向，按 Shift 或方向键锁定方向（Esc = 清除）'],
      [ENT_SNAP, 'zh-CN', '对象测量：点击面、边或顶点（捕捉到端点和中点）'],
      [ENT_HINTS[0]!, 'de', 'Elementmessung: Zweites Element (Fläche, Kante oder Eckpunkt) antippen'],
      [ENT_HINTS[1]!, 'de', 'Elementmessung: Zweites Element (Fläche, Kante oder Eckpunkt) anklicken · Esc löscht'],
      [ENT_HINTS[2]!, 'de', 'Elementmessung: Fläche, Kante oder Eckpunkt antippen · Gedrückt halten für genaues Zielen'],
      [ENT_SNAP, 'de', 'Elementmessung: Fläche, Kante oder Eckpunkt anklicken (rastet an Endpunkten und Kantenmitten ein)'],
      ['고른 모서리', 'de', 'Ausgewählte Kante'],
    ];
    const all = LANGS.flatMap((lang) => Object.values(catalogs[lang]!));
    for (const [key, lang, value] of fixed) {
      expect(catalogs[lang]![key], `${lang}: ${key}`).toBe(value);
      expect(value, `${lang}: ${key}`).not.toMatch(HANGUL);
      expect((value.match(/\{\d+\}/g) ?? []).sort(), `${lang}: ${key}`).toEqual((key.match(/\{\d+\}/g) ?? []).sort());
      expect(all.filter((v) => v === value).length, `${lang}: ${value}`).toBe(1);
      expect(sourceMessage(value), `${lang}: ${value}`).toBe(key);
    }
    // 측정 종류 말풍선(「2 点間の距離と dx·dy·dz」·「两点间距离及 dx·dy·dz」)과 측정 안내(「Esc = 消去」·「Esc = 清除」)가 근거
    expect(catalogs.ja!['두 점 사이 거리와 dx·dy·dz']).toBe('2 点間の距離と dx·dy·dz');
    expect(catalogs['zh-CN']!['두 점 사이 거리와 dx·dy·dz']).toBe('两点间距离及 dx·dy·dz');
    expect(catalogs.ja![POINT_HINTS[1]!]).toContain('Esc = 消去');
    expect(catalogs['zh-CN']![POINT_HINTS[1]!]).toContain('Esc = 清除');
    // 일본어 사전의 줄표 「—」는 모두 앞뒤 빈칸(204차 묶음 둘과 이 차수의 조립 읽기 알림)
    const dashes = Object.values(catalogs.ja!).filter((v) => v.includes('—'));
    expect(dashes.length).toBeGreaterThanOrEqual(68);
    expect(dashes.filter((v) => /\S—|—\S/.test(v))).toEqual([]);
  });

  // 207차: 「크기」는 고른 부품 카드(외형 범위 ≈ X × Y × Z)·그림 저장 크기·정보 탭 파일 크기가 함께 써서, 카드 이름표가 일본어 サイズ·중국어 大小(129차 — 파일 크기 꼴)·
  // 독일어 Größe로 같은 카드 말풍선과 같은 값의 패널 물리 속성 줄 「외형 크기」(外形寸法·外形尺寸·Außenmaße)와 다른 낱말이었다 — 카드 원문만 그 열쇠로(206차 꼴, 새 열쇠 없음)
  it('207차: 고른 부품 카드의 크기 이름표는 패널 물리 속성 줄과 같은 「외형 크기」 열쇠이고, 그림 저장·파일 크기의 「크기」와 갈린다', () => {
    const SIZE_TIP = '화면에 그리는 삼각형으로 잰 외형 크기입니다. 구멍·원기둥의 정확한 지름은 면 고르기로 확인하십시오.';
    const app = read('app.ts');
    expect(app).toContain("h('span', {}, '외형 크기'), ` ≈ ${fm.lenNum(size[0])} × ");
    expect(app).not.toContain("h('span', {}, '크기')");
    expect(read('panel.ts')).toContain("r('외형 크기', `≈ ${f.lenNum(");
    expect(read('imagedlg.ts')).toMatch(/selectRow\(\s*'크기',/);
    expect(read('infoview.ts')).toContain("row('크기', `${formatBytes(d.size)}");
    for (const lang of LANGS) {
      const label = translate('외형 크기', lang);
      expect(label, lang).not.toMatch(HANGUL);
      expect(label, lang).not.toBe(translate('크기', lang));
      expect(Object.values(catalogs[lang]!).filter((v) => v === label), lang).toHaveLength(1);
      // 카드 말풍선이 이름표 낱말을 품는다(영어 말풍선 Overall size는 보고 둠 — README 남은 일 207차)
      if (lang !== 'en') expect(translate(SIZE_TIP, lang), lang).toContain(label);
    }
  });
});
