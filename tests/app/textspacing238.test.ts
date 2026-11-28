// @vitest-environment jsdom
/**
 * 238차(WCAG 1.4.12 글 간격 — 재발 막기): 사용자가 줄 높이를 글자 크기의 1.5배·문단 뒤 간격 2배·글자 간격 0.12em·낱말 간격 0.16em으로 넓혀도
 * 글·기능이 잘리거나 겹치지 않는지. styles.css 규칙을 환경 셋(234차 꼴 — 넓은 화면 1280×800 마우스·좁은 창 320×256 마우스(1280px 창 400%)·휴대폰 390×844 손가락)의
 * 미디어 조건으로 골라 덮어 읽고, 글 간격에 닿는 선언(고정 height·overflow hidden/clip·text-overflow ellipsis·line-clamp·px 줄 높이·max-height·nowrap·absolute/fixed)을 둔
 * 선택자 91을 아래 CELLS 표(README 개발 절 238차 문단)로 가른다.
 * - 맞음: 고정 높이 안에 넓힌 한 줄(글자 크기 × 1.5 + 위아래 여백·테두리)이 든다(171차 a11ymedia 「글 간격」 셈을 환경 셋으로 — 그 시험은 그대로).
 * - 따라 큼·굴림: 높이를 못 박지 않거나(최소 높이), 넘치면 칸 안에서 굴린다.
 * - 다른 길: 말줄임·두 줄 자름은 온 글을 얻는 길(말풍선·같은 글이 다른 칸에·고르면 패널 아래 띠)이 원문에 있다 —
 *   238차가 다른 길이 없던 셋(최근 문서 이름·여는 중 파일 이름·겹친 것 고르기 부품 이름)에 말풍선을 두었다(보통 간격 화면 그대로).
 * - 숨긴 이름(화면 읽기 전용 1px·clip — 보이는 이름은 말풍선·aria-label)·글 없음·골격·위 칸(겹침 손셈).
 * 표 밖 선택자가 그런 선언을 두면(새 고정 높이 + 넘침 자름 글 칸, 새 말줄임 등) 실패한다 — 표에 판정과 까닭을 더해야 통과(낡은 줄도 실패).
 * 스타일시트는 글로 읽어 직접 가른다(var()가 든 font 줄임 꼴의 px 줄 높이까지). jsdom은 배치를 하지 않아 크기는 규칙 손셈이다.
 * styles.css와 src/app의 app.ts·menu.ts·dom.ts·panelview.ts·pmiview.ts·treeview.ts를 소스 글로 읽는다(ci-guard 12번 — 그 줄을 바꾸면 이 시험도).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeMenu, openMenu } from '../../src/app/menu';

const ROOT = join(__dirname, '../..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const CSS = read('src/app/styles.css');
const SRC_FILES = ['app.ts', 'menu.ts', 'dom.ts', 'panelview.ts', 'pmiview.ts', 'treeview.ts'] as const;
type SrcFile = (typeof SRC_FILES)[number];
const SRC = Object.fromEntries(SRC_FILES.map((f) => [f, read(`src/app/${f}`)])) as Record<SrcFile, string>;

// ───────────────────────── 스타일시트 규칙(환경마다 — 234차 꼴) ─────────────────────────

type Env = 'wide' | 'narrow' | 'phone';
const ENVS: Record<Env, { pointer: 'fine' | 'coarse'; width: number; height: number }> = {
  wide: { pointer: 'fine', width: 1280, height: 800 },
  narrow: { pointer: 'fine', width: 320, height: 256 },
  phone: { pointer: 'coarse', width: 390, height: 844 },
};
const ENV_NAMES = Object.keys(ENVS) as Env[];

/** 미디어 조건 하나((이름: 값))가 그 환경에 맞는지 — 이 스타일시트가 쓰는 조건만(모르는 조건이면 멈춘다) */
function feature(f: string, env: Env): boolean {
  const m = /^\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)$/.exec(f.trim());
  if (!m) throw new Error(`모르는 미디어 조건: ${f}`);
  const e = ENVS[env];
  const name = m[1]!;
  const v = m[2]!;
  if (name === 'max-width') return e.width <= parseFloat(v);
  if (name === 'min-width') return e.width >= parseFloat(v);
  if (name === 'max-height') return e.height <= parseFloat(v);
  if (name === 'pointer') return e.pointer === v;
  // 강제 색·움직임 줄이기·홈 화면 앱은 켜지 않은 화면
  if (name === 'forced-colors') return v === 'none';
  if (name === 'prefers-reduced-motion') return v === 'no-preference';
  if (name === 'display-mode') return v === 'browser';
  throw new Error(`모르는 미디어 조건: ${f}`);
}

/** 미디어 목록(쉼표 = 또는, and = 그리고, 앞 not = 뒤집기) */
function media(text: string, env: Env): boolean {
  return text.split(',').some((q) => {
    let s = q.trim();
    const not = s.startsWith('not ');
    if (not) s = s.slice(4);
    const ok = s
      .split(/\s+and\s+/)
      .filter((p) => p.trim() !== 'all')
      .every((p) => feature(p, env));
    return not ? !ok : ok;
  });
}

