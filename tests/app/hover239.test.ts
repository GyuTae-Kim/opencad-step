// @vitest-environment jsdom
/**
 * 239차(WCAG 1.4.13 올림·초점으로 뜨는 내용 — 재발 막기): 포인터를 올리거나 키보드 초점을 줘서 앱이 직접 띄우는 내용은
 * (가) 포인터·초점을 옮기지 않고 닫을 수 있고(Esc — 다른 내용을 가리지 않거나 입력 오류 알림이면 예외), (나) 포인터로 띄운 것은 그 위로 포인터를 옮겨도 남고,
 * (다) 올림·초점이 걷히거나 닫거나 정보가 낡을 때까지 남는다(시간으로 저절로 사라지지 않음). 브라우저 title 말풍선은 사용자 에이전트 몫이라 셈 밖.
 * - 감사 표(HOVERS — README 개발 절 239차 문단): 띄우는 내용 넷(측정 스냅 이름·스냅 표식·측정 고무줄 거리 글상자·겹친 것 고르기 줄 미리 강조)의 판정과 근거 원문,
 *   올림·초점 사건 자리(SITES — src 전체 .ts에서 addEventListener·listen·on(이름 글) 26곳 — 새 자리가 표 밖에 생기면 실패), 시간 닫힘(TIMERS — setTimeout 자리마다 일),
 *   스타일시트 올림·초점 규칙이 그 칸 자신의 꼴(바탕·글 색·테두리·윤곽·그림자·밝기)만 바꾸는지(보이게 하는 선언이면 표에 — 지금 쌓임 하나).
 * - 포인터 자리 읽기(커서 아래 점의 이름·커서까지 거리): (나)는 「해당 없음 — 포인터가 곧 입력」. 실제 코어로 포인터 밑을 가리지 않음·10분 뒤에도 남음·캔버스를 떠나면 거둠·Esc가 지움을 본다.
 * - 겹친 것 고르기 줄 미리 강조: 줄 초점·마우스로 띄우고, 메뉴 밖으로 나가도·10분 뒤에도 남고, Esc가 메뉴를 닫으며 되돌린다(DOM 사건).
 * - 238차가 남긴 알림 자리(측정 띠 위 68·112px에 못 박혀 세 줄 측정 글·두 줄 이름 카드와 겹침 — 알림은 일로 떠 1.4.13 밖): 3D 보기 위 띠를 지켜보는 LabelAvoid가
 *   띠 위 끝 + 6px를 CSS 변수로 두고 알림 칸 규칙이 max(못 박은 자리, 그 변수)로 — 띠가 낮으면 그대로, 높으면 띠 위로(크기 바뀜 사건·숨김으로 본다).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeasureLabelRect, Pick3d } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { circleCenters, measureSnapOptions } from '../../src/app/snap';
import { openPickList } from '../../src/app/ctxmenu';
import { closeMenu } from '../../src/app/menu';
import { LabelAvoid } from '../../src/app/labelavoid';
import type { PickRow } from '../../src/app/picklist';
import { cube, StepText } from '../stepText';
import { jsdomViewer } from './jsdomview';

const ROOT = join(__dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
/** src 아래 .ts 전부(저장소 기준 경로, 이름 차례) */
function tsFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .sort()
    .flatMap((f) => (statSync(join(ROOT, dir, f)).isDirectory() ? tsFiles(`${dir}/${f}`) : f.endsWith('.ts') ? [`${dir}/${f}`] : []));
}
const SRC: [file: string, text: string][] = tsFiles('src').map((f) => [f, read(f)]);
const textOf = (file: string): string => (file === CORE_VIEWER ? CORE : (SRC.find(([f]) => f === file)?.[1] ?? ''));
const CORE_VIEWER = 'node_modules/opencad-viewer3d/src/viewer.ts';
const CORE = read(CORE_VIEWER);
const CSS = read('src/app/styles.css');

// ───────────────────────── 감사 표 ─────────────────────────

