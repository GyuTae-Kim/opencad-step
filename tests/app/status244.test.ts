// @vitest-environment jsdom
/**
 * 244차(WCAG 4.1.3 Status Messages — 재발 막기): 초점을 옮기지 않고 화면에 나타나는 상태 글(결과·진행·오류·찾은 수)은 화면 읽기에 알려져야 한다 —
 * role=status·role=alert·aria-live 칸 안에 들거나 같은 글을 그런 칸으로 알림(리드가 적어 둔 기준). 초점이 그 글로 옮겨 가는 것·사용자가 연 대화 상자 본문·
 * 너무 자주 바뀌는 칸(포인터를 따라 바뀜·백분율)은 셈 밖이고, 같은 글이 짧은 사이에 거듭 알려지면 고칠 거리.
 * - 감사 표(ROWS — README 개발 절 244차 문단): src 전체 .ts에서 상태 글을 쓰는 꼴 여섯(textContent·replaceChildren·innerHTML 대입, 'aria-live', role status·alert,
 *   알림 칸으로 보내는 say)을 파일마다 세어 표의 자리 수와 같다 — 새 자리가 생기면 표에 칸·갈래·알려지는가를 적어야 통과. 알림 칸을 띄우는 자리(toast·showError·fail)는
 *   243차 timing243의 셈(띄우는 자리 62 + 넘기는 자리 4)과 같은 수인지 그 시험도 읽어 견준다.
 * - 244차 고침: (F1) 이름 거르기 결과 수(「맞는 마디 {0}개 …」·「맞는 마디가 없습니다.」 — 다시 그린 본문의 새 줄이라 알리지 않았다)를 같은 글로 앱 알림 칸
 *   (상태 막대 안 role=status — 53차 「열었습니다」 칸)에 거르기 값이 바뀌어 다시 그렸을 때 한 번, (F2) 처음 화면 읽기 오류 칸은 알림 영역이 아니다(같은 글을 같은 차례 오류 알림
 *   role=alert가 알려 두 번 읽혔다), (F3) 패널 아래 띠(aria-live)는 만든 글이 그대로면 바꾸지 않는다(탭을 바꾸거나 다시 그릴 때마다 같은 고른 것을 다시 넣어 거듭 읽혔다 — 53차 측정 띠 글 칸 꼴).
 * - 실제 앱(StepApp — jsdom)·실제 패널(나무 조각): 사건(거르기 칸 input·Esc, 탭 누름, 열기 오류) 뒤 알림 칸에 같은 글이 한 번만 드는지 MutationObserver로 센다.
 * src를 소스 글로 읽는다(ci-guard 12번 — 상태 글을 쓰는 줄·알림 칸 줄을 바꾸면 이 시험도).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDoc, type ProductNode, type StepDoc } from '../../src/app/doc';
import type { ParseResult } from '../../src/app/protocol';
import { Panel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import * as PV from '../../src/app/panelview';
import { Fmt } from '../../src/app/display';
import { StepApp } from '../../src/app/app';

const ROOT = join(__dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
/** src 아래 .ts 전부(저장소 기준 경로, 이름 차례) */
function tsFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir))
    .sort()
    .flatMap((f) => (statSync(join(ROOT, dir, f)).isDirectory() ? tsFiles(`${dir}/${f}`) : f.endsWith('.ts') ? [`${dir}/${f}`] : []));
}
const SRC: [file: string, text: string][] = tsFiles('src').map((f) => [f, read(f)]);
const textOf = (file: string): string => SRC.find(([f]) => f === file)?.[1] ?? '';
/** 줄머리 주석(/** … *\/·//)을 뺀 코드 */
const codeOf = (t: string): string => t.replace(/^\s*\/\*[\s\S]*?\*\//gm, '').replace(/^\s*\/\/.*$/gm, '');

const APP = 'src/app/app.ts';
const PANEL = 'src/app/panel.ts';
const PVIEW = 'src/app/panelview.ts';
const KEYSNAP = 'src/app/keysnap.ts';
const BAR = 'src/app/explodebar.ts';
const SECT = 'src/app/sectionbar.ts';
const DOM = 'src/app/dom.ts';

/** 알림 칸(화면 읽기 프로그램이 바뀐 글을 알리는 칸) */
const LIVE = '[role=status], [role=alert], [role=log], [aria-live]:not([aria-live=off])';

// ───────────────────────── 감사 표 ─────────────────────────

/** 상태 글을 쓰는 꼴 */
type Pat = 'text' | 'children' | 'html' | 'live' | 'role' | 'say';
const PATS: Record<Pat, RegExp> = {
  text: /\.textContent\s*=(?!=)/g,
  children: /\.replaceChildren\(/g,
  html: /\.innerHTML\s*=(?!=)/g,
  live: /'aria-live'/g,
  role: /\brole: [^,}]*'(?:status|alert)'|setAttribute\('role', '(?:status|alert)'/g,
  say: /\.say\?\.\(|\bthis\.say\(/g,
};
/**
 * 알려지는가 — toast·status·alert·live: 그 칸이 알림 칸, same: 같은 글을 다른 알림 칸이 알림(이 칸은 알리지 않음 — 두 번 읽지 않게),
 * none: 알려지지 않음(둔 것 — 까닭), out: 셈 밖(포인터를 따라 바뀜·백분율·초점 칸의 값·이름표·정적·사용자가 고른 탭 본문)
 */
type Heard = 'toast' | 'status' | 'alert' | 'live' | 'same' | 'none' | 'out';
interface Row {
  id: string;
  what: string;
  kind: '결과' | '진행' | '오류' | '수' | '안내' | '이름표' | '정적';
  heard: Heard;
  /** 244차 고침(F1 거르기 결과 수·F2 처음 화면 오류 칸·F3 아래 띠 거듭) */
  fix?: 'F1' | 'F2' | 'F3';
  /** 쓰는 자리 수(「파일 꼴」 → 수) */
  sites: Record<string, number>;
  /** 근거 원문(파일·정규식 — 하나 이상) */
  proof: [file: string, re: RegExp][];
}
const ROWS: Row[] = [
  {
    id: 'L1',
    what: '알림 칸(.toasts aria-live polite — 알림마다 오류 role=alert·그 밖 role=status) — 띄우는 자리 62(243차 17갈래)',
    kind: '결과',
    heard: 'toast',
    sites: { [`${APP} live`]: 1, [`${APP} role`]: 1 },
    proof: [
      [APP, /this\.toasts = h\('div', \{ class: 'toasts', 'aria-live': 'polite' \}\);/],
      [APP, /role: kind === 'error' \? 'alert' : 'status'/],
      [DOM, /failing\.get\(msg\)\?\.\(\);/],
    ],
  },
  {
    id: 'L2',
    what: '화면 읽기 전용 칸(상태 막대 안 sr-only role=status) — 「{0}을(를) 열었습니다.」(53차)·앱 say(244차 — 거르기 결과 수)',
    kind: '결과',
    heard: 'status',
    sites: { [`${APP} role`]: 1, [`${APP} children`]: 2 },
    proof: [
      [APP, /private readonly sayEl = h\('div', \{ class: 'sr-only', role: 'status' \}\);/],
      [APP, /this\.sayEl\.replaceChildren\(`\$\{isolateText\(name\)\}을\(를\) 열었습니다\.`\);/],
      [APP, /\n {2}say\(text: string\): void \{\n {4}this\.sayEl\.replaceChildren\(text\);\n {2}\}\n/],
      [APP, /const status = h\('footer', \{ class: 'statusbar' \}, this\.statusDoc, this\.statusSnap, this\.statusSel, this\.sayEl\);/],
    ],
  },
  {
    id: 'L3',
    what: '여는 중 덮개 단계 칸(role=status) — 단계가 바뀔 때만, 숨었던 카드는 빈 칸을 그린 뒤 첫 글(157차)',
    kind: '진행',
    heard: 'status',
    sites: { [`${APP} role`]: 1, [`${APP} children`]: 2 },
    proof: [
      [APP, /this\.busyStage = h\('div', \{ class: 'busy-stage', role: 'status' \}\);/],
      [APP, /if \(this\.busyStage\.dataset\.stage !== l\.stage\) \{/],
    ],
  },
  {
    id: 'L4',
    what: '측정 띠 글 칸(aria-live polite) — 거리·dx·dy·dz·잠금 안내·면 치수·고른 부품 이름·안내, 만든 글이 그대로면 바꾸지 않음(53차)',
    kind: '결과',
    heard: 'live',
    sites: { [`${APP} live`]: 1, [`${APP} children`]: 1 },
    proof: [
      [APP, /this\.measureText = h\('div', \{ class: 'mb-text', 'aria-live': 'polite' \}\);/],
      [APP, /if \(src !== this\.barSrc\) \{\s*this\.barSrc = src;\s*this\.measureText\.replaceChildren\(\.\.\.t\.childNodes\);/],
    ],
  },
  {
    id: 'L5',
    what: '격리 띠 이름표·이름 칸(role=status — 145차) — 격리가 바뀔 때만 맞춤',
    kind: '결과',
    heard: 'status',
    sites: { [`${APP} role`]: 2, [`${APP} text`]: 2 },
    proof: [
      [APP, /this\.isoText = h\('span', \{ class: 'iso-text', role: 'status', 'data-i18n-ui': '' \}\);/],
      [APP, /this\.isoLabel = h\('span', \{ class: 'iso-label', role: 'status' \}, '이것만 보기'\);/],
    ],
  },
  {
    id: 'L6',
    what: '패널 아래 띠(aria-live — 측정·여러 개 띠가 보이는 동안 off, 53·147차) — 고른 것·점·법선·치수·측정 결과. 244차: 만든 글이 그대로면 바꾸지 않음',
    kind: '결과',
    heard: 'live',
    fix: 'F3',
    sites: { [`${PANEL} live`]: 2, [`${PANEL} children`]: 1 },
    proof: [
      [PANEL, /this\.foot = h\('div', \{ class: 'panel-foot', 'aria-live': 'polite', hidden: true \}\);/],
      [PANEL, /const src = lines\.map\(\(l\) => l\.outerHTML\)\.join\(''\);\s*if \(src === this\.footSrc\) return;\s*this\.footSrc = src;/],
      [APP, /this\.panel\.footLive\(!\(mode === 'measure' \|\| mode === 'multi' \|\| \(!!mode && \(!!this\.narrow\?\.matches \|\| this\.touch\)\)\)\);/],
    ],
  },
  {
    id: 'L7',
    what: '가상 커서 알림 칸(aria-live polite — 후보·찍은 점·측정·고름·잠금, 같은 프레임 두 글은 한 글로 216차, 언어를 바꾸면 비움 230차) + 마우스 Tab 돌리기 차례(118차)',
    kind: '결과',
    heard: 'live',
    sites: { [`${KEYSNAP} live`]: 1, [`${KEYSNAP} text`]: 3, [`${APP} text`]: 1 },
    proof: [
      [KEYSNAP, /const live = h\('div', \{ class: 'sr-only', 'aria-live': 'polite', 'data-i18n-skip': '' \}\);/],
      [KEYSNAP, /live\.textContent = lead && a\.reason === 'refresh' \? lead \+ gap \+ t : t;/],
      [APP, /if \(text === this\.hoverSnapText\) return;/],
      [APP, /if \(c\) this\.keySnap!\.live\.textContent = c\.said;/],
    ],
  },
  {
    id: 'L8',
    what: '간섭 검사 오류 줄(role=alert — 워커 알림으로 갈아 끼울 때만 143차, 패널이 그 탭을 안 보이면 알림 칸 오류만 156차)',
    kind: '오류',
    heard: 'alert',
    sites: { [`${PVIEW} role`]: 1 },
    proof: [
      [PVIEW, /role: fresh && 'alert'/],
      [PANEL, /if \(err && !\(this\.open && d\?\.panelTab === 'tree'\)\) this\.host\.toast\?\.\(\['검사하지 못했습니다:', err\], 'error', 9000\);/],
    ],
  },
  {
    id: 'L9',
    what: '처음 화면 읽기 오류 칸 — 같은 글을 같은 차례 오류 알림(L1 role=alert)이 알림. 244차: 알림 영역이 아님(남아 보이는 칸 — 243차 E1 「다른 자리」)',
    kind: '오류',
    heard: 'same',
    fix: 'F2',
    sites: { [`${APP} children`]: 1 },
    proof: [
      [APP, /this\.startError = h\('div', \{ class: 'start-error', hidden: true, 'data-i18n-ui': '' \}\);/],
      [APP, /const close = this\.toast\(parts, 'error', 9000, action\);\s*this\.updateAll\(\);/],
    ],
  },
  {
    id: 'N1',
    what: '이름 거르기 결과 수(「맞는 마디 {0}개 (조상 마디와 함께 보입니다)」·1개 열쇠·「맞는 마디가 없습니다.」) — 244차: 같은 글을 L2로(거르기 값이 바뀌어 다시 그렸을 때 한 번)',
    kind: '수',
    heard: 'status',
    fix: 'F1',
    sites: { [`${PANEL} say`]: 1 },
    proof: [
      [PANEL, /this\.filterNote = filtering \? \(res\.matches \? `맞는 마디 \$\{fmtCount\(res\.matches\)\}개 \(조상 마디와 함께 보입니다\)` : '맞는 마디가 없습니다\.'\) : '';/],
      [PANEL, /const filterInfo = this\.filterNote \? h\('p', \{ class: 'hint filter-info' \}, this\.filterNote\) : null;/],
      [PANEL, /if \(input\.value\.trim\(\) !== was\.trim\(\) && this\.doc === d && d\.panelTab === 'tree' && this\.filterNote\) this\.host\.say\?\.\(this\.filterNote\);/],
      [PANEL, /\n {2}say\?\(text: string\): void;\n/],
    ],
  },
  {
    id: 'N2',
    what: '상태 막대 고른 것·측정 결과·잠금 안내 — 같은 글을 L4(띠가 보이는 화면)·L6(아래 띠)이 알림(53차 — 두 번 읽지 않게)',
    kind: '결과',
    heard: 'same',
    sites: { [`${APP} children`]: 1 },
    proof: [[APP, /this\.statusSel = h\('div', \{ class: 'status-sel', 'data-i18n-ui': '' \}\);/]],
  },
  {
    id: 'N3',
    what: '상태 막대 문서 칸 — 여는 중·화면에 올리는 중 백분율(자주 바뀜 — L3·진행 막대·열기 끝 L2), 문서 요약·빈 화면 안내(정적)',
    kind: '진행',
    heard: 'out',
    sites: { [`${APP} html`]: 1 },
    proof: [[APP, /this\.statusDoc = h\('div', \{ class: 'status-doc' \}\);/]],
  },
  {
    id: 'N4',
    what: '상태 막대·측정 띠 스냅 이름 — 포인터를 따라 바뀜(Tab 돌리기 차례만 L7)',
    kind: '결과',
    heard: 'out',
    sites: { [`${APP} children`]: 1, [`${APP} text`]: 1 },
    proof: [[APP, /this\.measureHoverEl = h\('span', \{ class: 'mb-hover', 'aria-hidden': 'true'/]],
  },
  {
    id: 'N5',
    what: '여는 중 덮개 백분율(진행 막대 aria-valuenow)·파일 이름(정적)',
    kind: '진행',
    heard: 'out',
    sites: { [`${APP} text`]: 2 },
    proof: [[APP, /this\.busyBar\.parentElement\?\.setAttribute\('aria-valuenow'/]],
  },
  {
    id: 'N6',
    what: '분해 막대 값 글 — 밀대(초점 칸) aria-valuetext와 같은 글',
    kind: '정적',
    heard: 'out',
    sites: { [`${APP} text`]: 1 },
    proof: [[APP, /this\.explodeSlider\.setAttribute\('aria-valuetext', pct\);/]],
  },
  {
    id: 'N7',
    what: '분해 막대 단계 글(「단계 {0}/{1}」) — 둠: 밀대를 움직일 때 함께 바뀌는 보조 표시(밀대 값이 초점 칸으로 알려짐, 칸으로 알리면 밀대 값과 겹침)',
    kind: '진행',
    heard: 'none',
    sites: { [`${BAR} text`]: 1 },
    proof: [[BAR, /this\.stage = h\('span', \{ class: 'explode-stage', hidden: true \}\);/]],
  },
  {
    id: 'N8',
    what: '분해 거리 칸 오류 설명(aria-describedby — 242차) — 같은 글을 L1(경고)이 알림',
    kind: '오류',
    heard: 'same',
    sites: { [`${BAR} text`]: 2 },
    proof: [[BAR, /this\.distInput\.setAttribute\('aria-describedby', this\.distError\.id\);/]],
  },
  {
    id: 'N9',
    what: '분해 거리 칸·단면 막대 이름표·단위',
    kind: '이름표',
    heard: 'out',
    sites: { [`${BAR} text`]: 2, [`${SECT} text`]: 2 },
    proof: [[SECT, /this\.label\.textContent = st\.axis \? `\$\{st\.axis\.toUpperCase\(\)\} =` : '위치';/]],
  },
  {
    id: 'N10',
    what: '속성 탭 곡면 적분 진행(입체마다 바뀜 — 다 되면 값이 같은 줄에)',
    kind: '진행',
    heard: 'out',
    sites: { ['src/app/propsview.ts text']: 1 },
    proof: [['src/app/propsview.ts', /v\.textContent = `곡면 적분 계산 중\(입체/]],
  },
  {
    id: 'N11',
    what: '간섭 검사 진행(「검사 중…」·「겹친 부피 계산 중…」 — 진행마다 다시 그림, 결과 수는 L1·오류는 L8)',
    kind: '진행',
    heard: 'out',
    sites: {},
    proof: [
      [PVIEW, /h\('span', \{\}, '검사 중…'\)/],
      [APP, /this\.toast\(n \? \(inside \? `간섭 \$\{fmtCount\(n\)\}쌍을 찾았습니다/],
    ],
  },
  {
    id: 'N12',
    what: '패널 탭 본문의 「없음」·안내 글 — 사용자가 고른 탭 본문(탭에 초점)',
    kind: '안내',
    heard: 'out',
    sites: {},
    proof: [
      [PANEL, /'이 파일에는 제품 구조 정보가 없습니다\.'/],
      [PANEL, /this\.body\.setAttribute\('aria-labelledby', `tab-\$\{d\.panelTab\}`\);/],
    ],
  },
  {
    id: 'N13',
    what: '나무 「{0}줄 가운데 처음 {1}줄만 보입니다」 — 「더 보기」 뒤 결과는 늘어난 줄',
    kind: '안내',
    heard: 'out',
    sites: {},
    proof: [[PANEL, /줄 가운데 처음 \$\{fmtCount\(rows\.length\)\}줄만 보입니다/]],
  },
  {
    id: 'N14',
    what: '도구 막대 단추 글(이름 — 상태는 aria-pressed)',
    kind: '이름표',
    heard: 'out',
    sites: { ['src/app/toolbar.ts text']: 1 },
    proof: [['src/app/toolbar.ts', /if \(span && span\.textContent !== label\) span\.textContent = label;/]],
  },
  {
    id: 'N15',
    what: '문서 이름·최근 문서 목록·앱 틀',
    kind: '정적',
    heard: 'out',
    sites: { [`${APP} text`]: 1, [`${APP} children`]: 2 },
    proof: [[APP, /root\.replaceChildren\(title, this\.toolbar\.el, workspace, status, this\.fileInput\);/]],
  },
  {
    id: 'N16',
    what: '꾸밈 SVG·h() 도우미·패널 비우기',
    kind: '정적',
    heard: 'out',
    sites: { [`${DOM} text`]: 1, [`${DOM} html`]: 2, [`${BAR} html`]: 1, [`${SECT} html`]: 1, ['src/app/aim.ts html']: 1, [`${PANEL} html`]: 3 },
    proof: [[DOM, /else if \(k === 'text'\) el\.textContent = String\(v\);/]],
  },
  {
    id: 'N17',
    what: '구조화 자료(JSON-LD)',
    kind: '정적',
    heard: 'out',
    sites: { ['src/app/i18n.ts text']: 1 },
    proof: [['src/app/i18n.ts', /graph\.textContent=JSON\.stringify\(existing\)/]],
  },
];

/** 알림 칸을 띄우는 꼴(243차 timing243 LAUNCH와 같은 꼴) */
const LAUNCH = /(?<![\w.])(?:(?:this\.)?host\.toast(?:\?\.)?\(|this\.toast\(|this\.showError\(|(?:this|app)\.fail\('|toast\(CONTEXT_)/g;

describe('244차: 상태 글을 쓰는 자리 감사 표(WCAG 4.1.3)', () => {
  it('src의 상태 글 쓰는 꼴 여섯 54자리가 파일·꼴마다 표 26줄의 자리 수와 같다(새 자리면 표에 넣어야 통과) — 알리는 칸 9·같은 글을 다른 칸이 3·둔 것 1·셈 밖 13', () => {
    const got: Record<string, number> = {};
    for (const [f, t] of SRC)
      for (const [p, re] of Object.entries(PATS)) {
        const n = [...codeOf(t).matchAll(re)].length;
        if (n) got[`${f} ${p}`] = n;
      }
    const want: Record<string, number> = {};
    for (const r of ROWS) for (const [k, n] of Object.entries(r.sites)) want[k] = (want[k] ?? 0) + n;
    expect(got).toEqual(want);
    const sum = (rs: Row[]): number => rs.reduce((s, r) => s + Object.values(r.sites).reduce((a, b) => a + b, 0), 0);
    expect([ROWS.length, sum(ROWS)]).toEqual([26, 54]);
    const by = (h: Heard): string[] => ROWS.filter((r) => r.heard === h).map((r) => r.id);
    expect([by('toast'), by('status'), by('alert'), by('live'), by('same'), by('none'), by('out').length]).toEqual([
      ['L1'],
      ['L2', 'L3', 'L5', 'N1'],
      ['L8'],
      ['L4', 'L6', 'L7'],
      ['L9', 'N2', 'N8'],
      ['N7'],
      13,
    ]);
    expect(ROWS.filter((r) => r.fix).map((r) => [r.id, r.fix])).toEqual([
      ['L6', 'F3'],
      ['L9', 'F2'],
      ['N1', 'F1'],
    ]);
    // 그 밖 알림 꼴(log·marquee·timer 역할, aria-atomic·relevant·busy)은 없다 — 새로 생기면 표에
    expect(SRC.filter(([, t]) => /role: [^,}]*'(?:log|marquee|timer)'|setAttribute\('role', '(?:log|marquee|timer)'|'aria-(?:atomic|relevant|busy)'/.test(codeOf(t))).map(([f]) => f)).toEqual([]);
  });

  it('줄마다 근거 원문(알림 칸 만들기·거듭 막기·셈 밖 까닭), 알림 칸을 띄우는 자리는 243차 셈과 같은 66(띄우는 자리 62 + 넘기는 자리 4)', () => {
    for (const r of ROWS) {
      expect(r.proof.length, r.id).toBeGreaterThan(0);
      for (const [file, re] of r.proof) expect(re.test(textOf(file)), `${r.id} ${file} ${re}`).toBe(true);
    }
    const n = SRC.reduce((s, [, t]) => s + [...codeOf(t).matchAll(LAUNCH)].length, 0);
    expect(n).toBe(66);
    const t243 = read('tests/app/timing243.test.ts');
    expect(t243).toContain('.toEqual([17, 62, 11, 51]);');
    expect(t243).toMatch(/const PASS: Record<string, \[count: number, proof: RegExp\[\]\]> = \{\s*\[`\$\{APP\} toast`\]: \[\s*4,/);
  });
});

// ───────────────────────── 실제 앱·패널 ─────────────────────────

let app: StepApp;
let root: HTMLElement;
beforeAll(() => {
  root = document.createElement('div');
  document.body.append(root);
  app = new StepApp(root);
});
afterAll(() => root.remove());
afterEach(() => {
  for (const x of [...root.querySelectorAll<HTMLButtonElement>('.toasts button.icon-btn[aria-label="알림 닫기"]')]) x.click();
  document.body.querySelectorAll(':scope > aside.panel').forEach((p) => p.remove());
  vi.useRealTimers();
});

/** 상태 막대 안 화면 읽기 전용 칸(앱 sayEl) */
const sayEl = (): HTMLElement => root.querySelector<HTMLElement>('footer.statusbar > .sr-only[role="status"]')!;

/** 뿌리 → 모듈 둘 → 모듈마다 부품 셋(자리 이름 p1…) */
function treeDoc(): StepDoc {
  let k = 0;
  const part = (m: number, p: number): ProductNode => ({ name: `part-${m}-${p}`, productId: `pp-${m}-${p}`, instance: `p${p}`, meshIds: [`mesh-${k++}`], children: [] });
  const mod = (m: number): ProductNode => ({ name: `mod-${m}`, productId: `mod-${m}`, instance: `m${m}`, meshIds: [], children: [1, 2, 3].map((p) => part(m, p)) });
  const products = [{ name: 'asm', productId: 'asm', meshIds: [], children: [mod(1), mod(2)] }];
  return createDoc('tree.stp', 1, { scene: { meshes: [], lines: [], meta: { products } }, ms: 1 } as unknown as ParseResult);
}

/** 실제 패널(나무 조각 — 앱처럼 넣음). 호스트의 say는 실제 앱의 say(앱 알림 칸), 나머지는 아무것도 하지 않음 */
function mountPanel(d: StepDoc): Panel {
  const target: Record<string, unknown> = {
    measuring: false,
    measureKind: 'points',
    touch: false,
    multiPick: false,
    fmt: new Fmt('mm'),
    isVisible: () => true,
    groups: () => [],
    say: (t: string) => (app as unknown as { say?(t: string): void }).say?.(t),
  };
  const host = new Proxy(target, { get: (t, k) => (k in t ? t[k as string] : () => {}) }) as unknown as PanelHost;
  const panel = new Panel(host);
  panel.kit = { ...TV, ...PV };
  document.body.append(panel.el);
  panel.show(d);
  panel.setOpen(true);
  return panel;
}

/** 칸에 글이 든 바뀜 수(MutationObserver — 넣은 마디가 있는 기록) */
function watch(el: Element): () => number {
  const mo = new MutationObserver(() => {});
  mo.observe(el, { childList: true, subtree: true, characterData: true });
  return () => mo.takeRecords().filter((r) => r.addedNodes.length > 0 || r.type === 'characterData').length;
}

describe('244차: 실제 앱 — 알림 칸', () => {
  it('문서 없는 앱의 알림 칸은 일곱(처음 화면 오류 칸은 빠짐 — 244차), 상태 막대 안 화면 읽기 전용 칸이 하나', () => {
    expect([...root.querySelectorAll<HTMLElement>(LIVE)].map((el) => el.classList[0])).toEqual(['busy-stage', 'iso-label', 'iso-text', 'mb-text', 'toasts', 'panel-foot', 'sr-only']);
    expect(sayEl().textContent).toBe('');
  });

  it('F2 열기 오류(문서 없음): 같은 글을 알리는 칸은 오류 알림(role=alert) 하나 — 처음 화면 오류 칸은 같은 글로 남아 보이되 알림 영역이 아님', () => {
    const parts = ['a.stp: 파일을 열지 못했습니다.', '파일이 비어 있습니다.'];
    (app as unknown as { showError(parts: string[]): () => void }).showError(parts);
    const msg = parts.join(' ');
    // 그 글을 품은 가장 안쪽 알림 칸(바깥 칸은 안쪽 칸이 품으면 뺀다)
    const said = [...root.querySelectorAll<HTMLElement>(LIVE)].filter((el) => el.textContent?.includes(parts[0]!) && ![...el.querySelectorAll(LIVE)].some((x) => x.textContent?.includes(parts[0]!)));
    expect(said.map((el) => [el.className, el.getAttribute('role'), el.textContent])).toEqual([['toast error', 'alert', msg]]);
    const start = root.querySelector<HTMLElement>('.start-error')!;
    expect([start.hidden, start.textContent, start.getAttribute('role'), start.closest(LIVE)]).toEqual([false, msg, null, null]);
  });
});

describe('244차: 실제 패널 — 이름 거르기 결과 수(F1)·아래 띠 거듭(F3)', () => {
  it('F1 거르기 칸에 친 글로 다시 그린 뒤 결과 수가 앱 알림 칸에 보이는 글과 같은 글로 한 번 — 다시 그리기·같은 값·Esc로 지움은 알리지 않음', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const panel = mountPanel(treeDoc());
    const heard = watch(sayEl());
    const input = () => panel.el.querySelector<HTMLInputElement>('.tree-filter')!;
    const info = () => panel.el.querySelector('.filter-info')?.textContent ?? null;
    const type = (v: string) => {
      input().value = v;
      input().dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(160);
    };
    input().focus();
    input().value = 'p2';
    input().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(159);
    expect([info(), heard()]).toEqual([null, 0]);
    vi.advanceTimersByTime(1);
    expect([info(), sayEl().textContent, heard(), document.activeElement === input()]).toEqual(['맞는 마디 2개 (조상 마디와 함께 보입니다)', '맞는 마디 2개 (조상 마디와 함께 보입니다)', 1, true]);
    // 다시 그려도(보이기 바뀜·고르기) 결과 글이 그대로면 알리지 않는다
    panel.onVisibility();
    panel.onSelection();
    expect([info(), heard()]).toEqual(['맞는 마디 2개 (조상 마디와 함께 보입니다)', 0]);
    // 같은 값(앞뒤 빈칸만 다름)을 다시 쳐도 알리지 않는다
    type(' p2 ');
    expect(heard()).toBe(0);
    // 한 개(단수 열쇠 그대로 — 보이는 글과 같은 글)·없음
    type('part-2-3');
    expect([info(), sayEl().textContent, heard()]).toEqual(['맞는 마디 1개 (조상 마디와 함께 보입니다)', '맞는 마디 1개 (조상 마디와 함께 보입니다)', 1]);
    type('zzz');
    expect([info(), sayEl().textContent, heard()]).toEqual(['맞는 마디가 없습니다.', '맞는 마디가 없습니다.', 1]);
    // Esc로 지우면 결과 줄이 빠지고 알리지 않는다(나무가 돌아옴)
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(160);
    expect([input().value, info(), heard()]).toEqual(['', null, 0]);
  });

  it('F3 아래 띠(aria-live): 고른 것이 그대로면 탭을 눌러 바꾸고 다시 그려도 글을 다시 넣지 않는다 — 고른 것이 바뀌면 한 번, 풀면 숨김', () => {
    const d = treeDoc();
    d.selKey = '0/0/1';
    const panel = mountPanel(d);
    const foot = panel.el.querySelector<HTMLElement>('.panel-foot')!;
    panel.onSelection();
    const first = foot.textContent;
    expect([foot.hidden, foot.getAttribute('aria-live'), first?.includes('part-1-2')]).toEqual([false, 'polite', true]);
    const heard = watch(foot);
    for (const t of ['props', 'info', 'tree']) panel.el.querySelector<HTMLElement>(`#tab-${t}`)!.click();
    panel.redraw();
    panel.onSelection();
    expect([heard(), foot.textContent]).toEqual([0, first]);
    d.selKey = '0/1/2';
    panel.onSelection();
    expect([heard(), foot.textContent?.includes('part-2-3')]).toEqual([1, true]);
    panel.onSelection();
    expect(heard()).toBe(0);
    d.selKey = null;
    panel.onSelection();
    expect([foot.hidden, foot.textContent]).toEqual([true, '']);
  });
});