interface Rule {
  media: string | null;
  sels: string[];
  decl: Record<string, string>;
}
/** 스타일시트 글 → 규칙 차례(주석 뺌, @media 한 겹, 선택자 낱낱 — 빈칸을 하나로) */
function parse(css: string): Rule[] {
  const out: Rule[] = [];
  let at: string | null = null;
  let sel: string | null = null;
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]*)([{}])/g)) {
    const head = m[1]!.trim();
    if (m[2] === '{') {
      if (head.startsWith('@media')) at = head.slice(6).trim();
      else sel = head;
    } else if (sel === null) at = null;
    else {
      const decl: Record<string, string> = {};
      for (const d of head.split(';')) {
        const i = d.indexOf(':');
        if (i > 0) decl[d.slice(0, i).trim()] = d.slice(i + 1).trim();
      }
      out.push({ media: at, sels: sel.split(',').map((s) => s.replace(/\s+/g, ' ').trim()), decl });
      sel = null;
    }
  }
  return out;
}

type Rules = Map<string, Record<string, string>>;
/** 그 환경에 드는 규칙을 차례대로 덮은 선택자 → 선언(같은 선택자는 뒤 규칙이 앞을 덮는다) */
function rulesOf(sheet: Rule[], env: Env): Rules {
  const out: Rules = new Map();
  for (const r of sheet) {
    if (r.media !== null && !media(r.media, env)) continue;
    for (const s of r.sels) out.set(s, { ...out.get(s), ...r.decl });
  }
  return out;
}
const envRules = (css: string): Record<Env, Rules> => {
  const sheet = parse(css);
  return { wide: rulesOf(sheet, 'wide'), narrow: rulesOf(sheet, 'narrow'), phone: rulesOf(sheet, 'phone') };
};
const RULES = envRules(CSS);

const bare = (v: string | undefined): string => (v ?? '').replace(/\s*!important\s*$/, '').trim();
const LEN = /^-?[\d.]+(px|em|rem)$/;
/** 선언의 px 값(없거나 px가 아니면 NaN) */
const px = (R: Rules, sel: string, p: string): number => {
  const v = bare(R.get(sel)?.[p]);
  return /^-?[\d.]+px$/.test(v) ? parseFloat(v) : NaN;
};
/** 글자 크기(규칙에 없으면 물려받는 값 d) */
const size = (R: Rules, sel: string, d: number): number => {
  const v = px(R, sel, 'font-size');
  return Number.isNaN(v) ? d : v;
};
/** 위아래 여백 합(padding 줄임 꼴 — 위·아래) */
const padY = (R: Rules, sel: string): number => {
  const p = bare(R.get(sel)?.padding).split(/\s+/).map((x) => parseFloat(x) || 0);
  return (p[0] ?? 0) + (p[2] ?? p[0] ?? 0);
};

type Flag = 'height' | 'hidden' | 'ellipsis' | 'clamp' | 'px-line' | 'max-height' | 'nowrap' | 'absolute';
/** 글 간격에 닿는 선언 */
function flagsOf(d: Record<string, string> | undefined): Flag[] {
  if (!d) return [];
  const f: Flag[] = [];
  if (LEN.test(bare(d.height))) f.push('height');
  if (['overflow', 'overflow-x', 'overflow-y'].some((p) => /^(hidden|clip)\b/.test(bare(d[p])))) f.push('hidden');
  if (bare(d['text-overflow']) === 'ellipsis') f.push('ellipsis');
  if (d['-webkit-line-clamp'] !== undefined || d['line-clamp'] !== undefined) f.push('clamp');
  if (LEN.test(bare(d['line-height'])) || /\/\s*-?[\d.]+(px|em|rem)\b/.test(d.font ?? '')) f.push('px-line');
  if (d['max-height'] !== undefined && bare(d['max-height']) !== 'none') f.push('max-height');
  if (bare(d['white-space']) === 'nowrap') f.push('nowrap');
  if (/^(absolute|fixed)$/.test(bare(d.position))) f.push('absolute');
  return f;
}
/** 그 환경에서 그런 선언을 둔 선택자 → 표시 */
const flagged = (R: Rules): [string, Flag[]][] => [...R].map(([s, d]): [string, Flag[]] => [s, flagsOf(d)]).filter(([, f]) => f.length > 0);

// ───────────────────────── 감사 표(.runtime/r238 표 — README 개발 절 238차 문단) ─────────────────────────

/**
 * fits 맞음 · grows 따라 큼 · scroll 굴림 · alt 다른 길(말줄임·두 줄 자름) · label 숨긴 이름 · notext 글 없음 · frame 골격 · over 위 칸
 * (환경마다 다르면 환경마다 — 없는 환경에 그 선언이 생기면 판정 없음으로 실패)
 */