/** 판정: ok = 지킴, na = 해당 없음(까닭 — 포인터 자리 읽기·커서 자리 표식·초점) */
type Verdict = 'ok' | 'na';
interface Hover {
  id: 'H1' | 'H2' | 'H3' | 'H4';
  name: string;
  /** 띄우는 길 */
  trigger: string;
  /** 가리는 것 */
  covers: string;
  a: [Verdict, string];
  b: [Verdict, string];
  c: [Verdict, string];
  /** 근거 원문(파일·정규식) */
  proof: [file: string, re: RegExp][];
}
const HOVERS: Hover[] = [
  {
    id: 'H1',
    name: '측정 스냅 이름(상태 막대 .status-snap·측정 띠 .mb-hover)',
    trigger: '측정 중 모형 위 포인터 올림(코어 미리 보기 알림)·가상 커서',
    covers: '상태 막대는 흐름 안 칸(덮지 않음), 측정 띠는 이름만큼 넓어져 띠 옆 3D 그림 한 조각',
    a: ['ok', 'Esc — 첫 점이 있으면 코어가 점·미리 보기를 지워 이름이 숨고, 없으면 측정 끝(대화 상자·메뉴 다음 차례)'],
    b: ['na', '포인터 자리 읽기 — 띠로 옮기면 캔버스를 떠나 코어가 미리 보기를 지움(남기면 찍을 점과 다른 이름). 가상 커서는 포인터가 떠나도 둠'],
    c: ['ok', '타이머 없음 — 포인터가 머무는 동안 그대로, 떠나면(올림 걷힘) 숨음'],
    proof: [
      ['src/app/app.ts', /v\.onMeasureHoverChange\(\(\) => v\.measureMode && this\.showHoverSnap\(\)\);/],
      ['src/app/app.ts', /for \(const el of \[this\.statusSnap, this\.measureHoverEl\]\) \{\s*el\.hidden = !text;/],
      [CORE_VIEWER, /this\.on\(cv, 'pointerleave', \(\) => \{[\s\S]{0,400}?if \(this\.keyCur\) return;\s*if \(this\.measureHover \|\| this\.hoverAt\) \{\s*this\.measureHover = null;/],
    ],
  },
  {
    id: 'H2',
    name: '측정 스냅 표식(코어 덧그림 — 커서 자리의 끝점·가운데·중심·교차 기호)',
    trigger: '측정 중 포인터 올림',
    covers: '그 점 자체(표식이 곧 커서 자리)',
    a: ['ok', 'H1과 같은 Esc 차례'],
    b: ['na', '커서 자리 표식 — 커서 꼴과 같음'],
    c: ['ok', 'H1과 같음'],
    proof: [[CORE_VIEWER, /snapMarkAt\(P\(hover\.p\), k\)/]],
  },
  {
    id: 'H3',
    name: '측정 고무줄 — 첫 점에서 커서까지 선과 두 점 가운데 거리 글상자(코어 덧그림, 포인터를 따라 움직임)',
    trigger: '첫 점 뒤 포인터 올림·이동',
    covers: '글상자 밑 모형 그림(두 점 가운데 오른쪽 위 — 커서 쪽 끝이 아님, 앱 띠·뷰 큐브는 비킴)',
    a: ['ok', 'Esc — 코어 clearMeasure(점·선·글상자 = 진행 중 측정 취소). 글상자만 숨기는 길은 없음(글상자가 곧 진행 중 측정)'],
    b: ['na', '따라 움직임 — 포인터를 글상자로 옮기면 그 자리가 둘째 점 미리 보기라 글상자도 옮겨 감. 포인터 밑은 가리지 않고, 찍으면 같은 값이 측정 띠 결과 글(남음)'],
    c: ['ok', '타이머 없음 — 캔버스를 떠나면 미리 보기를 거둠'],
    proof: [
      [CORE_VIEWER, /const a = pts\[0\], b = pts\[1\] \?\? \(hover \? hover\.p : undefined\);/],
      [CORE_VIEWER, /else if \(e\.key === 'Escape' && \(this\.measurePts\.length \|\| \(this\.measuring && this\.tracker\?\.size\)\)\) this\.clearMeasure\(\);/],
      [CORE_VIEWER, /const at = a\.pointerRadius && this\.measuring && this\.measureHover \? this\.lastHoverAt : null;/],
      ['src/app/app.ts', /if \(v\.measurePointCount > 0 && v\.handleKey\(ev\)\) return;/],
    ],
  },
  {
    id: 'H4',
    name: '겹친 것 고르기 목록 줄 미리 강조(65차 — 초점·마우스가 간 줄을 고를 때의 강조를 3D 보기에)',
    trigger: '줄 초점(focusin)·마우스 이동(그 줄로 초점)',
    covers: '모형 위 덧칠(있는 그림의 꼴) — 목록은 메뉴 자리',
    a: ['ok', 'Esc — 메뉴 닫기(되돌림 — 지금 고른 것의 강조)'],
    b: ['ok', '줄을 떠나도(메뉴 밖으로) 지우지 않음 — 마우스 이동은 초점만 옮김'],
    c: ['ok', '초점이 줄에 있는 동안·타이머 없음'],
    proof: [
      ['src/app/ctxmenu.ts', /el\.addEventListener\('focusin', \(e\) => show\(e\.target as Element\)\);/],
      ['src/app/ctxmenu.ts', /if \(b && b !== document\.activeElement\) b\.focus\(\{ preventScroll: true \}\);/],
      ['src/app/menu.ts', /if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\);\s*e\.stopPropagation\(\);\s*closeMenu\(\);/],
    ],
  },
];

/** 셈 밖으로 가른 셋(추가 내용 아님 — 그 칸 자신의 꼴·제자리 글 바꿈·쌓임 차례) */
const OUT: [id: string, name: string, why: string, proof: [string, RegExp]][] = [
  ['S1', '뷰 큐브 올림 강조(코어 큐브 면·모서리·꼭짓점 색)', '그 칸 자신의 꼴', [CORE_VIEWER, /this\.cubeHover = d;/]],
  ['S2', '측정 잠금 안내 글(마우스가 3D 보기에 들고 남·캔버스 초점 — 화살표 임자)', '늘 있는 안내 줄의 글만 그때 받는 키로(덮지 않음)', ['src/app/app.ts', /for \(const t of \['focus', 'blur'\]\) v\.canvas\.addEventListener\(t, \(\) => this\.refreshLock\(\)\);/]],
  ['S3', '측정 띠 키보드 초점 때 위로(휴대폰 — 분해 띠에 덮인 칸, 190차)', '쌓임 차례만(2.4.11 — 늘 있는 칸)', ['src/app/styles.css', /\.measure-bar:has\(:focus-visible\) \{\s*z-index: 7;/]],
];

/** 올림·초점 사건 이름(이 글을 addEventListener·listen·on에 넘기는 자리 — 원문 차례) */
const EVENTS = 'pointerenter|pointerover|pointermove|pointerleave|pointerout|mouseenter|mouseover|mousemove|mouseleave|mouseout|focusin|focusout|focus|blur';
const BIND = new RegExp(String.raw`\b(?:addEventListener|listen|on)\(\s*['"](${EVENTS})['"]`, 'g');
const LOOP = new RegExp(String.raw`for \(const \w+ of \[((?:\s*['"](?:${EVENTS})['"],?)+)\s*\]\)\s*[\w.?]+\.addEventListener\(`, 'g');
function sitesOf(text: string): string[] {
  // 머리 주석(/** … */)의 예시 글은 뺀다
  const code = text.replace(/^\s*\/\*[\s\S]*?\*\//gm, '');
  const out: [number, string][] = [];
  for (const m of code.matchAll(BIND)) out.push([m.index ?? 0, m[1]!]);
  for (const m of code.matchAll(LOOP)) for (const n of m[1]!.matchAll(/['"](\w+)['"]/g)) out.push([m.index ?? 0, n[1]!]);
  return out.sort((x, y) => x[0] - y[0]).map(([, e]) => e);
}
/** 자리마다 하는 일 — row: 표 줄(H4·S2) 또는 toast(알림 멈춤 — 4절)·press(누름·끌기)·none(보이는 내용 없음) */
const SITES: Record<string, { events: string[]; what: string; row: 'H4' | 'S2' | 'toast' | 'press' | 'none' }> = {
  'src/app/aim.ts': { events: ['pointermove'], what: '손가락 길게 누른 정밀 조준 끌기', row: 'press' },
  'src/app/app.ts': { events: ['pointermove', 'pointerleave', 'focus', 'blur', 'blur'], what: '화살표 임자·잠금 안내(218차), Shift 뗌 접선 잠금 풀기', row: 'S2' },
  'src/app/ctxmenu.ts': { events: ['focusin', 'pointermove'], what: '겹친 것 고르기 줄 미리 강조', row: 'H4' },
  'src/app/dom.ts': { events: ['focusin', 'pointerenter', 'pointerleave', 'focusin', 'focusout'], what: '알림 — 들어오기 전 초점 기억, 올림·초점이면 닫힘 시간 멈춤(160차)', row: 'toast' },
  'src/app/explodebar.ts': { events: ['focus', 'blur'], what: '분해 거리 칸 — 보낸 값 지움·떼면 보냄', row: 'none' },
  'src/app/explodedrag.ts': { events: ['pointermove'], what: '분해 손질 끌기', row: 'press' },
  'src/app/explodetool.ts': { events: ['blur'], what: '창이 흐려지면 끌기 취소', row: 'none' },
  'src/app/keynav.ts': { events: ['focusin'], what: '도구 막대 Tab 멈춤 맞춤', row: 'none' },
  'src/app/menu.ts': { events: ['focusin'], what: '초점이 메뉴 밖으로 가면 닫기', row: 'none' },
  'src/app/resize.ts': { events: ['pointermove'], what: '패널 크기 끌기', row: 'press' },
  'src/app/sectionbar.ts': { events: ['pointermove'], what: '단면 손잡이 끌기', row: 'press' },
  'src/app/tangent.ts': { events: ['pointermove', 'pointerleave'], what: 'Shift+Tab 되돌리기용 포인터 자리(122차)', row: 'none' },
  'src/app/treeview.ts': { events: ['focusin', 'pointermove', 'focusin'], what: '가상 목록 앞뒤 줄 만들기·길게 누르기 셈·나무 Tab 멈춤', row: 'none' },
};

/** setTimeout 자리(파일마다 수와 일) — 시간으로 닫는 보이는 내용은 알림뿐(일로 뜸 — 올림·초점이면 멈춤) */
const TIMERS: Record<string, [count: number, what: string]> = {
  'src/app/aim.ts': [2, '길게 누름 셈(정밀 조준·메뉴)'],
  'src/app/app.ts': [5, '물리 속성 맡기 미룸 둘·내려받기 주소 거두기·워커 미리 띄우기·덮개 그릴 틈'],
  'src/app/dom.ts': [2, '알림 닫힘(160차 — 마우스가 오르거나 초점이 안이면 멈추고 떠나면 처음 시간)'],
  'src/app/entpick.ts': [1, '나눠 돌리기 쉼'],
  'src/app/exactbound.ts': [1, '시간 조각'],
  'src/app/keynav.ts': [1, '초점 되찾기(다음 차례)'],
  'src/app/panel.ts': [1, '거르기 칸 늦춤'],
  'src/app/resize.ts': [1, '한 번 누르기·두 번 누르기 가르기'],
  'src/app/treeview.ts': [1, '길게 누르기 셈'],
  'src/worker/parse.worker.ts': [1, '해석 쉼'],
};

// ───────────────────────── 스타일시트 ─────────────────────────

/** 스타일시트 규칙(주석 뺌 — 감싼 @media 머리·선택자 낱낱·선언 이름과 값) */
function blocksOf(css: string): { media: string | null; sels: string[]; decl: [string, string][] }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { media: string | null; sels: string[]; decl: [string, string][] }[] = [];
  const stack: { head: string; from: number }[] = [];
  let last = 0;
  for (const m of text.matchAll(/[{}]/g)) {
    const i = m.index ?? 0;
    if (m[0] === '{') stack.push({ head: text.slice(last, i).trim(), from: i + 1 });
    else {
      const b = stack.pop();
      if (b && !b.head.startsWith('@'))
        out.push({
          media: stack.find((s) => s.head.startsWith('@media'))?.head ?? null,
          sels: b.head.split(',').map((s) => s.replace(/\s+/g, ' ').trim()),
          decl: text
            .slice(b.from, i)
            .split(';')
            .map((d) => d.trim())
            .filter(Boolean)
            .map((d): [string, string] => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]),
        });
    }
    last = i + 1;
  }
  return out;
}
const BLOCKS = blocksOf(CSS);
const PSEUDO = /:(hover|focus|focus-visible|focus-within)\b/;
/** 그 칸 자신의 꼴만 바꾸는 선언 */
const STATE_PROPS = new Set(['background', 'background-color', 'color', 'border-color', 'box-shadow', 'outline', 'outline-offset', 'outline-color', 'filter']);
/** 올림·초점 규칙인데 그 칸 꼴 밖을 바꾸는 것(표 S3 — 쌓임 차례) */
const CSS_STACK: [sel: string, props: string[]][] = [['.measure-bar:has(:focus-visible)', ['z-index']]];

/** 알림 칸 bottom 규칙(239차 — 미디어 조건·선택자 → 값) */
const TOAST_RULES: [media: string | null, sel: string, value: string][] = [
  [null, '.view:has(.measure-bar.measuring:not([hidden])) .toasts', 'max(68px, var(--toast-over-bar, 0px))'],
  [null, '.view:has(.measure-bar.multi:not([hidden])) .toasts', 'max(68px, var(--toast-over-bar, 0px))'],
  ['@media (max-width: 759.98px), (pointer: coarse)', '.view:has(.measure-bar:not([hidden])) .toasts', 'max(68px, var(--toast-over-bar, 0px))'],
  ['@media (max-width: 759.98px)', '.view:has(.measure-bar.measuring:not([hidden])) .toasts', 'max(112px, var(--toast-over-bar, 0px))'],
];

describe('239차: 올림·초점으로 뜨는 내용 감사 표(WCAG 1.4.13)', () => {
  it('띄우는 내용 넷의 판정과 근거 원문 — (가)(나)(다)를 어기는 것 0, 해당 없음은 포인터 자리 읽기·커서 자리 표식뿐', () => {
    for (const h of HOVERS) for (const [file, re] of h.proof) expect(textOf(file), `${h.id} ${file}`).toMatch(re);
    for (const [id, , , [file, re]] of OUT) expect(file === 'src/app/styles.css' ? CSS : textOf(file), id).toMatch(re);
    expect(HOVERS.map((h) => [h.id, h.a[0], h.b[0], h.c[0]])).toEqual([
      ['H1', 'ok', 'na', 'ok'],
      ['H2', 'ok', 'na', 'ok'],
      ['H3', 'ok', 'na', 'ok'],
      ['H4', 'ok', 'ok', 'ok'],
    ]);
    // 해당 없음 까닭은 포인터가 곧 입력인 것(따라 움직이거나 그 자리의 값)
    for (const h of HOVERS.filter((x) => x.b[0] === 'na')) expect(h.b[1], h.id).toMatch(/포인터 자리 읽기|커서 자리 표식|따라 움직임/);
  });

  it('올림·초점 사건 자리: src 전체 26곳이 표와 같다(새 자리가 생기면 표에 더해야 통과), 속성 꼴(.onfocus =·h 속성 onpointer…)은 0', () => {
    const got: Record<string, string[]> = {};
    for (const [f, t] of SRC) {
      const s = sitesOf(t);
      if (s.length) got[f] = s;
    }
    expect(got).toEqual(Object.fromEntries(Object.entries(SITES).map(([f, s]) => [f, s.events])));
    expect(Object.values(got).flat()).toHaveLength(26);
    expect(SRC.filter(([, t]) => /\.on(?:pointer|mouse)(?:enter|over|move|leave|out)\s*=|\.on(?:focus|focusin|focusout|blur)\s*=|\bon(?:pointer|mouse)(?:enter|over|move|leave|out)\s*:/.test(t)).map(([f]) => f)).toEqual([]);
    // 내용을 띄우는 자리는 표 줄 H4(미리 강조)·S2(제자리 안내)뿐 — 나머지는 누름·알림 멈춤·보이는 내용 없음
    expect(Object.entries(SITES).filter(([, s]) => s.row === 'H4' || s.row === 'S2').map(([f]) => f)).toEqual(['src/app/app.ts', 'src/app/ctxmenu.ts']);
  });

  it('시간으로 닫기: setTimeout 자리가 표와 같고 setInterval은 0 — 저절로 닫히는 보이는 내용은 알림뿐이며 올림·초점이면 멈춘다(160차)', () => {
    const got: Record<string, number> = {};
    for (const [f, t] of SRC) {
      const n = t.match(/\bsetTimeout\(/g)?.length ?? 0;
      if (n) got[f] = n;
    }
    expect(got).toEqual(Object.fromEntries(Object.entries(TIMERS).map(([f, [n]]) => [f, n])));
    expect(SRC.filter(([, t]) => /\bsetInterval\(/.test(t)).map(([f]) => f)).toEqual([]);
    const dom = textOf('src/app/dom.ts');
    expect(dom).toMatch(/timer = over \|\| inside \? undefined : setTimeout\(close, ms\);/);
    expect(dom).toMatch(/on\('pointerenter', \(\) => \(over = true\)\);/);
    expect(dom).toMatch(/on\('focusin', \(\) => \(inside = true\)\);/);
  });

  it('스타일시트 올림·초점 규칙은 그 칸 자신의 꼴만(바탕·글 색·테두리·윤곽·그림자·밝기) — 다른 선언은 쌓임 하나(S3), 보이게 하는 선언(display·visibility·opacity·content·위치·크기) 0', () => {
    const rules = BLOCKS.filter((b) => b.sels.some((s) => PSEUDO.test(s)));
    const other: [string, string[]][] = [];
    for (const b of rules) {
      const props = b.decl.map(([p]) => p).filter((p) => !STATE_PROPS.has(p));
      if (props.length) other.push([b.sels.join(', '), props]);
    }
    expect(other).toEqual(CSS_STACK);
    expect([rules.length, rules.flatMap((b) => b.sels).filter((s) => PSEUDO.test(s)).length]).toEqual([35, 45]);
  });

  it('Esc 차례: 끌기 취소 → 대화 상자 → 메뉴 → 여는 중 → 개체 측정 → 두 점 측정(코어: Tab 돌리기 풀기 → 편 큐브 접기 → 점·미리 보기 지움) → 측정 끝 → 여러 개 고르기 → 고르기 풀기', () => {
    const order = (text: string, steps: string[]): number[] => {
      let at = 0;
      return steps.map((s) => (at = text.indexOf(s, at)));
    };
    const app = order(textOf('src/app/app.ts'), [
      "if (action === 'escape' && this.tweakTool?.dragging) {",
      "case 'escape':",
      'if (closeDialog()) break;',
      'if (closeMenu()) break;',
      'if (this.loading) {',
      'if (this.entMeasuring) {',
      'if (v.measurePointCount > 0 && v.handleKey(ev)) return;',
      'this.toggleMeasure(false);',
      'if (this.multiPick) {',
      'if (this.clearSelection()) break;',
    ]);
    expect(app.every((i, k) => i > (app[k - 1] ?? -1))).toBe(true);
    const core = order(CORE, ["e.key === 'Escape' && this.tabCycleEsc(e)", "e.key === 'Escape' && this.cubeZoom) this.foldCube('escape')", "e.key === 'Escape' && (this.measurePts.length || (this.measuring && this.tracker?.size))) this.clearMeasure();"]);
    expect(core.every((i, k) => i > (core[k - 1] ?? -1))).toBe(true);
  });
});

/** 마우스 포인터 사건(jsdom에 PointerEvent가 없으면 MouseEvent에 포인터 칸을 붙인다 — aim.ts touchPointerEvent 꼴, 올림은 단추 0) */
function mouse(type: string, x: number, y: number, buttons = 0): MouseEvent {
  const init = { bubbles: type !== 'pointerleave', cancelable: true, composed: true, clientX: x, clientY: y, button: type === 'pointermove' ? -1 : 0, buttons };
  const e = typeof PointerEvent === 'function' ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init);
  if (typeof PointerEvent !== 'function') {
    Object.defineProperty(e, 'pointerId', { value: 1 });
    Object.defineProperty(e, 'pointerType', { value: 'mouse' });
    Object.defineProperty(e, 'isPrimary', { value: true });
  }
  return e;
}
const inside = (r: MeasureLabelRect, p: { x: number; y: number }): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

describe('239차: 실제 사건으로 본 (가)(나)(다)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    closeMenu();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('H1·H3 실제 코어: 첫 점 뒤 올린 커서의 스냅 이름·거리 글상자는 포인터 밑을 가리지 않고, 10분 뒤에도 그대로, 따라 움직이며, 캔버스를 떠나면 거두고, Esc가 지운다', () => {
    const w = new StepText();
    w.product('c', [cube(w, 10).solid], w.context());
    const j = jsdomViewer();
    try {
      const v = j.viewer;
      const sc = stepToScene(w.bytes());
      v.setScene(sc);
      // 앞에서(화면 가로 = X, 세로 = Z)
      v.setView('front', false);
      v.fit(false);
      v.renderNow();
      const ex = stepEdgeIndex(sc);
      v.setMeasureSnap(measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, null, true));
      v.setMeasureMode(true);
      const cv = v.canvas;
      const at = (p: readonly number[]) => v.project(p, { occlusion: true })!;
      const fire = (type: string, x: number, y: number, buttons = 0): void => void cv.dispatchEvent(mouse(type, x, y, buttons));
      // 첫 점: 앞면 왼쪽 아래 꼭짓점
      const a = at([0, 0, 0]);
      fire('pointermove', a.x, a.y);
      fire('pointerdown', a.x, a.y, 1);
      fire('pointerup', a.x, a.y);
      v.renderNow();
      expect(v.measurePointCount).toBe(1);
      // 커서를 앞면 오른쪽 위 꼭짓점으로: 스냅 이름(코어 미리 보기)과 두 점 가운데 거리 글상자
      const b = at([10, 0, 10]);
      fire('pointermove', b.x, b.y);
      v.renderNow();
      expect(v.measureHoverSnap).toBeTruthy();
      const box = v.measureLabelRect!;
      expect(box).toBeTruthy();
      expect(inside(box, b)).toBe(false);
      // (다) 시간으로 사라지지 않음
      vi.advanceTimersByTime(600_000);
      v.renderNow();
      expect(v.measureLabelRect).toEqual(box);
      expect(v.measureHoverSnap).toBeTruthy();
      // (나) 따라 움직임: 포인터를 글상자 가운데로 옮기면 그 자리가 둘째 점 미리 보기라 글상자도 옮겨 간다(그 자리에 남지 않음)
      fire('pointermove', box.x + box.width / 2, box.y + box.height / 2);
      v.renderNow();
      expect(v.measureLabelRect).not.toEqual(box);
      // 올림 걷힘: 캔버스를 떠나면 미리 보기·글상자를 거둔다(찍은 첫 점은 그대로)
      fire('pointermove', b.x, b.y);
      cv.dispatchEvent(mouse('pointerleave', b.x, b.y));
      v.renderNow();
      expect([v.measurePointCount, v.measureHoverSnap, v.measureLabelRect]).toEqual([1, null, null]);
      // (가) Esc: 다시 올린 뒤 Esc 하나가 점·미리 보기·글상자를 지운다(포인터·초점을 옮기지 않음)
      fire('pointermove', b.x, b.y);
      v.renderNow();
      expect(v.measureLabelRect).toEqual(box);
      expect(v.handleKey(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))).toBe(true);
      v.renderNow();
      expect([v.measurePointCount, v.measureHoverSnap, v.measureLabelRect]).toEqual([0, null, null]);
    } finally {
      j.restore();
    }
  });

  it('H4 겹친 것 고르기 줄 미리 강조: 초점·마우스가 간 줄을 강조하고, 메뉴 밖으로 나가도·10분 뒤에도 남고, Esc가 메뉴를 닫으며 되돌린다', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const rows: PickRow[] = ['평면', '부품 A', '부품 B'].map((file, i) => ({ pick: {} as Pick3d, index: i, key: `n:${i}`, label: i ? '부품' : '면', file, checked: false }));
    const seen: (string | null)[] = [];
    openPickList({ x: 40, y: 40 }, { rows, multi: false, choose: () => {}, preview: (r) => void seen.push(r ? r.file : null) });
    const menu = document.querySelector<HTMLElement>('.menu')!;
    const items = [...menu.querySelectorAll<HTMLElement>('.menu-item')];
    expect(items).toHaveLength(3);
    expect(seen).toEqual(['평면']);
    // 마우스가 셋째 줄에 오르면 초점도 그 줄로(강조 줄과 초점 줄이 하나)
    items[2]!.dispatchEvent(mouse('pointermove', 50, 90));
    expect([document.activeElement, seen.at(-1)]).toEqual([items[2], '부품 B']);
    // 메뉴 밖으로 나가도 그대로(떠남에 지우지 않음)
    menu.dispatchEvent(mouse('pointerleave', 400, 400));
    document.body.dispatchEvent(mouse('pointermove', 400, 400));
    vi.advanceTimersByTime(600_000);
    expect([document.querySelector('.menu'), seen.at(-1), seen.length]).toEqual([menu, '부품 B', 2]);
    // Esc가 메뉴를 닫고 지금 고른 것의 강조로 되돌린다(null)
    items[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect([document.querySelector('.menu'), seen]).toEqual([null, ['평면', '부품 B', null]]);
  });
});

describe('239차: 238차 알림 자리 — 측정 띠 높이를 따라(1.4.13 밖, 띠와 겹침 고침)', () => {
  let observers: (() => void)[] = [];
  const saved = globalThis.ResizeObserver;
  beforeEach(() => {
    observers = [];
    globalThis.ResizeObserver = class {
      constructor(cb: () => void) {
        observers.push(cb);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = saved;
    document.body.replaceChildren();
  });

  const box = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) }) as DOMRect;

  it('스타일시트: 알림 칸 bottom 넷이 max(못 박은 자리 68·112px, 띠 위 끝 변수) — 띠가 낮으면 그대로, 변수가 없으면(조각을 받기 전) 못 박은 자리', () => {
    for (const [media, sel, value] of TOAST_RULES) {
      const b = BLOCKS.find((x) => x.media === media && x.sels.includes(sel) && x.decl.some(([p]) => p === 'bottom'));
      expect(b?.decl.find(([p]) => p === 'bottom')?.[1], `${media} ${sel}`).toBe(value);
    }
  });

  it('LabelAvoid가 띠 위 끝 + 6px를 3D 보기 변수로: 세 줄 측정 글(띠 위 끝 76 → 82)·네 줄(94 → 100)은 띠 위로, 두 줄(62 → 68)은 지금 자리와 같고, 띠를 숨기면 변수를 지운다', () => {
    const view = document.createElement('section');
    view.className = 'view';
    const canvas = document.createElement('canvas');
    const host = document.createElement('div');
    host.append(canvas);
    const bar = document.createElement('div');
    bar.className = 'measure-bar';
    const toasts = document.createElement('div');
    toasts.className = 'toasts';
    view.append(host, bar, toasts);
    document.body.append(view);
    // 3D 보기(캔버스) 아래 끝 786, 띠는 아래에서 10px 띄움
    canvas.getBoundingClientRect = () => box(0, 86, 375, 700);
    let barH = 66;
    bar.getBoundingClientRect = () => (barH ? box(9.7, 786 - 10 - barH, 355.6, barH) : box(0, 0, 0, 0));
    const viewer = { canvas, viewCubeRect: null, setMeasureLabelAvoid: () => {}, onViewCubeExpandedChange: () => () => {} };
    new LabelAvoid(viewer, view);
    const at = (): string => view.style.getPropertyValue('--toast-over-bar');
    expect(at()).toBe('82px');
    // 띠가 커지면(잠금 안내 한 줄 더) 크기 바뀜 알림으로 다시
    barH = 84;
    for (const cb of observers) cb();
    expect(at()).toBe('100px');
    // 두 줄 띠(위 끝 62)면 68 — 못 박은 자리와 같다(보통 화면 그대로)
    barH = 52;
    for (const cb of observers) cb();
    expect(at()).toBe('68px');
    // 띠를 숨기면(크기 0) 지운다
    barH = 0;
    for (const cb of observers) cb();
    expect(at()).toBe('');
  });
});
