// @vitest-environment jsdom
/**
 * 243차(WCAG 2.2.1 Timing Adjustable — 재발 막기): 앱이 띄우고 시간이 지나면 저절로 닫는 내용은 읽고 누를 시간이 모자랄 수 있다. 기준(리드가 적어 둔 것):
 * (가) 누를 것(동작 단추)이 든 내용은 시간으로 닫지 않거나, 올림·초점이 든 동안 시간을 멈추고 떠난 뒤 처음 시간 이상을 다시 준다(동작을 다른 자리에서도 할 수 있으면 그 근거),
 * (나) 읽기만 하는 내용은 같은 글이 다른 자리에 남거나 올림·초점 동안 멈추면 통과(둘 다 아니고 오류·경고면 고칠 거리), (다) 닫는 데 시간을 쓰지 않는 길(✕·Esc).
 * 일이 끝나면 닫히는 것(여는 중 덮개·진행 막대)과 사건으로 닫히는 것(한도 셋에 밀림·다른 동작에 거둠)은 셈 밖.
 * - 시간으로 닫는 길은 알림 칸 공통 도우미 하나(dom.ts pushToast의 setTimeout(close, ms) 둘 — 처음·다시 셈): 앱 toast가 모든 알림을 그리로 넘기고(160차),
 *   올림·초점이면 멈추고 둘 다 떠나면 처음 시간을 다시 센다. 감사 표(ROWS — README 개발 절 243차 문단): 갈래 17, 띄우는 자리 62(동작 든 자리 11·읽기만 51), 어기는 것 0.
 * - 띄우는 자리 셈(소스 글): src 전체 .ts에서 알림을 부르는 꼴(this.toast·host.toast·showError·fail·문맥 안내 toast)을 파일마다 세어 ROWS의 자리 수 + 넘기는 자리(PASS)와 같다
 *   — 새 알림 자리가 생기면 갈래에 넣어야 통과. pushToast를 부르는 자리는 앱 toast 하나.
 * - 시계 자리(CLOCKS — setTimeout 자리마다 일, hover239 TIMERS와 같은 셈이어야 함 — 이 시험이 그 표도 읽어 견준다): 보이는 내용을 닫는 것은 pushToast 둘뿐,
 *   setInterval·animationend·transitionend·@keyframes 0, requestIdleCallback은 해석 워커 미리 띄우기 하나, 스타일시트 전환은 진행 막대 폭·손잡이 색뿐.
 * - 실제 앱 알림(StepApp toast·fail·showError·문맥 안내, jsdom·가짜 시계): 갈래·시간마다 끝 무렵에 올리거나 동작 단추(없으면 ✕)에 초점을 두면 10분이 지나도 남고(동작 단추도),
 *   떠나면 처음 시간을 다시 준 뒤 닫히며, ✕는 시간을 쓰지 않고 곧 닫는다. 받기 실패의 둘째 단추(새로 고침)도, 문맥 잃음 안내는 20시간이 지나도 남는다.
 * src를 소스 글로 읽는다(ci-guard 12번 — 알림 부르는 줄·시계 줄을 바꾸면 이 시험도).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { h } from '../../src/app/dom';
import { CONTEXT_RESTORED_MESSAGE, watchGraphicsContext } from '../../src/app/gpucontext';
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
const DOM = 'src/app/dom.ts';
const MAIN = 'src/app/main.ts';
const EXPT = 'src/app/explodetool.ts';
const BAR = 'src/app/explodebar.ts';
const PANEL = 'src/app/panel.ts';
const SECT = 'src/app/sectionbar.ts';
const PROPS = 'src/app/propsview.ts';
const GPU = 'src/app/gpucontext.ts';
const NOTICE = 'src/app/opennotice.ts';

// ───────────────────────── 감사 표 ─────────────────────────

type Kind = 'info' | 'warn' | 'error';
/** 판정 — 가: 동작이 든 내용(올림·초점이면 멈춤·떠나면 처음 시간), 나: 읽기만(멈춤 또는 다른 자리), keep: 20시간 넘음(되찾으면 닫음) */
type Verdict = '가' | '나' | 'keep';
interface Row {
  id: string;
  what: string;
  /** 종류·시간(ms) — 갈래 안에서 바뀌면 여럿 */
  times: [Kind, number][];
  /** 든 동작(단추 글) — null이면 읽기만 */
  action: string | null;
  /** 같은 글·같은 동작이 남는 다른 자리(없으면 null — 멈춤으로 통과) */
  elsewhere: string | null;
  verdict: Verdict;
  /** 띄우는 자리 수(「파일 부르는 꼴」 → 수) */
  sites: Record<string, number>;
  /** 근거 원문(파일·정규식·맞는 수 — 없으면 하나 이상) */
  proof: [file: string, re: RegExp, count?: number][];
}
const H = 60 * 60 * 1000;
const ROWS: Row[] = [
  {
    id: 'A1',
    what: '새 판 알림(사이트 키트가 같은 워커에 한 번)',
    times: [['info', 60_000]],
    action: '새로 고침',
    elsewhere: null,
    verdict: '가',
    sites: { [`${APP} toast`]: 1 },
    proof: [[APP, /this\.toast\('새 버전이 있습니다\.', 'info', 60_000, \{ label: '새로 고침', run: apply \}\)/]],
  },
  {
    id: 'A2',
    what: '열 때 받는 조각(내보내기·보기 링크·분해 넷·언어 사전)을 받지 못함 — 또 받지 못하면 같은 글 알림 하나에 「새로 고침」(225차)',
    times: [['warn', 8000]],
    action: '다시 시도',
    elsewhere: '같은 명령을 다시(내보내기 메뉴·보기 링크 단추·분해 단추·언어 메뉴)',
    verdict: '가',
    sites: { [`${APP} fail`]: 6, [`${MAIN} fail`]: 1 },
    proof: [
      [APP, /return \(e\) => loadFailed\(e, msg, retry, \(m, a\) => this\.toast\(m, 'warn', 8000, a\)\);/],
      [DOM, /tried\.has\(msg\) \? \{ label: '새로 고침', run: reload \} : \{ label: '다시 시도', run: \(\) => \(tried\.add\(msg\), retry\(\)\) \}/],
      [MAIN, /app\.fail\('고른 언어를 받지 못했습니다\.', retry\)\(e\)/],
    ],
  },
  {
    id: 'A3',
    what: '열기 오류 — 예제 모형·3D 보기 조각을 받지 못함(role=alert)',
    times: [['error', 9000]],
    action: '다시 시도',
    elsewhere: '문서가 없으면 시작 화면 오류 칸에 같은 글·시작 화면 「파일 열기」·예제 단추',
    verdict: '가',
    sites: { [`${APP} showError`]: 1 },
    proof: [
      [APP, /if \(again && e instanceof ChunkGone\) loadFailed\(e, parts\.join\(' '\), again, \(_, a\) => this\.showError\(parts, a\)\);/],
      [APP, /const close = this\.toast\(parts, 'error', 9000, action\);/],
      [APP, /this\.startError\.hidden = !this\.lastError \|\| !!d;/],
    ],
  },
  {
    id: 'A4',
    what: '보기 링크 복사 — 손질을 링크에 담지 못함(고른 것만 잘리면 경고 6초·온전하면 안내 3.5초 — 그때는 동작 없음)',
    times: [['warn', 9000]],
    action: '파일로 내보내기',
    elsewhere: '분해 막대 ⋯ 메뉴 「손질 내보내기(JSON 파일)」',
    verdict: '가',
    sites: { [`${APP} toast`]: 2 },
    proof: [
      [APP, /const act = tweakCut \? \{ label: '파일로 내보내기', run: \(\) => void this\.tweakTool\?\.exportFile\(d\) \} : undefined;\s*const ms = tweakCut \? 9000 : cut\.length \? 6000 : 3500;/],
      [APP, /this\.toast\(\['보기 링크를 복사했습니다[^\]]*\], cut\.length \? 'warn' : 'info', ms, act\);/],
      [APP, /this\.toast\(\['클립보드를 쓸 수 없어 주소 막대에 보기 링크를 넣었습니다\.', \.\.\.cut\], 'warn', ms, act\);/],
      [BAR, /\{ label: '손질 내보내기\(JSON 파일\)', disabled: !this\.anyTweak, run: \(\) => tweak\.exportFile\?\.\(\) \}/],
    ],
  },
  {
    id: 'E1',
    what: '파일 열기 오류(showError — role=alert)',
    times: [['error', 9000]],
    action: null,
    elsewhere: '문서가 없으면 시작 화면 오류 칸(같은 글) — 문서를 연 채면 알림뿐',
    verdict: '나',
    sites: { [`${APP} showError`]: 6 },
    proof: [[APP, /private showError\(parts: string\[\], action\?: \{ label: string; run: \(\) => void \}\): \(\) => void \{\s*this\.lastErrorParts = parts;/]],
  },
  {
    id: 'E2',
    what: '간섭 검사 오류(패널이 그 탭을 보이지 않을 때만)',
    times: [['error', 9000]],
    action: null,
    elsewhere: '제품 탭 간섭 줄',
    verdict: '나',
    sites: { [`${PANEL} host.toast`]: 1 },
    proof: [[PANEL, /if \(err && !\(this\.open && d\?\.panelTab === 'tree'\)\) this\.host\.toast\?\.\(\['검사하지 못했습니다:', err\], 'error', 9000\);/]],
  },
  {
    id: 'E3',
    what: '그림 저장·공유 실패(기본 시간 — 다른 오류는 9초, 보고 둔 것)',
    times: [['error', 3500]],
    action: null,
    elsewhere: null,
    verdict: '나',
    sites: { [`${APP} toast`]: 2 },
    proof: [[APP, /this\.toast\(imageSaveFailed\(e\), 'error'\);/g, 2]],
  },
  {
    id: 'W1',
    what: '칸 값 거절(분해 거리·단면 위치·밀도)',
    times: [['warn', 5000]],
    action: null,
    elsewhere: '칸 — 분해 거리는 aria-invalid·설명(242차), 단면·밀도는 보이던 값으로 되돌림(155차)',
    verdict: '나',
    sites: { [`${EXPT} host.toast`]: 1, [`${SECT} host.toast`]: 1, [`${PROPS} host.toast`]: 1 },
    proof: [
      [EXPT, /this\.host\.toast\(msg, 'warn', 5000\);\s*\/\/[^\n]*\n\s*this\.field\?\.invalid\?\.\(msg\);/],
      [SECT, /this\.host\.toast\?\.\('단면 위치를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오\.', 'warn', 5000\);/],
      [PROPS, /host\.toast\?\.\('밀도를 바꾸지 않았습니다 — 0보다 큰 수를 쳐 넣으십시오\(g\/cm³\)\.', 'warn', 5000\);/],
    ],
  },
  {
    id: 'W2',
    what: '손질 파일 거절·내보내기 한도',
    times: [['warn', 6000]],
    action: null,
    elsewhere: null,
    verdict: '나',
    sites: { [`${EXPT} host.toast`]: 4 },
    proof: [[EXPT, /'warn',\s*6000,?\s*\)/g, 4]],
  },
  {
    id: 'W3',
    what: '손질 불러옴(건너뛴 것이 있으면 경고)',
    times: [
      ['info', 3500],
      ['warn', 7000],
    ],
    action: null,
    elsewhere: '분해 화면(받은 손질 자리)',
    verdict: '나',
    sites: { [`${EXPT} host.toast`]: 1 },
    proof: [[EXPT, /this\.host\.toast\(msg, plain \? 'info' : 'warn', plain \? 3500 : 7000\);/]],
  },
  {
    id: 'W4',
    what: '열기 경고(해석기 경고·끊긴 파일·조립 자리 상한)',
    times: [
      ['warn', 3500],
      ['warn', 6000],
      ['warn', 8000],
    ],
    action: null,
    elsewhere: '패널 「정보」 탭 해석기 경고 목록',
    verdict: '나',
    sites: { [`${APP} toast`]: 1 },
    proof: [
      [APP, /if \(note\) this\.toast\(note\.text, 'warn', note\.ms\);/],
      [NOTICE, /ms: 6000 \}/],
      [NOTICE, /ms: 8000 \}/],
      [NOTICE, /ms: 3500 \}/],
    ],
  },
  {
    id: 'W5',
    what: '잠글 방향 없음(다른 동작에 먼저 거둠)',
    times: [['warn', 3200]],
    action: null,
    elsewhere: null,
    verdict: '나',
    sites: { [`${APP} toast`]: 1 },
    proof: [[APP, /this\.lockFailClose = this\.toast\(\s*this\.touch \? '잠글 방향이 없습니다[^']*' : '잠글 방향이 없습니다[^']*',\s*'warn',\s*3200,\s*\);/]],
  },
  {
    id: 'W6',
    what: '공유 받기 실패',
    times: [['warn', 8000]],
    action: null,
    elsewhere: null,
    verdict: '나',
    sites: { [`${APP} toast`]: 1 },
    proof: [[APP, /if \(q\.shareError\) this\.toast\([^;]*'warn', 8000\);/]],
  },
  {
    id: 'W7',
    what: '경고(기본 시간 — 최근 문서·공유 파일·면 정면/자르기·면 정보·PMI 면·간섭 메시·레이어 꺼짐·내보낼 형상·클립보드 대신 파일·내보낼 손질)',
    times: [['warn', 3500]],
    action: null,
    elsewhere: '레이어 꺼짐은 레이어 탭·최근 문서는 목록에서 빠짐·클립보드 대신 파일은 저장한 파일, 나머지 없음',
    verdict: '나',
    sites: { [`${APP} toast`]: 11, [`${EXPT} host.toast`]: 1 },
    proof: [
      [APP, /, 'warn'\);/g, 10],
      [APP, /this\.toast\(`클립보드를 쓸 수 없어 \$\{what\}을\(를\) 파일로 저장했습니다\.`, 'warn', 3500, undefined, false, true\);/],
      [EXPT, /this\.host\.toast\('내보낼 분해 손질이 없습니다\.', 'warn'\);/],
    ],
  },
  {
    id: 'I1',
    what: '간섭 결과(0쌍 안내·n쌍 경고)',
    times: [
      ['info', 3500],
      ['warn', 3500],
    ],
    action: null,
    elsewhere: '제품 탭 간섭 묶음(쌍 목록)',
    verdict: '나',
    sites: { [`${APP} toast`]: 1 },
    proof: [[APP, /'간섭을 찾지 못했습니다\(맞닿음은 간섭으로 치지 않습니다\)\.', n \? 'warn' : 'info'\);/]],
  },
  {
    id: 'I2',
    what: '결과 안내(저장·복사·내보내기·공유·고르기 단위·홈 뷰·다시 삼각화·되찾음 등)',
    times: [['info', 3500]],
    action: null,
    elsewhere: '결과가 화면·파일·클립보드·단추 상태에 남음(152차)',
    verdict: '나',
    sites: { [`${APP} toast`]: 13, [`${EXPT} host.toast`]: 3, [`${GPU} toast`]: 1 },
    proof: [
      [APP, /toast\(msg: string \| string\[\], kind: 'info' \| 'warn' \| 'error' = 'info', ms = 3500,/],
      [GPU, /toast\(CONTEXT_RESTORED_MESSAGE, 'info', 3500\);/],
    ],
  },
  {
    id: 'K1',
    what: '그래픽 문맥 잃음(data-keep — 되찾으면 닫음)',
    times: [['warn', 24 * H]],
    action: null,
    elsewhere: null,
    verdict: 'keep',
    sites: { [`${GPU} toast`]: 1 },
    proof: [
      [GPU, /const LOST_MS = 24 \* 60 \* 60 \* 1000;/],
      [GPU, /close = toast\(CONTEXT_LOST_MESSAGE, 'warn', LOST_MS, true\);/],
      [APP, /core\.watchGraphicsContext\(v, \(msg, kind, ms, keep\) => this\.toast\(msg, kind, ms, undefined, keep\)\);/],
    ],
  },
];
/** 넘기는 자리(띄우는 자리 아님 — 문맥 안내 어댑터·분해 손질 호스트·showError·fail의 몸통) */
const PASS: Record<string, [count: number, proof: RegExp[]]> = {
  [`${APP} toast`]: [
    4,
    [
      /core\.watchGraphicsContext\(v, \(msg, kind, ms, keep\) => this\.toast\(msg, kind, ms, undefined, keep\)\);/,
      /toast: \(msg, kind, ms\) => void this\.toast\(msg, kind, ms\),/,
      /const close = this\.toast\(parts, 'error', 9000, action\);/,
      /loadFailed\(e, msg, retry, \(m, a\) => this\.toast\(m, 'warn', 8000, a\)\)/,
    ],
  ],
};