type Kind = 'fits' | 'grows' | 'scroll' | 'alt' | 'label' | 'notext' | 'frame' | 'over';
interface Cell {
  sels: string[];
  /** 담는 글·화면(234차 누를 자리 #·235차 묶음) */
  text: string;
  kind: Kind | Partial<Record<Env, Kind>>;
  /** 넓히면(그대로·잘림·겹침·굴려 보임)과 까닭 */
  why: string;
  /** 맞음: 글자 크기(px)·위아래 테두리 합 */
  font?: (R: Rules) => number;
  border?: number;
  /** 굴림: 굴리는 칸 [선택자, 속성, 값] */
  scroller?: [string, string, string];
  /** 근거 원문(다른 길 — 말풍선·같은 글이 다른 칸에 / 숨긴 이름의 보이는 이름 / 위 칸 손셈의 바탕) */
  proof?: [SrcFile, RegExp][];
  /** 238차가 고친 칸(다른 길이 없던 말줄임 — 말풍선) */
  fixed?: boolean;
}
const kindOf = (c: Cell, env: Env): Kind | undefined => (typeof c.kind === 'string' ? c.kind : c.kind[env]);
/** 표 요약 셈의 판정(환경마다 다르면 휴대폰 꼴) */
const mainKind = (c: Cell): Kind => (typeof c.kind === 'string' ? c.kind : (c.kind.phone ?? Object.values(c.kind)[0]!));

const F13 = (): number => 13;
const ICON_TITLE: [SrcFile, RegExp] = ['dom.ts', /title: opts\.title \?\? label/];
const APP_TITLE: [SrcFile, RegExp][] = [
  ['app.ts', /document\.title = `\$\{isolateText\(doc\.name\)\} - OpenCAD STEP 뷰어`;/],
  ['app.ts', /h\('h1', \{ class: 'brand' \}, favicon, h\('b', \{\}, 'OpenCAD'\), h\('span', \{\}, '\\u00a0STEP 뷰어'\)\)/],
];
const PICKED: [SrcFile, RegExp][] = [
  ['panelview.ts', /h\('b', \{\}, '고른 것 '\), h\('span', \{ 'data-i18n-ui': '' \}, d\.items\.label\)/],
  ['app.ts', /this\.statusSel\.title = this\.statusSel\.textContent \?\? '';/],
];

const CELLS: Cell[] = [
  // ── 맞음: 고정 높이 글 칸(171차 20자리 + 환경 셋) ──
  { sels: ['.btn'], text: '#3~#5 단추 이름(대화 상자·시작 화면·알림 동작)', kind: 'fits', font: F13, border: 2, why: '한 줄(nowrap) — 넓어지면 단추가 넓어짐(손가락은 최소 높이 44가 이김)' },
  { sels: ['.btn.large'], text: '#4 시작 화면 큰 단추', kind: 'fits', font: (R) => size(R, '.btn.large', 13), border: 2, why: '한 줄 14px' },
  { sels: ['.btn.small'], text: '#3 작은 단추(나무·레이어 도구·결과 지우기 등)', kind: 'fits', font: (R) => size(R, '.btn.small', 13), border: 2, why: '한 줄 12px — 가장 빠듯(20/24)' },
  { sels: ['.toolbar .btn'], text: '#2 도구 막대 이름', kind: 'fits', font: F13, border: 2, why: '한 줄 — 넓어진 막대는 옆으로 굴림(.toolbar)' },
  { sels: ['.title-actions .btn'], text: '#1 제목 막대 단추(손가락 44)', kind: 'fits', font: F13, border: 2, why: '한 줄' },
  { sels: ['.mb-btn'], text: '#17 측정 띠·고른 부품 카드·격리 띠 단추', kind: 'fits', font: (R) => size(R, '.mb-btn', 13), border: 2, why: '한 줄(nowrap)' },
  { sels: ['.tab'], text: '#10 패널 탭', kind: 'fits', font: F13, border: 2, why: '한 줄(nowrap, 아래 테두리 2) — 탭 줄은 옆으로 굴림' },
  { sels: ['.titlebar'], text: '앱 이름·문서 이름(제목 막대)', kind: 'fits', font: (R) => size(R, '.brand', 15), border: 1, why: '한 줄 — 앱 이름 15·14·13px' },
  { sels: ['.tree-search'], text: '#21 이름 거르기 입력', kind: 'fits', font: (R) => size(R, '.tree-filter', 13), border: 2, why: '한 줄 입력 칸(손가락 16px)' },
  { sels: ['.explode-num'], text: '#24 분해 거리 칸', kind: 'fits', font: (R) => size(R, '.explode-num', 13), border: 2, why: '한 줄 입력 칸' },
  {
    sels: ['.section-num'],
    text: '#23 단면 위치 칸',
    kind: 'fits',
    font: (R) => size(R, '.section-num', size(R, '.section-val', size(R, '.section-bar', 13))),
    border: 2,
    why: '한 줄 입력 칸 — 단면 막대 12px·좁은 값 칸 11px·손가락 16px',
  },

  // ── 다른 길: 말줄임·두 줄 자름(넓히면 더 일찍 잘림) ──
  { sels: ['.doc-name'], text: '제목 막대 문서 이름(파일 글)', kind: 'alt', why: '말줄임 — 말풍선·쪽 제목', proof: [['app.ts', /this\.docNameEl\.title = d \? clipText\(d\.name\) : '';/]] },
  { sels: ['.recent-name'], text: '#19 시작 화면 최근 문서 이름(파일 글)', kind: 'alt', why: '말줄임 — 238차 말풍선(전에는 다시 볼 곳 없음)', proof: [['app.ts', /fileSpan\(r\.name, 'recent-name', r\.name\)/]], fixed: true },
  { sels: ['.busy-name'], text: '여는 중 카드 파일 이름', kind: 'alt', why: '말줄임 — 238차 말풍선(전에는 다시 볼 곳 없음)', proof: [['app.ts', /this\.busyName\.textContent = this\.busyName\.title = clipText\(l\.name\);/]], fixed: true },
  { sels: ['.menu-file'], text: '#11 겹친 것 고르기 메뉴 부품 이름(파일 글, 최대 22em)', kind: 'alt', why: '말줄임 — 238차 말풍선(전에는 3D 미리 강조뿐)', proof: [['menu.ts', /fileSpan\(it\.file, 'menu-file', it\.file\)/]], fixed: true },
  { sels: ['.iso-text'], text: '격리 띠 이름', kind: 'alt', why: '말줄임 — 말풍선(180차)', proof: [['app.ts', /this\.isoText\.title = this\.isoText\.textContent \?\? '';/]] },
  { sels: ['.mb-name'], text: '고른 부품 카드 이름(두 줄)', kind: 'alt', why: '두 줄 자름 — 말풍선(59차)', proof: [['app.ts', /class: 'mb-value mb-name', title: nm,/]] },
  { sels: ['.status-sel'], text: '상태 막대 고른 것', kind: 'alt', why: '말줄임 — 말풍선(59차)·패널 아래 띠', proof: [PICKED[1]!] },
  { sels: ['.status-snap'], text: '상태 막대 스냅 이름', kind: 'alt', why: '말줄임 — 같은 글이 측정 띠 .mb-hover(자르지 않음)', proof: [['app.ts', /for \(const el of \[this\.statusSnap, this\.measureHoverEl\]\)/]] },
  {
    sels: ['.tree-name', '.tree-name-gen'],
    text: '#14 모델 트리 이름',
    kind: 'alt',
    why: '말줄임 — 고르면 패널 아래 띠 「고른 제품」 전체(줄 바꿈)·몸체 줄 말풍선·패널 넓히기',
    proof: [
      ['panelview.ts', /h\('b', \{\}, '고른 제품 '\), \.\.\.nodeNames\(node\)/],
      ['treeview.ts', /title: tip\.filter\(Boolean\)\.join\(' · '\)/],
    ],
  },
  {
    sels: ['.vgrid-row > :first-child', '.vgrid-row span'],
    text: '부품별 보이기 이름·PMI 표 평면·의미 이름·값·종류',
    kind: 'alt',
    why: '말줄임 — 칸마다 말풍선(이름 단추는 .link-btn)',
    proof: [
      ['treeview.ts', /fileSpan\(g\.name, '', g\.name\)/],
      ['pmiview.ts', /fileSpan\(p\.plane, 'dim small', p\.plane\)/],
      ['pmiview.ts', /fileSpan\(x\.name \|\| '—', '', x\.name \|\| undefined\)/],
      ['pmiview.ts', /fileSpan\(x\.value \|\| '—', 'mono', x\.value\)/],
      ['pmiview.ts', /role: 'cell', title: `\$\{x\.type\} · #\$\{x\.stepId\}`/],
    ],
  },
  { sels: ['.link-btn'], text: '#34 레이어·PMI·간섭 쌍·의미 PMI 이름 버튼', kind: 'alt', why: '말줄임 — 누르면 고른 것 이름이 패널 아래 띠 전체(줄 바꿈)·상태 막대 말풍선', proof: PICKED },
  { sels: ['.brand'], text: '앱 이름(h1)', kind: { wide: 'grows', narrow: 'alt', phone: 'alt' }, why: '넓은 화면은 넓어짐, 760 미만은 말줄임(51·55차 꼴) — 쪽 제목·h1 글 전체(화면 읽기)', proof: APP_TITLE },
  { sels: ['.titlebar .brand'], text: '앱 이름(767px 이하)', kind: 'alt', why: '말줄임 — 쪽 제목·h1 글 전체', proof: APP_TITLE },
  { sels: ['.brand > span'], text: '앱 이름 「STEP 뷰어」 조각', kind: { narrow: 'label', phone: 'alt' }, why: '손가락 420 이하 말줄임, 375 미만은 아이콘만 — 쪽 제목·h1 글 전체', proof: APP_TITLE },

  // ── 따라 큼: 높이를 못 박지 않음 ──
  { sels: ['.chip'], text: '나무·PMI 칩 수', kind: 'grows', why: 'px 줄 높이(18px)뿐 — 덮은 1.5배(16.5px)로' },
  { sels: ['.mb-hover'], text: '측정 띠 스냅 이름', kind: 'grows', why: 'px 줄 높이(20px)·nowrap — 띠가 넓어짐(휴대폰은 줄 바꿈)' },
  { sels: ['.key-help kbd', '.menu kbd'], text: '키 도움말·메뉴 키 글', kind: 'grows', why: 'font 줄임 꼴 px 줄 높이 — 줄 안 글(18·16.5px)' },
  {
    sels: ['.section-val', '.explode-distance', '.explode-screen-label', '.explode-stage', '.explode-tweak .seg-btn'],
    text: '단면 값·분해 띠 글',
    kind: 'grows',
    why: 'nowrap — 넓어짐(분해 띠는 줄을 바꾸고 단면 막대는 밀대가 줄어듦)',
  },
  { sels: ['.language-list button'], text: '#13 언어 목록 이름 다섯', kind: 'grows', why: 'nowrap·최소 높이 40 — 184px 목록에 넓힌 이름이 듦' },
  { sels: ['.tree-row', '.vgrid-row'], text: '나무·표 줄', kind: 'grows', why: 'nowrap·최소 높이 — 이름은 말줄임 칸' },
  { sels: ['.statusbar'], text: '상태 막대', kind: 'grows', why: 'nowrap·최소 높이 26(55차) — 문서 정보 줄은 옆으로 굴림(같은 글이 정보 탭)' },
  { sels: ['.seg'], text: '갈래 단추 묶음', kind: 'grows', why: '둥근 모서리 넘침 자름 — 안 단추는 최소 높이(55차)' },

  // ── 굴림 ──
  { sels: ['.toolbar'], text: '도구 막대', kind: 'scroll', scroller: ['.toolbar', 'overflow-x', 'auto'], why: '세로는 자르고 가로로 굴림 — 단추 높이는 맞음' },
  { sels: ['.panel-foot'], text: '패널 아래 띠', kind: 'scroll', scroller: ['.panel-foot', 'overflow', 'auto'], why: '최대 높이 34% 안 굴림' },
  { sels: ['.dlg'], text: '대화 상자', kind: 'scroll', scroller: ['.dlg-body', 'overflow-y', 'auto'], why: '최대 높이 안 본문 굴림' },
  { sels: ['.key-help th'], text: '키 도움말 키 칸', kind: 'scroll', scroller: ['.dlg-body', 'overflow-y', 'auto'], why: 'nowrap — 대화 상자 본문이 옆으로도 굴림' },

  // ── 숨긴 이름: 화면 읽기 전용 1px·clip ──
  { sels: ['.sr-only'], text: '화면 읽기 전용 글(숨긴 단추 이름 등)', kind: 'label', why: '보이는 이름은 말풍선·aria-label', proof: [ICON_TITLE, ['dom.ts', /if \(opts\.hideLabel\) b\.setAttribute\('aria-label', label\);/]] },
  {
    sels: ['.title-actions .btn.link .btn-label', '.title-actions .btn:not(.primary) .btn-label', '.titlebar .title-actions .btn-label'],
    text: '#1 제목 막대 단추 이름표(좁은 창)',
    kind: 'label',
    why: '아이콘만 — 이름은 말풍선',
    proof: [ICON_TITLE, ['app.ts', /rel: 'noopener', title: 'OpenCAD 도구 모음' \}/], ['app.ts', /rel: 'noopener', title: 'GitHub 소스 코드', 'aria-label': 'GitHub 소스 코드' \}/]],
  },
  {
    sels: ['.toolbar .btn-label', ':lang(zh) .toolbar .btn-label', ':lang(en) .toolbar .btn-label', ':lang(ja) .toolbar .btn-label', ':lang(de) .toolbar .btn-label'],
    text: '#2 도구 막대 이름표(언어마다 다 들어가는 폭 밑 — 56차)',
    kind: 'label',
    why: '아이콘만 — 이름은 말풍선',
    proof: [ICON_TITLE],
  },
  { sels: ['.brand b'], text: '앱 이름 「OpenCAD」 조각(손가락 420 이하·375 미만)', kind: 'label', why: '앱 아이콘으로 — 쪽 제목·h1 글 전체', proof: APP_TITLE },

  // ── 글 없음 ──
  { sels: ['.icon-btn', '.explode-bar > .icon-btn', '.recent .recent-del'], text: '#7 아이콘 단추', kind: 'notext', why: '아이콘 — 이름은 말풍선·aria-label' },
  { sels: ['.language-trigger', '.titlebar .language-trigger', '.language-control-floating'], text: '#12 언어 단추(사이트 키트 — 지구 아이콘)', kind: 'notext', why: '아이콘 — 이름 「Language」' },
  { sels: ['.twisty', '.eye'], text: '#15·#16 나무 펼침·눈', kind: 'notext', why: '아이콘' },
  { sels: ['.tool-sep', '.menu-sep'], text: '구분선', kind: 'notext', why: '선' },
  { sels: ['.busy-bar'], text: '여는 중 진행 막대', kind: 'notext', why: '막대(글은 위 줄)' },
  { sels: ['.section-slider', '.explode-slider', '.cb-hit input'], text: '#35·#36 밀대·#31 확인 칸', kind: 'notext', why: '입력 꼴(글 없음)' },
  { sels: ['.panel-resizer', '.panel-resizer::after'], text: '#37 패널 크기 손잡이', kind: 'notext', why: '손잡이 막대' },
  { sels: ['.section-handle'], text: '#28 단면 손잡이', kind: 'notext', why: '그림(svg)' },
  { sels: ['.aim-layer', '.aim-reticle'], text: '정밀 조준 십자선', kind: 'notext', why: '그림(svg)' },
  { sels: ['.viewer-host'], text: '3D 보기 캔버스', kind: 'notext', why: '안 글(측정·좌표축·PMI)은 캔버스 그림 — 1.4.12 밖' },
  { sels: ['.tree-row.match .tree-name::before', '.tree-row.match .tree-name-gen::before'], text: '거르기에 맞은 줄 점', kind: 'notext', why: '점 6px' },

  // ── 골격 ──
  { sels: ['html', 'body'], text: '앱 골격(100% 높이)', kind: 'frame', why: '높이는 고정 높이 칸들이라 글 간격과 상관없음 — 320 높이 마우스 창은 쪽 굴림(55차)' },
  { sels: ['.view'], text: '3D 보기 칸', kind: 'frame', why: '창을 따르는 칸 — 안 띠·알림은 위 칸 줄' },

  // ── 위 칸: 3D 보기·화면 위에 띄운 칸 ──
  { sels: ['.section-bar'], text: '단면 막대(3D 보기 왼쪽 위)', kind: 'over', why: '한 줄 칸 높이 그대로 — 위 띠 묶음(top 56) 위에서 끝남(아래 손셈)' },
  { sels: ['.top-bars'], text: '분해·격리 띠 묶음', kind: 'over', why: '넓은 화면은 단면 막대 아래, 휴대폰은 흐름 안 굴림 칸(192차)' },
  {
    sels: ['.toasts'],
    text: '알림(측정 띠 위 68·112px)',
    kind: 'over',
    why: '측정 글 두 줄은 넓혀도 띠 위, 세 줄은 보통 간격부터 겹침 — 알림은 저절로 닫힘·✕(둠)',
    proof: [
      ['app.ts', /toast\(msg: string \| string\[\], kind: 'info' \| 'warn' \| 'error' = 'info', ms = 3500,/],
      ['dom.ts', /timer = setTimeout\(close, ms\);/],
    ],
  },
  { sels: ['.measure-bar'], text: '측정 띠(3D 보기 아래)', kind: 'over', why: '높이를 못 박지 않음 — 글 칸 줄 높이 1.3 → 1.5로 커짐' },
  { sels: ['.explode-dist'], text: '끄는 동안 거리 카드(커서 옆)', kind: 'over', why: '3D 그림 위·누름 받지 않음·잠깐 — 높이 못 박지 않음' },
  { sels: ['.start', '.busy', '.drop-hint'], text: '시작 화면·여는 중 덮개·끌어다 놓기 안내', kind: 'over', why: '3D 보기 자리 전체 — 시작 화면은 안에서 굴림, 카드·안내는 높이 못 박지 않음' },
  { sels: ['.menu', '.language-list'], text: '메뉴·언어 목록', kind: 'over', why: '메뉴는 화면에 맞춘 높이 안 굴림(menu.ts), 언어 목록 항목은 최소 높이 40 ≥ 넓힌 37' },
  {
    sels: ['.vlist > *'],
    text: '가상 목록 줄(나무·부품별 보이기·PMI 표)',
    kind: 'over',
    why: '그린 첫 줄 높이를 지켜봐 다시 잰다(55차) — 줄이 커져도 겹치지 않음',
    proof: [
      ['treeview.ts', /this\.ro\.observe\(\(this\.watched = first!\)\)/],
      ['treeview.ts', /if \(Math\.abs\(hh - this\.rowH\) < 0\.25\) return;/],
    ],
  },
];
const KNOWN = new Map(CELLS.flatMap((c) => c.sels.map((s): [string, Cell] => [s, c])));