/** 알림을 부르는 꼴(파일 → 「꼴 → 수」): this.toast·(this.)host.toast(?.)·this.showError·this/app.fail('…')·문맥 안내 toast(CONTEXT_…) */
const LAUNCH = /(?<![\w.])(?:(?:this\.)?host\.toast(?:\?\.)?\(|this\.toast\(|this\.showError\(|(?:this|app)\.fail\('|toast\(CONTEXT_)/g;
const calleeOf = (m: string): string => (m.includes('host.toast') ? 'host.toast' : m.includes('showError') ? 'showError' : m.includes('fail') ? 'fail' : 'toast');
function launches(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [f, t] of SRC) for (const m of codeOf(t).matchAll(LAUNCH)) out[`${f} ${calleeOf(m[0])}`] = (out[`${f} ${calleeOf(m[0])}`] ?? 0) + 1;
  return out;
}

/** setTimeout 자리(파일 → 원문 차례의 [첫 인자 머리, 일, 보이는 내용을 닫나]) — hover239 TIMERS와 같은 셈 */
const CLOCKS: Record<string, [head: string, what: string, closes: boolean][]> = {
  'src/app/aim.ts': [
    ['() =>', '길게 누름 셈 — 정밀 조준(누르는 동안)', false],
    ['() =>', '길게 누름 셈 — 작업 메뉴(누르는 동안)', false],
  ],
  [APP]: [
    ['go', '질량 속성 맡기 미룸(올리는 중)', false],
    ['go', '질량 속성 맡기 시작(그린 뒤)', false],
    ['() =>', '내려받기 주소 거두기', false],
    ['warm', '해석 워커 미리 띄우기(requestIdleCallback 없을 때)', false],
    ['r', '덮개 글 그릴 틈(nextPaint)', false],
  ],
  [DOM]: [
    ['close', '알림 닫힘 — 떠난 뒤 처음 시간을 다시(올림·초점이면 멈춤)', true],
    ['close', '알림 닫힘 — 처음', true],
  ],
  'src/app/entpick.ts': [['res', '나눠 돌리기 쉼', false]],
  'src/app/exactbound.ts': [['step', '시간 조각', false]],
  'src/app/keynav.ts': [['() =>', '초점 되찾기(다음 차례)', false]],
  [PANEL]: [['() =>', '거르기 칸 늦춤(친 글로 다시 그림)', false]],
  'src/app/resize.ts': [['() =>', '손잡이 한 번·두 번 누르기 가르기', false]],
  'src/app/treeview.ts': [['() =>', '나무 길게 누름 셈', false]],
  'src/worker/parse.worker.ts': [['r', '해석 쉼', false]],
};

describe('243차: 시간으로 닫는 자리 감사 표(WCAG 2.2.1)', () => {
  it('알림을 띄우는 자리 62가 파일·부르는 꼴마다 갈래 17의 자리 수 + 넘기는 자리 4와 같다(새 자리면 갈래에 넣어야 통과) — 동작 든 자리 11·읽기만 51, 어기는 것 0', () => {
    const want: Record<string, number> = {};
    for (const r of ROWS) for (const [k, n] of Object.entries(r.sites)) want[k] = (want[k] ?? 0) + n;
    for (const [k, [n]] of Object.entries(PASS)) want[k] = (want[k] ?? 0) + n;
    expect(launches()).toEqual(want);
    const sum = (rs: Row[]): number => rs.reduce((s, r) => s + Object.values(r.sites).reduce((a, b) => a + b, 0), 0);
    expect([ROWS.length, sum(ROWS), sum(ROWS.filter((r) => r.action)), sum(ROWS.filter((r) => !r.action))]).toEqual([17, 62, 11, 51]);
    // 판정: 동작이 든 갈래는 (가), 읽기만은 (나), 20시간 넘는 것만 keep — 모두 멈춤(아래 dom.ts)으로 통과
    for (const r of ROWS) expect([r.id, r.verdict], r.what).toEqual([r.id, r.action ? '가' : r.times.every(([, ms]) => ms >= 20 * H) ? 'keep' : '나']);
    // 알림 칸에 넣는 자리는 앱 toast 하나(다른 모듈이 알림 칸을 따로 만들지 않음)
    expect(SRC.flatMap(([f, t]) => [...codeOf(t).matchAll(/(?<!function )\bpushToast\(/g)].map(() => f))).toEqual([APP]);
  });

  it('갈래마다 시간·동작·다른 자리의 근거 원문, 모든 알림에 ✕, 시계는 pushToast가 맡아 올림·초점이면 멈추고 떠나면 처음 시간', () => {
    for (const r of ROWS)
      for (const [file, re, n] of r.proof) {
        const got = re.global ? [...textOf(file).matchAll(re)].length : re.test(textOf(file)) ? 1 : 0;
        expect(got, `${r.id} ${file} ${re}`).toBe(n ?? 1);
      }
    for (const re of PASS[`${APP} toast`]![1]) expect(textOf(APP)).toMatch(re);
    const app = textOf(APP);
    expect(app).toContain("const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': '알림 닫기' });");
    expect(app).toContain('const remove = pushToast(this.toasts, t, 3, ms, () => (this.doc ? this.viewer?.canvas : this.startOpen));');
    expect(app).toContain("close.addEventListener('click', remove);");
    const dom = textOf(DOM);
    expect(dom).toMatch(/const close = \(\): void => drop\(t, pressed\);/);
    expect(dom).toMatch(/timer = over \|\| inside \? undefined : setTimeout\(close, ms\);/);
    expect(dom).toMatch(/on\('pointerenter', \(\) => \(over = true\)\);\s*on\('pointerleave', \(\) => \(over = false\)\);\s*on\('focusin', \(\) => \(inside = true\)\);/);
    expect(dom).toMatch(/on\('focusout', \(e\) => \(inside = t\.contains\(\(e as FocusEvent\)\.relatedTarget as Node \| null\)\)\);\s*timer = setTimeout\(close, ms\);/);
  });

  it('시계 자리: setTimeout 16이 표와 같고(hover239 TIMERS와 같은 셈) 보이는 내용을 닫는 것은 pushToast 둘뿐 — setInterval·animationend·transitionend 0, requestIdleCallback은 앱 하나', () => {
    const got: Record<string, string[]> = {};
    for (const [f, t] of SRC) {
      const heads = [...t.matchAll(/\bsetTimeout\(\s*(\(\)\s*=>|[\w.]+)/g)].map((m) => m[1]!.replace(/\s+/g, ' '));
      if (heads.length) got[f] = heads;
    }
    expect(got).toEqual(Object.fromEntries(Object.entries(CLOCKS).map(([f, s]) => [f, s.map(([hd]) => hd)])));
    expect(Object.entries(CLOCKS).flatMap(([f, s]) => s.filter(([, , c]) => c).map(([hd]) => `${f} ${hd}`))).toEqual([`${DOM} close`, `${DOM} close`]);
    // hover239(239차)의 시간 닫힘 표와 같은 수
    const h239 = read('tests/app/hover239.test.ts');
    const at = h239.indexOf('const TIMERS');
    const timers = Object.fromEntries([...h239.slice(at, h239.indexOf('};', at)).matchAll(/'([^']+)': \[(\d+),/g)].map((m) => [m[1]!, Number(m[2])]));
    expect(timers).toEqual(Object.fromEntries(Object.entries(CLOCKS).map(([f, s]) => [f, s.length])));
    expect(SRC.filter(([, t]) => /\bsetInterval\(|animationend|transitionend/.test(t)).map(([f]) => f)).toEqual([]);
    expect(SRC.filter(([, t]) => /requestIdleCallback/.test(t)).map(([f]) => f)).toEqual([APP]);
    expect(textOf(APP)).toMatch(/const warm = \(\) => this\.client\.warm\(\);[\s\S]{0,300}if \(idle\) idle\(warm, \{ timeout: 2000 \}\);\s*else setTimeout\(warm, 500\);/);
  });

  it('스타일시트: 시간으로 숨기는 움직임 없음(@keyframes 0, 전환은 진행 막대 폭·손잡이 색뿐 — 움직임 줄이기면 0초), 알림은 올릴 수 있다(알림 칸만 pointer-events: none)', () => {
    const css = read('src/app/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/@keyframes/);
    expect([...css.matchAll(/(?:^|[{;\s])((?:transition|animation)[\w-]*)\s*:\s*([^;{}]+);/g)].map((m) => [m[1], m[2]!.trim()])).toEqual([
      ['transition', 'width 0.15s ease-out'],
      ['transition', 'background 0.12s'],
      ['transition-duration', '0s !important'],
      ['animation-duration', '0s !important'],
      ['animation-iteration-count', '1 !important'],
    ]);
    expect(css).toMatch(/\n\.toasts \{[^}]*pointer-events: none;/);
    expect(css).toMatch(/\n\.toast \{[^}]*pointer-events: auto;/);
  });
});

// ───────────────────────── 실제 앱 알림(가짜 시계) ─────────────────────────

const TEN_MIN = 10 * 60 * 1000;
interface AppPrivate {
  showError(parts: string[], action?: { label: string; run: () => void }): () => void;
}
let app: StepApp;
let root: HTMLElement;
let out: HTMLButtonElement;
const box = (): HTMLElement => root.querySelector<HTMLElement>('.toasts')!;
const latest = (): HTMLElement => box().lastElementChild as HTMLElement;
const xOf = (t: Element): HTMLButtonElement => t.querySelector<HTMLButtonElement>('button.icon-btn[aria-label="알림 닫기"]')!;

beforeAll(() => {
  root = h('div', { id: 'app' });
  out = h('button', { type: 'button' }, '밖');
  document.body.append(out, root);
  app = new StepApp(root);
});
afterAll(() => {
  root.remove();
  out.remove();
});
afterEach(() => {
  for (const t of [...box().children]) xOf(t)?.click();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** 갈래의 알림을 실제 앱 길로 띄운다(받기 실패는 fail, 열기 오류는 showError, 나머지는 toast) */
function launch(r: Row, kind: Kind, ms: number): HTMLElement {
  const run = (): void => {};
  if (r.id === 'A2') app.fail('내보내기 기능을 받지 못했습니다.', run)(new TypeError('Failed to fetch dynamically imported module'));
  else if (r.id === 'A3') (app as unknown as AppPrivate).showError(['예제 모형을 받지 못했습니다.'], { label: r.action!, run });
  else if (r.id === 'E1') (app as unknown as AppPrivate).showError(['a.stp: 파일을 읽지 못했습니다.', '파일이 비어 있습니다.']);
  else app.toast(`${r.id} ${r.what}`, kind, ms, r.action ? { label: r.action, run } : undefined);
  return latest();
}

const CASES: [name: string, row: Row, kind: Kind, ms: number][] = ROWS.filter((r) => r.verdict !== 'keep').flatMap((r) =>
  r.times.map(([kind, ms]): [string, Row, Kind, number] => [`${r.id} ${kind} ${ms}ms${r.action ? ` · 「${r.action}」` : ''}`, r, kind, ms]),
);

describe('243차: 실제 앱 알림 — 올림·초점 동안 남고 떠나면 처음 시간, ✕는 곧(가짜 시계)', () => {
  it.each(CASES)('%s', (_, r, kind, ms) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // 올림: 끝 1 ms 전에 올리면 10분이 지나도 남고(동작 단추도), 떠나면 처음 시간을 다시
    let t = launch(r, kind, ms);
    expect([t.className, t.getAttribute('role'), t.querySelector('.toast-act')?.textContent ?? null, !!xOf(t)]).toEqual([`toast ${kind}`, kind === 'error' ? 'alert' : 'status', r.action, true]);
    vi.advanceTimersByTime(ms - 1);
    t.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(TEN_MIN);
    expect([t.isConnected, t.querySelector('.toast-act')?.textContent ?? null]).toEqual([true, r.action]);
    t.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(ms - 1);
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(t.isConnected).toBe(false);
    // 초점: 끝 1 ms 전에 동작 단추(없으면 ✕)로 가면 10분이 지나도 남고, 밖으로 떠나면 처음 시간을 다시(초점은 옮기지 않음)
    out.focus();
    t = launch(r, kind, ms);
    const btn = t.querySelector<HTMLButtonElement>('.toast-act') ?? xOf(t);
    vi.advanceTimersByTime(ms - 1);
    btn.focus();
    vi.advanceTimersByTime(TEN_MIN);
    expect([t.isConnected, document.activeElement]).toEqual([true, btn]);
    out.focus();
    vi.advanceTimersByTime(ms - 1);
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect([t.isConnected, document.activeElement]).toEqual([false, out]);
    // ✕: 시간을 쓰지 않고 곧 닫는다
    t = launch(r, kind, ms);
    xOf(t).click();
    expect([t.isConnected, box().children.length]).toEqual([false, 0]);
  });

  it('A2 받기 실패: 「다시 시도」로 또 받지 못하면 같은 글 알림 하나에 「새로 고침」 — 그 알림도 올림 동안 남고 떠나면 8초', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = '보기 링크 기능을 받지 못했습니다.';
    let tries = 0;
    const retry = (): void => {
      tries++;
      app.fail(msg, retry)(new TypeError('Failed to fetch dynamically imported module'));
    };
    app.fail(msg, retry)(new TypeError('Failed to fetch dynamically imported module'));
    latest().querySelector<HTMLButtonElement>('.toast-act')!.click();
    const t = latest();
    expect([tries, box().children.length, t.textContent?.includes(msg), t.querySelector('.toast-act')?.textContent]).toEqual([1, 1, true, '새로 고침']);
    t.dispatchEvent(new Event('pointerenter'));
    vi.advanceTimersByTime(TEN_MIN);
    expect(t.isConnected).toBe(true);
    t.dispatchEvent(new Event('pointerleave'));
    vi.advanceTimersByTime(7999);
    expect(t.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(t.isConnected).toBe(false);
  });

  it('K1 문맥 잃음 안내(앱 어댑터 꼴): 올리지 않아도 20시간이 지나도 남고(data-keep), 되찾으면 닫고 되찾음 안내는 3.5초', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let lost = (): void => {};
    let back = (): void => {};
    const v = {
      onContextLost: (f: () => void) => ((lost = f), () => {}),
      onContextRestore: (f: () => void) => ((back = f), () => {}),
    } as unknown as Parameters<typeof watchGraphicsContext>[0];
    const off = watchGraphicsContext(v, (msg, kind, ms, keep) => app.toast(msg, kind, ms, undefined, keep));
    lost();
    const t = latest();
    expect([t.className, t.hasAttribute('data-keep')]).toEqual(['toast warn', true]);
    vi.advanceTimersByTime(20 * H);
    expect(t.isConnected).toBe(true);
    back();
    const r = latest();
    expect([t.isConnected, r.querySelector('span')?.textContent]).toEqual([false, CONTEXT_RESTORED_MESSAGE]);
    vi.advanceTimersByTime(3499);
    expect(r.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(r.isConnected).toBe(false);
    off();
  });
});