/** 환경마다 그런 선언을 둔 선택자가 모두 표에 판정과 함께 있는지(missing), 표 줄마다 어느 환경에서 쓰이는지(unused) */
function audit(R: Record<Env, Rules>): { missing: string[]; unused: string[] } {
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const env of ENV_NAMES)
    for (const [s, f] of flagged(R[env])) {
      seen.add(s);
      const c = KNOWN.get(s);
      if (!c) missing.push(`${env} ${s} ${f.join('+')}`);
      else if (!kindOf(c, env)) missing.push(`${env} ${s} 판정 없음`);
    }
  return { missing, unused: [...KNOWN.keys()].filter((s) => !seen.has(s)) };
}

/** 맞음: 그 환경에 고정 높이가 있으면 넓힌 한 줄이 든다 — [어긋남, 남는 높이] */
function fits(R: Record<Env, Rules>): { errors: string[]; room: number[] } {
  const errors: string[] = [];
  const room: number[] = [];
  for (const c of CELLS)
    for (const env of ENV_NAMES) {
      if (kindOf(c, env) !== 'fits') continue;
      for (const s of c.sels) {
        const hh = px(R[env], s, 'height');
        if (Number.isNaN(hh)) continue;
        const line = c.font!(R[env]) * 1.5 + padY(R[env], s) + c.border!;
        room.push(hh - line);
        if (!(hh >= line)) errors.push(`${env} ${s} ${hh} < ${line}`);
      }
    }
  return { errors, room };
}

/** 따라 큼(높이·최대 높이를 못 박지 않음)·굴림(굴리는 칸)·숨긴 이름(1px·clip) */
function kinds(R: Record<Env, Rules>): string[] {
  const out: string[] = [];
  for (const c of CELLS)
    for (const env of ENV_NAMES)
      for (const s of c.sels) {
        const k = kindOf(c, env);
        const d = R[env].get(s);
        const f = flagsOf(d);
        if (!k || !f.length) continue;
        if (k === 'grows' && (f.includes('height') || f.includes('max-height'))) out.push(`${env} ${s} 못 박은 높이`);
        if (k === 'scroll' && bare(R[env].get(c.scroller![0])?.[c.scroller![1]]) !== c.scroller![2]) out.push(`${env} ${s} 굴리지 않음`);
        if (k === 'label' && !(bare(d!.clip) === 'rect(0 0 0 0)' && bare(d!.width) === '1px' && bare(d!.height) === '1px' && f.includes('hidden') && f.includes('absolute')))
          out.push(`${env} ${s} 숨김 꼴 아님`);
        if (k === 'alt' && !(f.includes('ellipsis') || f.includes('clamp') || f.includes('hidden'))) out.push(`${env} ${s} 말줄임 아님`);
      }
  return out;
}

/** 근거 원문이 없는 칸 */
const proofs = (cells: Cell[], src: Record<SrcFile, string>): string[] =>
  cells.flatMap((c) => (c.proof ?? []).filter(([f, re]) => !re.test(src[f])).map(([f, re]) => `${c.sels[0]} ${f} ${re.source}`));

describe('238차: 글 칸 표 — 스타일시트 셈(넓은 화면 1280 마우스·320px 마우스 창·휴대폰 390 손가락)', () => {
  it('글 간격에 닿는 선언을 둔 선택자 91이 모두 표에 판정과 함께 있다 — 표 밖 새 선택자(새 고정 높이 + 넘침 자름 글 칸 등)·낡은 줄 없음', () => {
    expect(audit(RULES)).toEqual({ missing: [], unused: [] });
    expect(CELLS.flatMap((c) => c.sels)).toHaveLength(KNOWN.size);
    expect(KNOWN.size).toBe(91);
    expect(CELLS.filter((c) => !c.why || !c.text).map((c) => c.sels[0])).toEqual([]);
  });

  it('맞음: 고정 높이 글 칸(11선택자·환경 셋 31자리)은 넓힌 한 줄(글자 크기 × 1.5 + 위아래 여백·테두리)이 든다 — 가장 빠듯한 것 작은 단추 20/24', () => {
    const { errors, room } = fits(RULES);
    expect(errors).toEqual([]);
    expect(room).toHaveLength(31);
    expect(Math.min(...room)).toBe(4);
    // 보통 간격(13px × 1.45)은 더 작다 — 화면은 그대로
    expect(13 * 1.45 + 2).toBeLessThan(13 * 1.5 + 2);
  });

  it('따라 큼은 높이를 못 박지 않고, 굴림은 칸 안에서 굴리며, 숨긴 이름은 1px·clip이고, 다른 길 칸은 말줄임·두 줄 자름이다', () => {
    expect(kinds(RULES)).toEqual([]);
    // 갈래 단추 묶음(.seg)이 자르는 안 단추는 최소 높이(55차)
    expect(ENV_NAMES.filter((e) => flagsOf(RULES[e].get('.seg-btn')).includes('height'))).toEqual([]);
  });

  it('위 칸: 단면 막대는 넓혀도 위 띠 묶음 위에서 끝나고, 측정 띠 글 두 줄은 알림 자리 밑 — 세 줄은 보통 간격부터 겹치나 알림은 저절로 닫힌다(둠)', () => {
    const W = RULES.wide;
    const bar = px(W, '.section-bar', 'top') + padY(W, '.section-bar') + 2 + Math.max(px(W, '.seg-btn', 'min-height'), px(W, '.icon-btn', 'height'), px(W, '.section-num', 'height'), size(W, '.section-bar', 13) * 1.5 + padY(W, '.section-face'));
    expect(bar).toBe(46);
    expect(bar).toBeLessThanOrEqual(px(W, '.view:has(.section-bar:not([hidden])) .top-bars', 'top'));
    // 측정 띠 위 끝(아래에서): 아래 10 + 여백 12 + 테두리 2 + max(단추 38, 글 줄 합) — 값 16px·풀이 12px, 보통 줄 높이 1.3
    const value = size(W, '.mb-value', 13);
    const sub = size(W, '.mb-sub', 13);
    const top = (lines: number[], k: number) => px(W, '.measure-bar', 'bottom') + padY(W, '.measure-bar') + 2 + Math.max(px(W, '.mb-btn', 'height'), lines.reduce((a, f) => a + f * k, 0));
    const toastAt = px(W, '.view:has(.measure-bar.measuring:not([hidden])) .toasts', 'bottom');
    expect([top([value, sub], 1.3), top([value, sub], 1.5), toastAt]).toEqual([62, 66, 68]);
    expect([top([value, sub, sub], 1.3), top([value, sub, sub], 1.5)].map((y) => Math.round((y - toastAt) * 100) / 100)).toEqual([8, 16]);
    expect(px(RULES.phone, '.view:has(.measure-bar.measuring:not([hidden])) .toasts', 'bottom')).toBe(112);
    expect(proofs(CELLS.filter((c) => mainKind(c) === 'over'), SRC)).toEqual([]);
  });

  it('표 요약: 91선택자 — 맞음 11·다른 길 16(고침 3)·따라 큼 14·굴림 4·숨긴 이름 10·글 없음 22·골격 3·위 칸 11', () => {
    const count: Partial<Record<Kind, number>> = {};
    for (const c of CELLS) count[mainKind(c)] = (count[mainKind(c)] ?? 0) + c.sels.length;
    expect(count).toEqual({ fits: 11, alt: 16, grows: 14, scroll: 4, label: 10, notext: 22, frame: 3, over: 11 });
    expect(CELLS.filter((c) => c.fixed).flatMap((c) => c.sels)).toEqual(['.recent-name', '.busy-name', '.menu-file']);
  });
});

describe('238차: 말줄임 칸의 다른 길(넓히면 더 일찍 잘린다)', () => {
  afterEach(() => {
    closeMenu();
    document.body.replaceChildren();
  });

  it('말풍선·같은 글이 다른 칸에·고르면 패널 아래 띠(줄 바꿈)·화면 읽기 이름 — 근거 원문이 있다(고친 셋 밖)', () => {
    expect(proofs(CELLS.filter((c) => !c.fixed && mainKind(c) !== 'over'), SRC)).toEqual([]);
    // 같은 글을 보이는 측정 띠 스냅 이름은 자르지 않고, 패널 아래 띠는 줄을 바꾼다
    for (const env of ENV_NAMES) {
      expect(flagsOf(RULES[env].get('.mb-hover')).filter((f) => f === 'hidden' || f === 'ellipsis'), env).toEqual([]);
      expect(bare(RULES[env].get('.panel-foot')?.['overflow-wrap']), env).toBe('anywhere');
      expect(flagsOf(RULES[env].get('.panel-foot')).includes('nowrap'), env).toBe(false);
    }
  });

  it('고친 셋: 최근 문서 이름·여는 중 파일 이름·겹친 것 고르기 부품 이름은 말풍선에 같은 파일 글(전에는 다시 볼 곳이 없었다)', () => {
    expect(proofs(CELLS.filter((c) => c.fixed), SRC)).toEqual([]);
  });

  it('겹친 것 고르기 메뉴: 부품 이름 칸(.menu-file — 말줄임)의 말풍선은 그 이름 그대로(번역하지 않는 파일 글), 이름 없는 항목은 칸 없음', () => {
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const name = 'Bracket_Left_Assembly_Revision_0042 — 아주 긴 부품 이름';
    openMenu(anchor, [{ label: '평면', file: name, run: () => {} }, { label: '부품 전체', run: () => {} }], '겹친 것 고르기');
    const cells = [...document.querySelectorAll('.menu .menu-file')];
    expect(cells.map((e) => [e.textContent, e.getAttribute('title'), e.getAttribute('translate')])).toEqual([[name, name, 'no']]);
  });
});

describe('238차: 셈이 헛돌지 않는다', () => {
  it('표 밖 새 고정 높이 + 넘침 자름·새 말줄임은 잡히고, 낮춘 높이는 맞음 셈이, 못 박은 줄 높이는 따라 큼 셈이, 지운 말풍선은 다른 길 셈이 잡는다', () => {
    const extra = envRules(
      `${CSS}\n.new-cell { height: 20px; overflow: hidden; }\n@media (max-width: 759.98px) { .new-tip { overflow: hidden; text-overflow: ellipsis; } }\n.btn.small { height: 18px; }\n.tree-row { height: 28px; }\n.sr-only { clip: auto; }\n`,
    );
    expect(audit(extra)).toEqual({
      missing: ['wide .new-cell height+hidden', 'narrow .new-cell height+hidden', 'narrow .new-tip hidden+ellipsis', 'phone .new-cell height+hidden', 'phone .new-tip hidden+ellipsis'],
      unused: [],
    });
    expect(fits(extra).errors).toEqual(['wide .btn.small 18 < 20', 'narrow .btn.small 18 < 20', 'phone .btn.small 18 < 20']);
    expect(kinds(extra)).toEqual([
      'wide .tree-row 못 박은 높이',
      'narrow .tree-row 못 박은 높이',
      'phone .tree-row 못 박은 높이',
      'wide .sr-only 숨김 꼴 아님',
      'narrow .sr-only 숨김 꼴 아님',
      'phone .sr-only 숨김 꼴 아님',
    ]);
    const src = { ...SRC, 'app.ts': SRC['app.ts'].replace('this.docNameEl.title = ', 'this.docNameEl.dataset.title = ') };
    expect(proofs(CELLS.filter((c) => c.sels[0] === '.doc-name'), src)).toEqual([".doc-name app.ts this\\.docNameEl\\.title = d \\? clipText\\(d\\.name\\) : '';"]);
  });
});
